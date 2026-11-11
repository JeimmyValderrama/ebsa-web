# Despliegue en Vercel — Proyecto completo

1. Sube el repositorio `ebsa-web` a GitHub.
2. En Vercel selecciona **Add New Project** y conecta el repositorio.
3. Mantén la raíz del proyecto en la raíz del repositorio.
4. Vercel usará `vercel.json`.
5. El comando de build será `pnpm --dir frontend build`.
6. La salida será `frontend/dist`.
7. La función Python será `api/index.py`.
8. Configura las variables indicadas en `docs/configuracion-final.md`. Usa `EBSA_DATABASE_URL` o las variables `AZURE_SQL_*` y no subas claves al repositorio.

`EBSA_DATABASE_URL` apunta directamente a Azure SQL Database:

```text
mssql+mssqlpython://USUARIO:CONTRASEÑA@SERVIDOR.database.windows.net:1433/ebsa?encrypt=yes&trustservercertificate=no
```

Configura la red/firewall de Azure para permitir el acceso de Vercel y del equipo que ejecute el importador. La alternativa segura es usar una red privada o un proxy administrado; no dejes el servidor abierto a todo Internet.

Después del despliegue se deben comprobar:

```text
https://TU_DOMINIO.vercel.app/
https://TU_DOMINIO.vercel.app/api/health
```

La carga de datos EBSA se ejecuta fuera de Vercel desde Windows, GitHub Actions o un worker. Vercel solo atiende consultas ligeras, autenticación y operaciones de visitas.
