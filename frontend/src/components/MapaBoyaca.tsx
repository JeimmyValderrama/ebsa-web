import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { energia, fmtN, pesos, tituloPropio } from "../lib/format";
import { usePresentation } from "../app/Presentation";
import { VegaLite } from "../charts/VegaLite";
import { COLOR_ZONA_SIN_ZONA, GRIS_FUERA, RAMPA_MAPA, ZONA_MAPA_COLOR } from "../charts/paleta";
import { colorRampa, mapaLimitesSpec, type Feature, type FilaMapa } from "../charts/vegaSpec";
import { Leyenda, Pie, md, useEsMovil } from "../charts/textos";
import { Multiselect } from "./v2/filtros";

/**
 * Mapa de Boyacá por municipio: réplica exacta de dibujar_mapa() + _mapa_limites() del Streamlit.
 * En total: un círculo por municipio sobre su territorio (tamaño = la cifra, color = zona EBSA).
 * En proporción: el territorio de cada municipio se colorea con la rampa según la cifra por cliente.
 */

type FilaMunicipio = Record<string, unknown> & {
  municipio?: string | null;
  codigo_municipio?: string | null;
  provincia?: string | null;
  zona_ebsa?: string | null;
  clientes_tc1?: number | null;
  lat_centro?: number | null;
  lon_centro?: number | null;
};

/** Fila del mapa con el valor ya calculado (total o en proporción) y sus textos. */
type FilaCalculada = FilaMunicipio & {
  valor: number;
  valor_total: number;
  etiqueta: string;
  valor_texto: string;
  clientes_texto: string;
  color_zona: string;
  zona_ebsa: string;
  clientes_tc1: number;
};

/** Nombre de la métrica y unidad, en el orden de metricas_mapa_comercial() y METRICAS_MAPA_TECNICO. */
const METRICAS_CONSUMO: Array<[string, string, string]> = [
  ["caida_kwh_mes", "Consumo que se está perdiendo por caída de consumo (kWh/mes)", "kWh"],
  ["caida_clientes", "Clientes con caída de consumo para revisar", "clientes"],
  ["caida_criticos", "Clientes con caída grave reciente", "clientes"],
  ["fuga_alto_medio", "Clientes con probabilidad de fuga alta o media", "clientes"],
  ["fuga_consumo_alto_medio_kwh_mes", "Consumo de los clientes con probabilidad de fuga alta o media (kWh/mes)", "kWh"],
  ["clientes_tc1", "Clientes de EBSA en el municipio", "clientes"],
  ["caida_valor_mes", "Facturación que se está perdiendo por caída de consumo ($/mes)", "$"],
  ["fuga_perdida_esperada_mes", "Pérdida esperada por probabilidad de fuga ($/mes)", "$"],
];

const METRICAS_FACTURACION: Array<[string, string, string]> = [
  ["caida_valor_mes", "Facturación que se está perdiendo por caída de consumo ($/mes)", "$"],
  ["caida_clientes", "Clientes con caída de consumo para revisar", "clientes"],
  ["caida_criticos", "Clientes con caída grave reciente", "clientes"],
  ["fuga_alto_medio", "Clientes con probabilidad de fuga alta o media", "clientes"],
  ["fuga_perdida_esperada_mes", "Pérdida esperada por probabilidad de fuga ($/mes)", "$"],
  ["clientes_tc1", "Clientes de EBSA en el municipio", "clientes"],
  ["caida_kwh_mes", "Consumo que se está perdiendo por caída de consumo (kWh/mes)", "kWh"],
  ["fuga_consumo_alto_medio_kwh_mes", "Consumo de los clientes con probabilidad de fuga alta o media (kWh/mes)", "kWh"],
];

const METRICAS_TECNICO: Array<[string, string, string]> = [
  ["clientes_tc1", "Clientes (TC1)", "clientes"],
  ["clientes_en_serie", "Clientes en la serie de modelado", "clientes"],
  ["caida_clientes", "Caída: clientes en la lista", "clientes"],
  ["caida_pct_clientes", "Caída: % de los clientes del municipio en la lista", "%"],
  ["caida_criticos", "Caída: clientes CRÍTICA", "clientes"],
  ["caida_acelerando", "Caída: clientes con caída acelerando", "clientes"],
  ["caida_valor_mes", "Caída: valor en riesgo / mes", "$"],
  ["caida_kwh_mes", "Caída: kWh en riesgo / mes", "kWh"],
  ["fuga_alto_medio", "Fuga: clientes ALTO + MEDIO", "clientes"],
  ["fuga_alto", "Fuga: clientes ALTO", "clientes"],
  ["fuga_perdida_esperada_mes", "Fuga: pérdida esperada / mes", "$"],
  ["fuga_consumo_alto_medio_kwh_mes", "Fuga: consumo de los ALTO + MEDIO / mes", "kWh"],
];

/** Formato de una cifra del mapa según su unidad (_fmt_metrica). */
function fmtMetrica(valor: number, unidad: string): string {
  if (unidad === "$ por cliente") return pesos(valor) + " por cliente";
  if (unidad === "kWh por cliente") return fmtN(valor) + " kWh por cliente";
  if (unidad === "por cada 1.000 clientes") return fmtN(valor, 1) + " por cada 1.000 clientes";
  if (unidad === "kWh") return energia(valor);
  if (unidad === "$") return pesos(valor);
  if (unidad === "%") return fmtN(valor, 2) + " %";
  return fmtN(valor) + " " + unidad;
}

/** CSV en español como csv_es: separador ';' y coma decimal, con BOM para que abra con tildes. */
function csvEs(columnas: string[], filas: Array<Record<string, unknown>>): string {
  const escapar = (valor: unknown): string => {
    if (valor === null || valor === undefined) return "";
    const texto = typeof valor === "number" ? String(valor).replace(".", ",") : String(valor);
    return /[";\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };
  const lineas = [columnas.join(";"), ...filas.map((fila) => columnas.map((columna) => escapar(fila[columna])).join(";"))];
  return "\uFEFF" + lineas.join("\r\n");
}

/** Formato de celda de las tablas del mapa (formato_tabla: kWh con escala, $ con peso, resto número). */
function fmtCelda(valor: unknown, columna: string): string {
  const n = Number(valor ?? 0) || 0;
  const nombre = columna.toLowerCase();
  if (nombre.includes("kwh")) return energia(n);
  if (nombre.includes("$") || nombre.includes("factura") || nombre.includes("pérdida") || nombre.includes("perdida")) return pesos(n);
  return fmtN(n);
}

/** Lo que el mapa le entrega a la página para la tarjeta "Los diez municipios con más" (st.columns([3, 2])). */
export interface InfoMapa {
  filas: Array<{ municipio: string; valor: number; valor_total: number; valor_texto: string }>;
  enProporcion: boolean;
  metNombre: string;
  /** Columna de la métrica elegida (para formatear las celdas de las tablas). */
  metCol: string;
  unidad: string;
  municipios: number;
  /** Tabla "Por zona": agregado por zona EBSA de la cifra elegida. */
  tablaZona: { filas: Array<{ clave: string; Zona: string; municipios: number; clientes: number; valor: number }>; nombreValorZona: string } | null;
  /** Tabla "Por municipio": columnas renombradas y filas ordenadas por la cifra elegida. */
  tablaMunicipio: { filas: Array<Record<string, unknown>>; columnas: string[] } | null;
}

export function MapaBoyaca({
  token,
  modo = "comercial",
  altura = 520,
  corte,
  onCalculo,
  tablasFuera = false,
}: {
  token?: string | null;
  modo?: "comercial" | "tecnico";
  altura?: number;
  corte?: string | null;
  /** Devuelve el mapa ya calculado (la página lo usa para la tarjeta del top 10, que va al lado). */
  onCalculo?: (info: InfoMapa | null) => void;
  /** La página ubica las tablas fuera de esta tarjeta (Panorama comercial); en el administrador siguen aquí. */
  tablasFuera?: boolean;
}) {
  const { measure } = usePresentation();
  const movil = useEsMovil();
  const [geometrias, setGeometrias] = useState<Feature[] | null>(null);
  const [filas, setFilas] = useState<FilaMunicipio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metCol, setMetCol] = useState("");
  const [metElegida, setMetElegida] = useState(false);
  const [zonasSel, setZonasSel] = useState<string[]>([]);
  const [comparar, setComparar] = useState("Total del municipio");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}limites_municipios_boyaca.geojson`).then((response) => response.json() as Promise<{ features: Feature[] }>),
      api.municipalityMetrics(token ?? undefined),
    ])
      .then(([geo, data]) => {
        if (cancelled) return;
        setGeometrias(geo.features);
        setFilas(data.rows as FilaMunicipio[]);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar el mapa.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Métricas disponibles: las del modo (comercial según la medida activa, o técnico del administrador),
  // quedándose con las que traiga al menos un municipio.
  const metricas = useMemo(() => {
    const lista = modo === "tecnico" ? METRICAS_TECNICO : measure === "Consumo" ? METRICAS_CONSUMO : METRICAS_FACTURACION;
    if (!filas) return [] as Array<{ col: string; nombre: string; unidad: string }>;
    return lista
      .filter(([col]) => filas.some((fila) => fila[col] !== undefined && fila[col] !== null))
      .map(([col, nombre, unidad]) => ({ col, nombre, unidad }));
  }, [filas, measure, modo]);

  useEffect(() => {
    if (metElegida && metricas.some((metrica) => metrica.col === metCol)) return;
    setMetCol(metricas[0]?.col ?? "");
  }, [metCol, metElegida, metricas]);

  const metrica = metricas.find((item) => item.col === metCol);
  const zonasDisp = useMemo(() => [...new Set((filas ?? []).map((fila) => String(fila.zona_ebsa ?? "")).filter(Boolean))].sort(), [filas]);

  const calculo = useMemo(() => {
    if (!filas || !metrica) return null;
    let d = filas;
    if (zonasSel.length) d = d.filter((fila) => zonasSel.includes(String(fila.zona_ebsa ?? "")));
    const preparadas = d.map((fila) => {
      const valor = Number(fila[metrica.col] ?? 0) || 0;
      return { ...fila, zona_ebsa: String(fila.zona_ebsa ?? "SIN ZONA"), valor, valor_total: valor, clientes_tc1: Number(fila.clientes_tc1 ?? 0) || 0 };
    });
    const totalVal = preparadas.reduce((suma, fila) => suma + fila.valor, 0);
    const unidadTotal = metrica.unidad;
    const puedeProporcion = metrica.unidad !== "%" && metrica.col !== "clientes_tc1" && filas.some((fila) => fila.clientes_tc1 !== undefined);
    const enProporcion = puedeProporcion && comparar.startsWith("En proporción");
    let unidad = metrica.unidad;
    const conValor: FilaCalculada[] = preparadas.map((fila) => {
      let valor = fila.valor;
      if (enProporcion) {
        const cli = fila.clientes_tc1;
        if (unidadTotal === "clientes") {
          valor = cli > 0 ? (valor / cli) * 1000 : 0;
          unidad = "por cada 1.000 clientes";
        } else {
          valor = cli > 0 ? valor / cli : 0;
          unidad = unidadTotal === "$" ? "$ por cliente" : unidadTotal === "kWh" ? "kWh por cliente" : `${unidadTotal} por cliente`;
        }
      }
      const provincia = tituloPropio(String(fila.provincia ?? ""));
      return {
        ...fila,
        valor,
        etiqueta: `${String(fila.municipio ?? "Sin municipio")}${provincia ? ` (${provincia})` : ""}`,
        valor_texto: fmtMetrica(valor, unidad),
        clientes_texto: fmtN(fila.clientes_tc1),
        color_zona: ZONA_MAPA_COLOR[String(fila.zona_ebsa).toUpperCase()] ?? COLOR_ZONA_SIN_ZONA,
      };
    });
    return { d: conValor, enProporcion, unidad, unidadTotal, totalVal, puedeProporcion, metNombre: metrica.nombre, metCol: metrica.col };
  }, [comparar, filas, metrica, zonasSel]);

  const spec = useMemo(() => {
    if (!calculo || !geometrias) return null;
    const pts = new Map<string, { lon: number; lat: number }>();
    for (const feature of geometrias) {
      pts.set(String(feature.properties.codigo_municipio ?? ""), {
        lon: Number(feature.properties.lon_etiqueta),
        lat: Number(feature.properties.lat_etiqueta),
      });
    }
    const porCodigo = new Map<string, FilaMapa>();
    const dd: FilaMapa[] = calculo.d.map((fila) => {
      const codigo = String(fila.codigo_municipio ?? "");
      const centro = pts.get(codigo);
      return {
        codigo_municipio: codigo,
        etiqueta: fila.etiqueta,
        nombre: String(fila.municipio ?? ""),
        zona_ebsa: String(fila.zona_ebsa),
        valor: fila.valor,
        valor_texto: fila.valor_texto,
        clientes_tc1: fila.clientes_tc1,
        clientes_texto: fila.clientes_texto,
        color_zona: fila.color_zona,
        lon_etiqueta: centro?.lon ?? null,
        lat_etiqueta: centro?.lat ?? null,
        relleno: "",
        opacidad: 1,
      };
    });
    dd.forEach((fila) => porCodigo.set(fila.codigo_municipio, fila));
    const maximo = dd.reduce((mayor, fila) => Math.max(mayor, fila.valor), 0);
    const tope = maximo > 0 ? maximo : 1;
    const enProporcion = calculo.enProporcion;
    const todos: FilaMapa[] = geometrias.map((feature) => {
      const codigo = String(feature.properties.codigo_municipio ?? "");
      const fila = porCodigo.get(codigo);
      if (fila) {
        return {
          ...fila,
          relleno: enProporcion ? colorRampa(fila.valor, tope) : fila.color_zona,
          opacidad: enProporcion ? 1 : 0.3,
        };
      }
      return {
        codigo_municipio: codigo,
        etiqueta: "Municipio de una zona no elegida",
        nombre: "",
        zona_ebsa: "—",
        valor: 0,
        valor_texto: "—",
        clientes_tc1: 0,
        clientes_texto: "—",
        color_zona: GRIS_FUERA,
        relleno: GRIS_FUERA,
        opacidad: 1,
        lon_etiqueta: pts.get(codigo)?.lon ?? null,
        lat_etiqueta: pts.get(codigo)?.lat ?? null,
      };
    });
    return mapaLimitesSpec(geometrias, dd, todos, {
      metNombre: calculo.metNombre,
      enProporcion,
      altura: movil ? Math.min(altura, 400) : altura,
      movil,
    });
  }, [altura, calculo, geometrias, movil]);

  const leyendaZonas = useMemo(() => {
    if (!calculo) return [] as Array<[string, string]>;
    const zonas = [...new Set(calculo.d.map((fila) => fila.zona_ebsa))].sort();
    const items: Array<[string, string]> = zonas.map((zona) => [tituloPropio(zona), ZONA_MAPA_COLOR[zona.toUpperCase()] ?? COLOR_ZONA_SIN_ZONA]);
    if (zonasSel.length) items.push(["zona no elegida", GRIS_FUERA]);
    return items;
  }, [calculo, zonasSel]);

  const tablas = useMemo(() => {
    if (!calculo) return null;
    const d = calculo.d;
    // Por zona (mismo agregado que el Streamlit).
    const porZona = new Map<string, { municipios: number; clientes: number; valorSum: number; valorCount: number }>();
    for (const fila of d) {
      const item = porZona.get(fila.zona_ebsa) ?? { municipios: 0, clientes: 0, valorSum: 0, valorCount: 0 };
      item.municipios += 1;
      item.clientes += fila.clientes_tc1;
      item.valorSum += fila.valor_total;
      item.valorCount += 1;
      porZona.set(fila.zona_ebsa, item);
    }
    const zonas = [...porZona.entries()].map(([zona, item]) => {
      let valor = calculo.unidadTotal === "%" ? item.valorSum / (item.valorCount || 1) : item.valorSum;
      if (calculo.enProporcion) {
        valor = item.clientes > 0 ? (valor / item.clientes) * (calculo.unidadTotal === "clientes" ? 1000 : 1) : 0;
        valor = Math.round(valor * 10) / 10;
      }
      return { Zona: tituloPropio(zona), municipios: item.municipios, clientes: item.clientes, valor, clave: zona };
    });
    zonas.sort((a, b) => b.valor - a.valor);
    const nombreValorZona = calculo.enProporcion ? calculo.unidad : calculo.unidadTotal;
    // Por municipio (mismas columnas y renombres que el Streamlit).
    const columnasM = [
      "municipio", "provincia", "zona_ebsa", "clientes_tc1", "caida_clientes", "caida_criticos", "caida_kwh_mes",
      "caida_valor_mes", "fuga_alto", "fuga_medio", "fuga_consumo_alto_medio_kwh_mes", "fuga_perdida_esperada_mes",
    ];
    const renombre: Record<string, string> = {
      municipio: "Municipio", provincia: "Provincia", zona_ebsa: "Zona", clientes_tc1: "Clientes",
      caida_clientes: "Con caída", caida_criticos: "Caída crítica", caida_valor_mes: "Facturación en riesgo $/mes",
      caida_kwh_mes: "Consumo en riesgo kWh/mes", fuga_consumo_alto_medio_kwh_mes: "Consumo fuga ALTO+MEDIO kWh/mes",
      fuga_alto: "Fuga ALTO", fuga_medio: "Fuga MEDIO", fuga_perdida_esperada_mes: "Pérdida esperada fuga $/mes",
    };
    const disponibles = columnasM.filter((columna) => d.some((fila) => fila[columna] !== undefined));
    const municipios = [...d]
      .sort((a, b) => b.valor - a.valor)
      .map((fila) => {
        const registro: Record<string, unknown> = { _valor: fila.valor };
        for (const columna of disponibles) {
          const crudo = fila[columna];
          const redondeado = columna === "caida_kwh_mes" || columna === "fuga_consumo_alto_medio_kwh_mes" ? Math.round(Number(crudo ?? 0)) : crudo;
          registro[renombre[columna] ?? columna] = redondeado;
        }
        return registro;
      });
    return { zonas, nombreValorZona, municipios, columnasM: disponibles.map((columna) => renombre[columna] ?? columna), crudas: disponibles };
  }, [calculo]);

  // Lo que la página necesita para armar su lado: el top 10, la tabla por zona y la de municipios,
  // todos con la cifra y el modo elegidos aquí (mismas columnas 3:2 que el Streamlit).
  const info = useMemo<InfoMapa | null>(
    () =>
      calculo && tablas
        ? {
            filas: calculo.d.map((fila) => ({
              municipio: String(fila.municipio ?? ""),
              valor: fila.valor,
              valor_total: fila.valor_total,
              valor_texto: fila.valor_texto,
            })),
            enProporcion: calculo.enProporcion,
            metNombre: calculo.metNombre,
            metCol: calculo.metCol,
            unidad: calculo.unidad,
            municipios: calculo.d.length,
            tablaZona: { filas: tablas.zonas, nombreValorZona: tablas.nombreValorZona },
            tablaMunicipio: { filas: tablas.municipios, columnas: tablas.columnasM },
          }
        : null,
    [calculo, tablas],
  );

  useEffect(() => {
    onCalculo?.(info);
  }, [info, onCalculo]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!filas || !calculo || !spec || !info) return <div className="empty-state cargando">Cargando mapa…</div>;

  return (
    <div className="mapa-v2">
      <div className="mapa-controles">
        <label className="campo">
          <span>Qué mostrar en el mapa</span>
          <select
            className="filter-select"
            value={metCol}
            onChange={(event) => {
              setMetElegida(true);
              setMetCol(event.target.value);
            }}
          >
            {metricas.map((item) => (
              <option key={item.col} value={item.col}>
                {item.nombre}
              </option>
            ))}
          </select>
        </label>
        <Multiselect
          etiqueta="Zona"
          opciones={zonasDisp}
          valor={zonasSel}
          onChange={(valor) => {
            setMetElegida(true);
            setZonasSel(valor);
          }}
          vacio="Todas las zonas"
          formato={tituloPropio}
        />
      </div>

      {calculo.puedeProporcion && (
        <div className="v2-radio" role="radiogroup" aria-label="Cómo comparar los municipios">
          {["Total del municipio", "En proporción a sus clientes"].map((opcion) => (
            <button
              key={opcion}
              type="button"
              role="radio"
              aria-checked={comparar === opcion}
              className={comparar === opcion ? "activo" : ""}
              title="Total: la cifra completa del municipio; los municipios grandes siempre salen grandes. En proporción: la cifra dividida entre los clientes del municipio; muestra dónde el problema pesa más para su tamaño."
              onClick={() => setComparar(opcion)}
            >
              {opcion}
            </button>
          ))}
        </div>
      )}

      <p className="v2-conteo">
        <b>{fmtN(calculo.d.length)}</b> municipios de Boyacá ·{" "}
        <b>{calculo.unidadTotal !== "%" ? fmtMetrica(calculo.totalVal, calculo.unidadTotal) : "—"}</b>
        {corte ? ` · corte ${corte}` : ""}
      </p>

      <VegaLite spec={spec} className="vega-lite-figura" ariaLabel={calculo.metNombre} />

      <Leyenda
        items={
          calculo.enProporcion
            ? ([
                ["menos", RAMPA_MAPA[0]],
                ["", RAMPA_MAPA[2]],
                [`más ${calculo.unidad}`, RAMPA_MAPA[4]],
                ...(zonasSel.length ? ([["zona no elegida", GRIS_FUERA]] as Array<[string, string]>) : []),
              ] as Array<[string, string]>)
            : leyendaZonas
        }
      />

      <Pie texto={md("Límites municipales: DANE, Marco Geoestadístico Nacional (vía geoBoundaries, CC BY 4.0), simplificados para la pantalla.")} />

      <details className="v2-exp">
        <summary>Cómo leer este mapa</summary>
        <div className="v2-exp-cuerpo">
          <p>
            {md(
              calculo.enProporcion
                ? "El color de cada municipio es la cifra dividida entre sus clientes: más oscuro, más pesa el problema para su tamaño. Un municipio con muy pocos clientes puede salir oscuro por unos pocos casos: mira también cuántos clientes tiene."
                : "Cada círculo es un municipio (tamaño = la cifra elegida, color = zona EBSA). Los municipios con más clientes salen siempre más grandes; cambia a *En proporción* para ver dónde pesa más.",
            )}
          </p>
          <p>{md("Pasa el mouse o toca un municipio para ver su nombre y su cifra.")}</p>
          <p>{md("La **zona** de cada municipio es la del ciclo de lectura en que la empresa factura a la mayoría de sus clientes, no su provincia: por eso un municipio puede aparecer en una zona que no es la de su ubicación (por ejemplo, Cubará en Centro).")}</p>
        </div>
      </details>

      {!tablasFuera && (
        <details className="v2-exp" open>
          <summary>Ver la tabla por zona y por municipio</summary>
          <div className="mapa-tablas">
            <div>
              <p className="tabla-titulo">
                <b>Por zona</b>
              </p>
              <TablaZonaMapa info={info} />
            </div>
            <div>
              <p className="tabla-titulo">
                <b>Por municipio</b>
              </p>
              <TablaMunicipioMapa info={info} corte={corte} />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

/** Tabla "Por zona" del mapa: la página decide dónde va (en Panorama, en la columna lateral). */
export function TablaZonaMapa({ info }: { info: InfoMapa }) {
  const tabla = info.tablaZona;
  if (!tabla) return null;
  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>Zona</th>
            <th>municipios</th>
            <th>clientes</th>
            <th>{tabla.nombreValorZona}</th>
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((zona) => (
            <tr key={zona.clave}>
              <td>{zona.Zona}</td>
              <td>{fmtN(zona.municipios)}</td>
              <td>{fmtN(zona.clientes)}</td>
              <td>{info.enProporcion ? fmtN(zona.valor, 1) : fmtCelda(zona.valor, info.metCol)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tabla "Por municipio" del mapa con su botón de CSV (en Panorama va a ancho completo bajo la fila del mapa). */
export function TablaMunicipioMapa({ info, corte }: { info: InfoMapa; corte?: string | null }) {
  const tabla = info.tablaMunicipio;
  if (!tabla) return null;
  return (
    <>
      <div className="table-card tabla-alta">
        <table>
          <thead>
            <tr>
              {tabla.columnas.map((columna) => (
                <th key={columna}>{columna}</th>
              ))}
              <th>{info.metNombre}</th>
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map((fila, index) => (
              <tr key={index}>
                {tabla.columnas.map((columna) => (
                  <td key={columna}>{typeof fila[columna] === "string" ? String(fila[columna]) : fmtCelda(fila[columna], columna)}</td>
                ))}
                <td>{info.enProporcion ? fmtN(Number(fila._valor), 1) : fmtMetrica(Number(fila._valor), info.unidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="table-action"
        onClick={() => {
          const contenido = csvEs(
            [...tabla.columnas, info.metNombre],
            tabla.filas.map((fila) => ({ ...fila, [info.metNombre]: fila._valor })),
          );
          const enlace = document.createElement("a");
          enlace.href = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
          enlace.download = `mapa_municipios_${corte ?? ""}.csv`;
          enlace.click();
          URL.revokeObjectURL(enlace.href);
        }}
      >
        Descargar municipios (CSV)
      </button>
    </>
  );
}
