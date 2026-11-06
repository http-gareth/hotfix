import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CORPUS } from '../server/corpus.ts'
import { sameCode, tokenize } from '../shared/factory.ts'
import { buildPuzzles, failure } from '../server/puzzles.ts'

const built = buildPuzzles(CORPUS)
const tests = (name: string) => CORPUS.find(snippet => snippet.name === name)!.tests

test('the tokenizer keeps every character and reads operators whole', () => {
  const line = "  if (letters[i] !== 'a b' && n <= 10) count++"
  assert.equal(tokenize(line).join(''), line)
  assert.ok(tokenize(line).includes('!=='))
  assert.ok(tokenize(line).includes("'a b'"))
  assert.ok(tokenize(line).includes('<='))
})

test('the tokenizer stays fast on hostile strings', () => {
  const started = performance.now()
  tokenize(`"${'\\'.repeat(40)}`)
  assert.ok(performance.now() - started < 100)
})

test('fixes are compared as code, not as text', () => {
  assert.ok(sameCode('  for (let i = 0; i < n; i++) {', 'for(let i=0;i<n;i++){'))
  assert.ok(sameCode("return 'Fizz'", 'return "Fizz"'))
  assert.ok(!sameCode('i < n', 'i <= n'))
})

test('every puzzle has exactly one changed line, fails its tests, and its fix passes them', () => {
  for (const puzzle of built.puzzles) {
    const original = CORPUS.find(snippet => snippet.name === puzzle.name)!.source.split('\n')
    const changed = puzzle.lines.flatMap((line, index) => line === original[index] ? [] : [index])
    assert.deepEqual(changed, [puzzle.bug], puzzle.id)
    assert.ok(failure(puzzle.lines.join('\n'), tests(puzzle.name)), puzzle.id)
    const fixed = puzzle.lines.map((line, index) => index === puzzle.bug ? puzzle.fix : line).join('\n')
    assert.equal(failure(fixed, tests(puzzle.name)), null, puzzle.id)
  }
})

test('bugs that change nothing are thrown out, and endless loops become clues', () => {
  assert.ok(built.stats.equivalent > 0)
  assert.equal(built.stats.kept, built.puzzles.length)
  assert.ok(built.puzzles.some(puzzle => puzzle.clue.actual === 'never finishes'))
})

test('the saved puzzle file matches the corpus', () => {
  const saved = JSON.parse(readFileSync(new URL('../server/puzzles.json', import.meta.url), 'utf8'))
  assert.deepEqual(saved, JSON.parse(JSON.stringify(built)), 'run npm run puzzles')
})
