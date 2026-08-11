import { LegalLayout } from "./LegalLayout";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service">
      <p className="text-neutral-500 italic">
        Draft terms for local/self-hosted deployments. Have this reviewed by a lawyer before any
        public launch.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Eligibility</h2>
      <p>
        You must be 18 or older to create an account or use Tingle. By creating an account you
        confirm you meet this requirement.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Your conduct</h2>
      <p>
        You agree to follow the{" "}
        <a href="/community-guidelines" className="underline">
          Community Guidelines
        </a>{" "}
        on every call and interaction. Violations may result in restriction, suspension, or a
        permanent ban.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">No warranty</h2>
      <p>
        Tingle is provided "as is." We do not guarantee uninterrupted service, and we are not
        responsible for the conduct of other users you're matched with.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Termination</h2>
      <p>
        We may suspend or terminate your account for violations of these terms or the Community
        Guidelines. You may delete your account at any time from the Privacy Center.
      </p>
    </LegalLayout>
  );
}
