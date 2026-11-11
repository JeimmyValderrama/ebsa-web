# Migración funcional del Streamlit a la web

La aplicación web no ejecuta el entrenamiento ni vuelve a leer CSV/Parquet desde el
navegador. El importador carga los resultados precalculados a Azure SQL (o a una SQLite
local para pruebas) y la web consulta esas tablas.

## Controles transversales (los tres pedidos de negocio)

| Control | Dónde vive | Qué hace |
| --- | --- | --- |
| **Consumo ↔ Facturación** | Barra superior de Comercial y Administrador (`Presentation.tsx`) | Cambia la unidad de todas las cifras: energía con la unidad que corresponde a la escala (kWh, MWh, GWh) o pesos por mes con la tarifa real de cada cliente. Persiste en el navegador. |
| **Horizonte de proyección** | Selector dentro de la vista de proyección | El modelo calcula 36 meses; el horizonte (12 meses recomendado / 24 / todo) solo recorta lo que se muestra. Un año anual se muestra completo solo si todos sus meses proyectados caben en el horizonte. |
| **Ocultar NIU y direcciones** | Interruptor en Administrador y modo presentación | En tablas y fichas el NIU y la dirección se muestran enmascarados (`•••` + últimos 3 caracteres). Las descargas no cambian. |

## Comercial

- **Panorama:** clientes en la lista, caída en la medida activa (kWh/mes o $/mes con el
  equivalente al lado), riesgo de fuga alto/medio, cero sostenido, otro comercializador,
  banda de prioridades de gestión y mapa coroplético de municipios.
- **Caídas de consumo:** `drop_analysis` con búsqueda, filtros por veredicto, gravedad
  y zona, paginación y descarga CSV filtrada.
- **Clientes sin consumo:** `zero_sustained` (cero sostenido, separado de la caída).
- **Riesgo de fuga:** `churn_scores` con probabilidad a 6 meses, valor esperado de
  pérdida y señales del modelo.
- **Clientes que ya se fueron:** `churn_other_supplier` y vigilancia de mercado no
  regulado.
- **Proyección de consumo:** serie mensual real y proyectada con banda de incertidumbre
  80%, tarjetas anuales, filtro por zona y escenario, y selector de horizonte.
- **Descargas:** catálogo de todas las salidas importadas con vista previa filtrable.

## Soporte

- **Consultar un cliente:** búsqueda por NIU (admite el formato de Excel) y ficha con
  clase de servicio, grupo, zona, ciclo, municipio, dirección, gravedad, veredicto,
  trayectoria, prioridad, riesgo de fuga, serie de consumo mensual, pronóstico de 6
  meses y la sugerencia **"Qué revisar"** en lenguaje simple.
- **Visitas por ciclo:** lista de gestión por ciclo de lectura con municipio, dirección
  y sugerencia; agendado de visitas y descarga CSV de la ruta.
- **Caídas de consumo:** la misma lista de Comercial, con el detalle del estudio.
- **Registrar resultado de visitas:** selección de la visita agendada, resultado
  (contactado con éxito / sin respuesta / no aplica) y notas de campo.

## Administrador del modelo

- **Resumen:** conteos del corte, última corrida y corridas de importación.
- **Gestión por ciclo / Ranking gerencial:** `cycle_summary` y `managerial` con filtros.
- **Riesgo de fuga:** `churn_scores`, importancia de variables, riesgo por clúster y
  métricas del modelo.
- **Cortes:** `cut_summary` y entradas/salidas de la lista.
- **Mapa:** coroplético por municipio con 13 métricas agregadas.
- **Buscar cliente:** en qué listas del corte aparece un NIU, con enlace a la ficha.
- **Pronóstico 6 meses:** métricas por perfil (WAPE y sesgo), comparación contra modelos
  ingenuos, selección de modelos, versiones y uso de modelos.
- **Proyección:** vista completa más backtest por zona, comparación de modelos y de
  escenarios.
- **Seguimiento:** `followup_clientes` (meses consecutivos y veces en lista) y
  `cycle_summary`.
- **Retroalimentación:** evaluación del feedback y resultados de visitas registrados.
- **Estado del pipeline:** corridas del pipeline con su resumen desplegable, control de
  calidad y diagnóstico de sesgo del pronóstico.
- **Descargas por grupo / Todas las salidas:** catálogo completo con vista previa.
- **Usuarios y roles:** administración de usuarios Firebase, roles y estado de cuenta.

## Cobertura de datasets

El importador conserva cada salida del pipeline en `dataset_records` (46 datasets),
aunque sus columnas cambien en el futuro. Las salidas con consultas frecuentes también
se normalizan en tablas propias, que la API sirve directamente: `clients`,
`client_locations`, `operational_management`, `client_drop_analysis`,
`client_churn_risk`, `client_consumption_monthly`, `client_forecasts`,
`pipeline_runs` y `visits`.

Dos detalles de tamaño, medidos con el corte 2026-04:

- `client_consumption_monthly` (~28,5 M de filas) y `client_forecasts` (~3,5 M) se
  guardan **sin** el JSON de origen: solo columnas tipadas. Con el payload completo la
  misma carga ocuparía más del triple.
- El parquet del pronóstico es ancho (`fecha_pred_1..6m`, `pred_1..6m_kwh`); el
  importador lo vierte a filas largas de 6 por cliente.

## Diferencias conscientes frente al Streamlit

- La web consulta la base de datos, no los archivos: los datos visibles son los del
  último corte importado (`data_runs.status = 'COMPLETED'`).
- El mapa es un coroplético por municipio con métricas agregadas; no replica el mapa de
  dispersión de coordenadas del Streamlit (esa dispersión está disponible por cliente en
  la ficha y en la tabla de ubicaciones).
- Los totales y la búsqueda se resuelven en SQL con paginación real, por lo que las
  listas grandes no se cargan completas en el navegador.
