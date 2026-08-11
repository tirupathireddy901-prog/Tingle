// Duplicated from @tingle/types for the same reason noted in the backend's
// lib/matchmaking.ts — the web app's Dockerfile installs in isolation, so
// cross-workspace resolution isn't wired up yet. Keep in sync manually
// until that's fixed.

export type CallMode = "video" | "voice" | "both";

export type CallEndReason =
  | "user_ended"
  | "next"
  | "disconnected"
  | "reported"
  | "blocked"
  | "failed"
  | null;

export type ClientToServerSignal =
  | { type: "join_queue"; mode: CallMode }
  | { type: "cancel_queue" }
  | { type: "webrtc_offer"; matchId: string; sdp: string }
  | { type: "webrtc_answer"; matchId: string; sdp: string }
  | { type: "ice_candidate"; matchId: string; candidate: RTCIceCandidateInit }
  | { type: "next" }
  | { type: "end_call"; matchId: string };

export type ServerToClientSignal =
  | { type: "queue_status"; status: "searching" }
  | { type: "match_found"; matchId: string; callSessionId: string; mode: Exclude<CallMode, "both">; peerId: string }
  | { type: "webrtc_offer"; matchId: string; sdp: string }
  | { type: "webrtc_answer"; matchId: string; sdp: string }
  | { type: "ice_candidate"; matchId: string; candidate: RTCIceCandidateInit }
  | { type: "call_ended"; matchId: string; reason: CallEndReason };
