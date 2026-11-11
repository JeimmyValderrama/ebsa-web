import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Menú lateral de secciones (equivalente a ui.menu_lateral del Streamlit).
 *
 * La página activa "publica" sus grupos de secciones y el elemento seleccionado;
 * App dibuja ese menú en la barra lateral (y en la franja inferior del celular).
 * Los grupos deben ser constantes de módulo: si se recrean en cada render, el
 * efecto volvería a publicar y la app entraría en un ciclo de renders.
 */

export type NavItem<K extends string = string> = { clave: K; etiqueta: string };
export type NavGroup<K extends string = string> = { nombre: string; items: Array<NavItem<K>> };

type Registro = { grupos: NavGroup[]; actual: string; elegir: (clave: string) => void };

const SectionNavContext = createContext<{ registro: Registro | null; publicar: (registro: Registro | null) => void } | null>(null);

export function SectionNavProvider({ children }: { children: ReactNode }) {
  const [registro, setRegistro] = useState<Registro | null>(null);
  const value = useMemo(() => ({ registro, publicar: setRegistro }), [registro]);
  return <SectionNavContext.Provider value={value}>{children}</SectionNavContext.Provider>;
}

/** Sección que la barra lateral debe marcar como activa (null si la página no tiene menú). */
export function useSectionState(): Registro | null {
  const ctx = useContext(SectionNavContext);
  if (!ctx) throw new Error("useSectionState debe usarse dentro de SectionNavProvider");
  return ctx.registro;
}

/** Publica los grupos de la página actual. `grupos` debe ser una constante de módulo. */
export function useSectionNav<K extends string>(
  grupos: Array<NavGroup<K>>,
  actual: K,
  elegir: (clave: K) => void,
): void {
  const ctx = useContext(SectionNavContext);
  if (!ctx) throw new Error("useSectionNav debe usarse dentro de SectionNavProvider");
  const { publicar } = ctx;
  useEffect(() => {
    publicar({ grupos, actual, elegir: elegir as (clave: string) => void });
    // Al cambiar de sección, la página nueva arranca desde arriba (si no, el scroll
    // anterior deja al usuario en una posición arbitraria del contenido nuevo).
    window.scrollTo({ top: 0 });
    return () => publicar(null);
  }, [grupos, actual, elegir, publicar]);
}
