import { Script, createContext, runInContext } from 'node:vm'
import { mutants } from '../shared/factory.ts'
import type { Clue, Puzzle } from '../shared/factory.ts'
import type { Snippet, Test } from './corpus.ts'

export type Stats = { functions: number, candidates: number, broken: number, equivalent: number, kept: number }

const TIMEOUT_MS = 50

export const failure = (source: string, tests: Test[]): Clue | null => {
  const context = createContext({})
  try {
    runInContext(source, context, { timeout: TIMEOUT_MS })
  } catch (error) {
    return { call: tests[0][0], expected: JSON.stringify(tests[0][1]), actual: `throws ${(error as Error).name}` }
  }
  for (const [call, value] of tests) {
    const expected = JSON.stringify(value)
    let actual: string
    try {
      actual = JSON.stringify(runInContext(`(${call})`, context, { timeout: TIMEOUT_MS })) ?? 'undefined'
    } catch (error) {
      actual = (error as { code?: string }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ? 'never finishes' : `throws ${(error as Error).name}`
    }
    if (actual !== expected) return { call, expected, actual }
  }
  return null
}

const compiles = (source: string) => {
  try {
    new Script(source)
    return true
  } catch {
    return false
  }
}

export const buildPuzzles = (corpus: Snippet[]) => {
  const stats: Stats = { functions: corpus.length, candidates: 0, broken: 0, equivalent: 0, kept: 0 }
  const puzzles: Puzzle[] = []
  for (const snippet of corpus) {
    if (failure(snippet.source, snippet.tests)) throw new Error(`${snippet.name} fails its own tests`)
    for (const { source, difficulty, ...mutant } of mutants(snippet.name, snippet.source)) {
      stats.candidates++
      if (!compiles(source)) {
        stats.broken++
        continue
      }
      const clue = failure(source, snippet.tests)
      if (!clue) {
        stats.equivalent++
        continue
      }
      stats.kept++
      puzzles.push({ ...mutant, clue, difficulty })
    }
  }
  return { stats, puzzles, snippets: corpus.map(({ name, source }) => ({ name, source })) }
}
