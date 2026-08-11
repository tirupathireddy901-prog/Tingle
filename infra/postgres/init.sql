-- Tingle database schema
-- Runs automatically on first Postgres container boot (see docker-compose.yml).
-- Idempotent-ish: safe to re-run against a fresh database.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- for case-insensitive unique email

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    profile_photo_url   TEXT,
    age_verified        BOOLEAN NOT NULL DEFAULT FALSE,
    account_status      TEXT NOT NULL DEFAULT 'pending_verification'
                         CHECK (account_status IN (
                             'pending_verification', 'active', 'restricted',
                             'suspended', 'banned', 'deleted'
                         )),
    email_verified_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at      TIMESTAMPTZ
);

-- ============================================================
-- profiles (public-facing, non-sensitive)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio                 TEXT,
    languages           TEXT[] NOT NULL DEFAULT '{}',
    interests           TEXT[] NOT NULL DEFAULT '{}',
    broad_region        TEXT, -- e.g. country/state only, never exact location
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- preferences (discovery/matchmaking settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS preferences (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mode                TEXT NOT NULL DEFAULT 'both'
                         CHECK (mode IN ('video', 'voice', 'both')),
    languages           TEXT[] NOT NULL DEFAULT '{}',
    interests           TEXT[] NOT NULL DEFAULT '{}',
    region              TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- matches
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'ended', 'failed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ,
    CHECK (user_a <> user_b)
);

-- ============================================================
-- call_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS call_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id            UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    mode                TEXT NOT NULL CHECK (mode IN ('video', 'voice')),
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ,
    duration_seconds    INTEGER,
    end_reason          TEXT
                         CHECK (end_reason IN (
                             'user_ended', 'next', 'disconnected',
                             'reported', 'blocked', 'failed', NULL
                         ))
);

-- ============================================================
-- blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS blocks (
    blocker_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

-- ============================================================
-- reports
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id         UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    reported_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_session_id     UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
    category            TEXT NOT NULL CHECK (category IN (
                             'harassment', 'threats', 'hate',
                             'sexual_misconduct', 'sexual_content', 'scam',
                             'spam', 'impersonation', 'privacy_violation',
                             'possible_minor', 'other'
                         )),
    description         TEXT,
    status               TEXT NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- moderation_actions (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS moderation_actions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action              TEXT NOT NULL CHECK (action IN (
                             'warning', 'restriction', 'suspension', 'ban',
                             'unban', 'appeal_approved', 'appeal_denied'
                         )),
    reason              TEXT NOT NULL,
    performed_by        UUID, -- admins id; nullable for system actions
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ
);

-- ============================================================
-- admins — completely separate identity space from `users`.
-- No signup flow: the first row is created once via POST /admin/bootstrap
-- (routes/admin.ts), which locks itself out permanently after that (spec
-- section 45: "create a completely separate admin application").
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN (
                             'super_admin', 'safety_moderator', 'support', 'system_admin'
                         )),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at      TIMESTAMPTZ
);

-- ============================================================
-- appeals (spec section 47)
-- ============================================================
CREATE TABLE IF NOT EXISTS appeals (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moderation_action_id    UUID REFERENCES moderation_actions(id) ON DELETE SET NULL,
    message                 TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'denied')),
    reviewer_id             UUID REFERENCES admins(id) ON DELETE SET NULL,
    decision_note           TEXT,
    decided_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- sessions (device/login sessions, for "active sessions" UI + revocation)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- refresh token is never stored raw — only its hash, so a DB read
    -- alone can never be replayed as a valid refresh token.
    refresh_token_hash  TEXT NOT NULL,
    device_label        TEXT,
    ip_hash             TEXT, -- store a hash, never raw IP long-term
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ
);

-- ============================================================
-- email_verification_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    used_at             TIMESTAMPTZ
);

-- ============================================================
-- password_reset_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    used_at             TIMESTAMPTZ
);

-- ============================================================
-- admins (separate identity space from regular users — spec section 45)
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN (
                             'super_admin', 'safety_moderator', 'support', 'system_admin'
                         )),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at      TIMESTAMPTZ
);

-- ============================================================
-- appeals
-- ============================================================
CREATE TABLE IF NOT EXISTS appeals (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moderation_action_id    UUID REFERENCES moderation_actions(id) ON DELETE SET NULL,
    message                 TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'denied')),
    reviewer_id             UUID REFERENCES admins(id) ON DELETE SET NULL,
    decision_note           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at              TIMESTAMPTZ
);

-- ============================================================
-- Indexes for matchmaking + safety query paths
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);

CREATE INDEX IF NOT EXISTS idx_matches_user_a ON matches(user_a);
CREATE INDEX IF NOT EXISTS idx_matches_user_b ON matches(user_b);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

CREATE INDEX IF NOT EXISTS idx_call_sessions_match ON call_sessions(match_id);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_user ON moderation_actions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions(revoked_at);

CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verif_token_hash ON email_verification_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_pw_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_token_hash ON password_reset_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admins(role);

CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);

CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);
