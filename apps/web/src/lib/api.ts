// Talks to the backend through relative /api paths — this only works when
// the app is loaded through Nginx (docker-compose maps that to
// http://localhost:8080), which proxies /api/* to the API service. Loading
// the Vite dev server directly on :5173 will not have a working /api.

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "https://tingle-production.up.railway.app"; // production-api

const ACCESS_TOKEN_KEY = "tingle_access_token";
const REFRESH_TOKEN_KEY = "tingle_refresh_token";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
export function setTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}
export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retrying = false
): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Transparent refresh-and-retry once on a 401, so callers don't each
  // need to handle expired access tokens themselves.
  if (res.status === 401 && !retrying && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, true);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body);
  }
  return body as T;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    setTokens(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

// ---- Typed API calls ----

export interface CurrentUser {
  id: string;
  displayName: string;
  profilePhotoUrl: string | null;
  ageVerified: boolean;
  accountStatus: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export const api = {
  signup: (data: {
    displayName: string;
    email: string;
    password: string;
    confirmPassword: string;
    dateOfBirth: string;
    agreeAge18: true;
    agreeTerms: true;
    agreePrivacy: true;
    agreeCommunityGuidelines: true;
  }) => request<{ message: string }>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),

  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; requiresEmailVerification: boolean }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  logout: () => {
    const refreshToken = getRefreshToken();
    return request<{ message: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },

  verifyEmail: (token: string) =>
    request<{ message: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),

  resendVerification: (email: string) =>
    request<{ message: string }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  requestPasswordReset: (email: string) =>
    request<{ message: string }>("/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),

  me: () => request<CurrentUser>("/auth/me"),

  blockUser: (blockedUserId: string) =>
    request<{ message: string }>("/blocks", { method: "POST", body: JSON.stringify({ blockedUserId }) }),

  reportUser: (data: {
    reportedUserId: string;
    callSessionId?: string;
    category: string;
    description?: string;
  }) => request<{ message: string; reportId: string }>("/reports", { method: "POST", body: JSON.stringify(data) }),

  listBlocks: () =>
    request<{ userId: string; displayName: string; profilePhotoUrl: string | null; blockedAt: string }[]>(
      "/blocks"
    ),

  getIceServers: () =>
    request<{ iceServers: RTCIceServer[] }>("/webrtc/ice-servers"),

  submitAppeal: (message: string) =>
    request<{ message: string; appealId: string }>("/appeals", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};
