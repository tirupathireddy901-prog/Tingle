import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface BlockedUser {
  userId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  blockedAt: string;
}

export default function Safety() {
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listBlocks()
      .then(setBlocked)
      .catch(() => setBlocked([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-midnight text-white">
      <header className="max-w-2xl mx-auto px-6 py-6 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-neutral-400 hover:text-white">
          ← Back
        </button>
        <span className="font-semibold">Safety Center</span>
        <span className="w-10" />
      </header>

      <main className="max-w-2xl mx-auto px-6 pb-20 space-y-8">
        <section>
          <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Blocked users</h2>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : blocked.length === 0 ? (
            <p className="text-sm text-neutral-500">You haven't blocked anyone.</p>
          ) : (
            <ul className="space-y-2">
              {blocked.map((b) => (
                <li
                  key={b.userId}
                  className="flex items-center justify-between bg-graphite border border-neutral-800 rounded-xl px-4 py-3"
                >
                  <span className="text-sm">{b.displayName}</span>
                  <span className="text-xs text-neutral-500">
                    Blocked {new Date(b.blockedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Resources</h2>
          <div className="space-y-2">
            <Link
              to="/community-guidelines"
              className="block bg-graphite border border-neutral-800 rounded-xl px-4 py-3 text-sm hover:border-neutral-600"
            >
              Community Guidelines
            </Link>
            <Link
              to="/privacy"
              className="block bg-graphite border border-neutral-800 rounded-xl px-4 py-3 text-sm hover:border-neutral-600"
            >
              Privacy Policy
            </Link>
          </div>
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Report or block during a call</h2>
          <p className="text-sm text-neutral-400">
            Report and Block are available on every call screen — no need to wait until it ends.
          </p>
        </section>
      </main>
    </div>
  );
}
