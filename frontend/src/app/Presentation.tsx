import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { enmascarar, MEDIDAS, type Measure } from "../lib/format";

/**
 * Estado de presentación compartido por todas las páginas: medida (Consumo / Facturación),
 * modo "Ocultar NIU y direcciones" y horizonte de proyección. Se guarda en el navegador
 * para que la elección sobreviva a los cambios de página (equivalente a st.session_state).
 */

export const HORIZONTES_PROY: Array<{ label: string; value: number | null }> = [
  { label: "12 meses (recomendado)", value: 12 },
  { label: "24 meses", value: 24 },
  { label: "Todo lo calculado", value: null },
];

type PresentationValue = {
  measure: Measure;
  setMeasure: (measure: Measure) => void;
  hideIds: boolean;
  setHideIds: (value: boolean) => void;
  horizonte: number | null;
  setHorizonte: (value: number | null) => void;
};

const PresentationContext = createContext<PresentationValue | null>(null);

function readStored<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // El navegador puede bloquear el almacenamiento; la sesión sigue funcionando en memoria.
  }
}

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [measure, setMeasureState] = useState<Measure>(() => readStored<Measure>("ebsa_medida", "Consumo", (v): v is Measure => MEDIDAS.includes(v as Measure)));
  const [hideIds, setHideIdsState] = useState<boolean>(() => readStored("ebsa_ocultar_ids", false, (v): v is boolean => typeof v === "boolean"));
  const [horizonte, setHorizonteState] = useState<number | null>(() =>
    readStored<number | null>("ebsa_horizonte", 12, (v) => v === null || typeof v === "number"),
  );

  const setMeasure = useCallback((value: Measure) => {
    setMeasureState(value);
    write("ebsa_medida", value);
  }, []);

  const setHideIds = useCallback((value: boolean) => {
    setHideIdsState(value);
    write("ebsa_ocultar_ids", value);
  }, []);

  const setHorizonte = useCallback((value: number | null) => {
    setHorizonteState(value);
    write("ebsa_horizonte", value);
  }, []);

  const value = useMemo<PresentationValue>(
    () => ({ measure, setMeasure, hideIds, setHideIds, horizonte, setHorizonte }),
    [hideIds, horizonte, measure, setHideIds, setHorizonte, setMeasure],
  );

  useEffect(() => {
    document.documentElement.dataset.medida = measure;
  }, [measure]);

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function usePresentation(): PresentationValue {
  const value = useContext(PresentationContext);
  if (!value) throw new Error("usePresentation debe usarse dentro de PresentationProvider");
  return value;
}

/** Botón Consumo / Facturación. Cambia cifras, unidades y títulos de toda la página. */
export function MeasureSelector({ compact = false }: { compact?: boolean }) {
  const { measure, setMeasure } = usePresentation();
  return (
    <div className="segmented-control" role="radiogroup" aria-label={compact ? "Medir en" : "Cómo medir las cifras"}>
      {!compact && <span className="segmented-label">Cómo medir las cifras</span>}
      {MEDIDAS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={measure === option}
          className={measure === option ? "segmented-option segmented-active" : "segmented-option"}
          onClick={() => setMeasure(option)}
          title="Consumo: energía en kWh, MWh o GWh. Facturación: pesos por mes con la tarifa real de cada cliente. Son los mismos clientes y las mismas listas; cambia la unidad con que se miden."
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Modo presentación: oculta NIU y direcciones en pantalla (las descargas no cambian). */
export function HideIdsToggle() {
  const { hideIds, setHideIds } = usePresentation();
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={hideIds} onChange={(event) => setHideIds(event.target.checked)} />
      <span>Ocultar NIU y direcciones</span>
      <small>Modo presentación: en tablas y fichas se ocultan el NIU y la dirección. Las descargas no cambian.</small>
    </label>
  );
}

/** Muestra un valor de identificación enmascarado cuando el modo presentación está activo. */
export function Sensitive({ value, force = false }: { value: unknown; force?: boolean }) {
  const { hideIds } = usePresentation();
  const text = value === null || value === undefined ? "" : String(value);
  if (!text) return <>—</>;
  return <>{hideIds || force ? enmascarar(text) : text}</>;
}
