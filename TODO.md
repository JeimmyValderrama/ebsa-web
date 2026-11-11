# Estado de implementación EBSA

Todas las fases de software están implementadas y verificadas. Quedan únicamente tareas
de configuración con las cuentas y datos reales de la empresa.

- [x] **Base ejecutable:** monorepo React/TypeScript + FastAPI, Vercel, preview y health check.
- [x] **Identidad y RBAC:** Firebase Email/Password, validación de ID Token, roles `COMERCIAL`, `SOPORTE` y `ADMIN_MODELO`, administración de usuarios.
- [x] **Persistencia e importación:** Azure SQL Database (guía en `docs/azure-sql-guia.md`), Alembic, 15 tablas, importador masivo CSV/Parquet con normalización, enriquecimiento de clientes y registro de corridas.
- [x] **Autenticación endurecida:** token refrescado, salida por sesión expirada, guardas por rol y cliente API con reintento tras 401.
- [x] **Comercial:** panorama con KPIs, banda de prioridades y mapa coroplético; caídas de consumo, cero sostenido, riesgo de fuga, salidas, proyección con horizonte y descargas; búsqueda, filtros y paginación reales.
- [x] **Soporte:** consulta por NIU con ficha completa (serie de consumo, pronóstico de 6 meses y sugerencia "Qué revisar"), visitas por ciclo con agendado y descarga, y registro de resultados.
- [x] **Administrador del modelo:** resumen, gestión por ciclo, ranking gerencial, riesgo de fuga, cortes, mapa, búsqueda de cliente, pronóstico, proyección, seguimiento, retroalimentación, estado del pipeline, catálogo completo de salidas y usuarios/roles.
- [x] **Funciones nuevas del pedido:** selector Consumo ↔ Facturación en todas las vistas, horizonte de proyección configurable (12/24/todo) y modo "Ocultar NIU y direcciones".
- [x] **Verificación:** `pnpm typecheck` y `pnpm build` en verde (con el chequeo real, `tsc -b`), pruebas del importador y de endpoints en verde, y smoke test de la API contra una base local con el corte 2026-04 completo.

## Configuración pendiente del propietario

1. Crear/configurar el proyecto Firebase y habilitar Email/Password.
2. Crear Azure SQL Database siguiendo `docs/azure-sql-guia.md` y colocar `EBSA_DATABASE_URL` (o `AZURE_SQL_*`).
3. Colocar las variables `VITE_FIREBASE_*` en frontend/Vercel.
4. Colocar las credenciales Admin de Firebase solo en backend/Vercel.
5. Ejecutar `alembic upgrade head` e importar el primer corte (`--periodo 2026-04`).
6. Crear el primer usuario y ejecutar `python scripts/seed_admin.py correo@empresa.com`.
7. Conectar el repositorio a Vercel y configurar el dominio.

## Comandos de referencia

```powershell
# Esquema
.\.venv\Scripts\python.exe -m alembic upgrade head

# Importar un corte (desde la máquina local)
$env:PYTHONIOENCODING='utf-8'
.\.venv\Scripts\python.exe -m importer.import_run --source "C:\Datos_Ebsa\2026-04" --periodo "2026-04"

# Pruebas
.\.venv\Scripts\python.exe tests\test_importer.py
.\.venv\Scripts\python.exe tests\test_phase3.py
.\.venv\Scripts\python.exe tests\smoke_local.py   # endpoints contra la base local
pnpm typecheck
pnpm build
```
