import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { signAdminToken } from "../lib/adminAuth.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { requireAdmin } from "../middleware/adminGuard.js";

const moderationActionInputs = ["dismiss", "warn", "restrict", "suspend", "ban"] as const;

// Maps a moderation decision to the account_status it should produce.
// "dismiss" leaves the account untouched — it's a decision about the
// report, not the reported account.
const ACCOUNT_STATUS_FOR_ACTION: Record<(typeof moderationActionInputs)[number], string | null> = {
  dismiss: null,
  warn: null,
  restrict: "restricted",
  suspend: "suspended",
  ban: "banned",
};

// moderation_actions.action has its own, slightly different enum
// (infra/postgres/init.sql) — this maps the admin-facing decision to it.
// "dismiss" never gets a row: it's a decision about the report, not an
// action taken against the account.
const MODERATION_LOG_ACTION: Partial<Record<(typeof moderationActionInputs)[number], string>> = {
  warn: "warning",
  restrict: "restriction",
  suspend: "suspension",
  ban: "ban",
};

export async function adminRoutes(app: FastifyInstance) {
  // ---- One-time bootstrap: creates the first super_admin. Locks itself
  // out permanently once any admin row exists, so it can't be replayed
  // to mint a rogue admin later. ----
  app.post("/admin/bootstrap", async (req, reply) => {
    const parsed = z
      .object({
        email: z.string().email(),
        password: z.string().min(12).max(200),
        displayName: z.string().min(1).max(60),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const existing = await pool.query("SELECT 1 FROM admins LIMIT 1");
    if ((existing.rowCount ?? 0) > 0) {
      return reply.code(403).send({ error: "Bootstrap already completed. Ask an existing admin for access." });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await pool.query(
      `INSERT INTO admins (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'super_admin')`,
      [parsed.data.email, passwordHash, parsed.data.displayName]
    );
    return reply.code(201).send({ message: "First super_admin created. Log in at /admin/login." });
  });

  // ---- Admin login (fully separate from user login) ----
  app.post("/admin/login", async (req, reply) => {
    const allowed = await checkRateLimit(`admin-login:${req.ip}`, 10, 60 * 15);
    if (!allowed) return reply.code(429).send({ error: "Too many login attempts. Try again later." });

    const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const result = await pool.query(
      `SELECT id, password_hash, role, active FROM admins WHERE email = $1`,
      [parsed.data.email]
    );
    const genericError = { error: "Invalid email or password" };
    if (result.rowCount === 0) return reply.code(401).send(genericError);

    const admin = result.rows[0];
    if (!admin.active) return reply.code(403).send({ error: "This admin account is deactivated" });

    const valid = await verifyPassword(parsed.data.password, admin.password_hash);
    if (!valid) return reply.code(401).send(genericError);

    await pool.query(`UPDATE admins SET last_active_at = now() WHERE id = $1`, [admin.id]);
    return reply.send({ accessToken: signAdminToken(admin.id, admin.role), role: admin.role });
  });

  // ---- Report queue ----
  app.get(
    "/admin/reports",
    { preHandler: requireAdmin(["super_admin", "safety_moderator"]) },
    async (req, reply) => {
      const query = z
        .object({ status: z.enum(["open", "in_review", "resolved", "dismissed"]).optional() })
        .safeParse(req.query);
      const status = query.success ? query.data.status : undefined;

      const result = await pool.query(
        `SELECT r.id, r.reporter_id, r.reported_user_id, r.call_session_id, r.category,
                r.description, r.status, r.created_at,
                u.display_name AS reported_display_name, u.account_status AS reported_account_status
         FROM reports r
         JOIN users u ON u.id = r.reported_user_id
         WHERE ($1::text IS NULL OR r.status = $1)
         ORDER BY
           -- possible_minor first regardless of age, then oldest-first within a category
           (r.category = 'possible_minor') DESC,
           r.created_at ASC
         LIMIT 200`,
        [status ?? null]
      );
      return reply.send(result.rows);
    }
  );

  // ---- Act on a report ----
  app.post(
    "/admin/reports/:id/action",
    { preHandler: requireAdmin(["super_admin", "safety_moderator"]) },
    async (req, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      const body = z
        .object({ action: z.enum(moderationActionInputs), note: z.string().max(2000).optional() })
        .safeParse(req.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid input" });

      const reportResult = await pool.query(`SELECT reported_user_id FROM reports WHERE id = $1`, [
        params.data.id,
      ]);
      if (reportResult.rowCount === 0) return reply.code(404).send({ error: "Report not found" });
      const reportedUserId = reportResult.rows[0].reported_user_id;

      await pool.query("BEGIN");
      try {
        await pool.query(
          `UPDATE reports SET status = $2 WHERE id = $1`,
          [params.data.id, body.data.action === "dismiss" ? "dismissed" : "resolved"]
        );

        const newStatus = ACCOUNT_STATUS_FOR_ACTION[body.data.action];
        if (newStatus) {
          await pool.query(`UPDATE users SET account_status = $2, updated_at = now() WHERE id = $1`, [
            reportedUserId,
            newStatus,
          ]);
        }

        const logAction = MODERATION_LOG_ACTION[body.data.action];
        if (logAction) {
          await pool.query(
            `INSERT INTO moderation_actions (user_id, action, reason, performed_by)
             VALUES ($1, $2, $3, $4)`,
            [
              reportedUserId,
              logAction,
              body.data.note ?? `Report ${params.data.id} resolved: ${body.data.action}`,
              req.admin!.sub,
            ]
          );
        }
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        req.log.error(err);
        return reply.code(500).send({ error: "Failed to apply moderation action" });
      }

      return reply.send({ message: "Action applied" });
    }
  );

  // ---- User lookup (restricted fields only — never email/password) ----
  app.get("/admin/users/:id", { preHandler: requireAdmin() }, async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid input" });

    const result = await pool.query(
      `SELECT id, display_name, account_status, age_verified, created_at, last_active_at
       FROM users WHERE id = $1`,
      [params.data.id]
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "User not found" });

    const reportCount = await pool.query(`SELECT count(*) FROM reports WHERE reported_user_id = $1`, [
      params.data.id,
    ]);

    return reply.send({ ...result.rows[0], reportCount: Number(reportCount.rows[0].count) });
  });

  // ---- Moderation audit log ----
  app.get("/admin/moderation-actions", { preHandler: requireAdmin() }, async (req, reply) => {
    const query = z.object({ userId: z.string().uuid().optional() }).safeParse(req.query);
    const userId = query.success ? query.data.userId : undefined;

    const result = await pool.query(
      `SELECT id, user_id, action, reason, performed_by, created_at, expires_at
       FROM moderation_actions
       WHERE ($1::uuid IS NULL OR user_id = $1)
       ORDER BY created_at DESC LIMIT 200`,
      [userId ?? null]
    );
    return reply.send(result.rows);
  });

  // ---- Appeals queue ----
  app.get(
    "/admin/appeals",
    { preHandler: requireAdmin(["super_admin", "safety_moderator"]) },
    async (req, reply) => {
      const query = z.object({ status: z.enum(["pending", "approved", "denied"]).optional() }).safeParse(req.query);
      const status = query.success ? query.data.status : "pending";

      const result = await pool.query(
        `SELECT a.id, a.user_id, u.display_name, a.message, a.status, a.created_at
         FROM appeals a JOIN users u ON u.id = a.user_id
         WHERE ($1::text IS NULL OR a.status = $1)
         ORDER BY a.created_at ASC LIMIT 200`,
        [status ?? null]
      );
      return reply.send(result.rows);
    }
  );

  // ---- Decide an appeal ----
  app.post(
    "/admin/appeals/:id/decide",
    { preHandler: requireAdmin(["super_admin", "safety_moderator"]) },
    async (req, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      const body = z
        .object({ decision: z.enum(["approved", "denied"]), note: z.string().max(2000).optional() })
        .safeParse(req.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid input" });

      const appealResult = await pool.query(`SELECT user_id, status FROM appeals WHERE id = $1`, [
        params.data.id,
      ]);
      if (appealResult.rowCount === 0) return reply.code(404).send({ error: "Appeal not found" });
      if (appealResult.rows[0].status !== "pending") {
        return reply.code(409).send({ error: "Appeal has already been decided" });
      }
      const userId = appealResult.rows[0].user_id;

      await pool.query("BEGIN");
      try {
        await pool.query(
          `UPDATE appeals SET status = $2, reviewer_id = $3, decision_note = $4, decided_at = now() WHERE id = $1`,
          [params.data.id, body.data.decision, req.admin!.sub, body.data.note ?? null]
        );

        if (body.data.decision === "approved") {
          await pool.query(`UPDATE users SET account_status = 'active', updated_at = now() WHERE id = $1`, [
            userId,
          ]);
        }

        await pool.query(
          `INSERT INTO moderation_actions (user_id, action, reason, performed_by)
           VALUES ($1, $2, $3, $4)`,
          [
            userId,
            body.data.decision === "approved" ? "appeal_approved" : "appeal_denied",
            body.data.note ?? `Appeal ${params.data.id} ${body.data.decision}`,
            req.admin!.sub,
          ]
        );
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        req.log.error(err);
        return reply.code(500).send({ error: "Failed to decide appeal" });
      }

      return reply.send({ message: "Appeal decided" });
    }
  );
}
