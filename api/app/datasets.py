from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from database.models import (
    Client,
    ClientChurnRisk,
    ClientConsumptionMonthly,
    ClientDropAnalysis,
    ClientForecast,
    ClientLocation,
    DatasetRecord,
    OperationalManagement,
)

# Datasets con tabla normalizada propia. El importador escribe el payload completo
# en la tabla, así que la API puede servirlos sin depender de dataset_records.
NORMALIZED: dict[str, Any] = {
    "operational": OperationalManagement,
    "churn_scores": ClientChurnRisk,
    "drop_analysis": ClientDropAnalysis,
    "forecast": ClientForecast,
    "consumption": ClientConsumptionMonthly,
    "locations": ClientLocation,
    "cycle_by_niu": Client,
}


def parse_filters(raw: list[str]) -> list[tuple[str, str]]:
    """Convierte filtros "campo:valor" en pares."""
    result: list[tuple[str, str]] = []
    for item in raw or []:
        field, sep, value = item.partition(":")
        if sep and field.strip() and value.strip():
            result.append((field.strip(), value.strip()))
    return result


def _needle_clause(model: Any, needle: str) -> Any:
    pattern = f"%{needle}%"
    clauses = [cast(model.payload, String).ilike(pattern)]
    niu_column = model.__table__.columns.get("niu")
    if niu_column is not None:
        clauses.append(cast(getattr(model, "niu"), String).ilike(pattern))
    return or_(*clauses)


def _payload_equals(model: Any, field: str, value: str) -> Any:
    """Igualdad aproximada sobre el JSON serializado del payload."""
    payload = cast(model.payload, String)
    patterns = [f'%"{field}":"{value}"%', f'%"{field}": "{value}"%']
    try:
        number = float(value)
    except ValueError:
        number = None
    if number is not None:
        literal = str(int(number)) if number.is_integer() else str(number)
        patterns += [f'%"{field}":{literal}%', f'%"{field}": {literal}%']
    return or_(*[payload.like(pattern) for pattern in patterns])


def _filter_clause(model: Any, field: str, value: str) -> Any:
    column = model.__table__.columns.get(field)
    if column is not None and field != "payload":
        return func.lower(cast(getattr(model, field), String)) == value.lower()
    return _payload_equals(model, field, value)


def _normalized_payload(row: Any) -> dict[str, Any]:
    """Columnas propias de la tabla normalizada, en formato JSON."""
    result: dict[str, Any] = {}
    for column in row.__table__.columns.keys():
        if column in ("payload", "data_run_id"):
            continue
        item = getattr(row, column, None)
        if item is None or isinstance(item, (bool, int, float, str)):
            if item is not None:
                result[column] = item
        elif isinstance(item, Decimal):
            result[column] = float(item)
        else:
            result[column] = item.isoformat()
    return result


def _record_dict(row: Any, key: str) -> dict[str, Any]:
    return {
        "id": getattr(row, "id", None) or getattr(row, "niu", None),
        "data_run_id": getattr(row, "data_run_id", None),
        "dataset_key": key,
        "niu": getattr(row, "niu", None),
        "payload": {**_normalized_payload(row), **(row.payload or {})},
    }


def query_dataset(
    db: Session,
    key: str,
    limit: int,
    offset: int,
    search: str | None = None,
    niu: str | None = None,
    filters: list[tuple[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Devuelve (items, total) aplicando búsqueda y filtros ANTES del paginado."""
    filters = filters or []
    model = NORMALIZED.get(key)
    if model is not None:
        query = select(model)
        niu_column = model.__table__.columns.get("niu")
        if niu is not None and niu_column is not None:
            query = query.where(niu_column == niu)
    else:
        query = select(DatasetRecord).where(DatasetRecord.dataset_key == key)
        if niu is not None:
            query = query.where(DatasetRecord.niu == niu)
        model = DatasetRecord

    if search and search.strip():
        query = query.where(_needle_clause(model, search.strip()))
    for field, value in filters:
        query = query.where(_filter_clause(model, field, value))

    total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    id_column = model.__table__.columns.get("id")
    order = id_column if id_column is not None else model.__table__.columns.get(model.__table__.primary_key.columns.keys()[0])
    rows = db.scalars(query.order_by(order).offset(offset).limit(limit)).all()
    return [_record_dict(row, key) for row in rows], total


def dataset_rows_chunked(
    db: Session,
    key: str,
    limit: int,
    search: str | None = None,
    filters: list[tuple[str, str]] | None = None,
    chunk: int = 5000,
) -> list[dict[str, Any]]:
    """Recorre el dataset en lotes para armar un CSV sin cargar todo de golpe."""
    rows: list[dict[str, Any]] = []
    offset = 0
    while offset < limit:
        items, _total = query_dataset(db, key, min(chunk, limit - offset), offset, search=search, filters=filters)
        if not items:
            break
        rows.extend(items)
        offset += len(items)
    return rows


def catalog(db: Session) -> list[dict[str, Any]]:
    """Catálogo de datasets con su número de filas (genéricos + normalizados)."""
    items = [
        {"dataset_key": key, "rows": int(count)}
        for key, count in db.execute(
            select(DatasetRecord.dataset_key, func.count(DatasetRecord.id)).group_by(DatasetRecord.dataset_key).order_by(DatasetRecord.dataset_key)
        ).all()
    ]
    index = {item["dataset_key"]: item for item in items}
    for key, model in NORMALIZED.items():
        count = int(db.scalar(select(func.count()).select_from(model)) or 0)
        if not count:
            continue
        if key in index:
            index[key]["rows"] = count
        else:
            items.append({"dataset_key": key, "rows": count})
    return sorted(items, key=lambda item: item["dataset_key"])
