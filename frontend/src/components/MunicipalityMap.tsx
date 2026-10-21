import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { energia, fmtN, pesos, type Measure } from "../lib/format";
import { usePresentation } from "../app/Presentation";

/**
 * Mapa coroplético de Boyacá por municipio.
 * Une los límites (GeoJSON con codigo_municipio / nombre_dane) con las métricas
 * agregadas del endpoint /api/data/municipalities/metrics.
 */

type Geometry = { type: string; coordinates: unknown };
type Feature = { properties: { codigo_municipio?: string; nombre_dane?: string }; geometry: Geometry };
type GeoJson = { features: Feature[] };

type MetricInfo = { key: string; label: string; unidad: string };
type MetricRow = Record<string, unknown> & {
  municipio?: string;
  codigo_municipio?: string;
  clave?: string;
};

const PALETA = ["map-q1", "map-q2", "map-q3", "map-q4", "map-q5"];

/** Métrica por defecto del mapa según la medida activa (kWh <-> pesos). */
const METRICA_POR_MEDIDA: Record<Measure, string> = { Consumo: "caida_kwh_mes", "Facturación": "caida_valor_mes" };

function nombreClave(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Formato según la unidad de la métrica elegida: $/mes, kWh/mes o clientes. */
function fmtMetrica(value: number, unidad: string): string {
  if (unidad.startsWith("$")) return pesos(value);
  if (unidad.toLowerCase().startsWith("kwh")) return energia(value);
  return fmtN(value);
}

function ringPath(ring: number[][], project: (lon: number, lat: number) => string): string {
  return ring.map((point, index) => `${index === 0 ? "M" : "L"}${project(point[0], point[1])}`).join(" ") + " Z";
}

function geometryPath(geometry: Geometry, project: (lon: number, lat: number) => string): string {
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][]).map((ring) => ringPath(ring, project)).join(" ");
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).map((polygon) => polygon.map((ring) => ringPath(ring, project)).join(" ")).join(" ");
  }
  return "";
}

function bbox(features: Feature[]): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const walk = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      const [lon, lat] = coordinates as [number, number];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    coordinates.forEach(walk);
  };
  features.forEach((feature) => walk(feature.geometry.coordinates));
  return { minLon, maxLon, minLat, maxLat };
}

/** Escala por cuantiles:5 tramos equilibrados (los valores suelen estar muy sesgados). */
function umbralCuantil(valores: number[]): number[] {
  const sorted = [...valores].sort((a, b) => a - b);
  const paso = Math.max(1, Math.floor(sorted.length / 5));
  return [1, 2, 3, 4].map((index) => sorted[Math.min(sorted.length - 1, index * paso)] || 0);
}

export function MunicipalityMap({ token, onRowClick }: { token?: string | null; onRowClick?: (row: MetricRow) => void }) {
  const { measure } = usePresentation();
  const [geo, setGeo] = useState<GeoJson | null>(null);
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [metric, setMetric] = useState("");
  const [metricElegido, setMetricElegido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // La métrica del mapa sigue la medida global (Consumo -> kWh, Facturación -> $),
  // salvo que quien la use elija otra manualmente.
  useEffect(() => {
    if (metricElegido) return;
    const sugerida = METRICA_POR_MEDIDA[measure];
    if (sugerida) setMetric(sugerida);
  }, [measure, metricElegido]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}limites_municipios_boyaca.geojson`).then((response) => response.json() as Promise<GeoJson>),
      api.municipalityMetrics(token ?? undefined),
    ])
      .then(([geoJson, data]) => {
        if (cancelled) return;
        setGeo(geoJson);
        setMetrics(data.metrics);
        setRows(data.rows as MetricRow[]);
        setMetric((current) => current || data.metrics[0]?.key || "");
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar el mapa.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const porCodigo = useMemo(() => {
    const index = new Map<string, MetricRow>();
    for (const row of rows) {
      if (row.codigo_municipio) index.set(String(row.codigo_municipio), row);
      if (row.clave) index.set(nombreClave(row.municipio), row);
    }
    return index;
  }, [rows]);

  const valores = useMemo(() => rows.map((row) => Number(row[metric] ?? 0)).filter((value) => Number.isFinite(value)), [metric, rows]);
  const cortes = useMemo(() => umbralCuantil(valores), [valores]);
  const maximo = useMemo(() => Math.max(1, ...valores), [valores]);
  const info = metrics.find((item) => item.key === metric);

  const shapes = useMemo(() => {
    if (!geo) return null;
    const bounds = bbox(geo.features);
    const width = 1000;
    const height = 1000;
    const spanLon = bounds.maxLon - bounds.minLon || 1;
    const spanLat = bounds.maxLat - bounds.minLat || 1;
    const escala = Math.min(width / spanLon, height / spanLat) * 0.92;
    const offsetX = (width - spanLon * escala) / 2;
    const offsetY = (height - spanLat * escala) / 2;
    const project = (lon: number, lat: number): string => {
      const x = offsetX + (lon - bounds.minLon) * escala;
      const y = height - (offsetY + (lat - bounds.minLat) * escala);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    return geo.features.map((feature) => {
      const props = feature.properties;
      const row = porCodigo.get(String(props.codigo_municipio ?? "")) ?? porCodigo.get(nombreClave(props.nombre_dane));
      const value = Number(row?.[metric] ?? 0);
      const nivel = Number.isFinite(value) ? cortes.filter((umbral) => value > umbral).length : -1;
      return {
        key: String(props.codigo_municipio ?? props.nombre_dane),
        nombre: String(props.nombre_dane ?? row?.municipio ?? ""),
        d: geometryPath(feature.geometry, project),
        value,
        nivel: row ? nivel : -1,
        row: row ?? null,
      };
    });
  }, [cortes, geo, metric, porCodigo]);

  const top = useMemo(() => [...rows].sort((a, b) => Number(b[metric] ?? 0) - Number(a[metric] ?? 0)).slice(0, 10), [metric, rows]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!shapes) return <div className="empty-state">Cargando mapa…</div>;

  return (
    <section className="data-module">
      <header className="module-heading">
        <h2>Mapa de riesgo por municipio</h2>
        <p>Cada municipio se colorea según la métrica elegida. Pasa el cursor sobre el municipio para ver la cifra.</p>
      </header>

      <div className="data-toolbar">
        <select
          className="filter-select"
          value={metric}
          onChange={(event) => {
            setMetricElegido(true);
            setMetric(event.target.value);
          }}
          aria-label="Métrica del mapa"
        >
          {metrics.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="section-status">
          {info ? `${info.label} (${info.unidad})` : ""} · máximo {fmtMetrica(maximo, info?.unidad ?? "")}
        </span>
      </div>

      <div className="split-panel">
        <div className="map-panel">
          <svg viewBox="0 0 1000 1000" className="choropleth" role="img" aria-label={info?.label ?? "Mapa de municipios"}>
            {shapes.map((shape) => (
              <path
                key={shape.key}
                d={shape.d}
                className={`map-shape ${shape.nivel >= 0 ? PALETA[shape.nivel] : "map-none"} ${hover === shape.key ? "map-hover" : ""}`}
                onMouseEnter={() => setHover(shape.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => shape.row && onRowClick?.(shape.row)}
              >
                <title>
                  {shape.nombre}: {fmtMetrica(shape.value, info?.unidad ?? "")}
                </title>
              </path>
            ))}
          </svg>
          <div className="map-legend">
            {PALETA.map((clase, index) => (
              <span key={clase} className={`legend-swatch ${clase}`}>
                {index === 0 ? "menor" : index === PALETA.length - 1 ? "mayor" : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="stack">
          <h3>Mayores valores</h3>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Municipio</th>
                  <th>Zona</th>
                  <th>{info?.label ?? "Valor"}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => (
                  <tr key={String(row.clave ?? row.municipio)} onClick={() => onRowClick?.(row)} className="clickable-row">
                    <td>{String(row.municipio ?? "—")}</td>
                    <td>{String(row.zona_ebsa ?? row.zona_regional ?? "—")}</td>
                    <td>{fmtMetrica(Number(row[metric] ?? 0), info?.unidad ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
