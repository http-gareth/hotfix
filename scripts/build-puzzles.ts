import { writeFileSync } from 'node:fs'
import { CORPUS } from '../server/corpus.ts'
import { buildPuzzles } from '../server/puzzles.ts'

const built = buildPuzzles(CORPUS)
writeFileSync(new URL('../server/puzzles.json', import.meta.url), `${JSON.stringify(built, null, 1)}\n`)
console.log(built.stats)
