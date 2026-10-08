# Importador EBSA

Este directorio contendrá el programa que leerá los CSV y Parquet generados por el pipeline, validará sus columnas y cargará los datos a PostgreSQL.

En la Fase 1 solo se reserva la estructura. No se leen datos ni se modifican archivos del pipeline.

El comando objetivo será:

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10"
```

El importador será independiente de las peticiones web para que una carga grande no dependa de los límites de una función serverless de Vercel.
