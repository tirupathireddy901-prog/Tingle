import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAdminToken, type AdminTokenPayload, type AdminRole } from "../lib/adminAuth.js";

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminTokenPayload;
  }
}

/**
 * Factory so routes can restrict by role, e.g.
 * { preHandler: requireAdmin(["super_admin", "safety_moderator"]) }.
 * Called with no roles, any active admin token is accepted.
 */
export function requireAdmin(allowedRoles?: AdminRole[]) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing or invalid Authorization header" });
    }
    try {
      const payload = verifyAdminToken(header.slice("Bearer ".length));
      if (allowedRoles && !allowedRoles.includes(payload.role)) {
        return reply.code(403).send({ error: "Insufficient role for this action" });
      }
      req.admin = payload;
    } catch {
      return reply.code(401).send({ error: "Invalid or expired admin token" });
    }
  };
}
