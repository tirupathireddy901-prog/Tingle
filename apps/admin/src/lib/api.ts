// The admin app is intentionally a separate origin/port from the main web
// app (no shared session, no shared token storage) — see docs/ARCHITECTURE.md.
// It talks to the API service directly rather than through the main app's
// Nginx proxy.

const API_BASE = import.meta.env.VITE_API_URL ?? "https://tingle-production.up.railway.app";
const TOKEN_KEY = "tingle_admin_token";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  call_session_id: string | null;
  category: string;
  description: string | null;
  status: string;
  created_at: string;
  reported_display_name: string;
  reported_account_status: string;
}

export interface Appeal {
  id: string;
  user_id: string;
  display_name: string;
  message: string;
  status: string;
  created_at: string;
}

export const adminApi = {
  bootstrap: (email: string, password: string, displayName: string) =>
    request<{ message: string }>("/admin/bootstrap", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string) =>
    request<{ accessToken: string; role: string }>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  listReports: (status?: string) =>
    request<Report[]>(`/admin/reports${status ? `?status=${status}` : ""}`),

  actOnReport: (id: string, action: string, note?: string) =>
    request<{ message: string }>(`/admin/reports/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action, note }),
    }),

  getUser: (id: string) =>
    request<{
      id: string;
      display_name: string;
      account_status: string;
      age_verified: boolean;
      created_at: string;
      last_active_at: string | null;
      reportCount: number;
    }>(`/admin/users/${id}`),

  listAppeals: (status = "pending") => request<Appeal[]>(`/admin/appeals?status=${status}`),

  decideAppeal: (id: string, decision: "approved" | "denied", note?: string) =>
    request<{ message: string }>(`/admin/appeals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    }),
};
