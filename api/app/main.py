from __future__ import annotations

import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv

# Debe ir antes de importar los routers: database.db lee la URL de la base al importarse.
load_dotenv()

from database.db import get_db  # noqa: E402 - a propósito: después de load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth_routes import router as auth_router
from .admin_routes import router as admin_router
from .data_routes import precalentar, router as data_router
from .firebase_auth import firebase_is_configured


def _allowed_origins() -> list[str]:
    raw = os.getenv(
        "EBSA_ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Al arrancar, precarga en un hilo las cachés de las secciones pesadas (panorama,
    caídas, cero, métricas del mapa y fuga) para que la primera visita sea ágil."""

    def _precalentar() -> None:
        db = next(get_db())
        try:
            precalentar(db)
        finally:
            db.close()

    threading.Thread(target=_precalentar, name="precalentar-caches", daemon=True).start()
    yield


app = FastAPI(
    title="EBSA API",
    version="0.1.0",
    description="API inicial para la plataforma web de consulta EBSA.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(data_router)


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {"service": "ebsa-api", "message": "EBSA API activa"}


@app.get("/health", tags=["system"])
@app.get("/api/health", include_in_schema=False, tags=["system"])
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "ebsa-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/status", tags=["system"])
def status() -> dict[str, str | bool]:
    database_configured = bool(os.getenv("EBSA_DATABASE_URL") or os.getenv("AZURE_SQL_SERVER"))
    return {
        "status": "ready",
        "database_configured": database_configured,
        "database_engine": "azure-sql" if database_configured else "sqlite-local",
        "firebase_configured": firebase_is_configured(),
        "environment": os.getenv("EBSA_ENV", "development"),
    }
