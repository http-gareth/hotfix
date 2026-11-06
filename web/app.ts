import { isMuted, sound, toggleMute, unlock } from './sound.ts'
import { $, element } from './dom.ts'
import { explain } from './lessons.ts'
import { openSchool } from './school.ts'
import { makeGame } from './workshop.ts'
import type { Built } from './workshop.ts'

type Player = { id: string, name: string, bot: boolean, score: number, roundScore: number, combo: number, progress: number, done: boolean, note: string, you: boolean, online: boolean }
type HuntRound = { kind: 'hunt', name: string, lines: string[], clue: { call: string, expected: string, actual: string } }
type RaceRound = { kind: 'race', name: string, text: string }
type Level = 'chill' | 'normal' | 'hardcore'
type State = {
  type: 'state', now: number, code: string, mode: string, level: Level, custom: string | null, spectator: boolean, watching: number,
  hint: number | null, state: 'lobby' | 'countdown' | 'round' | 'between' | 'over', host: boolean,
  index: number, total: number, endsAt: number, round: HuntRound | RaceRound | null, reveal: { bug: number, fix: string } | null, replay: string | null,
  next: 'hunt' | 'race' | null, ghost: { name: string, wpm: number, progress: number } | null, players: Player[], you: { found: boolean, lockedUntil: number, done: boolean, flagged: boolean }
}
type Feedback = { type: 'feedback', kind: string, until?: number, strikes?: number, line?: number, token?: string, choices?: string[] }

const KINDS = { hunt: 'HUNT!', race: 'RACE!' }
const LEVELS = { chill: 'Chill mode', normal: 'Normal mode', hardcore: 'Hardcore mode' }
const ABOUT = { hunt: 'A test is failing. Tap the broken line, fix it, hit Enter.', race: 'Type the code exactly, as fast as you can.' }
const screens = ['home', 'school', 'workshop', 'lobby', 'play', 'over'].map(id => $(id))
const nameInput = $<HTMLInputElement>('name')
const typer = $<HTMLTextAreaElement>('typer')
const invite = new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 4) ?? ''
const touch = matchMedia('(pointer: coarse)').matches

let socket: WebSocket | null = null
let last: State | null = null
let offset = 0
let shown = ''
let tapped = -1
let picked = ''
let sendTimer = 0
let sentText = ''
let typedLength = 0
let lastLeft = -1
let lastCombo = 0
let built: Built | null = null

const art = (name: string, width: number, height: number) => {
  const image = document.createElement('img')
  Object.assign(image, { src: `/web/art/${name}.svg`, alt: '', width, height })
  return image
}
const show = (id: string) => screens.forEach(screen => { screen.hidden = screen.id !== id })
const toast = (text: string) => { $('toast').textContent = text }
const burst = (word: string, bad = false) => {
  const node = element('div', `burst${bad ? ' bad' : ''}`, word)
  node.addEventListener('animationend', () => node.remove())
  document.body.append(node)
}
const ordinal = (place: number) => ['1st', '2nd', '3rd'][place] ?? `${place + 1}th`
const day = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10)

const stored = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

nameInput.value = stored('hotfix-name') ?? ''
nameInput.addEventListener('change', () => store('hotfix-name', nameInput.value))
const savedLevel = [...document.querySelectorAll<HTMLInputElement>('input[name="level"]')].find(radio => radio.value === (stored('hotfix-level') ?? (touch ? 'chill' : '')))
if (savedLevel) savedLevel.checked = true
const level = () => document.querySelector<HTMLInputElement>('input[name="level"]:checked')?.value ?? 'normal'
document.querySelector('.levels')!.addEventListener('change', () => store('hotfix-level', level()))

const streak = () => {
  try {
    const saved = JSON.parse(stored('hotfix-streak') ?? 'null') as { last: string, count: number } | null
    return saved && (saved.last === day() || saved.last === day(1)) ? saved : null
  } catch {
    return null
  }
}
const showStreak = () => {
  const saved = streak()
  $('streak').replaceChildren(...saved ? [art('flame', 18, 22), String(saved.count)] : [])
}
const countDaily = () => {
  const saved = streak()
  if (saved?.last === day()) return
  store('hotfix-streak', JSON.stringify({ last: day(), count: (saved?.count ?? 0) + 1 }))
}

const muteButton = $('mute')
const showMute = () => {
  $<HTMLImageElement>('mute-icon').src = `/web/art/${isMuted() ? 'muted' : 'sound'}.svg`
  muteButton.setAttribute('aria-pressed', String(isMuted()))
}
muteButton.addEventListener('click', () => {
  toggleMute()
  unlock()
  showMute()
})

const send = (message: object) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

const play = (join: object) => {
  unlock()
  socket?.close()
  toast('')
  shown = ''
  const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
  socket = connection
  connection.addEventListener('open', () => connection.send(JSON.stringify({ ...join, name: nameInput.value })))
  connection.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.type === 'state') render(message)
    if (message.type === 'feedback') react(message)
    if (message.type === 'error') {
      toast(message.message)
      show('home')
      connection.close()
    }
  })
  connection.addEventListener('close', () => {
    if (socket !== connection) return
    socket = null
    if (last && last.state !== 'over') toast('Lost the connection to the game. Start a new one!')
    last = null
    document.body.classList.remove('watching')
    show('home')
    loadBoards()
    showStreak()
  })
}

const drawPlayers = (state: State) => {
  $('players').replaceChildren(...[...state.players].sort((a, b) => b.score - a.score).map(player => {
    const box = element('div', `player${player.you ? ' me' : ''}${player.done ? ' done' : ''}${player.online ? '' : ' offline'}`)
    const row = element('div', 'row')
    const score = element('span', '', String(player.score))
    if (player.roundScore && state.state !== 'round') score.prepend(element('span', 'gain', `+${player.roundScore} `))
    const who = element('span', 'who', player.you ? `${player.name} (you)` : player.name)
    if (player.combo >= 2) who.append(art('flame', 15, 19), String(player.combo))
    row.append(who, score)
    const bar = element('div', 'bar')
    const fill = element('i')
    fill.style.width = `${player.progress}%`
    bar.append(fill)
    box.append(row, bar, element('div', 'note', player.note))
    return box
  }))
}

const overlay = (word: string, text: string) => {
  $('overlay').hidden = false
  $('overlay-word').textContent = word
  $('overlay-text').textContent = text
}

const setupHunt = (round: HuntRound, spectator: boolean) => {
  $('hunt').hidden = false
  $('race').hidden = true
  tapped = -1
  picked = ''
  $('choices').hidden = true
  const test = $('test')
  test.replaceChildren(element('b', 'verdict fail', 'FAIL'), element('code', '', round.clue.call), ' should give ', element('code', '', round.clue.expected), ' but gives ', element('code', '', round.clue.actual))
  $('say').textContent = spectator ? 'Watching live. Can you spot the bug before they do?' : 'Tap the line with the bug. Every bug is one small change.'
  $('code').replaceChildren(...round.lines.map((text, index) => {
    const line = element('button', 'line') as HTMLButtonElement
    line.type = 'button'
    line.append(element('span', 'n', String(index + 1)), element('span', 't', text))
    line.addEventListener('click', () => {
      if (last?.state !== 'round' || last.you.found || last.you.done || Date.now() + offset < last.you.lockedUntil) return
      tapped = index
      send({ type: 'tap', line: index })
    })
    return line
  }))
}

const showChoices = (options: string[]) => {
  $('code').children[tapped]?.classList.add('found')
  const box = $('choices')
  box.hidden = false
  box.replaceChildren(...options.map((text, index) => {
    const choice = element('button', 'choice') as HTMLButtonElement
    choice.type = 'button'
    choice.append(element('kbd', '', String(index + 1)), element('code', '', text.trim()))
    choice.addEventListener('click', () => {
      if (choice.disabled) return
      picked = text
      box.querySelector('.picked')?.classList.remove('picked')
      choice.classList.add('picked')
      send({ type: 'fix', text })
    })
    return choice
  }))
  $('say').textContent = touch ? 'Found it! Now tap the fix that makes the test pass.' : `Found it! Now pick the fix that makes the test pass. Click it or press ${options.length > 1 ? `1 to ${options.length}` : '1'}.`
}

document.addEventListener('keydown', event => {
  const choice = $('choices').hidden || event.repeat ? undefined : $('choices').children[Number(event.key) - 1] as HTMLButtonElement | undefined
  choice?.click()
})

const paint = (text: string) => {
  const typed = typer.value
  const box = $('racecode')
  box.replaceChildren()
  let correct = 0
  while (correct < typed.length && typed[correct] === text[correct]) correct++
  box.append(element('span', 'ok', text.slice(0, correct)))
  const wrong = Math.min(typed.length, text.length) - correct
  if (wrong > 0) box.append(element('span', 'bad', text.slice(correct, correct + wrong).replace(/\n/g, '↵\n')))
  const at = correct + Math.max(0, wrong)
  if (at < text.length) box.append(element('span', 'cur', text[at] === '\n' ? '↵\n' : text[at]), text.slice(at + 1))
  const cursor = box.querySelector<HTMLElement>('.cur')
  if (cursor && box.scrollHeight > box.clientHeight) box.scrollTop = cursor.offsetTop - box.clientHeight / 2
}

const setupKeys = (text: string) => {
  $('keys').replaceChildren(...[...new Set(text.replace(/[\w\s]/g, ''))].map(char => {
    const key = element('button', '', char) as HTMLButtonElement
    key.type = 'button'
    key.addEventListener('pointerdown', event => {
      event.preventDefault()
      if (typer.disabled) return
      typer.focus()
      typer.setRangeText(char, typer.selectionStart, typer.selectionEnd, 'end')
      typer.dispatchEvent(new Event('input'))
    })
    return key
  }))
}

const flush = () => {
  sendTimer = 0
  if (typer.value === sentText) return
  sentText = typer.value
  send({ type: 'typed', text: typer.value })
}

const setupRace = (round: RaceRound, spectator: boolean) => {
  $('hunt').hidden = true
  $('race').hidden = false
  typer.value = ''
  sentText = ''
  typedLength = 0
  typer.disabled = spectator
  $('race-say').textContent = spectator ? 'Watching the race live.' : 'Type it exactly. Enter jumps to the next line and skips the indent for you.'
  paint(round.text)
  $('keys').hidden = spectator || !touch
  if (!$('keys').hidden) setupKeys(round.text)
  if (!spectator) setTimeout(() => typer.focus(), 30)
}

typer.addEventListener('input', () => {
  const round = last?.round
  if (round?.kind !== 'race') return
  paint(round.text)
  if (typer.value.length > typedLength) sound(round.text.startsWith(typer.value) ? 'key' : 'miss')
  typedLength = typer.value.length
  if (typer.value === round.text) return flush()
  sendTimer ||= window.setTimeout(flush, 100)
})
typer.addEventListener('keydown', event => {
  const round = last?.round
  if (event.key !== 'Enter' || round?.kind !== 'race') return
  event.preventDefault()
  let insert = '\n'
  for (let at = typer.value.length + 1; round.text[typer.value.length] === '\n' && round.text[at] === ' '; at++) insert += ' '
  typer.setRangeText(insert, typer.selectionStart, typer.selectionEnd, 'end')
  typer.dispatchEvent(new Event('input'))
})
typer.addEventListener('paste', event => {
  event.preventDefault()
  burst('NO PASTING!', true)
  sound('nope')
})

const showHint = (state: State) => {
  const lines = [...$('code').children].slice(state.hint!, state.hint! + 3)
  if (lines.some(line => line.classList.contains('warm'))) return
  lines.forEach(line => line.classList.add('warm'))
  if (!state.you.found) $('say').textContent = 'Hint: the bug is somewhere in the glowing lines.'
}

const showReveal = (state: State) => {
  const round = state.round
  $('choices').hidden = true
  if (round?.kind === 'hunt' && state.reveal) {
    const line = $('code').children[state.reveal.bug] as HTMLElement | undefined
    if (line && !line.classList.contains('fixed')) line.classList.add('answer')
    const note = element('div', 'reveal')
    const why = explain(round.lines[state.reveal.bug], state.reveal.fix)
    note.append(`The bug was on line ${state.reveal.bug + 1}. The fix: `, element('code', '', state.reveal.fix.trim()), why ? ` Why: ${why}` : '')
    $('say').replaceChildren(note)
  }
  if (round?.kind === 'race') typer.disabled = true
  const me = state.players.find(player => player.you)
  if (round?.kind === 'race' && me?.note) $('race-say').textContent = me.note
  if (me && me.combo >= 2 && me.combo > lastCombo) {
    burst(`${me.combo} IN A ROW!`)
    sound('combo')
  }
  lastCombo = me?.combo ?? 0
}

const showOver = (state: State) => {
  show('over')
  const ranked = [...state.players].sort((a, b) => b.score - a.score)
  const place = ranked.findIndex(player => player.you)
  $('final-word').textContent = state.spectator ? 'GAME OVER!' : place === 0 ? 'YOU WIN!' : place === 1 ? 'SO CLOSE!' : 'REMATCH?'
  $('standings').replaceChildren(...ranked.map((player, index) => {
    const row = element('li')
    row.append(element('span', '', `${ordinal(index)} ${player.name}`), element('span', '', String(player.score)))
    return row
  }))
  $('again').hidden = !state.host
  $('again-wait').hidden = state.host
  const link = $<HTMLAnchorElement>('replay-link')
  link.hidden = !state.replay
  link.href = `/web/replay.html?id=${state.replay}`
  sound(place === 0 ? 'win' : 'over')
  if (state.mode === 'daily' && !state.spectator) countDaily()
}

const render = (state: State) => {
  last = state
  offset = state.now - Date.now()
  document.body.classList.toggle('watching', state.spectator)
  if (state.state === 'lobby') {
    show('lobby')
    $('room-code').textContent = state.code
    $('lobby-level').textContent = `${LEVELS[state.level]}${state.custom ? ` · built from ${state.custom}()` : ''}`
    $<HTMLInputElement>('share-link').value = `${location.origin}/?room=${state.code}`
    $('roster').replaceChildren(...state.players.map(player => element('li', '', `${player.name}${player.you ? ' (you)' : ''}${state.host && player.you ? ' · host' : ''}`)))
    $('start').hidden = !state.host
    $('waiting').hidden = state.host
    $('waiting').textContent = state.spectator ? 'You are watching. Waiting for the host to start…' : 'Waiting for the host to start…'
    return
  }
  if (state.state === 'over') {
    if (shown === 'over') return
    shown = 'over'
    return showOver(state)
  }
  show('play')
  drawPlayers(state)
  if (state.hint !== null) showHint(state)
  $('watchers').replaceChildren(...state.spectator || state.watching ? [art('eye', 26, 17), state.spectator ? 'Watching' : `${state.watching} watching`] : [])
  $('ghost').hidden = !state.ghost
  if (state.ghost) {
    $('ghost-name').textContent = `Best ever: ${state.ghost.name} · ${state.ghost.wpm} wpm`
    $('ghost-bar').style.width = `${state.ghost.progress}%`
  }
  $('round').replaceChildren(`Round ${Math.max(1, state.index + 1 + Number(state.state === 'countdown'))}/${state.total} `)
  const kind = state.round?.kind ?? state.next
  if (kind) $('round').append(element('span', `tag ${kind}`, KINDS[kind]))
  const key = `${state.state}:${state.index}`
  if (key === shown) return
  shown = key
  if (state.state === 'countdown') {
    lastCombo = 0
    $('hunt').hidden = true
    $('race').hidden = true
    return overlay(`Round 1: ${KINDS[state.next!]}`, ABOUT[state.next!])
  }
  if (state.state === 'round' && state.round) {
    $('overlay').hidden = true
    sound('go')
    if (state.round.kind === 'hunt') setupHunt(state.round, state.spectator)
    else setupRace(state.round, state.spectator)
    return
  }
  if (state.state === 'between') {
    showReveal(state)
    window.setTimeout(() => {
      if (last?.state === 'between' && last.index === state.index && state.next) overlay(`Next: ${KINDS[state.next]}`, ABOUT[state.next])
    }, 3_500)
  }
}

const react = (feedback: Feedback) => {
  if (feedback.line !== undefined) tapped = feedback.line
  const line = $('code').children[tapped] as HTMLElement | undefined
  if (feedback.kind === 'found') {
    burst('FOUND IT!')
    sound('found')
    showChoices(feedback.choices ?? [])
  }
  if (feedback.kind === 'nope') {
    burst('NOPE!', true)
    sound('nope')
    line?.classList.add('nope')
    $('say').textContent = 'Not that one! Frozen for 2 seconds.'
    window.setTimeout(() => {
      line?.classList.remove('nope')
      if (last?.state === 'round' && !last.you.found) $('say').textContent = 'Tap the line with the bug. Every bug is one small change.'
    }, Math.max(0, (feedback.until ?? 0) - Date.now() - offset))
  }
  if (feedback.kind === 'wrong-fix') {
    burst('STILL BROKEN!', true)
    sound('nope')
    const choices = [...$('choices').querySelectorAll<HTMLButtonElement>('.choice')]
    for (const choice of choices) choice.disabled = true
    $('choices').querySelector('.picked')?.classList.replace('picked', 'wrong')
    window.setTimeout(() => choices.forEach(choice => { choice.disabled = choice.classList.contains('wrong') }), Math.max(0, (feedback.until ?? 0) - Date.now() - offset))
    $('say').replaceChildren('The test still fails. It is one small change. ', ...feedback.token ? ['Hint: look closely around ', element('code', '', feedback.token)] : ['Look again!'])
  }
  if (feedback.kind === 'fixed') {
    burst('FIXED!')
    sound('fixed')
    line?.classList.replace('found', 'fixed')
    if (line && picked) line.querySelector('.t')!.textContent = picked
    $('choices').hidden = true
    $('say').replaceChildren(element('b', 'verdict pass', 'PASS'), 'Test passing!')
  }
  if (feedback.kind === 'paste') {
    burst(`NO PASTING! ${feedback.strikes}/3`, true)
    sound('nope')
  }
  if (feedback.kind === 'finished') {
    burst('DONE!')
    sound('fixed')
    typer.disabled = true
  }
  if (feedback.kind === 'flagged') {
    burst('TOO FAST?!', true)
    sound('nope')
  }
}

const tickClock = () => {
  const clock = $('clock')
  if (last && (last.state === 'round' || last.state === 'countdown' || last.state === 'between')) {
    const left = Math.max(0, Math.ceil((last.endsAt - Date.now() - offset) / 1000))
    clock.textContent = String(left)
    clock.classList.toggle('hurry', last.state === 'round' && left <= 5)
    if (left !== lastLeft && left > 0 && left <= (last.state === 'round' ? 5 : 3)) sound('tick')
    lastLeft = left
  }
  requestAnimationFrame(tickClock)
}
requestAnimationFrame(tickClock)

const board = (id: string, rows: string[][], empty: string) => {
  $(id).replaceChildren(...rows.length ? rows.map(([left, right]) => {
    const row = element('li')
    row.append(element('span', '', left), element('span', '', right))
    return row
  }) : [element('li', 'empty', empty)])
}

const loadBoards = async () => {
  const boards = await fetch('/api/boards').then(response => response.json()).catch(() => null)
  if (!boards) return
  board('daily-board', boards.daily.slice(0, 5).map((entry: { name: string, score: number }, index: number) => [`${index + 1}. ${entry.name}`, String(entry.score)]), 'Nobody yet today. Be first!')
  board('fast-board', boards.fastest.slice(0, 5).map((entry: { name: string, wpm: number, snippet: string }) => [`${entry.name} · ${entry.snippet}()`, `${entry.wpm} wpm`]), 'No races finished yet.')
}

const runWorkshop = async () => {
  const button = $<HTMLButtonElement>('byo-run')
  const status = $('byo-status')
  button.disabled = true
  $('byo-play').hidden = true
  status.textContent = 'Running your tests…'
  const result = await makeGame($<HTMLTextAreaElement>('byo-code').value, $<HTMLTextAreaElement>('byo-tests').value, (done, total) => {
    status.textContent = `Planting bugs and running your tests against each one… ${done}/${total}`
  })
  button.disabled = false
  if (typeof result === 'string') {
    status.textContent = result
    return
  }
  built = result
  status.textContent = result.caught
    ? `Planted ${result.tried} bugs. ${result.equivalent} changed nothing and ${result.broken} broke the code, so they were thrown out. ${result.caught} made the cut!`
    : `Planted ${result.tried} bugs, but your tests didn't catch any of them. Add more tests and try again!`
  $('byo-play').hidden = !result.caught
}

const playBuilt = (mode: string) => {
  if (built) play({ type: 'join', mode, level: level(), custom: { source: built.source, puzzles: built.puzzles } })
}

const codeInput = () => $<HTMLInputElement>('join-code').value.trim().toUpperCase()

$('solo').addEventListener('click', () => play({ type: 'join', mode: 'solo', level: level() }))
$('daily').addEventListener('click', () => play({ type: 'join', mode: 'daily' }))
$('party').addEventListener('click', () => play({ type: 'join', mode: 'party', level: level() }))
$('make').addEventListener('click', () => show('workshop'))
$('learn').addEventListener('click', () => {
  show('school')
  openSchool()
})
$('school-home').addEventListener('click', () => show('home'))
$('byo-back').addEventListener('click', () => show('home'))
$('byo-run').addEventListener('click', runWorkshop)
$('byo-solo').addEventListener('click', () => playBuilt('solo'))
$('byo-party').addEventListener('click', () => playBuilt('party'))
$('accept').addEventListener('click', () => play({ type: 'join', room: invite }))
$('accept-watch').addEventListener('click', () => play({ type: 'join', room: invite, watch: true }))
$('join-form').addEventListener('submit', event => {
  event.preventDefault()
  if (codeInput().length === 4) play({ type: 'join', room: codeInput() })
  else toast('Game codes are 4 letters.')
})
$('watch').addEventListener('click', () => {
  if (codeInput().length === 4) play({ type: 'join', room: codeInput(), watch: true })
  else toast('Type the 4-letter code of the game you want to watch.')
})
$('start').addEventListener('click', () => send({ type: 'start' }))
$('again').addEventListener('click', () => {
  shown = ''
  send({ type: 'again' })
})
$('leave').addEventListener('click', () => socket?.close())
$('copy').addEventListener('click', async () => {
  const link = $<HTMLInputElement>('share-link')
  try {
    await navigator.clipboard.writeText(link.value)
    $('copy').textContent = 'Copied!'
  } catch {
    link.select()
  }
})

if (invite) {
  $('invite').hidden = false
  $('invite-code').textContent = invite
}
$('issue').textContent = String(Math.floor((Date.parse(day()) - Date.parse('2026-11-01')) / 86_400_000) + 1)
$('dateline').textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
showMute()
showStreak()
show('home')
loadBoards()
