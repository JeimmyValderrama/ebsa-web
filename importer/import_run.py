from __future__ import annotations

import argparse
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import bindparam, func, insert, select, update
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


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Importa una corrida de resultados EBSA a Azure SQL Database.")
    result.add_argument("--source", required=True, type=Path, help="Carpeta raíz de resultados del pipeline.")
    result.add_argument("--periodo", required=True, help="Corte con formato YYYY-MM.")
    result.add_argument("--batch-size", type=int, default=5000)
    result.add_argument("--dry-run", action="store_true", help="Valida archivos y cuenta filas sin insertar datos.")
    result.add_argument("--database-url", help="DSN opcional; use mssql+mssqlpython://...")
    result.add_argument("--skip", action="append", default=[], metavar="DATASET", help="Clave de dataset a omitir (repetible).")
    result.add_argument("--min-periodo", help="Importa la serie mensual solo desde este periodo (YYYY-MM) para pruebas locales.")
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
    existing: set[str] = set()
    for chunk in batched(unique, 1000):
        existing.update(db.scalars(select(Client.niu).where(Client.niu.in_(chunk))).all())
    payload_records: dict[str, dict[str, Any]] = {record["niu"]: record for record in records or []}
    missing = [niu for niu in unique if niu not in existing]
    if missing:
        db.execute(insert(Client), [payload_records.get(niu, {"niu": niu}) for niu in missing])


def forecast_records(row: dict[str, Any], run_id: int) -> list[dict[str, Any]]:
    """El parquet de pronóstico es ancho (pred_1m..pred_6m); se convierte a filas largas."""
    niu = text(value(row, "NIU", "niu"))
    body = payload(row)
    corte = date_value(value(row, "fecha_corte"))
    records: list[dict[str, Any]] = []
    for horizonte in HORIZONTES:
        periodo = date_value(value(row, f"fecha_pred_{horizonte}m"))
        consumo = number(value(row, f"pred_{horizonte}m_kwh"))
        if periodo is None and consumo is None:
            continue
        records.append({
            "data_run_id": run_id,
            "niu": niu,
            "fecha_corte": corte,
            "horizonte": horizonte,
            "periodo_pronosticado": periodo,
            "consumo_pronosticado_kwh": consumo,
            "grupo_consumo": text(value(row, "grupo_consumo", "perfil")),
            "payload": body,
        })
    return records


def normalize_row(spec: DatasetSpec, row: dict[str, Any], run_id: int, min_periodo: Any = None) -> Any:
    target = spec.target
    niu = text(value(row, "NIU", "niu"))
    body = payload(row)
    corte = date_value(value(row, "fecha_corte", "corte"))
    common: dict[str, Any] = {"data_run_id": run_id, "niu": niu, "fecha_corte": corte, "payload": body}
    if target == "operational":
        return {**common, "ciclo": integer(value(row, "ciclo")), "ciclo_etiqueta": text(value(row, "ciclo_etiqueta")), "severidad": text(value(row, "severidad")), "trayectoria": text(value(row, "trayectoria")), "estado_en_lista": text(value(row, "estado_en_lista")), "prioridad_gestion": text(value(row, "prioridad_gestion")), "perdida_kwh_mes": number(value(row, "perdida_kwh_mes")), "valor_riesgo_mes": number(value(row, "valor_riesgo_mes")), "orden_en_ciclo": integer(value(row, "orden_en_ciclo"))}
    if target == "churn":
        return {**common, "nivel_riesgo": text(value(row, "nivel_riesgo")), "prob_fuga_6m": number(value(row, "prob_fuga_6m")), "valor_esperado_perdida_mes": number(value(row, "valor_esperado_perdida_mes")), "valor_en_riesgo_mes": number(value(row, "valor_en_riesgo_mes")), "senales": text(value(row, "senales"))}
    if target == "drop":
        return {**common, "veredicto": text(value(row, "veredicto")), "severidad": text(value(row, "severidad")), "consumo_anterior_kwh": number(value(row, "consumo_anterior_kwh")), "consumo_reciente_kwh": number(value(row, "consumo_reciente_kwh")), "variacion_vs_anterior_pct": number(value(row, "variacion_vs_anterior_pct")), "valor_riesgo_mes": number(value(row, "valor_riesgo_mes"))}
    if target == "forecast":
        return forecast_records(row, run_id)
    if target == "consumption":
        periodo = date_value(value(row, "periodo"))
        if periodo is None:
            return None
        if min_periodo is not None and periodo < min_periodo:
            return None
        return {"data_run_id": run_id, "niu": niu, "periodo": periodo, "consumo_kwh": number(value(row, "consumo_kwh_mensual", "consumo_kwh")), "es_rural": boolean(value(row, "es_rural")), "estado_mes": text(value(row, "estado_mes")), "payload": body}
    if target == "location":
        return {"niu": niu, "data_run_id": run_id, "municipio": text(value(row, "municipio")), "direccion": text(value(row, "direccion")), "latitud": number(value(row, "latitud")), "longitud": number(value(row, "longitud")), "coordenadas_validas": boolean(value(row, "coordenadas_validas")), "payload": body}
    return None


def insert_batch(db: Session, spec: DatasetSpec, run_id: int, rows: list[dict[str, Any]], min_periodo: Any = None) -> int:
    """Inserta un lote completo con executemany (una ida y vuelta por lote)."""
    if spec.target is None:
        records = [{"data_run_id": run_id, "dataset_key": spec.key, "niu": text(value(row, "NIU", "niu")), "payload": payload(row)} for row in rows]
        if records:
            db.execute(insert(DatasetRecord), records)
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
        db.execute(insert(model), records)
    return len(records)


def enrich_clients(db: Session, source: Path, batch_size: int) -> int:
    """Completa los atributos de clients (grupo, ciclo, zona, clase) en masa."""
    updated = 0
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
            fields = [key for key in records[0] if key != "niu"]
            statement = update(Client).where(Client.niu == bindparam("b_niu")).values(**{key: func.coalesce(bindparam(key), getattr(Client, key)) for key in fields})
            params = [{**record, "b_niu": record["niu"]} for record in records]
            db.execute(statement, params, execution_options={"synchronize_session": False})
            updated += len(records)
            db.commit()
            db.expunge_all()
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


def import_run(source: Path, period: str, batch_size: int, dry_run: bool, min_periodo: str | None = None, skip: list[str] | None = None) -> int:
    if not source.is_dir():
        raise FileNotFoundError(f"No existe la carpeta fuente: {source}")
    skip = set(skip or [])
    found, missing = discover(source)
    if missing:
        raise FileNotFoundError("Faltan archivos obligatorios: " + ", ".join(item.relative_path for item in missing))
    if not found:
        raise FileNotFoundError("No se encontró ningún archivo del manifiesto en la carpeta fuente.")
    found = [(spec, path) for spec, path in found if spec.key not in skip]

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
    with SessionLocal() as db:
        existing = db.scalar(select(DataRun).where(DataRun.period == period))
        if existing:
            raise ValueError(f"Ya existe una corrida para {period} con estado {existing.status}. No se sobrescribe automáticamente.")
        run = DataRun(period=period, source_path=str(source), files_total=len(found), status="STARTED")
        db.add(run)
        db.commit()
        db.refresh(run)
        total = 0
        try:
            for spec, path in found:
                file_record = DataFile(data_run_id=run.id, dataset_key=spec.key, relative_path=spec.relative_path, file_type=spec.file_kind, file_size_bytes=path.stat().st_size, status="PROCESSING")
                db.add(file_record)
                db.commit()
                file_rows = 0
                for chunk in read_batches(path, batch_size):
                    chunk = enriquecer_glosario(clean_column_names(chunk))
                    inserted = insert_batch(db, spec, run.id, chunk.to_dict(orient="records"), min_periodo=cutoff)
                    file_rows += inserted
                    total += inserted
                    db.commit()
                    db.expunge_all()
                file_record.rows_seen = file_rows
                file_record.status = "COMPLETED"
                db.commit()
            enrich_clients(db, source, batch_size)
            sync_pipeline_runs(source, db, run.id)
            run.status = "COMPLETED"
            run.rows_imported = total
            run.completed_at = datetime.utcnow()
            db.commit()
            print(f"Importación completa: periodo={period}, archivos={len(found)}, filas={total:,}")
            return total
        except Exception as exc:
            db.rollback()
            run.status = "ERROR"
            run.error_message = str(exc)
            db.commit()
            raise


def main() -> None:
    args = parser().parse_args()
    if args.database_url:
        os.environ["EBSA_DATABASE_URL"] = args.database_url
    if not len(args.periodo) == 7 or args.periodo[4] != "-":
        raise SystemExit("--periodo debe tener formato YYYY-MM")
    if args.min_periodo and (len(args.min_periodo) != 7 or args.min_periodo[4] != "-"):
        raise SystemExit("--min-periodo debe tener formato YYYY-MM")
    try:
        import_run(args.source, args.periodo, args.batch_size, args.dry_run, min_periodo=args.min_periodo, skip=args.skip)
    except (FileNotFoundError, ValueError) as exc:
        raise SystemExit(f"Error de importación: {exc}") from exc


if __name__ == "__main__":
    main()
