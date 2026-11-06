import { functionName, mutants } from '/shared/factory.ts'
import type { Clue } from '/shared/factory.ts'

type Outcome = { broken?: boolean, blocked?: boolean, invalid?: string, clue?: Clue | null }
export type Built = { source: string, tried: number, broken: number, equivalent: number, caught: number, puzzles: { id: string, clue: Clue }[] }

const TIMEOUT_MS = 1_000
const MAX_MUTANTS = 120
const MAX_PUZZLES = 24
const CLUE_CHARS = 100

const run = (source: string, tests: [string, string][]) => new Promise<Outcome>(resolve => {
  const worker = new Worker('/web/sandbox.ts')
  let running: Omit<Clue, 'actual'> | undefined
  const done = (outcome: Outcome) => {
    clearTimeout(timer)
    worker.terminate()
    resolve(outcome)
  }
  const timer = setTimeout(() => done(running ? { clue: { ...running, actual: 'never finishes' } } : { broken: true }), TIMEOUT_MS)
  worker.onmessage = ({ data }) => {
    if (data.running) running = data.running
    else done(data)
  }
  worker.onerror = () => done({ blocked: true })
  worker.postMessage({ source, tests })
})

const parseTests = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean)
  .map(line => line.match(/^(.*[^=\s])\s*={2,3}\s*(.+)$/)?.slice(1, 3) as [string, string] | undefined)

export const makeGame = async (code: string, testText: string, progress: (done: number, total: number) => void): Promise<Built | string> => {
  const source = code.replace(/\r/g, '').replace(/\t/g, '  ').replace(/[ ]+$/gm, '').trim()
  const lines = source.split('\n')
  if (!source) return 'Paste a function first.'
  if (source.length > 1_500 || lines.length > 40 || lines.some(line => line.length > 120)) return 'Keep it under 40 lines, each under 120 characters.'
  const tests = parseTests(testText)
  if (!tests.length || tests.some(test => !test)) return 'Write each test as: call == expected. For example: add(1, 2) == 3'
  const original = await run(source, tests as [string, string][])
  if (original.blocked) return 'This browser blocked the code sandbox, so Make your own can not run here. Try Chrome, Edge or Firefox.'
  if (original.broken) return 'That code does not run. Check it and try again.'
  if (original.invalid) return original.invalid
  if (original.clue) return `Your function fails its own test: ${original.clue.call} gives ${original.clue.actual}, not ${original.clue.expected}.`
  const candidates = mutants(functionName(source), source).slice(0, MAX_MUTANTS)
  const outcomes: Outcome[] = []
  for (let at = 0; at < candidates.length; at += 4) {
    outcomes.push(...await Promise.all(candidates.slice(at, at + 4).map(candidate => run(candidate.source, tests as [string, string][]))))
    progress(outcomes.length, candidates.length)
  }
  const caught = candidates.flatMap((candidate, at) => {
    const clue = outcomes[at].clue
    return clue && Object.values(clue).every(part => part.length <= CLUE_CHARS) ? [{ id: candidate.id, clue }] : []
  })
  return {
    source, tried: candidates.length, caught: caught.length,
    broken: outcomes.filter(outcome => outcome.broken).length,
    equivalent: outcomes.filter(outcome => outcome.clue === null).length,
    puzzles: caught.sort(() => Math.random() - 0.5).slice(0, MAX_PUZZLES)
  }
}
