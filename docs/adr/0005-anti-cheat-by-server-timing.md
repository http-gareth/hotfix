# 5. Anti-cheat by server timing

Status: accepted

## Context

In a typing race the obvious cheats are pasting the code and scripting instant keystrokes. Client-reported timings can't be trusted.

## Decision

The client sends its typed text about ten times a second, and the server times each update as it arrives:

- If more than 25 characters show up at once, that counts as a paste. It is ignored, and the third strike disqualifies the player.
- If a race finishes faster than 18 characters a second (about 215 words a minute), it is flagged as too fast to be human and scores nothing.
- Every update is stored with its server time. That timeline is the evidence, and it also feeds the ghost replays.

## Consequences

- Pasting and instant scripts are caught. Clients can't fake their speed, only slow themselves down.
- A bot that types at believable human speed still gets through. That is the honest limit of any browser game, and the reason scores aren't tied to anything valuable.
