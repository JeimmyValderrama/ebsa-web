import { VegaLite } from "./VegaLite";
import { barrasApiladasSpec, barrasSpec, columnasTiempoSpec, type OpcionesApiladas, type OpcionesBarras, type OpcionesColumnas } from "./vegaSpec";

/**
 * Envolturas de las gráficas de Altair del Streamlit (ui.barras, ui.barras_apiladas y ui.columnas_tiempo).
 * Cada una dibuja el mismo Vega-Lite que st.vega_lite_chart en la aplicación original.
 */

export function Barras({ serie, opciones }: { serie: Array<[string, number]>; opciones?: OpcionesBarras }) {
  return <VegaLite spec={serie.length ? barrasSpec(serie, opciones) : null} />;
}

export function BarrasApiladas({
  filas,
  series,
  colores,
  opciones,
}: {
  filas: Array<{ cat: string; valores: Record<string, number> }>;
  series: string[];
  colores: Record<string, string>;
  opciones?: OpcionesApiladas;
}) {
  return <VegaLite spec={filas.length ? barrasApiladasSpec(filas, series, colores, opciones) : null} />;
}

export function ColumnasTiempo({ serie, opciones }: { serie: Array<[string, number]>; opciones?: OpcionesColumnas }) {
  return <VegaLite spec={serie.length ? columnasTiempoSpec(serie, opciones) : null} />;
}
