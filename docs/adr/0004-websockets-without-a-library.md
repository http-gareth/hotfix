# 4. A WebSocket server with no library

Status: accepted

## Context

The game needs low-latency two-way messages. Node 22 ships a WebSocket client but no server, and the project has a zero-dependency rule.

## Decision

`server/ws.ts` implements the subset of RFC 6455 the game needs: the handshake (`Sec-WebSocket-Accept`), client masking, 7/16/64-bit lengths, text, ping, pong and close frames. It refuses:

- unmasked client frames (1002),
- payloads over 16 KB (1009),
- fragmented or binary messages (1003),
- more than 40 messages a second (1008),
- upgrades from another site's origin (403).

A heartbeat ping every 25 seconds drops dead connections.

## Consequences

- No compression extension and no fragmented messages. Game messages are small JSON, so neither is needed.
- The handshake and framing are covered by tests against the RFC's own example key.
