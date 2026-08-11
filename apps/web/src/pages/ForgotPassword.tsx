import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.requestPasswordReset(email);
    } finally {
      // Always show the same generic confirmation — the API itself never
      // reveals whether the email exists, and neither does this screen.
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-midnight text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold mb-4">Reset your password</h1>
        {sent ? (
          <p className="text-neutral-400">
            If an account exists for that email, reset instructions have been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <label className="block">
              <span className="block text-sm text-neutral-400 mb-1.5">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send reset instructions"}
            </button>
          </form>
        )}
        <Link to="/login" className="block mt-6 text-sm text-neutral-400 hover:text-white">
          Back to login
        </Link>
      </div>
    </div>
  );
}
