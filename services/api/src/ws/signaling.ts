import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { verifyAccessToken } from "../lib/auth.js";
import { tryMatch, enqueue, dequeueFromAllModes, endMatch, isEligible } from "../lib/matchmaking.js";
import { checkRateLimit } from "../lib/rateLimit.js";

type CallMode = "video" | "voice" | "both";

type ClientToServerSignal =
  | { type: "join_queue"; mode: CallMode }
  | { type: "cancel_queue" }
  | { type: "webrtc_offer"; matchId: string; sdp: string }
  | { type: "webrtc_answer"; matchId: string; sdp: string }
  | { type: "ice_candidate"; matchId: string; candidate: unknown }
  | { type: "next" }
  | { type: "end_call"; matchId: string };

// In-memory presence + active-call state. Fine for a single signaling
// process (this dev/foundation pass); scaling to multiple instances needs
// this replaced with Redis pub/sub so any instance can reach any user's
// socket — noted in docs/ARCHITECTURE.md as a follow-up, not solved here.
const connections = new Map<string, WebSocket>();
const userToMatch = new Map<string, { matchId: string; callSessionId: string; peerId: string }>();
const userPreferredMode = new Map<string, CallMode>();

function send(userId: string, payload: unknown) {
  const socket = connections.get(userId);
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

async function attemptMatch(userId: string, mode: CallMode) {
  const result = await tryMatch(userId, mode);
  if (!result) {
    await enqueue(userId, mode);
    send(userId, { type: "queue_status", status: "searching" });
    return;
  }

  const { matchId, callSessionId, mode: resolvedMode, otherUserId } = result;
  userToMatch.set(userId, { matchId, callSessionId, peerId: otherUserId });
  userToMatch.set(otherUserId, { matchId, callSessionId, peerId: userId });

  // peerId lets each client know who they're talking to — needed for the
  // block/report actions available during and after the call, and to
  // deterministically pick one side as the WebRTC offer-sender (lower
  // user id initiates) without an extra round trip.
  send(userId, { type: "match_found", matchId, callSessionId, mode: resolvedMode, peerId: otherUserId });
  send(otherUserId, { type: "match_found", matchId, callSessionId, mode: resolvedMode, peerId: userId });
}

async function leaveCurrentMatch(
  userId: string,
  reason: "user_ended" | "next" | "disconnected"
) {
  const active = userToMatch.get(userId);
  if (!active) return;

  userToMatch.delete(userId);
  userToMatch.delete(active.peerId);

  try {
    await endMatch(active.matchId, active.callSessionId, reason);
  } catch {
    // best-effort — connection state cleanup still proceeds even if the
    // DB write fails; a background sweep job would reconcile stragglers
    // in a production build
  }

  send(active.peerId, { type: "call_ended", matchId: active.matchId, reason });
}

export async function signalingRoutes(app: FastifyInstance) {
  app.get("/ws/signal", { websocket: true }, async (socket, req) => {
    const token = (req.query as Record<string, string>)?.token;
    if (!token) {
      socket.close(4001, "Missing token");
      return;
    }

    let userId: string;
    try {
      const payload = verifyAccessToken(token);
      userId = payload.sub;
    } catch {
      socket.close(4001, "Invalid token");
      return;
    }

    // Server-side enforcement again at the WebSocket boundary — a valid
    // JWT alone isn't enough if the account was since restricted/banned.
    // This deliberately re-reads current state from Postgres rather than
    // trusting the token's accountStatus/ageVerified claims: those are a
    // snapshot from login/refresh time and can be up to JWT_EXPIRES_IN
    // stale, which is exactly long enough for a just-banned user to open
    // a fresh signaling connection if we only checked the claims.
    const eligible = await isEligible(userId);
    if (!eligible) {
      socket.close(4003, "Account not eligible");
      return;
    }

    const rateOk = await checkRateLimit(`ws-connect:${userId}`, 20, 60);
    if (!rateOk) {
      socket.close(4029, "Too many connections");
      return;
    }

    // Only one live connection per user — replace any stale one.
    connections.get(userId)?.close(4000, "Replaced by new connection");
    connections.set(userId, socket);

    socket.on("message", async (raw: Buffer) => {
      let msg: ClientToServerSignal;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // silently drop malformed frames
      }

      switch (msg.type) {
        case "join_queue": {
          if (userToMatch.has(userId)) return; // already in a call
          const rateOk = await checkRateLimit(`match-request:${userId}`, 10, 60);
          if (!rateOk) {
            send(userId, { type: "queue_status", status: "searching" });
            return;
          }
          userPreferredMode.set(userId, msg.mode);
          await attemptMatch(userId, msg.mode);
          break;
        }

        case "cancel_queue": {
          await dequeueFromAllModes(userId);
          break;
        }

        case "webrtc_offer":
        case "webrtc_answer":
        case "ice_candidate": {
          const active = userToMatch.get(userId);
          // Reject if this socket isn't actually a participant in the
          // matchId it's signaling for — never trust the client's claim.
          if (!active || active.matchId !== msg.matchId) return;
          send(active.peerId, msg);
          break;
        }

        case "next": {
          await leaveCurrentMatch(userId, "next");
          const mode = userPreferredMode.get(userId) ?? "both";
          await attemptMatch(userId, mode);
          break;
        }

        case "end_call": {
          const active = userToMatch.get(userId);
          if (!active || active.matchId !== msg.matchId) return;
          await leaveCurrentMatch(userId, "user_ended");
          break;
        }
      }
    });

    socket.on("close", async () => {
      if (connections.get(userId) === socket) {
        connections.delete(userId);
      }
      userPreferredMode.delete(userId);
      await dequeueFromAllModes(userId);
      await leaveCurrentMatch(userId, "disconnected");
    });
  });
}
