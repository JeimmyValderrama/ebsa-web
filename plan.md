# Plan maestro de migración EBSA

La implementación seguirá estas decisiones aprobadas: monorepo `ebsa-web`; frontend React/TypeScript desplegable en Vercel; backend FastAPI como API ligera; Firebase Authentication para identidad; PostgreSQL para datos consultables; archivos CSV/Parquet originales fuera de Git; importador independiente ejecutable desde Windows, GitHub Actions o un worker; sin Docker ni Linux administrado.

## Orden de entregas

1. Base ejecutable: frontend, FastAPI, Vercel, documentación y rutas.
2. Firebase Authentication y RBAC con Comercial, Soporte y Administrador del Modelo.
3. PostgreSQL, modelos, migraciones e importador CSV/Parquet.
4. Vistas Comercial.
5. Vistas Soporte y registro de visitas.
6. Vistas Administrador del Modelo.
7. Despliegue final, Storage, backups y automatización del importador.

## Regla de datos

Los archivos originales se conservan en la carpeta del pipeline o Storage. El importador valida y transforma los datos a tablas PostgreSQL. Las consultas web no deben leer archivos Parquet grandes en cada solicitud.

## Alcance de la Fase 1

Se entrega un dashboard navegable con rutas base, endpoint `/health`, endpoint `/status`, build Vite, configuración Vercel, variables de entorno de ejemplo, estructura del importador y documentación local. No se incluyen credenciales ni datos productivos.
