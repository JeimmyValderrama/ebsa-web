import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth, type UserRole } from "../auth/AuthProvider";
import { HideIdsToggle, MeasureSelector } from "./Presentation";
import { SectionNavProvider, useSectionState } from "./SectionNav";
import LoginPage from "../pages/LoginPage";
import CommercialPage from "../pages/CommercialPage";
import SupportPage from "../pages/SupportPage";
import AdminPage from "../pages/AdminPage";
import RequireAuth, { RoleRoute } from "./RequireAuth";

/**
 * Marco de la aplicación, calcado del Streamlit: franja superior de 58 px con la
 * marca y las pestañas de vista, barra lateral blanca con las secciones del grupo
 * activo (publicadas por cada página) y, al pie, la sesión con los controles de
 * presentación.
 */

type ApiState = "loading" | "ready" | "error";

const navItems: Array<{ to: string; label: string; roles: UserRole[] }> = [
  { to: "/comercial", label: "Comercial", roles: ["COMERCIAL", "SOPORTE", "ADMIN_MODELO"] },
  { to: "/soporte", label: "Soporte", roles: ["SOPORTE", "ADMIN_MODELO"] },
  { to: "/administrador", label: "Administrador", roles: ["ADMIN_MODELO"] },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function mesLargo(periodo: string): string {
  const [anio, mes] = periodo.split("-");
  const indice = Number(mes) - 1;
  return indice >= 0 && indice < MESES.length ? `${MESES[indice]} de ${anio}` : periodo;
}

function roleLabel(role: UserRole): string {
  return { COMERCIAL: "Comercial", SOPORTE: "Soporte", ADMIN_MODELO: "Administrador del modelo" }[role];
}

function StatusPill({ state }: { state: ApiState }) {
  const label = state === "ready" ? "API conectada" : state === "loading" ? "Comprobando API" : "API pendiente";
  return <span className={`status-pill status-${state}`}><span className="status-dot" />{label}</span>;
}

/** Menú de secciones agrupado (como ui.menu_lateral): grupos publicados por la página activa. */
function SectionMenu({ alElegir }: { alElegir?: () => void }) {
  const registro = useSectionState();
  if (!registro) return null;
  return (
    <>
      {registro.grupos.map((grupo, indice) => (
        <div key={grupo.nombre}>
          <span className={`side-group${indice === 0 ? " primero" : ""}`}>{grupo.nombre}</span>
          {grupo.items.map((item) => (
            <button
              key={item.clave}
              type="button"
              className={`side-item${registro.actual === item.clave ? " activo" : ""}`}
              aria-current={registro.actual === item.clave ? "true" : undefined}
              onClick={() => {
                registro.elegir(item.clave);
                alElegir?.();
              }}
            >
              {item.etiqueta}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

function ProtectedLayout() {
  const { currentUser, idToken, logout } = useAuth();
  const [apiState, setApiState] = useState<ApiState>("loading");
  const [corte, setCorte] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [lateralAbierto, setLateralAbierto] = useState(false);
  const usuarioRef = useRef<HTMLDivElement | null>(null);
  const hamburguesaRef = useRef<HTMLButtonElement | null>(null);
  const lateralRef = useRef<HTMLElement | null>(null);
  const lateralAbiertoAntes = useRef(false);
  const ubicacion = useLocation();
  const role = currentUser?.role ?? "COMERCIAL";
  const visibleItems = navItems.filter((item) => item.roles.includes(role));
  const nombre = currentUser?.name ?? currentUser?.email ?? "Cuenta EBSA";

  useEffect(() => {
    api.health().then(() => setApiState("ready")).catch(() => setApiState("error"));
  }, []);

  useEffect(() => {
    if (!idToken) return;
    api
      .summary(idToken)
      .then((resumen) => {
        if (resumen.latest_run?.period) setCorte(`Corte ${mesLargo(resumen.latest_run.period)}`);
      })
      .catch(() => undefined);
  }, [idToken]);

  useEffect(() => {
    if (!menuAbierto) return;
    const alClicar = (evento: MouseEvent) => {
      if (usuarioRef.current && !usuarioRef.current.contains(evento.target as Node)) setMenuAbierto(false);
    };
    const alEsc = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setMenuAbierto(false);
    };
    document.addEventListener("mousedown", alClicar);
    document.addEventListener("keydown", alEsc);
    return () => {
      document.removeEventListener("mousedown", alClicar);
      document.removeEventListener("keydown", alEsc);
    };
  }, [menuAbierto]);

  // Esc también cierra el drawer lateral (celular).
  useEffect(() => {
    if (!lateralAbierto) return;
    const alEscDrawer = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setLateralAbierto(false);
    };
    document.addEventListener("keydown", alEscDrawer);
    return () => document.removeEventListener("keydown", alEscDrawer);
  }, [lateralAbierto]);

  // El foco entra al panel al abrirlo y vuelve a la hamburguesa al cerrarlo: sin esto,
  // al ocultarse el panel el foco caía al body y se perdía la posición de navegación.
  useEffect(() => {
    if (lateralAbierto) {
      lateralRef.current?.querySelector<HTMLButtonElement>("button.side-item")?.focus();
      lateralAbiertoAntes.current = true;
    } else if (lateralAbiertoAntes.current) {
      lateralAbiertoAntes.current = false;
      hamburguesaRef.current?.focus();
    }
  }, [lateralAbierto]);

  // Al cambiar de vista (pestaña superior) la página nueva arranca desde arriba.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [ubicacion.pathname]);

  return (
    <SectionNavProvider>
      <div className="app-shell">
        <header className="topbar">
          <a className="skip-link" href="#contenido">Saltar al contenido</a>
          <button
            type="button"
            className="menu-lateral"
            ref={hamburguesaRef}
            aria-expanded={lateralAbierto}
            aria-controls="menu-lateral-panel"
            aria-label={lateralAbierto ? "Cerrar el menú de secciones" : "Abrir el menú de secciones"}
            onClick={() => setLateralAbierto((abierto) => !abierto)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="marca">
            <img className="marca-logo" src="/img/logo-monograma.png" alt="" />
            <div>
              <b>Analítica de consumo</b>
              <small>Proyecto académico UPTC · no oficial de EBSA</small>
            </div>
          </div>
          <nav className="vistas" aria-label="Vistas">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `vista-tab${isActive ? " activa" : ""}`}
                onClick={() => setLateralAbierto(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-right">
            {corte && <span className="corte-chip">{corte}</span>}
            <div className="usuario" ref={usuarioRef}>
              <button
                type="button"
                className="user-pill"
                onClick={() => setMenuAbierto((abierto) => !abierto)}
                aria-expanded={menuAbierto}
              >
                <span className="usuario-nombre">{nombre}</span>
                <span aria-hidden="true">▾</span>
              </button>
              {menuAbierto && (
                <div className="user-menu">
                  <b>{nombre}</b>
                  <span className="correo">{currentUser?.email}</span>
                  <span className="rol">{roleLabel(role)}</span>
                  <span className="separador" />
                  <StatusPill state={apiState} />
                  <span className="separador" />
                  <button
                    type="button"
                    className="enlace"
                    onClick={() => {
                      setMenuAbierto(false);
                      void logout();
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <aside id="menu-lateral-panel" ref={lateralRef} className={`sidebar${lateralAbierto ? " abierta" : ""}`}>
          <div className="side-scroll">
            <SectionMenu alElegir={() => setLateralAbierto(false)} />
            <div className="side-bottom">
              <span className="side-group">Sesión</span>
              <div className="side-user">{nombre}</div>
              <MeasureSelector compact />
              <HideIdsToggle />
              <StatusPill state={apiState} />
              <p className="side-note">Los permisos se validan en la API antes de cada operación.</p>
              <button type="button" className="side-logout" onClick={() => void logout()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </aside>

        {lateralAbierto && (
          <button type="button" className="side-velo" aria-label="Cerrar el menú de secciones" onClick={() => setLateralAbierto(false)} />
        )}

        <main id="contenido" tabIndex={-1} className="main-content">
          <Outlet />
        </main>
      </div>
    </SectionNavProvider>
  );
}

export default function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<RequireAuth />}><Route element={<ProtectedLayout />}><Route path="/" element={<Navigate to="/comercial" replace />} /><Route path="/comercial" element={<RoleRoute roles={["COMERCIAL", "SOPORTE", "ADMIN_MODELO"]}><CommercialPage /></RoleRoute>} /><Route path="/soporte" element={<RoleRoute roles={["SOPORTE", "ADMIN_MODELO"]}><SupportPage /></RoleRoute>} /><Route path="/administrador" element={<RoleRoute roles={["ADMIN_MODELO"]}><AdminPage /></RoleRoute>} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
