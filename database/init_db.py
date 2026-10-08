from __future__ import annotations

from .db import Base, engine
from . import models  # noqa: F401 — registra todas las tablas en Base.metadata


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"Esquema EBSA listo en {engine.url.render_as_string(hide_password=True)}")


if __name__ == "__main__":
    main()
