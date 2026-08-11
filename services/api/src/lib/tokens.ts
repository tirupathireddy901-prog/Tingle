import { randomBytes, createHash } from "node:crypto";

// Email-verification, password-reset, and refresh tokens all follow the
// same pattern: generate a random opaque token, send/return the raw token
// to the user exactly once, and store only a SHA-256 hash of it in
// Postgres. A stolen database dump is then useless for replaying tokens.

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function msFromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
