import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/lib/db.js";
import { createTestApp, createActiveUser, createAdmin } from "./helpers.js";

describe("safety and moderation flows", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("a possible_minor report immediately restricts the reported account pending review", async () => {
    const reporter = await createActiveUser(app);
    const reported = await createActiveUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: { authorization: `Bearer ${reporter.accessToken}` },
      payload: { reportedUserId: reported.id, category: "possible_minor" },
    });
    expect(res.statusCode).toBe(201);

    const row = await pool.query(`SELECT account_status FROM users WHERE id = $1`, [reported.id]);
    expect(row.rows[0].account_status).toBe("restricted");

    const logged = await pool.query(
      `SELECT action FROM moderation_actions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [reported.id]
    );
    expect(logged.rows[0].action).toBe("restriction");
  });

  it("a restricted user can submit exactly one pending appeal, and an admin can approve it", async () => {
    const user = await createActiveUser(app);
    await pool.query(`UPDATE users SET account_status = 'restricted' WHERE id = $1`, [user.id]);

    const submitRes = await app.inject({
      method: "POST",
      url: "/appeals",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { message: "This was a misunderstanding." },
    });
    expect(submitRes.statusCode).toBe(201);

    const secondRes = await app.inject({
      method: "POST",
      url: "/appeals",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { message: "Please look again." },
    });
    expect(secondRes.statusCode).toBe(409);

    const appealId = JSON.parse(submitRes.body).appealId;
    const moderator = await createAdmin(app, "safety_moderator");

    const decideRes = await app.inject({
      method: "POST",
      url: `/admin/appeals/${appealId}/decide`,
      headers: { authorization: `Bearer ${moderator.accessToken}` },
      payload: { decision: "approved", note: "Reviewed — reinstating." },
    });
    expect(decideRes.statusCode).toBe(200);

    const row = await pool.query(`SELECT account_status FROM users WHERE id = $1`, [user.id]);
    expect(row.rows[0].account_status).toBe("active");
  });

  it("an active (non-restricted) user cannot submit an appeal", async () => {
    const user = await createActiveUser(app);
    const res = await app.inject({
      method: "POST",
      url: "/appeals",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { message: "I have nothing to appeal but I'll try anyway." },
    });
    expect(res.statusCode).toBe(400);
  });

  it("blocking a user is idempotent (blocking twice doesn't error or duplicate)", async () => {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);

    await app.inject({
      method: "POST",
      url: "/blocks",
      headers: { authorization: `Bearer ${userA.accessToken}` },
      payload: { blockedUserId: userB.id },
    });
    const secondRes = await app.inject({
      method: "POST",
      url: "/blocks",
      headers: { authorization: `Bearer ${userA.accessToken}` },
      payload: { blockedUserId: userB.id },
    });
    expect(secondRes.statusCode).toBe(201);

    const rows = await pool.query(
      `SELECT count(*) FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [userA.id, userB.id]
    );
    expect(Number(rows.rows[0].count)).toBe(1);
  });
});
