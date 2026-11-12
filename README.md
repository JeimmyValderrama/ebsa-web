# EBSA Web

Aplicación web para consultar y operar los resultados precalculados del pipeline EBSA.

El proyecto contiene la migración completa desde Streamlit: Firebase Authentication con RBAC por rol, Azure SQL Database con Alembic, importador CSV/Parquet con checkpoint, vistas Comercial/Soporte/Administrador, consultas por NIU, visitas, retroalimentación, usuarios y despliegue en Vercel.

El glosario real de negocio está en [`utilidades_glosario.py`](utilidades_glosario.py) y lo utiliza el importador web. El backend completo está en [`api/`](api/): `api/index.py` es la entrada FastAPI para Vercel y `api/app/` contiene autenticación, RBAC, datos, usuarios y sistema. El procesamiento analítico pesado (entrenamiento, segmentación y pronósticos) vive en el repositorio **ProyectoEBSA**; aquí solo se importan y sirven sus resultados.

## Arquitectura actual

```text
Navegador (rol COMERCIAL / SOPORTE / ADMIN_MODELO)
   │  HTTPS + token ID de Firebase
   ▼
Vercel (Hobby, Fluid compute, Python 3.12)
   ├─ frontend/dist compilado (React + Vite) → CDN
   └─ función serverless FastAPI (api/index.py → api/app/*)
         │  SQLAlchemy + TLS (pymssql en producción)
         ▼
Azure SQL Database "ebsa" (México Central, Standard S3 / 100 DTUs)

API ──verificar token y rol──► Firebase Authentication (cuenta Spark)
API ──HEAD estado · 307 descarga──► Azure Blob "ebsaexportes" (SAS de lectura)

Fuera de Vercel (proceso por lote, una vez por corte):
ProyectoEBSA (CSV/Parquet) ──► importador con checkpoint ──► Azure SQL
```

### Componentes

* **Azure SQL Database:** nivel Standard S3, 100 DTUs, región México Central. Es la base relacional principal: ~28,5 millones de registros de consumo mensual, ~3,4 millones de pronósticos y ~608 mil clientes para el corte actual (2026-04). El esquema se gestiona con Alembic (12 modelos ORM) y la tabla `dataset_records` guarda resultados genéricos del pipeline como JSON. Se conecta con SQLAlchemy y un driver configurable (`mssql-python` en desarrollo local, `pymssql` en producción, `pytds` como alternativa) mediante `EBSA_SQL_DRIVER`.

* **Vercel Hobby:** sirve el frontend estático y ejecuta la API FastAPI como función serverless, con un máximo de 300 segundos por ejecución. Se respetan sus límites de ~4,5 MB por respuesta y 100 MB por archivo en el despliegue, por lo que los archivos grandes nunca pasan por la API: se descargan directamente desde Blob. La API verifica el token con el Admin SDK de Firebase y aplica RBAC por el *custom claim* de rol (`COMERCIAL`, `SOPORTE`, `ADMIN_MODELO`).

* **Azure Blob Storage:** almacena ~342 MB de exportes CSV en el contenedor `exportes` (lectura con SAS temporal y CORS habilitado para el dominio). La API comprueba disponibilidad y tamaño con un `HEAD` (estado en la tabla de Descargas) y al pedir un archivo devuelve una redirección 307 a la URL firmada, para que el navegador lo baje directo sin pasar por Vercel.

* **Firebase Authentication:** gestiona usuarios, inicio de sesión con correo y contraseña y los claims de rol usados por el RBAC. Se usa con la cuenta Spark (plan gratuito): no tiene costo ni capacidad contratada comparable a las DTUs de Azure.

* **Frontend (React + TypeScript):** SPA compilada con Vite y React Router con vista por rol (Comercial, Soporte, Administrador), modo presentación que enmascara NIU y direcciones, y gráficas con Vega-Lite. Consume la API con el token ID de Firebase en `Authorization: Bearer`.

* **Importador y pipeline:** el procesamiento analítico ocurre fuera de la web (ProyectoEBSA produce CSV/Parquet) y el importador (`importer/`) los carga por lotes en Azure SQL con checkpoint reanudable. Comando: `python -m importer.import_run --source <datos> --periodo YYYY-MM [--solo-tablas clave] [--dry-run]`.

### Recorrido de una consulta

El navegador baja el bundle del CDN y pide datos con su token; FastAPI verifica token y rol; SQLAlchemy resuelve filtros, paginación y agregados en SQL contra Azure SQL y la respuesta vuelve en JSON. Las descargas de exportes terminan en una redirección a Blob. El único flujo que no pasa por Vercel es la importación (carpeta de resultados → importador → Azure SQL), que corre una vez por corte.

## Requisitos

- Node.js 22.
- pnpm 11.
- Python 3.12.
- Git.

## Instalar

Desde PowerShell en la raíz del repositorio:

```powershell
pnpm install
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r api/requirements.txt
python -m pip install -r importer/requirements.txt
```

Copia `.env.example` a `.env` y completa las variables de Azure SQL y Firebase (nunca se sube a Git).

En Windows, si PowerShell bloquea la activación del entorno virtual, ejecuta una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Ejecutar en desarrollo

Terminal 1 — API:

```powershell
.venv\Scripts\Activate.ps1
uvicorn api.index:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```powershell
pnpm --dir frontend dev
```

Abre `http://localhost:3000`.

Para que el frontend consulte la API local, crea `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Verificar

```powershell
curl http://127.0.0.1:8000/health
pnpm typecheck
pnpm build
python tests/test_importer.py
python tests/smoke_local.py
```

Para validar con el mismo driver que usa producción (`pymssql`):

```powershell
$env:EBSA_SQL_DRIVER='pymssql'; python tests/smoke_local.py
```

La documentación interactiva de FastAPI queda en `http://127.0.0.1:8000/docs`.

## Despliegue Vercel

El archivo `vercel.json` configura el build de `frontend` y la función Python `api/index.py`; `.vercelignore` excluye datos y `streamlit_original/` (641 MB) para no romper el límite de subida. Despliegue manual:

```powershell
npx vercel --prod --yes
```

Rutas principales:

- `/` (frontend), `/health` y `/api/health`, `/api/status`
- `/api/me`, `/api/admin/auth-check` (sesión y verificación del token)
- `/api/admin/users` (gestión de usuarios y roles)
- `/api/data/*` (~24 endpoints de negocio: `clients/{niu}`, `clients/{niu}/ficha`, `datasets/*`, `panorama`, `route`, `search`, `retro`, `exportes`, `fuga`, `drops`, `salidas`, `municipalities/metrics`…)
- `/docs` (Swagger, solo desarrollo local)

No subas archivos `.env`, credenciales Firebase ni datos CSV/Parquet al repositorio: `.gitignore` y `.vercelignore` los excluyen.

## Operación

| Servicio | Plan | Nota |
|---|---|---|
| Vercel | Hobby (Fluid compute) | frontend + API; variables de entorno en el panel |
| Azure SQL | Standard S3 (100 DTUs), México Central | base `ebsa`; esquema en `database/` |
| Azure Blob | pago por uso (`ebsaexportes/exportes`) | SAS de lectura + CORS; muere con el resource group |
| Firebase | Spark (gratuito) | autenticación y claims de rol |

Comandos de operación:

- Deploy: `npx vercel --prod --yes`
- Migraciones: `python -m alembic upgrade head` (esquema actual: `e5a1c7d92b4f`)
- Importación de un corte: ver *Importador y pipeline* arriba
- Seed de administrador: `python scripts/seed_admin.py <correo>`

Reglas del repositorio: commits en español sin tildes; push y despliegue solo con autorización explícita; nunca subir `.env` ni datos a Git/Vercel.

**Fecha dura:** el 15/11/2026 se elimina el grupo de recursos `rg-ebsa-produccion`, por lo que mueren Azure SQL y el Blob de exportes (la migración de los datos a S3 queda planificada para la ventana 11–15/11).

## Configuración final

Consulta [`docs/configuracion-final.md`](docs/configuracion-final.md). Ahí solo debes colocar las variables de Firebase, la conexión de Azure SQL y ejecutar la migración/importación desde Windows.

El manual de usuario (todas las pantallas, tablas y gráficas) está en [`docs/manual-usuario.md`](docs/manual-usuario.md).
