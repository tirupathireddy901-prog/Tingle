import { useState, type FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Centered>
        <p className="text-status-error mb-4">This reset link is missing its token.</p>
        <Link to="/forgot-password" className="underline text-sm">
          Request a new one
        </Link>
      </Centered>
    );
  }

  if (done) {
    return (
      <Centered>
        <p className="mb-6">Your password has been updated.</p>
        <button
          onClick={() => navigate("/login")}
          className="px-6 py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium"
        >
          Log in
        </button>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-2xl font-semibold mb-6">Set a new password</h1>
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <label className="block">
          <span className="block text-sm text-neutral-400 mb-1.5">New password</span>
          <input
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
          />
        </label>
        <label className="block">
          <span className="block text-sm text-neutral-400 mb-1.5">Confirm new password</span>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
          />
        </label>
        {error && <p className="text-sm text-status-error">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium disabled:opacity-50"
        >
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-midnight text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">{children}</div>
    </div>
  );
}
