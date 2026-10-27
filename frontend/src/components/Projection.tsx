import { useEffect, useMemo, useState } from "react";
import type { Data, Layout } from "plotly.js-dist-min";
import { useAuthOptional } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { csvCelda, fmtN, mesLargo } from "../lib/format";
import { ZONAS_REGIONALES } from "../lib/negocio";
import { HORIZONTES_PROY, usePresentation } from "../app/Presentation";
import { PlotlyChart } from "../charts/Plotly";
import { AZUL, C, NARANJA } from "../charts/paleta";
import { Pie, md, useEsMovil } from "../charts/textos";
import { Aviso, Etiqueta, Kpis, TablaSimple, Tarjeta, TituloPagina, type ItemKpi } from "./v2/ui";

/**
 * Sección "Proyección de consumo (compra de energía)" del Streamlit: la serie real consolidada por zona regional
 * con su proyección y bandas, la tabla por año con la confiabilidad medida en el backtest, el resumen de todas
 * las zonas y las descargas. El rol Administrador del modelo ve además el detalle técnico del modelo elegido.
 */

export type Mensual = {
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
  modelo?: string;
};

export type Anual = {
  anio: number;
  anio_horizonte?: number | null;
  confiabilidad?: string | null;
  error_backtest_pct?: number | null;
  escenario?: string;
  inf80_gwh?: number | null;
  sup80_gwh?: number | null;
  inf95_gwh?: number | null;
  sup95_gwh?: number | null;
  meses_proyectados?: number;
  meses_reales?: number;
  modelo?: string;
  proyeccion_gwh?: number | null;
  real_gwh?: number | null;
  total_gwh: number | null;
  zona_regional?: string;
};

/** error_backtest_por_zona.csv: el error medido por zona y lo que hay detrás del modelo elegido. */
export type Backtest = {
  zona_regional: string;
  modelo_elegido?: string | null;
  wape_anio1_pct?: number | null;
  wape_anio2_pct?: number | null;
  wape_base_anio1_pct?: number | null;
  supera_linea_base?: boolean | null;
  sesgo_anio1_pct?: number | null;
  cobertura_banda80_pct?: number | null;
  factor_calibracion_banda?: number | null;
  ljung_box_p?: number | null;
  modelo_alternativo?: string | null;
  tipo_alternativo?: string | null;
  wape_alternativo_anio1_pct?: number | null;
  wape_alternativo_anio2_pct?: number | null;
  residuos_sin_estructura?: boolean | null;
  puntos_anio1?: number | null;
  puntos_anio2?: number | null;
  umbral_confiable_pct?: number | null;
  ultimo_mes_real?: string | null;
  meses_proyectados?: number | null;
};

export type Recorte = {
  mensual: Mensual[];
  anual: Anual[];
  /** Último mes real de la serie (mes_largo() de la bajada de la gráfica). */
  ult: string | null;
  fin: Date | null;
  fuera: number[];
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** recortar_proyeccion(): un año anual solo se muestra completo si el horizonte llega a diciembre. */
export function recortarProyeccion(mensual: Mensual[], anual: Anual[], meses: number | null): Recorte {
  const reales = mensual.filter((row) => row.tipo === "REAL").map((row) => row.periodo).sort();
  const ult = reales.length ? reales[reales.length - 1].slice(0, 7) : null;
  if (meses === null || !reales.length) return { mensual, anual, ult, fin: null, fuera: [] };
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
  return { mensual: mensualRecortada, anual: anual.filter((row) => !fuera.has(row.anio)), ult, fin, fuera: [...fuera].sort() };
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
  return <PlotlyChart data={serie.data} layout={serie.layout} ariaLabel="Consumo mes a mes y proyección (GWh)" />;
}

/** Umbral del backtest para marcar CONFIABLE (mismo valor por defecto que proyeccion_anual_consumo.py --umbral). */
const UMBRAL_CONFIABLE_PCT = 5;

const COLUMNAS_ANUAL = [
  "Año",
  "Meses reales",
  "Meses proyectados",
  "Consumo real (GWh)",
  "Proyección (GWh)",
  "Total del año (GWh)",
  "Banda 80 % (GWh)",
  "Banda 95 % (GWh)",
  "Confiabilidad",
  "Error del backtest",
];

const TONO_CONF: Record<string, "bien" | "aviso" | "neutro"> = {
  CONFIABLE: "bien",
  ORIENTATIVO: "aviso",
  "NO VERIFICABLE": "neutro",
};

/** Renombres de la tabla técnica (ren del Streamlit). */
const REN_TECNICA: Array<[string, string]> = [
  ["zona_regional", "Zona"],
  ["modelo_elegido", "Modelo"],
  ["wape_anio1_pct", "Error 1 año (%)"],
  ["wape_anio2_pct", "Error 2 años (%)"],
  ["wape_base_anio1_pct", "Línea base 1 año (%)"],
  ["sesgo_anio1_pct", "Sesgo 1 año (%)"],
  ["cobertura_banda80_pct", "Cobertura banda 80 % (%)"],
  ["factor_calibracion_banda", "Factor de ensanche de banda"],
  ["ljung_box_p", "Ljung-Box p"],
  ["modelo_alternativo", "Modelo alternativo"],
  ["tipo_alternativo", "Tipo"],
  ["wape_alternativo_anio1_pct", "Alternativo: error 1 año (%)"],
  ["wape_alternativo_anio2_pct", "Alternativo: error 2 años (%)"],
  ["puntos_anio1", "Puntos 1 año"],
  ["puntos_anio2", "Puntos 2 años"],
];

/** Columnas de conteo que no llevan decimales en las tablas técnicas. */
const COLUMNAS_ENTERAS = ["Año", "Meses reales", "Meses proyectados", "Puntos 1 año", "Puntos 2 años"];

const PIE_GRAFICA =
  "Azul: consumo real consolidado. Naranja punteado: proyección del modelo; sombreado: bandas del 80 % y 95 %. "
  + "Los meses rurales pendientes de lectura no se incluyen como reales.";

const AYUDA_HORIZONTE =
  "El modelo calcula 36 meses; por pedido de negocio se presenta un año, que es el horizonte probado contra el pasado "
  + "(backtest). Los meses y años que no se muestran siguen en los archivos descargables y no cambian.";

const PIE_SELECCION =
  "El escenario base es el que menos se equivocó al probarlo contra los últimos dos años; el otro responde la hipótesis contraria. "
  + "Cuál usar es una decisión de planeación: para no comprar de menos, lo usual es tomar el mayor de los dos como techo.";

const PIE_ANUAL =
  "La banda anual suma las bandas mensuales, por eso es conservadora (más ancha que la del año como un todo). "
  + "El año en curso combina meses reales y proyectados.";

const SIN_PROYECCION =
  "Todavía no existe la proyección. Desde la carpeta del código corre:  python proyeccion_anual_consumo.py  "
  + "(tarda unos minutos; usa la serie consolidada de todos los clientes). Después recarga esta página.";

/** La etiqueta de confiabilidad se recalcula con el error de este escenario (regla del Streamlit). */
function confiabilidadDe(fila: Anual): string {
  const etiqueta = String(fila.confiabilidad ?? "");
  const error = Number(fila.error_backtest_pct);
  if ((etiqueta === "CONFIABLE" || etiqueta === "ORIENTATIVO") && Number.isFinite(error)) {
    return error <= UMBRAL_CONFIABLE_PCT ? "CONFIABLE" : "ORIENTATIVO";
  }
  return etiqueta;
}

function gwh(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor) || valor === 0) return "";
  return fmtN(valor, 1);
}

/** Formato de las tablas cortas con tabla(): números con los decimales del redondeo, texto tal cual. */
function fmtTabla(decimales: number) {
  return (valor: unknown, columna?: string): string => {
    if (valor === null || valor === undefined) return "—";
    if (typeof valor !== "number") return String(valor);
    if (columna && COLUMNAS_ENTERAS.includes(columna)) return fmtN(valor);
    return fmtN(valor, decimales);
  };
}

export function Proyeccion({ token }: { token?: string | null }) {
  const { horizonte, setHorizonte } = usePresentation();
  const auth = useAuthOptional();
  const tecnico = auth?.currentUser?.role === "ADMIN_MODELO";

  const [mensual, setMensual] = useState<Mensual[]>([]);
  const [anual, setAnual] = useState<Anual[]>([]);
  const [backtest, setBacktest] = useState<Backtest[]>([]);
  const [zonaElegida, setZonaElegida] = useState("");
  const [escenario, setEscenario] = useState("BASE");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    const cargar = async (): Promise<void> => {
      try {
        const [serieMensual, serieAnual, serieError] = await Promise.all([
          api.dataset(token ?? undefined, "projection_monthly", { limit: 2000 }),
          api.dataset(token ?? undefined, "projection_annual", { limit: 400 }),
          api.dataset(token ?? undefined, "projection_backtest", { limit: 50 }),
        ]);
        if (cancelado) return;
        setMensual(serieMensual.items.map((fila) => fila.payload as unknown as Mensual));
        setAnual(serieAnual.items.map((fila) => ({ ...(fila.payload as unknown as Anual), anio: Number(fila.payload.anio) })));
        setBacktest(serieError.items.map((fila) => fila.payload as unknown as Backtest));
        setError(null);
      } catch (cause: unknown) {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar la proyección.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [token, tecnico]);

  // zonas del archivo: primero los totales, luego las regionales en orden de glosario y el resto alfabético.
  const zonas = useMemo(() => {
    const distintas = Array.from(new Set(anual.map((fila) => fila.zona_regional ?? "").filter(Boolean)));
    const totales = distintas.filter((zona) => zona.startsWith("TOTAL"));
    const regionales = ZONAS_REGIONALES.filter((zona) => distintas.includes(zona));
    const resto = distintas.filter((zona) => !zona.startsWith("TOTAL") && !ZONAS_REGIONALES.includes(zona)).sort();
    return [...totales, ...regionales, ...resto];
  }, [anual]);

  const zona = zonaElegida && zonas.includes(zonaElegida) ? zonaElegida : zonas[0] ?? "";
  const errorZona = backtest.find((fila) => fila.zona_regional === zona) ?? backtest[0];
  // El umbral que se muestra en el aviso es el de la primera fila del archivo (.iloc[0] del Streamlit).
  const umbral = Number(backtest[0]?.umbral_confiable_pct ?? UMBRAL_CONFIABLE_PCT);
  const ultimoReal = backtest[0]?.ultimo_mes_real ?? "";
  const hayTendencia = mensual.some((fila) => fila.zona_regional === zona && (fila.escenario ?? "BASE") === "ALTERNATIVO");
  const escenarioActivo = hayTendencia ? escenario : "BASE";

  const filtrada = useMemo(() => {
    const coincide = (fila: { zona_regional?: string; escenario?: string }) =>
      (fila.zona_regional ?? "") === zona && (fila.escenario ?? "BASE") === escenarioActivo;
    return { mensual: mensual.filter(coincide), anual: anual.filter(coincide) };
  }, [anual, escenarioActivo, mensual, zona]);

  const recorte = useMemo(() => recortarProyeccion(filtrada.mensual, filtrada.anual, horizonte), [filtrada, horizonte]);

  if (error) return <div className="empty-state">{error}</div>;

  const sinProyeccion = !cargando && (mensual.length === 0 || anual.length === 0 || backtest.length === 0);
  if (sinProyeccion) {
    return (
      <div className="stack">
        <TituloPagina titulo="Proyección de consumo por zona para la compra de energía" />
        <Aviso texto={SIN_PROYECCION} tipo="alerta" />
      </div>
    );
  }

  if (cargando || !zona || !errorZona) {
    return (
      <div className="stack">
        <TituloPagina titulo="Proyección de consumo por zona para la compra de energía" />
        <div className="empty-state">Cargando la proyección…</div>
      </div>
    );
  }

  const caption = tecnico
    ? `Consumo mensual **real** de todos los clientes (sin alumbrado ni ciclos internos) hasta **${ultimoReal}**, agregado por zona `
      + "regional, y su **proyección** con un modelo clásico de series de tiempo (Holt-Winters o SARIMA, el que menos error tuvo "
      + "en el backtest de cada zona). Las bandas muestran dónde cae el 80 % y el 95 % de los escenarios del modelo."
    : `Consumo mensual **real** de todos los clientes hasta **${ultimoReal}**, por zona regional y total, y su **proyección** `
      + "(por defecto a un año, que es el horizonte verificado). "
      + "Las bandas muestran el rango en el que se espera que caiga el consumo (80 % y 95 % de probabilidad).";

  // Etiquetas de los escenarios: lenguaje llano para todo el mundo (sin las siglas del modelo estadístico).
  const tipoAlt = String(errorZona.tipo_alternativo ?? "alternativo");
  const altEsCrecimiento = tipoAlt === "con tendencia";
  const nombreBase = altEsCrecimiento ? "Escenario estable (el consumo sigue como en los últimos dos años)" : "Escenario de crecimiento (continúa la tendencia)";
  const nombreAlt = altEsCrecimiento ? "Escenario de crecimiento (continúa la tendencia de los primeros años)" : "Escenario estable (el consumo se estanca)";
  const errorAlt = `error 1 año ${fmtN(errorZona.wape_alternativo_anio1_pct, 1)} %, 2 años ${fmtN(errorZona.wape_alternativo_anio2_pct, 1)} %`;
  const etiquetasEscenario: Record<string, string> = {
    BASE: `${nombreBase} — el que mejor acertó el pasado`,
    ALTERNATIVO: `${nombreAlt} — ${errorAlt}`,
  };

  const kpis: Array<ItemKpi | undefined> = tecnico
    ? [
        {
          titulo: "Error del backtest a 1 año",
          valor: fmtN(errorZona.wape_anio1_pct, 1),
          unidad: " %",
          nota: `${fmtN(errorZona.puntos_anio1)} puntos`,
        },
        {
          titulo: "Error del backtest a 2 años",
          valor: fmtN(errorZona.wape_anio2_pct, 1),
          unidad: " %",
          nota: `${fmtN(errorZona.puntos_anio2)} puntos`,
        },
      ]
    : [
        {
          titulo: "Margen de error medido a un año",
          valor: fmtN(errorZona.wape_anio1_pct, 1),
          unidad: " %",
          tono: "marca",
          nota: "Lo que la proyección se equivocó al probarla contra el pasado",
        },
        { titulo: "Margen de error medido a dos años", valor: fmtN(errorZona.wape_anio2_pct, 1), unidad: " %" },
      ];

  // Verificación técnica (solo administrador): sesgo, cobertura de la banda y Ljung-Box.
  let verificacion: string | null = null;
  if (tecnico && errorZona.cobertura_banda80_pct !== null && errorZona.cobertura_banda80_pct !== undefined) {
    const factor = Number(errorZona.factor_calibracion_banda);
    const ljung = Number(errorZona.ljung_box_p);
    const conFactor = Number.isFinite(factor) && factor > 1 ? `; por eso se ensanchó ×${fmtN(factor, 2)}` : "";
    const conLjung = Number.isFinite(ljung) ? fmtN(ljung, 2) : "—";
    const residuos = Number.isFinite(ljung) && ljung > 0.05 ? "sí ✓" : "no ⚠";
    verificacion =
      `Verificación: sesgo a 1 año ${fmtN(errorZona.sesgo_anio1_pct, 1)} % (cerca de 0 = no sobre ni subestima) · `
      + `la banda del 80 % cubrió el ${fmtN(errorZona.cobertura_banda80_pct, 0)} % de los meses reales en el backtest (ideal ≈ 80 %${conFactor}) · `
      + `residuos sin estructura (Ljung-Box p = ${conLjung}): ${residuos}`
      + (errorZona.supera_linea_base === false ? " · ⚠ el modelo no supera la línea base estacional en esta zona" : "");
  }

  // Tabla anual de la zona y escenario elegidos (los años cuya proyección cabe en el horizonte mostrado).
  const filasAnuales = [...recorte.anual].sort((a, b) => a.anio - b.anio);
  const filasTablaAnual = filasAnuales.map((fila) => ({
    "Año": fila.anio,
    "Meses reales": fila.meses_reales ?? 0,
    "Meses proyectados": fila.meses_proyectados ?? 0,
    "Consumo real (GWh)": gwh(fila.real_gwh),
    "Proyección (GWh)": gwh(fila.proyeccion_gwh),
    "Total del año (GWh)": gwh(fila.total_gwh),
    "Banda 80 % (GWh)": (fila.meses_proyectados ?? 0) === 0 ? "" : `${fmtN(fila.inf80_gwh, 1)} – ${fmtN(fila.sup80_gwh, 1)}`,
    "Banda 95 % (GWh)": (fila.meses_proyectados ?? 0) === 0 ? "" : `${fmtN(fila.inf95_gwh, 1)} – ${fmtN(fila.sup95_gwh, 1)}`,
    "Confiabilidad": confiabilidadDe(fila),
    "Error del backtest": Number.isFinite(Number(fila.error_backtest_pct)) ? `${fmtN(fila.error_backtest_pct, 1)} %` : "",
  }));

  const confiables = filasAnuales.filter((fila) => confiabilidadDe(fila) === "CONFIABLE").map((fila) => fila.anio);
  const orientativos = filasAnuales.filter((fila) => confiabilidadDe(fila) === "ORIENTATIVO").map((fila) => fila.anio);
  const noVerificables = filasAnuales.filter((fila) => confiabilidadDe(fila) === "NO VERIFICABLE").map((fila) => fila.anio);

  let mensajeUso = `Para **${zona}** se pueden usar para la compra de energía: **${confiables.length ? confiables.join(", ") : "ningún año con el umbral actual"}**.`;
  if (orientativos.length) mensajeUso += ` Orientativos (error mayor al umbral): ${orientativos.join(", ")}.`;
  if (noVerificables.length) mensajeUso += ` No verificables con la historia disponible: ${noVerificables.join(", ")}.`;

  let pieAnual = PIE_ANUAL;
  if (recorte.fuera.length) {
    pieAnual += ` Los años ${recorte.fuera.join(", ")} no se muestran porque su proyección va más allá del horizonte elegido `
      + "(elige *Todo lo calculado* para verlos; son extrapolación del modelo, no horizonte verificado).";
  }

  const avisoLimite =
    `**Cuántos años se pueden usar.** Un año se marca **CONFIABLE** cuando el error del modelo en el backtest (lo que se equivocó `
    + `pronosticando el pasado a ese horizonte) ≤ ${fmtN(umbral, 0)} %; **ORIENTATIVO** si fue mayor; **NO VERIFICABLE** cuando la historia `
    + "disponible (52 meses) no alcanza para probar ese horizonte, así que es extrapolación de tendencia y estacionalidad. "
    + "Para comprar energía conviene usar los años CONFIABLES con su banda del 80 %, y tratar los demás como referencia.";

  // Por qué la proyección sube o baja: se explica con los años reales completos de la misma tabla.
  const realesCompletos = filasAnuales.filter((fila) => (fila.meses_proyectados ?? 0) === 0 && (fila.meses_reales ?? 0) === 12);
  const proyectados = filasAnuales.filter((fila) => (fila.meses_proyectados ?? 0) > 0);
  let avisoTendencia: string | null = null;
  if (realesCompletos.length >= 2 && proyectados.length >= 1) {
    const ultimoRealAnio = realesCompletos[realesCompletos.length - 1];
    const anteriorAnio = realesCompletos[realesCompletos.length - 2];
    const ultimoProyectado = proyectados[proyectados.length - 1];
    const cambioReal = anteriorAnio.total_gwh ? ((ultimoRealAnio.total_gwh ?? 0) / anteriorAnio.total_gwh - 1) * 100 : Number.NaN;
    const cambioProy = ultimoRealAnio.total_gwh ? ((ultimoProyectado.total_gwh ?? 0) / ultimoRealAnio.total_gwh - 1) * 100 : Number.NaN;
    const modelo = String(ultimoProyectado.modelo ?? "");
    const sinTendencia = modelo.startsWith("ETS(") && modelo.includes(",N,");
    avisoTendencia =
      `**Cómo leer la tendencia.** El último año real completo (${ultimoRealAnio.anio}) cerró en ${fmtN(ultimoRealAnio.total_gwh, 1)} GWh, `
      + `${cambioReal >= 0 ? "+" : ""}${fmtN(cambioReal, 1)} % frente a ${anteriorAnio.anio} (${fmtN(anteriorAnio.total_gwh, 1)} GWh). `
      + `La proyección de ${ultimoProyectado.anio} queda ${cambioProy >= 0 ? "+" : ""}${fmtN(cambioProy, 1)} % frente a ${ultimoRealAnio.anio}.`;
    if (sinTendencia) {
      avisoTendencia +=
        " El modelo de este escenario no tiene tendencia: repite el nivel reciente con la forma del año (meses altos y bajos), "
        + "por eso los años proyectados salen casi iguales entre sí. Se eligió porque fue el que menos se equivocó al probarlo "
        + "contra los años ya conocidos; no afirma que el consumo no vaya a crecer, afirma que con esta historia no hay evidencia "
        + "suficiente de crecimiento. El rango posible es la banda, no la cifra central"
        + (hayTendencia ? ", y el otro escenario de arriba muestra qué pasaría si hubiera tendencia." : ".");
    }
  }

  // Resumen de todas las zonas por año (con los años fuera del horizonte ya quitados).
  const anualTodas = recorte.fuera.length ? anual.filter((fila) => !recorte.fuera.includes(fila.anio)) : anual;
  const aniosConProyeccion = Array.from(new Set(anualTodas.filter((fila) => (fila.meses_proyectados ?? 0) > 0).map((fila) => fila.anio))).sort((a, b) => a - b);

  const armarPivote = (filas: Anual[]) => {
    const anios = Array.from(new Set(filas.map((fila) => fila.anio))).sort((a, b) => a - b);
    const columnas = ["zona_regional", ...anios.map(String)];
    const filasPivot = zonas
      .filter((z) => filas.some((fila) => fila.zona_regional === z))
      .map((z) => {
        const fila: Record<string, unknown> = { zona_regional: z };
        for (const anio of anios) {
          const combinadas = filas.filter((fila2) => fila2.zona_regional === z && fila2.anio === anio);
          fila[String(anio)] = combinadas.length
            ? Math.round(combinadas.reduce((suma, fila2) => suma + (fila2.total_gwh ?? 0), 0) * 10) / 10
            : null;
        }
        return fila;
      });
    return { columnas, filas: filasPivot };
  };
  const pivotBase = armarPivote(anualTodas.filter((fila) => (fila.escenario ?? "BASE") === "BASE"));
  const hayAlternativo = anualTodas.some((fila) => (fila.escenario ?? "BASE") === "ALTERNATIVO");
  const pivotAlternativo = hayAlternativo ? armarPivote(anualTodas.filter((fila) => (fila.escenario ?? "BASE") === "ALTERNATIVO")) : null;
  const fmtPivote = (valor: unknown): string => {
    if (valor === null || valor === undefined) return "";
    if (typeof valor !== "number") return String(valor);
    return fmtN(valor, 1);
  };

  const columnasError = ["Zona", "Margen de error 1 año (%)", "Margen de error 2 años (%)"];
  const filasError = backtest.map((fila) => ({
    Zona: fila.zona_regional,
    "Margen de error 1 año (%)": fila.wape_anio1_pct,
    "Margen de error 2 años (%)": fila.wape_anio2_pct,
  }));

  const clavesTecnicas = REN_TECNICA.filter(([clave]) => backtest.length > 0 && clave in backtest[0]);
  const columnasTecnicas = clavesTecnicas.map(([, etiqueta]) => etiqueta);
  const filasTecnicas = backtest.map((fila) => {
    const salida: Record<string, unknown> = {};
    for (const [clave, etiqueta] of clavesTecnicas) salida[etiqueta] = (fila as Record<string, unknown>)[clave] ?? null;
    return salida;
  });

  const bajadaGrafica = horizonte && recorte.ult
    ? `Proyección a ${horizonte} meses desde ${mesLargo(recorte.ult)} (hasta ${mesLargo(recorte.fin ? monthKey(recorte.fin) : "")})`
    : "Todo el horizonte calculado por el modelo";

  const celdasAnuales = filasAnuales.slice(-6).map((fila) => {
    const proyectado = (fila.meses_proyectados ?? 0) > 0;
    const tipo = proyectado ? ((fila.meses_reales ?? 0) > 0 ? "real + proyección" : "proyectado") : "real";
    const etiquetaBruta = String(fila.confiabilidad ?? "");
    const conEtiqueta = proyectado && etiquetaBruta && etiquetaBruta !== "nan" && etiquetaBruta !== "None";
    return {
      anio: fila.anio,
      total: fila.total_gwh,
      tipo,
      etiqueta: conEtiqueta ? etiquetaBruta.charAt(0).toUpperCase() + etiquetaBruta.slice(1).toLowerCase() : "",
      tono: TONO_CONF[etiquetaBruta] ?? "neutro",
    };
  });

  const csvDe = (filas: Array<Record<string, unknown>>): string => {
    if (!filas.length) return "";
    const columnas = Object.keys(filas[0]);
    return [columnas.join(";"), ...filas.map((fila) => columnas.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n");
  };
  const descargar = (nombre: string, contenido: string): void => {
    const url = URL.createObjectURL(new Blob(["\ufeff" + contenido], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <TituloPagina titulo="Proyección de consumo por zona para la compra de energía" />

      <p className="v2-caption">{md(caption)}</p>

      <Tarjeta>
        <div className="proy-sel">
          <label className="proy-campo">
            Zona
            <select className="filter-select" value={zona} onChange={(event) => setZonaElegida(event.target.value)} aria-label="Zona">
              {zonas.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </label>
          <div className="proy-campo">
            Horizonte que se muestra
            <div className="v2-radio" role="radiogroup" aria-label="Horizonte que se muestra" title={AYUDA_HORIZONTE}>
              {HORIZONTES_PROY.map((opcion) => (
                <button
                  key={opcion.label}
                  type="button"
                  role="radio"
                  aria-checked={horizonte === opcion.value}
                  className={horizonte === opcion.value ? "activo" : ""}
                  onClick={() => setHorizonte(opcion.value)}
                  title={AYUDA_HORIZONTE}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {hayTendencia ? (
          <>
            <div className="proy-campo" style={{ marginTop: 14 }}>
              Escenario
              <div className="v2-radio etiquetas" role="radiogroup" aria-label="Escenario">
                {["BASE", "ALTERNATIVO"].map((opcion) => (
                  <button
                    key={opcion}
                    type="button"
                    role="radio"
                    aria-checked={escenario === opcion}
                    className={escenario === opcion ? "activo" : ""}
                    onClick={() => setEscenario(opcion)}
                  >
                    {etiquetasEscenario[opcion]}
                  </button>
                ))}
              </div>
            </div>
            <p className="v2-pie" style={{ marginTop: 10 }}>{md(PIE_SELECCION)}</p>
          </>
        ) : null}
      </Tarjeta>

      <Kpis items={kpis} columnas={2} compacto />

      {verificacion ? <p className="v2-caption">{md(verificacion)}</p> : null}

      <Tarjeta titulo="Consumo mes a mes y proyección (GWh)" bajada={bajadaGrafica}>
        <SerieChart mensual={recorte.mensual} />
        <Pie texto={md(PIE_GRAFICA)} />
      </Tarjeta>

      <Tarjeta titulo="Consumo por año (GWh)">
        {celdasAnuales.length ? (
          <div className="year-grid" style={{ ["--cols" as string]: String(celdasAnuales.length) }}>
            {celdasAnuales.map((celda) => (
              <div key={celda.anio} className={celda.tipo === "real" ? "year-cell" : "year-cell year-projected"}>
                <b>{celda.anio}</b>
                <span>{fmtN(celda.total, 1)}</span>
                <small>{celda.tipo}</small>
                {celda.etiqueta ? (
                  <div style={{ marginTop: 4 }}>
                    <Etiqueta texto={celda.etiqueta} tono={celda.tono} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <TablaSimple columnas={COLUMNAS_ANUAL} filas={filasTablaAnual} alto={420} />

        <p>{md(mensajeUso)}</p>
        <p className="v2-caption">{md(pieAnual)}</p>
      </Tarjeta>

      <Aviso texto={avisoLimite} tipo="limite" />

      {avisoTendencia ? <Aviso texto={avisoTendencia} tipo="info" /> : null}

      <details className="v2-exp">
        <summary>Resumen de todas las zonas por año</summary>
        <div className="v2-exp-cuerpo">
          <TablaSimple columnas={pivotBase.columnas} filas={pivotBase.filas} formato={fmtPivote} alto={420} />
          <p className="v2-caption">
            {md(`GWh por año calendario (real + proyección, escenario base). Los años ${aniosConProyeccion.join(", ")} incluyen meses proyectados.`)}
          </p>

          {pivotAlternativo ? (
            <div className="proy-bloque-alt">
              <p>
                <b>Escenario alternativo (GWh por año)</b>
              </p>
              <TablaSimple columnas={pivotAlternativo.columnas} filas={pivotAlternativo.filas} formato={fmtPivote} alto={420} />
            </div>
          ) : null}

          {!tecnico ? <TablaSimple columnas={columnasError} filas={filasError} formato={fmtTabla(1)} alto={420} /> : null}

          {tecnico ? <TablaSimple columnas={columnasTecnicas} filas={filasTecnicas} formato={fmtTabla(2)} alto={420} /> : null}
        </div>
      </details>

      <div className="proy-descargas">
        <button type="button" className="ghost-button" onClick={() => descargar("proyeccion_mensual_por_zona.csv", csvDe(mensual as unknown as Array<Record<string, unknown>>))}>
          Descargar proyección mensual (CSV)
        </button>
        <button type="button" className="ghost-button" onClick={() => descargar("proyeccion_anual_por_zona.csv", csvDe(anual as unknown as Array<Record<string, unknown>>))}>
          Descargar proyección anual (CSV)
        </button>
      </div>
    </div>
  );
}
