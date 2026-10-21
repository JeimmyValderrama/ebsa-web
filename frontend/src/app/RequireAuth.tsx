import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth, type UserRole } from "../auth/AuthProvider";

const ALL_ROLES: UserRole[] = ["COMERCIAL", "SOPORTE", "ADMIN_MODELO"];

function hasRole(role: UserRole | null | undefined, allowed: UserRole[]): boolean {
  return Boolean(role && allowed.includes(role));
}

/** Protege un grupo de rutas: exige sesión y, si se indica, uno de los roles. */
export default function RequireAuth({ roles = ALL_ROLES }: { roles?: UserRole[] }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="auth-page"><div className="auth-card"><span className="eyebrow">EBSA / AUTENTICACIÓN</span><h1>Validando acceso…</h1></div></div>;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!hasRole(currentUser.role, roles)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Protege una ruta individual con roles específicos. */
export function RoleRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { currentUser } = useAuth();
  if (!hasRole(currentUser?.role, roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
