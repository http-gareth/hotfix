# 1. The server is the referee

Status: accepted

## Context

HOTFIX! is competitive and has leaderboards. Anything a browser decides, a player can change with the developer tools: their score, their finishing time, or a peek at the answer.

## Decision

The server owns all game state. Clients send only inputs (`tap`, `fix`, `typed`) and receive a per-player view ten times a second. The server runs the clock, checks every answer, ranks finishers by server-side finish time and awards every point. A hunt's buggy line and its fix are never sent to a client until the round is over.

## Consequences

- A modified client can't score points it didn't earn or see an answer early.
- Every action costs a network round trip. At ten updates a second this is invisible for a game paced in seconds.
- The client stays thin: it renders state and plays effects, which also makes it easy to replace.
