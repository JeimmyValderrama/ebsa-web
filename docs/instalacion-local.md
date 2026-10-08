# Instalación local — Fase 1

## Requisitos

- Node.js 22 o compatible.
- pnpm 11.
- Python 3.12 o compatible.
- Git.
- PostgreSQL se añadirá en la Fase 3.
- Un proyecto Firebase se añadirá en la Fase 2.

## Frontend

Desde la raíz del repositorio:

```powershell
pnpm install
pnpm --dir frontend dev
```

Abre `http://localhost:5173`.

## API

En otra terminal:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r api/requirements.txt
uvicorn api.index:app --reload --host 127.0.0.1 --port 8000
```

La API estará en `http://127.0.0.1:8000` y la documentación en `http://127.0.0.1:8000/docs`.

Para conectar el frontend local con esa API crea `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Reinicia Vite después de crear o modificar variables `VITE_`.

## Comprobaciones

```powershell
curl http://127.0.0.1:8000/health
pnpm typecheck
pnpm build
```

La respuesta de salud debe tener `"status":"ok"` y el build debe crear `frontend/dist`.
