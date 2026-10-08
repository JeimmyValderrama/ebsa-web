import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";

type Risk = { id: number; niu: string; ciclo?: number; severidad?: string; trayectoria?: string; prioridad_gestion?: string; valor_riesgo_mes?: number; payload?: Record<string, unknown> };
type Summary = { latest_run: { period: string; rows_imported: number; completed_at?: string } | null; counts: Record<string, number> };

export default function CommercialPage() {
  const { firebaseUser } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [severity, setSeverity] = useState("TODAS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const [nextSummary, nextRisks] = await Promise.all([api.summary(token), api.risks(token, 100)]);
        if (active) { setSummary(nextSummary); setRisks(nextRisks.items as Risk[]); }
      } catch (cause: unknown) { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar los datos."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [firebaseUser]);

  const filtered = useMemo(() => severity === "TODAS" ? risks : risks.filter((row) => row.severidad === severity), [risks, severity]);
  function download() {
    const header = "NIU;Ciclo;Severidad;Trayectoria;Prioridad;Valor riesgo\n";
    const body = filtered.map((row) => [row.niu, row.ciclo ?? "", row.severidad ?? "", row.trayectoria ?? "", row.prioridad_gestion ?? "", row.valor_riesgo_mes ?? ""].join(";")).join("\n");
    const blob = new Blob(["\ufeff" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "ebsa_riesgo_gestion.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="page-content"><PageIntro title="Vista Comercial" eyebrow="COMERCIAL / DECISIONES DE NEGOCIO" description="Prioriza clientes, entiende la caída y descarga listas listas para la gestión." action={<button className="secondary-button" onClick={download} disabled={!filtered.length}>Descargar lista CSV ↓</button>} />
    {error && <div className="notice notice-error">{error}</div>}
    <div className="metric-grid"> <Metric label="Clientes evaluados" value={loading ? "…" : fmt(summary?.counts.clients)} detail="En el último esquema importado" tone="blue" /> <Metric label="En riesgo operativo" value={loading ? "…" : fmt(summary?.counts.operational)} detail="Lista priorizada para gestión" tone="orange" /> <Metric label="Riesgo de fuga" value={loading ? "…" : fmt(summary?.counts.churn_risks)} detail="Probabilidad a seis meses" tone="purple" /> <Metric label="Último corte" value={summary?.latest_run?.period ?? "Pendiente"} detail={summary?.latest_run ? `${fmt(summary.latest_run.rows_imported)} filas cargadas` : "Ejecuta el importador"} tone="green" /> </div>
    <div className="section-heading"><div><div className="eyebrow">LISTA DE ACCIÓN</div><h2>Clientes que requieren lectura</h2></div><select className="filter-select" value={severity} onChange={(event) => setSeverity(event.target.value)}><option>TODAS</option><option>ALTA</option><option>MEDIA</option><option>BAJA</option></select></div>
    {loading ? <Loading /> : <DataTable rows={filtered} />}
    <div className="commercial-grid"><InfoPanel title="Caídas de consumo" text="La tabla de riesgo combina severidad, trayectoria y valor mensual en riesgo. La etapa siguiente conectará las listas detalladas de caída y clientes que ya se fueron." /><InfoPanel title="Proyección y mapa" text="Las coordenadas, ciclos y pronósticos quedan almacenados para construir el mapa de Boyacá y la proyección mensual sin volver a leer archivos grandes." /></div>
  </div>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <section className="page-intro"><div><div className="eyebrow accent-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</section>; }
function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <article className={`metric-card tone-${tone}`}><div className="metric-topline"><span className="metric-label">{label}</span><span className="metric-line" /></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></article>; }
function DataTable({ rows }: { rows: Risk[] }) { if (!rows.length) return <div className="empty-state">No hay filas para este filtro. Importa un corte para ver clientes.</div>; return <div className="table-card"><table><thead><tr><th>NIU</th><th>Ciclo</th><th>Severidad</th><th>Trayectoria</th><th>Prioridad</th><th>Valor en riesgo</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.niu}</strong></td><td>{row.ciclo ?? "—"}</td><td><span className={`badge badge-${String(row.severidad ?? "").toLowerCase()}`}>{row.severidad ?? "—"}</span></td><td>{row.trayectoria ?? "—"}</td><td>{row.prioridad_gestion ?? "—"}</td><td>{row.valor_riesgo_mes == null ? "—" : `$${row.valor_riesgo_mes.toLocaleString("es-CO")}`}</td></tr>)}</tbody></table></div>; }
function InfoPanel({ title, text }: { title: string; text: string }) { return <article className="info-panel"><div className="eyebrow">MÓDULO</div><h3>{title}</h3><p>{text}</p></article>; }
function Loading() { return <div className="empty-state">Cargando el último corte…</div>; }
function fmt(value?: number) { return value == null ? "—" : value.toLocaleString("es-CO"); }
