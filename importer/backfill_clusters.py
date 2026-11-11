"""Importa el dataset clusters (segmento de consumo) a una corrida ya importada.

La ficha del cliente muestra el segmento del cliente ("· segmento **URBANO_BASE_ESTABLE_GRANDE**")
y su descripción leyendo el parquet de clustering. El manifiesto ya lo declara, así que las
importaciones nuevas lo incluyen solas; este script lo añade a las corridas ya importadas
(local o Azure SQL), igual que el backfill del modelo del pronóstico.

Uso (desde la raíz del repositorio):

    .venv\\Scripts\\python -m importer.backfill_clusters
    .venv\\Scripts\\python -m importer.backfill_clusters --source C:/ruta/a/los/resultados
"""
from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import delete, select

from database.db import Base, SessionLocal, engine
from database.models import DataFile, DataRun, DatasetRecord
from importer.import_run import insert_batch, validate_columns
from importer.manifest import DATASETS
from importer.reading import clean_column_names, read_batches
from utilidades_glosario import enriquecer_glosario

CLUSTERS = next(spec for spec in DATASETS if spec.key == "clusters")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Importa el dataset clusters (segmento) a la última corrida importada.")
    result.add_argument("--source", type=Path, default=Path("streamlit_origen/datos"), help="Carpeta raíz de la corrida de resultados.")
    result.add_argument("--batch-size", type=int, default=5000)
    return result


def main() -> None:
    args = parser().parse_args()
    parquet = args.source / CLUSTERS.relative_path
    if not parquet.is_file():
        raise SystemExit(f"No existe el parquet de clusters: {parquet}")
    validate_columns(parquet, CLUSTERS)

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        run = db.scalar(select(DataRun).order_by(DataRun.id.desc()).limit(1))
        if run is None:
            raise SystemExit("Todavía no hay ninguna corrida importada; corra primero importer.import_run.")
        print(f"Corrida: #{run.id} ({run.period}) — {parquet}", flush=True)

        # Re-ejecutable: borra lo que hubiera de esta clave en la corrida y lo vuelve a importar.
        db.execute(delete(DatasetRecord).where(DatasetRecord.data_run_id == run.id, DatasetRecord.dataset_key == CLUSTERS.key))
        file_record = db.scalar(select(DataFile).where(DataFile.data_run_id == run.id, DataFile.dataset_key == CLUSTERS.key))
        if file_record is None:
            file_record = DataFile(data_run_id=run.id, dataset_key=CLUSTERS.key, relative_path=CLUSTERS.relative_path, file_type=CLUSTERS.file_kind, file_size_bytes=parquet.stat().st_size)
            db.add(file_record)
        file_record.status = "PROCESSING"
        db.commit()

        insertadas = 0
        try:
            for chunk in read_batches(parquet, args.batch_size):
                chunk = enriquecer_glosario(clean_column_names(chunk))
                insertadas += insert_batch(db, CLUSTERS, run.id, chunk.to_dict(orient="records"))
                db.commit()
                db.expunge_all()
                print(f"  {insertadas} filas…", flush=True)
        except Exception as exc:
            db.rollback()
            file_record.status = "ERROR"
            file_record.error_message = str(exc)
            db.commit()
            raise
        file_record.rows_seen = insertadas
        file_record.status = "COMPLETED"
        db.commit()
    print(f"Listo: {insertadas} filas de clusters en la corrida #{run.id}.", flush=True)


if __name__ == "__main__":
    main()
