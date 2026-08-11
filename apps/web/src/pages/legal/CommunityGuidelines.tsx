import { LegalLayout } from "./LegalLayout";

const PROHIBITED = [
  "Underage users of any kind",
  "Sexual exploitation or child sexual abuse material in any form",
  "Harassment, threats, or hate speech",
  "Violence or incitement to violence",
  "Fraud, scams, blackmail, or extortion",
  "Doxxing or sharing another person's private information",
  "Impersonation of another person",
  "Spam or automated/bot activity",
  "Illegal activity of any kind",
  "Ban evasion",
  "Non-consensual recording of a call",
];

export default function CommunityGuidelines() {
  return (
    <LegalLayout title="Community Guidelines">
      <p>
        Tingle exists for real, respectful conversations between adults. These guidelines apply to
        every call, every profile, and every interaction on the platform.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Prohibited on Tingle</h2>
      <ul className="list-disc pl-5 space-y-1">
        {PROHIBITED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2 className="text-white font-medium mt-6 mb-2">Enforcement</h2>
      <p>
        Violations may result in a warning, a temporary restriction, a suspension, or a permanent
        ban, depending on severity. Reports involving a possible minor are escalated immediately and
        the reported account is restricted pending review.
      </p>

      <h2 className="text-white font-medium mt-6 mb-2">Reporting</h2>
      <p>
        Every call includes one-tap Report and Block controls. Use them any time something feels
        wrong — you don't need to be certain, and you won't need to justify the report to the other
        person.
      </p>
    </LegalLayout>
  );
}
