import { redis } from "./redis.js";

/**
 * Fixed-window rate limiter. Returns true if the action is allowed, false
 * if the caller has exceeded `limit` requests within `windowSeconds`.
 *
 * Used for: signup, login, password reset requests, verification email
 * resends, match requests, reports, block operations, WebSocket connects
 * (spec section 44) — call this at the top of each of those handlers.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  return count <= limit;
}
