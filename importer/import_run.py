from __future__ import annotations

import argparse
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import Integer, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.db import Base, SessionLocal, engine
from database.models import (
    Client, ClientChurnRisk, ClientConsumptionMonthly, ClientDropAnalysis, ClientForecast,
    ClientLocation, DataFile, DataRun, DatasetRecord, OperationalManagement, PipelineRun,
)
from importer.manifest import DatasetSpec, discover
from importer.reading import (
    boolean, clean_column_names, date_value, integer, number, payload, read_batches, text, value,
)
from utilidades_glosario import enriquecer_glosario

# Datasets con tabla normalizada propia. El resto de las filas van a dataset_records.
TARGET_MODELS: dict[str, Any] = {
    "operational": OperationalManagement,
    "churn": ClientChurnRisk,
    "drop": ClientDropAnalysis,
    "forecast": ClientForecast,
    "consumption": ClientConsumptionMonthly,
    "location": ClientLocation,
}

HORIZONTES = (1, 2, 3, 4, 5, 6)

# Fuentes con los atributos del cliente (grupo, ciclo, zona, clase de servicio).
CLIENT_ENRICH_SOURCES = (
    "07_gestion_caida/gestion_caida_operativa.csv",
    "03_serie_modelado/niu_ciclo.parquet",
)

CORRIDA_PATTERN = re.compile(r"^(?P<fecha>\d{4}-\d{2}-\d{2})_(?P<hora>\d{4})_(?P<accion>[A-Za-z]+)$")

# Estados por tabla en el archivo de checkpoint de carga.
ESTADOS_CHECKPOINT = ("PENDIENTE", "EN_PROCESO", "COMPLETADO", "ERROR")

# Caché de NIUs que ya están confirmados en clients: evita repetir el SELECT
# por lote (son ~596 mil clientes y el lote se repite cada 2.000 filas).
_CLIENTES_CONFIRMADOS: set[str] = set()
_CLIENTES_EN_TRANSACCION: list[str] = []

# Planes de INSERT crudo por tabla: se preparan una vez y se reutilizan.
_PLANES_INSERT: dict[Any, tuple[list[Any], str]] = {}


def nuevo_estado() -> dict[str, Any]:
    return {
        "estado": "PENDIENTE",
        "filas_leidas": 0,
        "filas_insertadas": 0,
        "error": None,
        "inicio": None,
        "fin": None,
    }


def cargar_checkpoint(ruta: Path | None, periodo: str) -> dict[str, Any]:
    """Lee el checkpoint; si es de otro periodo o está ilegible, empieza de cero."""
    if ruta is None:
        return {"periodo": periodo, "datasets": {}}
    if ruta.is_file():
        try:
            datos = json.loads(ruta.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Checkpoint ilegible ({exc}); se empieza de cero.", flush=True)
            datos = None
        if isinstance(datos, dict) and datos.get("periodo") == periodo:
            return datos
        if datos:
            print(f"Checkpoint de otro periodo ({datos.get('periodo')}); se ignora.", flush=True)
    return {"periodo": periodo, "datasets": {}}


def guardar_checkpoint(ruta: Path | None, datos: dict[str, Any]) -> None:
    """Escribe el checkpoint de forma atómica (temporal + rename)."""
    if ruta is None:
        return
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(ruta.suffix + ".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporal, ruta)


def plan_insert(model: Any) -> tuple[list[Any], str]:
    """Columnas y sentencia INSERT de una tabla, sin la columna id (IDENTITY)."""
    if model not in _PLANES_INSERT:
        tabla = model.__table__
        pk_integer = {
            columna.name for columna in tabla.primary_key.columns if isinstance(columna.type, Integer)
        }
        columnas = [columna for columna in tabla.columns if columna.name not in pk_integer]
        dialect = engine.dialect
        procesadores = [(columna, columna.type.bind_processor(dialect)) for columna in columnas]
        sentencia = (
            f"INSERT INTO {tabla.name} ({', '.join(columna.name for columna in columnas)})"
            f" VALUES ({', '.join('?' for _ in columnas)})"
        )
        _PLANES_INSERT[model] = (procesadores, sentencia)
    return _PLANES_INSERT[model]


def _cursor_crudo(db: Session):
    conn = db.connection()
    crudo = getattr(conn, "driver_connection", None) or getattr(conn, "_dbapi_connection", None) or conn.connection
    if hasattr(crudo, "driver_connection"):
        crudo = crudo.driver_connection
    return crudo.cursor()


def insertar_filas(db: Session, model: Any, records: list[dict[str, Any]]) -> int:
    """INSERT en crudo con los procesadores de tipo de SQLAlchemy.

    El ORM fragmenta un lote en cientos de sentencias (una por fila en las
    tablas con payload) y cada una cuesta un viaje de red completo; este
    camino manda un solo executemany por lote con los mismos valores.
    """
    if not records:
        return 0
    procesadores, sentencia = plan_insert(model)
    cursor = _cursor_crudo(db)
    filas = []
    for record in records:
        valores = []
        for columna, procesar in procesadores:
            if columna.name in record:
                valor = record[columna.name]
            elif columna.default is not None:
                argumento = columna.default.arg
                if getattr(columna.default, "is_callable", False):
                    # SQLAlchemy envuelve los callables con un contexto de
                    # ejecución; el original (p. ej. datetime.utcnow) no lo pide.
                    original = getattr(argumento, "__wrapped__", None)
                    valor = original() if original is not None else argumento(None)
                else:
                    valor = argumento
            elif columna.nullable:
                valor = None
            else:
                raise ValueError(
                    f"Falta el valor obligatorio {columna.name} en el registro {record.get('niu', '?')}"
                )
            if procesar is not None:
                valor = procesar(valor)
            valores.append(valor)
        filas.append(tuple(valores))
    cursor.executemany(sentencia, filas)
    return len(filas)


def confirmar_clientes() -> None:
    """Se llama después de cada commit: esos NIU ya quedaron en la base."""
    _CLIENTES_CONFIRMADOS.update(_CLIENTES_EN_TRANSACCION)
    _CLIENTES_EN_TRANSACCION.clear()


def descartar_clientes() -> None:
    """Se llama tras un rollback: lo insertado en esa transacción no quedó."""
    _CLIENTES_EN_TRANSACCION.clear()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Importa una corrida de resultados EBSA a Azure SQL Database.")
    result.add_argument("--source", required=True, type=Path, help="Carpeta raíz de resultados del pipeline.")
    result.add_argument("--periodo", required=True, help="Corte con formato YYYY-MM.")
    result.add_argument("--batch-size", type=int, default=5000)
    result.add_argument("--dry-run", action="store_true", help="Valida archivos y cuenta filas sin insertar datos.")
    result.add_argument("--database-url", help="DSN opcional; use mssql+mssqlpython://...")
    result.add_argument("--skip", action="append", default=[], metavar="DATASET", help="Clave de dataset a omitir (repetible).")
    result.add_argument("--min-periodo", help="Importa la serie mensual solo desde este periodo (YYYY-MM) para pruebas locales.")
    result.add_argument("--checkpoint", type=Path, default=Path("carga_checkpoint.json"), help="Archivo de estado por tabla para reanudar la carga.")
    result.add_argument("--sin-checkpoint", action="store_true", help="Desactiva el checkpoint: una sola pasada sin reanudación.")
    result.add_argument("--al-fallar", choices=("continuar", "detener"), default="continuar", help="Ante una tabla con error: continuar con la siguiente o detener la carga.")
    result.add_argument("--reiniciar-tabla", action="append", default=[], metavar="DATASET", help="Borra las filas de esa tabla en esta corrida y la vuelve a cargar (repetible).")
    result.add_argument("--solo-tablas", action="append", default=[], metavar="DATASET", help="Carga únicamente esos datasets (repetible).")
    return result


def batched(items: list[Any], size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def validate_columns(path: Path, spec: DatasetSpec) -> set[str]:
    if path.suffix.lower() == ".csv":
        columns = set(pd.read_csv(path, nrows=0, encoding="utf-8-sig").columns.astype(str).str.strip())
    else:
        import pyarrow.parquet as pq
        columns = set(pq.ParquetFile(path).schema.names)
    missing = set(spec.required_columns) - columns
    if missing:
        raise ValueError(f"{spec.relative_path}: faltan columnas obligatorias: {', '.join(sorted(missing))}")
    return columns


def client_fields(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "clase_servicio": text(value(row, "clase_servicio")),
        "clase_servicio_nombre": text(value(row, "clase_servicio_nombre")),
        "grupo_consumo": text(value(row, "grupo_consumo", "grupo")),
        "estrato": integer(value(row, "estrato")),
        "ciclo": integer(value(row, "ciclo", "ciclo_actual")),
        "ciclo_etiqueta": text(value(row, "ciclo_etiqueta")),
        "zona_nombre": text(value(row, "zona_nombre", "zona")),
        "zona_regional": text(value(row, "zona_regional")),
    }


def ensure_clients(db: Session, nius: list[str], records: list[dict[str, Any]] | None = None) -> None:
    """Inserta en masa los NIU que aún no existen en clients (clave foránea)."""
    unique = list(dict.fromkeys(niu for niu in nius if niu))
    if not unique:
        return
    candidatos = [niu for niu in unique if niu not in _CLIENTES_CONFIRMADOS]
    if not candidatos:
        return
    ya_en_transaccion = set(_CLIENTES_EN_TRANSACCION)
    existing: set[str] = set()
    for chunk in batched(candidatos, 1000):
        existing.update(db.scalars(select(Client.niu).where(Client.niu.in_(chunk))).all())
    # Los que ya estaban se confirman; los insertados en esta misma transacción
    # se quedan pendientes hasta que el commit los confirme.
    _CLIENTES_CONFIRMADOS.update(existing - ya_en_transaccion)
    payload_records: dict[str, dict[str, Any]] = {record["niu"]: record for record in records or []}
    missing = [niu for niu in candidatos if niu not in existing]
    if missing:
        insertar_filas(db, Client, [payload_records.get(niu, {"niu": niu}) for niu in missing])
        _CLIENTES_EN_TRANSACCION.extend(missing)


def forecast_records(row: dict[str, Any], run_id: int) -> list[dict[str, Any]]:
    """El parquet de pronóstico es ancho (pred_1m..pred_6m); se convierte a filas largas.

    No se guarda el JSON de la fila fuente: cada fila derretida ya lleva sus columnas
    tipadas, y el original repite las 34 columnas seis veces (≈6 GB sin aportar nada).
    El payload se queda solo con el modelo elegido por horizonte, que la ficha muestra
    en la tabla del pronóstico a 6 meses.
    """
    niu = text(value(row, "NIU", "niu"))
    corte = date_value(value(row, "fecha_corte"))
    records: list[dict[str, Any]] = []
    for horizonte in HORIZONTES:
        periodo = date_value(value(row, f"fecha_pred_{horizonte}m"))
        consumo = number(value(row, f"pred_{horizonte}m_kwh"))
        if periodo is None and consumo is None:
            continue
        modelo = text(value(row, f"modelo_{horizonte}m"))
        records.append({
            "data_run_id": run_id,
            "niu": niu,
            "fecha_corte": corte,
            "horizonte": horizonte,
            "periodo_pronosticado": periodo,
            "consumo_pronosticado_kwh": consumo,
            "grupo_consumo": text(value(row, "grupo_consumo", "perfil")),
            "payload": {"modelo": modelo} if modelo else None,
        })
    return records


def normalize_row(spec: DatasetSpec, row: dict[str, Any], run_id: int, min_periodo: Any = None) -> Any:
    target = spec.target
    niu = text(value(row, "NIU", "niu"))
    corte = date_value(value(row, "fecha_corte", "corte"))
    if target == "forecast":
        return forecast_records(row, run_id)
    if target == "consumption":
        # Sin payload: la serie solo se sirve por sus columnas tipadas y la tabla
        # llega a ~28,5 millones de filas (el JSON la duplicaría de tamaño).
        periodo = date_value(value(row, "periodo"))
        if periodo is None:
            return None
        if min_periodo is not None and periodo < min_periodo:
            return None
        return {"data_run_id": run_id, "niu": niu, "periodo": periodo, "consumo_kwh": number(value(row, "consumo_kwh_mensual", "consumo_kwh")), "es_rural": boolean(value(row, "es_rural")), "estado_mes": text(value(row, "estado_mes"))}
    body = payload(row)
    common: dict[str, Any] = {"data_run_id": run_id, "niu": niu, "fecha_corte": corte, "payload": body}
    if target == "operational":
        # La lista de gestión trae el ciclo en ciclo_etiqueta ("0".."38"); ciclo es opcional.
        ciclo = integer(value(row, "ciclo")) if value(row, "ciclo") is not None else integer(value(row, "ciclo_etiqueta"))
        return {**common, "ciclo": ciclo, "ciclo_etiqueta": text(value(row, "ciclo_etiqueta")), "severidad": text(value(row, "severidad")), "trayectoria": text(value(row, "trayectoria")), "estado_en_lista": text(value(row, "estado_en_lista")), "prioridad_gestion": text(value(row, "prioridad_gestion")), "perdida_kwh_mes": number(value(row, "perdida_kwh_mes")), "valor_riesgo_mes": number(value(row, "valor_riesgo_mes")), "orden_en_ciclo": integer(value(row, "orden_en_ciclo"))}
    if target == "churn":
        return {**common, "nivel_riesgo": text(value(row, "nivel_riesgo")), "prob_fuga_6m": number(value(row, "prob_fuga_6m")), "valor_esperado_perdida_mes": number(value(row, "valor_esperado_perdida_mes")), "valor_en_riesgo_mes": number(value(row, "valor_en_riesgo_mes")), "senales": text(value(row, "senales"))}
    if target == "drop":
        return {**common, "veredicto": text(value(row, "veredicto")), "severidad": text(value(row, "severidad")), "consumo_anterior_kwh": number(value(row, "consumo_anterior_kwh")), "consumo_reciente_kwh": number(value(row, "consumo_reciente_kwh")), "variacion_vs_anterior_pct": number(value(row, "variacion_vs_anterior_pct")), "valor_riesgo_mes": number(value(row, "valor_riesgo_mes"))}
    if target == "location":
        return {"niu": niu, "data_run_id": run_id, "municipio": text(value(row, "municipio")), "direccion": text(value(row, "direccion")), "latitud": number(value(row, "latitud")), "longitud": number(value(row, "longitud")), "coordenadas_validas": boolean(value(row, "coordenadas_validas")), "payload": body}
    return None


def insert_batch(db: Session, spec: DatasetSpec, run_id: int, rows: list[dict[str, Any]], min_periodo: Any = None) -> int:
    """Inserta un lote completo con un solo executemany por lote."""
    if spec.target is None:
        records = [{"data_run_id": run_id, "dataset_key": spec.key, "niu": text(value(row, "NIU", "niu")), "payload": payload(row)} for row in rows]
        if records:
            insertar_filas(db, DatasetRecord, records)
        return len(records)

    if spec.target == "client":
        client_records = []
        for row in rows:
            niu = text(value(row, "NIU", "niu"))
            if not niu:
                continue
            record = {"niu": niu}
            record.update({key: item for key, item in client_fields(row).items() if item is not None})
            client_records.append(record)
        ensure_clients(db, [record["niu"] for record in client_records], client_records)
        return len(client_records)

    model = TARGET_MODELS[spec.target]
    records: list[dict[str, Any]] = []
    nius: list[str] = []
    for row in rows:
        item = normalize_row(spec, row, run_id, min_periodo=min_periodo)
        if item is None:
            continue
        if isinstance(item, list):
            records.extend(item)
            nius.extend(record["niu"] for record in item if record["niu"])
        else:
            records.append(item)
            if item["niu"]:
                nius.append(item["niu"])
    ensure_clients(db, nius)
    if records:
        insertar_filas(db, model, records)
    return len(records)


def actualizar_clientes(db: Session, records: list[dict[str, Any]]) -> int:
    """Actualiza los atributos de clients en un solo executemany.

    El UPDATE del ORM emite una sentencia por fila (miles de idas y vueltas
    de red por lote, y una sola basta para dejar la conexión a medias). Aquí
    se manda un solo executemany con la misma cláusula COALESCE, que conserva
    el valor actual de la columna cuando el valor nuevo viene en NULL.
    """
    if not records:
        return 0
    campos = [key for key in records[0] if key != "niu"]
    if not campos:
        return 0
    tabla = Client.__table__
    dialect = engine.dialect
    procesadores = [
        (tabla.c[nombre], tabla.c[nombre].type.bind_processor(dialect)) for nombre in campos
    ]
    sentencia = (
        f"UPDATE {tabla.name} SET "
        + ", ".join(f"{columna.name} = COALESCE(?, {columna.name})" for columna, _ in procesadores)
        + " WHERE niu = ?"
    )
    procesador_niu = tabla.c["niu"].type.bind_processor(dialect)
    filas = []
    for record in records:
        valores = []
        for columna, procesar in procesadores:
            valor = record.get(columna.name)
            if procesar is not None:
                valor = procesar(valor)
            valores.append(valor)
        clave = record.get("niu")
        if procesador_niu is not None:
            clave = procesador_niu(clave)
        filas.append(tuple(valores) + (clave,))
    cursor = _cursor_crudo(db)
    cursor.executemany(sentencia, filas)
    return len(filas)


def enrich_clients(db: Session, source: Path, batch_size: int) -> int:
    """Completa los atributos de clients (grupo, ciclo, zona, clase) en masa."""
    updated = 0
    inicio_avance = time.time()
    ultimo_avance = inicio_avance
    for relative in CLIENT_ENRICH_SOURCES:
        path = source / relative
        if not path.is_file():
            continue
        for chunk in read_batches(path, batch_size):
            chunk = enriquecer_glosario(clean_column_names(chunk))
            records = []
            for row in chunk.to_dict(orient="records"):
                niu = text(value(row, "NIU", "niu"))
                if not niu:
                    continue
                record = {"niu": niu, **client_fields(row)}
                records.append(record)
            if not records:
                continue
            ensure_clients(db, [record["niu"] for record in records], records)
            actualizar_clientes(db, records)
            updated += len(records)
            db.commit()
            db.expunge_all()
            ahora = time.time()
            if ahora - ultimo_avance >= 30:
                print(
                    f"[avance] enrich_clients: {updated:,} filas ({relative}) "
                    f"({updated / max(ahora - inicio_avance, 1):,.0f} filas/s)",
                    flush=True,
                )
                ultimo_avance = ahora
    return updated


def pipeline_run_folders(source: Path) -> list[Path]:
    root = source / "09_registro_corridas"
    if not root.is_dir():
        return []
    return sorted((folder for folder in root.iterdir() if folder.is_dir() and (folder / "resumen_corrida.txt").is_file()), reverse=True)


def sync_pipeline_runs(source: Path, db: Session, run_id: int | None, limit: int = 20) -> int:
    """Crea o actualiza las filas de pipeline_runs a partir de 09_registro_corridas."""
    updated = 0
    for folder in pipeline_run_folders(source)[:limit]:
        match = CORRIDA_PATTERN.match(folder.name)
        started = None
        if match:
            started = datetime.strptime(f"{match['fecha']} {match['hora']}", "%Y-%m-%d %H%M")
        summary = (folder / "resumen_corrida.txt").read_text(encoding="utf-8", errors="replace")
        row = db.scalar(select(PipelineRun).where(PipelineRun.folder_name == folder.name))
        if row is None:
            row = PipelineRun(folder_name=folder.name)
            db.add(row)
        row.action = match["accion"] if match else None
        row.started_at = started
        row.summary_text = summary
        row.data_run_id = run_id
        updated += 1
    db.commit()
    return updated


def borrar_dataset(db: Session, spec: DatasetSpec, run_id: int) -> int:
    """Borra las filas de un dataset dentro de la corrida (para reiniciarlo)."""
    if spec.target is None:
        resultado = db.execute(
            delete(DatasetRecord).where(
                DatasetRecord.data_run_id == run_id, DatasetRecord.dataset_key == spec.key
            )
        )
    elif spec.target == "client":
        # clients es compartida entre datasets: no se borra, solo se reinserta lo que falte.
        db.commit()
        return 0
    else:
        tabla = TARGET_MODELS[spec.target].__table__
        if "data_run_id" not in tabla.c:
            db.commit()
            return 0
        resultado = db.execute(delete(tabla).where(tabla.c.data_run_id == run_id))
    db.commit()
    return int(resultado.rowcount or 0)


def procesar_archivo(
    db: Session,
    spec: DatasetSpec,
    path: Path,
    run_id: int,
    batch_size: int,
    cutoff: Any,
    estado: dict[str, Any],
    checkpoint: dict[str, Any],
    ruta_checkpoint: Path | None,
) -> int:
    """Carga un dataset de principio a fin, reanudando desde el checkpoint.

    El offset se guarda en filas leídas del archivo fuente y solo avanza
    después de cada commit: una caída repite como máximo el último lote y
    nunca las tablas ya completadas.
    """
    offset = int(estado.get("filas_leidas") or 0)
    insertadas = int(estado.get("filas_insertadas") or 0)
    insertadas_inicio = insertadas
    leidas = 0
    reanudando = offset > 0
    estado["inicio"] = estado.get("inicio") or datetime.utcnow().isoformat(timespec="seconds")
    inicio = time.time()
    ultimo_avance = inicio
    for chunk in read_batches(path, batch_size):
        if leidas < offset:
            leidas += len(chunk)
            continue
        frame = enriquecer_glosario(clean_column_names(chunk))
        filas = frame.to_dict(orient="records")
        try:
            nuevas = insert_batch(db, spec, run_id, filas, min_periodo=cutoff)
            db.commit()
        except IntegrityError:
            if reanudando and leidas == offset:
                # El lote anterior se confirmó antes de que el checkpoint se
                # escribiera: ya está en la base, se avanza sin repetirlo.
                print(
                    f"[checkpoint] {spec.key}: el lote de {len(filas)} filas ya estaba insertado; se continúa.",
                    flush=True,
                )
                leidas += len(chunk)
                reanudando = False
                continue
            raise
        confirmar_clientes()
        reanudando = False
        leidas += len(filas)
        insertadas += nuevas
        db.expunge_all()
        estado.update({
            "estado": "EN_PROCESO",
            "filas_leidas": leidas,
            "filas_insertadas": insertadas,
            "error": None,
        })
        guardar_checkpoint(ruta_checkpoint, checkpoint)
        ahora = time.time()
        if ahora - ultimo_avance >= 30:
            segundos = max(ahora - inicio, 1)
            print(
                f"[avance] {spec.key}: insertadas={insertadas:,} leidas={leidas:,}"
                f" ({(insertadas - insertadas_inicio) / segundos:,.0f} filas/s)",
                flush=True,
            )
            ultimo_avance = ahora
    estado.update({
        "estado": "COMPLETADO",
        "filas_leidas": leidas,
        "filas_insertadas": insertadas,
        "error": None,
        "fin": datetime.utcnow().isoformat(timespec="seconds"),
    })
    guardar_checkpoint(ruta_checkpoint, checkpoint)
    return insertadas


def import_run(
    source: Path,
    period: str,
    batch_size: int,
    dry_run: bool,
    min_periodo: str | None = None,
    skip: list[str] | None = None,
    checkpoint: Path | None = Path("carga_checkpoint.json"),
    al_fallar: str = "continuar",
    reiniciar: list[str] | None = None,
    solo: list[str] | None = None,
) -> int:
    if not source.is_dir():
        raise FileNotFoundError(f"No existe la carpeta fuente: {source}")
    skip = set(skip or [])
    found, missing = discover(source)
    if missing:
        raise FileNotFoundError("Faltan archivos obligatorios: " + ", ".join(item.relative_path for item in missing))
    if not found:
        raise FileNotFoundError("No se encontró ningún archivo del manifiesto en la carpeta fuente.")
    found = [(spec, path) for spec, path in found if spec.key not in skip]

    if solo:
        solo_set = set(solo)
        desconocidos = solo_set - {spec.key for spec, _ in found}
        if desconocidos:
            raise ValueError("Claves desconocidas en --solo-tablas: " + ", ".join(sorted(desconocidos)))
        found = [(spec, path) for spec, path in found if spec.key in solo_set]

    for spec, path in found:
        validate_columns(path, spec)

    cutoff = pd.Timestamp(min_periodo).date() if min_periodo else None

    if dry_run:
        total = 0
        for spec, path in found:
            rows = sum(len(clean_column_names(batch)) for batch in read_batches(path, batch_size))
            print(f"OK {spec.key}: {rows:,} filas — {path}")
            total += rows
        corridas = len(pipeline_run_folders(source))
        if corridas:
            print(f"Corridas del pipeline detectadas: {corridas} (09_registro_corridas).")
        print(f"Validación completa: {len(found)} archivos, {total:,} filas.")
        return total

    Base.metadata.create_all(bind=engine)
    ck = cargar_checkpoint(checkpoint, period)
    estados: dict[str, Any] = ck.setdefault("datasets", {})
    for spec, _ in found:
        estados.setdefault(spec.key, nuevo_estado())
    guardar_checkpoint(checkpoint, ck)

    with SessionLocal() as db:
        run = db.scalar(select(DataRun).where(DataRun.period == period))
        if run is None:
            run = DataRun(period=period, source_path=str(source), files_total=len(found), status="STARTED")
            db.add(run)
            db.commit()
            db.refresh(run)
        elif checkpoint is None:
            # Sin checkpoint no hay reanudación segura: se conserva la guarda
            # original para no sobrescribir una corrida existente.
            raise ValueError(
                f"Ya existe una corrida para {period} con estado {run.status}. No se sobrescribe automáticamente."
            )
        else:
            print(f"[checkpoint] reanudando la corrida {run.id} (estado previo {run.status}).", flush=True)
            run.status = "STARTED"
            run.error_message = None
            run.files_total = len(found)
            db.commit()
        ck["run_id"] = run.id
        guardar_checkpoint(checkpoint, ck)
        run_id = run.id

        # Reinicio forzoso de tablas puntuales (--reiniciar-tabla).
        reiniciar_set = set(reiniciar or [])
        for spec, path in found:
            if spec.key not in reiniciar_set:
                continue
            estado = estados[spec.key]
            if estado["filas_leidas"] or estado["estado"] == "COMPLETADO":
                borradas = borrar_dataset(db, spec, run_id)
                print(f"[checkpoint] --reiniciar-tabla {spec.key}: {borradas:,} filas borradas; se arranca de cero.", flush=True)
            estados[spec.key] = nuevo_estado()
            registro = db.scalar(
                select(DataFile).where(DataFile.data_run_id == run_id, DataFile.dataset_key == spec.key)
            )
            if registro is not None:
                registro.status = "PENDING"
                registro.rows_seen = 0
                db.commit()
        guardar_checkpoint(checkpoint, ck)

        fallos: list[tuple[str, str]] = []

        for spec, path in found:
            estado = estados[spec.key]
            if estado["estado"] == "COMPLETADO":
                print(
                    f"[checkpoint] {spec.key}: COMPLETADO ({estado.get('filas_insertadas', 0):,} filas) -> se omite",
                    flush=True,
                )
                continue
            if estado["estado"] == "EN_PROCESO":
                print(f"[checkpoint] {spec.key}: se reanuda en la fila {estado.get('filas_leidas', 0):,}", flush=True)
            elif estado["estado"] == "ERROR":
                print(
                    f"[checkpoint] {spec.key}: error previo ({estado.get('error')});"
                    f" se reintenta desde la fila {estado.get('filas_leidas', 0):,}",
                    flush=True,
                )

            registro = db.scalar(
                select(DataFile).where(DataFile.data_run_id == run_id, DataFile.dataset_key == spec.key)
            )
            if registro is None:
                registro = DataFile(
                    data_run_id=run_id,
                    dataset_key=spec.key,
                    relative_path=spec.relative_path,
                    file_type=spec.file_kind,
                    file_size_bytes=path.stat().st_size,
                    status="PROCESSING",
                )
                db.add(registro)
            else:
                registro.status = "PROCESSING"
                registro.file_size_bytes = path.stat().st_size
            db.commit()
            archivo_id = registro.id

            try:
                procesar_archivo(db, spec, path, run_id, batch_size, cutoff, estado, ck, checkpoint)
            except Exception as exc:
                db.rollback()
                descartar_clientes()
                mensaje = f"{type(exc).__name__}: {exc}"
                estado.update({"estado": "ERROR", "error": mensaje[:1000]})
                guardar_checkpoint(checkpoint, ck)
                fallos.append((spec.key, mensaje))
                print(f"[checkpoint] {spec.key}: ERROR -> {mensaje}", flush=True)
                print(
                    f"[checkpoint] quedó registrado en {checkpoint}; la próxima ejecución reintenta solo esa tabla.",
                    flush=True,
                )
                try:
                    registro = db.get(DataFile, archivo_id)
                    if registro is not None:
                        registro.status = "ERROR"
                        db.commit()
                except Exception as secundario:
                    db.rollback()
                    print(f"[checkpoint] no se pudo marcar data_files: {secundario}", flush=True)
                if al_fallar == "detener":
                    try:
                        run_fila = db.get(DataRun, run_id)
                        if run_fila is not None:
                            run_fila.status = "ERROR"
                            run_fila.error_message = mensaje[:2000]
                            db.commit()
                    except Exception:
                        db.rollback()
                    raise
                continue

            try:
                registro = db.get(DataFile, archivo_id)
                if registro is not None:
                    registro.rows_seen = int(estado.get("filas_insertadas") or 0)
                    registro.status = "COMPLETED"
                    db.commit()
            except Exception as secundario:
                db.rollback()
                print(f"[checkpoint] no se pudo marcar data_files: {secundario}", flush=True)
            print(
                f"[checkpoint] {spec.key}: COMPLETADO ({estado.get('filas_insertadas', 0):,} filas insertadas)",
                flush=True,
            )

        if not fallos:
            try:
                print("[checkpoint] enriqueciendo clients y sincronizando corridas del pipeline...", flush=True)
                enrich_clients(db, source, batch_size)
                sync_pipeline_runs(source, db, run_id)
            except Exception as exc:
                db.rollback()
                descartar_clientes()
                fallos.append(("enriquecimiento", f"{type(exc).__name__}: {exc}"))
                print(f"[checkpoint] ERROR en enriquecimiento/sync: {exc}", flush=True)

        total = sum(int(estados.get(spec.key, {}).get("filas_insertadas") or 0) for spec, _ in found)

        if fallos:
            resumen = "; ".join(f"{clave}: {mensaje}" for clave, mensaje in fallos)
            try:
                run_fila = db.get(DataRun, run_id)
                if run_fila is not None:
                    run_fila.status = "ERROR"
                    run_fila.error_message = resumen[:2000]
                    run_fila.rows_imported = total
                    db.commit()
            except Exception:
                db.rollback()
            print(f"Carga incompleta ({len(fallos)} tabla(s) con error): {resumen}", flush=True)
            print(
                "Vuelva a ejecutar el mismo comando para reanudar; use --reiniciar-tabla <clave> para recargar una tabla desde cero.",
                flush=True,
            )
            return total

        try:
            run_fila = db.get(DataRun, run_id)
            if run_fila is not None:
                run_fila.status = "COMPLETED"
                run_fila.rows_imported = total
                run_fila.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
            print("[checkpoint] no se pudo marcar la corrida como COMPLETED (los datos ya quedaron).", flush=True)
        print(f"Importación completa: periodo={period}, archivos={len(found)}, filas={total:,}")
        return total


def main() -> None:
    args = parser().parse_args()
    if args.database_url:
        os.environ["EBSA_DATABASE_URL"] = args.database_url
    if not len(args.periodo) == 7 or args.periodo[4] != "-":
        raise SystemExit("--periodo debe tener formato YYYY-MM")
    if args.min_periodo and (len(args.min_periodo) != 7 or args.min_periodo[4] != "-"):
        raise SystemExit("--min-periodo debe tener formato YYYY-MM")
    try:
        import_run(
            args.source,
            args.periodo,
            args.batch_size,
            args.dry_run,
            min_periodo=args.min_periodo,
            skip=args.skip,
            checkpoint=None if args.sin_checkpoint else args.checkpoint,
            al_fallar=args.al_fallar,
            reiniciar=args.reiniciar_tabla,
            solo=args.solo_tablas,
        )
    except (FileNotFoundError, ValueError) as exc:
        raise SystemExit(f"Error de importación: {exc}") from exc


if __name__ == "__main__":
    main()
