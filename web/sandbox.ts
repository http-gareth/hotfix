const json = (value: unknown) => JSON.stringify(value) ?? 'undefined'

self.onmessage = (event: MessageEvent<{ source: string, tests: [string, string][] }>) => {
  const { source, tests } = event.data
  try {
    new Function(source)
  } catch (error) {
    return postMessage(error instanceof SyntaxError ? { broken: true } : { blocked: true })
  }
  for (const [call, wanted] of tests) {
    let expected: string
    try {
      expected = json(new Function(`return (${wanted})`)())
    } catch {
      return postMessage({ invalid: `"${wanted}" is not a value the test can expect.` })
    }
    postMessage({ running: { call, expected } })
    let actual: string
    try {
      actual = json(new Function(`${source}\nreturn (${call})`)())
    } catch (error) {
      actual = `throws ${(error as Error).name}`
    }
    if (actual !== expected) return postMessage({ clue: { call, expected, actual } })
  }
  postMessage({ clue: null })
}
