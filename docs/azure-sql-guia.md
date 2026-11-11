# Azure SQL Database: creación desde cero y carga del primer corte

Esta guía lleva de una cuenta de Azure vacía a la base **Azure SQL Database** con los
resultados del pipeline de EBSA cargados y la aplicación apuntando a ella. Los comandos
se ejecutan en la máquina local (Windows) donde corre el importador.

## 1. Qué se va a crear

| Recurso | Ejemplo | Para qué |
| --- | --- | --- |
| Grupo de recursos | `rg-ebsa-produccion` | Agrupa todo lo de EBSA. |
| Servidor SQL | `ebsa-sql.database.windows.net` | Hospeda las bases de datos. |
| Base de datos | `ebsa` | Aquí vive el esquema y los datos. |
| Usuario SQL | `ebsa_admin` | Lo usa el importador y el backend. |

El backend (FastAPI en Vercel) y el importador (esta máquina) comparten la misma base.
Los CSV y Parquet **no** se suben a Git ni a Vercel: solo se leen en local y se insertan
por SQL.

## 2. Crear el servidor y la base (portal de Azure)

1. En <https://portal.azure.com> → **Crear recurso** → **Bases de datos** → **SQL Database**.
2. **Suscripción** y **Grupo de recursos**: usar el de EBSA (o crear `rg-ebsa-produccion`).
3. **Nombre de la base de datos**: `ebsa`.
4. **Servidor**: crear uno nuevo con nombre global único, por ejemplo `ebsa-sql` (queda
   `ebsa-sql.database.windows.net`). Al crearlo definir:
   - Autenticación: **SQL authentication** con usuario `ebsa_admin` y una contraseña
     fuerte (guardarla en el gestor de contraseñas; no en Git).
   - **Método de conexión de herramientas**: permitir **"Azure services and resources
     can access this server"** (queda desactivado por defecto; hace falta para que la
     app de Vercel se conecte).
   - En **Red** → **Conexiones de firewall**: agregar la IP pública de la máquina donde
     correrá el importador (se puede consultar en <https://ifconfig.me>). Sin esa regla
     la importación falla con timeout de conexión.
5. En **Configuración** de la base de datos elegir el nivel de servicio (ver punto 3)
   y dejar **Redundancia de datos**: predeterminado (backup automático 7 días).
6. **Revisar y crear** → **Crear**. El aprovisionamiento tarda 2-5 minutos.

### Nivel de servicio (tamaño)

El corte completo (2026-04) deja estas filas:

| Tabla | Filas | Comentario |
| --- | ---: | --- |
| `client_consumption_monthly` | ~28.500.000 | Serie mensual: manda en tamaño. |
| `client_forecasts` | ~3.476.000 | Pronóstico de 6 meses, ya en filas largas. |
| `clients` | ~608.600 | Catálogo de clientes. |
| `client_locations` | ~594.700 | Última ubicación conocida. |
| `client_drop_analysis` | ~596.500 | Estudio de caída por cliente. |
| `client_churn_risk` | ~46.000 | Riesgo de fuga. |
| `operational_management` | ~29.000 | Lista de gestión del ciclo. |
| `dataset_records` | ~45.000 | Salidas genéricas del pipeline. |
| **Total** | **~34,0 M** | |

Recomendación:

- **Standard S1 (20 PUs, 50 GB)**: nivel recomendado para el corte completo. Cabe con
  holgura y da 20 PUs, suficientes para las agregaciones del mapa y el panorama.
- **Standard S0 (10 GB)**: sirve para probar con el corte completo **solo si** se limita
  la serie histórica con `--min-periodo 2025-05` (últimos 12 meses, ~7 M de filas).
  Es el nivel mínimo que corre el esquema completo sin quedarse sin espacio.
- **Standard S2 / vCore**: si se agregan más de 2 años de histórico o varios cortos
  conviven en la misma base.

> El importador no guarda el JSON de origen en `client_consumption_monthly` ni en
> `client_forecasts` (solo columnas tipadas); sin ese cambio la misma carga necesitaría
> más de 20 GB y duplicaría el tiempo de escritura.

Para escalar después: SQL Database → **Compute + storage** → **Change compute size**.
Escalar no requiere migrar datos.

## 3. Variables de entorno

En la máquina local (archivo `.env`, que `.gitignore` excluye) y en Vercel
(**Settings → Environment Variables**), bien la URL completa o las cuatro variables:

```dotenv
# Opción A: URL completa
EBSA_DATABASE_URL=mssql+mssqlpython://ebsa_admin:CONTRASEÑA@ebsa-sql.database.windows.net:1433/ebsa?encrypt=yes&trustservercertificate=no

# Opción B: por componentes (el backend arma la URL)
AZURE_SQL_SERVER=ebsa-sql.database.windows.net
AZURE_SQL_DATABASE=ebsa
AZURE_SQL_USERNAME=ebsa_admin
AZURE_SQL_PASSWORD=CONTRASEÑA
AZURE_SQL_PORT=1433
```

Notas:

- `mssql+mssqlpython` es el driver oficial que usa el backend (requiere
  `pip install mssql-python`). SQLite queda solo como respaldo explícito para pruebas.
- `encrypt=yes` y `trustservercertificate=no` son obligatorios: Azure SQL exige TLS.
- La contraseña puede contener `@` o `#`: si la URL no se lee bien, use la opción B.
- En **Vercel** agregar también `EBSA_ALLOWED_ORIGINS=https://dominio-de-ebsa.vercel.app`.

## 4. Crear el esquema

Con el `.env` apuntando a Azure SQL, en la raíz del repositorio:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Crea las 15 tablas (clientes, series, riesgos, visitas, feedback, corridas y datasets
genéricos) con sus índices y restricciones. Es reversible con downgrade y se puede
repetir sin efectos secundarios.

## 5. Importar el primer corte

La carpeta de datos es la salida del pipeline (por ejemplo
`C:\Datos_Ebsa\2026-04`), con los 110 archivos CSV/Parquet.

```powershell
$env:PYTHONIOENCODING='utf-8'
.\.venv\Scripts\python.exe -m importer.import_run --source "C:\Datos_Ebsa\2026-04" --periodo "2026-04"
```

Opciones útiles:

| Opción | Para qué |
| --- | --- |
| `--dry-run` | Contaré sin escribir nada; valida rutas y columnas. |
| `--periodo 2026-04` | Etiqueta del corte. **Obligatorio** para que las pantallas lo muestren. |
| `--min-periodo 2025-05` | Importa solo la serie desde ese mes (reduce la tabla grande). |
| `--skip consumption` | Omitir la serie mensual (28,5 M filas) para una prueba rápida. |
| `--skip forecast` / `--skip clusters` | Omitir pronóstico o clústeres. |

Qué hace la importación, en orden:

1. Crea la corrida en `data_runs` y registra cada archivo en `data_files`.
2. Inserta por lotes (`executemany`) cada dataset en su tabla normalizada o en
   `dataset_records`; el parquet ancho del pronóstico se convierte a filas largas
   (6 filas por cliente).
3. Rellena `clients` con los NIU que falten y lo enriquece con zona, ciclo, clase de
   servicio y grupo de consumo.
4. Sincroniza `pipeline_runs` con las corridas registradas por el pipeline
   (`09_registro_corridas`).
5. `data_runs.status` queda en `COMPLETED` (o `FAILED` si algo falla a medias).

Tiempo medido en una máquina local (Windows, SSD): la carga completa del corte 2026-04
(sin `clusters`) toma del orden de **15-25 minutos**; con `--skip consumption` baja a
**3-5 minutos**. La importación es idempotente por corte: cada corrida nueva crea su
propio `data_run` y las pantallas siempre muestran el último `COMPLETED`.

## 6. Verificar

```powershell
# Prueba de conexión y conteos
.\.venv\Scripts\python.exe tests\smoke_local.py
```

Y en el navegador, con un usuario `ADMIN_MODELO`:

1. **Administrador → Resumen**: debe aparecer el corte importado y los conteos.
2. **Administrador → Estado del pipeline**: calidad, sesgo y corridas.
3. **Comercial → Panorama**: KPIs, banda de prioridades y mapa de municipios.
4. **Soporte → Consultar un cliente**: buscar un NIU de la lista de gestión.

Si los conteos salen en cero, verificar que `--periodo` coincida con el corte y que
`data_runs.status = 'COMPLETED'`.

## 7. Operación

- **Nuevo corte**: ejecutar el mismo comando con la carpeta del nuevo periodo. Las
  pantallas pasan a mostrar el corte más reciente; los anteriores quedan en la base
  para comparar.
- **Borrar un corte defectuoso**: eliminar las filas del `data_run` correspondiente en
  `data_files`, `dataset_records`, las tablas normalizadas y `data_runs` (por ahora no
  hay comando de purga; se puede hacer con un script corto sobre `data_run_id`).
- **Copias de seguridad**: el servicio guarda 7 días de backups automáticos; para
  retención mayor, crear un *geo-redundant backup* o exportar con `bacpac`:
  `SqlPackage.exe /Action:Export /SourceServerName:... /SourceDatabaseName:ebsa /TargetFile:ebsa.bacpac`.
- **Costos**: S0/S1 se factura por hora con tope mensual. La base inactiva sigue
  costando; si EBSA solo la usa en temporada, escalar a S0 y volver a S1 al importar.
- **Limpieza de históricos**: para liberar espacio, borrar los `data_runs` antiguos y
  sus filas (cada corte completo ocupa varios GB por la serie de consumo).

## 8. Seguridad

- Credenciales solo en `.env` local y en Vercel; nunca en Git (`.gitignore` ya cubre
  `.env` y los CSV/Parquet).
- Firewall del servidor con la IP del importador y "Azure services" activados; no
  abrir a `0.0.0.0`.
- TLS obligatorio (`encrypt=yes`).
- La aplicación no expone la base directamente: el backend valida el ID Token de
  Firebase y aplica los roles (`COMERCIAL`, `SOPORTE`, `ADMIN_MODELO`) antes de
  consultar.
