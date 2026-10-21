import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { DatasetCatalog, DatasetView, type FilterField, type Row } from "../components/DataExplorer";
import { MunicipalityMap } from "../components/MunicipalityMap";
import { ProjectionView } from "../components/Projection";
import { MeasureSelector, usePresentation } from "../app/Presentation";
import { colMedida, energia, fmtN, fmtMedida, pesos, unidadMedida } from "../lib/format";

type PanoramaData = Awaited<ReturnType<typeof api.panorama>>;

const sections = [
  ["panorama", "Panorama"],
  ["caidas", "Caídas de consumo"],
  ["sin_consumo", "Clientes sin consumo"],
  ["fuga", "Clientes con probabilidad de fuga"],
  ["salidas", "Clientes que ya se fueron"],
  ["proyeccion", "Proyección de consumo"],
  ["descargas", "Descargas"],
] as const;

type Section = (typeof sections)[number][0];

const FILTROS_CAIDAS: FilterField[] = [{ key: "veredicto", label: "Veredicto" }, { key: "severidad", label: "Gravedad" }, { key: "zona", label: "Zona" }];
const FILTROS_FUGA: FilterField[] = [{ key: "nivel_riesgo", label: "Nivel de riesgo" }, { key: "perfil", label: "Perfil" }];
const COLUMNAS_LISTA = ["NIU", "zona_nombre", "clase_servicio_nombre", "gravedad", "trayectoria", "prioridad_gestion", "valor_riesgo_mes"];

export default function CommercialPage() {
  const { idToken, currentUser } = useAuth();
  const [section, setSection] = useState<Section>("panorama");
  const navigate = useNavigate();
  // La ficha por NIU vive en Soporte; solo se ofrece a los roles que pueden abrirla.
  const puedeFichas = (currentUser?.role ?? "COMERCIAL") !== "COMERCIAL";
  const abrirFicha = useCallback(
    (row: Row) => {
      const niu = row.niu ?? String(row.payload?.NIU ?? "");
      if (niu && puedeFichas) navigate(`/soporte?niu=${encodeURIComponent(niu)}`);
    },
    [navigate, puedeFichas],
  );

  return (
    <div className="page-content">
      <section className="page-intro">
        <div>
          <div className="eyebrow accent-eyebrow">COMERCIAL / DECISIONES DE NEGOCIO</div>
          <h1>Todo el panorama comercial.</h1>
          <p>Las mismas listas, cortes, pronósticos y salidas del pipeline, organizados para decidir a quién llamar y qué gestionar.</p>
        </div>
        <MeasureSelector />
      </section>

      <div className="admin-tabs">
        {sections.map(([key, label]) => (
          <button key={key} className={section === key ? "admin-tab active" : "admin-tab"} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {section === "panorama" && <Panorama token={idToken} onOpenClient={abrirFicha} onGoProjection={() => setSection("proyeccion")} puedeFichas={puedeFichas} />}
      {section === "caidas" && (
        <DatasetView
          token={idToken}
          datasetKey="drop_analysis"
          title="Clientes cuya facturación está cayendo"
          description="Estudio de caída de consumo por cliente: veredicto, gravedad, consumo anterior y reciente, y variación contra el periodo anterior."
          filters={FILTROS_CAIDAS}
          prioritarias={["NIU", "veredicto", "severidad", "consumo_anterior_kwh", "consumo_reciente_kwh", "variacion_vs_anterior_pct"]}
          action={puedeFichas ? abrirFicha : undefined}
          actionLabel="Ver ficha"
        />
      )}
      {section === "sin_consumo" && (
        <DatasetView
          token={idToken}
          datasetKey="zero_sustained"
          title="Clientes sin consumo (cero sostenido)"
          description="Clientes con consumo en cero durante varios meses consecutivos; la mayoría vuelve, por eso se separan de la lista de caída."
          filters={[{ key: "grupo_consumo", label: "Grupo" }, { key: "zona_nombre", label: "Zona" }]}
          prioritarias={["NIU", "meses_en_cero", "meses_en_cero_consecutivos", "grupo_consumo", "zona_nombre"]}
          action={puedeFichas ? abrirFicha : undefined}
          actionLabel="Ver ficha"
        />
      )}
      {section === "fuga" && (
        <DatasetView
          token={idToken}
          datasetKey="churn_scores"
          title="Clientes con probabilidad de irse a otro comercializador"
          description="Probabilidad de salida a 6 meses, valor esperado de pérdida y señales del modelo de fuga."
          filters={FILTROS_FUGA}
          prioritarias={["NIU", "nivel_riesgo", "prob_fuga_6m", "valor_esperado_perdida_mes", "valor_en_riesgo_mes"]}
          action={puedeFichas ? abrirFicha : undefined}
          actionLabel="Ver ficha"
        />
      )}
      {section === "salidas" && (
        <div className="stack">
          <DatasetView
            token={idToken}
            datasetKey="churn_other_supplier"
            title="Clientes que ya se fueron a otro comercializador"
            description="Cruce de la base con la historia de consumo para ver su tamaño y antigüedad."
            prioritarias={["NIU", "zona_nombre", "grupo_consumo", "meses_desde_salida", "consumo_prom_semestral_kwh"]}
            action={puedeFichas ? abrirFicha : undefined}
            actionLabel="Ver ficha"
          />
          <DatasetView token={idToken} datasetKey="churn_non_regulated" title="Vigilancia de mercado no regulado" description="Clientes con señales de haber migrado a mercado no regulado." />
        </div>
      )}
      {section === "proyeccion" && <ProjectionView token={idToken} />}
      {section === "descargas" && <DownloadHub token={idToken} />}
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </article>
  );
}

function Panorama({ token, onOpenClient, onGoProjection, puedeFichas }: { token?: string | null; onOpenClient: (row: Row) => void; onGoProjection: () => void; puedeFichas: boolean }) {
  const { measure } = usePresentation();
  const [data, setData] = useState<PanoramaData | null>(null);
  const [risks, setRisks] = useState<{ items: Row[]; total: number } | null>(null);
  const [severity, setSeverity] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.panorama(token ?? undefined), api.risks(token ?? undefined, 25, 0, severity, prioridad)])
      .then(([panorama, riesgos]) => {
        if (cancelled) return;
        setData(panorama);
        setRisks({ items: riesgos.items as Row[], total: riesgos.total });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar el panorama.");
      });
    return () => {
      cancelled = true;
    };
  }, [prioridad, severity, token]);

  const cifraLista = colMedida("perdida_kwh_mes", "valor_riesgo_mes", measure);
  const bandas = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.por_prioridad)
      .map(([prioridadKey, valor]) => ({
        prioridad: prioridadKey,
        clientes: valor.clientes,
        medida: measure === "Consumo" ? valor.perdida_kwh_mes : valor.valor_riesgo_mes,
      }))
      .sort((a, b) => b.medida - a.medida);
  }, [data, measure]);
  const maxBanda = Math.max(1, ...bandas.map((banda) => banda.medida));

  return (
    <div className="stack">
      <section className="data-module">
        <header className="module-heading">
          <div>
            <div className="eyebrow">PANORAMA DEL CORTE</div>
            <h2>Lo que hay que atender este mes</h2>
            <p>
              Cifras en {unidadMedida(measure)} donde aplica: {cifraLista === "perdida_kwh_mes" ? "energía que dejó de facturarse" : "valor mensual que está en riesgo"}.
            </p>
          </div>
        </header>

        {error && <div className="empty-state">{error}</div>}
        {!data && !error && <div className="empty-state">Cargando panorama…</div>}
        {data && (
          <>
            <div className="metric-grid">
              <Kpi label="Clientes en la lista de caída" value={fmtN(data.lista.clientes)} detail="Ciclo de gestión actual" />
              <Kpi
                label={measure === "Consumo" ? "Caída de consumo (kWh/mes)" : "Valor en riesgo ($/mes)"}
                value={fmtMedida(measure === "Consumo" ? data.lista.perdida_kwh_mes : data.lista.valor_riesgo_mes, measure)}
                detail={`Equivalente: ${measure === "Consumo" ? pesos(data.lista.valor_riesgo_mes) + "/mes" : energia(data.lista.perdida_kwh_mes) + "/mes"}`}
              />
              <Kpi label="Riesgo de fuga ALTO/MEDIO" value={fmtN(data.fuga.clientes)} detail={`Pérdida esperada ${pesos(data.fuga.perdida_esperada_mes)}/mes`} />
              <Kpi label="Clientes con cero sostenido" value={fmtN(data.cero_sostenido)} detail={`${fmtN(data.otro_comercializador)} con otro comercializador`} />
            </div>

            <div className="split-panel">
              <div className="mini-chart">
                <div className="eyebrow">GESTIÓN POR PRIORIDAD</div>
                <h3>En qué conviene concentrar el ciclo</h3>
                {bandas.map((banda) => (
                  <div key={banda.prioridad} className="bar-row">
                    <span className="bar-label">{banda.prioridad}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${Math.max(2, (banda.medida / maxBanda) * 100)}%` }} />
                    </span>
                    <span className="bar-value">{fmtN(banda.clientes)}</span>
                  </div>
                ))}
                <p className="quiet-note">La barra mide {unidadMedida(measure)}; el número es la cantidad de clientes.</p>
              </div>

              <div className="filter-card">
                <div className="eyebrow">MERCADO</div>
                <h3>Poblaciones que EBSA vigila</h3>
                <div className="ficha-grid">
                  <div className="ficha-item">
                    <span>Mercado no regulado</span>
                    <b>{fmtN(data.mercado_no_regulado)}</b>
                  </div>
                  <div className="ficha-item">
                    <span>Cero sostenido</span>
                    <b>{fmtN(data.cero_sostenido)}</b>
                  </div>
                  <div className="ficha-item">
                    <span>Otro comercializador</span>
                    <b>{fmtN(data.otro_comercializador)}</b>
                  </div>
                </div>
                <p>
                  La proyección de compra de energía está en su sección.{" "}
                  <button type="button" className="table-action" onClick={onGoProjection}>
                    Ver proyección →
                  </button>
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      <MunicipalityMap token={token} onRowClick={() => undefined} />

      <section className="data-module">
        <header className="module-heading">
          <h2>Mayores valores en riesgo</h2>
          <p>Ordenados por valor mensual en riesgo. Usa los filtros para acotar la lista y abre la ficha desde cualquier fila.</p>
        </header>
        <div className="data-toolbar">
          <select className="filter-select" value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Gravedad">
            <option value="">Gravedad: todas</option>
            <option value="CRITICA">Crítica</option>
            <option value="FUERTE">Fuerte</option>
            <option value="MODERADA">Moderada</option>
          </select>
          <select className="filter-select" value={prioridad} onChange={(event) => setPrioridad(event.target.value)} aria-label="Prioridad de gestión">
            <option value="">Prioridad: todas</option>
            <option value="GESTIONAR">Gestionar</option>
            <option value="SEGUIMIENTO">Seguimiento</option>
            <option value="VIGILAR">Vigilar</option>
          </select>
          <span className="section-status">{risks ? `${fmtN(risks.total)} clientes en la lista` : ""}</span>
        </div>
        {risks && risks.items.length > 0 && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>NIU</th>
                  <th>Zona</th>
                  <th>Clase</th>
                  <th>Gravedad</th>
                  <th>Trayectoria</th>
                  <th>Prioridad</th>
                  <th>{measure === "Consumo" ? "Caída (kWh/mes)" : "Valor en riesgo ($/mes)"}</th>
                  {puedeFichas && <th>Ficha</th>}
                </tr>
              </thead>
              <tbody>
                {risks.items.map((row) => (
                  <tr key={String(row.id)} className={puedeFichas ? "clickable-row" : undefined} onClick={() => puedeFichas && onOpenClient(row)}>
                    <td>{String(row.payload?.NIU ?? row.niu ?? "—")}</td>
                    <td>{String(row.payload?.zona_nombre ?? "—")}</td>
                    <td>{String(row.payload?.clase_servicio_nombre ?? "—")}</td>
                    <td>
                      <span className={`badge ${String(row.payload?.gravedad ?? "").toLowerCase()}`}>{String(row.payload?.gravedad ?? "—")}</span>
                    </td>
                    <td>{String(row.payload?.trayectoria ?? "—")}</td>
                    <td>{String(row.payload?.prioridad_gestion ?? "—")}</td>
                    <td>{fmtMedida(measure === "Consumo" ? Number(row.payload?.perdida_kwh_mes ?? 0) : Number(row.payload?.valor_riesgo_mes ?? 0), measure)}</td>
                    {puedeFichas && (
                      <td>
                        <button type="button" className="table-action" onClick={() => onOpenClient(row)}>
                          Ver ficha
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {risks && risks.items.length === 0 && <div className="empty-state">No hay clientes con esos filtros en el corte actual.</div>}
      </section>
    </div>
  );
}

function DownloadHub({ token }: { token?: string | null }) {
  const [selected, setSelected] = useState("operational");
  return (
    <section className="data-module">
      <header className="module-heading">
        <div>
          <div className="eyebrow">EXPORTACIONES</div>
          <h2>Descargas completas del pipeline</h2>
          <p>Selecciona cualquier salida importada. La vista previa se puede filtrar y descargar tal como se ve en pantalla.</p>
        </div>
      </header>
      <DatasetCatalog token={token} onSelect={setSelected} />
      <DatasetView token={token} datasetKey={selected} title={`Vista previa: ${selected}`} pageSize={25} />
    </section>
  );
}
