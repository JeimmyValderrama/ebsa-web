/** Pantalla de espera de autenticación: logo EBSA pulsando y barra dorada en movimiento.
 *  No muestra texto visible (la accesibilidad va por role="status" + .sr-only). */
export default function AuthCargando() {
  return (
    <div className="auth-card auth-carga" role="status" aria-live="polite">
      <img className="auth-logo auth-logo-carga" src="/img/logo-ebsa.png" alt="" />
      <span className="carga-barra" aria-hidden="true" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
