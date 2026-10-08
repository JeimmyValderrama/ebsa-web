from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.db import Base, SessionLocal, engine
from database.models import (
    Client, ClientChurnRisk, ClientConsumptionMonthly, ClientDropAnalysis, ClientForecast,
    ClientLocation, DataFile, DataRun, DatasetRecord, OperationalManagement,
)
from importer.manifest import DatasetSpec, discover
from importer.reading import clean_column_names, date_value, integer, number, payload, text, value, boolean, read_batches
from utilidades_glosario import enriquecer_glosario


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Importa una corrida de resultados EBSA a PostgreSQL.")
    result.add_argument("--source", required=True, type=Path, help="Carpeta raíz de resultados del pipeline.")
    result.add_argument("--periodo", required=True, help="Corte con formato YYYY-MM.")
    result.add_argument("--batch-size", type=int, default=5000)
    result.add_argument("--dry-run", action="store_true", help="Valida archivos y cuenta filas sin insertar datos.")
    result.add_argument("--database-url", help="DSN opcional; preferiblemente postgresql+psycopg://...")
    return result


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


def ensure_client(db: Session, row: dict[str, Any]) -> str | None:
    niu = text(value(row, "NIU", "niu"))
    if not niu:
        return None
    client = db.get(Client, niu)
    if client is None:
        client = Client(niu=niu)
        db.add(client)
    client.clase_servicio = text(value(row, "clase_servicio")) or client.clase_servicio
    client.clase_servicio_nombre = text(value(row, "clase_servicio_nombre")) or client.clase_servicio_nombre
    client.grupo_consumo = text(value(row, "grupo_consumo", "grupo")) or client.grupo_consumo
    client.estrato = integer(value(row, "estrato"))
    client.ciclo = integer(value(row, "ciclo", "ciclo_actual"))
    client.ciclo_etiqueta = text(value(row, "ciclo_etiqueta"))
    client.zona_nombre = text(value(row, "zona_nombre", "zona"))
    client.zona_regional = text(value(row, "zona_regional"))
    client.payload = payload(row)
    return niu


def insert_row(db: Session, spec: DatasetSpec, run_id: int, row: dict[str, Any]) -> None:
    niu = ensure_client(db, row)
    target = spec.target
    if target is None:
        db.add(DatasetRecord(data_run_id=run_id, dataset_key=spec.key, niu=niu, payload=payload(row)))
        return
    if target == "client" or not niu:
        return
    corte = date_value(value(row, "fecha_corte", "corte"))
    common = {"data_run_id": run_id, "niu": niu, "fecha_corte": corte, "payload": payload(row)}
    if target == "operational":
        db.add(OperationalManagement(**common, ciclo=integer(value(row, "ciclo")), ciclo_etiqueta=text(value(row, "ciclo_etiqueta")), severidad=text(value(row, "severidad")), trayectoria=text(value(row, "trayectoria")), estado_en_lista=text(value(row, "estado_en_lista")), prioridad_gestion=text(value(row, "prioridad_gestion")), perdida_kwh_mes=number(value(row, "perdida_kwh_mes")), valor_riesgo_mes=number(value(row, "valor_riesgo_mes")), orden_en_ciclo=integer(value(row, "orden_en_ciclo"))))
    elif target == "churn":
        db.add(ClientChurnRisk(**common, nivel_riesgo=text(value(row, "nivel_riesgo")), prob_fuga_6m=number(value(row, "prob_fuga_6m")), valor_esperado_perdida_mes=number(value(row, "valor_esperado_perdida_mes")), valor_en_riesgo_mes=number(value(row, "valor_en_riesgo_mes")), senales=text(value(row, "senales"))))
    elif target == "drop":
        db.add(ClientDropAnalysis(**common, veredicto=text(value(row, "veredicto")), severidad=text(value(row, "severidad")), consumo_anterior_kwh=number(value(row, "consumo_anterior_kwh")), consumo_reciente_kwh=number(value(row, "consumo_reciente_kwh")), variacion_vs_anterior_pct=number(value(row, "variacion_vs_anterior_pct")), valor_riesgo_mes=number(value(row, "valor_riesgo_mes"))))
    elif target == "forecast":
        db.add(ClientForecast(**common, horizonte=integer(value(row, "horizonte", "paso")), periodo_pronosticado=date_value(value(row, "periodo_pronosticado", "periodo")), consumo_pronosticado_kwh=number(value(row, "consumo_pronosticado_kwh", "prediccion_kwh", "pronostico_kwh")), grupo_consumo=text(value(row, "grupo_consumo"))))
    elif target == "consumption":
        periodo = date_value(value(row, "periodo"))
        if periodo:
            db.add(ClientConsumptionMonthly(data_run_id=run_id, niu=niu, periodo=periodo, consumo_kwh=number(value(row, "consumo_kwh_mensual", "consumo_kwh")), es_rural=boolean(value(row, "es_rural")), estado_mes=text(value(row, "estado_mes")), payload=payload(row)))
    elif target == "location":
        db.add(ClientLocation(niu=niu, data_run_id=run_id, municipio=text(value(row, "municipio")), direccion=text(value(row, "direccion")), latitud=number(value(row, "latitud")), longitud=number(value(row, "longitud")), coordenadas_validas=boolean(value(row, "coordenadas_validas")), payload=payload(row)))


def import_run(source: Path, period: str, batch_size: int, dry_run: bool) -> int:
    if not source.is_dir():
        raise FileNotFoundError(f"No existe la carpeta fuente: {source}")
    found, missing = discover(source)
    if missing:
        raise FileNotFoundError("Faltan archivos obligatorios: " + ", ".join(item.relative_path for item in missing))
    if not found:
        raise FileNotFoundError("No se encontró ningún archivo del manifiesto en la carpeta fuente.")

    for spec, path in found:
        validate_columns(path, spec)

    if dry_run:
        total = 0
        for spec, path in found:
            rows = sum(len(clean_column_names(batch)) for batch in read_batches(path, batch_size))
            print(f"OK {spec.key}: {rows:,} filas — {path}")
            total += rows
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
                for batch in read_batches(path, batch_size):
                    batch = enriquecer_glosario(clean_column_names(batch))
                    for row in batch.to_dict(orient="records"):
                        insert_row(db, spec, run.id, row)
                    file_rows += len(batch)
                    total += len(batch)
                    db.commit()
                file_record.rows_seen = file_rows
                file_record.status = "COMPLETED"
                db.commit()
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
    try:
        import_run(args.source, args.periodo, args.batch_size, args.dry_run)
    except (FileNotFoundError, ValueError) as exc:
        raise SystemExit(f"Error de importación: {exc}") from exc


if __name__ == "__main__":
    main()
