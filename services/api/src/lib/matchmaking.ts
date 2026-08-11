import { redis } from "./redis.js";
import { pool } from "./db.js";

// NOTE: duplicated here rather than imported from @tingle/types because
// the API service's Dockerfile currently runs `npm install` scoped to
// services/api only, so cross-workspace package resolution isn't wired
// up inside the container yet. Once the Docker build installs from the
// repo root (npm workspaces), swap this for `import type { CallMode }
// from "@tingle/types"` and delete this duplicate.
type CallMode = "video" | "voice" | "both";

// Queue key per mode. LPOP/RPUSH on a Redis list are atomic single
// commands — Redis processes them one at a time even under concurrent
// callers, which is what prevents the double-matching race condition the
// spec calls out (section 43: "prevent race conditions where one user
// gets matched twice"). Two simultaneous joins can never pop the same
// waiting user.
function queueKey(mode: Exclude<CallMode, "both">) {
  return `queue:${mode}`;
}

// "both" preference joins whichever queue currently has someone waiting;
// if neither does, it defaults to video. Kept simple for this pass —
// real interest/language-weighted matching can layer on top later
// without changing the concurrency-safety properties here.
async function resolveQueueMode(preferred: CallMode): Promise<Exclude<CallMode, "both">> {
  if (preferred !== "both") return preferred;
  const [videoLen, voiceLen] = await Promise.all([
    redis.llen(queueKey("video")),
    redis.llen(queueKey("voice")),
  ]);
  if (voiceLen > videoLen) return "voice";
  return "video";
}

async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userA, userB]
  );
  return (result.rowCount ?? 0) > 0;
}

async function isEligible(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT account_status, age_verified FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rowCount === 0) return false;
  const row = result.rows[0];
  return row.account_status === "active" && row.age_verified === true;
}

export interface MatchResult {
  matchId: string;
  callSessionId: string;
  mode: Exclude<CallMode, "both">;
  otherUserId: string;
}

/**
 * Attempts to find a waiting partner for `userId`. Pops candidates off the
 * Redis queue one at a time (atomic per pop), skipping anyone blocked in
 * either direction or no longer eligible, and requeues skipped-but-valid
 * candidates at the back so they aren't lost. Returns null if the queue
 * is empty (caller should then enqueue themselves).
 */
export async function tryMatch(
  userId: string,
  preferredMode: CallMode,
  maxAttempts = 8
): Promise<MatchResult | null> {
  const mode = await resolveQueueMode(preferredMode);
  const key = queueKey(mode);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateId = await redis.lpop(key);
    if (!candidateId) return null; // queue empty

    if (candidateId === userId) continue; // shouldn't happen, but never self-match

    const [blocked, candidateEligible] = await Promise.all([
      isBlockedEitherWay(userId, candidateId),
      isEligible(candidateId),
    ]);

    if (!candidateEligible) continue; // candidate logged out / banned since queueing — drop them
    if (blocked) {
      await redis.rpush(key, candidateId); // still valid for someone else — requeue
      continue;
    }

    // Found a valid pair — create the match + call session durably.
    const matchResult = await pool.query(
      `INSERT INTO matches (user_a, user_b, status) VALUES ($1, $2, 'active') RETURNING id`,
      [userId, candidateId]
    );
    const matchId = matchResult.rows[0].id;

    const callSessionResult = await pool.query(
      `INSERT INTO call_sessions (match_id, mode) VALUES ($1, $2) RETURNING id`,
      [matchId, mode]
    );
    const callSessionId = callSessionResult.rows[0].id;

    return { matchId, callSessionId, mode, otherUserId: candidateId };
  }

  return null; // gave up after maxAttempts — queue had only ineligible/blocked users
}

export async function enqueue(userId: string, preferredMode: CallMode) {
  const mode = await resolveQueueMode(preferredMode);
  await redis.rpush(queueKey(mode), userId);
  return mode;
}

export async function dequeue(userId: string, mode: Exclude<CallMode, "both">) {
  await redis.lrem(queueKey(mode), 0, userId);
}

export async function dequeueFromAllModes(userId: string) {
  await Promise.all([
    redis.lrem(queueKey("video"), 0, userId),
    redis.lrem(queueKey("voice"), 0, userId),
  ]);
}

export async function endMatch(
  matchId: string,
  callSessionId: string,
  endReason: "user_ended" | "next" | "disconnected" | "reported" | "blocked" | "failed"
) {
  await pool.query("BEGIN");
  try {
    await pool.query(`UPDATE matches SET status = 'ended', ended_at = now() WHERE id = $1`, [matchId]);
    await pool.query(
      `UPDATE call_sessions
       SET ended_at = now(),
           duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))::int,
           end_reason = $2
       WHERE id = $1`,
      [callSessionId, endReason]
    );
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

export { isEligible, isBlockedEitherWay };
