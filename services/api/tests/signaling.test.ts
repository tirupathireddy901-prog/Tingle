import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import { pool } from "../src/lib/db.js";
import { createTestApp, createActiveUser } from "./helpers.js";

// app.inject() (used by the other test files) doesn't drive a real
// WebSocket upgrade, so these tests bind the app to a real ephemeral
// port and connect actual `ws` clients — the only way to exercise
// services/api/src/ws/signaling.ts honestly. This is the gap called out
// in tests/README.md.

function waitFor(ws: WebSocket, predicate: (msg: any) => boolean, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", handler);
      reject(new Error(`Timed out waiting for a matching message on this socket`));
    }, timeoutMs);
    function handler(data: WebSocket.RawData) {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(msg);
      }
    }
    ws.on("message", handler);
  });
}

// Confirms a socket does NOT receive a matching message within a short
// window — used to prove spoofed matchIds are silently dropped rather
// than relayed, without waiting out a full timeout for every such case.
function expectNoMessage(ws: WebSocket, predicate: (msg: any) => boolean, windowMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", handler);
      resolve();
    }, windowMs);
    function handler(data: WebSocket.RawData) {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off("message", handler);
        reject(new Error(`Received a message that should never have been relayed: ${JSON.stringify(msg)}`));
      }
    }
    ws.on("message", handler);
  });
}

describe("websocket signaling — matchId spoofing must never bypass authorization", () => {
  let app: FastifyInstance;
  let wsBaseUrl: string;
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    wsBaseUrl = `ws://127.0.0.1:${port}/ws/signal`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await app.close();
  });

  function connect(accessToken: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBaseUrl}?token=${accessToken}`);
      sockets.push(ws);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
  }

  async function matchPair(): Promise<{
    userA: Awaited<ReturnType<typeof createActiveUser>>;
    userB: Awaited<ReturnType<typeof createActiveUser>>;
    wsA: WebSocket;
    wsB: WebSocket;
    matchId: string;
    callSessionId: string;
  }> {
    const userA = await createActiveUser(app);
    const userB = await createActiveUser(app);
    const wsA = await connect(userA.accessToken);
    const wsB = await connect(userB.accessToken);

    wsA.send(JSON.stringify({ type: "join_queue", mode: "video" }));
    await waitFor(wsA, (m) => m.type === "queue_status");

    const matchFoundA = waitFor(wsA, (m) => m.type === "match_found");
    const matchFoundB = waitFor(wsB, (m) => m.type === "match_found");
    wsB.send(JSON.stringify({ type: "join_queue", mode: "video" }));
    const [msgA, msgB] = await Promise.all([matchFoundA, matchFoundB]);

    expect(msgA.matchId).toBe(msgB.matchId);
    expect(msgA.peerId).toBe(userB.id);
    expect(msgB.peerId).toBe(userA.id);

    return { userA, userB, wsA, wsB, matchId: msgA.matchId, callSessionId: msgA.callSessionId };
  }

  it("relays webrtc_offer/answer and ice_candidate only to the actual match participant", async () => {
    const { wsA, wsB, matchId } = await matchPair();

    wsA.send(JSON.stringify({ type: "webrtc_offer", matchId, sdp: "fake-offer-sdp" }));
    const offer = await waitFor(wsB, (m) => m.type === "webrtc_offer");
    expect(offer.sdp).toBe("fake-offer-sdp");

    wsB.send(JSON.stringify({ type: "webrtc_answer", matchId, sdp: "fake-answer-sdp" }));
    const answer = await waitFor(wsA, (m) => m.type === "webrtc_answer");
    expect(answer.sdp).toBe("fake-answer-sdp");

    wsA.send(JSON.stringify({ type: "ice_candidate", matchId, candidate: { candidate: "fake" } }));
    const candidate = await waitFor(wsB, (m) => m.type === "ice_candidate");
    expect(candidate.candidate.candidate).toBe("fake");
  });

  it("a socket signaling with a matchId it isn't part of is silently dropped, not relayed to a stranger", async () => {
    const pairAB = await matchPair();
    const pairCD = await matchPair();

    // A tries to signal using C/D's matchId — a value A could only have
    // by guessing or intercepting it, never by anything the server told
    // A's own client. Neither C nor D must ever see this.
    pairAB.wsA.send(
      JSON.stringify({ type: "webrtc_offer", matchId: pairCD.matchId, sdp: "attacker-injected-sdp" })
    );

    await expectNoMessage(pairCD.wsA, (m) => m.type === "webrtc_offer");
    await expectNoMessage(pairCD.wsB, (m) => m.type === "webrtc_offer");
    // And B (A's real, current partner) doesn't get it either, since the
    // matchId in the message doesn't match A's actual active match.
    await expectNoMessage(pairAB.wsB, (m) => m.type === "webrtc_offer" && m.sdp === "attacker-injected-sdp");
  });

  it("end_call with someone else's matchId does not end that other pair's call", async () => {
    const pairAB = await matchPair();
    const pairCD = await matchPair();

    pairAB.wsA.send(JSON.stringify({ type: "end_call", matchId: pairCD.matchId }));

    // Give the (no-op) handler a moment, then confirm C/D's match is
    // still active and A/B's is untouched.
    await new Promise((r) => setTimeout(r, 300));

    const cdMatch = await pool.query(`SELECT status FROM matches WHERE id = $1`, [pairCD.matchId]);
    expect(cdMatch.rows[0].status).toBe("active");

    const abMatch = await pool.query(`SELECT status FROM matches WHERE id = $1`, [pairAB.matchId]);
    expect(abMatch.rows[0].status).toBe("active");
  });

  it("a real end_call ends the call, notifies the peer, and records end_reason", async () => {
    const { wsA, wsB, matchId, callSessionId } = await matchPair();

    wsA.send(JSON.stringify({ type: "end_call", matchId }));
    const ended = await waitFor(wsB, (m) => m.type === "call_ended");
    expect(ended.reason).toBe("user_ended");

    const session = await pool.query(`SELECT end_reason, ended_at FROM call_sessions WHERE id = $1`, [
      callSessionId,
    ]);
    expect(session.rows[0].end_reason).toBe("user_ended");
    expect(session.rows[0].ended_at).not.toBeNull();
  });

  it("rejects a connection with no token", async () => {
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${wsBaseUrl}`);
        sockets.push(ws);
        ws.once("close", (code) => resolve(code));
        ws.once("error", reject);
      })
    ).resolves.toBe(4001);
  });

  it("rejects a connection with a garbage token", async () => {
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${wsBaseUrl}?token=not-a-real-token`);
        sockets.push(ws);
        ws.once("close", (code) => resolve(code));
        ws.once("error", reject);
      })
    ).resolves.toBe(4001);
  });

  it("rejects a connection for an account that is no longer active (e.g. banned after login)", async () => {
    const user = await createActiveUser(app);
    await pool.query(`UPDATE users SET account_status = 'banned' WHERE id = $1`, [user.id]);

    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${wsBaseUrl}?token=${user.accessToken}`);
        sockets.push(ws);
        ws.once("close", (code) => resolve(code));
        ws.once("error", reject);
      })
    ).resolves.toBe(4003);
  });
});
