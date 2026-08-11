// Shared domain types — kept in sync with infra/postgres/init.sql.
// Import from both apps/web and services/api so request/response shapes
// never drift between frontend and backend.

export type AccountStatus =
  | "pending_verification"
  | "active"
  | "restricted"
  | "suspended"
  | "banned"
  | "deleted";

export type CallMode = "video" | "voice" | "both";

export interface User {
  id: string;
  displayName: string;
  profilePhotoUrl: string | null;
  ageVerified: boolean;
  accountStatus: AccountStatus;
  createdAt: string;
  lastActiveAt: string | null;
  // email/password/hash are intentionally NOT part of the public User type —
  // never send these to the client.
}

export interface Profile {
  userId: string;
  bio: string | null;
  languages: string[];
  interests: string[];
  broadRegion: string | null;
}

export interface Preferences {
  userId: string;
  mode: CallMode;
  languages: string[];
  interests: string[];
  region: string | null;
}

export type MatchStatus = "active" | "ended" | "failed";

export interface Match {
  id: string;
  userA: string;
  userB: string;
  status: MatchStatus;
  createdAt: string;
  endedAt: string | null;
}

export type CallEndReason =
  | "user_ended"
  | "next"
  | "disconnected"
  | "reported"
  | "blocked"
  | "failed"
  | null;

export interface CallSession {
  id: string;
  matchId: string;
  mode: "video" | "voice";
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: CallEndReason;
}

export type ReportCategory =
  | "harassment"
  | "threats"
  | "hate"
  | "sexual_misconduct"
  | "sexual_content"
  | "scam"
  | "spam"
  | "impersonation"
  | "privacy_violation"
  | "possible_minor"
  | "other";

export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string;
  callSessionId: string | null;
  category: ReportCategory;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
}

// ---- WebSocket signaling message shapes (services/signaling) ----

export type ClientToServerSignal =
  | { type: "join_queue"; mode: CallMode }
  | { type: "cancel_queue" }
  | { type: "webrtc_offer"; matchId: string; sdp: string }
  | { type: "webrtc_answer"; matchId: string; sdp: string }
  | { type: "ice_candidate"; matchId: string; candidate: unknown }
  | { type: "next" }
  | { type: "end_call"; matchId: string };

export type ServerToClientSignal =
  | { type: "queue_status"; status: "searching" }
  | { type: "match_found"; matchId: string; callSessionId: string; mode: CallMode; peerId: string }
  | { type: "webrtc_offer"; matchId: string; sdp: string }
  | { type: "webrtc_answer"; matchId: string; sdp: string }
  | { type: "ice_candidate"; matchId: string; candidate: unknown }
  | { type: "peer_disconnected"; matchId: string }
  | { type: "call_ended"; matchId: string; reason: CallEndReason };
