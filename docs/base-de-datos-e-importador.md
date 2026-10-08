# Base de datos e importador — Fase 3

## Motor

EBSA usa PostgreSQL en producción. La variable recomendada es `EBSA_DATABASE_URL`, por ejemplo:

```env
EBSA_DATABASE_URL=postgresql+psycopg://ebsa:clave@localhost:5432/ebsa
```

Si no existe esa variable, el proyecto usa `ebsa_local.db` SQLite únicamente para validar el código localmente. El DSN MySQL que pueda inyectar una plataforma no se usa para EBSA.

## Crear el esquema

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -r importer/requirements.txt
python -m database.init_db
```

Para usar migraciones:

```powershell
alembic upgrade head
```

En producción se debe ejecutar la migración contra el PostgreSQL de producción y revisar el DSN antes de confirmar.

## Validar archivos sin importar

```powershell
python -m importer.import_run `
  --source "C:\Datos_Ebsa" `
  --periodo "2026-10" `
  --dry-run
```

Este comando no escribe datos. Revisa los archivos del manifiesto, valida columnas obligatorias y cuenta filas por lotes.

## Importar

```powershell
python -m importer.import_run `
  --source "C:\Datos_Ebsa" `
  --periodo "2026-10" `
  --database-url "postgresql+psycopg://ebsa:clave@localhost:5432/ebsa"
```

La importación no modifica los archivos originales. Registra una fila en `data_runs`, una por archivo en `data_files` y carga los datos normalizados en las tablas de negocio.

Una corrida ya completada no se sobrescribe automáticamente. Esto evita duplicados y obliga a revisar cualquier reimportación.

## Archivos reconocidos inicialmente

El manifiesto se basa en la clase `Rutas` del Streamlit actual e incluye lista operativa, lista gerencial, riesgo de fuga, pronósticos, serie mensual, ubicación, estudio de caída, ciclo, proyección e índice de exportes.
