from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# El .env solo se usa en local; en Vercel las variables vienen de la plataforma.
# load_dotenv no pisa variables ya definidas, así que las pruebas que fijan
# EBSA_DATABASE_URL antes de importar siguen mandando.
load_dotenv()


class Base(DeclarativeBase):
    pass


def database_url() -> str:
    """Return the EBSA database URL.

    Production uses Microsoft SQL Server/Azure SQL through Microsoft's
    mssql-python driver. SQLite is deliberately retained only as an explicit
    local test fallback when no production URL is configured.
    """
    configured = os.getenv("EBSA_DATABASE_URL")
    if configured:
        if configured.startswith(("mssql+mssqlpython://", "sqlite:///")):
            return configured
        raise RuntimeError("EBSA_DATABASE_URL debe usar mssql+mssqlpython:// para Azure SQL o sqlite:/// para pruebas locales.")

    server = os.getenv("AZURE_SQL_SERVER")
    database = os.getenv("AZURE_SQL_DATABASE", "ebsa")
    username = os.getenv("AZURE_SQL_USERNAME")
    password = os.getenv("AZURE_SQL_PASSWORD")
    if server and username and password:
        url = URL.create(
            "mssql+mssqlpython",
            username=username,
            password=password,
            host=server,
            port=int(os.getenv("AZURE_SQL_PORT", "1433")),
            database=database,
            query={"encrypt": "yes", "trustservercertificate": "no"},
        )
        return url.render_as_string(hide_password=False)

    local_path = Path(__file__).resolve().parent.parent / "ebsa_local.db"
    return f"sqlite:///{local_path.as_posix()}"


def _engine_kwargs(url: str) -> dict[str, object]:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    # timeout=30 es el intento de conexión (login); sin él, una ruta caída a
    # Azure deja el proceso esperando indefinidamente.
    return {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_timeout": 30,
        "connect_args": {"timeout": 30},
    }


# Timeout por sentencia en segundos: si la red se corta a mitad de un INSERT,
# la consulta falla en vez de quedar colgada (0 la desactiva).
QUERY_TIMEOUT_SEGUNDOS = int(os.getenv("EBSA_QUERY_TIMEOUT", "300"))

_URL = database_url()
engine = create_engine(_URL, future=True, **_engine_kwargs(_URL))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


@event.listens_for(engine, "connect")
def _aplicar_timeout_de_consulta(dbapi_connection: object, _record: object) -> None:
    try:
        dbapi_connection.timeout = QUERY_TIMEOUT_SEGUNDOS
    except (AttributeError, TypeError, ValueError):
        # SQLite (pruebas locales) no expone timeout por sentencia.
        pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
