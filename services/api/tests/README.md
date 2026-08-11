# API test suite

Integration tests against a real Postgres + Redis (no mocking of the
database layer) — they exercise the actual Fastify routes via
`app.inject()`, which runs the same validation, middleware, and SQL as
production, just without binding a real port.

## Running

```bash
# from the repo root — start the dependencies the tests need
docker compose up -d postgres redis

# from services/api
npm install
npm test
```

`docker compose up` also brings up the `api` container itself, which is
fine to leave running — the tests use their own Fastify instance
in-process via `buildApp()`, so there's no port conflict.

Alternatively, run inside the existing api container:

```bash
docker compose exec api npm test
```

## What's covered

- **`auth.test.ts`** — signup's server-side 18+ enforcement, required
  legal agreements, duplicate email handling, generic (non-enumerating)
  login and password-reset errors, `/auth/me` never leaking `email` or
  `password_hash`.
- **`authorization.test.ts`** — the spec section 65–66 requirement that
  User A can never act as, or reach data belonging to, User B: blocks and
  reports are always attributed to the token holder regardless of
  payload content, a refresh token can't be revoked by someone who isn't
  its owner, admin endpoints reject both user tokens and missing tokens,
  and admin role gating is enforced (`support` can't act on reports;
  `safety_moderator` can).
- **`matchmaking.test.ts`** — block-aware pairing (a blocked pair never
  matches, but the blocked user is still reachable by someone else),
  ineligible candidates (e.g. banned after queueing) are dropped rather
  than matched, and — the concurrency property spec section 43 calls
  out — two simultaneous match attempts for the same waiting user never
  both succeed.
- **`safety.test.ts`** — a `possible_minor` report immediately restricts
  the reported account and logs the action; the appeals lifecycle
  (submit → single pending appeal enforced → admin decision reinstates
  the account); blocking is idempotent.
- **`rateLimit.test.ts`** — the rate limiter itself: allows up to the
  limit, blocks past it, and windows are independent per key.
- **`signaling.test.ts`** — real WebSocket clients against a live port
  (not `app.inject()`, which can't drive a WS upgrade): offer/answer/ICE
  are relayed only to the actual match participant; a socket that
  signals using a matchId belonging to a *different* pair is silently
  dropped rather than relayed to strangers or affecting that other
  pair's call (spec section 66's "changing IDs must never bypass
  authorization," applied to the one place in this codebase where a
  client supplies an ID the server must not blindly trust); a real
  `end_call` ends the call, notifies the peer, and records `end_reason`;
  connections are rejected for missing/garbage tokens and — the case
  that mattered most here — for an account banned *after* the token was
  issued (this test caught a real bug: the handshake was trusting the
  JWT's embedded `accountStatus` claim instead of re-checking Postgres,
  so a just-banned user could still open a signaling connection until
  their token expired; fixed in `ws/signaling.ts` alongside adding this
  test).

## Not yet covered

Admin-app and web-app end-to-end UI tests (e.g. Playwright) aren't here —
this suite covers the API service only.
