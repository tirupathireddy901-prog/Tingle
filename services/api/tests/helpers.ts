import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { buildApp } from "../src/app.js";
import { pool } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/auth.js";
import type { AdminRole } from "../src/lib/adminAuth.js";

export async function createTestApp(): Promise<FastifyInstance> {
  return buildApp();
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Signs up a real user through the actual /auth/signup route (so it goes
 * through the same age-check, hashing, and rate-limit code every real
 * signup does), then uses a direct DB write to skip the "click the email
 * link" step — we're not intercepting the dev-mode console email here —
 * and logs in for real tokens.
 */
export async function createActiveUser(app: FastifyInstance, password = "SuperSecret123!"): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;

  const signupRes = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      displayName: "Test User",
      email,
      password,
      confirmPassword: password,
      dateOfBirth: "1990-01-01",
      agreeAge18: true,
      agreeTerms: true,
      agreePrivacy: true,
      agreeCommunityGuidelines: true,
    },
  });
  if (signupRes.statusCode !== 201) {
    throw new Error(`Signup failed in test helper: ${signupRes.statusCode} ${signupRes.body}`);
  }

  await pool.query(
    `UPDATE users SET account_status = 'active', email_verified_at = now() WHERE email = $1`,
    [email]
  );

  const loginRes = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  if (loginRes.statusCode !== 200) {
    throw new Error(`Login failed in test helper: ${loginRes.statusCode} ${loginRes.body}`);
  }
  const loginBody = JSON.parse(loginRes.body);

  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${loginBody.accessToken}` },
  });
  const me = JSON.parse(meRes.body);

  return {
    id: me.id,
    email,
    password,
    accessToken: loginBody.accessToken,
    refreshToken: loginBody.refreshToken,
  };
}

export interface TestAdmin {
  id: string;
  email: string;
  accessToken: string;
  role: AdminRole;
}

/**
 * /admin/bootstrap only works once (by design — it locks itself out
 * permanently after the first admin row exists), so tests that need more
 * than one admin, or need a specific role, insert directly instead of
 * fighting that invariant.
 */
export async function createAdmin(app: FastifyInstance, role: AdminRole = "super_admin"): Promise<TestAdmin> {
  const email = `admin-${uuidv4()}@example.com`;
  const password = "AdminSecret123!";
  const passwordHash = await hashPassword(password);

  const result = await pool.query(
    `INSERT INTO admins (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, passwordHash, "Test Admin", role]
  );

  const loginRes = await app.inject({ method: "POST", url: "/admin/login", payload: { email, password } });
  if (loginRes.statusCode !== 200) {
    throw new Error(`Admin login failed in test helper: ${loginRes.statusCode} ${loginRes.body}`);
  }
  const body = JSON.parse(loginRes.body);

  return { id: result.rows[0].id, email, accessToken: body.accessToken, role };
}
