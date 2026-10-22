import { useEffect, useMemo, useState } from "react";
import type { Data, Layout } from "plotly.js-dist-min";
import { api } from "../lib/api";
import { fmtN } from "../lib/format";
import { usePresentation, HORIZONTES_PROY } from "../app/Presentation";
import { PlotlyChart } from "../charts/Plotly";
import { AZUL, C, NARANJA } from "../charts/paleta";
import { Pie, md, useEsMovil } from "../charts/textos";

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
  inf95_gwh?: number | null;
  sup95_gwh?: number | null;
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

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type Recorte = {
  mensual: Mensual[];
  anual: Anual[];
  fin: Date | null;
  fuera: number[];
};

/** recortar_proyeccion(): un año anual solo se muestra completo si el horizonte llega a diciembre. */
function recortarProyeccion(mensual: Mensual[], anual: Anual[], meses: number | null): Recorte {
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

/**
 * Serie mes a mes con Plotly: réplica del go.Figure del Streamlit —bandas del 80 % y 95 %,
 * línea real con marcadores, proyección punteada y promedio anual real (años completos).
 */
function SerieChart({ mensual }: { mensual: Mensual[] }) {
  const movil = useEsMovil();
  const serie = useMemo(() => {
    const ordenada = [...mensual].sort((a, b) => a.periodo.localeCompare(b.periodo));
    const real = ordenada.filter((row) => row.tipo === "REAL");
    const proy = ordenada.filter((row) => row.tipo === "PROYECCION");
    const enlace =
      real.length && proy.length
        ? [{ periodo: real[real.length - 1].periodo, gwh: real[real.length - 1].real_gwh }, ...proy.map((row) => ({ periodo: row.periodo, gwh: row.proyeccion_gwh }))]
        : proy.map((row) => ({ periodo: row.periodo, gwh: row.proyeccion_gwh }));
    const porAnio = new Map<number, number[]>();
    for (const row of real) {
      const anio = Number(row.periodo.slice(0, 4));
      const lista = porAnio.get(anio) ?? [];
      lista.push(Number(row.real_gwh ?? 0));
      porAnio.set(anio, lista);
    }
    const ultimoAnio = Math.max(0, ...porAnio.keys());
    const prom = [...porAnio.entries()]
      .filter(([anio]) => anio < ultimoAnio) // solo años completos
      .sort((a, b) => a[0] - b[0])
      .map(([anio, valores]) => ({ x: `${anio}-07-01`, y: valores.reduce((suma, valor) => suma + valor, 0) / valores.length }));
    const xProy = proy.map((row) => row.periodo);
    const data: Data[] = [
      { type: "scatter", x: xProy, y: proy.map((row) => row.sup95_gwh ?? null), line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { type: "scatter", x: xProy, y: proy.map((row) => row.inf95_gwh ?? null), fill: "tonexty", fillcolor: "rgba(235,104,52,0.12)", line: { width: 0 }, name: "Banda 95 %", hoverinfo: "skip" },
      { type: "scatter", x: xProy, y: proy.map((row) => row.sup80_gwh), line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { type: "scatter", x: xProy, y: proy.map((row) => row.inf80_gwh), fill: "tonexty", fillcolor: "rgba(235,104,52,0.25)", line: { width: 0 }, name: "Banda 80 %", hoverinfo: "skip" },
      {
        type: "scatter", x: real.map((row) => row.periodo), y: real.map((row) => row.real_gwh), mode: "lines+markers", name: "Real",
        line: { color: AZUL, width: 2.5 }, marker: { size: 5 }, hovertemplate: "%{x|%m/%Y}: %{y:,.1f} GWh<extra>Real</extra>",
      },
      {
        type: "scatter", x: enlace.map((row) => row.periodo), y: enlace.map((row) => row.gwh), mode: "lines+markers", name: "Proyección",
        line: { color: NARANJA, width: 2.5, dash: "dash" }, marker: { size: 5 }, hovertemplate: "%{x|%m/%Y}: %{y:,.1f} GWh<extra>Proyección</extra>",
      },
      {
        type: "scatter", x: prom.map((row) => row.x), y: prom.map((row) => row.y), mode: "lines+markers", name: "Promedio anual real",
        line: { color: C.azul_osc, width: 1.5 }, marker: { symbol: "diamond", size: 9 },
        hovertemplate: "%{x|%Y}: %{y:,.1f} GWh/mes promedio<extra>Promedio anual</extra>",
      },
    ];
    const layout: Partial<Layout> = {
      height: movil ? 340 : 420,
      margin: { l: 10, r: 10, t: 10, b: 10 },
      legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0 },
      separators: ",.",
      font: { family: "Source Sans 3, Segoe UI, Arial", size: 13, color: C.tinta },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      hovermode: "closest",
      xaxis: { gridcolor: C.linea2, linecolor: "#c5c8c0" },
      yaxis: { title: { text: "GWh / mes" }, gridcolor: C.linea2, zeroline: false },
    };
    return { data, layout, vacia: !real.length && !proy.length };
  }, [mensual, movil]);

  if (serie.vacia) return <div className="empty-state">No hay serie mensual para los filtros elegidos.</div>;

  return (
    <div className="chart-card">
      <PlotlyChart data={serie.data} layout={serie.layout} ariaLabel="Consumo mes a mes y proyección (GWh)" />
      <Pie
        texto={md(
          "Azul: consumo real consolidado. Naranja punteado: proyección del modelo; sombreado: bandas del 80 % y 95 %. Los meses rurales pendientes de lectura no se incluyen como reales.",
        )}
      />
    </div>
  );
}

export function ProjectionView({ token, showZoneFilter = true }: { token?: string | null; showZoneFilter?: boolean }) {
  const { horizonte, setHorizonte } = usePresentation();
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

  // Como en el Streamlit: la zona por defecto es el agregado que empieza con TOTAL
  // (sin esa fila, "todas las zonas" duplicaría cada año en las tarjetas).
  const zonas = useMemo(() => {
    const distintas = Array.from(new Set(mensual.map((row) => row.zona_regional ?? "").filter(Boolean)));
    const total = distintas.filter((zona) => zona.startsWith("TOTAL"));
    const resto = distintas.filter((zona) => !zona.startsWith("TOTAL")).sort();
    return [...total, ...resto];
  }, [mensual]);
  const zonaTotal = zonas.find((zona) => zona.startsWith("TOTAL")) ?? "";
  const escenarios = useMemo(() => Array.from(new Set([...mensual.map((row) => row.escenario ?? "BASE"), ...anual.map((row) => row.escenario ?? "BASE")])).sort(), [anual, mensual]);

  const filtrada = useMemo(() => {
    const zonaSel = zona || zonaTotal;
    const coincide = (row: { zona_regional?: string; escenario?: string }) =>
      (!zonaSel || row.zona_regional === zonaSel) && (!escenario || (row.escenario ?? "BASE") === escenario);
    return {
      mensual: mensual.filter(coincide),
      anual: anual.filter(coincide),
    };
  }, [anual, escenario, mensual, zona, zonaTotal]);

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
            <option value="">{zonaTotal ? `Zona regional: ${zonaTotal}` : "Zona regional: total"}</option>
            {zonas
              .filter((option) => !option.startsWith("TOTAL"))
              .map((option) => (
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

      <SerieChart mensual={recorte.mensual} />
    </section>
  );
}
