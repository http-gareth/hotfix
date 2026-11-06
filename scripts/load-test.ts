import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

type Message = Record<string, any>

const [target = 'http://localhost:5320', count = '200', duration = '60'] = process.argv.slice(2)
const PLAYERS = Number(count)
const SECONDS = Number(duration)
const ROOM_SIZE = 4
const sockets: WebSocket[] = []
const rtts: number[] = []
const peaks = { tickP95: 0, cpu: 0, memoryMb: 0, sockets: 0 }
const traffic = { received: 0, sent: 0, errors: 0 }

const player = (join: object, onState: (state: Message, send: (message: object) => void) => void = () => {}) => {
  const socket = new WebSocket(`${target.replace(/^http/, 'ws')}/ws`)
  let state: Message = {}
  let shown = ''
  let found = false
  let typed = 0
  let askedAt = 0
  let waitUntil = 0
  const send = (message: object) => {
    if (socket.readyState !== WebSocket.OPEN) return
    traffic.sent++
    socket.send(JSON.stringify(message))
  }
  socket.addEventListener('open', () => send(join))
  socket.addEventListener('error', () => traffic.errors++)
  socket.addEventListener('message', event => {
    traffic.received++
    const message = JSON.parse(String(event.data))
    if (message.type === 'feedback') {
      if (askedAt) rtts.push(performance.now() - askedAt)
      askedAt = 0
      if (message.kind === 'found') found = true
      if (message.kind === 'nope') waitUntil = performance.now() + 2_100
      if (message.kind === 'wrong-fix') waitUntil = performance.now() + 1_000
      return
    }
    if (message.type !== 'state') return
    state = message
    const key = `${message.state}:${message.index}`
    if (key !== shown) {
      shown = key
      found = false
      typed = 0
      askedAt = 0
    }
    if (message.state === 'over' && message.host) send({ type: 'again' })
    onState(message, send)
  })
  const act = setInterval(() => {
    if (state.state !== 'round' || state.you?.done) return
    if (state.round?.kind === 'race') {
      typed = Math.min(state.round.text.length, typed + 1 + Math.floor(Math.random() * 2))
      return send({ type: 'typed', text: state.round.text.slice(0, typed) })
    }
    if (askedAt || performance.now() < waitUntil) return
    askedAt = performance.now()
    send(found ? { type: 'fix', text: 'return nothing' } : { type: 'tap', line: Math.floor(Math.random() * state.round.lines.length) })
  }, 250)
  socket.addEventListener('close', () => clearInterval(act))
  sockets.push(socket)
}

const room = (number: number) => {
  let invited = false
  player({ type: 'join', mode: 'party', level: 'hardcore', name: `Load ${number}` }, (state, send) => {
    if (state.state !== 'lobby') return
    if (!invited) {
      invited = true
      for (let seat = 1; seat < ROOM_SIZE; seat++) player({ type: 'join', room: state.code, name: `Load ${number}.${seat}` })
    }
    if (state.players.length === ROOM_SIZE) send({ type: 'start' })
  })
}

const sample = setInterval(async () => {
  const system = await fetch(`${target}/api/system`).then(response => response.json()).catch(() => null)
  if (!system) return
  peaks.tickP95 = Math.max(peaks.tickP95, system.tickP95)
  peaks.cpu = Math.max(peaks.cpu, system.cpu)
  peaks.memoryMb = Math.max(peaks.memoryMb, system.memoryMb)
  peaks.sockets = Math.max(peaks.sockets, system.sockets.open)
}, 1_000)

console.log(`Load testing ${target} with ${PLAYERS} players for ${SECONDS}s…`)
for (let number = 0; number < PLAYERS / ROOM_SIZE; number++) {
  room(number)
  await sleep(100)
}
await sleep(SECONDS * 1_000)
clearInterval(sample)
for (const socket of sockets) socket.close()

const sorted = rtts.sort((a, b) => a - b)
const percentile = (share: number) => Math.round(sorted[Math.floor(sorted.length * share)] ?? 0)
const result = {
  at: new Date().toISOString(), target: new URL(target).host, players: PLAYERS, rooms: Math.ceil(PLAYERS / ROOM_SIZE), seconds: SECONDS,
  messagesPerSecond: Math.round(traffic.received / SECONDS), inputsPerSecond: Math.round(traffic.sent / SECONDS),
  replyP50Ms: percentile(0.5), replyP95Ms: percentile(0.95), tickP95Ms: peaks.tickP95, cpuPeak: peaks.cpu, memoryPeakMb: peaks.memoryMb,
  socketsPeak: peaks.sockets, errors: traffic.errors
}
console.table(result)
if (!traffic.received) {
  console.log('No messages came back, so the saved results were left as they were.')
  process.exit(1)
}
writeFileSync(new URL('../web/load-test.json', import.meta.url), `${JSON.stringify(result, null, 1)}\n`)
process.exit(0)
