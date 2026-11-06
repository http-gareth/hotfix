import { sameCode } from '/shared/factory.ts'
import { $, element } from './dom.ts'
import { LESSONS, explain } from './lessons.ts'
import { sound, unlock } from './sound.ts'

type Practice = { name: string, lines: string[], bug: number, fix: string, clue: { call: string, expected: string, actual: string }, choices: string[] }

const button = (className: string, onClick: () => void, ...parts: (string | Node)[]) => {
  const node = element('button', className) as HTMLButtonElement
  node.type = 'button'
  node.append(...parts)
  node.addEventListener('click', onClick)
  return node
}
const views = ['school-list', 'lesson', 'practice', 'done'].map(id => $(id))
const view = (id: string) => {
  views.forEach(node => { node.hidden = node.id !== id })
  scrollTo(0, 0)
}

const stars = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem('hotfix-school') ?? '{}')
  } catch {
    return {}
  }
}
const saveStars = (kind: string, count: number) => {
  try {
    localStorage.setItem('hotfix-school', JSON.stringify({ ...stars(), [kind]: Math.max(count, stars()[kind] ?? 0) }))
  } catch {}
}
const starText = (count: number) => '★'.repeat(count) + '☆'.repeat(3 - count)

let lessonIndex = 0
let puzzles: Practice[] = []
let at = 0
let mistakes = 0
let clean = 0
let found = false

export const openSchool = () => {
  unlock()
  $('lessons').replaceChildren(...LESSONS.map((lesson, index) => button('lesson-card', () => openLesson(index),
    element('span', 'lesson-number', String(index + 1)), element('b', '', lesson.title), element('span', 'stars', starText(stars()[lesson.kind] ?? 0)))))
  view('school-list')
}

const openLesson = (index: number) => {
  lessonIndex = index
  const lesson = LESSONS[index]
  $('lesson-step').textContent = `Lesson ${index + 1} of ${LESSONS.length}`
  $('lesson-title').textContent = lesson.title
  $('lesson-panels').replaceChildren(...lesson.panels.map(panel => {
    const box = element('article', 'lesson-panel')
    box.append(element('p', 'caption', panel.caption))
    if (panel.code) box.append(element('pre', 'lesson-code', panel.code))
    box.append(element('p', '', panel.text))
    return box
  }))
  $('lesson-rule').textContent = lesson.rule
  $('lesson-error').textContent = ''
  view('lesson')
}

const say = (...parts: (string | Node)[]) => $('practice-say').replaceChildren(...parts)

const showPuzzle = () => {
  const puzzle = puzzles[at]
  mistakes = 0
  found = false
  $('practice-count').textContent = `Bug ${at + 1} of ${puzzles.length}`
  $('practice-test').replaceChildren(element('b', 'verdict fail', 'FAIL'), element('code', '', puzzle.clue.call), ' should give ', element('code', '', puzzle.clue.expected), ' but gives ', element('code', '', puzzle.clue.actual))
  $('practice-code').replaceChildren(...puzzle.lines.map((text, index) => button('line', () => tap(index), element('span', 'n', String(index + 1)), element('span', 't', text))))
  $('practice-choices').hidden = true
  $('practice-why').hidden = true
  $('practice-next').hidden = true
  say('Tap the line with the bug. There is no clock, so take your time.')
}

const tap = (index: number) => {
  const puzzle = puzzles[at]
  const lines = [...$('practice-code').children]
  if (found) return
  if (index !== puzzle.bug) {
    mistakes++
    sound('nope')
    lines[index].classList.add('nope')
    setTimeout(() => lines[index].classList.remove('nope'), 1_000)
    if (mistakes >= 2) {
      const start = Math.max(0, Math.min(lines.length - 3, puzzle.bug - Math.floor(Math.random() * 3)))
      lines.slice(start, start + 3).forEach(line => line.classList.add('warm'))
    }
    return say(mistakes >= 2 ? 'Not that one. The bug is somewhere in the glowing lines.' : 'Not that one. Follow the test input: which line decides the answer?')
  }
  found = true
  sound('found')
  lines[index].classList.add('found')
  $('practice-choices').hidden = false
  $('practice-choices').replaceChildren(...puzzle.choices.map((text, number) => {
    const choice = button('choice', () => choose(text, choice), element('kbd', '', String(number + 1)), element('code', '', text.trim()))
    return choice
  }))
  say('Found it! Now pick the fix that makes the test pass.')
}

const choose = (text: string, choice: HTMLButtonElement) => {
  const puzzle = puzzles[at]
  if (!sameCode(text, puzzle.fix)) {
    mistakes++
    sound('nope')
    choice.disabled = true
    choice.classList.add('wrong')
    return say('Not quite. Look at what the test expects and try another fix.')
  }
  sound('fixed')
  if (!mistakes) clean++
  const line = $('practice-code').children[puzzle.bug]
  line.classList.replace('found', 'fixed')
  line.querySelector('.t')!.textContent = puzzle.fix
  $('practice-choices').hidden = true
  $('practice-why').hidden = false
  $('practice-why').replaceChildren(element('b', 'verdict pass', 'PASS'), `Why: ${explain(puzzle.lines[puzzle.bug], puzzle.fix)}`)
  say(mistakes ? 'Fixed!' : 'Fixed on the first try!')
  $('practice-next').hidden = false
  $('practice-next').textContent = at + 1 < puzzles.length ? 'Next bug' : 'Finish the lesson'
  $('practice-next').focus()
}

const startPractice = async () => {
  const data = await fetch(`/api/lessons/${LESSONS[lessonIndex].kind}`).then(response => response.ok ? response.json() : null).catch(() => null)
  if (!data) {
    $('lesson-error').textContent = 'Could not load the practice bugs. Check your connection and try again.'
    return
  }
  puzzles = data.puzzles
  at = 0
  clean = 0
  view('practice')
  showPuzzle()
}

const finish = () => {
  const lesson = LESSONS[lessonIndex]
  saveStars(lesson.kind, clean)
  $('done-stars').textContent = starText(clean)
  $('done-text').textContent = `You fixed ${puzzles.length} real bugs, ${clean} on the first try. Remember: ${lesson.rule}`
  $('done-next').hidden = lessonIndex + 1 >= LESSONS.length
  view('done')
  sound(clean === puzzles.length ? 'win' : 'fixed')
}

$('lesson-back').addEventListener('click', openSchool)
$('practice-back').addEventListener('click', () => openLesson(lessonIndex))
$('practice-start').addEventListener('click', startPractice)
$('practice-next').addEventListener('click', () => {
  if (++at < puzzles.length) showPuzzle()
  else finish()
})
$('done-next').addEventListener('click', () => openLesson(lessonIndex + 1))
$('done-all').addEventListener('click', openSchool)
document.addEventListener('keydown', event => {
  if ($('practice').hidden || $('practice-choices').hidden || event.repeat) return
  ;($('practice-choices').children[Number(event.key) - 1] as HTMLButtonElement | undefined)?.click()
})
