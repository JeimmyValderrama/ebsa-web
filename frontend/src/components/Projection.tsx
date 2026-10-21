import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { energia, fmtN, mesCorto, type Measure } from "../lib/format";
import { usePresentation, HORIZONTES_PROY } from "../app/Presentation";

/**
 * Proyección de consumo (compra de energía), equivalente a la sección del Streamlit.
 * El modelo calcula 36 meses; el horizonte solo recorta lo que se muestra.
 */

type Mensual = {
  periodo: string;
  tipo: string;
  real_gwh: number | null;
  proyeccion_gwh: number | null;
  inf80_gwh: number | null;
  sup80_gwh: number | null;
  escenario?: string;
  zona_regional?: string;
};

type Anual = {
  anio: number;
  total_gwh: number | null;
  meses_proyectados?: number;
  meses_reales?: number;
  escenario?: string;
  zona_regional?: string;
};

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type Recorte = {
  mensual: Mensual[];
  anual: Anual[];
  fin: Date | null;
  fuera: number[];
};

/** recortar_proyeccion(): un año anual solo se muestra completo si el horizonte llega a diciembre. */
export function recortarProyeccion(mensual: Mensual[], anual: Anual[], meses: number | null): Recorte {
  const reales = mensual.filter((row) => row.tipo === "REAL").map((row) => row.periodo).sort();
  if (meses === null || !reales.length) return { mensual, anual, fin: null, fuera: [] };
  const [ultimoAnio, ultimoMes] = reales[reales.length - 1].slice(0, 7).split("-").map(Number);
  const ultimo = new Date(ultimoAnio, ultimoMes - 1, 1);
  const fin = addMonths(ultimo, meses);
  const limite = monthKey(fin);
  const mensualRecortada = mensual.filter((row) => row.tipo !== "PROYECCION" || row.periodo.slice(0, 7) <= limite);
  const fuera = new Set<number>();
  for (const row of anual) {
    if ((row.meses_proyectados ?? 0) > 0 && row.anio > fin.getFullYear()) fuera.add(row.anio);
  }
  if (fin.getMonth() !== 11) {
    const parcial = fin.getFullYear();
    const parcialProyectado = anual.some((row) => row.anio === parcial && (row.meses_proyectados ?? 0) > 0) && parcial !== ultimoAnio;
    if (parcialProyectado) fuera.add(parcial);
  }
  return { mensual: mensualRecortada, anual: anual.filter((row) => !fuera.has(row.anio)), fin, fuera: [...fuera].sort() };
}

function SerieChart({ mensual, measure }: { mensual: Mensual[]; measure: Measure }) {
  const puntos = useMemo(() => {
    const sorted = [...mensual].sort((a, b) => a.periodo.localeCompare(b.periodo));
    const valores = sorted.flatMap((row) => [row.real_gwh, row.proyeccion_gwh]).filter((value): value is number => typeof value === "number");
    const max = Math.max(1, ...valores);
    const width = 720;
    const height = 220;
    const padding = 28;
    const escalaX = (index: number) => padding + (index / Math.max(1, sorted.length - 1)) * (width - padding * 2);
    const escalaY = (value: number) => height - padding - (value / max) * (height - padding * 2);
    const serie = (selector: (row: Mensual) => number | null) =>
      sorted
        .map((row, index) => ({ x: escalaX(index), y: selector(row), periodo: row.periodo }))
        .filter((point) => point.y !== null)
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${escalaY(point.y as number).toFixed(1)}`)
        .join(" ");
    const banda = sorted
      .filter((row) => row.inf80_gwh !== null && row.sup80_gwh !== null)
      .map((row, index, lista) => {
        const x = escalaX(sorted.indexOf(row));
        return { x, up: row.sup80_gwh as number, down: row.inf80_gwh as number, index, total: lista.length };
      });
    const bandaPath = banda.length
      ? banda.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${escalaY(point.up).toFixed(1)}`).join(" ") +
        " " +
        [...banda].reverse().map((point) => `L${point.x.toFixed(1)},${escalaY(point.down).toFixed(1)}`).join(" ") +
        " Z"
      : "";
    return { real: serie((row) => row.real_gwh), proyeccion: serie((row) => row.proyeccion_gwh), banda: bandaPath, max, escalaY, width, height, padding, sorted };
  }, [mensual]);

  if (!puntos.sorted.length) return <div className="empty-state">No hay serie mensual para los filtros elegidos.</div>;

  return (
    <div className="chart-card">
      <svg viewBox={`0 0 ${puntos.width} ${puntos.height}`} className="line-chart" role="img" aria-label="Serie mensual real y proyectada">
        <line x1={puntos.padding} y1={puntos.height - puntos.padding} x2={puntos.width - puntos.padding} y2={puntos.height - puntos.padding} className="chart-axis" />
        {puntos.banda && <path d={puntos.banda} className="chart-band" />}
        <path d={puntos.real} className="chart-line chart-real" />
        <path d={puntos.proyeccion} className="chart-line chart-proj" />
      </svg>
      <div className="chart-footer">
        <span className="legend-item legend-real">Consumo real</span>
        <span className="legend-item legend-proj">Proyección (escenario base)</span>
        <span className="legend-item legend-band">Banda de incertidumbre 80%</span>
        <span className="legend-note">Máximo del periodo: {measure === "Consumo" ? energia(puntos.max) : fmtN(puntos.max, 2) + " GWh"} · eje mensual en GWh</span>
      </div>
      <div className="chart-axis-labels">
        <span>{mesCorto(puntos.sorted[0].periodo)}</span>
        <span>{mesCorto(puntos.sorted[puntos.sorted.length - 1].periodo)}</span>
      </div>
    </div>
  );
}

export function ProjectionView({ token, showZoneFilter = true }: { token?: string | null; showZoneFilter?: boolean }) {
  const { horizonte, setHorizonte, measure } = usePresentation();
  const [mensual, setMensual] = useState<Mensual[]>([]);
  const [anual, setAnual] = useState<Anual[]>([]);
  const [zona, setZona] = useState("");
  const [escenario, setEscenario] = useState("BASE");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.dataset(token ?? undefined, "projection_monthly", { limit: 2000 }),
      api.dataset(token ?? undefined, "projection_annual", { limit: 400 }),
    ])
      .then(([serieMensual, serieAnual]) => {
        if (cancelled) return;
        setMensual(serieMensual.items.map((row) => row.payload as unknown as Mensual));
        setAnual(serieAnual.items.map((row) => ({ ...(row.payload as unknown as Anual), anio: Number((row.payload as Anual).anio) })));
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar la proyección.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const zonas = useMemo(() => Array.from(new Set(mensual.map((row) => row.zona_regional ?? "").filter(Boolean))).sort(), [mensual]);
  const escenarios = useMemo(() => Array.from(new Set([...mensual.map((row) => row.escenario ?? "BASE"), ...anual.map((row) => row.escenario ?? "BASE")])).sort(), [anual, mensual]);

  const filtrada = useMemo(() => {
    const coincide = (row: { zona_regional?: string; escenario?: string }) =>
      (!zona || row.zona_regional === zona) && (!escenario || (row.escenario ?? "BASE") === escenario);
    return {
      mensual: mensual.filter(coincide),
      anual: anual.filter(coincide),
    };
  }, [anual, escenario, mensual, zona]);

  const recorte = useMemo(() => recortarProyeccion(filtrada.mensual, filtrada.anual, horizonte), [filtrada, horizonte]);
  const anuales = recorte.anual.slice(-6);

  if (error) return <div className="empty-state">{error}</div>;
  if (loading) return <div className="empty-state">Cargando proyección…</div>;

  return (
    <section className="data-module">
      <header className="module-heading">
        <h2>Proyección de consumo (compra de energía)</h2>
        <p>
          Consumo real y proyección del escenario base{" "}
          {horizonte ? `a ${horizonte} meses` : "de todo el horizonte calculado (36 meses)"}.
          {recorte.fuera.length ? ` Los años ${recorte.fuera.join(", ")} quedan fuera del horizonte mostrado.` : ""}
        </p>
      </header>

      <div className="data-toolbar">
        {showZoneFilter && (
          <select className="filter-select" value={zona} onChange={(event) => setZona(event.target.value)} aria-label="Zona regional">
            <option value="">Zona regional: total</option>
            {zonas.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
        <select className="filter-select" value={escenario} onChange={(event) => setEscenario(event.target.value)} aria-label="Escenario">
          {escenarios.map((option) => (
            <option key={option} value={option}>
              Escenario: {option}
            </option>
          ))}
        </select>
        <div className="segmented-control" role="radiogroup" aria-label="Horizonte de proyección">
          <span className="segmented-label">Horizonte</span>
          {HORIZONTES_PROY.map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={horizonte === option.value}
              className={horizonte === option.value ? "segmented-option segmented-active" : "segmented-option"}
              onClick={() => setHorizonte(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {anuales.length > 0 && (
        <div className="year-grid" style={{ ["--cols" as string]: String(anuales.length) }}>
          {anuales.map((row) => {
            const proyectado = (row.meses_proyectados ?? 0) > 0;
            const tipo = proyectado ? ((row.meses_reales ?? 0) > 0 ? "real + proyección" : "proyectado") : "real";
            return (
              <div key={row.anio} className={proyectado ? "year-cell year-projected" : "year-cell"}>
                <b>{row.anio}</b>
                <span>{fmtN(row.total_gwh ?? 0, 1)} GWh</span>
                <small>{tipo}</small>
              </div>
            );
          })}
        </div>
      )}

      <SerieChart mensual={recorte.mensual} measure={measure} />
    </section>
  );
}
