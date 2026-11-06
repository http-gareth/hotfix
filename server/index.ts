import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isHttps, securityHeaders, serveFile } from './files.ts'
import { bank, boards, connect, lesson, metrics, replay, replayCount, tick } from './rooms.ts'
import { stats, upgrade } from './ws.ts'

const port = Number(process.env.PORT ?? 5320)
let cpu = 0
let mark = { time: performance.now(), usage: process.cpuUsage() }

const json = (req: IncomingMessage, res: ServerResponse, body: object, status = 200) => {
  res.writeHead(status, { ...securityHeaders(isHttps(req)), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

const system = () => {
  const ticks = [...metrics.tickMs].sort((a, b) => a - b)
  return {
    bank, sockets: stats, cpu, memoryMb: Math.round(process.memoryUsage().rss / 1e6), uptime: Math.round(process.uptime()),
    rooms: metrics.rooms, players: metrics.players, watchers: metrics.watchers, replays: replayCount(), matches: metrics.matches, events: metrics.events, pastes: metrics.pastes, flagged: metrics.flagged,
    tickP95: Math.round((ticks[Math.floor(ticks.length * 0.95)] ?? 0) * 100) / 100
  }
}

setInterval(tick, 100)
setInterval(() => {
  const used = process.cpuUsage(mark.usage)
  cpu = Math.round((used.user + used.system) / 10 / (performance.now() - mark.time))
  mark = { time: performance.now(), usage: process.cpuUsage() }
}, 2_000)

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (req.method === 'GET' && path === '/api/boards') return json(req, res, boards())
  if (req.method === 'GET' && path === '/api/system') return json(req, res, system())
  const lessonKind = req.method === 'GET' && path.match(/^\/api\/lessons\/([a-z]+)$/)?.[1]
  const practice = lessonKind && lesson(lessonKind)
  if (lessonKind) return practice ? json(req, res, practice) : json(req, res, { error: 'No such lesson.' }, 404)
  const replayId = req.method === 'GET' && path.match(/^\/api\/replays\/([a-f0-9]{10})$/)?.[1]
  const saved = replayId && replay(replayId)
  if (replayId) return saved ? json(req, res, saved) : json(req, res, { error: 'This replay has expired.' }, 404)
  serveFile(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
}).on('upgrade', (req, socket, head) => {
  if ((req.url ?? '').split('?')[0] !== '/ws') return socket.destroy()
  upgrade(req, socket, head, connect)
}).on('clientError', (_, socket) => socket.destroy()).listen(port, () => {
  console.log(`HOTFIX! running at http://localhost:${port}`)
})
