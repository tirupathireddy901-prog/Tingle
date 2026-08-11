import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/lib/db.js";
import { redis } from "../src/lib/redis.js";
import { tryMatch, enqueue } from "../src/lib/matchmaking.js";
import { createTestApp, createActiveUser } from "./helpers.js";

describe("matchmaking", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("matches two eligible, unrelated users and persists match + call_session", async () => {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);

    await enqueue(userB.id, "video");
    const result = await tryMatch(userA.id, "video");

    expect(result).not.toBeNull();
    expect(result!.otherUserId).toBe(userB.id);

    const match = await pool.query(`SELECT status FROM matches WHERE id = $1`, [result!.matchId]);
    expect(match.rows[0].status).toBe("active");

    const session = await pool.query(`SELECT mode FROM call_sessions WHERE id = $1`, [
      result!.callSessionId,
    ]);
    expect(session.rows[0].mode).toBe("video");
  });

  it("never matches two users who have blocked each other, but still matches a third eligible user", async () => {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);
    const userC = await createActiveUser(app);

    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [userA.id, userB.id]);

    await enqueue(userB.id, "video");
    await enqueue(userC.id, "video");

    const result = await tryMatch(userA.id, "video");
    expect(result).not.toBeNull();
    expect(result!.otherUserId).toBe(userC.id);
    expect(result!.otherUserId).not.toBe(userB.id);

    const userD = await createActiveUser(app);
    const secondResult = await tryMatch(userD.id, "video");
    expect(secondResult).not.toBeNull();
    expect(secondResult!.otherUserId).toBe(userB.id);
  });

  it("drops a candidate who is no longer eligible (e.g. banned after queueing) without matching them", async () => {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);

    await enqueue(userB.id, "voice");
    await pool.query(`UPDATE users SET account_status = 'banned' WHERE id = $1`, [userB.id]);

    const result = await tryMatch(userA.id, "voice");
    expect(result).toBeNull();

    const stillQueued = await redis.lpos("queue:voice", userB.id);
    expect(stillQueued).toBeNull();
  });

  it("two simultaneous match attempts for the same waiting user never both succeed (no double-match)", async () => {
    const userB = await createActiveUser(app);
    const userA1 = await createActiveUser(app);
    const userA2 = await createActiveUser(app);

    await enqueue(userB.id, "video");

    const [resultA1, resultA2] = await Promise.all([
      tryMatch(userA1.id, "video"),
      tryMatch(userA2.id, "video"),
    ]);

    const successes = [resultA1, resultA2].filter((r) => r !== null);
    expect(successes.length).toBe(1);
    expect(successes[0]!.otherUserId).toBe(userB.id);
  });
});
