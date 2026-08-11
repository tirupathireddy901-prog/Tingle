import jwt from "jsonwebtoken";

// Deliberately a separate signing concern from lib/auth.ts's user tokens:
// every admin token carries `aud: "admin"` and every check in
// middleware/adminGuard.ts verifies that claim. A leaked or reused user
// access token can never be replayed as an admin token, and vice versa,
// even though both currently sign with the same JWT_SECRET.

export type AdminRole = "super_admin" | "safety_moderator" | "support" | "system_admin";

export interface AdminTokenPayload {
  sub: string; // admin id
  role: AdminRole;
  aud: "admin";
}

export function signAdminToken(sub: string, role: AdminRole): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign({ sub, role, aud: "admin" }, secret, { expiresIn: "8h" });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const payload = jwt.verify(token, secret) as AdminTokenPayload;
  if (payload.aud !== "admin") throw new Error("Not an admin token");
  return payload;
}
