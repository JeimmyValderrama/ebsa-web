from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth_routes import router as auth_router
from .admin_routes import router as admin_router
from .data_routes import router as data_router
from .firebase_auth import firebase_is_configured
from .visit_routes import router as visit_router


def _allowed_origins() -> list[str]:
    raw = os.getenv(
        "EBSA_ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(
    title="EBSA API",
    version="0.1.0",
    description="API inicial para la plataforma web de consulta EBSA.",
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
app.include_router(visit_router)


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
    return {
        "status": "ready",
        "database_configured": bool(os.getenv("EBSA_DATABASE_URL")) or os.getenv("DATABASE_URL", "").startswith("postgresql"),
        "firebase_configured": firebase_is_configured(),
        "environment": os.getenv("EBSA_ENV", "development"),
    }
