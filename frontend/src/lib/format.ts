/**
 * Formato numérico y de negocio de EBSA.
 * Réplica fiel de las utilidades del Streamlit (fmt_n, energia, pesos, fmt_medida,
 * que_revisar, enmascarar) para que las cifras se vean igual en ambas aplicaciones.
 */

export type Measure = "Consumo" | "Facturación";

export const MEDIDAS: Measure[] = ["Consumo", "Facturación"];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Número con punto de miles y coma decimal colombianos: 4.025.507 / 15,5. */
export function fmtN(value: number | null | undefined, dec = 0): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const text = Number(value).toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return text;
}

/** Energía con la unidad de la escala: 7.291 kWh · 2.812,6 MWh · 2,74 GWh. */
export function energia(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const v = Number(value);
  if (Math.abs(v) < 1e5) return fmtN(v) + " kWh";
  if (Math.abs(v) < 1e6) return fmtN(v / 1e3, 1) + " MWh";
  return fmtN(v / 1e6, 2) + " GWh";
}

/** Como energia() sin decimales en MWh, para barras y bandas. */
export function energiaCorta(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const v = Number(value);
  if (Math.abs(v) < 1e5) return fmtN(v) + " kWh";
  if (Math.abs(v) < 1e6) return fmtN(v / 1e3) + " MWh";
  return fmtN(v / 1e6, 2) + " GWh";
}

export function pesos(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return "$" + fmtN(value);
}

/** $674,8 M · $2.146 M (millones de pesos). */
export function pesosMillones(value: number | null | undefined, dec?: number): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const m = Number(value) / 1e6;
  const digits = dec ?? (Math.abs(m) >= 1000 ? 0 : 1);
  return "$" + fmtN(m, digits) + " M";
}

/** Cifra en la medida elegida: 2,74 GWh o $2.146.230.035. */
export function fmtMedida(value: number | null | undefined, measure: Measure): string {
  return measure === "Consumo" ? energia(value) : pesos(value);
}

/** Versión corta para bandas y barras: 2,74 GWh o $674,8 M. */
export function fmtMedidaCorto(value: number | null | undefined, measure: Measure): string {
  return measure === "Consumo" ? energiaCorta(value) : pesosMillones(value);
}

export function unidadMedida(measure: Measure): "kWh/mes" | "$/mes" {
  return measure === "Consumo" ? "kWh/mes" : "$/mes";
}

/** Elige la columna según la medida activa (col_medida del Streamlit). */
export function colMedida(colKwh: string, colPesos: string, measure: Measure): string {
  return measure === "Consumo" ? colKwh : colPesos;
}

/** Título de una cifra según la medida (para KPIs y explicaciones). */
export function etiquetaMedida(measure: Measure, kwhLabel: string, pesosLabel: string): string {
  return measure === "Consumo" ? kwhLabel : pesosLabel;
}

export function mesLargo(value: unknown): string {
  const text = String(value ?? "").slice(0, 7);
  const month = Number(text.slice(5, 7));
  if (text.length !== 7 || !month) return String(value ?? "—");
  return `${MESES[month - 1]} de ${text.slice(0, 4)}`;
}

export function mesCorto(value: unknown): string {
  const text = String(value ?? "").slice(0, 7);
  const month = Number(text.slice(5, 7));
  if (text.length !== 7 || !month) return String(value ?? "—");
  return `${MESES_CORTOS[month - 1]} ${text.slice(0, 4)}`;
}

/** str.title() de Python: capitaliza la primera letra de cada palabra (para zonas y provincias). */
export function tituloPropio(texto: string): string {
  return texto.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_coincidencia, espacio: string, letra: string) => espacio + letra.toUpperCase());
}

export function fechaCo(value: unknown): string {
  const text = String(value ?? "");
  if (!text || text === "None" || text === "null") return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

/** NIU o dirección en modo presentación: ••• + últimos 3 caracteres. */
export function enmascarar(value: unknown): string {
  const text = String(value ?? "");
  if (text === "" || text === "—" || text === "nan" || text === "None" || text === "<NA>") return text;
  return text.length > 4 ? "•••" + text.slice(-3) : "•••";
}

export const COLUMNAS_SENSIBLES = ["niu", "dirección", "direccion", "usuario"];

// ---------------------------------------------------------------------------
// Detección de columnas: números, dinero, energía, identificadores.
// ---------------------------------------------------------------------------

/** Columnas que no llevan separador de miles (códigos, años, ciclos...). */
const SIN_MILES = ["niu", "año", "anio", "ciclo", "estrato", "codigo", "código", "horizonte", "cluster", "mes", "id"];

export function esColumnaNumericaSinMiles(name: string): boolean {
  const lower = String(name).toLowerCase();
  if (SIN_MILES.some((piece) => lower === piece || lower.startsWith(piece + "_") || lower.endsWith("_" + piece))) return true;
  return /^(19|20)\d{2}$/.test(lower);
}

const MONEY_HINTS = ["valor", "precio", "factura", "tarifa", "costo", "pesos", "$", "total_pesos", "ingreso"];

/** ¿La columna mide dinero? (valor_riesgo_mes, facturación...). */
export function esColumnaDinero(name: string): boolean {
  const lower = String(name).toLowerCase();
  if (lower.includes("kwh")) return false;
  return MONEY_HINTS.some((piece) => lower.includes(piece));
}

/** ¿La columna mide energía? (kwh, mwh, gwh). */
export function esColumnaEnergia(name: string): boolean {
  const lower = String(name).toLowerCase();
  return lower.includes("kwh") || lower.includes("mwh") || lower.includes("gwh");
}

export function esColumnaSensible(name: string): boolean {
  return COLUMNAS_SENSIBLES.includes(String(name).toLowerCase());
}

/** Formato de celda en tablas: números, dinero, energía o texto. */
export function formatCelda(value: unknown, columnName: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    if (esColumnaNumericaSinMiles(columnName)) return fmtN(value);
    if (esColumnaDinero(columnName)) return pesos(value);
    if (esColumnaEnergia(columnName)) return energia(value);
    const decimales = Number.isInteger(value) ? 0 : 2;
    return fmtN(value, decimales);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return fechaCo(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Tablas del Streamlit (formato_tabla y csv_es): mismas pistas de columnas.
// ---------------------------------------------------------------------------

const PISTAS_KWH = ["kwh", "consumo"];
const PISTAS_PESOS = ["valor", "perdida", "pérdida", "factura", "$", "pesos", "tarifa_kwh"];

/**
 * Formato de celda de las tablas de trabajo, idéntico a formato_tabla del Streamlit: la tarifa con un decimal,
 * las columnas de energía en kWh con punto de miles y las de pesos con $; el resto es número local.
 * Los decimales de energía se deciden mirando la columna entera (si todos sus valores son enteros, sin decimales).
 */
export function formatoTabla(
  filas: Array<Record<string, unknown>>,
  columnas: string[],
): (valor: unknown, columna: string) => string {
  const decimales: Record<string, number> = {};
  for (const columna of columnas) {
    const nombre = columna.toLowerCase();
    if (!PISTAS_KWH.some((pista) => nombre.includes(pista)) || nombre.includes("$")) continue;
    const numeros = filas.map((fila) => Number(fila[columna])).filter((numero) => Number.isFinite(numero));
    decimales[columna] = numeros.length > 0 && numeros.every((numero) => Number.isInteger(numero)) ? 0 : 1;
  }
  return (valor, columna) => {
    if (valor === null || valor === undefined) return "—";
    if (typeof valor === "number" && Number.isFinite(valor)) {
      const nombre = columna.toLowerCase();
      if (nombre.includes("tarifa")) return `$${fmtN(valor, 1)}`;
      if (PISTAS_KWH.some((pista) => nombre.includes(pista)) && !nombre.includes("$")) return fmtN(valor, decimales[columna] ?? 0);
      if (PISTAS_PESOS.some((pista) => nombre.includes(pista))) return `$${fmtN(valor)}`;
      return fmtN(valor);
    }
    return String(valor);
  };
}

/** Celda de un CSV para Excel en español (csv_es): separador ';' y coma decimal, sin punto de miles. */
export function csvCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(valor).replace(".", ",");
  return String(valor);
}

/** Probabilidad en %, con decimales suficientes para que 0,004 % no se lea como 0,0 % (prob_pct). */
export function probPct(probabilidad: unknown): string {
  const valor = Number(probabilidad ?? Number.NaN);
  if (Number.isNaN(valor)) return "—";
  const pct = valor * 100;
  if (pct >= 1) return `${fmtN(pct, 1)} %`;
  if (pct >= 0.01) return `${fmtN(pct, 2)} %`;
  return pct > 0 ? "< 0,01 %" : "0 %";
}

// ---------------------------------------------------------------------------
// Regla de negocio: "Qué revisar" (sugerencia en lenguaje simple para soporte).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function texto(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value);
  }
  return "";
}

export function queRevisar(fila: Row): string {
  const t = texto(fila, "trayectoria");
  const sev = texto(fila, "gravedad", "severidad");
  const clase = texto(fila, "clase_servicio_nombre", "clase_servicio").toLowerCase();
  const partes: string[] = [];

  if (texto(fila, "prioridad_gestion") === "VIGILAR: estacional") {
    return "Cliente estacional: ya estuvo en cero en temporadas anteriores y volvió, y el modelo prevé que vuelva a consumir. No requiere visita; confirmar con el cliente cuándo reanuda actividad.";
  }

  const antigua = texto(fila, "veredicto") === "CAIDA_SOSTENIDA";
  if (antigua && t === "CAIDA_ACELERANDO") {
    partes.push("La caída lleva meses y el modelo prevé que siga bajando: no es urgente, pero conviene revisarlo primero dentro del seguimiento y confirmar qué cambió.");
  } else if (t === "CAIDA_ACELERANDO") {
    partes.push("El consumo viene bajando y el modelo prevé que siga bajando: conviene contactar pronto.");
  } else if (antigua && t === "SIN_RECUPERACION_PREVISTA") {
    partes.push("La caída no es de ahora: bajó hace meses frente al año pasado y se quedó en ese nivel. No es urgente; en el próximo contacto, confirmar qué cambió (actividad, equipos, ocupación del predio).");
  } else if (t === "SIN_RECUPERACION_PREVISTA") {
    partes.push("El consumo bajó y se mantiene en ese nivel: preguntar si cambió la actividad, el horario o los equipos.");
  } else if (t === "RECUPERACION_PREVISTA") {
    partes.push("El consumo bajó pero el modelo espera que vuelva: vigilar; no hace falta visita todavía.");
  }

  if (sev === "CRITICA") {
    partes.push("La caída es grave frente a clientes parecidos: revisar medidor, lectura y posibles fallas antes de dar por buena la cifra.");
  }
  if (clase.includes("industrial") || clase.includes("comercial")) {
    partes.push("Cliente de negocio: una caída así suele ser cambio de actividad, cierre parcial, autogeneración o paso a otro comercializador.");
  }
  if (clase.includes("oficial")) {
    partes.push("Entidad oficial: verificar si hubo cierre temporal, traslado o cambio de sede.");
  }
  return partes.join(" ") || "Revisar la lectura y el consumo reciente con el cliente.";
}

/** NIU limpio tal como lo escribe o pega el usuario: sin espacios ni el '.0' que añade Excel. */
export function limpiarNiu(value: unknown): string {
  let text = String(value ?? "").trim();
  if (text.endsWith(".0") && /^\d+$/.test(text.slice(0, -2))) text = text.slice(0, -2);
  return text;
}
