# Despliegue en Vercel — Proyecto completo

1. Sube el repositorio `ebsa-web` a GitHub.
2. En Vercel selecciona **Add New Project** y conecta el repositorio.
3. Mantén la raíz del proyecto en la raíz del repositorio.
4. Vercel usará `vercel.json`.
5. El comando de build será `pnpm --dir frontend build`.
6. La salida será `frontend/dist`.
7. La función Python será `api/index.py`.
8. Configura las variables indicadas en `docs/configuracion-final.md`. Usa `EBSA_DATABASE_URL` para el PostgreSQL externo y no subas claves al repositorio.

Después del despliegue se deben comprobar:

```text
https://TU_DOMINIO.vercel.app/
https://TU_DOMINIO.vercel.app/api/health
```

La carga de datos EBSA se ejecuta fuera de Vercel desde Windows, GitHub Actions o un worker. Vercel solo atiende consultas ligeras, autenticación y operaciones de visitas.
