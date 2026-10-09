from __future__ import annotations

import os
import sys
from pathlib import Path

# La prueba usa una SQLite temporal para no tocar Azure SQL ni datos reales.
TEST_DB = Path(__file__).resolve().parent / "phase3_test.db"
os.environ["EBSA_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from api.app.main import app  # noqa: E402
from api.app.security import current_user  # noqa: E402
from database.db import Base, SessionLocal, engine  # noqa: E402
from database.models import Client, DataRun  # noqa: E402


def run() -> None:
    if TEST_DB.exists():
        TEST_DB.unlink()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        db.add(Client(niu="TEST-001", grupo_consumo="PRUEBA"))
        db.add(DataRun(period="2026-10", source_path="fixture", status="COMPLETED", files_total=1, rows_imported=1))
        db.commit()

    app.dependency_overrides[current_user] = lambda: {"uid": "test", "role": "ADMIN_MODELO", "email": "test@example.com"}
    client = TestClient(app)
    assert client.get("/api/data/summary").status_code == 200
    assert client.get("/api/data/runs").json()[0]["period"] == "2026-10"
    assert client.get("/api/data/clients/TEST-001").status_code == 200
    assert client.get("/api/data/clients/MISSING").status_code == 404
    app.dependency_overrides.clear()
    TEST_DB.unlink(missing_ok=True)
    print("Fase 3: pruebas de esquema y endpoints OK")


if __name__ == "__main__":
    run()
