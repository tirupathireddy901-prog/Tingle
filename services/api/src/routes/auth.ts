import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../lib/db.js";
import { hashPassword, verifyPassword, signAccessToken } from "../lib/auth.js";
import {
  generateOpaqueToken,
  hashToken,
  msFromNow,
  ONE_HOUR_MS,
  THIRTY_DAYS_MS,
} from "../lib/tokens.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { requireAuth } from "../middleware/authGuard.js";

const MIN_AGE_YEARS = 18;

function calculateAge(dateOfBirth: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = now.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

const signupSchema = z.object({
  displayName: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(10).max(200),
  confirmPassword: z.string(),
  dateOfBirth: z.string(), // ISO date, e.g. "2000-05-14" — never persisted
  agreeAge18: z.literal(true),
  agreeTerms: z.literal(true),
  agreePrivacy: z.literal(true),
  agreeCommunityGuidelines: z.literal(true),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // ---- Signup ----
  app.post("/auth/signup", async (req, reply) => {
    const allowed = await checkRateLimit(`signup:${req.ip}`, 5, 60 * 60);
    if (!allowed) return reply.code(429).send({ error: "Too many signup attempts. Try again later." });

    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    if (data.password !== data.confirmPassword) {
      return reply.code(400).send({ error: "Passwords do not match" });
    }

    // Server-side age enforcement — the checkbox alone is never trusted.
    // Note: this is a self-attested date of birth, same as most consumer
    // apps' baseline age gate. The architecture leaves room to plug in a
    // dedicated age-assurance provider later (see docs/ARCHITECTURE.md);
    // this does not, on its own, stop a minor who misrepresents their DOB.
    const dob = new Date(data.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || calculateAge(dob) < MIN_AGE_YEARS) {
      return reply.code(403).send({ error: "You must be 18 or older to use Tingle" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [data.email]);
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.code(409).send({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(data.password);
    const userId = uuidv4();

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO users (id, email, password_hash, display_name, age_verified, account_status)
         VALUES ($1, $2, $3, $4, TRUE, 'pending_verification')`,
        [userId, data.email, passwordHash, data.displayName]
      );
      await pool.query(`INSERT INTO profiles (user_id) VALUES ($1)`, [userId]);
      await pool.query(`INSERT INTO preferences (user_id) VALUES ($1)`, [userId]);
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      req.log.error(err);
      return reply.code(500).send({ error: "Signup failed" });
    }

    const verificationToken = generateOpaqueToken();
    await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, hashToken(verificationToken), msFromNow(ONE_HOUR_MS)]
    );
    await sendVerificationEmail(data.email, verificationToken);

    return reply.code(201).send({
      message: "Account created. Check your email to verify your address before you can start matching.",
    });
  });

  // ---- Login ----
  app.post("/auth/login", async (req, reply) => {
    const allowed = await checkRateLimit(`login:${req.ip}`, 10, 60 * 15);
    if (!allowed) return reply.code(429).send({ error: "Too many login attempts. Try again later." });

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });
    const { email, password } = parsed.data;

    const result = await pool.query(
      `SELECT id, password_hash, age_verified, account_status FROM users WHERE email = $1`,
      [email]
    );
    const genericError = { error: "Invalid email or password" };
    if (result.rowCount === 0) return reply.code(401).send(genericError);

    const user = result.rows[0];
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) return reply.code(401).send(genericError);

    if (["suspended", "banned", "deleted"].includes(user.account_status)) {
      return reply.code(403).send({ error: "This account is not available", status: user.account_status });
    }

    const accessToken = signAccessToken({
      sub: user.id,
      accountStatus: user.account_status,
      ageVerified: user.age_verified,
    });

    const refreshToken = generateOpaqueToken();
    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, device_label, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, hashToken(refreshToken), req.headers["user-agent"] ?? "unknown", msFromNow(THIRTY_DAYS_MS)]
    );

    await pool.query(`UPDATE users SET last_active_at = now() WHERE id = $1`, [user.id]);

    return reply.send({
      accessToken,
      refreshToken,
      requiresEmailVerification: user.account_status === "pending_verification",
    });
  });

  // ---- Refresh ----
  app.post("/auth/refresh", async (req, reply) => {
    const parsed = z.object({ refreshToken: z.string() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const tokenHash = hashToken(parsed.data.refreshToken);
    const result = await pool.query(
      `SELECT s.id as session_id, u.id as user_id, u.account_status, u.age_verified
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [tokenHash]
    );
    if (result.rowCount === 0) return reply.code(401).send({ error: "Invalid or expired refresh token" });

    const row = result.rows[0];
    await pool.query(`UPDATE sessions SET last_active_at = now() WHERE id = $1`, [row.session_id]);

    const accessToken = signAccessToken({
      sub: row.user_id,
      accountStatus: row.account_status,
      ageVerified: row.age_verified,
    });
    return reply.send({ accessToken });
  });

  // ---- Logout ----
  app.post("/auth/logout", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ refreshToken: z.string() }).safeParse(req.body);
    if (parsed.success) {
      await pool.query(
        `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND refresh_token_hash = $2`,
        [req.authUser!.sub, hashToken(parsed.data.refreshToken)]
      );
    }
    return reply.send({ message: "Logged out" });
  });

  // ---- Verify email ----
  app.post("/auth/verify-email", async (req, reply) => {
    const parsed = z.object({ token: z.string() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const tokenHash = hashToken(parsed.data.token);
    const result = await pool.query(
      `SELECT id, user_id FROM email_verification_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );
    if (result.rowCount === 0) return reply.code(400).send({ error: "Invalid or expired verification link" });

    const row = result.rows[0];
    await pool.query("BEGIN");
    try {
      await pool.query(`UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`, [row.id]);
      await pool.query(
        `UPDATE users SET email_verified_at = now(),
                          account_status = CASE WHEN account_status = 'pending_verification' THEN 'active' ELSE account_status END
         WHERE id = $1`,
        [row.user_id]
      );
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      req.log.error(err);
      return reply.code(500).send({ error: "Verification failed" });
    }
    return reply.send({ message: "Email verified" });
  });

  // ---- Resend verification ----
  app.post("/auth/resend-verification", async (req, reply) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const allowed = await checkRateLimit(`resend-verif:${parsed.data.email}`, 3, 60 * 15);
    if (!allowed) return reply.code(429).send({ error: "Too many requests. Try again later." });

    const result = await pool.query(
      `SELECT id FROM users WHERE email = $1 AND account_status = 'pending_verification'`,
      [parsed.data.email]
    );
    if (result.rowCount && result.rowCount > 0) {
      const token = generateOpaqueToken();
      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [result.rows[0].id, hashToken(token), msFromNow(ONE_HOUR_MS)]
      );
      await sendVerificationEmail(parsed.data.email, token);
    }
    return reply.send({ message: "If that account needs verification, a new email has been sent." });
  });

  // ---- Request password reset ----
  app.post("/auth/request-password-reset", async (req, reply) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const allowed = await checkRateLimit(`pw-reset:${parsed.data.email}`, 3, 60 * 15);
    if (!allowed) return reply.code(429).send({ error: "Too many requests. Try again later." });

    const result = await pool.query(`SELECT id FROM users WHERE email = $1`, [parsed.data.email]);
    if (result.rowCount && result.rowCount > 0) {
      const token = generateOpaqueToken();
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [result.rows[0].id, hashToken(token), msFromNow(ONE_HOUR_MS)]
      );
      await sendPasswordResetEmail(parsed.data.email, token);
    }
    return reply.send({ message: "If an account exists for this email, reset instructions have been sent." });
  });

  // ---- Reset password ----
  app.post("/auth/reset-password", async (req, reply) => {
    const parsed = z
      .object({ token: z.string(), newPassword: z.string().min(10).max(200) })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const tokenHash = hashToken(parsed.data.token);
    const result = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );
    if (result.rowCount === 0) return reply.code(400).send({ error: "Invalid or expired reset link" });

    const row = result.rows[0];
    const newHash = await hashPassword(parsed.data.newPassword);

    await pool.query("BEGIN");
    try {
      await pool.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
        newHash,
        row.user_id,
      ]);
      await pool.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
      await pool.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
        row.user_id,
      ]);
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      req.log.error(err);
      return reply.code(500).send({ error: "Password reset failed" });
    }
    return reply.send({ message: "Password updated. Please log in again." });
  });

  // ---- Current user ----
  app.get("/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    const result = await pool.query(
      `SELECT id, display_name, profile_photo_url, age_verified, account_status, created_at, last_active_at
       FROM users WHERE id = $1`,
      [req.authUser!.sub]
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "User not found" });
    const u = result.rows[0];
    return reply.send({
      id: u.id,
      displayName: u.display_name,
      profilePhotoUrl: u.profile_photo_url,
      ageVerified: u.age_verified,
      accountStatus: u.account_status,
      createdAt: u.created_at,
      lastActiveAt: u.last_active_at,
    });
  });
}
