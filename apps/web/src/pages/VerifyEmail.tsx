import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const emailFromQuery = params.get("email") ?? "";

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    token ? "verifying" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(emailFromQuery);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setError(err instanceof ApiError ? err.message : "Verification failed");
      });
  }, [token]);

  if (status === "verifying") {
    return <Centered>Verifying your email…</Centered>;
  }

  if (status === "success") {
    return (
      <Centered>
        <p className="mb-6">Your email is verified.</p>
        <button
          onClick={() => navigate("/login")}
          className="px-6 py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium"
        >
          Log in
        </button>
      </Centered>
    );
  }

  if (status === "error") {
    return (
      <Centered>
        <p className="mb-2 text-status-error">{error}</p>
        <p className="text-sm text-neutral-400 mb-6">The link may have expired. Request a new one below.</p>
        <ResendForm email={email} setEmail={setEmail} resent={resent} setResent={setResent} />
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-2xl font-semibold mb-2">Verify your email</h1>
      <p className="text-neutral-400 mb-6">
        We sent a verification link to {email || "your email address"}. Click it to activate your account.
      </p>
      <ResendForm email={email} setEmail={setEmail} resent={resent} setResent={setResent} />
      <Link to="/login" className="block mt-6 text-sm text-neutral-400 hover:text-white">
        Back to login
      </Link>
    </Centered>
  );
}

function ResendForm({
  email,
  setEmail,
  resent,
  setResent,
}: {
  email: string;
  setEmail: (v: string) => void;
  resent: boolean;
  setResent: (v: boolean) => void;
}) {
  const [sending, setSending] = useState(false);

  async function handleResend() {
    if (!email) return;
    setSending(true);
    try {
      await api.resendVerification(email);
    } finally {
      setResent(true);
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white"
      />
      <button
        onClick={handleResend}
        disabled={sending || !email}
        className="w-full py-3 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors font-medium disabled:opacity-50"
      >
        {sending ? "Sending…" : resent ? "Sent — resend again" : "Resend verification email"}
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-midnight text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">{children}</div>
    </div>
  );
}
