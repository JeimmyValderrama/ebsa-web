import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { csvCelda, fmtN } from "../../lib/format";
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
  sinMenu = false,
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
  /** Descarga: el CSV se genera aquí con las filas filtradas y ordenadas (ver descargarCsv). */
  descargar?: { nombre: string; archivo: string } | null;
  ficha?: (niu: string) => ReactNode;
  /** Oculta el menú desplegable "Ordenar y columnas"; el orden por las flechas del
   *  encabezado sigue funcionando. Si tampoco hay búsqueda, se omite toda la barra. */
  sinMenu?: boolean;
}) {
  const esMovil = useEsMovil();
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState("(orden recomendado)");
  const [sentido, setSentido] = useState<"desc" | "asc">("desc");
  // En celular se arranca con menos filas por página, como en el Streamlit (k_pp: 5 si es móvil).
  const [pp, setPp] = useState(esMovil ? 5 : porPagina);
  const [pag, setPag] = useState(1);
  const [todas, setTodas] = useState(false);
  // Columnas que la persona usuaria ocultó a mano (ninguna se oculta sola); al volver a
  // mostrarlas recuperan su posición original porque se filtra la lista base sin reordenarla.
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  // Columnas fijadas (chincheta del encabezado), en el orden en que se fijaron.
  const [fijadas, setFijadas] = useState<string[]>([]);
  // Ancho acumulado de cada columna fijada: offset "left" para que no se pisen al apilarse.
  const [anchosFijadas, setAnchosFijadas] = useState<Record<string, number>>({});
  const tablaRef = useRef<HTMLTableElement | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  // Scroll horizontal real: el contenedor siempre tiene overflow-x: auto, pero solo se
  // desplaza si el contenido lo desborda. Se mide en tiempo real (nunca por el tamaño de la
  // pantalla) y solo entonces se ofrece la chincheta de fijar columna.
  const [hayScrollX, setHayScrollX] = useState(false);

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
  const baseCampos = (esMovil ? (movil ?? (prioritarias ?? columnas).slice(0, 6)) : colsVer).filter((columna) => columnas.includes(columna));
  const campos = baseCampos.filter((columna) => !ocultas.includes(columna));

  // Fijar columnas: se miden sus anchos reales para encadenar los offsets "left" (la fijada
  // más a la izquierda va en 0 y las siguientes se apoyan en el ancho de las anteriores).
  // La clave se serializa porque "campos" es un arreglo nuevo en cada render.
  const claveCampos = campos.join("\u0000");
  useLayoutEffect(() => {
    if (fijadas.length === 0) {
      setAnchosFijadas((previo) => (Object.keys(previo).length === 0 ? previo : {}));
      return;
    }
    const medir = (): void => {
      const ths = tablaRef.current?.querySelectorAll<HTMLTableCellElement>("thead th[data-col]");
      if (!ths || ths.length === 0) return;
      const anchos: Record<string, number> = {};
      let acumulado = 0;
      ths.forEach((th) => {
        const columna = th.dataset.col;
        if (columna && fijadas.includes(columna)) {
          anchos[columna] = acumulado;
          acumulado += th.offsetWidth;
        }
      });
      setAnchosFijadas(anchos);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [claveCampos, fijadas, paginaActual, todas]);

  // Detección del desplazamiento horizontal: se vuelve a medir cuando cambian las columnas,
  // la página, las filas o el tamaño de la ventana, y con un ResizeObserver por si cambia el
  // contenedor (p. ej. al reflujo del diseño). El umbral de 1px evita falsos positivos por
  // redondeo subpíxel.
  const claveDeteccion = `${claveCampos}|${paginaActual}|${todas}|${filas.length}`;
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
  }, [claveDeteccion]);
  // Solo presentación: las columnas de solo cifras se alinean a la derecha (se decide con la página visible).
  const columnasCifra = new Set(campos.filter((columna) => columnaCifra(pagina, columna, formato)));
  // Columnas con texto largo que necesitan más ancho para no partirse en >2 líneas.
  const COLUMNAS_LARGAS = new Set([
    "Facturación que se pierde ($/mes)",
    "Consumo que se pierde (kWh/mes)",
    "Consumía antes (kWh/mes)",
    "Consumían antes (kWh/mes)",
    "Facturaba antes ($/mes)",
    "Facturaban antes ($/mes)",
    "Caída: valor en riesgo / mes",
    "Caída: kWh en riesgo / mes",
  ]);
  const claseDe = (columna: string): string =>
    [
      columna === destacada ? "destacada" : "",
      columnasCifra.has(columna) ? "num" : "",
      fijadas.includes(columna) ? "fijada" : "",
      COLUMNAS_LARGAS.has(columna) ? "th-largo" : "",
    ]
      .filter(Boolean)
      .join(" ");

  // Fijar/soltar una columna: queda pegada al borde izquierdo al desplazar en horizontal.
  const alternarFijada = (columna: string): void => {
    setFijadas((previo) => (previo.includes(columna) ? previo.filter((fijada) => fijada !== columna) : [...previo, columna]));
  };

  // Ordenar haciendo clic en el encabezado: el primer clic ordena por esa columna con el
  // sentido vigente y el siguiente clic lo invierte (mismo estado que el menú "Ordenar y columnas").
  const ordenarPor = (columna: string): void => {
    if (orden === columna) setSentido(sentido === "asc" ? "desc" : "asc");
    else setOrden(columna);
  };

  // Ocultar/mostrar una columna desde el menú: se filtra la lista base, así que una columna
  // restaurada vuelve exactamente a su posición original.
  const alternarColumna = (columna: string): void => {
    setOcultas((previo) => (previo.includes(columna) ? previo.filter((oculta) => oculta !== columna) : [...previo, columna]));
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

  // CSV generado aquí mismo con las filas que se ven (búsqueda y orden aplicados, todas las
  // páginas) y las columnas que se ven en pantalla (las de "Mostrar columnas", respetando
  // "Todas las columnas"). Mismo formato de siempre: csvCelda, separador ";" y salto de
  // línea "\r\n" (el BOM se agrega al descargar). Se arma al pulsar el botón.
  const descargarCsv = (): void => {
    if (!descargar) return;
    const lineas = [campos.join(";")];
    for (const fila of ordenadas) lineas.push(campos.map((columna) => csvCelda(fila[columna])).join(";"));
    const csv = lineas.join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = descargar.archivo;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tabla-pro">
      {(buscar && total > 8) || !sinMenu ? (
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
        <div className="ctl-pops">
          {sinMenu ? null : (
          <Pop etiqueta="Ordenar y columnas">
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
            {baseCampos.length > 1 ? (
              <div className="campo">
                <span>Mostrar columnas</span>
                <div className="v2-check-lista">
                  {baseCampos.map((columna) => {
                    const visible = !ocultas.includes(columna);
                    // Siempre debe quedar al menos una columna visible.
                    return (
                      <label key={columna} className="v2-check">
                        <input
                          type="checkbox"
                          checked={visible}
                          disabled={visible && campos.length === 1}
                          onChange={() => alternarColumna(columna)}
                        />
                        {columna}
                      </label>
                    );
                  })}
                </div>
                {ocultas.length > 0 ? (
                  <button type="button" className="ghost-button" onClick={() => setOcultas([])}>
                    Mostrar todas
                  </button>
                ) : null}
              </div>
            ) : null}
          </Pop>
          )}
        </div>
      </div>
      ) : null}

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
        <div ref={contenedorRef} className="table-card tabla-alta">
          <table ref={tablaRef}>
            <thead>
              <tr>
                {campos.map((columna) => (
                  <th
                    key={columna}
                    data-col={columna}
                    className={claseDe(columna)}
                    style={fijadas.includes(columna) ? { left: anchosFijadas[columna] ?? 0 } : undefined}
                    aria-sort={orden === columna ? (sentido === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="th-cuerpo">
                      <button type="button" className="th-sort" onClick={() => ordenarPor(columna)}>
                        <span>{columna}</span>
                        {/* Indicador de la columna ordenada: triángulo según el sentido. */}
                        <span className="th-sort-flecha" aria-hidden="true">
                          {orden === columna ? (sentido === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                      {/* Chincheta de fijar columna: solo existe si la tabla se desplaza en
                          horizontal de verdad (detectado en runtime, no por pantalla pequeña). */}
                      {hayScrollX ? (
                        <button
                          type="button"
                          className={`th-fijar${fijadas.includes(columna) ? " activo" : ""}`}
                          aria-pressed={fijadas.includes(columna)}
                          aria-label={`Fijar la columna ${columna} a la izquierda`}
                          onClick={() => alternarFijada(columna)}
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
                    <td
                      key={columna}
                      className={claseDe(columna)}
                      style={fijadas.includes(columna) ? { left: anchosFijadas[columna] ?? 0 } : undefined}
                    >
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

/** Menú flotante de la tabla: el cuerpo se despliega sobre la tabla (no la empuja) y se
 *  cierra al pulsar fuera o con Esc, como cualquier desplegable. */
function Pop({ etiqueta, children }: { etiqueta: ReactNode; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alPulsarFuera = (evento: MouseEvent): void => {
      if (ref.current && !ref.current.contains(evento.target as Node)) setAbierto(false);
    };
    const alEsc = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alPulsarFuera);
    document.addEventListener("keydown", alEsc);
    return () => {
      document.removeEventListener("mousedown", alPulsarFuera);
      document.removeEventListener("keydown", alEsc);
    };
  }, [abierto]);

  return (
    <details
      className="v2-pop"
      ref={ref}
      open={abierto}
      onClick={(evento) => {
        if ((evento.target as HTMLElement).closest("summary")) setAbierto((actual) => !actual);
      }}
    >
      <summary className="ghost-button">{etiqueta}</summary>
      <div className="v2-pop-cuerpo">{children}</div>
    </details>
  );
}
