type HuntRound = { kind: 'hunt', name: string, lines: string[], bug: number, fix: string, clue: { call: string, expected: string, actual: string }, seconds: number }
type RaceRound = { kind: 'race', name: string, text: string, seconds: number }
type Match = {
  id: string, at: number, mode: string, level: string, custom: string | null, players: { name: string, bot: boolean }[],
  rounds: (HuntRound | RaceRound)[], events: [number, string, number, any][]
}
type Seat = { name: string, bot: boolean, progress: number, score: number, roundScore: number, note: string }

const KINDS = { hunt: 'HUNT!', race: 'RACE!' }
const LEVELS: Record<string, string> = { chill: 'Chill', normal: 'Normal', hardcore: 'Hardcore' }
const MODES: Record<string, string> = { solo: 'Solo game', daily: 'Daily challenge', party: 'Party game' }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const element = (tag: string, className = '', text = '') => {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}
const minutes = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const ordinal = (place: number) => ['1st', '2nd', '3rd'][place] ?? `${place + 1}th`

const id = new URLSearchParams(location.search).get('id') ?? ''
const match: Match | null = /^[a-f0-9]{10}$/.test(id)
  ? await fetch(`/api/replays/${id}`).then(response => response.ok ? response.json() : null).catch(() => null)
  : null

const finishes = new Map<string, number>()
let current = -1
for (const [at, kind, who, data] of match?.events ?? []) {
  if (kind === 'round') current = data
  if (kind === 'fixed' || kind === 'finished') finishes.set(`${current}:${who}`, at)
}

const fold = (match: Match, t: number) => {
  const seats: Seat[] = match.players.map(({ name, bot }) => ({ name, bot, progress: 0, score: 0, roundScore: 0, note: '' }))
  const ticker: string[] = []
  let index = -1
  let start = 0
  let ended = false
  let over = false
  let found = -1
  for (const [at, kind, who, data] of match.events) {
    if (at > t) break
    const seat = seats[who]
    const since = `${((at - start) / 1000).toFixed(1)}s`
    if (kind === 'round') {
      index = data
      start = at
      ended = false
      found = -1
      ticker.length = 0
      for (const each of seats) Object.assign(each, { progress: 0, roundScore: 0, note: '' })
    }
    if (kind === 'found') {
      Object.assign(seat, { progress: 50, note: 'found the bug' })
      found = data
      ticker.push(`${since} ${seat.name} found the bug on line ${data + 1}!`)
    }
    if (kind === 'nope') ticker.push(`${since} ${seat.name} tapped line ${data + 1}. Nope!`)
    if (kind === 'wrong-fix') ticker.push(`${since} ${seat.name} tried: ${String(data).trim()}`)
    if (kind === 'fixed') {
      Object.assign(seat, { progress: 100, note: `fixed it in ${data.toFixed(1)}s` })
      ticker.push(`${since} ${seat.name} fixed it!`)
    }
    if (kind === 'typed') seat.progress = data / (match.rounds[index] as RaceRound).text.length * 100
    if (kind === 'finished') {
      Object.assign(seat, { progress: 100, note: `${data} wpm` })
      ticker.push(`${since} ${seat.name} finished at ${data} wpm`)
    }
    if (kind === 'paste') ticker.push(`${since} ${seat.name} tried to paste. Blocked!`)
    if (kind === 'flagged') ticker.push(`${since} ${seat.name} typed too fast to be human`)
    if (kind === 'round-over') {
      ended = true
      data.forEach(([roundScore, score, note]: [number, number, string], place: number) => Object.assign(seats[place], { roundScore, score, note }))
    }
    if (kind === 'over') over = true
  }
  if (match.rounds[index]?.kind === 'race' && !ended) {
    seats.forEach((seat, place) => {
      const finish = finishes.get(`${index}:${place}`)
      if (seat.bot && finish && seat.progress < 100) seat.progress = Math.min(99, (t - start) / (finish - start) * 100)
    })
  }
  return { seats, ticker, index, start, ended, over, found }
}

const setupRound = (round: HuntRound | RaceRound | undefined) => {
  $('test').hidden = $('code').hidden = round?.kind !== 'hunt'
  $('racecode').hidden = round?.kind !== 'race'
  if (round?.kind !== 'hunt') return
  $('test').replaceChildren(element('b', 'verdict fail', 'FAIL'), element('code', '', round.clue.call), ' should give ', element('code', '', round.clue.expected), ' but gives ', element('code', '', round.clue.actual))
  $('code').replaceChildren(...round.lines.map((text, at) => {
    const line = element('div', 'line')
    line.append(element('span', 'n', String(at + 1)), element('span', 't', text))
    return line
  }))
}

const drawSeats = (seats: Seat[], live: boolean) => {
  $('players').replaceChildren(...[...seats].sort((a, b) => b.score - a.score).map(seat => {
    const box = element('div', `player${seat.progress >= 100 ? ' done' : ''}`)
    const row = element('div', 'row')
    const score = element('span', '', String(seat.score))
    if (seat.roundScore && !live) score.prepend(element('span', 'gain', `+${seat.roundScore} `))
    row.append(element('span', '', seat.name), score)
    const bar = element('div', 'bar')
    const fill = element('i')
    fill.style.width = `${seat.progress}%`
    bar.append(fill)
    box.append(row, bar, element('div', 'note', seat.note))
    return box
  }))
}

const start = (match: Match) => {
  const duration = (match.events.at(-1)?.[0] ?? 0) + 1_500
  const scrub = $<HTMLInputElement>('scrub')
  const toggle = $('toggle')
  let t = 0
  let speed = 2
  let playing = true
  let previous = performance.now()
  let drawn = -2

  const draw = () => {
    const state = fold(match, t)
    const round = match.rounds[state.index]
    if (state.index !== drawn) {
      setupRound(round)
      drawn = state.index
    }
    if (state.over) $('round').textContent = 'Final scores'
    else if (!round) $('round').textContent = 'Get ready…'
    else $('round').replaceChildren(`Round ${state.index + 1}/${match.rounds.length} `, element('span', `tag ${round.kind}`, KINDS[round.kind]))
    $('clock').textContent = round && !state.ended ? String(Math.max(0, Math.ceil(round.seconds - (t - state.start) / 1000))) : '–'
    if (round?.kind === 'hunt') {
      [...$('code').children].forEach((line, at) => {
        line.classList.toggle('found', at === state.found && !state.ended)
        line.classList.toggle('answer', at === round.bug && state.ended)
      })
    }
    if (round?.kind === 'race') {
      const lead = Math.round(Math.max(0, ...state.seats.map(seat => seat.progress)) / 100 * round.text.length)
      $('racecode').replaceChildren(element('span', 'ok', round.text.slice(0, lead)), round.text.slice(lead))
    }
    const lines = state.over
      ? [...state.seats].sort((a, b) => b.score - a.score).map((seat, place) => `${ordinal(place)} ${seat.name} · ${seat.score} points`)
      : [...state.ticker].reverse().slice(0, 6)
    if (!state.over && state.ended && round?.kind === 'hunt') lines.unshift(`The bug was on line ${round.bug + 1}. The fix: ${round.fix.trim()}`)
    $('ticker').replaceChildren(...lines.map(text => element('li', '', text)))
    drawSeats(state.seats, state.index >= 0 && !state.ended)
    scrub.value = String(t)
    $('time').textContent = `${minutes(t)} / ${minutes(duration)}`
  }

  $('about').textContent = `${MODES[match.mode] ?? 'Game'} · ${LEVELS[match.level] ?? 'Normal'} mode${match.custom ? ` · built from ${match.custom}()` : ''} · ${new Date(match.at).toLocaleString()} · ${match.players.map(player => player.name).join(', ')}`
  scrub.max = String(duration)
  $('controls').hidden = false
  $('stage').hidden = false
  scrub.addEventListener('input', () => {
    t = Number(scrub.value)
    draw()
  })
  toggle.addEventListener('click', () => {
    const restart = t >= duration
    if (restart) t = 0
    playing = restart || !playing
    toggle.textContent = playing ? 'Pause' : 'Play'
  })
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed)
      for (const other of document.querySelectorAll('[data-speed]')) other.setAttribute('aria-pressed', String(other === button))
    })
  }
  setInterval(() => {
    const now = performance.now()
    if (playing) t = Math.min(duration, t + (now - previous) * speed)
    previous = now
    if (playing && t >= duration) {
      playing = false
      toggle.textContent = 'Watch again'
    }
    draw()
  }, 100)
}

if (match) start(match)
else $('about').textContent = 'This replay has expired. The server keeps the last 30 games, and a restart clears them.'
