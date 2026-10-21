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

  if (loading) return (
    <div className="auth-page">
      <div className="topbar"><div className="marca"><i /><div><b>Analítica de consumo</b><small>Proyecto académico UPTC · no oficial de EBSA</small></div></div></div>
      <div className="auth-card"><span className="eyebrow">EBSA / AUTENTICACIÓN</span><h1>Comprobando sesión…</h1></div>
    </div>
  );
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
      <div className="topbar"><div className="marca"><i /><div><b>Analítica de consumo</b><small>Proyecto académico UPTC · no oficial de EBSA</small></div></div></div>
      <div className="auth-decoration" aria-hidden="true"><span>EBSA</span><b>⚡</b></div>
      <section className="auth-card">
        <div className="eyebrow accent-eyebrow">ACCESO SEGURO</div>
        <h1>Analítica de consumo de clientes</h1>
        <p className="auth-intro">Caídas de consumo, probabilidad de fuga y proyección de consumo en Boyacá. Usa la cuenta individual habilitada para consultar la información de EBSA.</p>
        {!configured && <div className="notice notice-warning">Firebase todavía no está configurado. En la siguiente entrega se agregarán las variables del proyecto y podrás iniciar sesión.</div>}
        {authError && <div className="notice notice-error">{authError}</div>}
        {error && <div className="notice notice-error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={!isFirebaseConfigured || submitting} /></label>
          <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={!isFirebaseConfigured || submitting} /></label>
          <button className="primary-button auth-submit" type="submit" disabled={!isFirebaseConfigured || submitting}>{submitting ? "Validando…" : "Ingresar"}<span>→</span></button>
        </form>
        <div className="auth-footnote">Proyecto académico (UPTC) aplicado a datos de EBSA. No es un producto oficial de la empresa. La autorización de cada módulo se valida también en el backend.</div>
      </section>
    </div>
  );
}
