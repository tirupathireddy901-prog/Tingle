import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminApi, ApiError } from "../lib/api";

export default function Bootstrap() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminApi.bootstrap(form.email, form.password, form.displayName);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bootstrap failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-midnight text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-center mb-2">Create the first admin</h1>
        <p className="text-sm text-neutral-500 text-center mb-8">
          This only works once — before any admin account exists.
        </p>

        {done ? (
          <div className="text-center">
            <p className="mb-6">Admin account created as super_admin.</p>
            <button
              onClick={() => navigate("/login")}
              className="px-6 py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium"
            >
              Go to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              required
              placeholder="Display name"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
            />
            <input
              type="email"
              required
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
            />
            <input
              type="password"
              required
              minLength={12}
              placeholder="Password (12+ characters)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
            />
            {error && <p className="text-sm text-status-error">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create admin"}
            </button>
          </form>
        )}

        <Link to="/login" className="block text-center mt-6 text-sm text-neutral-500 hover:text-white">
          Back to login
        </Link>
      </div>
    </div>
  );
}
