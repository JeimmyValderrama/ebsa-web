import type { ReactNode } from "react";
import { md, useEsMovil } from "../../charts/textos";

/**
 * Piezas de la interfaz del Streamlit (componentes_v2.py), una a una:
 * titulo_pagina, encabezado, tarjeta, kpis, banda, aviso, como_leer y etiqueta.
 * El objetivo es que cada página se vea igual que en la aplicación original.
 */

/** ui.titulo_pagina(): título grande de la página con su bajada. */
export function TituloPagina({ titulo, bajada }: { titulo: string; bajada?: string }) {
  return (
    <div className="v2-ph">
      <h1>{titulo}</h1>
      {bajada ? <p>{md(bajada)}</p> : null}
    </div>
  );
}

/** ui.encabezado(): encabezado de una tarjeta (título + explicación). */
export function Encabezado({ titulo, bajada, hero }: { titulo: string; bajada?: string; hero?: boolean }) {
  return (
    <div className={hero ? "v2-ch v2-hero-h" : "v2-ch"}>
      <h3>{titulo}</h3>
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
        <summary>{titulo}</summary>
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
          <div className="v2-kpi-t">{item.titulo ?? ""}</div>
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
  if (!filas.length) return null;
  const fmt = formato ?? ((valor: unknown) => (valor === null || valor === undefined ? "" : String(valor)));
  const columnasCifra = new Set(columnas.filter((columna) => columnaCifra(filas, columna, fmt)));
  const claseDe = (columna: string): string => (columnasCifra.has(columna) ? "num" : "");
  return (
    <div className="table-card" style={alto ? { maxHeight: `${alto}px`, overflow: "auto" } : undefined}>
      <table>
        <thead>
          <tr>
            {columnas.map((columna) => (
              <th key={columna} className={claseDe(columna)}>{columna}</th>
            ))}
            {acciones ? <th className="col-accion">{tituloAcciones ?? ""}</th> : null}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, index) => (
            <tr key={index}>
              {columnas.map((columna) => {
                const celda = fila[columna];
                const texto = formato ? formato(celda, columna) : celda === null || celda === undefined ? "" : String(celda);
                return <td key={columna} className={claseDe(columna)}>{texto}</td>;
              })}
              {acciones ? <td className="col-accion">{acciones(fila, index)}</td> : null}
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

/** ui.banda(): franja proporcional; el ancho de cada tramo es su peso sobre el total. */
export function Banda({ segmentos }: { segmentos: SegmentoBanda[] }) {
  const total = segmentos.reduce((suma, segmento) => suma + Math.max(Number(segmento.peso) || 0, 0), 0) || 1;
  return (
    <div className="v2-banda">
      {segmentos.map((segmento) => (
        <div
          key={segmento.nombre}
          className="v2-seg"
          style={{ flex: `${Math.max(segmento.peso / total, 0.17).toFixed(4)} 1 0`, background: segmento.color }}
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
