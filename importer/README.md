# Importador EBSA

Lee los CSV y Parquet producidos por el pipeline, valida el manifiesto, enriquece cada lote con `utilidades_glosario.py` y carga los datos en **Azure SQL Database** mediante SQLAlchemy y `mssql-python`.

No ejecuta entrenamiento ni recalcula modelos.

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10" --dry-run
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10"
```

La variable `EBSA_DATABASE_URL` puede usar:

```text
mssql+mssqlpython://usuario:contraseña@servidor.database.windows.net:1433/ebsa?encrypt=yes&trustservercertificate=no
```

El importador es independiente de las peticiones web para que una carga grande no dependa de los límites de una función serverless de Vercel.
