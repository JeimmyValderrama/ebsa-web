import { useCallback, useEffect, useRef, useState } from "react";
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

  const updateUser = useCallback(
    async (uid: string, change: { role?: string; disabled?: boolean }) => {
      if (!idToken) return;
      if (change.disabled === true && currentUser?.uid === uid) {
        avisar("No puedes deshabilitar tu propia cuenta.");
        return;
      }
      try {
        await api.updateAdminUser(idToken, uid, change);
        setUsers((await api.adminUsers(idToken)) as AdminUser[]);
        avisar("Usuario actualizado.");
      } catch (cause: unknown) {
        avisar(cause instanceof Error ? cause.message : "No se pudo actualizar el usuario.");
      }
    },
    [idToken, currentUser, avisar],
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
      {tab === "usuarios" && <Users rows={users} onUpdate={updateUser} />}
    </div>
  );
}

function Users({ rows, onUpdate }: { rows: AdminUser[]; onUpdate: (uid: string, change: { role?: string; disabled?: boolean }) => void }) {
  return (
    <section className="data-module">
      <header className="module-heading">
        <div>
          <div className="eyebrow">ACCESOS</div>
          <h2>Usuarios y roles</h2>
          <p>El rol decide qué puede ver cada persona: COMERCIAL (listas y panorama), SOPORTE (fichas y visitas) y ADMIN_MODELO (todo, incluido el control técnico).</p>
        </div>
      </header>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Correo</th>
              <th>Rol</th>
              <th>Verificado</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.uid}>
                <td>{row.email ?? row.uid}</td>
                <td>
                  {/* "Sin rol" queda solo como etiqueta (disabled): nunca se envía "" al backend. */}
                  <select value={row.role ?? ""} onChange={(event) => onUpdate(row.uid, { role: event.target.value })}>
                    <option value="" disabled>Sin rol</option>
                    <option value="COMERCIAL">Comercial</option>
                    <option value="SOPORTE">Soporte</option>
                    <option value="ADMIN_MODELO">Administrador</option>
                  </select>
                </td>
                <td>{row.email_verified ? "Sí" : "No"}</td>
                <td>{row.disabled ? "Deshabilitado" : "Activo"}</td>
                <td>
                  <button type="button" className="table-action" onClick={() => onUpdate(row.uid, { disabled: !row.disabled })}>
                    {row.disabled ? "Habilitar" : "Deshabilitar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
