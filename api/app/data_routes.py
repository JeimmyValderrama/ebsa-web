from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import (
    Client,
    ClientChurnRisk,
    ClientConsumptionMonthly,
    ClientDropAnalysis,
    ClientForecast,
    ClientLocation,
    DataRun,
    DatasetRecord,
    OperationalManagement,
    Visit,
)
from .security import current_user, require_roles

router = APIRouter(prefix="/api/data", tags=["data"])
ALL_ROLES = ("COMERCIAL", "SOPORTE", "ADMIN_MODELO")
TECHNICAL_ROLES = ("ADMIN_MODELO",)


def schema_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="El esquema Azure SQL aún no está aplicado o no se puede alcanzar.")


def run_dict(run: DataRun) -> dict[str, Any]:
    return {"id": run.id, "period": run.period, "status": run.status, "source_path": run.source_path, "files_total": run.files_total, "rows_imported": run.rows_imported, "created_at": run.created_at.isoformat() if run.created_at else None, "completed_at": run.completed_at.isoformat() if run.completed_at else None}


def generic_dict(row: DatasetRecord) -> dict[str, Any]:
    return {"id": row.id, "data_run_id": row.data_run_id, "dataset_key": row.dataset_key, "niu": row.niu, "payload": row.payload or {}}


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        latest = db.scalar(select(DataRun).where(DataRun.status == "COMPLETED").order_by(DataRun.created_at.desc()).limit(1))
        return {"latest_run": run_dict(latest) if latest else None, "counts": {"clients": db.scalar(select(func.count()).select_from(Client)) or 0, "operational": db.scalar(select(func.count()).select_from(OperationalManagement)) or 0, "churn_risks": db.scalar(select(func.count()).select_from(ClientChurnRisk)) or 0, "drop_analysis": db.scalar(select(func.count()).select_from(ClientDropAnalysis)) or 0, "locations": db.scalar(select(func.count()).select_from(ClientLocation)) or 0, "visits": db.scalar(select(func.count()).select_from(Visit)) or 0}}
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/runs")
def runs(db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*TECHNICAL_ROLES))) -> list[dict[str, Any]]:
    try:
        return [run_dict(run) for run in db.scalars(select(DataRun).order_by(DataRun.created_at.desc()).limit(50)).all()]
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/risks")
def risks(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), severity: str | None = None, db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    try:
        query = select(OperationalManagement).order_by(OperationalManagement.valor_riesgo_mes.desc()).offset(offset).limit(limit)
        if severity and severity != "TODAS":
            query = query.where(OperationalManagement.severidad == severity)
        rows = db.scalars(query).all()
        return {"items": [{"id": row.id, "niu": row.niu, "ciclo": row.ciclo, "severidad": row.severidad, "trayectoria": row.trayectoria, "prioridad_gestion": row.prioridad_gestion, "valor_riesgo_mes": float(row.valor_riesgo_mes) if row.valor_riesgo_mes is not None else None, "payload": row.payload or {}} for row in rows], "limit": limit, "offset": offset}
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/clients/{niu}")
def client_detail(niu: str, db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    try:
        client = db.get(Client, niu)
        if client is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No existe un cliente con ese NIU.")
        operational = db.scalars(select(OperationalManagement).where(OperationalManagement.niu == niu).order_by(OperationalManagement.id.desc()).limit(20)).all()
        churn = db.scalars(select(ClientChurnRisk).where(ClientChurnRisk.niu == niu).order_by(ClientChurnRisk.id.desc()).limit(1)).first()
        drop = db.scalars(select(ClientDropAnalysis).where(ClientDropAnalysis.niu == niu).order_by(ClientDropAnalysis.id.desc()).limit(1)).first()
        location = db.scalars(select(ClientLocation).where(ClientLocation.niu == niu).order_by(ClientLocation.id.desc()).limit(1)).first()
        return {"client": {"niu": client.niu, "clase_servicio": client.clase_servicio, "clase_servicio_nombre": client.clase_servicio_nombre, "grupo_consumo": client.grupo_consumo, "estrato": client.estrato, "ciclo": client.ciclo, "ciclo_etiqueta": client.ciclo_etiqueta, "zona_nombre": client.zona_nombre, "zona_regional": client.zona_regional, "payload": client.payload or {}}, "operational": [{"severidad": item.severidad, "trayectoria": item.trayectoria, "prioridad_gestion": item.prioridad_gestion, "valor_riesgo_mes": float(item.valor_riesgo_mes) if item.valor_riesgo_mes is not None else None, "payload": item.payload or {}} for item in operational], "churn": {"nivel_riesgo": churn.nivel_riesgo, "prob_fuga_6m": float(churn.prob_fuga_6m) if churn.prob_fuga_6m is not None else None, "valor_en_riesgo_mes": float(churn.valor_en_riesgo_mes) if churn.valor_en_riesgo_mes is not None else None, "senales": churn.senales, "payload": churn.payload or {}} if churn else None, "drop": {"veredicto": drop.veredicto, "severidad": drop.severidad, "consumo_anterior_kwh": float(drop.consumo_anterior_kwh) if drop.consumo_anterior_kwh is not None else None, "consumo_reciente_kwh": float(drop.consumo_reciente_kwh) if drop.consumo_reciente_kwh is not None else None, "variacion_vs_anterior_pct": float(drop.variacion_vs_anterior_pct) if drop.variacion_vs_anterior_pct is not None else None, "payload": drop.payload or {}} if drop else None, "location": {"municipio": location.municipio, "direccion": location.direccion, "latitud": float(location.latitud) if location.latitud is not None else None, "longitud": float(location.longitud) if location.longitud is not None else None, "payload": location.payload or {}} if location else None}
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/clients/{niu}/consumption")
def client_consumption(niu: str, db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> list[dict[str, Any]]:
    rows = db.scalars(select(ClientConsumptionMonthly).where(ClientConsumptionMonthly.niu == niu).order_by(ClientConsumptionMonthly.periodo.asc()).limit(120)).all()
    return [{"periodo": row.periodo.isoformat(), "consumo_kwh": float(row.consumo_kwh) if row.consumo_kwh is not None else None, "es_rural": row.es_rural, "estado_mes": row.estado_mes} for row in rows]


@router.get("/clients/{niu}/forecast")
def client_forecast(niu: str, db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> list[dict[str, Any]]:
    rows = db.scalars(select(ClientForecast).where(ClientForecast.niu == niu).order_by(ClientForecast.periodo_pronosticado.asc()).limit(12)).all()
    return [{"horizonte": row.horizonte, "periodo_pronosticado": row.periodo_pronosticado.isoformat() if row.periodo_pronosticado else None, "consumo_pronosticado_kwh": float(row.consumo_pronosticado_kwh) if row.consumo_pronosticado_kwh is not None else None} for row in rows]


@router.get("/locations")
def locations(limit: int = Query(5000, ge=1, le=10000), db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> list[dict[str, Any]]:
    rows = db.scalars(select(ClientLocation).where(ClientLocation.latitud.is_not(None), ClientLocation.longitud.is_not(None)).limit(limit)).all()
    return [{"niu": row.niu, "municipio": row.municipio, "direccion": row.direccion, "latitud": float(row.latitud) if row.latitud is not None else None, "longitud": float(row.longitud) if row.longitud is not None else None, "payload": row.payload or {}} for row in rows]


@router.get("/datasets/catalog")
def dataset_catalog(db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> list[dict[str, Any]]:
    try:
        rows = db.execute(select(DatasetRecord.dataset_key, func.count(DatasetRecord.id)).group_by(DatasetRecord.dataset_key).order_by(DatasetRecord.dataset_key)).all()
        return [{"dataset_key": key, "rows": count} for key, count in rows]
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/datasets/{dataset_key}")
def dataset_rows(dataset_key: str, limit: int = Query(200, ge=1, le=2000), offset: int = Query(0, ge=0), niu: str | None = None, search: str | None = None, db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    try:
        query = select(DatasetRecord).where(DatasetRecord.dataset_key == dataset_key).order_by(DatasetRecord.id).offset(offset).limit(limit)
        if niu:
            query = query.where(DatasetRecord.niu == niu)
        rows = db.scalars(query).all()
        items = [generic_dict(row) for row in rows]
        if search:
            needle = search.lower()
            items = [item for item in items if needle in str(item).lower()]
        return {"dataset_key": dataset_key, "items": items, "limit": limit, "offset": offset, "returned": len(items)}
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/datasets/{dataset_key}/csv")
def dataset_csv(dataset_key: str, limit: int = Query(10000, ge=1, le=50000), db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> Response:
    try:
        rows = db.scalars(select(DatasetRecord).where(DatasetRecord.dataset_key == dataset_key).order_by(DatasetRecord.id).limit(limit)).all()
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";")
        payloads = [row.payload or {} for row in rows]
        keys = sorted({key for payload in payloads for key in payload})
        writer.writerow(["id", "niu", *keys])
        for row, payload in zip(rows, payloads):
            writer.writerow([row.id, row.niu or "", *[payload.get(key, "") for key in keys]])
        return Response(content="\ufeff" + output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="ebsa_{dataset_key}.csv"'})
    except OperationalError as exc:
        raise schema_error(exc) from exc
