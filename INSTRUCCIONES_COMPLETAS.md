# EBSA — instrucciones completas de instalación y configuración

## 1. Qué contiene el ZIP

- `frontend/`: aplicación React/TypeScript.
- `api/`: backend FastAPI para Vercel y ejecución local.
- `database/`: modelos y migraciones PostgreSQL.
- `importer/`: importador independiente CSV/Parquet.
- `scripts/seed_admin.py`: asigna el primer rol administrador en Firebase.
- `utilidades_glosario.py`: glosario real de negocio recibido.
- `utilidades_glosario.py`: glosario de negocio usado por el importador web.

## 2. Requisitos en Windows

Instala:

- Python 3.11 o 3.12.
- Node.js 20 o superior.
- Git opcional.
- Una cuenta Firebase.
- Una base PostgreSQL administrada.

No necesitas Linux ni Docker.

## 3. Preparar el proyecto

Descomprime el ZIP y abre PowerShell en la carpeta que contiene `package.json`:

```powershell
cd C:\Ruta\ebsaweb

python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r api\requirements.txt
python -m pip install -r importer\requirements.txt
corepack enable
pnpm install
```

Si PowerShell bloquea la activación:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 4. Crear PostgreSQL

Crea una base PostgreSQL administrada en el proveedor que prefieras. Crea una base llamada `ebsa` y copia el DSN SSL que entrega el proveedor.

Ejemplo:

```text
postgresql+psycopg://USUARIO:CONTRASEÑA@HOST:5432/ebsa?sslmode=require
```

En PowerShell, antes de usar Alembic o el importador:

```powershell
$env:EBSA_DATABASE_URL="postgresql+psycopg://USUARIO:CONTRASEÑA@HOST:5432/ebsa?sslmode=require"
```

Crea las tablas:

```powershell
alembic upgrade head
```

Esto aplica las tres migraciones y crea las 14 tablas del proyecto.

## 5. Configurar Firebase Authentication

1. En Firebase Console crea o selecciona un proyecto.
2. Ve a **Authentication → Sign-in method**.
3. Activa **Email/Password**.
4. Registra una aplicación web.
5. Copia los valores de configuración web en `frontend/.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

6. En **Project settings → Service accounts**, genera una clave privada.
7. Configura las variables privadas solo en el backend:

```powershell
$env:FIREBASE_PROJECT_ID="..."
$env:FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@...iam.gserviceaccount.com"
$env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Nunca subas la clave privada a Git ni la pongas en `frontend/.env.local`.

## 6. Crear el primer administrador

Crea primero el usuario en Firebase Authentication. Después, con las variables privadas cargadas:

```powershell
python scripts\seed_admin.py administrador@empresa.com
```

Cierra sesión y vuelve a iniciar sesión para que Firebase emita un token con el claim `role=ADMIN_MODELO`.

Desde la vista Administrador podrás asignar los roles:

- `COMERCIAL`: Resumen y Comercial.
- `SOPORTE`: Resumen, Comercial y Soporte.
- `ADMIN_MODELO`: todas las vistas y administración.

## 7. Importar los archivos del pipeline

Los archivos deben conservar su estructura original, por ejemplo:

```text
C:\Datos_Ebsa\
├── 02_serie_reconstruida\
├── 03_serie_modelado\
├── 04_pronostico\
├── 05_segmentos_clientes\
├── 06_estudio_caida\
├── 07_gestion_caida\
├── 08_seguimiento\
├── 09_registro_corridas\
├── 10_riesgo_fuga\
├── 11_exportes_negocio\
├── 13_ubicacion_clientes\
└── 14_proyeccion_anual\
```

Primero valida:

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10" --dry-run
```

Si termina sin errores, importa:

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10"
```

El importador usa `utilidades_glosario.py` para agregar nombres de zona, zona regional, clase de servicio, grupo de consumo, medidor, lectura y factura. No entrena ni recalcula el modelo.

## 8. Ejecutar localmente

Terminal 1 — backend:

```powershell
.venv\Scripts\Activate.ps1
uvicorn api.index:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```powershell
pnpm --dir frontend dev
```

URLs:

- Frontend: `http://localhost:3000`
- API: `http://localhost:8000`
- Documentación API: `http://localhost:8000/docs`
- Salud: `http://localhost:8000/health`

## 9. Desplegar en Vercel

1. Sube el contenido del proyecto a GitHub.
2. En Vercel elige **Add New Project** y conecta el repositorio.
3. Mantén la raíz del repositorio como raíz del proyecto.
4. Vercel usará `vercel.json`.
5. Agrega en Vercel las variables backend:
   - `EBSA_DATABASE_URL`
   - `EBSA_ALLOWED_ORIGINS`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
6. Agrega las variables frontend `VITE_FIREBASE_*`.
7. Despliega.

El importador no debe ejecutarse dentro de Vercel. Ejecútalo desde Windows, GitHub Actions o un worker con acceso al PostgreSQL.

## 10. Comprobación final

```powershell
pnpm typecheck
pnpm build
python -m compileall api database importer scripts
```

Después prueba en el navegador la pantalla de ingreso y verifica que el administrador pueda abrir `/administrador`.
