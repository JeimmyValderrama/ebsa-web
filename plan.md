# Plan maestro de migración EBSA

La implementación usa el monorepo `ebsa-web`, frontend React/TypeScript desplegable en Vercel, backend FastAPI como API ligera, Firebase Authentication para identidad y Azure SQL Database para datos consultables. Los archivos CSV/Parquet originales quedan fuera de Git; un importador independiente se ejecuta desde Windows, GitHub Actions o un worker, sin Docker ni Linux administrado.

## Orden de entregas

1. Base ejecutable: frontend, FastAPI, Vercel, documentación y rutas.
2. Firebase Authentication y RBAC con Comercial, Soporte y Administrador del Modelo.
3. Azure SQL Database, modelos, migraciones e importador CSV/Parquet.
4. Vistas Comercial.
5. Vistas Soporte y registro de visitas.
6. Vistas Administrador del Modelo.
7. Despliegue final, Storage, backups y automatización del importador.

## Regla de datos

Los archivos originales se conservan en la carpeta del pipeline o Storage. El importador valida y transforma los datos a tablas Azure SQL. Las consultas web no deben leer archivos Parquet grandes en cada solicitud.

## Alcance

No se incluyen credenciales ni datos productivos. Firebase administra usuarios y roles; Azure SQL conserva los datos de negocio; FastAPI valida los tokens y aplica los permisos.
