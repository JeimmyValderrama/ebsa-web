"""Rellena client_forecasts.payload con el modelo elegido por horizonte.

El parquet de pronóstico es ancho y trae modelo_1m..modelo_6m por NIU; la ficha del
cliente los muestra en la tabla "Pronóstico a 6 meses" y en el aviso de la regla de
cero sostenido. El importador ya los escribe en las importaciones nuevas
(import_run.forecast_records); este script los añade a las corridas ya importadas.

Uso (desde la raíz del repositorio):

    .venv\\Scripts\\python -m importer.backfill_forecast_modelo
    .venv\\Scripts\\python -m importer.backfill_forecast_modelo --source C:/ruta/a/los/resultados
"""
from __future__ import annotations

import argparse
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
from sqlalchemy import bindparam, update

from database.db import database_url, engine
from database.models import ClientForecast

HORIZONTES = (1, 2, 3, 4, 5, 6)
RUTA_PRONOSTICO = "04_pronostico/modelo_final/predicciones_segmentadas_optimizadas_6_meses.parquet"


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Rellena client_forecasts.payload con el modelo por horizonte desde el parquet de pronóstico.")
    result.add_argument("--source", type=Path, default=Path("streamlit_origen/datos"), help="Carpeta raíz de la corrida de resultados.")
    result.add_argument("--batch-size", type=int, default=20000, help="Filas fuente por lote de actualización.")
    return result


def _fecha(valor: Any) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str) and valor:
        return date.fromisoformat(valor[:10])
    return None


def main() -> None:
    args = parser().parse_args()
    parquet = args.source / RUTA_PRONOSTICO
    if not parquet.is_file():
        raise SystemExit(f"No existe el parquet de pronóstico: {parquet}")
    print(f"Base: {database_url()}", flush=True)
    print(f"Fuente: {parquet}", flush=True)

    stmt = (
        update(ClientForecast)
        .where(
            ClientForecast.niu == bindparam("b_niu"),
            ClientForecast.horizonte == bindparam("b_horizonte"),
            ClientForecast.fecha_corte == bindparam("b_corte"),
        )
        .values(payload=bindparam("b_payload"))
    )

    columnas = ["NIU", "fecha_corte"] + [f"modelo_{h}m" for h in HORIZONTES]
    archivo = pq.ParquetFile(parquet)
    actualizadas = 0
    for lote in archivo.iter_batches(batch_size=args.batch_size, columns=columnas):
        filas: list[dict[str, Any]] = []
        for row in lote.to_pylist():
            corte = _fecha(row.get("fecha_corte"))
            niu = str(row.get("NIU") or "").strip()
            if not niu or corte is None:
                continue
            for horizonte in HORIZONTES:
                modelo = row.get(f"modelo_{horizonte}m")
                if not modelo:
                    continue
                filas.append({"b_niu": niu, "b_horizonte": horizonte, "b_corte": corte, "b_payload": {"modelo": str(modelo)}})
        if not filas:
            continue
        with engine.begin() as con:
            result = con.execute(stmt, filas)
            actualizadas += int(result.rowcount or 0)
        print(f"  {actualizadas} filas actualizadas…", flush=True)

    print(f"Listo: {actualizadas} filas de client_forecasts con payload.", flush=True)


if __name__ == "__main__":
    main()
