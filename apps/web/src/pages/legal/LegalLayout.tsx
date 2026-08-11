import { Link } from "react-router-dom";

export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-midnight text-white">
      <header className="max-w-2xl mx-auto px-6 py-6">
        <Link to="/" className="text-sm text-neutral-400 hover:text-white">
          ← Back to Tingle
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 pb-20 prose-invert">
        <h1 className="text-2xl font-semibold mb-6">{title}</h1>
        <div className="space-y-4 text-neutral-300 text-sm leading-relaxed">{children}</div>
      </main>
    </div>
  );
}
