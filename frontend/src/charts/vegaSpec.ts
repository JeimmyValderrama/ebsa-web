/**
 * Especificaciones Vega-Lite: réplica exacta de las gráficas de Altair del Streamlit.
 * Cada función devuelve el mismo JSON que alt.Chart(...).to_dict() + config (_mostrar),
 * de modo que la imagen en pantalla sea la misma que en st.vega_lite_chart.
 */
import { fmtN, mesCorto } from "../lib/format";
import { AZUL, C, NARANJA, RAMPA_MAPA } from "./paleta";

export type Spec = Record<string, unknown>;

export type Formato = (value: number) => string;

/** Estilo común de todos los gráficos (_CONFIG_GRAFICO de componentes_v2.py). */
export const CONFIG_GRAFICO = {
  font: "Source Sans 3",
  background: "transparent",
  autosize: { type: "fit-x", contains: "padding" },
  view: { stroke: null },
  axis: {
    labelFont: "Source Sans 3", titleFont: "Source Sans 3", labelFontSize: 13, titleFontSize: 13,
    labelColor: C.tinta, titleColor: C.tinta2, gridColor: C.linea2, domainColor: "#c5c8c0", tickColor: "#c5c8c0",
  },
  legend: { labelFont: "Source Sans 3", titleFont: "Source Sans 3", labelFontSize: 13, titleFontSize: 13, labelColor: C.tinta2 },
  text: { font: "Source Sans 3" },
};

/** Expresiones de eje en formato colombiano (_EXPR_MILES y _EXPR_DEC1). */
export const EXPR_MILES = "replace(format(datum.value, ',.0f'), regexp(',', 'g'), '.')";
export const EXPR_DEC1 = "replace(replace(replace(format(datum.value, ',.1f'), regexp(',', 'g'), '§'), '.', ','), regexp('§', 'g'), '.')";

/** Espacio para las etiquetas del eje, por número de letras (_extension). */
export function extension(categorias: unknown[], limite: number): number {
  const largo = Math.max(4, ...categorias.map((categoria) => String(categoria).length));
  return Math.min(limite, Math.floor(largo * 7.6)) + 14;
}

/** El gráfico se ajusta al ancho del contenedor y el resto lo pone el config (_mostrar). */
function conAjuste(spec: Spec): Spec {
  return { autosize: { type: "fit", contains: "padding" }, ...spec, config: CONFIG_GRAFICO };
}

export interface OpcionesBarras {
  formato?: Formato;
  color?: string;
  nombreValor?: string;
  nombreCategoria?: string;
  altoFila?: number;
  maxEtiqueta?: number;
  textos?: string[];
  movil?: boolean;
}

/** Barras horizontales con la cifra escrita al final de cada barra (ui.barras). */
export function barrasSpec(serie: Array<[string, number]>, opciones: OpcionesBarras = {}): Spec {
  const {
    formato = fmtN,
    color = C.seguimiento,
    nombreValor = "Valor",
    nombreCategoria = "",
    altoFila = 30,
    maxEtiqueta = 190,
    textos,
    movil = false,
  } = opciones;
  const datos = serie.map(([cat, val], index) => {
    const valor = Number(val) || 0;
    return { cat: String(cat), val: valor, txt: textos ? String(textos[index] ?? "") : formato(valor) };
  });
  const maximo = Math.max(0, ...datos.map((fila) => fila.val));
  const tope = maximo > 0 ? maximo : 1;
  const lim = movil ? 120 : maxEtiqueta;
  const largoTxt = Math.max(1, ...datos.map((fila) => fila.txt.length));
  const base = {
    data: { values: datos },
    encoding: {
      y: {
        field: "cat", type: "nominal", sort: null, title: null,
        axis: {
          labelLimit: lim,
          minExtent: extension(datos.map((fila) => fila.cat), lim),
          ticks: false, domain: false, labelPadding: 8,
        },
      },
      x: {
        field: "val", type: "quantitative", title: null, axis: null,
        scale: { domain: [0, tope * (1 + (movil ? 0.045 : 0.024) * (largoTxt + 2))] },
      },
      tooltip: [
        { field: "cat", type: "nominal", title: nombreCategoria || "Categoría" },
        { field: "txt", type: "nominal", title: nombreValor },
      ],
    },
  };
  return conAjuste({
    layer: [
      { ...base, mark: { type: "bar", color, cornerRadiusEnd: 3, height: Math.max(altoFila - 12, 10) } },
      {
        ...base,
        mark: { type: "text", align: "left", dx: 6, fontWeight: 600, fontSize: 13, color: C.tinta },
        encoding: { ...base.encoding, text: { field: "txt", type: "nominal" } },
      },
    ],
    height: { step: altoFila },
  });
}

export interface OpcionesApiladas {
  formato?: Formato;
  nombreCategoria?: string;
  nombreSerie?: string;
  altoFila?: number;
  movil?: boolean;
}

/**
 * Barras horizontales apiladas con el total al final (ui.barras_apiladas).
 * filas: [{cat, valores: {serie: número}}]; series en el orden en que se apilan.
 */
export function barrasApiladasSpec(
  filas: Array<{ cat: string; valores: Record<string, number> }>,
  series: string[],
  colores: Record<string, string>,
  opciones: OpcionesApiladas = {},
): Spec {
  const { formato = fmtN, nombreCategoria = "", nombreSerie = "", altoFila = 30, movil = false } = opciones;
  const orden = new Map(series.map((serie, index) => [serie, index]));
  const largo: Array<{ cat: string; serie: string; val: number; orden: number; txt: string }> = [];
  const totales = new Map<string, number>();
  for (const fila of filas) {
    for (const serie of series) {
      const val = Number(fila.valores[serie]) || 0;
      largo.push({ cat: String(fila.cat), serie, val, orden: orden.get(serie) ?? 0, txt: formato(val) });
      totales.set(String(fila.cat), (totales.get(String(fila.cat)) ?? 0) + val);
    }
  }
  const cats = filas.map((fila) => String(fila.cat));
  const tot = [...totales.entries()].map(([cat, val]) => ({ cat, val, txt: formato(val) }));
  const maximo = Math.max(0, ...tot.map((fila) => fila.val));
  const tope = maximo > 0 ? maximo : 1;
  const lim = movil ? 110 : 180;
  const ejeY = {
    field: "cat", type: "nominal", sort: cats, title: null,
    axis: { labelLimit: lim, minExtent: extension(cats, lim), ticks: false, domain: false, labelPadding: 8 },
  };
  const escalaX = { domain: [0, tope * (movil ? 1.28 : 1.14)] };
  return conAjuste({
    layer: [
      {
        data: { values: largo },
        mark: { type: "bar", height: Math.max(altoFila - 12, 10), stroke: "#fff", strokeWidth: 1 },
        encoding: {
          y: ejeY,
          x: { field: "val", type: "quantitative", title: null, axis: null, scale: escalaX, stack: "zero" },
          color: {
            field: "serie", type: "nominal",
            scale: { domain: series, range: series.map((serie) => colores[serie] ?? C.mudo) },
            legend: null,
          },
          order: { field: "orden", type: "quantitative" },
          tooltip: [
            { field: "cat", type: "nominal", title: nombreCategoria || "Categoría" },
            { field: "serie", type: "nominal", title: nombreSerie || "Serie" },
            { field: "txt", type: "nominal", title: "Valor" },
          ],
        },
      },
      {
        data: { values: tot },
        mark: { type: "text", align: "left", dx: 6, fontWeight: 600, fontSize: 13, color: C.tinta },
        encoding: { y: ejeY, x: { field: "val", type: "quantitative", scale: escalaX }, text: { field: "txt", type: "nominal" } },
      },
    ],
    height: { step: altoFila },
  });
}

export interface OpcionesColumnas {
  formato?: Formato;
  color?: string;
  nombreValor?: string;
  alto?: number;
  ejeExpr?: string;
}

/** Columnas verticales para una serie en el tiempo (ui.columnas_tiempo). */
export function columnasTiempoSpec(serie: Array<[string, number]>, opciones: OpcionesColumnas = {}): Spec {
  const { formato = fmtN, color = C.seguimiento, nombreValor = "Valor", alto = 240, ejeExpr = EXPR_MILES } = opciones;
  const datos = serie.map(([cat, val]) => {
    const valor = Number(val);
    return { cat: String(cat), val: Number.isFinite(valor) ? valor : null, txt: Number.isFinite(valor) ? formato(valor) : "—" };
  });
  return conAjuste({
    data: { values: datos },
    mark: { type: "bar", color, cornerRadiusEnd: 3 },
    encoding: {
      x: { field: "cat", type: "nominal", sort: null, title: null, axis: { labelAngle: 0, ticks: false } },
      y: { field: "val", type: "quantitative", title: null, axis: { labelExpr: ejeExpr, tickCount: 5, minExtent: 46 } },
      tooltip: [
        { field: "cat", type: "nominal", title: "Periodo" },
        { field: "txt", type: "nominal", title: nombreValor },
      ],
    },
    height: alto,
  });
}

// ---------------------------------------------------------------------------
// Mapa con límites municipales (_mapa_limites de app_ebsa_v2.py)
// ---------------------------------------------------------------------------

export type Feature = { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } };

export interface FilaMapa {
  codigo_municipio: string;
  etiqueta: string;
  nombre: string;
  zona_ebsa: string;
  valor: number;
  valor_texto: string;
  clientes_tc1: number;
  clientes_texto: string;
  color_zona: string;
  relleno: string;
  opacidad: number;
  lon_etiqueta?: number | null;
  lat_etiqueta?: number | null;
}

export interface OpcionesMapa {
  metNombre: string;
  enProporcion: boolean;
  altura: number;
  movil?: boolean;
}

/**
 * Mapa coroplético de Boyacá: territorio coloreado (y círculos por municipio cuando no es en proporción),
 * con los rótulos de los nueve municipios de mayor valor. Réplica de _mapa_limites.
 */
export function mapaLimitesSpec(
  geometrias: Feature[],
  dd: FilaMapa[],
  todos: FilaMapa[],
  opciones: OpcionesMapa,
): Spec {
  const { metNombre, enProporcion, altura, movil = false } = opciones;
  const campos = ["etiqueta", "zona_ebsa", "valor_texto", "clientes_texto", "relleno", "opacidad"];
  const informacion = [
    { field: "etiqueta", type: "nominal", title: "Municipio" },
    { field: "valor_texto", type: "nominal", title: metNombre },
    { field: "zona_ebsa", type: "nominal", title: "Zona (por ciclo de lectura)" },
    { field: "clientes_texto", type: "nominal", title: "Clientes" },
  ];
  const base = {
    transform: [
      {
        lookup: "properties.codigo_municipio",
        from: {
          data: { values: todos.map((fila) => ({ ...fila })) },
          key: "codigo_municipio",
          fields: campos,
        },
      },
    ],
  };
  const territorio = {
    ...base,
    data: { values: geometrias },
    mark: { type: "geoshape", stroke: "#ffffff", strokeWidth: 0.8 },
    encoding: {
      color: { field: "relleno", type: "nominal", scale: null, legend: null },
      opacity: { field: "opacidad", type: "quantitative", scale: null, legend: null },
      tooltip: informacion,
    },
  };
  const capas: Spec[] = [territorio];
  if (!enProporcion) {
    let circ = dd.filter((fila) => fila.valor > 0);
    if (circ.length === 0) circ = dd;
    capas.push({
      data: { values: circ },
      mark: { type: "circle", opacity: 0.82, stroke: "#ffffff", strokeWidth: 1.2 },
      encoding: {
        longitude: { field: "lon_etiqueta", type: "quantitative" },
        latitude: { field: "lat_etiqueta", type: "quantitative" },
        size: { field: "valor", type: "quantitative", scale: { range: [18, movil ? 1300 : 2600], zero: true }, legend: null },
        color: { field: "color_zona", type: "nominal", scale: null, legend: null },
        tooltip: informacion,
      },
    });
  }
  const porValor = [...dd].sort((a, b) => b.valor - a.valor).slice(0, movil ? 6 : 9).filter((fila) => fila.valor > 0);
  if (porValor.length) {
    const rotulos = porValor.map((fila) => ({ ...fila, nombre: fila.etiqueta.replace(/ \(.*\)$/, "") }));
    const texto = (color: string, halo?: string): Spec => ({
      data: { values: rotulos },
      mark: {
        type: "text", fontSize: 12.5, fontWeight: 600, color, dy: -11,
        ...(halo ? { stroke: halo, strokeWidth: 3, strokeOpacity: 0.9 } : {}),
      },
      encoding: {
        longitude: { field: "lon_etiqueta", type: "quantitative" },
        latitude: { field: "lat_etiqueta", type: "quantitative" },
        text: { field: "nombre", type: "nominal" },
      },
    });
    capas.push(texto("#fafaf8", "#fafaf8"));
    capas.push(texto(C.tinta));
  }
  return conAjuste({ layer: capas, projection: { type: "mercator" }, height: altura });
}

/** Interpola el color de la rampa para una cifra (el _rampa de _mapa_limites, calculado fuera del navegador). */
export function colorRampa(valor: number, tope: number): string {
  const t = Math.min(Math.max(valor / (tope || 1), 0), 1) * (RAMPA_MAPA.length - 1);
  const i = Math.min(Math.floor(t), RAMPA_MAPA.length - 2);
  const f = t - i;
  const c0 = RAMPA_MAPA[i].slice(1);
  const c1 = RAMPA_MAPA[i + 1].slice(1);
  const canal = (k: number): string => {
    const a = parseInt(c0.slice(k, k + 2), 16);
    const b = parseInt(c1.slice(k, k + 2), 16);
    return Math.round(a + (b - a) * f).toString(16).padStart(2, "0");
  };
  return "#" + canal(0) + canal(2) + canal(4);
}

// ---------------------------------------------------------------------------
// Consumo total real y proyección (tarjeta_proyeccion_total de app_ebsa_v2.py)
// ---------------------------------------------------------------------------

export interface FilaProyeccion {
  periodo: string;
  tipo: string;
  real_gwh: number | null;
  proyeccion_gwh: number | null;
  inf80_gwh: number | null;
  sup80_gwh: number | null;
}

/**
 * Serie mensual del consumo total: línea real azul, proyección naranja punteada y banda del 80 %,
 * con el mismo eje (años) y la misma escala que el gráfico de Altair del Streamlit.
 */
export function proyeccionTotalSpec(mensual: FilaProyeccion[], opciones: { movil?: boolean } = {}): Spec {
  const { movil = false } = opciones;
  const real = mensual
    .filter((fila) => fila.tipo === "REAL")
    .map((fila) => ({ periodo: fila.periodo, gwh: Number(fila.real_gwh ?? 0), serie: "Consumo real", inf80_gwh: null, sup80_gwh: null }));
  const proy = mensual
    .filter((fila) => fila.tipo === "PROYECCION")
    .map((fila) => ({
      periodo: fila.periodo,
      gwh: Number(fila.proyeccion_gwh ?? 0),
      serie: "Proyección",
      inf80_gwh: fila.inf80_gwh === null || fila.inf80_gwh === undefined ? null : Number(fila.inf80_gwh),
      sup80_gwh: fila.sup80_gwh === null || fila.sup80_gwh === undefined ? null : Number(fila.sup80_gwh),
    }));
  // La proyección se enlaza con el último mes real para que la línea no empiece suelta.
  const enlace = real.length && proy.length ? [{ ...real[real.length - 1], serie: "Proyección" }] : [];
  const conTexto = (filas: Array<{ periodo: string; gwh: number; serie: string; inf80_gwh: number | null; sup80_gwh: number | null }>) =>
    filas.map((fila) => ({ ...fila, texto: fmtN(fila.gwh, 1) + " GWh", mes: mesCorto(fila.periodo) }));
  const dd = conTexto([...real, ...enlace, ...proy]);
  const bandaDatos = conTexto(proy.filter((fila) => fila.inf80_gwh !== null && fila.sup80_gwh !== null));
  const numeros = [...dd.map((fila) => fila.gwh), ...bandaDatos.flatMap((fila) => [fila.inf80_gwh as number, fila.sup80_gwh as number])];
  const piso = Math.min(...numeros) * 0.97;
  const techo = Math.max(...numeros) * 1.02;
  const escalaY = { domain: [piso, techo], zero: false };
  const ejeX = { field: "periodo", type: "temporal", title: null, axis: { format: "%Y", tickCount: "year", grid: false } };
  const banda = {
    data: { values: bandaDatos },
    mark: { type: "area", color: NARANJA, opacity: 0.18 },
    encoding: {
      x: ejeX,
      y: {
        field: "inf80_gwh", type: "quantitative", scale: escalaY, title: "GWh por mes",
        axis: { labelExpr: EXPR_MILES, tickCount: 5, minExtent: 46 },
      },
      y2: { field: "sup80_gwh" },
    },
  };
  const lineas = {
    data: { values: dd },
    mark: { type: "line", strokeWidth: 2 },
    encoding: {
      x: ejeX,
      y: { field: "gwh", type: "quantitative", scale: escalaY },
      color: { field: "serie", type: "nominal", scale: { domain: ["Consumo real", "Proyección"], range: [AZUL, NARANJA] }, legend: null },
      strokeDash: { field: "serie", type: "nominal", scale: { domain: ["Consumo real", "Proyección"], range: [[1, 0], [5, 4]] }, legend: null },
      tooltip: [
        { field: "mes", type: "nominal", title: "Mes" },
        { field: "texto", type: "nominal", title: "Consumo" },
        { field: "serie", type: "nominal", title: "Dato" },
      ],
    },
  };
  return conAjuste({ layer: [banda, lineas], height: movil ? 200 : 230 });
}
