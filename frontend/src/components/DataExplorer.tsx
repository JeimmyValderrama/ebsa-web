import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type Row = { id: number; niu?: string; payload: Record<string, unknown> };

export function flattenRow(row: Row): Record<string, unknown> { return { NIU: row.niu ?? "", ...row.payload }; }

export function DatasetTable({ rows, max = 200 }: { rows: Row[]; max?: number }) {
  const flat = rows.slice(0, max).map(flattenRow);
  const columns = Array.from(new Set(flat.flatMap((row) => Object.keys(row)))).slice(0, 24);
  if (!flat.length) return <div className="empty-state">No hay registros para este corte o filtro.</div>;
  return <div className="table-card"><table><thead><tr>{columns.map((column) => <th key={column}>{human(column)}</th>)}</tr></thead><tbody>{flat.map((row, index) => <tr key={`${String(row.NIU)}-${index}`}>{columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

export function DatasetView({ token, datasetKey, title, description, limit = 400 }: { token: string; datasetKey: string; title: string; description?: string; limit?: number }) {
  const [rows, setRows] = useState<Row[]>([]); const [search, setSearch] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; setLoading(true); api.dataset(token, datasetKey, limit, 0, search).then((data) => { if (active) setRows(data.items); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo consultar el dataset."); }).finally(() => active && setLoading(false)); return () => { active = false; }; }, [token, datasetKey, limit, search]);
  async function download() { try { const blob = await api.datasetCsv(token, datasetKey); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ebsa_${datasetKey}.csv`; anchor.click(); URL.revokeObjectURL(url); } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "No se pudo descargar."); } }
  return <section className="data-module"><div className="module-heading"><div><div className="eyebrow">DATASET DEL PIPELINE</div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="secondary-button" onClick={download}>Descargar CSV</button></div><div className="data-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en los registros" /><span>{loading ? "Consultando…" : `${rows.length} registros cargados`}</span></div>{error && <div className="notice notice-error">{error}</div>}{loading ? <div className="empty-state">Consultando Azure SQL…</div> : <DatasetTable rows={rows} />}</section>;
}

export function DatasetCatalog({ token, onSelect }: { token: string; onSelect: (key: string) => void }) {
  const [catalog, setCatalog] = useState<Array<{ dataset_key: string; rows: number }>>([]);
  useEffect(() => { api.catalog(token).then(setCatalog).catch(() => setCatalog([])); }, [token]);
  return <div className="catalog-grid">{catalog.map((item) => <button className="catalog-card" key={item.dataset_key} onClick={() => onSelect(item.dataset_key)}><strong>{human(item.dataset_key)}</strong><span>{item.rows.toLocaleString("es-CO")} filas</span></button>)}</div>;
}

export function MiniBars({ values, label }: { values: Array<{ label: string; value: number }>; label: string }) {
  const max = Math.max(...values.map((item) => item.value), 1);
  return <div className="mini-chart"><div className="eyebrow">{label}</div>{values.slice(0, 12).map((item) => <div className="bar-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${Math.max(3, item.value / max * 100)}%` }} /></div><b>{item.value.toLocaleString("es-CO")}</b></div>)}</div>;
}

export function LocationPlot({ token }: { token: string }) {
  const [points, setPoints] = useState<Array<{ niu: string; municipio?: string; latitud: number; longitud: number }>>([]);
  useEffect(() => { api.locations(token, 3000).then((rows) => setPoints(rows as typeof points)).catch(() => setPoints([])); }, [token]);
  const bounds = useMemo(() => { if (!points.length) return null; const lat = points.map((point) => point.latitud); const lon = points.map((point) => point.longitud); return { minLat: Math.min(...lat), maxLat: Math.max(...lat), minLon: Math.min(...lon), maxLon: Math.max(...lon) }; }, [points]);
  return <section className="map-panel"><div className="module-heading"><div><div className="eyebrow">GEOGRAFÍA OPERATIVA</div><h2>Clientes y situaciones en el territorio</h2><p>Vista de puntos cargados desde el cruce de ubicación del pipeline. Pasa el cursor para consultar el NIU.</p></div><span className="section-status"><span className="status-dot" /> {points.length.toLocaleString("es-CO")} puntos</span></div>{!bounds ? <div className="empty-state">No hay coordenadas válidas importadas.</div> : <div className="coordinate-map">{points.map((point) => <span key={`${point.niu}-${point.latitud}`} title={`${point.niu} · ${point.municipio ?? "Sin municipio"}`} style={{ left: `${(point.longitud - bounds.minLon) / Math.max(bounds.maxLon - bounds.minLon, 0.0001) * 92 + 4}%`, top: `${100 - (point.latitud - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.0001) * 88 - 6}%` }} />)}</div>}</section>;
}

function human(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatValue(value: unknown) { if (value == null || value === "") return "—"; if (typeof value === "number") return value.toLocaleString("es-CO"); if (typeof value === "boolean") return value ? "Sí" : "No"; return String(value); }
