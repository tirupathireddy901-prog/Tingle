import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-midnight text-white">
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="text-xl font-semibold tracking-tight">Tingle</span>
        <nav className="flex gap-3">
          <Link to="/login" className="px-4 py-2 text-sm text-neutral-300 hover:text-white">
            Log in
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 text-sm rounded-full bg-violet hover:bg-indigo transition-colors"
          >
            Start Tingle
          </Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <span className="inline-block mb-6 px-3 py-1 rounded-full bg-charcoal text-xs tracking-wide text-neutral-400 border border-neutral-800">
          18+ ONLY
        </span>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-4">
          Meet someone new.
        </h1>
        <p className="text-neutral-400 text-lg mb-10">
          Random conversations with real people, designed around privacy and control.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/signup"
            className="px-6 py-3 rounded-full bg-violet hover:bg-indigo transition-colors font-medium"
          >
            Start Tingle
          </Link>
          <a
            href="#how-it-works"
            className="px-6 py-3 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors font-medium"
          >
            How It Works
          </a>
        </div>
      </main>

      <section id="how-it-works" className="max-w-4xl mx-auto px-6 py-16 grid sm:grid-cols-2 gap-6">
        {[
          { title: "Video calls", body: "Full-screen video with a partner matched to your preferences." },
          { title: "Voice calls", body: "Talk without video, whenever you'd rather just listen." },
          { title: "Privacy", body: "No exact location, no exposed contact details, ever." },
          { title: "Safety", body: "Block and report are one tap away, on every screen and every call." },
        ].map((card) => (
          <div key={card.title} className="rounded-2xl bg-graphite border border-neutral-800 p-6">
            <h3 className="font-medium mb-2">{card.title}</h3>
            <p className="text-sm text-neutral-400">{card.body}</p>
          </div>
        ))}
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-10 text-sm text-neutral-500 flex flex-wrap gap-4 justify-center border-t border-neutral-900">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/community-guidelines">Community Guidelines</Link>
        <Link to="/safety">Safety</Link>
      </footer>
    </div>
  );
}
