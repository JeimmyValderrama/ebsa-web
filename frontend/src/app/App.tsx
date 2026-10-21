import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { isFirebaseConfigured } from "../lib/firebase";
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
  { to: "/", label: "Resumen", roles: ["COMERCIAL", "SOPORTE", "ADMIN_MODELO"] },
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
function SectionMenu() {
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
              onClick={() => registro.elegir(item.clave)}
            >
              {item.etiqueta}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

/** Las mismas secciones en una franja inferior deslizable (solo celular). */
function BottomMenu() {
  const registro = useSectionState();
  if (!registro) return null;
  return (
    <nav className="bottom-menu" aria-label="Secciones">
      {registro.grupos.flatMap((grupo) => grupo.items).map((item) => (
        <button
          key={item.clave}
          type="button"
          className={`bottom-item${registro.actual === item.clave ? " activo" : ""}`}
          onClick={() => registro.elegir(item.clave)}
        >
          {item.etiqueta}
        </button>
      ))}
    </nav>
  );
}

function ProtectedLayout() {
  const { currentUser, idToken, logout } = useAuth();
  const [apiState, setApiState] = useState<ApiState>("loading");
  const [corte, setCorte] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const usuarioRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <SectionNavProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="marca">
            <i />
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
                aria-haspopup="menu"
              >
                <span className="usuario-nombre">{nombre}</span>
                <span aria-hidden="true">▾</span>
              </button>
              {menuAbierto && (
                <div className="user-menu" role="menu">
                  <b>{nombre}</b>
                  <span className="correo">{currentUser?.email}</span>
                  <span className="rol">{roleLabel(role)}</span>
                  <span className="separador" />
                  <StatusPill state={apiState} />
                  <span className="separador" />
                  <button
                    type="button"
                    className="enlace"
                    role="menuitem"
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

        <aside className="sidebar">
          <div className="side-scroll">
            <SectionMenu />
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

        <main className="main-content">
          <Outlet />
        </main>

        <BottomMenu />
      </div>
    </SectionNavProvider>
  );
}

function OverviewPage() {
  const { currentUser } = useAuth();
  return <div className="page-content"><section className="hero-panel"><div className="hero-copy"><div className="eyebrow accent-eyebrow">SESIÓN VERIFICADA</div><h1>Una nueva forma de leer el consumo.</h1><p>Bienvenido{currentUser?.name ? `, ${currentUser.name}` : ""}. La plataforma convierte los resultados precalculados del pipeline en decisiones comerciales, operación de campo y control del modelo.</p><div className="hero-actions"><NavLink className="primary-button" to="/comercial">Explorar Comercial <span>→</span></NavLink><span className="quiet-note">Identidad validada con Firebase</span></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-core"><span>EBSA</span><small>07</small></div><div className="orbit-node node-a">KPI</div><div className="orbit-node node-b">NIU</div><div className="orbit-node node-c">6M</div></div></section><section className="section-heading"><div><div className="eyebrow">IDENTIDAD Y ACCESO</div><h2>Sesión lista para operar</h2></div><span className="section-status"><span className="status-dot" /> {currentUser?.email}</span></section><section className="metric-grid"><MetricCard label="Usuario" value={currentUser?.name ?? "Cuenta EBSA"} detail={currentUser?.email ?? "Correo verificado por Firebase"} tone="blue" /><MetricCard label="Rol" value={currentUser?.role ? roleLabel(currentUser.role) : "Pendiente"} detail="Permisos RBAC activos" tone="orange" /><MetricCard label="Identidad" value="Firebase Auth" detail={isFirebaseConfigured ? "Token verificado" : "Configuración pendiente"} tone="purple" /><MetricCard label="Datos" value="Azure SQL" detail="Importador y consultas listos" tone="green" /></section><section className="next-step-panel"><div className="next-step-number">OK</div><div className="next-step-copy"><div className="eyebrow">CONFIGURACIÓN DEL PROPIETARIO</div><h3>Conecta tus servicios y carga el primer corte</h3><p>Las credenciales viven en los archivos .env (ignorados por Git). El importador local ya deja la base lista para publicar.</p></div><div className="next-step-arrow">✓</div></section></div>;
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <article className={`metric-card tone-${tone}`}><div className="metric-topline"><span className="metric-label">{label}</span><span className="metric-line" /></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></article>; }

export default function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<RequireAuth />}><Route element={<ProtectedLayout />}><Route path="/" element={<OverviewPage />} /><Route path="/comercial" element={<RoleRoute roles={["COMERCIAL", "SOPORTE", "ADMIN_MODELO"]}><CommercialPage /></RoleRoute>} /><Route path="/soporte" element={<RoleRoute roles={["SOPORTE", "ADMIN_MODELO"]}><SupportPage /></RoleRoute>} /><Route path="/administrador" element={<RoleRoute roles={["ADMIN_MODELO"]}><AdminPage /></RoleRoute>} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
