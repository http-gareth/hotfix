export type Clue = { call: string, expected: string, actual: string }
export type Puzzle = { id: string, name: string, lines: string[], bug: number, fix: string, clue: Clue, difficulty: number }
export type Mutant = Omit<Puzzle, 'clue'> & { source: string }

const PUNCTUATORS = [
  '===', '!==', '...', '=>', '<=', '>=', '==', '!=', '&&', '||', '??', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '<', '>', '+', '-', '*', '/', '%', '!', '=', '(', ')', '[', ']', '{', '}', ',', ';', '.', '?', ':'
]
const SWAPS: Record<string, [string, number]> = {
  '&&': ['||', 1], '||': ['&&', 1], '!': ['', 1], 'true': ['false', 1], 'false': ['true', 1],
  '<': ['<=', 2], '<=': ['<', 2], '>': ['>=', 2], '>=': ['>', 2], '===': ['!==', 2], '!==': ['===', 2],
  '+': ['-', 3], '-': ['+', 3], '*': ['/', 3], '/': ['*', 3], '++': ['--', 3], '--': ['++', 3], '+=': ['-=', 3], '-=': ['+=', 3]
}

export const tokenize = (line: string) => {
  const tokens: string[] = []
  for (let at = 0; at < line.length;) {
    const rest = line.slice(at)
    const token = (rest.match(/^\s+/) ?? rest.match(/^(['"`])(?:\\.|(?!\1)[^\\])*\1/) ?? rest.match(/^[A-Za-z_$][\w$]*/) ?? rest.match(/^\d+(?:\.\d+)?/))?.[0]
      ?? PUNCTUATORS.find(punctuator => rest.startsWith(punctuator)) ?? rest[0]
    tokens.push(token)
    at += token.length
  }
  return tokens
}

const meaning = (token: string) => /^['"`]/.test(token) ? `"${token.slice(1, -1)}"` : token

export const sameCode = (a: string, b: string) => {
  const words = (line: string) => tokenize(line).filter(token => token.trim()).map(meaning).join(' ')
  return words(a) === words(b)
}

const swaps = (token: string): [string, number][] => {
  if (SWAPS[token]) return [SWAPS[token]]
  if (/^\d+$/.test(token) && Number(token) <= 1000) return [[String(Number(token) + 1), 3], ...Number(token) > 0 ? [[String(Number(token) - 1), 3] as [string, number]] : []]
  return []
}

export const functionName = (source: string) => source.match(/function\s+([A-Za-z_$][\w$]*)/)?.[1] ?? 'yourCode'

export const mutants = (name: string, source: string): Mutant[] => {
  const lines = source.split('\n')
  return lines.flatMap((line, row) => {
    if (row === 0 || !line.trim().replace(/[{}()\s]/g, '')) return []
    const tokens = tokenize(line)
    return tokens.flatMap((token, column) => swaps(token).map(([replacement, difficulty]) => {
      const changed = lines.map((original, index) => index === row ? [...tokens.slice(0, column), replacement, ...tokens.slice(column + 1)].join('') : original)
      return { id: `${name}:${row}:${column}:${replacement || 'drop'}`, name, lines: changed, bug: row, fix: line, difficulty, source: changed.join('\n') }
    }))
  })
}
