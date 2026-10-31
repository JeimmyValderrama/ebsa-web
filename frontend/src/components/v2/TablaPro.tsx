import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtN } from "../../lib/format";
import { Sensitive } from "../../app/Presentation";
import { useEsMovil } from "../../charts/textos";
import { columnaCifra, Encabezado } from "./ui";

/**
 * Tabla de trabajo del Streamlit (ui.tabla_pro): buscar, ordenar, elegir cuántas columnas y filas ver,
 * paginar, descargar y abrir la ficha del cliente elegido debajo de la tabla.
 */

export type Fila = Record<string, unknown>;

export function TablaPro({
  filas,
  columnas,
  formato,
  prioritarias,
  movil,
  destacada,
  que = "filas",
  columnaId,
  buscar = true,
  porPagina = 25,
  ordenNumerico,
  sensibles = [],
  descargar,
  ficha,
}: {
  filas: Fila[];
  columnas: string[];
  /** Formato de celda (formato_tabla): pesos con $, kWh con separador de miles, etc. */
  formato: (valor: unknown, columna: string) => string;
  prioritarias?: string[];
  movil?: string[];
  destacada?: string;
  que?: string;
  columnaId?: string;
  buscar?: boolean;
  porPagina?: number;
  /** Valores numéricos detrás de columnas que se ven como texto (para ordenar "-45 %" bien). */
  ordenNumerico?: Record<string, number[]>;
  /** Columnas con NIU o dirección: se enmascaran en modo presentación. */
  sensibles?: string[];
  descargar?: { nombre: string; archivo: string; csv: string } | null;
  ficha?: (niu: string) => ReactNode;
}) {
  const esMovil = useEsMovil();
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState("(orden recomendado)");
  const [sentido, setSentido] = useState<"desc" | "asc">("desc");
  // En celular se arranca con menos filas por página, como en el Streamlit (k_pp: 5 si es móvil).
  const [pp, setPp] = useState(esMovil ? 5 : porPagina);
  const [pag, setPag] = useState(1);
  const [todas, setTodas] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  // El menú "Ordenar y columnas" flota sobre la tabla (no empuja el contenido) y se
  // cierra al pulsar fuera o con Esc, como cualquier desplegable.
  const [popAbierto, setPopAbierto] = useState(false);
  const popRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!popAbierto) return;
    const alPulsarFuera = (evento: MouseEvent): void => {
      if (popRef.current && !popRef.current.contains(evento.target as Node)) setPopAbierto(false);
    };
    const alEsc = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") setPopAbierto(false);
    };
    document.addEventListener("mousedown", alPulsarFuera);
    document.addEventListener("keydown", alEsc);
    return () => {
      document.removeEventListener("mousedown", alPulsarFuera);
      document.removeEventListener("keydown", alEsc);
    };
  }, [popAbierto]);

  const total = filas.length;
  const hayMasColumnas = (prioritarias ?? columnas).length < columnas.length;
  const colsVer = todas || hayMasColumnas === false ? columnas : (prioritarias ?? columnas);

  const conIndice = useMemo(() => filas.map((fila, indice) => ({ fila, indice })), [filas]);
  const buscadas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return conIndice;
    return conIndice.filter(({ fila }) => columnas.some((columna) => formato(fila[columna], columna).toLowerCase().includes(texto)));
  }, [columnas, conIndice, formato, q]);
  const ordenadas = useMemo(() => {
    if (orden === "(orden recomendado)") return buscadas.map(({ fila }) => fila);
    const llave = ordenNumerico?.[orden];
    const copia = [...buscadas];
    copia.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      if (llave) {
        va = llave[a.indice] ?? Number.NEGATIVE_INFINITY;
        vb = llave[b.indice] ?? Number.NEGATIVE_INFINITY;
      } else {
        const bruto = (valor: unknown): number | string => {
          const numero = Number(valor);
          return valor === null || valor === undefined || valor === "" || Number.isNaN(numero) ? String(valor ?? "") : numero;
        };
        va = bruto(a.fila[orden]);
        vb = bruto(b.fila[orden]);
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sentido === "asc" ? cmp : -cmp;
    });
    return copia.map(({ fila }) => fila);
  }, [buscadas, orden, ordenNumerico, sentido]);

  // Cambió la lista: se vuelve a la primera página y se suelta la fila elegida.
  useEffect(() => {
    setPag(1);
  }, [q, orden, sentido, pp, total]);
  useEffect(() => {
    if (elegido && !filas.some((fila) => String(fila[columnaId ?? ""] ?? "").trim() === elegido)) setElegido(null);
  }, [columnaId, elegido, filas]);

  const n = ordenadas.length;
  const paginas = Math.max(1, Math.ceil(n / pp));
  const paginaActual = Math.min(Math.max(1, pag), paginas);
  const inicio = (paginaActual - 1) * pp;
  const pagina = ordenadas.slice(inicio, inicio + pp);
  const campos = (esMovil ? (movil ?? (prioritarias ?? columnas).slice(0, 6)) : colsVer).filter((columna) => columnas.includes(columna));
  // Solo presentación: las columnas de solo cifras se alinean a la derecha (se decide con la página visible).
  const columnasCifra = new Set(campos.filter((columna) => columnaCifra(pagina, columna, formato)));
  const claseDe = (columna: string): string =>
    [columna === destacada ? "destacada" : "", columnasCifra.has(columna) ? "num" : ""].filter(Boolean).join(" ");

  // Ordenar haciendo clic en el encabezado: el primer clic ordena por esa columna con el
  // sentido vigente y el siguiente clic lo invierte (mismo estado que el menú "Ordenar y columnas").
  const ordenarPor = (columna: string): void => {
    if (orden === columna) setSentido(sentido === "asc" ? "desc" : "asc");
    else setOrden(columna);
  };

  const celda = (fila: Fila, columna: string): ReactNode => {
    const texto = formato(fila[columna], columna);
    return sensibles.includes(columna) ? <Sensitive value={texto} /> : texto;
  };
  const idDe = (fila: Fila): string => String(fila[columnaId ?? ""] ?? "").trim();

  const textoPie =
    `${fmtN(inicio + 1)}–${fmtN(Math.min(inicio + pp, n))} de ${fmtN(n)} ${que}` + (n !== total ? ` (de ${fmtN(total)})` : "")
    + (paginas > 1 ? ` · página ${fmtN(paginaActual)} de ${fmtN(paginas)}` : "")
    + (ficha && !esMovil ? ". Elige una fila para ver la ficha." : "");

  const descargarCsv = (): void => {
    if (!descargar) return;
    const url = URL.createObjectURL(new Blob(["\ufeff" + descargar.csv], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = descargar.archivo;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tabla-pro">
      <div className="ctl-fila">
        <div>{buscar && total > 8 ? (
          <input
            className="search-input"
            value={q}
            onChange={(evento) => setQ(evento.target.value)}
            placeholder="Buscar en la tabla (NIU, municipio, clase…)"
            aria-label="Buscar en la tabla"
          />
        ) : null}</div>
        <details
          className="v2-pop"
          ref={popRef}
          open={popAbierto}
          onClick={(evento) => {
            if ((evento.target as HTMLElement).closest("summary")) setPopAbierto((abierto) => !abierto);
          }}
        >
          <summary className="ghost-button">Ordenar y columnas</summary>
          <div className="v2-pop-cuerpo">
            <label className="campo">
              <span>Ordenar por</span>
              <select className="filter-select" value={orden} onChange={(evento) => setOrden(evento.target.value)}>
                <option value="(orden recomendado)">(orden recomendado)</option>
                {columnas.map((columna) => (
                  <option key={columna} value={columna}>
                    {columna}
                  </option>
                ))}
              </select>
            </label>
            <div className="campo">
              <span>Sentido</span>
              <div className="v2-radio">
                <button type="button" className={sentido === "desc" ? "activo" : ""} onClick={() => setSentido("desc")}>
                  Mayor a menor
                </button>
                <button type="button" className={sentido === "asc" ? "activo" : ""} onClick={() => setSentido("asc")}>
                  Menor a mayor
                </button>
              </div>
            </div>
            <label className="campo">
              <span>Filas por página</span>
              <select className="filter-select" value={pp} onChange={(evento) => setPp(Number(evento.target.value))}>
                {[5, 10, 25, 50, 100].map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </select>
            </label>
            {hayMasColumnas ? (
              <label className="v2-check">
                <input type="checkbox" checked={todas} onChange={(evento) => setTodas(evento.target.checked)} />
                Todas las columnas
              </label>
            ) : null}
          </div>
        </details>
      </div>

      {n === 0 ? (
        <p className="empty-state">
          {q ? `Ninguna fila contiene «${q}». Borra la búsqueda para ver las ${fmtN(total)} ${que}.` : `No hay ${que} para mostrar.`}
        </p>
      ) : esMovil ? (
        <div className="v2-tarjetas">
          {pagina.map((fila, indice) => (
            <div
              key={indice}
              className={ficha ? "v2-fila clickable-row" : "v2-fila"}
              onClick={ficha ? () => setElegido(idDe(fila)) : undefined}
            >
              {campos.map((columna) => (
                <div key={columna} className={columna === destacada ? "fuerte" : ""}>
                  <span>{columna}</span>
                  {celda(fila, columna)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="table-card tabla-alta">
          <table>
            <thead>
              <tr>
                {campos.map((columna) => (
                  <th
                    key={columna}
                    className={claseDe(columna)}
                    aria-sort={orden === columna ? (sentido === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button type="button" className="th-sort" onClick={() => ordenarPor(columna)}>
                      <span>{columna}</span>
                      {/* Indicador de la columna ordenada: triángulo según el sentido. */}
                      <span className="th-sort-flecha" aria-hidden="true">
                        {orden === columna ? (sentido === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagina.map((fila, indice) => (
                <tr
                  key={indice}
                  className={`${ficha ? "clickable-row" : ""}${idDe(fila) && idDe(fila) === elegido ? " fila-sel" : ""}`}
                  onClick={ficha ? () => setElegido(idDe(fila)) : undefined}
                  tabIndex={ficha ? 0 : undefined}
                  onKeyDown={
                    ficha
                      ? (evento) => {
                          // Misma acción que el click: abrir la ficha con Enter o Espacio.
                          if (evento.key === "Enter" || evento.key === " ") {
                            evento.preventDefault();
                            setElegido(idDe(fila));
                          }
                        }
                      : undefined
                  }
                >
                  {campos.map((columna) => (
                    <td key={columna} className={claseDe(columna)}>
                      {celda(fila, columna)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="tabla-pie">
        <p className="v2-conteo" aria-live="polite">{textoPie}</p>
        <button type="button" className="ghost-button" disabled={paginaActual <= 1} onClick={() => setPag(paginaActual - 1)}>
          Anterior
        </button>
        <button type="button" className="ghost-button" disabled={paginaActual >= paginas} onClick={() => setPag(paginaActual + 1)}>
          Siguiente
        </button>
        {descargar && !esMovil ? (
          <button type="button" className="ghost-button" onClick={descargarCsv}>
            {descargar.nombre}
          </button>
        ) : null}
      </div>
      {descargar && esMovil ? (
        <button type="button" className="ghost-button" onClick={descargarCsv}>
          {descargar.nombre}
        </button>
      ) : null}

      {ficha && elegido ? (
        <section className="v2-card ficha-en-tabla">
          <Encabezado titulo={`Cliente ${elegido}`} bajada="Ficha del cliente elegido en la tabla" />
          {ficha(elegido)}
        </section>
      ) : null}
    </div>
  );
}
