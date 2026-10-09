# Azure SQL Database e importador

## Motor

EBSA usa **Azure SQL Database** en producción mediante SQLAlchemy y el driver oficial `mssql-python`:

```env
EBSA_DATABASE_URL=mssql+mssqlpython://usuario:contraseña@servidor.database.windows.net:1433/ebsa?encrypt=yes&trustservercertificate=no
```

También puedes usar variables separadas:

```env
AZURE_SQL_SERVER=servidor.database.windows.net
AZURE_SQL_DATABASE=ebsa
AZURE_SQL_USERNAME=usuario
AZURE_SQL_PASSWORD=contraseña
AZURE_SQL_PORT=1433
```

Sin una URL de producción, el proyecto usa `ebsa_local.db` SQLite únicamente para validaciones locales.

## Crear el esquema

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -r importer/requirements.txt
alembic upgrade head
```

Las migraciones crean las tablas de corridas, archivos, clientes, consumo, pronósticos, riesgo, ubicación, visitas, feedback y datasets genéricos.

## Validar archivos sin importar

```powershell
python -m importer.import_run `
  --source "C:\Datos_Ebsa" `
  --periodo "2026-10" `
  --dry-run
```

Este comando no escribe datos. Revisa el manifiesto, valida columnas obligatorias y cuenta filas por lotes.

## Importar

```powershell
python -m importer.import_run `
  --source "C:\Datos_Ebsa" `
  --periodo "2026-10"
```

La importación no modifica los archivos originales. Registra una fila en `data_runs`, una por archivo en `data_files` y carga los datos normalizados en Azure SQL.

Una corrida completada no se sobrescribe automáticamente.

## Red y seguridad

- Usa el puerto TCP `1433`.
- Mantén TLS/cifrado activo.
- Agrega reglas de firewall solo para las IP necesarias.
- No guardes la contraseña en Git.
- En Vercel usa variables de entorno.
- Para producción avanzada considera Azure Key Vault o identidad administrada.
