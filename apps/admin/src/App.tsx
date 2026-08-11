import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminAuthProvider, useAdminAuth } from "./lib/AdminAuthContext";
import Login from "./pages/Login";
import Bootstrap from "./pages/Bootstrap";
import Layout from "./pages/Layout";
import Reports from "./pages/Reports";
import Appeals from "./pages/Appeals";

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAdminAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/bootstrap" element={<Bootstrap />} />

          <Route
            element={
              <RequireAdmin>
                <Layout />
              </RequireAdmin>
            }
          >
            <Route path="/reports" element={<Reports />} />
            <Route path="/appeals" element={<Appeals />} />
          </Route>

          <Route path="*" element={<Navigate to="/reports" replace />} />
        </Routes>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
