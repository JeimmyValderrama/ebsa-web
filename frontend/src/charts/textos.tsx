import { Fragment, useEffect, useState, type ReactNode } from "react";
import { fmtN } from "../lib/format";

/**
 * Piezas de texto del Streamlit: md() (**negrita**, *cursiva*, `código`), leyenda(), pie() y linea_conteo().
 * Réplica de componentes_v2.py para que las explicaciones bajo gráficas y mapas se lean igual.
 */

/** Texto con **negrita**, *cursiva* y `código`, seguro (sin HTML del usuario). */
export function md(texto: string): ReactNode {
  const partes: ReactNode[] = [];
  const expresion = /(\*\*([^*]+?)\*\*|(?<![\*\w])\*(?!\s)([^*]+?)(?<!\s)\*(?![\*\w])|`([^`]+?)`)/g;
  let ultimo = 0;
  let coincidencia: RegExpExecArray | null;
  let llave = 0;
  while ((coincidencia = expresion.exec(texto)) !== null) {
    if (coincidencia.index > ultimo) partes.push(texto.slice(ultimo, coincidencia.index));
    if (coincidencia[2] !== undefined) partes.push(<b key={llave++}>{coincidencia[2]}</b>);
    else if (coincidencia[3] !== undefined) partes.push(<i key={llave++}>{coincidencia[3]}</i>);
    else partes.push(<code key={llave++}>{coincidencia[4]}</code>);
    ultimo = coincidencia.index + coincidencia[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}

/** Franja de colores con el nombre de cada serie (ui.leyenda). */
export function Leyenda({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="v2-ley">
      {items.map(([nombre, color], index) => (
        <span key={`${nombre}-${color}-${index}`}>
          <i style={{ background: color }} />
          {nombre}
        </span>
      ))}
    </div>
  );
}

/** Nota al pie bajo una gráfica o un mapa (ui.pie). */
export function Pie({ texto }: { texto: ReactNode }) {
  return <p className="v2-pie">{texto}</p>;
}

/**
 * "2.405 clientes con los filtros · 29.057 en toda la lista · 48.094 clientes evaluados en total"
 * (ui.linea_conteo).
 */
export function Conteo({
  mostrados,
  filtrados,
  enLista,
  universo,
  que = "clientes",
  queLista = "en toda la lista",
  queUniverso = "clientes evaluados en total",
}: {
  mostrados: number;
  filtrados: number;
  enLista: number;
  universo?: number | null;
  que?: string;
  queLista?: string;
  queUniverso?: string;
}) {
  return (
    <p className="v2-conteo">
      {mostrados !== filtrados ? (
        <Fragment>
          Se incluyen <b>{fmtN(mostrados)}</b> de{" "}
        </Fragment>
      ) : null}
      <b>{fmtN(filtrados)}</b> {que}
      {filtrados !== enLista ? (
        <Fragment>
          {" "}
          con los filtros actuales · <b>{fmtN(enLista)}</b> {queLista}
        </Fragment>
      ) : null}
      {universo ? (
        <Fragment>
          {" "}
          · <b>{fmtN(universo)}</b> {queUniverso}
        </Fragment>
      ) : null}
    </p>
  );
}

/** ¿La pantalla es de celular? (en el Streamlit se decides por el User-Agent; aquí por el ancho). */
export function useEsMovil(): boolean {
  const [movil, setMovil] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const alCambiar = (): void => setMovil(media.matches);
    media.addEventListener("change", alCambiar);
    return () => media.removeEventListener("change", alCambiar);
  }, []);
  return movil;
}
