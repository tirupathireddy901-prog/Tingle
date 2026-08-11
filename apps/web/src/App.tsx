import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { CallProvider } from "./lib/CallContext";

import Landing from "./pages/Landing";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Home from "./pages/Home";
import Call from "./pages/Call";
import Safety from "./pages/Safety";
import Restricted from "./pages/Restricted";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import CommunityGuidelines from "./pages/legal/CommunityGuidelines";

// Gates /home and /call behind an authenticated session, and provides
// CallContext with the confirmed user id it needs for deterministic
// WebRTC offer/answer initiation (see CallContext.tsx). A restricted,
// suspended, or banned account is routed to the appeal screen instead of
// the call-provider tree — matchmaking and signaling both re-check
// account_status server-side regardless, but there's no reason to spin
// up a WebRTC context for an account that can't place a call.
function AuthenticatedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center text-neutral-500">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.accountStatus !== "active") return <Navigate to="/restricted" replace />;

  return (
    <CallProvider currentUserId={user.id}>
      <Outlet />
    </CallProvider>
  );
}

function RestrictedLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center text-neutral-500">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.accountStatus === "active") return <Navigate to="/home" replace />;
  return <Restricted />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/community-guidelines" element={<CommunityGuidelines />} />

          <Route element={<AuthenticatedLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/call" element={<Call />} />
            <Route path="/safety" element={<Safety />} />
          </Route>

          <Route path="/restricted" element={<RestrictedLayout />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
