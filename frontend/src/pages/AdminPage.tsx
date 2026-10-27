import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { DatasetTable, DatasetView, type Row } from "../components/DataExplorer";
import { MapaBoyaca } from "../components/MapaBoyaca";
import { useCorte } from "../lib/useCorte";
import { Proyeccion } from "../components/Projection";
import { Descargas } from "../components/Descargas";
import { useSectionNav } from "../app/SectionNav";
import { fechaCo, fmtN, limpiarNiu, mesCorto } from "../lib/format";
import { ResumenAdmin } from "./admin/ResumenAdmin";
import { GestionCiclo } from "./admin/GestionCiclo";
import { RankingGerencial } from "./admin/RankingGerencial";

type AdminUser = { uid: string; email?: string; disabled: boolean; email_verified: boolean; role?: string };
type Run = { id?: number; period: string; status?: string; files_total?: number; rows_imported: number; completed_at?: string };

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
  const { idToken } = useAuth();
  const [tab, setTab] = useState<Tab>("resumen");
  const elegirTab = useCallback((clave: Tab) => setTab(clave), []);
  useSectionNav(GRUPOS, tab, elegirTab);
  const [runs, setRuns] = useState<Run[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const corte = useCorte(idToken);

  useEffect(() => {
    if (!idToken) return;
    let cancelled = false;
    Promise.all([api.runs(idToken), api.adminUsers(idToken)])
      .then(([corridas, administrados]) => {
        if (cancelled) return;
        setRuns(corridas as Run[]);
        setUsers(administrados as AdminUser[]);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setMessage(cause instanceof Error ? cause.message : "No fue posible cargar la administración.");
      });
    return () => {
      cancelled = true;
    };
  }, [idToken]);

  const updateUser = useCallback(
    async (uid: string, change: { role?: string; disabled?: boolean }) => {
      if (!idToken) return;
      try {
        await api.updateAdminUser(idToken, uid, change);
        setUsers((await api.adminUsers(idToken)) as AdminUser[]);
        setMessage("Usuario actualizado.");
      } catch (cause: unknown) {
        setMessage(cause instanceof Error ? cause.message : "No se pudo actualizar el usuario.");
      }
    },
    [idToken],
  );

  return (
    <div className="page-content">
      {message && <div className="notice notice-warning">{message}</div>}

      {tab === "resumen" && <ResumenAdmin token={idToken} />}
      {tab === "gestion" && <GestionCiclo token={idToken} />}
      {tab === "ranking" && <RankingGerencial token={idToken} />}
      {tab === "fuga" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="churn_scores" title="Clientes con riesgo de fuga" description="Probabilidad de salida a 6 meses, valor esperado de pérdida y señales del modelo." filters={[{ key: "nivel_riesgo", label: "Nivel de riesgo" }]} prioritarias={["NIU", "nivel_riesgo", "prob_fuga_6m", "valor_esperado_perdida_mes"]} />
          <DatasetView token={idToken} datasetKey="churn_feature_importance" title="Importancia de variables del modelo de fuga" />
          <DatasetView token={idToken} datasetKey="churn_metrics" title="Métricas del modelo de fuga" />
        </div>
      )}
      {tab === "cortes" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="cut_summary" title="Resumen por corte" description="Tamaño de la lista en cada corte de referencia." prioritarias={["corte", "en_lista", "gestionados"]} />
          <DatasetView token={idToken} datasetKey="list_entries_exits" title="Entradas y salidas de la lista" />
        </div>
      )}
      {tab === "mapa" && (
        <section className="data-module">
          <header className="module-heading">
            <h2>Mapa de riesgo por municipio</h2>
            <p>Las mismas cifras del mapa comercial, con las métricas técnicas del modelo (caída y fuga por municipio).</p>
          </header>
          <MapaBoyaca token={idToken} modo="tecnico" altura={600} corte={corte} />
        </section>
      )}
      {tab === "buscar" && <BuscarCliente token={idToken} />}
      {tab === "pronostico" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="forecast_profile_metrics" title="Métricas por perfil de consumo" description="Error (WAPE) y sesgo del pronóstico por perfil y horizonte." prioritarias={["perfil", "horizonte", "wape_pct", "sesgo_pct"]} />
          <DatasetView token={idToken} datasetKey="forecast_naive_comparison" title="Comparación contra modelos ingenuos" description="El modelo final debe ganarle a los referenciales (persistencia, medias históricas, mismo mes del año anterior)." />
          <DatasetView token={idToken} datasetKey="forecast_model_selection" title="Selección de modelos" />
          <DatasetView token={idToken} datasetKey="model_versions" title="Versiones de modelos registradas" />
          <DatasetView token={idToken} datasetKey="model_usage" title="Uso de modelos por fecha de corte" />
        </div>
      )}
      {tab === "proyeccion" && <Proyeccion token={idToken} />}
      {tab === "seguimiento" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="followup_clientes" title="Seguimiento por cliente" description="Clientes en lista, meses consecutivos y veces que han entrado en los últimos 12 meses." prioritarias={["NIU", "meses_en_lista", "veces_en_lista_12m", "valor_riesgo_mes"]} />
          <DatasetView token={idToken} datasetKey="cycle_summary" title="Resumen de gestión por ciclo" />
        </div>
      )}
      {tab === "feedback" && <Retroalimentacion token={idToken} />}
      {tab === "pipeline" && <Pipeline token={idToken} runs={runs} />}
      {tab === "descargas" && <Descargas token={idToken} />}
      {tab === "usuarios" && <Users rows={users} onUpdate={updateUser} />}
    </div>
  );
}

function BuscarCliente({ token }: { token?: string | null }) {
  const [busqueda, setBusqueda] = useState("");
  const [niu, setNiu] = useState("");
  const [coincidencias, setCoincidencias] = useState<Array<{ dataset: string; rows: number }> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!niu) return;
    let cancelled = false;
    const datasets = ["operational", "churn_scores", "drop_analysis", "forecast", "locations", "zero_sustained"];
    Promise.all(datasets.map((dataset) => api.dataset(token ?? undefined, dataset, { niu, limit: 1 }).catch(() => null)))
      .then((resultados) => {
        if (cancelled) return;
        setCoincidencias(resultados.map((pagina, index) => ({ dataset: datasets[index], rows: pagina?.total ?? 0 })).filter((item) => item.rows > 0));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [niu, token]);

  return (
    <section className="data-module">
      <header className="module-heading">
        <div>
          <div className="eyebrow">BÚSQUEDA</div>
          <h2>Buscar cliente en el corte</h2>
          <p>Verifica en qué listas aparece un NIU antes de atenderlo. El resultado abre la ficha completa de Soporte.</p>
        </div>
      </header>
      <form
        className="data-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setCoincidencias(null);
          setNiu(limpiarNiu(busqueda));
        }}
      >
        <input className="search-input" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="NIU del cliente" aria-label="NIU" />
        <button type="submit" className="primary-button">
          Buscar
        </button>
      </form>
      {coincidencias && (
        <div className="ficha-grid">
          {coincidencias.length === 0 && <div className="empty-state">El NIU no aparece en ninguna lista del corte vigente.</div>}
          {coincidencias.map((item) => (
            <button key={item.dataset} type="button" className="ficha-item clickable-row" onClick={() => navigate(`/soporte?niu=${encodeURIComponent(niu)}`)}>
              <span>{item.dataset}</span>
              <b>{fmtN(item.rows)} registro(s)</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Retroalimentacion({ token }: { token?: string | null }) {
  return (
    <div className="stack">
      <DatasetView
        token={token ?? undefined}
        datasetKey="feedback_summary"
        title="Evaluación de la retroalimentación de campo"
        description="Comparación entre lo que el modelo preveía y lo que ocurrió realmente en las cuentas visitadas."
      />
    </div>
  );
}

type PipelineData = Awaited<ReturnType<typeof api.pipeline>>;

function Pipeline({ token, runs }: { token?: string | null; runs: Run[] }) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .pipeline(token ?? undefined)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar el estado del pipeline.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const calidad: Row[] = useMemo(() => (data?.quality_control ?? []).map((payload, index) => ({ id: index, payload })), [data]);
  const sesgo: Row[] = useMemo(() => (data?.forecast_bias ?? []).map((payload, index) => ({ id: index, payload })), [data]);

  return (
    <div className="stack">
      {error && <div className="empty-state">{error}</div>}

      <section className="data-module">
        <header className="module-heading">
          <h2>Corridas del pipeline</h2>
          <p>Registro de las corridas que generaron los resultados (09_registro_corridas). Abre una corrida para ver su resumen.</p>
        </header>
        {!data?.runs.length && !error && <div className="empty-state">No hay corridas registradas en esta carga de datos.</div>}
        {data?.runs.map((corrida) => (
          <div key={String(corrida.id)} className="ficha-item" style={{ marginBottom: 10 }}>
            <span>
              {String(corrida.folder_name)} · {corrida.started_at ? mesCorto(String(corrida.started_at).slice(0, 7)) : "sin fecha"}
            </span>
            <b>Acción: {String(corrida.action ?? "—")}</b>
            <button type="button" className="table-action" onClick={() => setAbierto(abierto === String(corrida.id) ? null : String(corrida.id))}>
              {abierto === String(corrida.id) ? "Ocultar resumen" : "Ver resumen"}
            </button>
            {abierto === String(corrida.id) && (
              <pre className="ficha-note" style={{ whiteSpace: "pre-wrap" }}>
                {String(corrida.summary_text ?? "Sin resumen disponible.")}
              </pre>
            )}
          </div>
        ))}
      </section>

      <section className="data-module">
        <header className="module-heading">
          <h2>Control de calidad</h2>
          <p>Validaciones que ejecuta el pipeline sobre cada corte (05_segmentos_clientes/control_calidad.csv).</p>
        </header>
        <DatasetTable rows={calidad} />
      </section>

      <section className="data-module">
        <header className="module-heading">
          <h2>Diagnóstico de sesgo del pronóstico</h2>
          <p>Distribución del error del pronóstico por zona: si la mediana se aleja de cero, el modelo sobre o subestima.</p>
        </header>
        <DatasetTable rows={sesgo} prioritarias={["zona", "n", "mediana", "p25", "p75"]} />
      </section>

      <section className="data-module">
        <header className="module-heading">
          <h2>Corridas de importación</h2>
          <p>Historial de cargas realizadas a Azure SQL con el importador.</p>
        </header>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Estado</th>
                <th>Archivos</th>
                <th>Filas</th>
                <th>Completada</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr key={String(row.id)}>
                  <td>
                    <strong>{row.period}</strong>
                  </td>
                  <td>
                    <span className="badge">{row.status}</span>
                  </td>
                  <td>{row.files_total}</td>
                  <td>{fmtN(row.rows_imported)}</td>
                  <td>{row.completed_at ? fechaCo(row.completed_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
                  <select value={row.role ?? ""} onChange={(event) => onUpdate(row.uid, { role: event.target.value })}>
                    <option value="">Sin rol</option>
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
