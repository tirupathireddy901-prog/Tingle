import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AccessTokenPayload;
  }
}

/**
 * Verifies the Authorization: Bearer <token> header and attaches the
 * decoded payload to request.authUser. Every route that touches another
 * user's data, matchmaking, or account state must use this — never trust
 * a userId passed in the request body/params instead of the token.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing or invalid Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    req.authUser = verifyAccessToken(token);
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}

/**
 * Stronger guard for anything that starts a call: requires an active,
 * age-verified account. This is the server-side enforcement the spec
 * calls for — the client's own claim of eligibility is never trusted.
 */
export async function requireEligibleAccount(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (!req.authUser?.ageVerified) {
    return reply.code(403).send({ error: "Account is not age-eligible" });
  }
  if (req.authUser.accountStatus !== "active") {
    return reply.code(403).send({ error: "Account is not active", status: req.authUser.accountStatus });
  }
}
