import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { createTestApp, createActiveUser } from "./helpers.js";

describe("auth", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("rejects signup from someone under 18, server-side", async () => {
    const email = `minor-${uuidv4()}@example.com`;
    const seventeenYearsAgo = new Date();
    seventeenYearsAgo.setFullYear(seventeenYearsAgo.getFullYear() - 17);

    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        displayName: "Too Young",
        email,
        password: "SuperSecret123!",
        confirmPassword: "SuperSecret123!",
        dateOfBirth: seventeenYearsAgo.toISOString().slice(0, 10),
        agreeAge18: true,
        agreeTerms: true,
        agreePrivacy: true,
        agreeCommunityGuidelines: true,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("rejects signup missing a required legal agreement", async () => {
    const email = `noagree-${uuidv4()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        displayName: "No Agree",
        email,
        password: "SuperSecret123!",
        confirmPassword: "SuperSecret123!",
        dateOfBirth: "1990-01-01",
        agreeAge18: true,
        agreeTerms: true,
        agreePrivacy: true,
        // agreeCommunityGuidelines omitted
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("signs up, activates, and logs in a real user end to end", async () => {
    const user = await createActiveUser(app);
    expect(user.accessToken).toBeTruthy();
    expect(user.refreshToken).toBeTruthy();
  });

  it("rejects duplicate email signup", async () => {
    const user = await createActiveUser(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        displayName: "Dupe",
        email: user.email,
        password: "SuperSecret123!",
        confirmPassword: "SuperSecret123!",
        dateOfBirth: "1990-01-01",
        agreeAge18: true,
        agreeTerms: true,
        agreePrivacy: true,
        agreeCommunityGuidelines: true,
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns a generic error for wrong password, not 'user not found'", async () => {
    const user = await createActiveUser(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: user.email, password: "wrong-password-entirely" },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Invalid email or password");
  });

  it("returns the same generic error for a nonexistent email (no enumeration)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `nobody-${uuidv4()}@example.com`, password: "whatever123" },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Invalid email or password");
  });

  it("never reveals whether an email exists on password-reset request", async () => {
    const existing = await createActiveUser(app);
    const [resExisting, resMissing] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/auth/request-password-reset",
        payload: { email: existing.email },
      }),
      app.inject({
        method: "POST",
        url: "/auth/request-password-reset",
        payload: { email: `ghost-${uuidv4()}@example.com` },
      }),
    ]);
    expect(resExisting.statusCode).toBe(200);
    expect(resMissing.statusCode).toBe(200);
    expect(JSON.parse(resExisting.body).message).toBe(JSON.parse(resMissing.body).message);
  });

  it("rejects an unauthenticated request to /auth/me", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("/auth/me never returns email or password_hash", async () => {
    const user = await createActiveUser(app);
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("password_hash");
    expect(body).not.toHaveProperty("passwordHash");
  });
});
