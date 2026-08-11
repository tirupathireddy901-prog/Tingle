import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { checkDatabaseConnection } from "./lib/db.js";
import { checkRedisConnection } from "./lib/redis.js";
import { authRoutes } from "./routes/auth.js";
import { safetyRoutes } from "./routes/safety.js";
import { webrtcRoutes } from "./routes/webrtc.js";
import { adminRoutes } from "./routes/admin.js";
import { signalingRoutes } from "./ws/signaling.js";

/**
 * Builds a fully-registered Fastify instance without binding a port.
 * index.ts calls this and then listen()s; the test suite calls this and
 * uses app.inject() instead, so tests exercise the exact same routing,
 * validation, and middleware stack as production without a real socket.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  await app.register(cors, {
    origin: [
      process.env.APP_URL ?? "http://localhost:5173",
      process.env.ADMIN_URL ?? "http://localhost:5175",
    ],
  });

  await app.register(websocket);

  await app.register(authRoutes);
  await app.register(safetyRoutes);
  await app.register(webrtcRoutes);
  await app.register(adminRoutes);
  await app.register(signalingRoutes);

  app.get("/health", async () => {
    const [dbOk, redisOk] = await Promise.all([checkDatabaseConnection(), checkRedisConnection()]);
    return {
      status: dbOk && redisOk ? "ok" : "degraded",
      database: dbOk ? "connected" : "unreachable",
      redis: redisOk ? "connected" : "unreachable",
    };
  });

  return app;
}
