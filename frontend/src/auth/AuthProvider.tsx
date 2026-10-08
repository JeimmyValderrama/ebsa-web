import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { getIdToken, isFirebaseConfigured, subscribeToAuth, signOutCurrentUser } from "../lib/firebase";

export type UserRole = "COMERCIAL" | "SOPORTE" | "ADMIN_MODELO";

type BackendUser = {
  uid: string;
  email?: string;
  name?: string;
  role?: UserRole | null;
  email_verified: boolean;
};

type AuthContextValue = {
  firebaseUser: User | null;
  currentUser: BackendUser | null;
  loading: boolean;
  configured: boolean;
  authError: string | null;
  refreshBackendUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadBackendUser(user: User): Promise<BackendUser> {
  const token = await getIdToken(user);
  const response = await fetch("/api/me", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail ?? "No fue posible validar la sesión en el backend.");
  }
  return response.json() as Promise<BackendUser>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    return subscribeToAuth((user) => {
      setFirebaseUser(user);
      setLoading(Boolean(user));
      setAuthError(null);
      if (!user) setCurrentUser(null);
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    loadBackendUser(firebaseUser)
      .then((user) => {
        setCurrentUser(user);
        setAuthError(null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        setCurrentUser(null);
        setAuthError(error instanceof Error ? error.message : "Sesión no autorizada.");
        setLoading(false);
      });
  }, [firebaseUser]);

  const value = useMemo<AuthContextValue>(() => ({
    firebaseUser,
    currentUser,
    loading,
    configured: isFirebaseConfigured,
    authError,
    refreshBackendUser: async () => {
      if (!firebaseUser) return;
      setCurrentUser(await loadBackendUser(firebaseUser));
    },
    logout: async () => {
      await signOutCurrentUser();
      setFirebaseUser(null);
      setCurrentUser(null);
      setAuthError(null);
    },
  }), [authError, currentUser, firebaseUser, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}
