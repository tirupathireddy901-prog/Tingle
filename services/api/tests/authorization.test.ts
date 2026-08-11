import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/lib/db.js";
import { createTestApp, createActiveUser, createAdmin } from "./helpers.js";

describe("cross-user authorization — User A must never reach User B's data or actions", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("blocking always uses the caller's own id as blocker, never a client-supplied one", async () => {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);

    // The request body only accepts blockedUserId — there is no field for
    // the caller to claim to be someone else. Confirm the resulting row
    // is attributed to the token holder (A), not forgeable via payload.
    const res = await app.inject({
      method: "POST",
      url: "/blocks",
      headers: { authorization: `Bearer ${userA.accessToken}` },
      payload: { blockedUserId: userB.id },
    });
    expect(res.statusCode).toBe(201);

    const row = await pool.query(`SELECT blocker_id, blocked_id FROM blocks WHERE blocked_id = $1`, [
      userB.id,
    ]);
    expect(row.rows[0].blocker_id).toBe(userA.id);
    expect(row.rows[0].blocked_id).toBe(userB.id);
  });

  it("a report is always attributed to the authenticated caller, never a spoofed reporter", async () => {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: { authorization: `Bearer ${userA.accessToken}` },
      // Even if a client tried to inject a reporterId, the schema doesn't
      // accept one — only reportedUserId/category/description are read.
      payload: { reportedUserId: userB.id, category: "spam", reporterId: userB.id },
    });
    expect(res.statusCode).toBe(201);

    const row = await pool.query(`SELECT reporter_id, reported_user_id FROM reports WHERE reported_user_id = $1`, [
      userB.id,
    ]);
    expect(row.rows[0].reporter_id).toBe(userA.id);
  });

  it("User A cannot log out User B's session by guessing/reusing a refresh token value", async () => {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);

    // A tries to log out using B's own refresh token, but authenticated
    // as A. The logout query is scoped to (user_id = token holder AND
    // refresh_token_hash = supplied token) — it must not revoke B's
    // session just because A knows the token string.
    await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${userA.accessToken}` },
      payload: { refreshToken: userB.refreshToken },
    });

    // B's refresh token must still work.
    const refreshRes = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: userB.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
  });

  it("rejects a malformed/garbage access token rather than treating it as a valid user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("admin endpoints reject a regular user's access token outright", async () => {
    const user = await createActiveUser(app);
    const res = await app.inject({
      method: "GET",
      url: "/admin/reports",
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    // A user token has no `aud: "admin"` claim, so it must never pass
    // admin verification, regardless of how it was obtained.
    expect(res.statusCode).toBe(401);
  });

  it("admin endpoints reject requests with no token at all", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/reports" });
    expect(res.statusCode).toBe(401);
  });

  it("a 'support' admin cannot act on reports (role-gated to safety_moderator/super_admin)", async () => {
    const supportAdmin = await createAdmin(app, "support");
    const res = await app.inject({
      method: "GET",
      url: "/admin/reports",
      headers: { authorization: `Bearer ${supportAdmin.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a safety_moderator admin CAN act on reports", async () => {
    const moderator = await createAdmin(app, "safety_moderator");
    const res = await app.inject({
      method: "GET",
      url: "/admin/reports",
      headers: { authorization: `Bearer ${moderator.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("blocking yourself is rejected", async () => {
    const user = await createActiveUser(app);
    const res = await app.inject({
      method: "POST",
      url: "/blocks",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { blockedUserId: user.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reporting yourself is rejected", async () => {
    const user = await createActiveUser(app);
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { reportedUserId: user.id, category: "other" },
    });
    expect(res.statusCode).toBe(400);
  });
});
