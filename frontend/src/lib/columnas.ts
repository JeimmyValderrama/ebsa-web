/**
 * Etiquetas de encabezados de tabla y caja de frase (uniformidad de la interfaz).
 *
 * Reglas acordadas:
 *  - Caja de frase: primera palabra con mayúscula, resto minúsculas; las siglas y
 *    unidades conservan su forma (NIU, kWh, GWh, CSV, TC1, %).
 *  - Los badges (SUGERENCIA, CALIDAD DE LOS DATOS…) y los valores de celda NO se tocan.
 *  - Solo se transforma la PRESENTACIÓN del encabezado: los CSV y el ordenamiento
 *    siguen usando la clave cruda (esto vive únicamente en el render de las tablas).
 */

/** Primera letra en mayúscula si es minúscula; no toca nada más (seguro con siglas). */
export function capitalizarPrimera(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Etiquetas legibles para las claves técnicas (snake_case) que llegan de la API. */
const ETIQUETAS: Record<string, string> = {
  // --- gestión / ranking / fuga (listas del administrador) ---
  orden_en_ciclo: "Orden en el ciclo",
  ciclo_etiqueta: "Ciclo",
  zona_regional: "Zona regional",
  zona_nombre: "Zona del ciclo",
  clase_servicio_nombre: "Clase de servicio",
  grupo_consumo: "Grupo de consumo",
  cluster_id: "Segmento",
  estrato: "Estrato",
  trayectoria: "Tendencia",
  prioridad_gestion: "Prioridad",
  estado_en_lista: "Estado en lista",
  meses_consecutivos_en_lista: "Meses seguidos en la lista",
  consumo_anterior_kwh: "Consumo anterior (kWh/mes)",
  consumo_reciente_kwh: "Consume ahora (kWh/mes)",
  perdida_kwh_mes: "Pérdida (kWh/mes)",
  tarifa_kwh: "Tarifa ($/kWh)",
  valor_riesgo_mes: "Valor en riesgo ($/mes)",
  referencia_kwh: "Referencia (kWh/mes)",
  caida_pct: "Caída (%)",
  pred_1m_kwh: "Pronóstico mes +1 (kWh)",
  consumo_promedio_semestral_kwh: "Consumo promedio semestral (kWh/mes)",
  valor_facturado_mes: "Valor facturado ($/mes)",
  tipo_medidor_nombre: "Tipo de medidor",
  tipo_lectura_nombre: "Tipo de lectura",
  // --- riesgo de fuga ---
  ranking: "Ranking",
  nivel_riesgo: "Nivel de riesgo",
  prob_fuga_6m: "Probabilidad de fuga (6 meses)",
  valor_esperado_perdida_mes: "Pérdida esperada ($/mes)",
  valor_en_riesgo_mes: "Valor en riesgo ($/mes)",
  consumo_actual_kwh: "Consumo actual (kWh/mes)",
  consumo_prom_6m_kwh: "Consumo promedio 6 meses (kWh/mes)",
  consumo_prom_12m_kwh: "Consumo promedio 12 meses (kWh/mes)",
  variacion_3m_vs_12m_pct: "Variación 3m vs 12m (%)",
  meses_cero_3m: "Meses en cero (3 meses)",
  senales: "Señales",
  clientes_puntuados: "Clientes puntuados",
  riesgo_alto: "Riesgo alto",
  riesgo_medio: "Riesgo medio",
  prob_media: "Probabilidad media",
  primer_mes_otro: "Primer mes con otro",
  ultimo_mes_otro: "Último mes con otro",
  mes_salida: "Mes de salida estimado",
  fuente_salida: "Fuente de salida",
  consumo_prom_6m_antes_salida_kwh: "Consumo antes de la salida (kWh/mes)",
  consumo_prom_otro_kwh: "Consumo hoy con otro (kWh/mes)",
  valor_facturado_antes_salida_mes: "Valor facturado antes ($/mes)",
  nivel_tension: "Nivel de tensión",
  // --- cortes / resumen / seguimiento ---
  valor_corte: "Valor del corte",
  n_clientes: "Clientes",
  kwh_riesgo_mes: "Consumo en riesgo (kWh/mes)",
  n_criticos: "Críticos",
  n_rural: "Rurales",
  pct_del_total: "% del total",
  acumulado_pct: "% acumulado",
  fecha_corte: "Fecha de corte",
  fecha_corte_lista: "Corte de lista",
  fecha_corte_modelo: "Corte del modelo",
  meses_desde_entrenamiento: "Meses desde entrenamiento",
  clientes_senalados: "Clientes señalados",
  salieron_en_ventana: "Salieron en la ventana",
  pct_salieron: "Salieron (%)",
  meses_transcurridos: "Meses transcurridos",
  ventana_completa: "Ventana completa",
  salidas_conocidas_hasta: "Salidas conocidas hasta",
  evaluado_en_corte: "Evaluado en corte",
  evaluable_en_corte: "Evaluado en corte",
  // --- métricas del modelo de fuga ---
  n_filas: "Filas",
  n_positivos: "Positivos",
  precision_promedio: "Precisión promedio",
  precision_top50_pct: "Precisión top 50 (%)",
  recall_top50_pct: "Recall top 50 (%)",
  lift_top50: "Lift top 50",
  precision_top100_pct: "Precisión top 100 (%)",
  recall_top100_pct: "Recall top 100 (%)",
  lift_top100: "Lift top 100",
  precision_top200_pct: "Precisión top 200 (%)",
  recall_top200_pct: "Recall top 200 (%)",
  lift_top200: "Lift top 200",
  precision_top500_pct: "Precisión top 500 (%)",
  recall_top500_pct: "Recall top 500 (%)",
  lift_top500: "Lift top 500",
  // --- pipeline ---
  valor_mes: "Valor del mes",
  mes_evaluado: "Mes evaluado",
  // --- retroalimentación (resultados de visitas) ---
  con_causa_gestionable: "Con causa gestionable",
  caida_real_sin_gestion: "Caída real sin gestión",
  precision_gestionable_pct: "Precisión gestionable (%)",
  precision_caida_real_pct: "Precisión caída real (%)",
  valor_riesgo_gestionable_mes: "Valor en riesgo gestionable ($/mes)",
};

/**
 * Etiqueta de presentación de una columna: mapa explícito primero; si no es
 * snake_case se capitaliza la primera letra (etiquetas ya escritas pasan tal cual);
 * respaldo automático para claves futuras (espacios + unidades básicas).
 */
export function etiquetaColumna(clave: string): string {
  const explicita = ETIQUETAS[clave];
  if (explicita) return explicita;
  if (!clave.includes("_")) return capitalizarPrimera(clave);
  const conEspacios = clave.split("_").join(" ");
  return capitalizarPrimera(conEspacios)
    .replace(/\bkwh\b/g, "kWh")
    .replace(/\bgwh\b/g, "GWh")
    .replace(/\bpct\b/g, "%");
}
