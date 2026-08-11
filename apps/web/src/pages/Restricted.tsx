import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { api, ApiError } from "../lib/api";

export default function Restricted() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.submitAppeal(message);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit appeal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-midnight text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold mb-2">Your account has been restricted.</h1>
        <p className="text-neutral-400 mb-8">
          {user?.accountStatus === "banned"
            ? "This account has been permanently banned."
            : "This account currently can't match or make calls."}
        </p>

        {submitted ? (
          <p className="text-neutral-300">
            Your appeal has been submitted for review. We'll update your account status once it's
            been decided.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <label className="block">
              <span className="block text-sm text-neutral-400 mb-1.5">Explain what happened</span>
              <textarea
                required
                rows={5}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
              />
            </label>
            {error && <p className="text-sm text-status-error">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit appeal"}
            </button>
          </form>
        )}

        <button
          onClick={() => {
            logout();
            navigate("/");
          }}
          className="mt-8 text-sm text-neutral-500 hover:text-white"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
