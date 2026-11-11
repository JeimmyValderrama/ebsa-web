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

/** Qué significa cada estado del archivo de otros comercializadores (ESTADO_OTRO_TEXTO del Streamlit). */
export const ESTADO_OTRO_TEXTO: Record<string, string> = {
  "CON OTRO COMERCIALIZADOR": "Aparece en el último mes del archivo de otros comercializadores.",
  "REGRESÓ A EBSA": "Dejó de aparecer en el archivo de otros y vuelve a tener consumo en TC2.",
  "SIN HISTORIA EN TC2 (se fue antes de la historia)": "No hay filas suyas en TC2: se cambió antes de 2022 o nunca fue facturado por EBSA.",
  "SALIÓ DEL ARCHIVO DE OTROS (verificar)": "Ya no está en el archivo de otros pero tampoco consume en TC2.",
};

export const ZONAS_REGIONALES = ["CENTRO", "TUNDAMA", "SUGAMUXI", "OCCIDENTE", "ORIENTE", "NORTE", "RICAURTE", "PUERTO BOYACA"];

/** ZONA_POR_CICLO del glosario (hojas COLUMNA BR/BT): nombre de cada ciclo de lectura. */
export const ZONA_POR_CICLO: Record<number, string> = {
  0: "CENTRO",
  1: "TUNDAMA",
  2: "SUGAMUXI",
  3: "OCCIDENTE",
  4: "ORIENTE",
  5: "NORTE",
  6: "RICAURTE",
  7: "PUERTO BOYACA",
  9: "CENTRO (SECCIONALES - URBANO)",
  10: "CENTRO RURAL",
  11: "TUNDAMA RURAL",
  12: "SUGAMUXI RURAL",
  13: "ORIENTE RURAL",
  15: "ALUMBRADO PUBLICO",
  19: "CENTRO (SECCIONALES - RURAL)",
  21: "NORTE RURAL",
  22: "OCCIDENTE RURAL",
  23: "RICAURTE RURAL",
  33: "USUARIOS NO REGULADOS",
  38: "PUERTO BOYACA RURAL",
  50: "AUTOGENERADORES",
  90: "SERVICIOS EBSA",
  91: "ARRENDAMIENTO INMUEBLES",
  94: "OTROS SERVICIOS",
  96: "ARRENDAMIENTO INFRAESTRUCTURA",
  97: "OTROS COMERCIALIZADORES",
  98: "AREAS DE DISTRIBUCION",
  99: "CARGOS PARA EL USO DEL STR",
};

/** '0' -> '00 — CENTRO' (etiqueta_ciclo del Streamlit: dos dígitos y el nombre del glosario). */
export function etiquetaCiclo(ciclo: unknown): string {
  const texto = String(ciclo ?? "");
  if (!texto || texto === "nan" || texto === "None") return "—";
  const numero = Number.parseInt(texto, 10);
  if (Number.isNaN(numero)) return texto;
  return `${String(numero).padStart(2, "0")} — ${ZONA_POR_CICLO[numero] ?? "sin nombre en glosario"}`;
}

export const GRUPOS_CONSUMO_ORDEN = ["Grande", "Mediano", "Pequeño", "Intermitente", "Sin historia suficiente"];

/** Qué define a cada grupo de consumo (GRUPO_CONSUMO_DESCRIPCION del glosario). */
export const GRUPO_CONSUMO_DESCRIPCION: Record<string, string> = {
  Intermitente: "Mediana de 12 meses ≤ 10 kWh o la mitad o más de los meses en cero",
  Pequeño: "Mediana de 12 meses entre 10 y 500 kWh/mes",
  Mediano: "Mediana de 12 meses entre 500 y 5.000 kWh/mes",
  Grande: "Mediana de 12 meses de 5.000 kWh/mes o más",
  "Sin historia suficiente": "Menos de 6 meses válidos en el último año (no se pronostica)",
};

/** Código de perfil del pronóstico a su nombre de negocio (GRUPO_CONSUMO_NOMBRE del glosario). */
export const GRUPO_CONSUMO_NOMBRE: Record<string, string> = {
  P0_INTERMITENTE: "Intermitente",
  P1_REGULAR: "Pequeño",
  P2_ALTO: "Mediano",
  P3_GRANDE: "Grande",
  P4_INSUFICIENTE: "Sin historia suficiente",
};

/** Qué significa cada veredicto del estudio de caída (VEREDICTO_TEXTO del Streamlit). */
export const VEREDICTO_TEXTO: Record<string, string> = {
  CAIDA_CONFIRMADA: "Cae frente al periodo anterior Y frente al mismo periodo del año pasado.",
  CAIDA_SOSTENIDA: "Ya venía bajo frente al año pasado y sigue ahí.",
  CAIDA_RECIENTE: "Cae frente al periodo anterior, pero no frente al año pasado.",
  SIN_CAIDA: "No cumple el criterio de caída de su segmento.",
  SIN_BASE_COMPARABLE: "No hay periodo anterior con dato suficiente.",
  NO_APLICA: "Segmento sin consumo o sin datos: no se evalúa.",
  NO_EVALUADO: "No alcanzó a evaluarse en la ventana.",
};

export const AYUDA_MUNICIPIO = "Si hay una zona regional elegida, aquí solo aparecen los municipios de esa zona.";
export const AYUDA_ZONA_REGIONAL = "Agrupa el ciclo urbano, el rural y los seccionales de una misma dirección regional";

/* ---------- Clientes sin consumo (sección "Clientes sin consumo") ---------- */

export const SITUACION_CERO = ["En cero", "Casi cero"];

export const TRAMOS_CERO = ["Hasta 6 meses", "7 a 12 meses", "Más de 12 meses"];

/** Qué hacer según cuánto tiempo lleve sin consumo (np.select de la sección del Streamlit). */
export const QUE_HACER_CERO: Record<string, string> = {
  "Hasta 6 meses": "Confirmar: suspensión o predio desocupado que puede volver",
  "7 a 12 meses": "Verificar el estado del servicio y si procede la reconexión",
  "Más de 12 meses": "Retiro de hecho: depurar catastro o gestionar reconexión",
};

/** Tramo de tiempo sin consumo; sin meses (nunca consumió en la serie) cuenta como más de 12 meses. */
export function tramoCero(meses: number | null | undefined): string {
  if (meses === null || meses === undefined || Number.isNaN(meses)) return "Más de 12 meses";
  if (meses <= 6) return "Hasta 6 meses";
  if (meses <= 12) return "7 a 12 meses";
  return "Más de 12 meses";
}

/** Tamaño por lo que consumía antes: 5.000 kWh o más es grande, 500 o más mediano. */
export function tamanoPorConsumo(referenciaKwh: number): string {
  if (referenciaKwh >= 5000) return "Grande";
  if (referenciaKwh >= 500) return "Mediano";
  return "Pequeño";
}

/** Situación en la ventana reciente: en cero si no consumió nada; si no, casi cero. */
export function situacionCero(consumoRecienteKwh: number): string {
  return consumoRecienteKwh <= 0 ? "En cero" : "Casi cero";
}

/** Traduce un código a su etiqueta de negocio (si no hay traducción, se queda el código). */
export function etiqueta(mapa: Record<string, string>, valor: unknown): string {
  const clave = String(valor ?? "");
  return mapa[clave] ?? (clave || "—");
}
