import { createContext, useContext, useState, type ReactNode } from "react";
import { adminApi, getAdminToken, setAdminToken, clearAdminToken } from "./api";

interface AdminAuthValue {
  role: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<string | null>(
    // Role isn't persisted separately from the token in this pass — a
    // page refresh clears it but keeps the token; re-login is required to
    // restore role-gated UI. Acceptable for an internal tool; a /admin/me
    // endpoint would remove this rough edge later.
    null
  );
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAdminToken());

  async function login(email: string, password: string) {
    const result = await adminApi.login(email, password);
    setAdminToken(result.accessToken);
    setRole(result.role);
    setIsAuthenticated(true);
  }

  function logout() {
    clearAdminToken();
    setRole(null);
    setIsAuthenticated(false);
  }

  return (
    <AdminAuthContext.Provider value={{ role, isAuthenticated, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
