/**
 * Etiquetas en lenguaje de negocio del Streamlit (app_ebsa_v2.py, "Textos en lenguaje de negocio").
 * La API devuelve los códigos crudos (GESTIONAR, CAIDA_SOSTENIDA…); aquí se traducen a lo que lee Comercial.
 */

export const PRIORIDAD_SIMPLE: Record<string, string> = {
  GESTIONAR: "Gestionar",
  "SEGUIMIENTO: caída antigua": "Seguimiento: lleva meses así",
  "VIGILAR: se espera recuperación": "Vigilar: se espera recuperación",
  "VIGILAR: estacional": "Vigilar: estacional (temporada baja)",
};

/** Orden recomendado de la lista de caída: primero lo que hay que gestionar, después vigilar. */
export const ORDEN_PRIORIDAD: Record<string, number> = {
  GESTIONAR: 0,
  "SEGUIMIENTO: caída antigua": 1,
  "VIGILAR: se espera recuperación": 2,
  "VIGILAR: estacional": 3,
};

export const TIPO_CAIDA_SIMPLE: Record<string, string> = {
  CAIDA_CONFIRMADA: "Reciente",
  CAIDA_SOSTENIDA: "Lleva meses así",
};

export const TRAYECTORIA_SIMPLE: Record<string, string> = {
  CAIDA_ACELERANDO: "Se prevé que baje más",
  SIN_RECUPERACION_PREVISTA: "Se quedó en el nivel bajo",
  RECUPERACION_PREVISTA: "Se espera que se recupere",
  SIN_PRONOSTICO: "Sin pronóstico",
};

export const ESTADO_LISTA_SIMPLE: Record<string, string> = {
  NUEVO: "Nuevo este mes",
  PERSISTENTE: "Sigue desde el corte anterior",
  REINCIDENTE: "Ya había estado antes",
};

export const NIVEL_FUGA_SIMPLE: Record<string, string> = {
  ALTO: "Alto: contactar primero",
  MEDIO: "Medio: vigilar y contactar según valor",
  BAJO: "Bajo",
};

export const GRUPOS_CONSUMO_ORDEN = ["Grande", "Mediano", "Pequeño", "Intermitente", "Sin historia suficiente"];

export const AYUDA_MUNICIPIO = "Si hay una zona regional elegida, aquí solo aparecen los municipios de esa zona.";
export const AYUDA_ZONA_REGIONAL = "Agrupa el ciclo urbano, el rural y los seccionales de una misma dirección regional";

/** Traduce un código a su etiqueta de negocio (si no hay traducción, se queda el código). */
export function etiqueta(mapa: Record<string, string>, valor: unknown): string {
  const clave = String(valor ?? "");
  return mapa[clave] ?? (clave || "—");
}
