import { mesLargo } from "../../lib/format";

/**
 * Textos largos que se repiten en varias páginas del Streamlit (app_ebsa_v2.py),
 * para que la redacción sea literalmente la misma en la web.
 */

export const QUE_ES_ESTO =
  "**Qué es esto.** El sistema lee cada mes los archivos TC2 de la empresa y hace tres cosas: (1) **detecta clientes cuyo consumo cayó** más de lo normal "
  + "para clientes parecidos y los ordena por la facturación que se está perdiendo, para que el área comercial y las cuadrillas sepan a quién revisar primero; "
  + "(2) **estima la probabilidad de fuga** de cada cliente a otro comercializador en los próximos seis meses; (3) **pronostica el consumo** de cada cliente "
  + "a seis meses. El valor en pesos siempre usa la tarifa real del cliente, nunca una tarifa supuesta.";

export const NOTA_REGLAS_LISTA =
  "Las listas no incluyen autogeneradores ni las clases área común, autoconsumos EBSA, distritos de riego y provisionales (regla de negocio acordada con el experto). "
  + "El valor en pesos usa la tarifa real de cada cliente.";

export const NOTA_CERO_SOSTENIDO =
  "Aparte de las caídas, los clientes que llevan 3 meses o más en cero o casi cero no se cuentan como caída porque ya no consumen; están en la sección *Clientes sin consumo*.";

/** _periodo_texto(): mes facturado de cada zona (el rural va un trimestre atrás). */
export function periodoTexto(cortes: Record<string, string>): string {
  return `Periodo facturado: **urbano ${mesLargo(cortes.URBANO || "—")}** · **rural ${mesLargo(cortes.RURAL || "—")}** `
    + "(los rurales se leen por trimestres, por eso su periodo puede ir un par de meses atrás).";
}

/** TRAYECTORIA_TEXTO: qué significa cada trayectoria del pronóstico (expander del Resumen). */
export const TRAYECTORIA_TEXTO: Record<string, string> = {
  CAIDA_ACELERANDO: "El modelo prevé que el mes que viene siga bajando. Máxima urgencia.",
  SIN_RECUPERACION_PREVISTA: "El modelo no prevé cambio mayor a su propio error: se queda en el nivel caído.",
  RECUPERACION_PREVISTA: "El modelo prevé que vuelva. Vigilar, no despachar.",
  NO_EVALUABLE_RURAL: "Rural excluido de trayectoria por sesgo del pronóstico en el borde.",
  SIN_PRONOSTICO: "El cliente no tiene fila en el pronóstico (historia insuficiente).",
};

/** NIVEL_FUGA_TEXTO: qué significa cada nivel de riesgo de fuga (expander de la lista de fuga). */
export const NIVEL_FUGA_TEXTO: Record<string, string> = {
  ALTO: "Está en el 1 % de clientes con mayor puntaje del modelo (y por encima del riesgo promedio). Contactar primero.",
  MEDIO: "Está entre el 1 % y el 5 % con mayor puntaje del modelo. Vigilar y contactar según valor.",
  BAJO: "Sin señales por encima de la población.",
};

/** ORDEN_SEVERIDAD: orden en que el Streamlit enumera la severidad de la caída. */
export const ORDEN_SEVERIDAD = ["CRITICA", "FUERTE", "MODERADA"];

/** Bajada de la tarjeta de severidad (Resumen y Gestión por ciclo). */
export const BAJADA_SEVERIDAD =
  "Severidad relativa al segmento: CRITICA ≥ 2 escalas por encima del umbral, FUERTE ≥ 1, MODERADA el resto";
