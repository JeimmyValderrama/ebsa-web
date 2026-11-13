import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { md, useEsMovil } from "../../charts/textos";
import { cajaFrase, etiquetaColumna } from "../../lib/columnas";

/**
 * Piezas de la interfaz del Streamlit (componentes_v2.py), una a una:
 * titulo_pagina, encabezado, tarjeta, kpis, banda, aviso, como_leer y etiqueta.
 * El objetivo es que cada página se vea igual que en la aplicación original.
 */

/** ui.titulo_pagina(): título grande de la página con su bajada. */
export function TituloPagina({ titulo, bajada }: { titulo: string; bajada?: string }) {
  return (
    <div className="v2-ph">
      <h1>{cajaFrase(titulo)}</h1>
      {bajada ? <p>{md(bajada)}</p> : null}
    </div>
  );
}

/** ui.encabezado(): encabezado de una tarjeta (título + explicación). */
export function Encabezado({ titulo, bajada, hero }: { titulo: string; bajada?: string; hero?: boolean }) {
  return (
    <div className={hero ? "v2-ch v2-hero-h" : "v2-ch"}>
      <h3>{cajaFrase(titulo)}</h3>
      {bajada ? <p>{md(bajada)}</p> : null}
    </div>
  );
}

/** ui.tarjeta(): contenedor blanco con borde (el héroe lleva una franja carbón arriba). plegable se pliega en celular. */
export function Tarjeta({
  titulo,
  bajada,
  hero,
  plegable,
  className,
  children,
}: {
  titulo?: string;
  bajada?: string;
  hero?: boolean;
  plegable?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const movil = useEsMovil();
  if (plegable && titulo && movil) {
    return (
      <details className="v2-exp">
        <summary>{cajaFrase(titulo)}</summary>
        <div className="v2-exp-cuerpo">
          {bajada ? <p>{md(bajada)}</p> : null}
          {children}
        </div>
      </details>
    );
  }
  return (
    <section className={[hero ? "v2-hero" : "v2-card", className].filter(Boolean).join(" ")}>
      {titulo ? <Encabezado titulo={titulo} bajada={bajada} hero={hero} /> : null}
      {children}
    </section>
  );
}

export interface ItemKpi {
  titulo?: string;
  valor: string;
  unidad?: string;
  nota?: string;
  tono?: string;
  ayuda?: string;
  texto?: boolean;
}

/** ui.kpis(): fila de indicadores. columnas = cuántos por fila; compacto = fila pequeña (los nulos no se muestran). */
export function Kpis({ items, columnas, compacto }: { items: Array<ItemKpi | null | undefined>; columnas?: number; compacto?: boolean }) {
  const visibles = items.filter((item): item is ItemKpi => Boolean(item));
  if (!visibles.length) return null;
  const cols = columnas || Math.min(4, visibles.length);
  return (
    <div className={compacto ? "v2-kpis compacto" : "v2-kpis"} style={{ ["--cols" as string]: String(cols) }}>
      {visibles.map((item, index) => (
        <div key={`${item.titulo ?? ""}-${index}`} className={`v2-kpi${item.tono ? ` t-${item.tono}` : ""}`}>
          {item.ayuda ? (
            <span className="v2-ay" tabIndex={0} role="note" aria-label={item.ayuda} data-t={item.ayuda}>
              i
            </span>
          ) : null}
          <div className="v2-kpi-t">{cajaFrase(item.titulo ?? "")}</div>
          <div className={`v2-kpi-v${item.texto ? " texto" : ""}${String(item.valor).length > 10 ? " largo" : ""}`}>
            {item.valor}
            {item.unidad ? <small>{item.unidad}</small> : null}
          </div>
          {item.nota ? <div className="v2-kpi-n">{md(item.nota)}</div> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * ui.tabla_simple(): tabla que ya viene con el texto listo (no se le cambia el formato), como st.dataframe.
 * `formato` se usa cuando la celda sigue siendo número (formato de las tablas cortas con tabla()).
 */
export function TablaSimple({
  columnas,
  filas,
  formato,
  alto,
  acciones,
  tituloAcciones,
}: {
  columnas: string[];
  filas: Array<Record<string, unknown>>;
  formato?: (valor: unknown, columna: string) => string;
  alto?: number;
  /** Columna final con un botón por fila (p. ej. descargar); su celda puede devolver null. */
  acciones?: (fila: Record<string, unknown>, indice: number) => ReactNode;
  tituloAcciones?: string;
}) {
  // Orden y columnas fijadas (siempre disponibles: no cambian el orden inicial hasta que la
  // persona elige uno, y la chincheta solo aparece si hay scroll horizontal real).
  const orden = useOrdenTabla();
  const fijadas = useFijadas(`${columnas.join("|")}|${filas.length}`);
  if (!filas.length) return null;
  const fmt = formato ?? ((valor: unknown) => (valor === null || valor === undefined ? "" : String(valor)));
  const columnasCifra = new Set(columnas.filter((columna) => columnaCifra(filas, columna, fmt)));
  const columnasCentro = new Set(columnas.filter((columna) => columnaCentro(filas, columna)));
  const claseDe = (columna: string): string =>
    [columnasCifra.has(columna) ? "num" : "", columnasCentro.has(columna) ? "centro" : ""].filter(Boolean).join(" ");
  // El índice que recibe `acciones` siempre es el de la lista que llegó: aunque se ordene,
  // el botón sigue apuntando a la misma fila original (p. ej. la descarga correcta).
  const conIndice = filas.map((fila, indice) => ({ fila, indice }));
  const visibles = ordenarFilas(conIndice, orden.orden, orden.sentido, (item, columna) => item.fila[columna]);
  return (
    <div ref={fijadas.contenedorRef} className="table-card" style={alto ? { maxHeight: `${alto}px`, overflow: "auto" } : undefined}>
      <table ref={fijadas.tablaRef}>
        <thead>
          <tr>
            {columnas.map((columna) => (
              <ThTabla
                key={columna}
                columna={columna}
                orden={orden.orden}
                sentido={orden.sentido}
                onOrdenar={orden.ordenarPor}
                onFijar={fijadas.alternarFijada}
                hayScrollX={fijadas.hayScrollX}
                fijada={fijadas.esFijada(columna)}
                left={fijadas.izquierda(columna)}
                className={claseDe(columna)}
              />
            ))}
            {acciones ? <th className="col-accion">{tituloAcciones ?? ""}</th> : null}
          </tr>
        </thead>
        <tbody>
          {visibles.map(({ fila, indice }) => (
            <tr key={indice}>
              {columnas.map((columna) => {
                const celda = fila[columna];
                const texto = formato ? formato(celda, columna) : celda === null || celda === undefined ? "" : String(celda);
                return <td key={columna} {...fijadas.celdaFijada(columna, claseDe(columna))}>{texto}</td>;
              })}
              {acciones ? <td className="col-accion">{acciones(fila, indice)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface SegmentoBanda {
  nombre: string;
  valor: string;
  unidad?: string;
  detalle?: string;
  peso: number;
  color: string;
}

/** ui.banda(): franja de tramos con el mismo ancho horizontal (pedido de diseño). */
export function Banda({ segmentos }: { segmentos: SegmentoBanda[] }) {
  return (
    <div className="v2-banda">
      {segmentos.map((segmento) => (
        <div
          key={segmento.nombre}
          className="v2-seg"
          style={{ flex: "1 1 0", background: segmento.color }}
        >
          <span className="v2-seg-n">{segmento.nombre}</span>
          <span className="v2-seg-v">
            {segmento.valor}
            <small>{segmento.unidad ?? ""}</small>
          </span>
          {segmento.detalle ? <span className="v2-seg-c">{segmento.detalle}</span> : null}
        </div>
      ))}
    </div>
  );
}

const ROTULOS: Record<string, string> = {
  info: "Nota",
  limite: "Limitación del modelo",
  calidad: "Calidad de los datos",
  alerta: "Atención",
  bien: "Correcto",
  academico: "Proyecto académico",
  ejemplo: "Ejemplo simulado",
};

/** ui.aviso(): mensaje destacado; cada tipo lleva su rótulo en texto, no solo el color. */
export function Aviso({ texto, tipo = "info", rotulo }: { texto: string; tipo?: string; rotulo?: string }) {
  const clase = tipo === "ejemplo" ? "limite" : tipo;
  return (
    <div className={`v2-aviso a-${clase}`}>
      <span className="ico">{rotulo ?? ROTULOS[tipo] ?? "Nota"}</span>
      <div>{md(texto)}</div>
    </div>
  );
}

/** ui.como_leer(): explicación larga, plegada para que las cifras queden primero. */
export function ComoLeer({ texto, titulo = "Cómo leer esta página", abierto = false }: { texto: string; titulo?: string; abierto?: boolean }) {
  return (
    <details className="v2-exp" open={abierto}>
      <summary>{titulo}</summary>
      <div className="v2-exp-cuerpo">
        {texto.split(/\n{2,}/).map((parrafo, index) => (
          <p key={index}>{md(parrafo)}</p>
        ))}
      </div>
    </details>
  );
}

/** ui.etiqueta(): etiqueta de estado (forma y texto, no solo color). */
export function Etiqueta({ texto, tono = "neutro" }: { texto: string; tono?: "alerta" | "aviso" | "bien" | "neutro" }) {
  return <span className={`v2-tag t-${tono}`}>{texto}</span>;
}

/* ---------- solo presentación: detectar cifras para alinearlas a la derecha ---------- */

/** ¿Esta celda ya formateada se ve como una cifra? Acepta signo, separadores de miles y
 *  decimales, % y una unidad al final; rechaza NIU sin separadores, fechas y texto. */
const CIFRA = /^[-−+$]?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?:\s?%|\s?[A-Za-zµ]+)?$/;
export function esCifra(texto: string): boolean {
  return CIFRA.test(texto.trim());
}

/** ¿La columna está formada solo por cifras (ignorando vacíos y "—")? Si es así, se alinea
 *  a la derecha. No toca valores, columnas ni formato: es una decisión de presentación. */
export function columnaCifra(
  filas: Array<Record<string, unknown>>,
  columna: string,
  formato: (valor: unknown, columna: string) => string,
): boolean {
  const celdas = filas
    .map((fila) => formato(fila[columna], columna).trim())
    .filter((texto) => texto !== "" && texto !== "—");
  return celdas.length > 0 && celdas.every(esCifra);
}

/* ---------- solo presentación: ordenar y filtrar sin tocar los datos ---------- */

/** ¿La celda está vacía para ordenar o filtrar? (nulo, blanco o el "—" de la app). */
export function esVaciaCelda(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  const texto = String(valor).trim();
  return texto === "" || texto === "—";
}

/** Número detrás de una celda: valor crudo si es número, o texto en formato colombiano
 *  (puntos de miles, coma decimal y "%" opcional). Devuelve null si no es un número. */
export function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const texto = valor.trim().replace(/%$/, "").trim();
  if (!texto) return null;
  // Texto plano: "25", "-4.5".
  if (/^[+-]?\d+(\.\d+)?$/.test(texto)) return Number(texto);
  // Formato colombiano: "1.234.567,5" (puntos de miles y coma decimal).
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto)) return Number(texto.replace(/\./g, "").replace(",", "."));
  // Solo coma decimal: "1234,5".
  if (/^[+-]?\d+,\d+$/.test(texto)) return Number(texto.replace(",", "."));
  return null;
}

/** Marca de tiempo detrás de una celda de fecha: ISO ("2024-01-15", "2024-01" o con hora)
 *  y "15/01/2024". Devuelve null si no es una fecha. */
export function aFecha(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (/^\d{4}-\d{2}(-\d{2})?/.test(texto)) {
    const marca = Date.parse(/^\d{4}-\d{2}$/.test(texto) ? `${texto}-01` : texto);
    return Number.isNaN(marca) ? null : marca;
  }
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (partes) {
    const marca = Date.parse(`${partes[3]}-${partes[2].padStart(2, "0")}-${partes[1].padStart(2, "0")}`);
    return Number.isNaN(marca) ? null : marca;
  }
  return null;
}

export type TipoColumna = "num" | "fecha" | "texto";

/** Tipo de orden de una columna según sus valores: numérico, cronológico o alfabético. */
export function tipoColumna(valores: unknown[]): TipoColumna {
  const llenos = valores.filter((valor) => !esVaciaCelda(valor));
  if (!llenos.length) return "texto";
  if (llenos.every((valor) => aNumero(valor) !== null)) return "num";
  if (llenos.every((valor) => aFecha(valor) !== null)) return "fecha";
  return "texto";
}

/** Columnas de códigos cortos que van centradas (convención UI: IDs, fechas, estados).
 *  Los nombres de texto (zona, clase, grupo de consumo, tamaño) NO entran: van a la izquierda. */
const COLUMNAS_CENTRO = new Set([
  "NIU",
  "Ciclo",
  "Puesto",
  "Ranking",
  "Orden en el ciclo",
  "Estado",
  "Estado en lista",
  "Situación",
  "Nivel de riesgo",
  "Riesgo",
  "Nivel",
  "Prioridad",
  "Tipo de lectura",
  "Confiabilidad",
  "Ventana completa",
  "Observable",
]);

/** ¿La columna va centrada? Códigos cortos por nombre o fechas (todas leídas como fecha).
 *  Convención UI: texto a la izquierda, números a la derecha, códigos/fechas al centro y el
 *  encabezado igual que sus datos. Solo presentación: no toca valores ni columnas. */
export function columnaCentro(filas: Array<Record<string, unknown>>, columna: string): boolean {
  if (COLUMNAS_CENTRO.has(columna)) return true;
  return tipoColumna(filas.map((fila) => fila[columna])) === "fecha";
}

/** Comparador de celdas: números numéricamente, fechas cronológicamente y texto
 *  alfabéticamente; los vacíos quedan al final en ambos sentidos. Solo se aplica cuando la
 *  persona elige ordenar: el orden inicial de la tabla no se toca. */
export function compararCeldas(a: unknown, b: unknown, tipo: TipoColumna, sentido: "asc" | "desc"): number {
  if (tipo !== "texto") {
    const va = tipo === "num" ? aNumero(a) : aFecha(a);
    const vb = tipo === "num" ? aNumero(b) : aFecha(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return sentido === "asc" ? va - vb : vb - va;
  }
  const ta = esVaciaCelda(a) ? "" : String(a).trim();
  const tb = esVaciaCelda(b) ? "" : String(b).trim();
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  const cmp = ta.localeCompare(tb, "es", { numeric: true, sensitivity: "base" });
  return sentido === "asc" ? cmp : -cmp;
}

/** Estado de orden de una tabla: sin orden hasta que la persona elige uno (el orden inicial
 *  no se toca). El primer clic ordena de menor a mayor y el siguiente lo invierte. */
export function useOrdenTabla(): {
  orden: string | null;
  sentido: "asc" | "desc";
  ordenarPor: (columna: string) => void;
} {
  const [orden, setOrden] = useState<string | null>(null);
  const [sentido, setSentido] = useState<"asc" | "desc">("asc");
  const ordenarPor = (columna: string): void => {
    if (orden === columna) setSentido((previo) => (previo === "asc" ? "desc" : "asc"));
    else {
      setOrden(columna);
      setSentido("asc");
    }
  };
  return { orden, sentido, ordenarPor };
}

/** Filas ordenadas por la columna elegida: si aún no se pide orden devuelve la misma lista
 *  (nunca reordena sola) y nunca toca la lista original. `valorDe` da el valor de la celda
 *  en las tablas que lo calculan distinto de `fila[columna]`. */
export function ordenarFilas<T extends object>(
  filas: T[],
  orden: string | null,
  sentido: "asc" | "desc",
  valorDe?: (fila: T, columna: string) => unknown,
): T[] {
  if (!orden) return filas;
  const col = orden;
  const ver = (fila: T): unknown => (valorDe ? valorDe(fila, col) : (fila as Record<string, unknown>)[col]);
  const tipo = tipoColumna(filas.map(ver));
  return [...filas].sort((a, b) => compararCeldas(ver(a), ver(b), tipo, sentido));
}

/** ¿Dos mediciones de anchos dicen lo mismo? (para no marcar cambios sin cambio). */
function mismosAnchos(a: Record<string, number>, b: Record<string, number>): boolean {
  const clavesA = Object.keys(a);
  return clavesA.length === Object.keys(b).length && clavesA.every((clave) => a[clave] === b[clave]);
}

/** Columnas fijadas con chincheta: miden el ancho real de sus th para encadenar los
 *  offsets "left" y detectan si la tabla tiene scroll horizontal de verdad (medido en
 *  runtime sobre el contenedor, nunca por el tamaño de la pantalla) para mostrar la
 *  chincheta. `clave` cambia cuando cambian las columnas o el número de filas. */
export function useFijadas(clave: string): {
  hayScrollX: boolean;
  esFijada: (columna: string) => boolean;
  izquierda: (columna: string) => number | undefined;
  alternarFijada: (columna: string) => void;
  celdaFijada: (columna: string, clase?: string) => { className: string; style?: CSSProperties };
  contenedorRef: RefObject<HTMLDivElement | null>;
  tablaRef: RefObject<HTMLTableElement | null>;
} {
  const [fijadas, setFijadas] = useState<string[]>([]);
  const [anchos, setAnchos] = useState<Record<string, number>>({});
  const [hayScrollX, setHayScrollX] = useState(false);
  const tablaRef = useRef<HTMLTableElement | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);

  // Offset "left" de cada fijada: la primera va en 0 y las siguientes se apoyan en el ancho
  // real de las anteriores (medido en sus th, con la tabla ya pintada).
  useLayoutEffect(() => {
    if (fijadas.length === 0) {
      setAnchos((previo) => (Object.keys(previo).length === 0 ? previo : {}));
      return;
    }
    const medir = (): void => {
      const ths = tablaRef.current?.querySelectorAll<HTMLTableCellElement>("thead th[data-col]");
      if (!ths || ths.length === 0) return;
      const nuevos: Record<string, number> = {};
      let acumulado = 0;
      ths.forEach((th) => {
        const columna = th.dataset.col;
        if (columna && fijadas.includes(columna)) {
          nuevos[columna] = acumulado;
          acumulado += th.offsetWidth;
        }
      });
      setAnchos((previo) => (mismosAnchos(previo, nuevos) ? previo : nuevos));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [clave, fijadas]);

  // Scroll horizontal real: el contenedor casi siempre tiene overflow-x: auto, pero solo se
  // desplaza si el contenido lo desborda. Se vuelve a medir al cambiar las columnas, las
  // filas o el tamaño de la ventana, y con un ResizeObserver por si cambia el contenedor.
  useLayoutEffect(() => {
    const nodo = contenedorRef.current;
    if (!nodo) return;
    const medir = (): void => setHayScrollX(nodo.scrollWidth > nodo.clientWidth + 1);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [clave]);

  const alternarFijada = (columna: string): void => {
    setFijadas((previo) => (previo.includes(columna) ? previo.filter((fijada) => fijada !== columna) : [...previo, columna]));
  };

  return {
    hayScrollX,
    esFijada: (columna: string): boolean => fijadas.includes(columna),
    izquierda: (columna: string): number | undefined => (fijadas.includes(columna) ? anchos[columna] ?? 0 : undefined),
    alternarFijada,
    celdaFijada: (columna: string, clase?: string): { className: string; style?: CSSProperties } => ({
      className: [clase ?? "", fijadas.includes(columna) ? "fijada" : ""].filter(Boolean).join(" "),
      style: fijadas.includes(columna) ? { left: anchos[columna] ?? 0 } : undefined,
    }),
    contenedorRef,
    tablaRef,
  };
}

/** Encabezado de las tablas con orden por columna y chincheta de fijar (mismo patrón que
 *  TablaPro): clic en el nombre ordena, el siguiente clic invierte, con indicador ▲/▼ y
 *  aria-sort. La chincheta solo se pinta si se pasa `onFijar` y hay scroll horizontal real. */
export function ThTabla({
  columna,
  orden,
  sentido,
  onOrdenar,
  onFijar,
  hayScrollX,
  fijada,
  left,
  className,
  children,
}: {
  columna: string;
  orden: string | null;
  sentido: "asc" | "desc";
  onOrdenar: (columna: string) => void;
  onFijar?: (columna: string) => void;
  hayScrollX?: boolean;
  fijada?: boolean;
  left?: number;
  className?: string;
  children?: ReactNode;
}) {
  const activo = orden === columna;
  return (
    <th
      data-col={columna}
      className={[className ?? "", fijada ? "fijada" : ""].filter(Boolean).join(" ")}
      style={fijada ? { left: left ?? 0 } : undefined}
      aria-sort={activo ? (sentido === "asc" ? "ascending" : "descending") : "none"}
    >
      <div className="th-cuerpo">
        <button type="button" className="th-sort" onClick={() => onOrdenar(columna)}>
          <span>{children ?? etiquetaColumna(columna)}</span>
          {/* Indicador de la columna ordenada: triángulo según el sentido. */}
          <span className="th-sort-flecha" aria-hidden="true">
            {activo ? (sentido === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
        {onFijar && hayScrollX ? (
          <button
            type="button"
            className={`th-fijar${fijada ? " activo" : ""}`}
            aria-pressed={Boolean(fijada)}
            aria-label={`Fijar la columna ${etiquetaColumna(columna)} a la izquierda`}
            onClick={() => onFijar(columna)}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M9.7.3l6 6-1.5.4-1.2-.3-2.7 2.7.4 2.9-1.4 1.4-3.1-3.1-4.3 4.3-.6-.64.3-1.4L5.37 8 2.3 6.6l1.4-1.4 2.9.4L9.3 2.9 9 .1z"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </th>
  );
}
