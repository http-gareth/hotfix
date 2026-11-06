# 7. Replays come from the event log

Status: accepted

## Context

Players want to watch a finished game again and share it. The server already records every input with server time, because it is the referee (ADR 1) and the anti-cheat needs timings (ADR 5).

## Decision

When a match ends, the server saves its rounds and its event log under a random 10-character ID and serves them at `/api/replays/<id>`. The replay page folds the events up to the chosen moment to rebuild the scores, progress bars and a ticker. Nothing is recorded as video and nothing is computed differently from the live game.

Typing events are only logged when a player's correct character count changes, so a race costs at most one event per character.

## Consequences

- A replay is proof of how every score was decided, because it uses the same events.
- Bots do not send keystrokes, so their race progress is drawn as a straight line to their recorded finish time.
- The last 30 replays are kept in memory and a restart clears them (ADR 6). Persisting them is a matter of writing the same JSON to a store.
