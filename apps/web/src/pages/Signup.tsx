import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: "",
  });
  const [agreements, setAgreements] = useState({
    agreeAge18: false,
    agreeTerms: false,
    agreePrivacy: false,
    agreeCommunityGuidelines: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allAgreed = Object.values(agreements).every(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!allAgreed) {
      setError("Please confirm all agreements below to continue");
      return;
    }

    setSubmitting(true);
    try {
      await api.signup({
        ...form,
        agreeAge18: true,
        agreeTerms: true,
        agreePrivacy: true,
        agreeCommunityGuidelines: true,
      });
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-midnight text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
          <p className="text-sm text-neutral-400">Tingle is for users 18 and older.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Display name">
            <input
              required
              maxLength={60}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Date of birth">
            <input
              type="date"
              required
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              required
              minLength={10}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Confirm password">
            <input
              type="password"
              required
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              className={inputClass}
            />
          </Field>

          <div className="space-y-2 pt-2">
            <Checkbox
              checked={agreements.agreeAge18}
              onChange={(v) => setAgreements({ ...agreements, agreeAge18: v })}
              label="I confirm that I am 18 or older."
            />
            <Checkbox
              checked={agreements.agreeTerms}
              onChange={(v) => setAgreements({ ...agreements, agreeTerms: v })}
              label={
                <>
                  I agree to the <Link to="/terms" className="underline">Terms of Service</Link>.
                </>
              }
            />
            <Checkbox
              checked={agreements.agreePrivacy}
              onChange={(v) => setAgreements({ ...agreements, agreePrivacy: v })}
              label={
                <>
                  I acknowledge the <Link to="/privacy" className="underline">Privacy Policy</Link>.
                </>
              }
            />
            <Checkbox
              checked={agreements.agreeCommunityGuidelines}
              onChange={(v) => setAgreements({ ...agreements, agreeCommunityGuidelines: v })}
              label={
                <>
                  I agree to the{" "}
                  <Link to="/community-guidelines" className="underline">Community Guidelines</Link>.
                </>
              }
            />
          </div>

          {error && <p className="text-sm text-status-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-neutral-400 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-white underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-4 py-2.5 rounded-xl bg-charcoal border border-neutral-800 focus:border-violet outline-none text-white placeholder:text-neutral-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-neutral-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-neutral-300 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-violet"
      />
      <span>{label}</span>
    </label>
  );
}
