import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCall } from "../lib/CallContext";
import { api, ApiError } from "../lib/api";

const REPORT_CATEGORIES = [
  { value: "harassment", label: "Harassment" },
  { value: "threats", label: "Threats" },
  { value: "hate", label: "Hate" },
  { value: "sexual_misconduct", label: "Sexual misconduct" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "scam", label: "Scam" },
  { value: "spam", label: "Spam" },
  { value: "impersonation", label: "Impersonation" },
  { value: "privacy_violation", label: "Privacy violation" },
  { value: "possible_minor", label: "Possible minor" },
  { value: "other", label: "Other" },
];

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Call() {
  const navigate = useNavigate();
  const call = useCall();
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (call.state === "idle") navigate("/home");
  }, [call.state, navigate]);

  if (call.state === "searching") {
    return (
      <FullscreenCenter>
        <div className="w-3 h-3 rounded-full bg-violet animate-ping mb-6" />
        <p className="text-lg mb-8">Finding someone for you…</p>
        <button
          onClick={() => {
            call.cancelSearching();
            navigate("/home");
          }}
          className="px-6 py-3 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
        >
          Cancel
        </button>
      </FullscreenCenter>
    );
  }

  if (call.state === "failed" || call.state === "remote_disconnected") {
    return (
      <FullscreenCenter>
        <p className="text-lg mb-2">
          {call.state === "failed" ? "Something went wrong." : "Connection lost."}
        </p>
        <p className="text-neutral-400 mb-8 text-center max-w-xs">
          {call.state === "failed"
            ? "We couldn't connect your call."
            : "Call ended because the connection was lost."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => call.startSearching(call.mode ?? "both")}
            className="px-6 py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium"
          >
            Try Again
          </button>
          <button
            onClick={() => navigate("/home")}
            className="px-6 py-3 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
          >
            Home
          </button>
        </div>
      </FullscreenCenter>
    );
  }

  if (call.state === "ended") {
    return (
      <FullscreenCenter>
        <p className="text-lg mb-1">Conversation ended</p>
        <p className="text-neutral-400 mb-8">{formatDuration(call.callDurationSeconds)}</p>

        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setFeedback("up")}
            className={`text-2xl p-2 rounded-full ${feedback === "up" ? "bg-charcoal" : ""}`}
            aria-label="Good experience"
          >
            👍
          </button>
          <button
            onClick={() => setFeedback("down")}
            className={`text-2xl p-2 rounded-full ${feedback === "down" ? "bg-charcoal" : ""}`}
            aria-label="Bad experience"
          >
            👎
          </button>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => call.startSearching(call.mode ?? "both")}
            className="py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium"
          >
            Match Again
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => setShowReport(true)}
              className="flex-1 py-3 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors text-sm"
            >
              Report
            </button>
            <button
              onClick={() => setShowBlockConfirm(true)}
              className="flex-1 py-3 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors text-sm"
            >
              Block
            </button>
          </div>
          <button onClick={() => navigate("/home")} className="text-sm text-neutral-400 hover:text-white py-2">
            Home
          </button>
        </div>

        {showReport && (
          <ReportModal
            peerId={call.peerId}
            callSessionId={call.callSessionId}
            onClose={() => setShowReport(false)}
          />
        )}
        {showBlockConfirm && (
          <BlockConfirmModal peerId={call.peerId} onClose={() => setShowBlockConfirm(false)} />
        )}
      </FullscreenCenter>
    );
  }

  // connecting / connected / poor_connection / reconnecting
  return (
    <div className="min-h-screen bg-midnight text-white relative overflow-hidden">
      <StatusBar state={call.state} durationSeconds={call.callDurationSeconds} />

      {call.mode === "video" ? (
        <VideoCallView localStream={call.localStream} remoteStream={call.remoteStream} />
      ) : (
        <VoiceCallView connected={call.state === "connected"} />
      )}

      <ControlBar
        mode={call.mode}
        micEnabled={call.micEnabled}
        cameraEnabled={call.cameraEnabled}
        onToggleMic={call.toggleMic}
        onToggleCamera={call.toggleCamera}
        onSwitchCamera={call.switchCamera}
        onNext={call.nextUser}
        onEnd={call.endCall}
        onReport={() => setShowReport(true)}
        onBlock={() => setShowBlockConfirm(true)}
      />

      {showReport && (
        <ReportModal peerId={call.peerId} callSessionId={call.callSessionId} onClose={() => setShowReport(false)} />
      )}
      {showBlockConfirm && (
        <BlockConfirmModal
          peerId={call.peerId}
          onClose={() => setShowBlockConfirm(false)}
          onBlocked={call.endCall}
        />
      )}
    </div>
  );
}

function StatusBar({ state, durationSeconds }: { state: string; durationSeconds: number }) {
  const label =
    state === "connected"
      ? "Connected"
      : state === "reconnecting"
      ? "Reconnecting…"
      : state === "poor_connection"
      ? "Poor connection"
      : "Connecting…";
  const dotColor =
    state === "connected"
      ? "bg-status-connected"
      : state === "reconnecting" || state === "poor_connection"
      ? "bg-status-connecting"
      : "bg-neutral-500";

  return (
    <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        {label}
      </div>
      {state === "connected" && <span className="text-sm tabular-nums">{formatDuration(durationSeconds)}</span>}
    </div>
  );
}

function VideoCallView({ localStream, remoteStream }: { localStream: MediaStream | null; remoteStream: MediaStream | null }) {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);
  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  return (
    <div className="absolute inset-0 bg-black">
      <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" />
      {!remoteStream && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
          Waiting for video…
        </div>
      )}
      <video
        ref={localRef}
        autoPlay
        playsInline
        muted
        className="absolute bottom-24 right-4 w-28 h-40 rounded-xl object-cover border border-neutral-700 bg-graphite"
      />
    </div>
  );
}

function VoiceCallView({ connected }: { connected: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <div className="w-28 h-28 rounded-full bg-charcoal border border-neutral-800 flex items-center justify-center text-4xl">
        🎙️
      </div>
      <p className="text-neutral-400">Someone new</p>
      <div className="flex items-end gap-1 h-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`w-1.5 rounded-full bg-violet ${connected ? "animate-pulse" : "opacity-30"}`}
            style={{ height: `${8 + (i % 3) * 6}px`, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function ControlBar({
  mode,
  micEnabled,
  cameraEnabled,
  onToggleMic,
  onToggleCamera,
  onSwitchCamera,
  onNext,
  onEnd,
  onReport,
  onBlock,
}: {
  mode: "video" | "voice" | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onNext: () => void;
  onEnd: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  return (
    <div className="absolute bottom-0 inset-x-0 z-10 px-4 py-5 bg-gradient-to-t from-black/70 to-transparent">
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <CircleButton onClick={onToggleMic} active={!micEnabled}>
          {micEnabled ? "🎤" : "🔇"}
        </CircleButton>
        {mode === "video" && (
          <>
            <CircleButton onClick={onToggleCamera} active={!cameraEnabled}>
              {cameraEnabled ? "📷" : "📵"}
            </CircleButton>
            <CircleButton onClick={onSwitchCamera}>🔄</CircleButton>
          </>
        )}
        <CircleButton onClick={onReport}>🚩</CircleButton>
        <CircleButton onClick={onBlock}>🚫</CircleButton>
        <button
          onClick={onNext}
          className="px-5 py-3 rounded-full bg-charcoal border border-neutral-700 hover:border-neutral-500 transition-colors text-sm font-medium"
        >
          Next
        </button>
        <button
          onClick={onEnd}
          className="px-5 py-3 rounded-full bg-status-error hover:brightness-110 transition-all text-sm font-medium"
        >
          End
        </button>
      </div>
    </div>
  );
}

function CircleButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${
        active ? "bg-status-error/20 border-status-error" : "bg-charcoal border-neutral-700 hover:border-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}

function ReportModal({
  peerId,
  callSessionId,
  onClose,
}: {
  peerId: string | null;
  callSessionId: string | null;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0].value);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!peerId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.reportUser({
        reportedUserId: peerId,
        callSessionId: callSessionId ?? undefined,
        category,
        description: description || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      {done ? (
        <>
          <p className="mb-6">Report submitted. Thank you for helping keep Tingle safe.</p>
          <button onClick={onClose} className="w-full py-3 rounded-full bg-violet font-medium">
            Close
          </button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold mb-4">Report this person</h2>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 text-white mb-3"
          >
            {REPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Optional details"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 text-white mb-4"
          />
          {error && <p className="text-sm text-status-error mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-full border border-neutral-700 text-sm">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !peerId}
              className="flex-1 py-3 rounded-full bg-violet font-medium text-sm disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function BlockConfirmModal({
  peerId,
  onClose,
  onBlocked,
}: {
  peerId: string | null;
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!peerId) return;
    setSubmitting(true);
    try {
      await api.blockUser(peerId);
      onBlocked?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to block user");
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 className="text-lg font-semibold mb-2">Block this person?</h2>
      <p className="text-sm text-neutral-400 mb-4">You won't be matched with them again.</p>
      {error && <p className="text-sm text-status-error mb-3">{error}</p>}
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-full border border-neutral-700 text-sm">
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting || !peerId}
          className="flex-1 py-3 rounded-full bg-status-error font-medium text-sm disabled:opacity-50"
        >
          {submitting ? "Blocking…" : "Block"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-20 bg-black/70 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-graphite border border-neutral-800 rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function FullscreenCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-midnight text-white flex flex-col items-center justify-center px-6">
      {children}
    </div>
  );
}
