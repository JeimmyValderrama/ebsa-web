/**
 * Paleta y constantes de color del Streamlit original.
 * Réplica de C (componentes_v2.py) y de ZONA_MAPA_COLOR / RAMPA_MAPA / AZUL / NARANJA (app_ebsa_v2.py),
 * para que las gráficas y el mapa salgan con los mismos colores en ambas aplicaciones.
 */

export const C = {
  carbon: "#232322", carbon2: "#33332f", tinta: "#1d1d1b", tinta2: "#55584f", tinta3: "#7b7e75",
  plano: "#f1f2ee", sup: "#ffffff", linea: "#dcdfd6", linea2: "#eceee8",
  marca: "#ffc629",
  gestionar: "#eb6834", seguimiento: "#2a78d6", vigilar: "#1baf7a", vigilar_osc: "#12855c", mudo: "#9a9d96",
  naranja_claro: "#f2a65a", azul_osc: "#1b3a6b",
  bien: "#0a7d0a", bien_f: "#e5f3e3", aviso: "#8a5a00", aviso_f: "#fdf0cf",
  alerta: "#b3261e", alerta_f: "#fbe6e3", neutro_f: "#edeee9",
} as const;

/** Azul de "seguimiento" y naranja de "gestión": los dos colores de las series del Streamlit. */
export const AZUL = C.seguimiento;
export const NARANJA = C.gestionar;

/** Rampa del mapa: de claro a oscuro, un solo tono (más = más oscuro). */
export const RAMPA_MAPA = ["#fdeee4", "#f8c4a4", "#f0925f", "#e0632a", "#a8431a"];

/** Municipios de zonas no elegidas. */
export const GRIS_FUERA = "#e6e8e1";

/** Color de cada zona EBSA en el mapa (misma paleta del mapa de zonas de la empresa). */
export const ZONA_MAPA_COLOR: Record<string, string> = {
  CENTRO: "#F2C94C", TUNDAMA: "#F08BC7", SUGAMUXI: "#4F6FD1", OCCIDENTE: "#8BC34A",
  ORIENTE: "#EF5B5B", NORTE: "#3CB8A3", RICAURTE: "#4FB8F0", "PUERTO BOYACA": "#F2994A",
};

/** Caja geográfica y centro de Boyacá (para el respaldo con círculos sobre fondo de internet). */
export const BOYACA_LIMITES = { west: -74.75, east: -71.85, south: 4.35, north: 7.15 };
export const BOYACA_CENTRO = { lat: 5.62, lon: -73.35 };

/** Color por defecto de un municipio sin zona conocida. */
export const COLOR_ZONA_SIN_ZONA = "#b9bcb3";

/** Azul de los municipios sin dato en el mapa de caídas de la versión anterior. */
export const GRIS_ANTIGUA = "#9aa0a6";

/** Gravedad simple que se muestra a negocio (gravedad de limpiar_lista; "ANTIGUA" viene de una caída sostenida). */
export const SEVERIDAD_SIMPLE: Record<string, string> = {
  CRITICA: "Grave",
  FUERTE: "Fuerte",
  MODERADA: "Moderada",
  ANTIGUA: "Antigua (lleva meses así)",
};

/** Color de cada gravedad, con las dos formas de nombrarla (COLOR_GRAVEDAD del Streamlit). */
export const COLOR_GRAVEDAD: Record<string, string> = {
  Grave: NARANJA,
  Fuerte: C.naranja_claro,
  Moderada: AZUL,
  "Antigua (lleva meses así)": GRIS_ANTIGUA,
  CRITICA: NARANJA,
  FUERTE: C.naranja_claro,
  MODERADA: AZUL,
};
