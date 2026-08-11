import { NavLink, Outlet } from "react-router-dom";
import { useAdminAuth } from "../lib/AdminAuthContext";

export default function Layout() {
  const { logout } = useAdminAuth();

  return (
    <div className="min-h-screen bg-midnight text-white">
      <header className="border-b border-neutral-900">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-semibold">Tingle Admin</span>
          <nav className="flex items-center gap-5 text-sm">
            <NavLink to="/reports" className={navClass}>
              Report Queue
            </NavLink>
            <NavLink to="/appeals" className={navClass}>
              Appeals
            </NavLink>
            <button onClick={logout} className="text-neutral-400 hover:text-white">
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "text-white" : "text-neutral-400 hover:text-white";
}
