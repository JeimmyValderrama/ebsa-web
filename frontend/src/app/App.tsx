import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { isFirebaseConfigured } from "../lib/firebase";
import { useAuth, type UserRole } from "../auth/AuthProvider";
import LoginPage from "../pages/LoginPage";
import CommercialPage from "../pages/CommercialPage";
import SupportPage from "../pages/SupportPage";
import AdminPage from "../pages/AdminPage";
import RequireAuth from "./RequireAuth";

type ApiState = "loading" | "ready" | "error";

const navItems: Array<{ to: string; label: string; icon: string; roles: UserRole[] }> = [
  { to: "/", label: "Resumen", icon: "01", roles: ["COMERCIAL", "SOPORTE", "ADMIN_MODELO"] },
  { to: "/comercial", label: "Comercial", icon: "02", roles: ["COMERCIAL", "SOPORTE", "ADMIN_MODELO"] },
  { to: "/soporte", label: "Soporte", icon: "03", roles: ["SOPORTE", "ADMIN_MODELO"] },
  { to: "/administrador", label: "Administrador", icon: "04", roles: ["ADMIN_MODELO"] },
];

function StatusPill({ state }: { state: ApiState }) {
  const label = state === "ready" ? "API conectada" : state === "loading" ? "Comprobando API" : "API pendiente";
  return <span className={`status-pill status-${state}`}><span className="status-dot" />{label}</span>;
}

function ProtectedLayout() {
  const { currentUser, logout } = useAuth();
  const [apiState, setApiState] = useState<ApiState>("loading");
  const role = currentUser?.role ?? "COMERCIAL";
  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  useEffect(() => {
    api.health().then(() => setApiState("ready")).catch(() => setApiState("error"));
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">⚡</div><div><div className="brand-name">EBSA</div><div className="brand-subtitle">Consumo de clientes</div></div></div>
        <div className="sidebar-section-label">Navegación</div>
        <nav className="main-nav" aria-label="Navegación principal">
          {visibleItems.map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}><span className="nav-index">{item.icon}</span><span>{item.label}</span></NavLink>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-section-label">Estado del sistema</div><StatusPill state={apiState} /><div className="sidebar-note">Los permisos se validan en la API antes de cada operación.</div></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><div className="eyebrow">PLATAFORMA EBSA / PROYECTO COMPLETO</div><div className="topbar-title">Centro de decisiones</div></div><div className="topbar-actions"><span className="cut-label">Rol <strong>{roleLabel(role)}</strong></span><button className="avatar-button" type="button" onClick={() => void logout()} title="Cerrar sesión">{(currentUser?.name ?? currentUser?.email ?? "U").slice(0, 1).toUpperCase()}</button></div></header>
        <Outlet />
      </main>
    </div>
  );
}

function roleLabel(role: UserRole): string { return { COMERCIAL: "Comercial", SOPORTE: "Soporte", ADMIN_MODELO: "Administrador del modelo" }[role]; }

function OverviewPage() {
  const { currentUser } = useAuth();
  return <div className="page-content"><section className="hero-panel"><div className="hero-copy"><div className="eyebrow accent-eyebrow">SESIÓN VERIFICADA</div><h1>Una nueva forma de leer el consumo.</h1><p>Bienvenido{currentUser?.name ? `, ${currentUser.name}` : ""}. La plataforma convierte los resultados precalculados del pipeline en decisiones comerciales, operación de campo y control del modelo.</p><div className="hero-actions"><NavLink className="primary-button" to="/comercial">Explorar Comercial <span>→</span></NavLink><span className="quiet-note">Identidad validada con Firebase</span></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-core"><span>EBSA</span><small>07</small></div><div className="orbit-node node-a">KPI</div><div className="orbit-node node-b">NIU</div><div className="orbit-node node-c">6M</div></div></section><section className="section-heading"><div><div className="eyebrow">IDENTIDAD Y ACCESO</div><h2>Sesión lista para operar</h2></div><span className="section-status"><span className="status-dot" /> {currentUser?.email}</span></section><section className="metric-grid"><MetricCard label="Usuario" value={currentUser?.name ?? "Cuenta EBSA"} detail={currentUser?.email ?? "Correo verificado por Firebase"} tone="blue" /><MetricCard label="Rol" value={currentUser?.role ? roleLabel(currentUser.role) : "Pendiente"} detail="Permisos RBAC activos" tone="orange" /><MetricCard label="Identidad" value="Firebase Auth" detail={isFirebaseConfigured ? "Token verificado" : "Configuración pendiente"} tone="purple" /><MetricCard label="Datos" value="Azure SQL" detail="Importador y consultas listos" tone="green" /></section><section className="next-step-panel"><div className="next-step-number">OK</div><div className="next-step-copy"><div className="eyebrow">CONFIGURACIÓN DEL PROPIETARIO</div><h3>Conecta tus servicios y carga el primer corte</h3><p>Completa las variables de Firebase y Azure SQL y ejecuta la guía de configuración final para comenzar a operar con tus datos reales.</p></div><div className="next-step-arrow">→</div></section></div>;
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <article className={`metric-card tone-${tone}`}><div className="metric-topline"><span className="metric-label">{label}</span><span className="metric-line" /></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></article>; }

export default function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<RequireAuth />}><Route element={<ProtectedLayout />}><Route path="/" element={<OverviewPage />} /><Route path="/comercial" element={<CommercialPage />} /><Route path="/soporte" element={<SupportPage />} /><Route path="/administrador" element={<AdminPage />} /></Route></Route><Route path="*" element={<LoginPage />} /></Routes>;
}
