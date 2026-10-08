from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def database_url() -> str:
    configured = os.getenv("EBSA_DATABASE_URL") or os.getenv("DATABASE_URL")
    # El proyecto EBSA se diseñó para PostgreSQL. El WebDev gestionado puede
    # inyectar un DATABASE_URL MySQL; no debemos conectarnos a ese motor por
    # accidente ni intentar importar el esquema PostgreSQL allí.
    if configured and configured.startswith(("postgresql://", "postgresql+psycopg://", "sqlite:///")):
        return configured
    if configured and configured.startswith("mysql"):
        configured = None
    local_path = Path(__file__).resolve().parent.parent / "ebsa_local.db"
    return f"sqlite:///{local_path.as_posix()}"


def _engine_kwargs(url: str) -> dict[str, object]:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_recycle": 1800}


engine = create_engine(database_url(), future=True, **_engine_kwargs(database_url()))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
