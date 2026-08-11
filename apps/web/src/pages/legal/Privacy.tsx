import { LegalLayout } from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="text-neutral-500 italic">
        Draft policy for local/self-hosted deployments. Have this reviewed by a lawyer before any
        public launch — this is a starting point, not a substitute for legal advice.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">What we collect</h2>
      <p>
        Account data (email, display name, hashed password — never plaintext), age-eligibility
        status, profile details you choose to add, discovery preferences, call metadata (who you
        matched with, when, and for how long — never call audio or video content), device and
        network information needed to operate the service, and reports or blocks you submit.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">What we don't collect</h2>
      <p>
        We do not record call audio or video by default. We do not store your exact GPS location —
        only a broad region if you choose to enable region matching. We never expose your email,
        phone number, or exact location to other users.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">How your data is used</h2>
      <p>
        To operate matchmaking, enforce age eligibility and safety rules, respond to reports, and
        maintain account security (login sessions, rate limiting, abuse prevention).
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Retention and deletion</h2>
      <p>
        You can export your own data or delete your account from the Privacy Center at any time.
        Deletion is subject to legitimate retention requirements — for example, records tied to an
        open safety report may be retained briefly for review even after account deletion.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Security</h2>
      <p>
        We use industry-standard practices — encrypted connections, hashed passwords, hashed
        tokens — to protect your data. No system is 100% secure, and we don't claim otherwise.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Children's privacy</h2>
      <p>
        Tingle is restricted to users 18 and older. We do not knowingly collect data from minors. If
        we learn an account belongs to a minor, it is restricted and removed.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, export, or delete your
        data. Contact us to exercise these rights.
      </p>
    </LegalLayout>
  );
}
