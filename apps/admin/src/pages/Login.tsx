import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { ApiError } from "../lib/api";

export default function Login() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/reports");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-midnight text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center mb-1">Tingle Admin</h1>
        <p className="text-sm text-neutral-500 text-center mb-8">Internal moderation tools</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
          />
          {error && <p className="text-sm text-status-error">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-600 mt-8">
          First time setting this up?{" "}
          <Link to="/bootstrap" className="underline">
            Create the first admin
          </Link>
        </p>
      </div>
    </div>
  );
}
