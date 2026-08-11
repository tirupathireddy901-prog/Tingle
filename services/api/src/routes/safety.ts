import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { requireAuth } from "../middleware/authGuard.js";

const reportCategories = [
  "harassment", "threats", "hate", "sexual_misconduct", "sexual_content",
  "scam", "spam", "impersonation", "privacy_violation", "possible_minor", "other",
] as const;

export async function safetyRoutes(app: FastifyInstance) {
  // ---- Block a user ----
  app.post("/blocks", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ blockedUserId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const blockerId = req.authUser!.sub;
    const { blockedUserId } = parsed.data;
    if (blockerId === blockedUserId) {
      return reply.code(400).send({ error: "You cannot block yourself" });
    }

    await pool.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockerId, blockedUserId]
    );

    // If they're mid-call together, the caller's client is expected to
    // send end_call to the signaling connection right after this; the
    // matchmaking layer also re-checks blocks on every pairing attempt,
    // so a block prevents future matches regardless.
    return reply.code(201).send({ message: "User blocked" });
  });

  app.delete("/blocks/:blockedUserId", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ blockedUserId: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    await pool.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
      req.authUser!.sub,
      parsed.data.blockedUserId,
    ]);
    return reply.send({ message: "User unblocked" });
  });

  app.get("/blocks", { preHandler: requireAuth }, async (req, reply) => {
    const result = await pool.query(
      `SELECT b.blocked_id, u.display_name, u.profile_photo_url, b.created_at
       FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [req.authUser!.sub]
    );
    return reply.send(
      result.rows.map((r) => ({
        userId: r.blocked_id,
        displayName: r.display_name,
        profilePhotoUrl: r.profile_photo_url,
        blockedAt: r.created_at,
      }))
    );
  });

  // ---- Report a user ----
  app.post("/reports", { preHandler: requireAuth }, async (req, reply) => {
    const allowed = await checkRateLimit(`report:${req.authUser!.sub}`, 10, 60 * 60);
    if (!allowed) return reply.code(429).send({ error: "Too many reports. Try again later." });

    const parsed = z
      .object({
        reportedUserId: z.string().uuid(),
        callSessionId: z.string().uuid().optional(),
        category: z.enum(reportCategories),
        description: z.string().max(2000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const { reportedUserId, callSessionId, category, description } = parsed.data;
    if (reportedUserId === req.authUser!.sub) {
      return reply.code(400).send({ error: "You cannot report yourself" });
    }

    const result = await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, call_session_id, category, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.authUser!.sub, reportedUserId, callSessionId ?? null, category, description ?? null]
    );

    // "possible_minor" is the dedicated high-priority category (spec section 48):
    // restrict pending review rather than waiting in the normal queue.
    if (category === "possible_minor") {
      await pool.query(
        `UPDATE users SET account_status = 'restricted', updated_at = now()
         WHERE id = $1 AND account_status = 'active'`,
        [reportedUserId]
      );
      await pool.query(
        `INSERT INTO moderation_actions (user_id, action, reason, performed_by)
         VALUES ($1, 'restriction', 'Automatic restriction pending review: possible minor report', NULL)`,
        [reportedUserId]
      );
    }

    return reply.code(201).send({ message: "Report submitted", reportId: result.rows[0].id });
  });

  // ---- Submit an appeal (spec section 47) ----
  app.post("/appeals", { preHandler: requireAuth }, async (req, reply) => {
    const allowed = await checkRateLimit(`appeal:${req.authUser!.sub}`, 3, 60 * 60 * 24);
    if (!allowed) return reply.code(429).send({ error: "Too many appeals. Try again later." });

    const parsed = z.object({ message: z.string().min(1).max(4000) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const userResult = await pool.query(`SELECT account_status FROM users WHERE id = $1`, [
      req.authUser!.sub,
    ]);
    const status = userResult.rows[0]?.account_status;
    if (!["restricted", "suspended", "banned"].includes(status)) {
      return reply.code(400).send({ error: "Only a restricted, suspended, or banned account can appeal" });
    }

    const existingPending = await pool.query(
      `SELECT 1 FROM appeals WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
      [req.authUser!.sub]
    );
    if ((existingPending.rowCount ?? 0) > 0) {
      return reply.code(409).send({ error: "You already have an appeal pending review" });
    }

    const result = await pool.query(
      `INSERT INTO appeals (user_id, message) VALUES ($1, $2) RETURNING id`,
      [req.authUser!.sub, parsed.data.message]
    );
    return reply.code(201).send({ message: "Appeal submitted", appealId: result.rows[0].id });
  });
}
