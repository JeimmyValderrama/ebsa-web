# Estado de implementación EBSA

Las fases de software están implementadas en el repositorio. Quedan únicamente tareas de configuración con los datos y cuentas reales de la empresa.

- [x] **Fase 1 — Base ejecutable:** monorepo React/TypeScript + FastAPI, Vercel, preview y health check.
- [x] **Fase 2 — Identidad y RBAC:** Firebase Email/Password, validación de ID Token, roles `COMERCIAL`, `SOPORTE` y `ADMIN_MODELO`, administración de usuarios.
- [x] **Fase 3 — Persistencia e importación:** PostgreSQL, Alembic, 14 tablas, importador CSV/Parquet, validación, normalización, corridas y conservación de datasets genéricos.
- [x] **Fase 4 — Comercial:** panorama, KPIs, lista de riesgo operativo, filtros por severidad y descarga CSV; las tablas quedan conectadas al último corte importado.
- [x] **Fase 5 — Soporte:** consulta por NIU, ficha, riesgo, caída, visitas por ciclo y registro persistente de resultados.
- [x] **Fase 6 — Administrador:** resumen, corridas, usuarios/roles, feedback y control de estado del pipeline.
- [x] **Fase 7 — Producción:** configuración Vercel, variables separadas, guía de PostgreSQL/Firebase, bootstrap del primer administrador e importador ejecutable desde Windows.

## Configuración pendiente del propietario

1. Crear/configurar el proyecto Firebase y habilitar Email/Password.
2. Crear PostgreSQL administrado y colocar `EBSA_DATABASE_URL`.
3. Colocar las variables `VITE_FIREBASE_*` en frontend/Vercel.
4. Colocar las credenciales Admin de Firebase solo en backend/Vercel.
5. Ejecutar `alembic upgrade head` e importar el primer directorio del pipeline.
6. Crear el primer usuario y ejecutar `python scripts/seed_admin.py correo@empresa.com`.
7. Conectar el repositorio a Vercel y configurar el dominio.
