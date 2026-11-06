# 8. Custom code runs in your browser, never on the server

Status: accepted

## Context

"Make your own" turns a player's function and tests into puzzles. Building puzzles means running mutated code against the tests, and ADR 2 says the server never runs player code.

## Decision

The browser runs the bug factory. The mutation step lives in `shared/factory.ts`, pure string code that the server and the browser both load. Each mutant is tested in a fresh Web Worker that is terminated after one second, which turns endless loops into "never finishes" clues.

Only `/web/sandbox.ts` is served with `'unsafe-eval'` in its Content Security Policy. Every other page keeps `script-src 'self'`.

The browser sends the server the source text plus a puzzle ID and clue for each bug it kept. The server re-plants every bug from the source text itself, keeps only IDs it can rebuild exactly, and caps sizes (1,500 characters, 40 lines, 24 puzzles, 100-character clues).

## Consequences

- The server never evaluates a player's code. The worst a forged request can do is put a misleading clue in the creator's own room.
- The bug and the fix a player sees always come from the server's own rebuild, never from the request.
- A test that passes in one browser and fails in another would produce different puzzles. The game accepts that for player-made content.
