# 6. One instance, state in memory

Status: accepted

## Context

The game runs on a free hosting plan: one small process that sleeps when idle and loses its disk on restart.

## Decision

Rooms, event logs and leaderboards live in memory in a single process. Rooms clean themselves up 30 seconds after their last player leaves. The server is capped at 300 rooms and 8 players per room.

## Consequences

- Restarts reset leaderboards and ghosts. That's acceptable for a portfolio game and stated on the site.
- To scale out:
  - route each room code to one instance with sticky routing (a hash of the room code), so a room's state never has to be shared;
  - keep leaderboards and ghosts in a shared store;
  - persist the per-room event logs so a crashed room can be rebuilt by replaying them.

  The rest of the design doesn't change.
