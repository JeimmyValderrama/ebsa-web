import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { fmtN } from "../../lib/format";

/**
 * Filtros de lista del Streamlit (ui.filtros): un desplegable "Filtros · N activos" con los campos
 * en filas de cuatro, el control propio de la sección (el extra) y el botón de restablecer.
 */

export interface CampoFiltro {
  key: string;
  etiqueta: string;
  opciones: string[];
  defecto?: string[];
  formato?: (valor: string) => string;
  ayuda?: string;
  vacio?: string;
  visible?: boolean;
}

/** Multiselect: etiqueta, chips con lo elegido y menú con las opciones (st.multiselect). */
export function Multiselect({
  etiqueta,
  opciones,
  valor,
  onChange,
  ayuda,
  vacio = "Todos",
  formato,
}: {
  etiqueta: string;
  opciones: string[];
  valor: string[];
  onChange: (valor: string[]) => void;
  ayuda?: string;
  vacio?: string;
  formato?: (valor: string) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (evento: MouseEvent): void => {
      if (!caja.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const alPulsarEsc = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alPulsarEsc);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alPulsarEsc);
    };
  }, [abierto]);

  const mostrar = formato ?? ((opcion: string) => opcion);
  const alternar = (opcion: string): void =>
    onChange(valor.includes(opcion) ? valor.filter((v) => v !== opcion) : [...valor, opcion]);

  return (
    <div className="campo" ref={caja}>
      <span id={tituloId}>
        {etiqueta}
        {ayuda ? (
          <span className="ayuda-info" data-t={ayuda} aria-label={ayuda}>
            i
          </span>
        ) : null}
      </span>
      <div className="v2-multiselect">
        {valor.map((opcion) => (
          <span key={opcion} className="v2-chip activo">
            {mostrar(opcion)}
            <button
              type="button"
              className="chip-x"
              aria-label={`Quitar ${mostrar(opcion)}`}
              onClick={() => onChange(valor.filter((v) => v !== opcion))}
            >
              ×
            </button>
          </span>
        ))}
        {!valor.length && <em>{vacio}</em>}
        <button
          type="button"
          className="v2-ms-btn"
          aria-expanded={abierto}
          aria-controls={menuId}
          aria-label={`Elegir ${etiqueta}`}
          onClick={() => setAbierto((actual) => !actual)}
        >
          ▾
        </button>
      </div>
      {abierto && (
        <div className="v2-menu" id={menuId} role="group" aria-labelledby={tituloId}>
          {opciones.length === 0 && <p>No hay opciones con los filtros actuales.</p>}
          {opciones.map((opcion) => (
            <label key={opcion} className={valor.includes(opcion) ? "activo" : ""}>
              <input type="checkbox" checked={valor.includes(opcion)} onChange={() => alternar(opcion)} />
              <span>{mostrar(opcion)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Deslizador de cuántos incluir (st.slider). */
export function Deslizador({
  etiqueta,
  min,
  max,
  step,
  valor,
  onChange,
  ayuda,
}: {
  etiqueta: string;
  min: number;
  max: number;
  step: number;
  valor: number;
  onChange: (valor: number) => void;
  ayuda?: string;
}) {
  return (
    <div className="campo">
      <span>
        {etiqueta}
        {ayuda ? (
          <span className="ayuda-info" data-t={ayuda} aria-label={ayuda}>
            i
          </span>
        ) : null}
      </span>
      <div className="v2-slider">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valor}
          onChange={(evento) => onChange(Number(evento.target.value))}
        />
        <b>{fmtN(valor)}</b>
      </div>
    </div>
  );
}

/** Panel de filtros: expander con los campos, el control extra de la sección y el botón de restablecer. */
export function PanelFiltros({
  campos,
  valores,
  onChange,
  extra,
  alRestablecer,
  movil,
  porFila = 4,
}: {
  campos: CampoFiltro[];
  valores: Record<string, string[]>;
  onChange: (key: string, valor: string[]) => void;
  extra?: ReactNode;
  alRestablecer?: () => void;
  movil?: boolean;
  /** Cuántos filtros entran por fila (por_fila del Streamlit). */
  porFila?: number;
}) {
  const visibles = campos.filter((campo) => campo.visible !== false && campo.opciones.length > 0);
  const activos = visibles.filter((campo) => (valores[campo.key] ?? []).length > 0);
  const cambiados = visibles.filter(
    (campo) => JSON.stringify(valores[campo.key] ?? []) !== JSON.stringify(campo.defecto ?? []),
  );
  const restablecer = (): void => {
    visibles.forEach((campo) => onChange(campo.key, campo.defecto ?? []));
    alRestablecer?.();
  };
  return (
    <>
      <details className="v2-exp" open={!movil}>
        <summary>
          Filtros · {activos.length ? `${activos.length} activo${activos.length === 1 ? "" : "s"}` : "ninguno activo"}
        </summary>
        <div className="v2-exp-cuerpo">
          <div className={porFila > 4 ? "filtros-grid filtros-5" : "filtros-grid"}>
            {visibles.map((campo) => (
              <Multiselect
                key={campo.key}
                etiqueta={campo.etiqueta}
                opciones={campo.opciones}
                valor={valores[campo.key] ?? []}
                onChange={(valor) => onChange(campo.key, valor)}
                ayuda={campo.ayuda}
                vacio={campo.vacio}
                formato={campo.formato}
              />
            ))}
          </div>
          {extra}
          <div className="filtros-pie">
            <button
              type="button"
              className="ghost-button"
              disabled={!cambiados.length}
              title="Vuelve a dejar los filtros como al abrir la sección"
              onClick={restablecer}
            >
              Restablecer filtros
            </button>
            <p>
              {cambiados.length
                ? `Cambiaste: ${cambiados.map((campo) => campo.etiqueta.toLowerCase()).join(", ")}.`
                : "Filtros como al abrir la sección. Un filtro vacío incluye todo."}
            </p>
          </div>
        </div>
      </details>
      {movil && activos.length > 0 && (
        <p className="v2-caption">
          Filtros activos:{" "}
          {activos
            .map((campo) => {
              const elegidos = valores[campo.key] ?? [];
              const mostrados = elegidos.slice(0, 3).map((valor) => (campo.formato ?? String)(valor)).join(", ");
              return `${campo.etiqueta}: ${mostrados}${elegidos.length > 3 ? "…" : ""}`;
            })
            .join(" · ")}
        </p>
      )}
    </>
  );
}
