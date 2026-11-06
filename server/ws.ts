import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

export type Socket = { send: (message: object) => void, close: (code?: number) => void }
export type Handlers = { message: (data: unknown) => void, close: () => void }

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_PAYLOAD = 16 * 1024
const MAX_PER_SECOND = 40
const HEARTBEAT_MS = 25_000

export const stats = { open: 0, framesIn: 0, framesOut: 0, rejected: 0 }

export const acceptKey = (key: string) => createHash('sha1').update(key + GUID).digest('base64')

export const frame = (payload: Buffer | string, opcode = 1) => {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  const header = body.length < 126 ? Buffer.from([0x80 | opcode, body.length])
    : body.length < 65_536 ? Buffer.from([0x80 | opcode, 126, body.length >> 8, body.length & 255])
      : Buffer.concat([Buffer.from([0x80 | opcode, 127]), Buffer.alloc(8)])
  if (body.length >= 65_536) header.writeBigUInt64BE(BigInt(body.length), 2)
  return Buffer.concat([header, body])
}

const refuse = (socket: Duplex, status: string) => {
  stats.rejected++
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

export const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer, open: (socket: Socket) => Handlers) => {
  const key = req.headers['sec-websocket-key']
  const origin = req.headers.origin
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' || key.length !== 24) {
    return refuse(socket, '400 Bad Request')
  }
  try {
    const host = (process.env.TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host
    if (origin && new URL(origin).host !== host) return refuse(socket, '403 Forbidden')
  } catch {
    return refuse(socket, '403 Forbidden')
  }
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`)
  stats.open++
  let buffer = head.length ? Buffer.from(head) : Buffer.alloc(0)
  let alive = true
  let closed = false
  let window = { start: Date.now(), count: 0 }

  const write = (data: Buffer) => {
    if (closed || !socket.writable) return
    stats.framesOut++
    socket.write(data)
  }
  const close = (code = 1000) => {
    if (closed) return
    write(Buffer.from([0x88, 2, code >> 8, code & 255]))
    closed = true
    socket.end()
  }
  const handlers = open({ send: message => write(frame(JSON.stringify(message))), close })

  const heartbeat = setInterval(() => {
    if (!alive) return socket.destroy()
    alive = false
    write(frame(Buffer.alloc(0), 9))
  }, HEARTBEAT_MS)

  const read = () => {
    while (buffer.length >= 2 && !closed) {
      const fin = buffer[0] & 0x80
      const opcode = buffer[0] & 0x0f
      const masked = buffer[1] & 0x80
      let length = buffer[1] & 0x7f
      let offset = 2
      if (length === 126) {
        if (buffer.length < 4) return
        length = buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (buffer.length < 10) return
        const big = buffer.readBigUInt64BE(2)
        if (big > BigInt(MAX_PAYLOAD)) return close(1009)
        length = Number(big)
        offset = 10
      }
      if (!masked) return close(1002)
      if (length > MAX_PAYLOAD) return close(1009)
      if (buffer.length < offset + 4 + length) return
      const mask = buffer.subarray(offset, offset + 4)
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length))
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]
      buffer = buffer.subarray(offset + 4 + length)
      stats.framesIn++
      if (!fin || opcode === 0) return close(1003)
      if (opcode === 8) return close(1000)
      if (opcode === 9) {
        write(frame(payload, 10))
        continue
      }
      if (opcode === 10) {
        alive = true
        continue
      }
      if (opcode !== 1) return close(1003)
      const now = Date.now()
      if (now - window.start >= 1000) window = { start: now, count: 0 }
      if (++window.count > MAX_PER_SECOND) return close(1008)
      let data: unknown
      try {
        data = JSON.parse(payload.toString('utf8'))
      } catch {
        return close(1007)
      }
      alive = true
      handlers.message(data)
    }
  }

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    read()
  })
  socket.on('error', () => {})
  socket.on('close', () => {
    clearInterval(heartbeat)
    closed = true
    stats.open--
    handlers.close()
  })
  read()
}
