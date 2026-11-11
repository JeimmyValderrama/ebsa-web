# Configuración final del proyecto EBSA

La aplicación usa **Azure SQL Database** para la base de datos y **Firebase Authentication** para los usuarios. Solo debes configurar las credenciales y ejecutar las migraciones/importación.

## 1. Firebase Authentication

1. Crea un proyecto Firebase.
2. Activa **Authentication → Sign-in method → Email/Password**.
3. Registra una aplicación web y copia sus valores en `frontend/.env.local` o en Vercel con prefijo `VITE_`.
4. Genera una clave privada de Service Account y configura `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` únicamente en el backend/Vercel.
5. Crea el usuario inicial en Firebase Authentication.
6. Asigna el primer administrador:

```powershell
$env:FIREBASE_PROJECT_ID="..."
$env:FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@...iam.gserviceaccount.com"
$env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
python scripts/seed_admin.py administrador@empresa.com
```

Después de asignar un claim, el usuario debe cerrar sesión y entrar de nuevo.

## 2. Azure SQL Database

Crea un **Azure SQL logical server** y una base de datos llamada `ebsa`. Configura el firewall para permitir el equipo que ejecutará las migraciones/importador y el backend desplegado. Mantén el cifrado habilitado.

Puedes configurar una URL completa:

```env
EBSA_DATABASE_URL=mssql+mssqlpython://USUARIO:CONTRASEÑA@SERVIDOR.database.windows.net:1433/ebsa?encrypt=yes&trustservercertificate=no
```

O, preferiblemente, separar los valores:

```env
AZURE_SQL_SERVER=servidor.database.windows.net
AZURE_SQL_DATABASE=ebsa
AZURE_SQL_USERNAME=usuario
AZURE_SQL_PASSWORD=contraseña
AZURE_SQL_PORT=1433
```

El proyecto usa el driver oficial `mssql-python`, SQLAlchemy y Alembic.

## 3. Instalar y crear tablas

```powershell
python -m pip install -r api/requirements.txt
python -m pip install -r importer/requirements.txt
alembic upgrade head
```

## 4. Importar resultados

Conserva los CSV y Parquet fuera del repositorio. Valida primero:

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10" --dry-run
```

Si no hay errores:

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10"
```

El importador lee los archivos, usa `utilidades_glosario.py`, normaliza los datos y los guarda en Azure SQL. No entrena ni recalcula modelos.

## 5. Vercel

Configura en Project Settings → Environment Variables:

- `EBSA_DATABASE_URL`, o las cinco variables `AZURE_SQL_*`.
- `EBSA_ALLOWED_ORIGINS` con el dominio exacto.
- `FIREBASE_PROJECT_ID`.
- `FIREBASE_CLIENT_EMAIL`.
- `FIREBASE_PRIVATE_KEY`.
- Todas las variables `VITE_FIREBASE_*`.

Conecta el repositorio y despliega. `vercel.json` define el build React y la función FastAPI.

## 6. Roles

- `COMERCIAL`: Resumen y Comercial.
- `SOPORTE`: Resumen, Comercial y Soporte.
- `ADMIN_MODELO`: todas las vistas, usuarios, corridas y retroalimentación.

Firebase administra la identidad; FastAPI valida el token y el claim `role` en cada endpoint.
