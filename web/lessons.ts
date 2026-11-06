import { change, kindOf } from '/shared/factory.ts'
import type { Kind } from '/shared/factory.ts'

export type Lesson = { kind: Kind, title: string, panels: { caption: string, code?: string, text: string }[], rule: string }

export const LESSONS: Lesson[] = [
  {
    kind: 'boolean',
    title: 'True or false?',
    panels: [
      { caption: 'The trick', text: 'The laziest move The Regression has: flip a true to a false. The code runs fine and confidently gives the wrong answer.' },
      { caption: 'Read the test first', code: 'isPrime(13)   should give true, gives false', text: 'The failing test is your map. It tells you which input breaks and what answer was expected.' },
      { caption: 'Follow one call', code: 'if (n % i === 0) return false\nreturn true', text: 'Take the input from the test and follow it line by line until it reaches a return. If that return gives the wrong answer, you found it.' }
    ],
    rule: 'Follow the failing input to the return that answers it.'
  },
  {
    kind: 'not',
    title: 'The missing !',
    panels: [
      { caption: 'The trick', text: 'An ! flips true and false. Delete it and the check means the exact opposite, and nothing crashes to warn you.' },
      { caption: 'With the !', code: 'return !text.trim()', text: "A blank '' trims to '', and !'' is true. Blank text is blank. Correct." },
      { caption: 'Without it', code: 'return text.trim()', text: "Now it hands back the text itself instead of true or false. 'hi' comes back as 'hi', and blank comes back as ''." }
    ],
    rule: 'When a yes-or-no answer is exactly backwards, look for a missing !.'
  },
  {
    kind: 'logic',
    title: 'And, or or?',
    panels: [
      { caption: 'The trick', text: 'Swap && for || and one character changes who gets in.' },
      { caption: '&& needs both', code: 'age >= 18 && registered', text: 'Age 17 and registered: false. Both sides have to be true.' },
      { caption: '|| needs either', code: 'age >= 18 || registered', text: 'Age 17 and registered: true. Suddenly every registered 17-year-old can vote.' }
    ],
    rule: '&& means both. || means either.'
  },
  {
    kind: 'equal',
    title: 'Same or different?',
    panels: [
      { caption: 'The trick', text: '=== asks "are these the same?". !== asks "are these different?". Swap them and every answer flips.' },
      { caption: 'The right check', code: "if (n % 2 === 0) return 'even'", text: '4 % 2 is 0, so 4 is even. 3 % 2 is 1, so 3 is not.' },
      { caption: 'Flipped', code: "if (n % 2 !== 0) return 'even'", text: 'Now 3 is "even" and 4 is not. When every case is backwards, that is a big clue.' }
    ],
    rule: 'If every case comes out backwards, check === and !==.'
  },
  {
    kind: 'edge',
    title: 'Off by one: < or <=',
    panels: [
      { caption: 'The trick', text: 'The most famous bug in programming hides at the edge. < leaves the edge value out. <= lets it in.' },
      { caption: 'Who gets in', code: 'return age >= 18', text: '18 >= 18 is true, so an 18-year-old counts as an adult.' },
      { caption: 'Shut out', code: 'return age > 18', text: '18 > 18 is false. Every 18-year-old is turned away, and 19 still works, so it is easy to miss.' }
    ],
    rule: 'Test the exact boundary value, not just the values near it.'
  },
  {
    kind: 'number',
    title: 'Off by one: the numbers',
    panels: [
      { caption: 'The trick', text: 'The Regression nudges a number by one: 18 becomes 19, 0 becomes 1, 100 becomes 99.' },
      { caption: 'Starting values', code: 'let total = 0', text: 'Start at 1 instead of 0 and every total comes out one too big.' },
      { caption: 'Limits', code: "if (score >= 90) return 'A'", text: 'Change 90 to 91 and a score of exactly 90 loses its A. Check every number against the test input.' }
    ],
    rule: 'Check the first value, the last value and every limit.'
  },
  {
    kind: 'math',
    title: 'Plus, minus, times, divide',
    panels: [
      { caption: 'The trick', text: 'Swap + for - or * for / and the code still runs. It just does the wrong sum.' },
      { caption: 'Work it by hand', code: 'return Math.floor(xp / 100) + 1', text: 'For 250 xp: 250 / 100 is 2.5, rounded down is 2, plus 1 is level 3.' },
      { caption: 'Spot the swap', code: 'return Math.floor(xp * 100) + 1', text: 'Now 250 xp gives level 25,001. When an answer is wildly off, look for the wrong operator.' }
    ],
    rule: 'Work one example through by hand and compare.'
  },
  {
    kind: 'count',
    title: 'Counting up or down',
    panels: [
      { caption: 'The trick', text: '++ counts up and -- counts down. += adds and -= takes away. Swap them and a loop goes the wrong way.' },
      { caption: 'The right way', code: 'for (let i = 2; i <= n; i++) result *= i', text: 'i climbs from 2 up to n, multiplying as it goes. For 5 that gives 120.' },
      { caption: 'The wrong way', code: 'for (let i = 2; i <= n; i--) result *= i', text: 'Now i shrinks forever and never passes n. The test says "never finishes", and that is your clue.' }
    ],
    rule: '"Never finishes" means a loop is counting the wrong way.'
  }
]

export const explain = (bug: string, fix: string) => {
  const { from, to } = change(bug, fix)
  const kind = kindOf(from)
  if (kind === 'boolean') return `The line said ${to} where it should say ${from}.`
  if (kind === 'not') return 'The ! was missing, so the check meant the exact opposite.'
  if (kind === 'logic') return from === '&&' ? 'It needs && so both sides must be true. The bug used ||, which lets either side through.' : 'It needs || so either side is enough. The bug used &&, which demands both.'
  if (kind === 'equal') return `It needs ${from}. The bug used ${to}, which flips every answer.`
  if (kind === 'edge') return from.endsWith('=') ? `${from} includes the edge value. The bug used ${to}, which shuts it out.` : `${from} leaves the edge value out. The bug used ${to}, which lets it in.`
  if (kind === 'number') return `The bug changed ${from} to ${to}. One number off by one changes every answer that touches it.`
  if (kind === 'math') return `The bug used ${to} instead of ${from}, so the arithmetic came out wrong.`
  if (kind === 'count') return `The bug used ${to} instead of ${from}, so it counted the wrong way.`
  return ''
}
