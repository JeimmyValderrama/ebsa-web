from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq


def read_batches(path: Path, batch_size: int = 5000) -> Iterator[pd.DataFrame]:
    if path.suffix.lower() == ".csv":
        yield from pd.read_csv(path, encoding="utf-8-sig", chunksize=batch_size, low_memory=False)
        return
    parquet = pq.ParquetFile(path)
    for record_batch in parquet.iter_batches(batch_size=batch_size):
        yield record_batch.to_pandas()


def clean_column_names(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    result.columns = [str(column).strip() for column in result.columns]
    return result


def value(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in row and row[name] is not None and not pd.isna(row[name]):
            return row[name]
    return None


def text(value_: Any) -> str | None:
    if value_ is None or (isinstance(value_, float) and np.isnan(value_)):
        return None
    return str(value_).strip() or None


def integer(value_: Any) -> int | None:
    try:
        return None if value_ is None or pd.isna(value_) else int(float(value_))
    except (TypeError, ValueError):
        return None


def number(value_: Any) -> float | None:
    try:
        return None if value_ is None or pd.isna(value_) else float(value_)
    except (TypeError, ValueError):
        return None


def boolean(value_: Any) -> bool | None:
    if value_ is None or pd.isna(value_):
        return None
    if isinstance(value_, bool):
        return value_
    return str(value_).strip().lower() in {"true", "1", "si", "sí", "yes"}


def date_value(value_: Any):
    if value_ is None or pd.isna(value_):
        return None
    parsed = pd.to_datetime(value_, errors="coerce")
    return None if pd.isna(parsed) else parsed.date()


def json_value(value_: Any) -> Any:
    if value_ is None or value_ is pd.NA:
        return None
    if isinstance(value_, (pd.Timestamp, np.datetime64)):
        return pd.Timestamp(value_).isoformat()
    if isinstance(value_, (np.integer,)):
        return int(value_)
    if isinstance(value_, (np.floating,)):
        return None if np.isnan(value_) else float(value_)
    if isinstance(value_, (np.bool_,)):
        return bool(value_)
    if pd.isna(value_):
        return None
    return value_


def payload(row: dict[str, Any]) -> dict[str, Any]:
    return {str(key): json_value(item) for key, item in row.items()}
