# Importador EBSA

Lee los CSV y Parquet producidos por el pipeline, valida el manifiesto, enriquece cada lote con `utilidades_glosario.py` y carga los datos en **Azure SQL Database** mediante SQLAlchemy y `mssql-python`.

No ejecuta entrenamiento ni recalcula modelos.

```powershell
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10" --dry-run
python -m importer.import_run --source "C:\Datos_Ebsa" --periodo "2026-10"
```

## Carga escalonada con checkpoint

La carga procesa **una tabla a la vez** y guarda el avance en `carga_checkpoint.json`
(con `--checkpoint otra/ruta.json` se cambia de archivo y con `--sin-checkpoint` se
desactiva):

| Estado | Significado |
|---|---|
| `PENDIENTE` | Todavía no se procesó. |
| `EN_PROCESO` | Cortó a mitad; se reanuda desde la última fila confirmada. |
| `COMPLETADO` | Se omite en la siguiente ejecución. |
| `ERROR` | Falló; se registra el motivo y se reintenta en la próxima corrida. |

Si el proceso se interrumpe (timeout, caída de red, consola cerrada), volver a
ejecutar el **mismo comando** retoma exactamente en la tabla pendiente o fallida
sin repetir las completadas:

```powershell
python -u -m importer.import_run --source streamlit_origen/datos --periodo 2026-10 --batch-size 5000
```

| Bandera | Qué hace |
|---|---|
| `--al-fallar continuar` (por defecto) | Registra el error y sigue con la siguiente tabla. |
| `--al-fallar detener` | Detiene la carga en cuanto una tabla falla. |
| `--solo-tablas <clave>` | Carga únicamente esos datasets (repetible). |
| `--reiniciar-tabla <clave>` | Borra esas filas de la corrida y las vuelve a cargar desde cero. |

`-u` (sin búfer) es recomendable: sin él un error puede quedarse en el búfer y
no aparecer en el log. El INSERT de cada lote va por cursor crudo con los
procesadores de tipo de SQLAlchemy: escribe exactamente los mismos valores que
el ORM, pero en una sola sentencia por lote en vez de una por fila.

La variable `EBSA_DATABASE_URL` puede usar:

```text
mssql+mssqlpython://usuario:contraseña@servidor.database.windows.net:1433/ebsa?encrypt=yes&trustservercertificate=no
```

El importador es independiente de las peticiones web para que una carga grande no dependa de los límites de una función serverless de Vercel.
