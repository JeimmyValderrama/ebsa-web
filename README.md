# EBSA Web

Aplicación web para consultar y operar los resultados precalculados del pipeline EBSA.

El proyecto contiene la migración completa desde Streamlit: Firebase Authentication y RBAC, Azure SQL Database/Alembic, importador CSV/Parquet, vistas Comercial/Soporte/Administrador, consultas por NIU, visitas, feedback, usuarios y configuración Vercel.

El glosario real de negocio está en [`utilidades_glosario.py`](utilidades_glosario.py) y lo utiliza el importador web. El backend completo está en [`api/`](api/): `api/index.py` es la entrada FastAPI para Vercel y `api/app/` contiene autenticación, RBAC, datos, usuarios, visitas y feedback.

## Arquitectura actual

```text
frontend React/Vite  →  API FastAPI  →  Azure SQL Database
         │                    │
         └── Vercel           └── futura verificación Firebase
```

El importador será un proceso separado para leer CSV/Parquet y no se ejecutará dentro de una función serverless de Vercel.

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
```

La documentación interactiva de FastAPI queda en `http://127.0.0.1:8000/docs`.

## Despliegue Vercel

El archivo `vercel.json` configura el build de `frontend` y la función Python `api/index.py`. Conecta este repositorio en Vercel y conserva la raíz del proyecto en la raíz del repositorio.

Rutas iniciales:

- `/`
- `/comercial`
- `/soporte`
- `/administrador`
- `/api/health`
- `/api/status`

No subas archivos `.env`, credenciales Firebase ni datos CSV/Parquet al repositorio.

## Configuración final

Consulta [`docs/configuracion-final.md`](docs/configuracion-final.md). Ahí solo debes colocar las variables de Firebase, la conexión de Azure SQL y ejecutar la migración/importación desde Windows.
