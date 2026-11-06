# 2. Player code never runs on the server

Status: accepted

## Context

The obvious way to check a fix is to run the function's tests with the player's line in it. That means executing text typed by strangers. Node's `vm` module is not a security boundary, so a crafted "fix" could reach `process` and take over the server.

## Decision

A fix is accepted when it matches the original line token for token, ignoring whitespace and quote style (`sameCode` in `server/puzzles.ts`). Nothing a player sends is ever evaluated.

## Consequences

- Remote code execution through the game is impossible by construction.
- A different-but-correct fix (for example `i < n` written as `n > i`) is rejected. Every planted bug is a single small change, and the game tells players so.
