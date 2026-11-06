# 3. Puzzles come from mutation testing

Status: accepted

## Context

Hand-writing bug puzzles doesn't scale and tends to produce bugs that are either obvious or unfair. Some "bugs" don't even change behaviour, which makes a puzzle unsolvable.

## Decision

A bug factory (`server/puzzles.ts`) works like a mutation-testing tool. For each function in the corpus it tokenizes every line and tries one swap at a time: comparisons (`<` and `<=`), equality, logic (`&&` and `||`), dropping a `!`, `true` and `false`, arithmetic, and nudging small numbers by one. Each mutant must compile, then runs against the function's tests in a fresh `vm` context with a 50 ms timeout:

- all tests pass: an equivalent mutant, thrown away;
- a test fails: kept, and the failing call becomes the clue;
- a test never returns: kept, with the clue "never finishes".

## Consequences

- Every puzzle provably has exactly one changed line, fails a real test, and its fix passes them all (checked by `test/puzzles.test.ts`).
- The factory runs at build time (`npm run puzzles`) and writes `server/puzzles.json`, so the free server starts instantly. A test fails if the saved file drifts from the corpus.
- The corpus is our own trusted code, which is why running it in `vm` is acceptable here (see ADR 2 for player input).
