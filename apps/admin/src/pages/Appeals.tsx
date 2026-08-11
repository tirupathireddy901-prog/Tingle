import { useEffect, useState } from "react";
import { adminApi, type Appeal, ApiError } from "../lib/api";

const STATUS_FILTERS = ["pending", "approved", "denied"] as const;

export default function Appeals() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("pending");
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingOn, setDecidingOn] = useState<Appeal | null>(null);

  function load() {
    setLoading(true);
    adminApi
      .listAppeals(status)
      .then(setAppeals)
      .catch(() => setAppeals([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Appeals</h1>
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs border ${
                status === s
                  ? "bg-violet border-violet"
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : appeals.length === 0 ? (
        <p className="text-neutral-500 text-sm">No {status} appeals.</p>
      ) : (
        <div className="space-y-3">
          {appeals.map((a) => (
            <div key={a.id} className="rounded-xl border border-neutral-800 bg-graphite p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium mb-1">{a.display_name}</p>
                  <p className="text-sm text-neutral-300 mb-2">{a.message}</p>
                  <p className="text-xs text-neutral-600">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                {status === "pending" && (
                  <button
                    onClick={() => setDecidingOn(a)}
                    className="shrink-0 px-4 py-2 rounded-full bg-violet hover:bg-indigo transition-colors text-sm font-medium"
                  >
                    Review
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {decidingOn && (
        <DecisionModal
          appeal={decidingOn}
          onClose={() => setDecidingOn(null)}
          onDone={() => {
            setDecidingOn(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DecisionModal({
  appeal,
  onClose,
  onDone,
}: {
  appeal: Appeal;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function decide(decision: "approved" | "denied") {
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.decideAppeal(appeal.id, decision, note || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record decision");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-6 z-10" onClick={onClose}>
      <div
        className="w-full max-w-md bg-graphite border border-neutral-800 rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Review appeal</h2>
        <p className="text-sm text-neutral-400 mb-4">{appeal.display_name}</p>
        <p className="text-sm text-neutral-300 mb-4 bg-charcoal rounded-lg p-3">{appeal.message}</p>

        <textarea
          placeholder="Decision note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 text-white mb-4"
        />

        {error && <p className="text-sm text-status-error mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-neutral-700 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => decide("denied")}
            disabled={submitting}
            className="flex-1 py-3 rounded-full bg-status-error font-medium text-sm disabled:opacity-50"
          >
            Deny
          </button>
          <button
            onClick={() => decide("approved")}
            disabled={submitting}
            className="flex-1 py-3 rounded-full bg-status-connected font-medium text-sm disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
