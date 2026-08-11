import { useEffect, useState } from "react";
import { adminApi, type Report, ApiError } from "../lib/api";

const STATUS_FILTERS = ["open", "in_review", "resolved", "dismissed"] as const;
const ACTIONS = [
  { value: "dismiss", label: "Dismiss" },
  { value: "warn", label: "Warn" },
  { value: "restrict", label: "Restrict" },
  { value: "suspend", label: "Suspend" },
  { value: "ban", label: "Ban" },
] as const;

export default function Reports() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<Report | null>(null);

  function load() {
    setLoading(true);
    adminApi
      .listReports(status)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Report Queue</h1>
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
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-neutral-500 text-sm">No {status.replace("_", " ")} reports.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-4 ${
                r.category === "possible_minor"
                  ? "border-status-error bg-status-error/10"
                  : "border-neutral-800 bg-graphite"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{r.category.replace("_", " ")}</span>
                    {r.category === "possible_minor" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-status-error text-white">
                        HIGH PRIORITY
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-400 mb-1">
                    Reported: {r.reported_display_name} · account: {r.reported_account_status}
                  </p>
                  {r.description && <p className="text-sm text-neutral-300">{r.description}</p>}
                  <p className="text-xs text-neutral-600 mt-2">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                {status === "open" && (
                  <button
                    onClick={() => setActingOn(r)}
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

      {actingOn && (
        <ActionModal report={actingOn} onClose={() => setActingOn(null)} onDone={() => { setActingOn(null); load(); }} />
      )}
    </div>
  );
}

function ActionModal({
  report,
  onClose,
  onDone,
}: {
  report: Report;
  onClose: () => void;
  onDone: () => void;
}) {
  const [action, setAction] = useState<(typeof ACTIONS)[number]["value"]>("dismiss");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.actOnReport(report.id, action, note || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply action");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-6 z-10" onClick={onClose}>
      <div
        className="w-full max-w-md bg-graphite border border-neutral-800 rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Review report</h2>
        <p className="text-sm text-neutral-400 mb-4">
          {report.reported_display_name} · {report.category.replace("_", " ")}
        </p>

        <div className="grid grid-cols-5 gap-2 mb-4">
          {ACTIONS.map((a) => (
            <button
              key={a.value}
              onClick={() => setAction(a.value)}
              className={`py-2 rounded-lg text-xs border ${
                action === a.value
                  ? "bg-violet border-violet"
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <textarea
          placeholder="Moderator note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
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
            disabled={submitting}
            className="flex-1 py-3 rounded-full bg-violet font-medium text-sm disabled:opacity-50"
          >
            {submitting ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
