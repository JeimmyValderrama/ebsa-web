from __future__ import annotations

import os
import shutil
import sys
from datetime import date
from pathlib import Path

# Base SQLite temporal para no tocar Azure SQL ni los datos reales.
TEST_DB = Path(__file__).resolve().parent / "importer_test.db"
os.environ["EBSA_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402

from api.app import datasets as dataset_service  # noqa: E402
from database.db import Base, SessionLocal, engine  # noqa: E402
from database.models import (  # noqa: E402
    Client,
    ClientChurnRisk,
    ClientConsumptionMonthly,
    ClientForecast,
    DataRun,
    DatasetRecord,
)
from importer.import_run import enrich_clients, insert_batch  # noqa: E402
from importer.manifest import DATASETS  # noqa: E402


def spec_for(key: str):
    return next(spec for spec in DATASETS if spec.key == key)


def wide_forecast_row(niu: str) -> dict[str, object]:
    """Fila real del parquet de pronóstico: 6 horizontes en columnas."""
    row: dict[str, object] = {"NIU": niu, "fecha_corte": "2026-04-01", "perfil": "P0_INTERMITENTE"}
    for horizonte in range(1, 7):
        row[f"fecha_pred_{horizonte}m"] = f"2026-{4 + horizonte:02d}-01"
        row[f"pred_{horizonte}m_kwh"] = horizonte * 10.5
    return row


def run() -> None:
    if TEST_DB.exists():
        TEST_DB.unlink()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        run_row = DataRun(period="2026-04", source_path="fixture", status="COMPLETED", files_total=1, rows_imported=0)
        db.add(run_row)
        db.commit()
        db.refresh(run_row)

        # 1. El parquet de pronóstico ancho debe virar a 6 filas largas por cliente.
        insert_batch(db, spec_for("forecast"), run_row.id, [wide_forecast_row("A-1"), wide_forecast_row("A-2")])
        forecasts = db.scalars(select(ClientForecast).order_by(ClientForecast.niu, ClientForecast.horizonte)).all()
        assert len(forecasts) == 12, f"se esperaban 12 filas de pronóstico y hay {len(forecasts)}"
        assert [row.horizonte for row in forecasts[:6]] == [1, 2, 3, 4, 5, 6]
        assert forecasts[0].periodo_pronosticado == date(2026, 5, 1)
        assert float(forecasts[0].consumo_pronosticado_kwh) == 10.5
        assert forecasts[5].grupo_consumo == "P0_INTERMITENTE"

        # 2. --min-periodo recorta la serie mensual.
        insert_batch(
            db,
            spec_for("consumption"),
            run_row.id,
            [
                {"NIU": "A-1", "periodo": "2026-01-01", "consumo_kwh_mensual": 5.0},
                {"NIU": "A-1", "periodo": "2026-03-01", "consumo_kwh_mensual": 7.5},
            ],
            min_periodo=date(2026, 2, 1),
        )
        consumption = db.scalars(select(ClientConsumptionMonthly)).all()
        assert len(consumption) == 1 and consumption[0].periodo == date(2026, 3, 1)

        # 3. Los datasets genéricos se buscan y filtran en la base, antes de paginar.
        for index in range(30):
            db.add(DatasetRecord(data_run_id=run_row.id, dataset_key="demo", niu=f"NIU-{index:03d}", payload={"NIU": f"NIU-{index:03d}", "municipio": "Tunja" if index % 2 else "Sogamoso", "severidad": "CRITICA" if index < 10 else "BAJA"}))
        db.add(ClientChurnRisk(data_run_id=run_row.id, niu="A-1", nivel_riesgo="ALTO", prob_fuga_6m=0.91))
        db.commit()

        items, total = dataset_service.query_dataset(db, "demo", 10, 0, search="tunja")
        assert total == 15 and len(items) == 10, f"la búsqueda debe filtrar antes de paginar: total={total}, items={len(items)}"
        items, total = dataset_service.query_dataset(db, "demo", 10, 10, filters=[("severidad", "BAJA")])
        assert total == 20 and len(items) == 10
        items, total = dataset_service.query_dataset(db, "demo", 5, 0)
        assert total == 30 and len(items) == 5

        # 4. Los datasets normalizados se sirven desde su tabla propia.
        items, total = dataset_service.query_dataset(db, "churn_scores", 10, 0, niu="A-1")
        assert total == 1 and items[0]["payload"]["nivel_riesgo"] == "ALTO"
        catalog = {item["dataset_key"]: item["rows"] for item in dataset_service.catalog(db)}
        assert catalog["demo"] == 30 and catalog["churn_scores"] == 1

        # 5. El enriquecimiento de clientes completa atributos sin duplicar filas.
        fixture = Path(__file__).resolve().parent / "fixture_source"
        (fixture / "07_gestion_caida").mkdir(parents=True, exist_ok=True)
        (fixture / "07_gestion_caida" / "gestion_caida_operativa.csv").write_text(
            "NIU,clase_servicio_nombre,grupo_consumo,ciclo,ciclo_etiqueta,zona_nombre,zona_regional\nA-1,Residencial,PRUEBA,7,Ciclo 7,Zona Norte,Norte\n",
            encoding="utf-8",
        )
        updated = enrich_clients(db, fixture, 100)
        client = db.get(Client, "A-1")
        assert updated == 1 and client.grupo_consumo == "PRUEBA" and client.ciclo == 7
        assert db.scalar(select(func.count()).select_from(Client)) == 2, "el enriquecimiento no debe duplicar clientes"

    print("Importador y datasets: pronóstico ancho, recorte de serie, búsqueda, catálogo y enriquecimiento OK")


if __name__ == "__main__":
    run()
    engine.dispose()
    shutil.rmtree(Path(__file__).resolve().parent / "fixture_source", ignore_errors=True)
    TEST_DB.unlink(missing_ok=True)
