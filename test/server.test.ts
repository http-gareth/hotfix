import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { connect as tcp } from 'node:net'
import { after, before, test } from 'node:test'
import { functionName, mutants, sameCode } from '../shared/factory.ts'
import { failure } from '../server/puzzles.ts'
import { plan } from '../server/rooms.ts'
import { acceptKey, frame } from '../server/ws.ts'

type Message = Record<string, any>
const PORT = 5392
const BANK = JSON.parse(readFileSync(new URL('../server/puzzles.json', import.meta.url), 'utf8'))
let server: ReturnType<typeof spawn>

before(async () => {
  server = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), HOTFIX_FAST: '1' }, stdio: ['ignore', 'pipe', 'inherit']
  })
  await new Promise(resolve => server.stdout!.once('data', resolve))
})
after(() => server.kill())

const player = () => new Promise<{ send: (message: Message) => void, next: (check: (message: Message) => boolean, ms?: number) => Promise<Message>, close: () => void }>((resolve, reject) => {
  const socket = new WebSocket(`ws://localhost:${PORT}/ws`)
  const waiting: [(message: Message) => boolean, (message: Message) => void][] = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    for (const waiter of [...waiting]) {
      if (!waiter[0](message)) continue
      waiting.splice(waiting.indexOf(waiter), 1)
      waiter[1](message)
    }
  })
  socket.addEventListener('error', reject)
  socket.addEventListener('open', () => resolve({
    send: message => socket.send(JSON.stringify(message)),
    next: (check, ms = 8_000) => new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('no matching message')), ms)
      waiting.push([check, message => {
        clearTimeout(timer)
        done(message)
      }])
    }),
    close: () => socket.close()
  }))
})

const handshake = (origin: string) => new Promise<number>(resolve => {
  const req = request({
    port: PORT, path: '/ws',
    headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', origin, host: `localhost:${PORT}` }
  })
  req.on('upgrade', (res, socket) => {
    socket.destroy()
    resolve(res.statusCode ?? 0)
  })
  req.on('response', res => resolve(res.statusCode ?? 0))
  req.end()
})

const closeCodeFor = (payload: Buffer) => new Promise<number>(resolve => {
  const socket = tcp(PORT, '127.0.0.1', () => {
    socket.write(`GET /ws HTTP/1.1\r\nHost: localhost:${PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`)
  })
  let received = Buffer.alloc(0)
  socket.on('data', chunk => {
    received = Buffer.concat([received, chunk])
    const end = received.indexOf('\r\n\r\n')
    if (end < 0) return
    const frames = received.subarray(end + 4)
    if (!frames.length) return socket.write(payload)
    if (frames[0] === 0x88) {
      resolve(frames.readUInt16BE(2))
      socket.destroy()
    }
  })
})

test('the handshake key and frame headers follow RFC 6455', () => {
  assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
  assert.deepEqual([...frame('hello').subarray(0, 2)], [0x81, 5])
  assert.deepEqual([...frame('x'.repeat(200)).subarray(0, 4)], [0x81, 126, 0, 200])
  assert.equal(frame('x'.repeat(70_000))[1], 127)
})

test('other websites cannot open a socket to the game', async () => {
  assert.equal(await handshake('http://evil.example'), 403)
  assert.equal(await handshake(`http://localhost:${PORT}`), 101)
})

test('unmasked and oversized frames get the socket closed', async () => {
  assert.equal(await closeCodeFor(Buffer.from([0x81, 2, 0x7b, 0x7d])), 1002)
  assert.equal(await closeCodeFor(Buffer.concat([Buffer.from([0x81, 0xff]), Buffer.alloc(8, 0xff)])), 1009)
})

test('a solo game: find the bug, fix it, and get caught pasting and typing too fast', async () => {
  const me = await player()
  me.send({ type: 'join', mode: 'solo', name: '<b>Gareth</b>' })
  const hunt = await me.next(message => message.type === 'state' && message.round?.kind === 'hunt')
  assert.equal(hunt.players.length, 4)
  assert.ok(hunt.players.some((other: Message) => other.you && other.name === 'bGarethb'))
  assert.equal(hunt.round.bug, undefined)
  const puzzle = BANK.puzzles.find((item: Message) => item.name === hunt.round.name && item.lines.join() === hunt.round.lines.join())
  let reply = me.next(message => message.type === 'feedback')
  me.send({ type: 'tap', line: puzzle.bug })
  const found = await reply
  assert.equal(found.kind, 'found')
  assert.ok(found.choices.length >= 1 && found.choices.length <= 4)
  assert.equal(found.choices.filter((choice: string) => sameCode(choice, puzzle.fix)).length, 1)
  const provenWrong = BANK.puzzles.filter((item: Message) => item.name === puzzle.name && item.bug === puzzle.bug).map((item: Message) => item.lines[item.bug])
  for (const choice of found.choices) {
    assert.ok(!sameCode(choice, puzzle.lines[puzzle.bug]))
    assert.ok(sameCode(choice, puzzle.fix) || provenWrong.includes(choice))
  }
  reply = me.next(message => message.type === 'feedback')
  me.send({ type: 'fix', text: puzzle.lines[puzzle.bug] })
  const wrong = await reply
  assert.equal(wrong.kind, 'wrong-fix')
  assert.equal(wrong.token, undefined)
  me.send({ type: 'fix', text: puzzle.fix })
  await new Promise(resolve => setTimeout(resolve, wrong.until - Date.now() + 100))
  reply = me.next(message => message.type === 'feedback')
  me.send({ type: 'fix', text: `   ${puzzle.fix.trim().replace(/ /g, '  ')}` })
  assert.equal((await reply).kind, 'fixed')
  const between = await me.next(message => message.type === 'state' && message.state === 'between' && message.reveal)
  assert.equal(between.reveal.bug, puzzle.bug)
  assert.equal(between.players.find((other: Message) => other.you).combo, 1)
  assert.ok(between.players.find((other: Message) => other.you).score >= 100)

  const race = await me.next(message => message.type === 'state' && message.round?.kind === 'race')
  reply = me.next(message => message.type === 'feedback')
  me.send({ type: 'typed', text: race.round.text })
  assert.deepEqual(await reply, { type: 'feedback', kind: 'paste', strikes: 1 })
  reply = me.next(message => message.type === 'feedback')
  for (let at = 20; at < race.round.text.length + 20; at += 20) me.send({ type: 'typed', text: race.round.text.slice(0, at) })
  assert.equal((await reply).kind, 'flagged')
  me.close()
})

test('chill mode picks easier rounds and hints at the bug', async () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const rounds = plan(seed, 'chill')
    assert.deepEqual(rounds.flatMap(round => round.kind === 'hunt' ? [round.puzzle.difficulty] : []), [1, 1, 2])
    assert.ok(rounds.every(round => round.kind === 'hunt' || round.snippet.source.length <= 130))
  }
  const me = await player()
  me.send({ type: 'join', mode: 'solo', level: 'chill', name: 'Chill' })
  const hinted = await me.next(message => message.type === 'state' && message.hint != null)
  assert.equal(hinted.level, 'chill')
  const puzzle = BANK.puzzles.find((item: Message) => item.name === hinted.round.name && item.lines.join() === hinted.round.lines.join())
  assert.ok(puzzle.bug >= hinted.hint && puzzle.bug < hinted.hint + 3)
  let reply = me.next(message => message.type === 'feedback')
  me.send({ type: 'tap', line: puzzle.bug })
  assert.equal((await reply).kind, 'found')
  reply = me.next(message => message.type === 'feedback')
  me.send({ type: 'fix', text: puzzle.lines[puzzle.bug] })
  const { token } = await reply
  assert.ok(token && puzzle.lines[puzzle.bug].includes(token))
  me.close()
})

test('a party game: friends join by code and only the host can start', async () => {
  const host = await player()
  const friend = await player()
  host.send({ type: 'join', mode: 'party', name: 'Host' })
  const lobby = await host.next(message => message.type === 'state' && message.state === 'lobby')
  assert.ok(lobby.host)
  const error = friend.next(message => message.type === 'error')
  friend.send({ type: 'join', room: 'ZZZZ', name: 'Lost' })
  assert.match((await error).message, /No game with that code/)
  friend.send({ type: 'join', room: lobby.code.toLowerCase(), name: 'Friend' })
  const both = await host.next(message => message.type === 'state' && message.players.length === 2)
  assert.deepEqual(both.players.map((other: Message) => other.name), ['Host', 'Friend'])
  friend.send({ type: 'start' })
  await new Promise(resolve => setTimeout(resolve, 300))
  host.send({ type: 'start' })
  const started = await friend.next(message => message.type === 'state' && message.state !== 'lobby')
  assert.ok(!started.host)
  assert.equal(started.players.length, 2)
  host.close()
  friend.close()
})

test('a custom game is rebuilt on the server, can be watched, and replays from its event log', async () => {
  const source = [
    'function accuracy(hits, misses) {',
    '  if (hits === 0 && misses === 0) return 0',
    '  const total = hits + misses',
    '  return Math.round(hits / total * 100)',
    '}'
  ].join('\n')
  const checks: [string, unknown][] = [['accuracy(3, 1)', 75], ['accuracy(0, 0)', 0], ['accuracy(1, 0)', 100]]
  const puzzles = mutants(functionName(source), source).flatMap(mutant => {
    const clue = failure(mutant.source, checks)
    return clue ? [{ id: mutant.id, clue }] : []
  })
  const fake = { id: 'accuracy:1:1:rm -rf', clue: puzzles[0].clue }
  const me = await player()
  const rejected = me.next(message => message.type === 'error')
  me.send({ type: 'join', mode: 'solo', custom: { source, puzzles: [fake] } })
  assert.match((await rejected).message, /did not check out/)
  me.close()

  const host = await player()
  host.send({ type: 'join', mode: 'solo', name: 'Maker', custom: { source, puzzles: [fake, ...puzzles] } })
  const hunt = await host.next(message => message.type === 'state' && message.round?.kind === 'hunt')
  assert.equal(hunt.custom, 'accuracy')
  assert.equal(hunt.round.name, 'accuracy')
  assert.ok(mutants('accuracy', source).some(mutant => mutant.lines.join() === hunt.round.lines.join()))

  const fan = await player()
  fan.send({ type: 'join', room: hunt.code, watch: true, name: 'Fan' })
  const watched = await fan.next(message => message.type === 'state')
  assert.ok(watched.spectator && watched.you.done && !watched.host)
  assert.equal(watched.players.length, 4)
  assert.ok(!watched.players.some((other: Message) => other.you))
  fan.send({ type: 'tap', line: 1 })
  assert.equal((await host.next(message => message.type === 'state' && message.watching === 1)).players.length, 4)

  const over = await host.next(message => message.type === 'state' && message.state === 'over', 40_000)
  assert.match(over.replay, /^[a-f0-9]{10}$/)
  const replay = await (await fetch(`http://localhost:${PORT}/api/replays/${over.replay}`)).json()
  assert.equal(replay.custom, 'accuracy')
  assert.equal(replay.players[0].name, 'Maker')
  assert.equal(replay.rounds.length, 5)
  assert.equal(replay.events.filter(([, kind]: [number, string]) => kind === 'round-over').length, 5)
  assert.ok(!replay.events.some(([, kind, who]: [number, string, number]) => kind === 'nope' && who === -1))
  assert.equal((await fetch(`http://localhost:${PORT}/api/replays/0000000000`)).status, 404)
  host.close()
  fan.close()
})

test('only the sandbox worker may evaluate code', async () => {
  const policy = async (path: string) => (await fetch(`http://localhost:${PORT}${path}`)).headers.get('content-security-policy') ?? ''
  assert.match(await policy('/web/sandbox.ts'), /'unsafe-eval'/)
  assert.doesNotMatch(await policy('/web/app.ts'), /unsafe-eval/)
  assert.equal((await fetch(`http://localhost:${PORT}/shared/factory.ts`)).status, 200)
  assert.equal((await fetch(`http://localhost:${PORT}/server/rooms.ts`)).status, 404)
})

test('the system endpoint reports the puzzle bank and live counters', async () => {
  const system = await (await fetch(`http://localhost:${PORT}/api/system`)).json()
  assert.equal(system.bank.kept, BANK.puzzles.length)
  assert.ok(system.events > 0)
  assert.ok(system.pastes >= 1 && system.flagged >= 1)
})
