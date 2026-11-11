import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isFirebaseConfigured, signIn } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import AuthCargando from "../components/AuthCargando";

/** Los errores de Firebase llegan en inglés y con códigos internos (auth/…): aquí se
 *  traducen a un mensaje amigable. Nunca se muestra el texto crudo al usuario. */
function mensajeAmigable(cause: unknown): string {
  const texto = String((cause as { message?: string } | null)?.message ?? cause ?? "");
  if (/auth\/(invalid-credential|invalid-login-credentials|wrong-password|user-not-found|missing-credential)/i.test(texto)) {
    return "El correo o la contraseña no son correctos. Revísalos e inténtalo de nuevo.";
  }
  if (/auth\/invalid-email/i.test(texto)) return "El correo electrónico no tiene un formato válido.";
  if (/auth\/too-many-requests/i.test(texto)) {
    return "Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.";
  }
  if (/auth\/network-request-failed/i.test(texto)) {
    return "No hay conexión con el servicio de acceso. Revisa tu internet e inténtalo de nuevo.";
  }
  if (/auth\/user-disabled/i.test(texto)) return "Esta cuenta está deshabilitada. Contacta al administrador del proyecto.";
  if (/auth\/(operation-not-allowed|configuration-not-found|unauthorized-domain|invalid-api-key)/i.test(texto)) {
    return "El acceso con correo y contraseña no está habilitado en el proyecto. Contacta al administrador.";
  }
  return "No fue posible iniciar sesión. Inténtalo de nuevo en unos segundos.";
}

export default function LoginPage() {
  const { currentUser, loading, configured, authError } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verPassword, setVerPassword] = useState(false);
  const destination = (location.state as { from?: string } | null)?.from ?? "/";

  if (loading) return (
    <div className="auth-page">
      <div className="topbar"><div className="marca"><img className="marca-logo" src="/img/logo-monograma.png" alt="" /><div><b>Analítica de consumo</b><small>Proyecto académico UPTC · no oficial de EBSA</small></div></div></div>
      <AuthCargando />
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
      setError(mensajeAmigable(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="topbar"><div className="marca"><img className="marca-logo" src="/img/logo-monograma.png" alt="" /><div><b>Analítica de consumo</b><small>Proyecto académico UPTC · no oficial de EBSA</small></div></div></div>
      <div className="auth-decoration" aria-hidden="true"><span>EBSA</span><b>⚡</b></div>
      <section className="auth-card">
        <div className="auth-cabecera">
          <img className="auth-logo" src="/img/logo-ebsa.png" alt="EBSA — Empresa de Energía de Boyacá S.A. E.S.P." />
          <div className="auth-titulos">
            <h1>Analítica de consumo de clientes</h1>
          </div>
        </div>
        {!configured && <div className="notice notice-warning" role="status">Firebase todavía no está configurado. En la siguiente entrega se agregarán las variables del proyecto y podrás iniciar sesión.</div>}
        {authError && <div className="notice notice-error" role="alert">{authError}</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={!isFirebaseConfigured || submitting} /></label>
          <label>Contraseña
            <span className="campo-pass">
              <input type={verPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={!isFirebaseConfigured || submitting} />
              <button
                type="button"
                className="ojo-pass"
                onClick={() => setVerPassword((visible) => !visible)}
                aria-label={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
                aria-pressed={verPassword}
                disabled={!isFirebaseConfigured || submitting}
              >
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  {verPassword && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
                </svg>
              </button>
            </span>
          </label>
          <button className="primary-button auth-submit" type="submit" disabled={!isFirebaseConfigured || submitting}>{submitting ? "Validando…" : "Ingresar"}</button>
        </form>
        <div className="auth-footnote">Proyecto académico (UPTC) aplicado a datos de EBSA. No es un producto oficial de la empresa.</div>
      </section>
    </div>
  );
}
