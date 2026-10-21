import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { configureApi } from "../lib/api";
import { getIdToken, isFirebaseConfigured, signOutCurrentUser, subscribeToAuth } from "../lib/firebase";

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
  idToken: string | null;
  loading: boolean;
  configured: boolean;
  authError: string | null;
  refreshBackendUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_EXPIRED = "Tu sesión expiró. Vuelve a iniciar sesión.";

async function loadBackendUser(user: User): Promise<BackendUser> {
  const token = await getIdToken(user);
  const response = await fetch("/api/me", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "No fue posible validar la sesión en el backend.");
  }
  return response.json() as Promise<BackendUser>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<BackendUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    userRef.current = firebaseUser;
  }, [firebaseUser]);

  useEffect(() => {
    configureApi({
      getToken: async (forceRefresh?: boolean) => {
        const user = userRef.current;
        if (!user) throw new Error(SESSION_EXPIRED);
        const token = await getIdToken(user, forceRefresh ?? false);
        setIdToken(token);
        return token;
      },
      onUnauthorized: () => {
        setAuthError(SESSION_EXPIRED);
        setCurrentUser(null);
        setIdToken(null);
        void signOutCurrentUser();
      },
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    return subscribeToAuth((user) => {
      setFirebaseUser(user);
      setLoading(Boolean(user));
      setAuthError(null);
      if (!user) {
        setCurrentUser(null);
        setIdToken(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    Promise.all([loadBackendUser(firebaseUser), getIdToken(firebaseUser)])
      .then(([user, token]) => {
        setCurrentUser(user);
        setIdToken(token);
        setAuthError(null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        setCurrentUser(null);
        setAuthError(error instanceof Error ? error.message : "Sesión no autorizada.");
        setLoading(false);
      });
  }, [firebaseUser]);

  const refreshBackendUser = useCallback(async () => {
    if (!userRef.current) return;
    const token = await getIdToken(userRef.current, true);
    setIdToken(token);
    setCurrentUser(await loadBackendUser(userRef.current));
  }, []);

  const logout = useCallback(async () => {
    await signOutCurrentUser();
    setFirebaseUser(null);
    setCurrentUser(null);
    setIdToken(null);
    setAuthError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ firebaseUser, currentUser, idToken, loading, configured: isFirebaseConfigured, authError, refreshBackendUser, logout }),
    [authError, currentUser, firebaseUser, idToken, loading, logout, refreshBackendUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}
