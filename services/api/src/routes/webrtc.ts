import type { FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import { requireEligibleAccount } from "../middleware/authGuard.js";

const CREDENTIAL_TTL_SECONDS = 600; // 10 minutes — client re-fetches per call

export async function webrtcRoutes(app: FastifyInstance) {
  // Implements coturn's standard REST API auth mechanism: username is
  // "<expiry-timestamp>:<user-id>", credential is
  // base64(HMAC-SHA1(secret, username)). coturn validates this itself —
  // TURN_STATIC_AUTH_SECRET never leaves the server, so a client can only
  // ever get a credential that expires shortly and is tied to their own
  // authenticated user id. Gated behind requireEligibleAccount (not just
  // requireAuth) so a restricted/suspended/unverified account can't pull
  // TURN credentials and use the relay as a free open proxy.
  app.get("/webrtc/ice-servers", { preHandler: requireEligibleAccount }, async (req, reply) => {
    const secret = process.env.TURN_STATIC_AUTH_SECRET;
    const stunUrls = (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302").split(",");

    const iceServers: { urls: string; username?: string; credential?: string }[] = stunUrls.map((urls) => ({
      urls: urls.trim(),
    }));

    if (secret) {
      const expiry = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
      const username = `${expiry}:${req.authUser!.sub}`;
      const credential = createHmac("sha1", secret).update(username).digest("base64");
      const turnPort = process.env.TURN_LISTEN_PORT ?? "3478";
      const turnRealm = process.env.TURN_REALM ?? "tingle.local";

      iceServers.push({
        urls: `turn:${turnRealm}:${turnPort}?transport=udp`,
        username,
        credential,
      });
    }

    return reply.send({ iceServers });
  });
}
