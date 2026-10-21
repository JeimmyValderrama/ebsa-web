# Migración funcional completa del Streamlit

La aplicación web no ejecuta el entrenamiento ni vuelve a leer CSV/Parquet desde el navegador. El importador carga los resultados precalculados a Azure SQL y la web consulta esas tablas.

## Comercial

- **Panorama:** KPIs de clientes, lista operativa, severidad y valor en riesgo.
- **Gestión por ciclo:** ranking gerencial y priorización de operación.
- **Caídas de consumo:** `drop_analysis` con veredicto, severidad y variaciones.
- **Riesgo de fuga:** `churn_scores` con probabilidad, valor en riesgo y señales.
- **Clientes que se fueron:** `churn_other_supplier`.
- **Poblaciones especiales:** mercado no regulado, cero sostenido y autogeneradores.
- **Cortes:** resumen por ciclo, resumen por corte y entradas/salidas.
- **Proyección:** mensual, anual, backtest y comparación individual.
- **Mapa:** puntos del cruce de ubicación con NIU, municipio y coordenadas.
- **Descargas:** catálogo de todas las salidas importadas y descarga CSV desde Azure SQL.

## Soporte

- Búsqueda por NIU.
- Ficha de cliente con servicio, grupo, estrato, ciclo, zona, municipio y dirección.
- Diagnóstico de caída y riesgo de fuga.
- Consumo mensual histórico de hasta 120 meses.
- Pronóstico individual de hasta 12 meses.
- Visitas por ciclo con filtro por estado.
- Registro de resultado y notas de campo.
- Consulta de ubicaciones.

## Administrador del modelo

- Resumen del corte y estado de la última corrida.
- Corridas, cantidad de archivos, filas y fechas.
- Gestión de usuarios, roles y estado de cuenta Firebase.
- Métricas de pronóstico por perfil, selección de modelo y backtest global.
- Seguimiento global, por perfil, zona y lista.
- Feedback de visitas y control de calidad.
- Catálogo de todas las salidas genéricas del pipeline.

## Cobertura de datasets

El importador conserva cada salida del pipeline en `dataset_records`, aunque sus columnas cambien en el futuro. Las salidas que requieren consultas frecuentes también se normalizan en tablas específicas: clientes, ubicación, operación, caída, fuga, consumo, pronóstico, corridas y visitas.
