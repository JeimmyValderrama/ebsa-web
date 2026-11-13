import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { MapaBoyaca } from "../components/MapaBoyaca";
import { useCorte } from "../lib/useCorte";
import { Proyeccion } from "../components/Projection";
import { Descargas } from "../components/Descargas";
import { useSectionNav } from "../app/SectionNav";
import { ResumenAdmin } from "./admin/ResumenAdmin";
import { GestionCiclo } from "./admin/GestionCiclo";
import { RankingGerencial } from "./admin/RankingGerencial";
import { FugaAdmin } from "./admin/FugaAdmin";
import { CortesAdmin } from "./admin/CortesAdmin";
import { PronosticoAdmin } from "./admin/PronosticoAdmin";
import { SeguimientoAdmin } from "./admin/SeguimientoAdmin";
import { PipelineAdmin } from "./admin/PipelineAdmin";
import { ClientLookup, Retroalimentacion } from "./SupportPage";
import { TituloPagina } from "../components/v2/ui";

type AdminUser = { uid: string; email?: string; disabled: boolean; email_verified: boolean; role?: string };

/** Roles con su nombre visible: la misma lista para la descripción, el formulario y la tabla. */
const ROLES: Array<{ valor: string; etiqueta: string }> = [
  { valor: "COMERCIAL", etiqueta: "Comercial" },
  { valor: "SOPORTE", etiqueta: "Soporte" },
  { valor: "ADMIN_MODELO", etiqueta: "Administrador" },
];

const CORREO_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const AYUDA_UNICO_ADMIN = "Debe existir al menos un administrador.";

const tabs = [
  ["resumen", "Resumen"],
  ["gestion", "Gestión por ciclo"],
  ["ranking", "Ranking gerencial"],
  ["fuga", "Riesgo de fuga"],
  ["cortes", "Cortes"],
  ["mapa", "Mapa"],
  ["buscar", "Buscar cliente"],
  ["pronostico", "Pronóstico 6 meses"],
  ["proyeccion", "Proyección de consumo"],
  ["descargas", "Descargas por grupo"],
  ["seguimiento", "Seguimiento"],
  ["feedback", "Retroalimentación"],
  ["pipeline", "Estado del pipeline"],
  ["usuarios", "Usuarios y roles"],
] as const;

type Tab = (typeof tabs)[number][0];

/** Grupos del menú lateral (GRUPOS_MENU["Administrador del modelo"] del Streamlit). */
const GRUPOS: Array<{ nombre: string; items: Array<{ clave: Tab; etiqueta: string }> }> = [
  { nombre: "Resumen", items: [{ clave: "resumen", etiqueta: "Resumen" }] },
  {
    nombre: "Listas y gestión",
    items: [
      { clave: "gestion", etiqueta: "Gestión por ciclo" },
      { clave: "ranking", etiqueta: "Ranking gerencial" },
      { clave: "fuga", etiqueta: "Riesgo de fuga" },
      { clave: "cortes", etiqueta: "Cortes" },
      { clave: "mapa", etiqueta: "Mapa" },
      { clave: "buscar", etiqueta: "Buscar cliente" },
    ],
  },
  {
    nombre: "Modelos",
    items: [
      { clave: "pronostico", etiqueta: "Pronóstico 6 meses" },
      { clave: "proyeccion", etiqueta: "Proyección de consumo" },
      { clave: "seguimiento", etiqueta: "Seguimiento" },
      { clave: "feedback", etiqueta: "Retroalimentación" },
    ],
  },
  {
    nombre: "Operación",
    items: [
      { clave: "descargas", etiqueta: "Descargas por grupo" },
      { clave: "pipeline", etiqueta: "Estado del pipeline" },
    ],
  },
  { nombre: "Sistema", items: [{ clave: "usuarios", etiqueta: "Usuarios y roles" }] },
];

export default function AdminPage() {
  const { idToken, currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>("resumen");
  const [users, setUsers] = useState<AdminUser[]>([]);
  // Aviso de estado: se limpia solo a los 5 s y también al cambiar de subpestaña.
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  // Una sola operación en vuelo a la vez: evita dobles clics en crear, editar y eliminar.
  const [ocupado, setOcupado] = useState(false);
  const avisoId = useRef(0);
  const avisar = useCallback((texto: string) => {
    avisoId.current += 1;
    setAviso({ texto, n: avisoId.current });
  }, []);
  const elegirTab = useCallback(
    (clave: Tab) => {
      setAviso(null);
      setTab(clave);
    },
    [],
  );
  useSectionNav(GRUPOS, tab, elegirTab);
  const corte = useCorte(idToken);

  useEffect(() => {
    if (!aviso) return;
    const reloj = window.setTimeout(() => setAviso(null), 5000);
    return () => window.clearTimeout(reloj);
  }, [aviso]);

  useEffect(() => {
    if (!idToken) return;
    let cancelled = false;
    api
      .adminUsers(idToken)
      .then((administrados) => {
        if (cancelled) return;
        setUsers(administrados as AdminUser[]);
      })
      .catch((cause: unknown) => {
        if (!cancelled) avisar(cause instanceof Error ? cause.message : "No fue posible cargar la administración.");
      });
    return () => {
      cancelled = true;
    };
  }, [idToken, avisar]);

  const recargarUsuarios = useCallback(async () => {
    if (!idToken) return;
    setUsers((await api.adminUsers(idToken)) as AdminUser[]);
  }, [idToken]);

  const updateUser = useCallback(
    async (uid: string, change: { role?: string; disabled?: boolean }) => {
      if (!idToken || ocupado) return;
      if (change.disabled === true && currentUser?.uid === uid) {
        avisar("No puedes deshabilitar tu propia cuenta.");
        return;
      }
      setOcupado(true);
      try {
        await api.updateAdminUser(idToken, uid, change);
        await recargarUsuarios();
        avisar(change.role !== undefined ? "Rol actualizado." : "Usuario actualizado.");
      } catch (cause: unknown) {
        avisar(cause instanceof Error ? cause.message : "No se pudo actualizar el usuario.");
      } finally {
        setOcupado(false);
      }
    },
    [idToken, currentUser, avisar, ocupado, recargarUsuarios],
  );

  /** Alta desde el formulario. Devuelve true si se creó, para limpiar los campos. */
  const crearUsuario = useCallback(
    async (datos: { email: string; password: string; role: string }) => {
      if (!idToken || ocupado) return false;
      setOcupado(true);
      try {
        await api.createAdminUser(idToken, datos);
        await recargarUsuarios();
        avisar(`Usuario ${datos.email} creado.`);
        return true;
      } catch (cause: unknown) {
        avisar(cause instanceof Error ? cause.message : "No se pudo crear el usuario.");
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [idToken, avisar, ocupado, recargarUsuarios],
  );

  const eliminarUsuario = useCallback(
    async (row: AdminUser) => {
      if (!idToken || ocupado) return;
      if (row.uid === currentUser?.uid) {
        avisar("No puedes eliminar tu propia cuenta.");
        return;
      }
      const destino = row.email ?? row.uid;
      const confirmado = window.confirm(`¿Eliminar a ${destino}? Esta acción borra la cuenta y no se puede deshacer.`);
      if (!confirmado) return;
      setOcupado(true);
      try {
        await api.deleteAdminUser(idToken, row.uid);
        await recargarUsuarios();
        avisar("Usuario eliminado.");
      } catch (cause: unknown) {
        avisar(cause instanceof Error ? cause.message : "No se pudo eliminar el usuario.");
      } finally {
        setOcupado(false);
      }
    },
    [idToken, currentUser, avisar, ocupado, recargarUsuarios],
  );

  return (
    <div className="page-content">
      {aviso && <div className="notice notice-warning" role="status">{aviso.texto}</div>}

      {tab === "resumen" && <ResumenAdmin token={idToken} />}
      {tab === "gestion" && <GestionCiclo token={idToken} />}
      {tab === "ranking" && <RankingGerencial token={idToken} />}
      {tab === "fuga" && <FugaAdmin token={idToken} />}
      {tab === "cortes" && <CortesAdmin token={idToken} />}
      {tab === "mapa" && (
        <div className="stack">
          <TituloPagina titulo="Mapa: dónde están los clientes, las caídas y el riesgo de fuga" />
          <MapaBoyaca token={idToken} modo="tecnico" altura={600} corte={corte} />
        </div>
      )}
      {tab === "buscar" && <ClientLookup token={idToken} />}
      {tab === "pronostico" && <PronosticoAdmin token={idToken} />}
      {tab === "proyeccion" && <Proyeccion token={idToken} />}
      {tab === "seguimiento" && <SeguimientoAdmin token={idToken} />}
      {tab === "feedback" && <Retroalimentacion token={idToken} />}
      {tab === "pipeline" && <PipelineAdmin token={idToken} />}
      {tab === "descargas" && <Descargas token={idToken} esAdmin />}
      {tab === "usuarios" && (
        <Users rows={users} ocupado={ocupado} onUpdate={updateUser} onCrear={crearUsuario} onEliminar={eliminarUsuario} />
      )}
    </div>
  );
}

type UsersProps = {
  rows: AdminUser[];
  ocupado: boolean;
  onUpdate: (uid: string, change: { role?: string; disabled?: boolean }) => void;
  onCrear: (datos: { email: string; password: string; role: string }) => Promise<boolean>;
  onEliminar: (row: AdminUser) => void;
};

function Users({ rows, ocupado, onUpdate, onCrear, onEliminar }: UsersProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<string>("COMERCIAL");
  const [verPassword, setVerPassword] = useState(false);
  const [filtroRol, setFiltroRol] = useState("");

  // Validación en línea: el botón queda deshabilitado mientras haya errores.
  const correoLimpio = email.trim();
  const correoOk = CORREO_RE.test(correoLimpio);
  const claveOk = password.length >= 6;
  const valido = correoOk && claveOk;
  const errorCorreo = email.length > 0 && !correoOk;
  const errorClave = password.length > 0 && !claveOk;

  // Último administrador: se recalcula con cada cambio de la lista de usuarios.
  const administradores = rows.filter((row) => row.role === "ADMIN_MODELO");
  const administradoresActivos = administradores.filter((row) => !row.disabled);
  const protegido = (row: AdminUser) =>
    row.role === "ADMIN_MODELO" && (administradores.length === 1 || (!row.disabled && administradoresActivos.length === 1));

  const visibles = rows.filter((row) => {
    if (filtroRol === "__sin_rol__") return !row.role;
    if (filtroRol === "") return true;
    return row.role === filtroRol;
  });

  const enviar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valido || ocupado) return;
    const creado = await onCrear({ email: correoLimpio, password, role: rol });
    if (creado) {
      setEmail("");
      setPassword("");
      setVerPassword(false);
    }
  };

  return (
    <section className="data-module">
      <header className="module-heading">
        <div>
          <div className="eyebrow">ACCESOS</div>
          <h2>Usuarios y roles</h2>
          <p>El rol decide qué puede ver cada persona: Comercial (listas y panorama), Soporte (fichas y visitas) y Administrador (todo, incluido el control técnico).</p>
          <p className="v2-caption">En el sistema el rol se guarda con el código COMERCIAL, SOPORTE o ADMIN_MODELO.</p>
        </div>
        <label className="campo modulo-filtro">
          Filtrar por rol
          <select className="filter-select" value={filtroRol} onChange={(event) => setFiltroRol(event.target.value)} disabled={ocupado}>
            <option value="">Todos los roles</option>
            {ROLES.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
            <option value="__sin_rol__">Sin rol</option>
          </select>
        </label>
      </header>

      <form className="stack form-alta-usuario" onSubmit={enviar} noValidate>
        <div className="eyebrow">NUEVO USUARIO</div>
        <div className="fila-3">
          <label className="campo">
            Correo electrónico
            <input
              className="search-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@ejemplo.com"
              autoComplete="off"
              disabled={ocupado}
            />
            {errorCorreo && <span className="campo-error">Escribe un correo electrónico válido.</span>}
          </label>
          <label className="campo">
            Contraseña
            <span className="campo-pass">
              <input
                className="search-input"
                type={verPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                disabled={ocupado}
              />
              <button
                type="button"
                className="ojo-pass"
                onClick={() => setVerPassword((visible) => !visible)}
                aria-label={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
                aria-pressed={verPassword}
                disabled={ocupado}
              >
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  {verPassword && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
                </svg>
              </button>
            </span>
            {errorClave && <span className="campo-error">La contraseña debe tener al menos 6 caracteres.</span>}
          </label>
          <label className="campo">
            Rol inicial
            <select className="filter-select" value={rol} onChange={(event) => setRol(event.target.value)} disabled={ocupado}>
              {ROLES.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <button
            className="primary-button"
            type="submit"
            disabled={ocupado || !valido}
            title={valido ? undefined : "Escribe un correo válido y una contraseña de al menos 6 caracteres."}
          >
            {ocupado ? "Procesando…" : "Crear usuario"}
          </button>
        </div>
      </form>

      <div className="table-card">
        <table className="tabla-usuarios">
          <thead>
            <tr>
              <th>Correo</th>
              <th className="centro">Rol</th>
              <th className="centro">Estado</th>
              <th className="acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={4}>Ningún usuario coincide con el filtro de rol.</td>
              </tr>
            )}
            {visibles.map((row) => {
              const unicoAdmin = protegido(row);
              const bloqueaDeshabilitar = unicoAdmin && !row.disabled;
              return (
                <tr key={row.uid} className={row.disabled ? "fila-inactiva" : undefined}>
                  <td>{row.email ?? row.uid}</td>
                  <td className="centro">
                    {/* "Sin rol" queda solo como etiqueta (disabled): nunca se envía "" al backend. */}
                    <select
                      value={row.role ?? ""}
                      onChange={(event) => onUpdate(row.uid, { role: event.target.value })}
                      disabled={ocupado || unicoAdmin}
                      title={unicoAdmin ? AYUDA_UNICO_ADMIN : undefined}
                      aria-label={`Rol de ${row.email ?? row.uid}`}
                    >
                      <option value="" disabled>Sin rol</option>
                      {ROLES.map((opcion) => (
                        <option key={opcion.valor} value={opcion.valor}>
                          {opcion.etiqueta}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="centro">
                    {row.disabled ? (
                      <span className="badge">Deshabilitado</span>
                    ) : (
                      <span className="badge badge-baja">Activo</span>
                    )}
                  </td>
                  <td className="col-acciones">
                    <div className="acciones-fila">
                      <button
                        type="button"
                        className="table-action outline"
                        disabled={ocupado || bloqueaDeshabilitar}
                        title={bloqueaDeshabilitar ? AYUDA_UNICO_ADMIN : undefined}
                        onClick={() => onUpdate(row.uid, { disabled: !row.disabled })}
                      >
                        {row.disabled ? "Habilitar" : "Deshabilitar"}
                      </button>
                      <button
                        type="button"
                        className="table-action danger"
                        disabled={ocupado || unicoAdmin}
                        title={unicoAdmin ? AYUDA_UNICO_ADMIN : undefined}
                        onClick={() => onEliminar(row)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
