import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useCall } from "../lib/CallContext";

export default function Home() {
  const { user, logout } = useAuth();
  const { startSearching } = useCall();
  const navigate = useNavigate();

  async function handleStart(mode: "video" | "voice") {
    await startSearching(mode);
    navigate("/call");
  }

  return (
    <div className="min-h-screen bg-midnight text-white flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto w-full">
        <span className="text-lg font-semibold">Tingle</span>
        <div className="flex items-center gap-4 text-sm text-neutral-400">
          <span>{user?.displayName}</span>
          <button onClick={logout} className="hover:text-white">
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-10">
        <h1 className="text-3xl font-semibold text-center">Ready to meet someone?</h1>

        <div className="grid sm:grid-cols-2 gap-4 w-full max-w-md">
          <ModeCard
            title="VIDEO TINGLE"
            subtitle="Meet someone through video."
            onClick={() => handleStart("video")}
          />
          <ModeCard
            title="VOICE TINGLE"
            subtitle="Talk without video."
            onClick={() => handleStart("voice")}
          />
        </div>

        <div className="flex gap-6 text-sm text-neutral-400">
          <button className="hover:text-white" onClick={() => navigate("/safety")}>
            Safety Center
          </button>
        </div>
      </main>
    </div>
  );
}

function ModeCard({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl bg-graphite border border-neutral-800 p-6 hover:border-violet transition-colors"
    >
      <h2 className="font-semibold tracking-wide mb-1">{title}</h2>
      <p className="text-sm text-neutral-400">{subtitle}</p>
    </button>
  );
}
