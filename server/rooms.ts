import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { functionName, mutants, sameCode, tokenize } from '../shared/factory.ts'
import type { Puzzle } from '../shared/factory.ts'
import type { Stats } from './puzzles.ts'
import type { Handlers, Socket } from './ws.ts'

type Kind = 'hunt' | 'race'
type Mode = 'party' | 'solo' | 'daily'
export type Level = 'chill' | 'normal' | 'hardcore'
type Snippet = { name: string, source: string }
type Custom = { name: string, source: string, puzzles: Puzzle[] }
type Round = { kind: 'hunt', puzzle: Puzzle, hint: number } | { kind: 'race', snippet: Snippet }
type Player = {
  id: string, name: string, bot: boolean, skill: number, socket?: Socket, connected: boolean,
  score: number, roundScore: number, combo: number, progress: number, done: boolean, note: string,
  found: boolean, lockedUntil: number, typed: string, strikes: number, flagged: boolean, eta: number, finishedAt: number, timeline: [number, number][]
}
type Room = {
  code: string, mode: Mode, level: Level, custom?: Custom, seed: string, players: Player[], watchers: Map<string, Socket>, hostId: string,
  state: 'lobby' | 'countdown' | 'round' | 'between' | 'over', rounds: Round[], index: number, phaseEndsAt: number,
  startedAt: number, roundStartedAt: number, emptySince: number, log: [number, string, string, unknown?][], replay: string
}
type Replay = {
  id: string, at: number, mode: Mode, level: Level, custom: string | null, players: { name: string, bot: boolean }[],
  rounds: object[], events: [number, string, number, unknown?][]
}

const BANK = JSON.parse(readFileSync(new URL('./puzzles.json', import.meta.url), 'utf8')) as { stats: Stats, puzzles: Puzzle[], snippets: Snippet[] }
const PLAN: Kind[] = ['hunt', 'race', 'hunt', 'race', 'hunt']
const LEVELS = {
  chill: { hunt: 90, race: 90, between: 10, bugs: [1, 1, 2], chars: 130, pace: 0.6, hints: true },
  normal: { hunt: 60, race: 70, between: 8, bugs: [1, 2, 2], chars: 160, pace: 0.8, hints: false },
  hardcore: { hunt: 40, race: 50, between: 7, bugs: [1, 2, 3], chars: 220, pace: 1, hints: false }
}
const FAST = process.env.HOTFIX_FAST ? { hunt: 3, race: 4, between: 0.3 } : {}
const RULES = { chill: { ...LEVELS.chill, ...FAST }, normal: { ...LEVELS.normal, ...FAST }, hardcore: { ...LEVELS.hardcore, ...FAST } }
const COUNTDOWN = process.env.HOTFIX_FAST ? 0.2 : 3
const BOTS: [string, number][] = [['Ada', 1.15], ['Linus', 1], ['Grace', 0.9], ['Alan', 1.05], ['Margaret', 0.95]]
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const MAX_ROOMS = 300
const MAX_PLAYERS = 8
const MAX_WATCHERS = 20
const MAX_LOG = 6_000
const MAX_REPLAYS = 30
const MAX_SOURCE = 1_500
const MAX_CUSTOM = 24
const CLUE_CHARS = 100
const PASTE_CHARS = 25
const HUMAN_CPS = 18

export const bank = BANK.stats
export const metrics = { rooms: 0, matches: 0, players: 0, watchers: 0, events: 0, pastes: 0, flagged: 0, tickMs: [] as number[] }
const rooms = new Map<string, Room>()
const replays = new Map<string, Replay>()
const daily = new Map<string, { name: string, score: number }[]>()
const fastest = new Map<string, { name: string, wpm: number, timeline: [number, number][] }>()

const seeded = (text: string) => {
  let seed = [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619), 2_166_136_261)
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const rules = (room: Room) => RULES[room.level]
const levelOf = (value: unknown): Level => value === 'chill' || value === 'hardcore' ? value : 'normal'

export const plan = (seed: string, level: Level, custom?: Custom): Round[] => {
  const { bugs, chars } = LEVELS[level]
  const random = seeded(seed)
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]
  const key = (puzzle: Puzzle) => custom ? String(puzzle.bug) : puzzle.name
  const used = new Set<string>()
  return PLAN.map((kind, index) => {
    if (kind === 'hunt') {
      const pool = custom?.puzzles ?? BANK.puzzles
      const unused = pool.filter(puzzle => !used.has(key(puzzle)))
      const options = unused.length ? unused : pool
      const matching = options.filter(puzzle => puzzle.difficulty === bugs[index / 2])
      const puzzle = pick(matching.length ? matching : options)
      used.add(key(puzzle))
      return { kind, puzzle, hint: Math.max(0, Math.min(puzzle.lines.length - 3, puzzle.bug - Math.floor(random() * 3))) }
    }
    if (custom && index === 1 && custom.source.length <= chars) return { kind, snippet: { name: custom.name, source: custom.source } }
    const snippet = pick(BANK.snippets.filter(item => !used.has(item.name) && item.source.length <= chars))
    used.add(snippet.name)
    return { kind, snippet }
  })
}

export const customGame = (value: unknown): Custom | null => {
  const { source, puzzles } = (value ?? {}) as { source?: unknown, puzzles?: unknown }
  if (typeof source !== 'string' || source.length > MAX_SOURCE || !Array.isArray(puzzles)) return null
  const lines = source.split('\n')
  if (lines.length > 40 || lines.some(line => line.length > 120)) return null
  const name = functionName(source)
  const known = new Map(mutants(name, source).map(mutant => [mutant.id, mutant]))
  const kept = puzzles.slice(0, MAX_CUSTOM).flatMap(item => {
    const { id, clue } = (item ?? {}) as { id?: unknown, clue?: Record<string, unknown> }
    const mutant = known.get(String(id))
    const parts = [clue?.call, clue?.expected, clue?.actual]
    if (!mutant || !parts.every(part => typeof part === 'string' && part.length <= CLUE_CHARS)) return []
    const { id: puzzleId, lines: changed, bug, fix, difficulty } = mutant
    const [call, expected, actual] = parts as string[]
    return [{ id: puzzleId, name, lines: changed, bug, fix, difficulty, clue: { call, expected, actual } }]
  })
  return kept.length ? { name, source, puzzles: kept } : null
}

export const cleanName = (value: unknown) => String(value ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Player'
const today = () => new Date().toISOString().slice(0, 10)
const ordinal = (place: number) => ['1st', '2nd', '3rd'][place] ?? `${place + 1}th`
const newCode = () => {
  for (;;) {
    const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('')
    if (!rooms.has(code)) return code
  }
}

const record = (room: Room, kind: string, player = '', data?: unknown) => {
  if (room.log.length >= MAX_LOG) return
  room.log.push([room.startedAt ? Date.now() - room.startedAt : 0, kind, player, data])
  metrics.events++
}

const fresh = (id: string, name: string, bot: boolean, skill = 1, socket?: Socket): Player => ({
  id, name, bot, skill, socket, connected: !bot, score: 0, roundScore: 0, combo: 0, progress: 0, done: false, note: '',
  found: false, lockedUntil: 0, typed: '', strikes: 0, flagged: false, eta: Infinity, finishedAt: 0, timeline: []
})

const suspect = (puzzle: Puzzle) => {
  const fix = tokenize(puzzle.fix).filter(token => token.trim())
  return tokenize(puzzle.lines[puzzle.bug]).filter(token => token.trim()).find((token, at) => token !== fix[at]) ?? ''
}

const shuffle = <T>(items: T[]) => items.map(item => [Math.random(), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item)

const choices = (puzzle: Puzzle, pool: Puzzle[]) => {
  const shown = puzzle.lines[puzzle.bug]
  const wrong = pool.filter(other => other.name === puzzle.name && other.bug === puzzle.bug).map(other => other.lines[other.bug])
  const decoys = [...new Set(wrong)].filter(line => !sameCode(line, puzzle.fix) && !sameCode(line, shown))
  return shuffle([puzzle.fix, ...shuffle(decoys).slice(0, 3)])
}

const target = (round: Round) => round.kind === 'race' ? round.snippet.source : ''
const humans = (room: Room) => room.players.filter(player => !player.bot)

const begin = (room: Room, now: number) => {
  const bots = BOTS.filter(([name]) => !room.players.some(player => player.name === `${name} (bot)`))
  while (room.players.length < (room.mode === 'party' && humans(room).length > 1 ? 0 : 4) && bots.length) {
    const [name, skill] = bots.splice(Math.floor(Math.random() * bots.length), 1)[0]
    room.players.push(fresh(randomUUID(), `${name} (bot)`, true, skill))
  }
  for (const player of room.players) Object.assign(player, { score: 0, combo: 0, flagged: false, strikes: 0 })
  room.rounds = plan(room.mode === 'daily' ? room.seed : `${room.code}:${now}`, room.level, room.custom)
  room.index = -1
  room.log = []
  room.replay = ''
  room.startedAt = now
  room.state = 'countdown'
  room.phaseEndsAt = now + COUNTDOWN * 1000
  record(room, 'start')
}

const startRound = (room: Room, now: number) => {
  room.index++
  if (room.index >= room.rounds.length) return finish(room)
  const round = room.rounds[room.index]
  const { pace } = rules(room)
  room.state = 'round'
  room.roundStartedAt = now
  room.phaseEndsAt = now + rules(room)[round.kind] * 1000
  for (const player of room.players) {
    Object.assign(player, { roundScore: 0, progress: 0, done: player.flagged, note: player.flagged ? 'disqualified' : '', found: false, lockedUntil: 0, typed: '', finishedAt: 0, timeline: [] })
    if (!player.bot) continue
    player.eta = round.kind === 'hunt'
      ? Math.random() < 0.1 ? Infinity : (10 + Math.random() * 16) * (0.7 + 0.15 * round.puzzle.difficulty) / player.skill / pace
      : target(round).length / ((36 + Math.random() * 30) * player.skill * pace * 5 / 60)
  }
  record(room, 'round', '', room.index)
}

const solve = (room: Room, player: Player, at: number) => {
  const round = room.rounds[room.index]
  const seconds = (at - room.roundStartedAt) / 1000
  const text = target(round)
  const wpm = Math.round(text.length / 5 / (seconds / 60))
  Object.assign(player, { done: true, progress: 100, finishedAt: at, note: round.kind === 'hunt' ? `fixed it in ${seconds.toFixed(1)}s` : `${wpm} wpm` })
  record(room, round.kind === 'hunt' ? 'fixed' : 'finished', player.id, round.kind === 'hunt' ? seconds : wpm)
  if (round.kind === 'race' && !player.bot && wpm > (fastest.get(round.snippet.name)?.wpm ?? 0)) fastest.set(round.snippet.name, { name: player.name, wpm, timeline: [...player.timeline] })
}

const endRound = (room: Room, now: number) => {
  const round = room.rounds[room.index]
  const limit = room.roundStartedAt + rules(room)[round.kind] * 1000
  const finished = room.players.filter(player => player.finishedAt && !player.flagged).sort((a, b) => a.finishedAt - b.finishedAt)
  finished.forEach((player, place) => {
    const base = round.kind === 'hunt'
      ? 100 + Math.round(Math.max(0, limit - player.finishedAt) / 1000 * 4) + (place ? 0 : 25)
      : Math.max(40, 150 - 35 * place)
    const boost = 1 + 0.25 * Math.min(player.combo++, 4)
    player.roundScore = Math.round(base * boost)
    player.note = `${round.kind === 'hunt' ? `${place ? '' : 'First! '}${player.note}` : `${ordinal(place)} · ${player.note}`}${boost > 1 ? ` · combo x${boost}` : ''}`
  })
  for (const player of room.players) {
    if (!finished.includes(player)) player.combo = 0
    if (!player.done) {
      player.roundScore = round.kind === 'race' ? Math.round(player.progress * 0.5) : 0
      player.note = round.kind === 'race' ? `${Math.round(player.progress)}% typed` : 'ran out of time'
    }
    player.score += player.roundScore
  }
  room.state = 'between'
  room.phaseEndsAt = now + rules(room).between * 1000
  record(room, 'round-over', '', room.players.map(player => [player.roundScore, player.score, player.note]))
}

const saveReplay = (room: Room) => {
  const index = new Map(room.players.map((player, at) => [player.id, at]))
  const { hunt, race } = rules(room)
  room.replay = randomUUID().replace(/-/g, '').slice(0, 10)
  replays.set(room.replay, {
    id: room.replay, at: Date.now(), mode: room.mode, level: room.level, custom: room.custom?.name ?? null,
    players: room.players.map(({ name, bot }) => ({ name, bot })),
    rounds: room.rounds.map(round => round.kind === 'hunt'
      ? { kind: 'hunt', name: round.puzzle.name, lines: round.puzzle.lines, bug: round.puzzle.bug, fix: round.puzzle.fix, clue: round.puzzle.clue, seconds: hunt }
      : { kind: 'race', name: round.snippet.name, text: round.snippet.source, seconds: race }),
    events: room.log.map(([at, kind, player, data]) => [at, kind, index.get(player) ?? -1, data])
  })
  if (replays.size > MAX_REPLAYS) replays.delete(replays.keys().next().value!)
}

const finish = (room: Room) => {
  room.state = 'over'
  metrics.matches++
  record(room, 'over', '', room.players.map(player => player.score))
  saveReplay(room)
  if (room.mode !== 'daily') return
  const board = daily.get(room.seed) ?? []
  for (const player of humans(room)) if (!player.flagged) board.push({ name: player.name, score: player.score })
  const best = new Map<string, { name: string, score: number }>()
  for (const entry of board) if (entry.score > (best.get(entry.name)?.score ?? -1)) best.set(entry.name, entry)
  daily.set(room.seed, [...best.values()].sort((a, b) => b.score - a.score).slice(0, 20))
}

const step = (room: Room, now: number) => {
  if (room.state === 'round') {
    const round = room.rounds[room.index]
    const elapsed = (now - room.roundStartedAt) / 1000
    for (const bot of room.players.filter(player => player.bot && !player.done)) {
      bot.progress = Math.min(round.kind === 'hunt' ? 60 : 99, elapsed / bot.eta * 100)
      if (round.kind === 'race') bot.timeline.push([now - room.roundStartedAt, Math.round(bot.progress / 100 * target(round).length)])
      if (elapsed >= bot.eta) solve(room, bot, now)
    }
    const people = humans(room).filter(player => player.connected)
    if (people.length && people.every(player => player.done)) {
      for (const bot of room.players.filter(player => player.bot && !player.done)) {
        if (bot.eta <= rules(room)[round.kind]) solve(room, bot, room.roundStartedAt + bot.eta * 1000)
      }
      room.phaseEndsAt = Math.min(room.phaseEndsAt, now + 2_500)
    }
    if (room.players.every(player => player.done)) room.phaseEndsAt = Math.min(room.phaseEndsAt, now + 800)
  }
  if (room.state === 'lobby' || room.state === 'over' || now < room.phaseEndsAt) return
  if (room.state === 'round') endRound(room, now)
  else startRound(room, now)
}

const replayGhost = (timeline: [number, number][], ms: number) => timeline.findLast(([at]) => at <= ms)?.[1] ?? 0

const view = (room: Room, player: Player | undefined, now: number) => {
  const round = room.rounds[room.index]
  const live = room.state === 'round' || room.state === 'between'
  const best = room.state === 'round' && round?.kind === 'race' ? fastest.get(round.snippet.name) : undefined
  return {
    type: 'state', now, code: room.code, mode: room.mode, level: room.level, custom: room.custom?.name ?? null,
    spectator: !player, watching: room.watchers.size, state: room.state, host: room.hostId === player?.id,
    index: room.index, total: PLAN.length, endsAt: room.phaseEndsAt,
    round: !live || !round ? null : round.kind === 'hunt'
      ? { kind: 'hunt', name: round.puzzle.name, lines: round.puzzle.lines, clue: round.puzzle.clue }
      : { kind: 'race', name: round.snippet.name, text: round.snippet.source },
    hint: room.state === 'round' && round?.kind === 'hunt' && rules(room).hints && now - room.roundStartedAt >= rules(room).hunt * 1000 / 3 ? round.hint : null,
    reveal: room.state === 'between' && round?.kind === 'hunt' ? { bug: round.puzzle.bug, fix: round.puzzle.fix } : null,
    next: room.state === 'countdown' || room.state === 'between' ? room.rounds[room.index + 1]?.kind ?? null : null,
    ghost: best ? { name: best.name, wpm: best.wpm, progress: Math.round(replayGhost(best.timeline, now - room.roundStartedAt) / target(round).length * 100) } : null,
    replay: room.state === 'over' ? room.replay : null,
    players: room.players.map(other => ({
      id: other.id, name: other.name, bot: other.bot, score: other.score, roundScore: other.roundScore, combo: other.combo, progress: Math.round(other.progress),
      done: other.done, note: other.note, you: other.id === player?.id, online: other.bot || other.connected
    })),
    you: player ? { found: player.found, lockedUntil: player.lockedUntil, done: player.done, flagged: player.flagged } : { found: false, lockedUntil: 0, done: true, flagged: false }
  }
}

export const tick = () => {
  const started = performance.now()
  const now = Date.now()
  for (const room of rooms.values()) {
    step(room, now)
    const people = humans(room).filter(player => player.connected)
    if (!people.length) {
      room.emptySince ||= now
      if (now - room.emptySince > 30_000) {
        for (const watcher of room.watchers.values()) watcher.close()
        rooms.delete(room.code)
      }
      continue
    }
    room.emptySince = 0
    for (const player of people) player.socket?.send(view(room, player, now))
    if (!room.watchers.size) continue
    const shared = view(room, undefined, now)
    for (const watcher of room.watchers.values()) watcher.send(shared)
  }
  metrics.rooms = rooms.size
  metrics.players = [...rooms.values()].reduce((sum, room) => sum + humans(room).filter(player => player.connected).length, 0)
  metrics.watchers = [...rooms.values()].reduce((sum, room) => sum + room.watchers.size, 0)
  metrics.tickMs = [...metrics.tickMs.slice(-199), performance.now() - started]
}

export const boards = () => ({
  daily: daily.get(today()) ?? [],
  fastest: [...fastest.entries()].map(([snippet, { name, wpm }]) => ({ snippet, name, wpm })).sort((a, b) => b.wpm - a.wpm).slice(0, 10)
})

export const replay = (id: string) => replays.get(id)
export const replayCount = () => replays.size

export const connect = (socket: Socket): Handlers => {
  const id = randomUUID()
  let room: Room | null = null
  let watching = false
  const fail = (message: string) => socket.send({ type: 'error', message })
  const feedback = (kind: string, extra: object = {}) => socket.send({ type: 'feedback', kind, ...extra })

  const join = (data: Record<string, unknown>) => {
    const mode: Mode = data.mode === 'solo' || data.mode === 'daily' ? data.mode : 'party'
    const code = typeof data.room === 'string' ? data.room.toUpperCase().slice(0, 4) : ''
    if (code) {
      const existing = rooms.get(code)
      if (!existing) return fail('No game with that code. Check it and try again.')
      if (data.watch) {
        if (existing.watchers.size >= MAX_WATCHERS) return fail('That game has a full crowd watching already.')
        existing.watchers.set(id, socket)
        room = existing
        watching = true
        return
      }
      if (existing.state !== 'lobby') return fail('That game has already started. Tap Watch to see it live!')
      if (existing.players.length >= MAX_PLAYERS) return fail('That game is full. Tap Watch to see it live!')
      room = existing
    } else {
      if (rooms.size >= MAX_ROOMS) return fail('The arena is packed right now. Try again in a minute.')
      const custom = data.custom === undefined || mode === 'daily' ? undefined : customGame(data.custom)
      if (custom === null) return fail('That custom game did not check out. Make it again and retry.')
      room = {
        code: newCode(), mode, level: mode === 'daily' ? 'normal' : levelOf(data.level), custom, seed: today(), players: [], watchers: new Map(), hostId: id,
        state: 'lobby', rounds: [], index: -1, phaseEndsAt: 0, startedAt: 0, roundStartedAt: 0, emptySince: 0, log: [], replay: ''
      }
      rooms.set(room.code, room)
    }
    room.players.push(fresh(id, cleanName(data.name), false, 1, socket))
    record(room, 'join', id, cleanName(data.name))
    if (mode !== 'party' && !code) begin(room, Date.now())
  }

  return {
    message: raw => {
      if (!raw || typeof raw !== 'object') return
      const data = raw as Record<string, unknown>
      if (data.type === 'join') return room ? undefined : join(data)
      if (!room || watching) return
      const player = room.players.find(other => other.id === id)!
      const now = Date.now()
      if (data.type === 'start' && room.state === 'lobby' && room.hostId === id) return begin(room, now)
      if (data.type === 'again' && room.state === 'over' && room.hostId === id) {
        room.players = room.players.filter(other => other.bot || other.connected)
        return begin(room, now)
      }
      const round = room.rounds[room.index]
      if (room.state !== 'round' || !round || player.done) return
      if (data.type === 'tap' && round.kind === 'hunt' && !player.found && Number.isInteger(data.line)) {
        if (now < player.lockedUntil) return
        if (data.line === round.puzzle.bug) {
          record(room, 'found', id, data.line)
          Object.assign(player, { found: true, progress: 50 })
          return feedback('found', { line: data.line, choices: choices(round.puzzle, room.custom?.puzzles ?? BANK.puzzles) })
        }
        record(room, 'nope', id, data.line)
        player.lockedUntil = now + 2_000
        return feedback('nope', { until: player.lockedUntil, line: data.line })
      }
      if (data.type === 'fix' && round.kind === 'hunt' && player.found && typeof data.text === 'string' && data.text.length < 300) {
        if (now < player.lockedUntil) return
        if (sameCode(data.text, round.puzzle.fix)) {
          solve(room, player, now)
          return feedback('fixed')
        }
        record(room, 'wrong-fix', id, data.text.slice(0, 120))
        player.lockedUntil = now + 1_500
        return feedback('wrong-fix', { until: player.lockedUntil, ...rules(room).hints && { token: suspect(round.puzzle) } })
      }
      if (data.type === 'typed' && round.kind === 'race' && typeof data.text === 'string') {
        const text = data.text.slice(0, target(round).length + 20)
        if (text.length - player.typed.length > PASTE_CHARS) {
          metrics.pastes++
          record(room, 'paste', id, text.length - player.typed.length)
          if (++player.strikes >= 3) Object.assign(player, { done: true, flagged: true, note: 'disqualified for pasting' })
          return feedback('paste', { strikes: player.strikes })
        }
        player.typed = text
        const goal = target(round)
        let correct = 0
        while (correct < text.length && text[correct] === goal[correct]) correct++
        const seconds = (now - room.roundStartedAt) / 1000
        if (correct > 40 && correct / seconds > HUMAN_CPS) {
          Object.assign(player, { done: true, note: 'too fast to be human' })
          metrics.flagged++
          record(room, 'flagged', id, Math.round(correct / seconds))
          return feedback('flagged')
        }
        player.progress = correct / goal.length * 100
        if (correct !== player.timeline.at(-1)?.[1]) {
          player.timeline.push([now - room.roundStartedAt, correct])
          record(room, 'typed', id, correct)
        }
        if (text === goal) {
          solve(room, player, now)
          feedback('finished')
        }
      }
    },
    close: () => {
      if (!room) return
      if (watching) return void room.watchers.delete(id)
      const player = room.players.find(other => other.id === id)
      if (!player) return
      player.connected = false
      player.socket = undefined
      if (room.state === 'lobby') room.players = room.players.filter(other => other !== player)
      if (room.hostId === id) room.hostId = humans(room).find(other => other.connected)?.id ?? ''
    }
  }
}
