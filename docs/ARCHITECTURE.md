# Tingle — Architecture

## Data flow

```
Browser / Android
      │
      ▼
   Nginx (TLS, reverse proxy)
      │
   ┌──┴──────────────┐
   ▼                  ▼
 Web app          API service ── WebSocket signaling (never carries media)
 (React)          (Fastify)         │
                       │            ▼
                       ▼        STUN (public, free)
                  PostgreSQL         │
                  (durable data)     ▼
                       │        Direct WebRTC P2P (preferred)
                       ▼             │
                    Redis            ▼ (fallback only)
              (queues, presence,  coturn (self-hosted TURN)
               rate limits)
```

Signaling carries only offer/answer/ICE-candidate JSON messages — audio and
video always flow over WebRTC directly between peers, or through coturn as a
last-resort relay. The backend never has access to call media.

## Service boundaries

- **api** (`services/api`) — REST endpoints: auth, profile, preferences,
  blocks, reports, account/data export, admin-facing moderation endpoints.
  Also hosts the WebSocket upgrade path for signaling in this scaffold;
  can be split into `services/signaling` as a separate process once load
  warrants it (the folder already exists for that split).
- **matchmaking** (`services/matchmaking`) — Redis-backed queue and pairing
  logic. Runs the atomic "lock both users, create match, remove from queue"
  operation described in the spec to avoid double-matching race conditions.
- **signaling** (`services/signaling`) — WebRTC offer/answer/ICE relay over
  WebSocket, scoped strictly to an authorized match's two participants.

## Security invariants (enforced server-side, not just in the client)

- Age eligibility (`age_verified`) is checked on every matchmaking request,
  not just at signup.
- `matchId` / `callSessionId` are always server-generated UUIDs — clients
  never choose or guess them, and every signaling message is validated
  against the authenticated user's actual match membership.
- Blocks are enforced in the matchmaking query itself, not just in the UI.
- No endpoint returns another user's private fields (email, ip_hash,
  password_hash, etc.) — the `User` type in `packages/types` intentionally
  excludes these from anything sent to clients.

Try it end to end: open the app at `http://localhost:8080` (through
Nginx — the app talks to `/api` and `/ws`, which only Nginx proxies
correctly), sign up two accounts in two browser windows (or one normal +
one incognito), verify each via the link logged to the API container's
console (`docker compose logs -f api`), log in, and pick Video Tingle or
Voice Tingle from both — they'll match each other.

## What still needs to be built

1. End-to-end UI tests for the web/admin frontends (e.g. Playwright)
2. Automated tests for the Android app (instrumented Compose/Espresso
   tests, and a WebRTC integration test against a live signaling server)
3. Multi-instance signaling: the in-memory connection/match-participant
   maps in `ws/signaling.ts` work for one process; scaling past that needs
   Redis pub/sub so any instance can reach any user's socket (flagged
   in that file's comments, not yet solved there)
