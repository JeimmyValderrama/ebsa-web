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
