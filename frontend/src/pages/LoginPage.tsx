import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isFirebaseConfigured, signIn } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";

export default function LoginPage() {
  const { currentUser, loading, configured, authError } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = (location.state as { from?: string } | null)?.from ?? "/";

  if (loading) return <div className="auth-page"><div className="auth-card"><span className="eyebrow">EBSA / AUTENTICACIÓN</span><h1>Comprobando sesión…</h1></div></div>;
  if (currentUser) return <Navigate to={destination} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-decoration" aria-hidden="true"><span>EBSA</span><b>⚡</b></div>
      <section className="auth-card">
        <div className="brand-lockup auth-brand"><div className="brand-mark">⚡</div><div><div className="brand-name">EBSA</div><div className="brand-subtitle">Consumo de clientes</div></div></div>
        <div className="eyebrow accent-eyebrow">ACCESO SEGURO</div>
        <h1>Ingresa a tu centro de decisiones.</h1>
        <p className="auth-intro">Usa la cuenta individual habilitada para consultar la información de EBSA.</p>
        {!configured && <div className="notice notice-warning">Firebase todavía no está configurado. En la siguiente entrega se agregarán las variables del proyecto y podrás iniciar sesión.</div>}
        {authError && <div className="notice notice-error">{authError}</div>}
        {error && <div className="notice notice-error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={!isFirebaseConfigured || submitting} /></label>
          <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={!isFirebaseConfigured || submitting} /></label>
          <button className="primary-button auth-submit" type="submit" disabled={!isFirebaseConfigured || submitting}>{submitting ? "Validando…" : "Ingresar"}<span>→</span></button>
        </form>
        <div className="auth-footnote">La autorización de cada módulo se valida también en el backend.</div>
      </section>
    </div>
  );
}
