import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function RequireAuth() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="auth-page"><div className="auth-card"><span className="eyebrow">EBSA / AUTENTICACIÓN</span><h1>Validando acceso…</h1></div></div>;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
