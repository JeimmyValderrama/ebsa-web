# Configuración final del proyecto EBSA

La aplicación ya contiene las fases de interfaz, autenticación, persistencia, importación, operación de campo y administración. Solo debes proporcionar las credenciales y el DSN de tu infraestructura.

## 1. Firebase

1. Crea un proyecto Firebase.
2. Activa Authentication → Sign-in method → Email/Password.
3. Registra una aplicación web y copia sus seis valores en `frontend/.env.local` o en Vercel con prefijo `VITE_`.
4. Genera una clave privada de Service Account y configura `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` únicamente en el backend/Vercel.
5. Crea tu usuario inicial en Firebase Authentication.
6. Asigna el primer administrador:

```powershell
$env:FIREBASE_PROJECT_ID="..."
$env:FIREBASE_CLIENT_EMAIL="..."
$env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
python scripts/seed_admin.py administrador@empresa.com
```

Después de asignar un claim, el usuario debe cerrar sesión y entrar de nuevo.

## 2. PostgreSQL

Crea una base PostgreSQL administrada y configura:

```env
EBSA_DATABASE_URL=postgresql+psycopg://usuario:clave@host:5432/ebsa?sslmode=require
```

Ejecuta una vez:

```powershell
python -m pip install -r api/requirements.txt
python -m pip install -r importer/requirements.txt
alembic upgrade head
```

## 3. Importar resultados

Conserva los CSV y Parquet fuera del repositorio, en la carpeta de resultados del pipeline. Ejecuta primero una validación:

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10" --dry-run
```

Si no hay errores:

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10"
```

## 4. Vercel

Configura estas variables en Project Settings → Environment Variables:

- `EBSA_DATABASE_URL`
- `EBSA_ALLOWED_ORIGINS` con el dominio exacto de producción
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Conecta el repositorio y despliega. `vercel.json` ya define el build React y la función FastAPI.

## 5. Roles

- `COMERCIAL`: Resumen y Comercial.
- `SOPORTE`: Resumen, Comercial y Soporte.
- `ADMIN_MODELO`: todas las vistas, usuarios, corridas y retroalimentación.

El frontend oculta navegación no permitida, pero el backend vuelve a validar el ID Token y el claim `role` en cada endpoint.
