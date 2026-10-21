import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { DatasetCatalog, DatasetTable, DatasetView, MiniBars, type Row } from "../components/DataExplorer";
import { MunicipalityMap } from "../components/MunicipalityMap";
import { ProjectionView } from "../components/Projection";
import { Sensitive, usePresentation } from "../app/Presentation";
import { useSectionNav } from "../app/SectionNav";
import { fechaCo, fmtN, limpiarNiu, mesCorto } from "../lib/format";

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
  ["seguimiento", "Seguimiento"],
  ["feedback", "Retroalimentación"],
  ["pipeline", "Estado del pipeline"],
  ["descargas", "Descargas por grupo"],
  ["datasets", "Todas las salidas"],
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
      { clave: "pipeline", etiqueta: "Estado del pipeline" },
      { clave: "descargas", etiqueta: "Descargas por grupo" },
      { clave: "datasets", etiqueta: "Todas las salidas" },
    ],
  },
  { nombre: "Sistema", items: [{ clave: "usuarios", etiqueta: "Usuarios y roles" }] },
];

export default function AdminPage() {
  const { idToken } = useAuth();
  const [tab, setTab] = useState<Tab>("resumen");
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const elegirTab = useCallback((clave: Tab) => {
    setTab(clave);
    if (clave !== "datasets") setSelectedDataset(null);
  }, []);
  useSectionNav(GRUPOS, tab, elegirTab);
  const [summary, setSummary] = useState<{ latest_run?: Run | null; counts: Record<string, number> } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { measure } = usePresentation();

  useEffect(() => {
    if (!idToken) return;
    let cancelled = false;
    Promise.all([api.summary(idToken), api.runs(idToken), api.adminUsers(idToken)])
      .then(([resumenData, corridas, administrados]) => {
        if (cancelled) return;
        setSummary(resumenData);
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
      <section className="page-intro">
        <div>
          <div className="eyebrow accent-eyebrow">ADMINISTRADOR DEL MODELO / CONTROL</div>
          <h1>El pipeline, de punta a punta.</h1>
          <p>Controla corridas, calidad, modelos, listas, retroalimentación y usuarios desde las salidas importadas.</p>
        </div>
      </section>

      {message && <div className="notice notice-warning">{message}</div>}

      {tab === "resumen" && <Resumen summary={summary} runs={runs} />}
      {tab === "gestion" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="cycle_summary" title="Resumen de gestión por ciclo" description="Cuántos clientes entran, gestionan y salen de la lista en cada ciclo." prioritarias={["ciclo", "corte", "en_lista", "gestionados"]} />
          <DatasetView token={idToken} datasetKey="managerial" title="Ranking gerencial por valor en riesgo" description="Vista gerencial de la lista operativa con priorización, zona y valor mensual." filters={[{ key: "zona_nombre", label: "Zona" }, { key: "prioridad_gestion", label: "Prioridad" }]} />
        </div>
      )}
      {tab === "ranking" && (
        <DatasetView token={idToken} datasetKey="managerial" title="Ranking gerencial por valor en riesgo" description="Ordenado por valor mensual en riesgo, con zona, ciclo y prioridad de gestión." filters={[{ key: "zona_nombre", label: "Zona" }, { key: "prioridad_gestion", label: "Prioridad" }]} prioritarias={["NIU", "prioridad_gestion", "valor_riesgo_mes", "zona_nombre", "ciclo_etiqueta"]} />
      )}
      {tab === "fuga" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="churn_scores" title="Clientes con riesgo de fuga" description="Probabilidad de salida a 6 meses, valor esperado de pérdida y señales del modelo." filters={[{ key: "nivel_riesgo", label: "Nivel de riesgo" }]} prioritarias={["NIU", "nivel_riesgo", "prob_fuga_6m", "valor_esperado_perdida_mes"]} />
          <DatasetView token={idToken} datasetKey="churn_feature_importance" title="Importancia de variables del modelo de fuga" />
          <DatasetView token={idToken} datasetKey="cluster_risk" title="Riesgo por clúster" />
          <DatasetView token={idToken} datasetKey="churn_model_metrics" title="Métricas del modelo de fuga" />
        </div>
      )}
      {tab === "cortes" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="cut_summary" title="Resumen por corte" description="Tamaño de la lista en cada corte de referencia." prioritarias={["corte", "en_lista", "gestionados"]} />
          <DatasetView token={idToken} datasetKey="list_entries_exits" title="Entradas y salidas de la lista" />
        </div>
      )}
      {tab === "mapa" && <MunicipalityMap token={idToken} onRowClick={() => navigate("/comercial")} />}
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
      {tab === "proyeccion" && (
        <div className="stack">
          <ProjectionView token={idToken} />
          <DatasetView token={idToken} datasetKey="projection_backtest" title="Error de backtest por zona" description="WAPE y sesgo de la proyección anual contra lo realmente consumido." />
          <DatasetView token={idToken} datasetKey="projection_model_comparison" title="Comparación de modelos de proyección" />
          <DatasetView token={idToken} datasetKey="projection_comparison" title="Comparación de escenarios" />
        </div>
      )}
      {tab === "seguimiento" && (
        <div className="stack">
          <DatasetView token={idToken} datasetKey="followup_clientes" title="Seguimiento por cliente" description="Clientes en lista, meses consecutivos y veces que han entrado en los últimos 12 meses." prioritarias={["NIU", "meses_en_lista", "veces_en_lista_12m", "valor_riesgo_mes"]} />
          <DatasetView token={idToken} datasetKey="cycle_summary" title="Resumen de gestión por ciclo" />
        </div>
      )}
      {tab === "feedback" && <Retroalimentacion token={idToken} />}
      {tab === "pipeline" && <Pipeline token={idToken} runs={runs} />}
      {tab === "descargas" && (
        <section className="data-module">
          <header className="module-heading">
            <div>
              <div className="eyebrow">EXPORTACIONES</div>
              <h2>Descargas por grupo</h2>
              <p>Cualquier salida del pipeline, con filtros y formato listo para Excel (punto de miles y coma decimal).</p>
            </div>
          </header>
          <DatasetCatalog token={idToken} onSelect={setSelectedDataset} />
          {selectedDataset && <DatasetView token={idToken} datasetKey={selectedDataset} title={`Vista previa: ${selectedDataset}`} pageSize={25} />}
        </section>
      )}
      {tab === "datasets" && (
        <section className="data-module">
          <header className="module-heading">
            <div>
              <div className="eyebrow">CATÁLOGO</div>
              <h2>Todas las salidas importadas</h2>
              <p>Selecciona un dataset para verlo con búsqueda, filtros y descarga.</p>
            </div>
          </header>
          <DatasetCatalog token={idToken} onSelect={setSelectedDataset} />
          {selectedDataset && <DatasetView token={idToken} datasetKey={selectedDataset} title={`Vista previa: ${selectedDataset}`} pageSize={25} />}
        </section>
      )}
      {tab === "usuarios" && <Users rows={users} onUpdate={updateUser} />}

      {tab === "resumen" && summary?.latest_run && (
        <p className="quiet-note">
          Corte vigente: {summary.latest_run.period} · {fmtN(summary.latest_run.rows_imported)} filas importadas {measure === "Consumo" ? "" : "(las cifras de energía se muestran en su unidad original)"}.
        </p>
      )}
    </div>
  );
}

function Resumen({ summary, runs }: { summary: { latest_run?: Run | null; counts: Record<string, number> } | null; runs: Run[] }) {
  return (
    <div className="stack">
      <div className="metric-grid">
        <Metric label="Clientes" value={summary?.counts.clients} />
        <Metric label="Lista operativa" value={summary?.counts.operational} />
        <Metric label="Riesgo de fuga" value={summary?.counts.churn_risks} />
        <Metric label="Estudios de caída" value={summary?.counts.drop_analysis} />
        <Metric label="Ubicaciones" value={summary?.counts.locations} />
        <Metric label="Visitas agendadas" value={summary?.counts.visits} />
      </div>
      <div className="split-panel">
        <div className="mini-chart">
          <div className="eyebrow">ÚLTIMO CORTE</div>
          <h3>{summary?.latest_run?.period ?? "Sin importar"}</h3>
          <MiniBars
            data={summary?.latest_run
              ? [
                  { label: "Filas importadas", value: summary.latest_run.rows_imported },
                  { label: "Clientes", value: summary.counts.clients ?? 0 },
                  { label: "Lista operativa", value: summary.counts.operational ?? 0 },
                ]
              : []}
          />
        </div>
        <div className="admin-note">
          <div className="eyebrow">CÓMO FUNCIONA</div>
          <h3>La aplicación consulta resultados precalculados.</h3>
          <p>El pipeline se ejecuta fuera de Vercel. Aquí se revisan sus salidas, calidad, versiones, seguimiento y retroalimentación de campo.</p>
        </div>
      </div>
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
  const [visitas, setVisitas] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .visits(token ?? undefined)
      .then((data) => {
        if (!cancelled) setVisitas(data as Array<Record<string, unknown>>);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar la retroalimentación.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const resultados = useMemo(() => visitas.filter((visita) => visita.result), [visitas]);

  return (
    <div className="stack">
      <DatasetView token={idTokenSafe(token)} datasetKey="feedback_summary" title="Evaluación de la retroalimentación de campo" description="Comparación entre lo que el modelo preveía y lo que ocurrió realmente en las cuentas visitadas." />
      <section className="data-module">
        <header className="module-heading">
          <h2>Resultados registrados en visitas</h2>
          <p>Lo que dejaron los asesores de campo al cerrar cada visita.</p>
        </header>
        {error && <div className="empty-state">{error}</div>}
        {!resultados.length && !error && <div className="empty-state">Aún no hay resultados de visita registrados.</div>}
        {resultados.length > 0 && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>NIU</th>
                  <th>Resultado</th>
                  <th>Notas</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((visita) => (
                  <tr key={String(visita.id)}>
                    <td>
                      <Sensitive value={visita.niu} />
                    </td>
                    <td>{String(visita.result ?? "—")}</td>
                    <td>{String(visita.notes ?? "—")}</td>
                    <td>{fechaCo(visita.created_at ?? visita.scheduled_for)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function idTokenSafe(token?: string | null): string | undefined {
  return token ?? undefined;
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

function Metric({ label, value }: { label: string; value?: number | string | null }) {
  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value == null ? "—" : typeof value === "number" ? fmtN(value) : value}</div>
      <div className="metric-detail">Azure SQL · último corte</div>
    </article>
  );
}
