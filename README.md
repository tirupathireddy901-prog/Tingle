# Tingle — "Meet. Talk. Connect."

An 18+ random video/voice chat platform, built free/open-source-first with no
mandatory paid SaaS. Monorepo covering the web app, admin panel, Android
app, backend (auth, matchmaking, WebRTC signaling), infra (Postgres,
Redis, coturn, Nginx), and an automated test suite — see "What's
implemented so far" below for exactly what's real versus still a stub.

## Cost model (read this first)

| Layer | Cost |
|---|---|
| Software / stack | $0 — everything below is open-source |
| Local development | $0 — `docker compose up` runs the whole stack on your machine |
| Public hosting, bandwidth, domain, TURN relay at scale | **Not $0** — running this for real users on the public internet costs money (a VPS, bandwidth, a domain). No architecture makes that free; this repo just avoids *forcing* you onto a paid vendor for the software itself. |

Direct WebRTC (peer-to-peer via STUN) is preferred; coturn (self-hosted TURN)
is only a relay fallback when direct connection fails.

## Stack

- **Frontend**: React + Vite + TypeScript + Tailwind
- **Backend**: Node.js + TypeScript + Fastify + ws (WebSocket)
- **Database**: PostgreSQL
- **Cache / matchmaking / presence**: Redis
- **Real-time signaling**: WebSocket (never carries media)
- **Media**: WebRTC (browser-native), STUN, coturn (self-hosted TURN)
- **Reverse proxy**: Nginx
- **Containers**: Docker / Docker Compose
- **Mobile**: Android (native, WebRTC-capable — not a plain WebView)

## Project structure

```
tingle/
  apps/
    web/          React/Vite/TS frontend
    mobile/       Android app (native)
    admin/        Separate admin/moderation application
  services/
    api/           REST API — auth, profiles, preferences, blocks, reports
    matchmaking/    Queue + pairing logic (Redis-backed)
    signaling/      WebSocket signaling server for WebRTC offer/answer/ICE
  infra/
    postgres/       Schema + migrations
    redis/          Config
    coturn/         Self-hosted TURN server config
    nginx/          Reverse proxy config
  packages/
    types/          Shared TypeScript types (User, Match, CallSession, ...)
    config/         Shared config/env schema
  docs/             Architecture, API, WebSocket protocol, security model
  tests/            Cross-service integration/security tests
```

## Running locally

```bash
cp .env.example .env
docker compose up
```

This brings up: Postgres, Redis, coturn, the API service, the web frontend,
and Nginx. The Postgres container runs `infra/postgres/init.sql`
automatically on first boot to create the schema.

No real secrets belong in `.env.example` — copy it to `.env` and fill in
your own local values. `.env` is gitignored.

## What's implemented so far

**Pass 1 — foundation:**

- [x] Monorepo layout, Docker Compose stack, full Postgres schema, `.env.example`
- [x] Minimal API health check + Vite/React/TS web app shell

**Pass 2 — auth, matchmaking, signaling:**

- [x] Signup with server-side 18+ enforcement (date of birth is checked
      and discarded — only the `age_verified` boolean is stored)
- [x] Email verification, password reset, login/refresh/logout, all with
      hashed opaque tokens (never stored raw) and rate limiting
- [x] Block and report endpoints, with `possible_minor` reports triggering
      an automatic pending-review restriction
- [x] Redis-backed matchmaking queue with atomic pairing (no double-match
      race), block-aware candidate skipping, and eligibility re-checks
- [x] WebSocket signaling server (`/ws/signal`): join/cancel queue,
      WebRTC offer/answer/ICE relay scoped to verified match participants,
      `next`, `end_call`, and disconnect cleanup

**Pass 3 — WebRTC call UI (web):**

- [x] Full auth flow UI: signup (with the 18+ confirmation and legal
      checkboxes), login, email verification, forgot/reset password
- [x] Home screen with Video Tingle / Voice Tingle mode selection
- [x] Full call screen: searching → connecting → connected → ended states,
      full-screen remote video with PiP local preview (video mode) or
      avatar + audio visualizer (voice mode), mic/camera/switch-camera
      controls, Next/End, in-call Report and Block modals
- [x] Safety Center (blocked users list) and stub Privacy/Terms/Community
      Guidelines pages
- [x] ICE server credentials endpoint (`GET /webrtc/ice-servers`) using
      coturn's time-limited HMAC auth, gated behind an active+age-verified
      account check

**Pass 4 — admin panel:**

- [x] Fully separate admin app (`apps/admin`, its own port 5175, its own
      auth and token storage) talking directly to the API — no shared
      session with the user-facing web app, and admin JWTs carry an
      `aud: "admin"` claim so a leaked user token can never be replayed
      as an admin token
- [x] One-time `POST /admin/bootstrap` to create the first `super_admin`
      (locks itself out permanently once any admin row exists)
- [x] Report queue with `possible_minor` sorted first and visually
      flagged, and a moderation-action modal (dismiss/warn/restrict/
      suspend/ban) that logs to `moderation_actions`
- [x] Appeals: an admin-side queue plus a matching `/appeals` endpoint
      and `Restricted` page on the user-facing web app, so a restricted,
      suspended, or banned account actually has somewhere to appeal to

**Pass 5 — automated test suite (`services/api/tests/`):**

- [x] Auth: 18+ enforcement, required legal agreements, duplicate email,
      non-enumerating login/reset errors, `/auth/me` field leakage
- [x] Cross-user authorization (spec §65–66): blocks/reports always
      attributed to the token holder, refresh tokens can't be revoked by
      someone else, admin endpoints reject user tokens and enforce role
      gating
- [x] Matchmaking: block-aware pairing, ineligible-candidate dropping,
      and the no-double-match concurrency guarantee (§43)
- [x] Safety/moderation: `possible_minor` auto-restriction, the full
      appeal lifecycle, idempotent blocking
- [x] Rate limiter unit tests
- [x] WebSocket signaling, with real `ws` clients against a live port
      (`app.inject()` can't drive a WS upgrade): offer/answer/ICE relayed
      only to the actual match participant, a matchId belonging to a
      *different* pair is silently dropped rather than relayed or able to
      end that other pair's call, and connection rejection for missing/
      garbage tokens. Writing this test caught and fixed a real bug: the
      WS handshake was trusting the JWT's embedded `accountStatus` claim
      instead of re-checking Postgres, so a user banned after their token
      was issued could still open a signaling connection until it expired.

Run them: see `services/api/tests/README.md`. Not covered yet: end-to-end
UI tests for the web/admin frontends (e.g. Playwright).

**Pass 6 — Android app (`apps/mobile/`):**

- [x] Native Kotlin + Jetpack Compose client — not a WebView wrapper —
      hitting the same REST endpoints and the same `/ws/signal` WebSocket
      protocol as the web app (`signaling/SignalMessages.kt` mirrors
      `packages/types` exactly)
- [x] Real WebRTC audio/video via `org.webrtc` (Google's official
      prebuilt library, BSD-3, free), the same lexicographic-user-id
      offer-initiator rule as the web app, and one ICE restart on
      connection failure before giving up
- [x] Auth flow, matchmaking, block/report, and a restricted/appeal
      screen mirroring the web app's
- [x] Permission handling that explains itself before the system dialog
      (spec §39) and falls back to voice-only if camera is denied rather
      than failing the call outright
- [x] Only the permissions actually used (§60): internet, camera, mic,
      notifications, and the foreground-service permissions needed to
      keep a call alive if the app briefly backgrounds

Known placeholders, documented in `apps/mobile/README.md`: the launcher
icon is a simple vector mark, not final brand art; the Gradle wrapper jar
isn't included (this environment had no network access to fetch it —
generate it once with `gradle wrapper --gradle-version 8.7`); no
automated tests for this app yet.

## Security notes for this pass

- Passwords are never stored — schema has a `password_hash` column only.
- No secrets are committed. `.env.example` contains placeholders only.
- `infra/`, `docker-compose.yml`, and service Dockerfiles avoid embedding
  credentials; everything comes from environment variables at runtime.
