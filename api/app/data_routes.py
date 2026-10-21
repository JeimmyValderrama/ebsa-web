from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, nulls_last, select
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
    PipelineRun,
    Visit,
)
from . import datasets as dataset_service
from .security import current_user, require_roles

router = APIRouter(prefix="/api/data", tags=["data"])
ALL_ROLES = ("COMERCIAL", "SOPORTE", "ADMIN_MODELO")
TECHNICAL_ROLES = ("ADMIN_MODELO",)


def schema_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="El esquema Azure SQL aún no está aplicado o no se puede alcanzar.")


def run_dict(run: DataRun) -> dict[str, Any]:
    return {"id": run.id, "period": run.period, "status": run.status, "source_path": run.source_path, "files_total": run.files_total, "rows_imported": run.rows_imported, "created_at": run.created_at.isoformat() if run.created_at else None, "completed_at": run.completed_at.isoformat() if run.completed_at else None}


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
def risks(limit: int = Query(200, ge=1, le=2000), offset: int = Query(0, ge=0), severity: str | None = None, prioridad: str | None = None, db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    try:
        query = select(OperationalManagement)
        if severity and severity != "TODAS":
            query = query.where(OperationalManagement.severidad == severity)
        if prioridad and prioridad != "TODAS":
            query = query.where(OperationalManagement.prioridad_gestion == prioridad)
        total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
        rows = db.scalars(query.order_by(OperationalManagement.valor_riesgo_mes.desc()).offset(offset).limit(limit)).all()
        return {"items": [{"id": row.id, "niu": row.niu, "ciclo": row.ciclo, "severidad": row.severidad, "trayectoria": row.trayectoria, "prioridad_gestion": row.prioridad_gestion, "valor_riesgo_mes": float(row.valor_riesgo_mes) if row.valor_riesgo_mes is not None else None, "payload": row.payload or {}} for row in rows], "limit": limit, "offset": offset, "total": total}
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
        return dataset_service.catalog(db)
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/datasets/{dataset_key}")
def dataset_rows(dataset_key: str, limit: int = Query(200, ge=1, le=2000), offset: int = Query(0, ge=0), niu: str | None = None, search: str | None = None, filter: list[str] = Query(default=[]), db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    """Devuelve filas de cualquier dataset. Búsqueda y filtros ("campo:valor") se
    aplican en la base de datos antes de paginar."""
    try:
        items, total = dataset_service.query_dataset(db, dataset_key, limit, offset, search=search, niu=niu, filters=dataset_service.parse_filters(filter))
        return {"dataset_key": dataset_key, "items": items, "limit": limit, "offset": offset, "returned": len(items), "total": total}
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/datasets/{dataset_key}/csv")
def dataset_csv(dataset_key: str, limit: int = Query(20000, ge=1, le=100000), search: str | None = None, filter: list[str] = Query(default=[]), db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> Response:
    try:
        rows = dataset_service.dataset_rows_chunked(db, dataset_key, limit, search=search, filters=dataset_service.parse_filters(filter))
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";")
        payloads = [row["payload"] for row in rows]
        keys = sorted({key for payload in payloads for key in payload})
        writer.writerow(["id", "niu", *keys])
        for row, payload in zip(rows, payloads):
            writer.writerow([row["id"], row["niu"] or "", *[payload.get(key, "") for key in keys]])
        return Response(content="\ufeff" + output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="ebsa_{dataset_key}.csv"'})
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/pipeline")
def pipeline_status(db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*TECHNICAL_ROLES))) -> dict[str, Any]:
    """Estado del pipeline: control de calidad, sesgo del pronóstico y corridas registradas."""
    try:
        quality, _ = dataset_service.query_dataset(db, "quality_control", 200, 0)
        bias, _ = dataset_service.query_dataset(db, "forecast_bias", 50, 0)
        runs = db.scalars(select(PipelineRun).order_by(nulls_last(PipelineRun.started_at.desc()), PipelineRun.id.desc()).limit(20)).all()
        return {
            "quality_control": [row["payload"] for row in quality],
            "forecast_bias": [row["payload"] for row in bias],
            "runs": [{"id": run.id, "folder_name": run.folder_name, "action": run.action, "started_at": run.started_at.isoformat() if run.started_at else None, "summary_text": run.summary_text} for run in runs],
        }
    except OperationalError as exc:
        raise schema_error(exc) from exc


def dataset_count(db: Session, key: str) -> int:
    return int(db.scalar(select(func.count()).select_from(DatasetRecord).where(DatasetRecord.dataset_key == key)) or 0)


@router.get("/panorama")
def panorama(db: Session = Depends(get_db), _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """KPIs agregados del panorama comercial: lista, prioridades, severidad y fuga."""
    try:
        operational = OperationalManagement
        churn = ClientChurnRisk
        total = db.execute(select(func.count(), func.sum(operational.perdida_kwh_mes), func.sum(operational.valor_riesgo_mes))).one()
        por_prioridad = {
            str(prioridad): {"clientes": int(clientes), "perdida_kwh_mes": float(perdida or 0), "valor_riesgo_mes": float(valor or 0)}
            for prioridad, clientes, perdida, valor in db.execute(
                select(operational.prioridad_gestion, func.count(), func.sum(operational.perdida_kwh_mes), func.sum(operational.valor_riesgo_mes)).group_by(operational.prioridad_gestion)
            ).all()
        }
        por_severidad = {str(severidad): int(clientes) for severidad, clientes in db.execute(select(operational.severidad, func.count()).group_by(operational.severidad)).all()}
        fuga = db.execute(select(func.count(), func.sum(churn.valor_esperado_perdida_mes), func.sum(churn.valor_en_riesgo_mes)).where(churn.nivel_riesgo.in_(("ALTO", "MEDIO")))).one()
        fuga_niveles = {str(nivel): int(clientes) for nivel, clientes in db.execute(select(churn.nivel_riesgo, func.count()).group_by(churn.nivel_riesgo)).all()}
        return {
            "lista": {"clientes": int(total[0] or 0), "perdida_kwh_mes": float(total[1] or 0), "valor_riesgo_mes": float(total[2] or 0)},
            "por_prioridad": por_prioridad,
            "por_severidad": por_severidad,
            "fuga": {"clientes": int(fuga[0] or 0), "perdida_esperada_mes": float(fuga[1] or 0), "valor_en_riesgo_mes": float(fuga[2] or 0), "por_nivel": fuga_niveles},
            "cero_sostenido": dataset_count(db, "zero_sustained"),
            "otro_comercializador": dataset_count(db, "churn_other_supplier"),
            "mercado_no_regulado": dataset_count(db, "churn_non_regulated"),
        }
    except OperationalError as exc:
        raise schema_error(exc) from exc


def locations_by_niu(db: Session, nius: list[str]) -> dict[str, dict[str, Any]]:
    """Última ubicación conocida por NIU, consultada por lotes sobre el índice de niu."""
    result: dict[str, dict[str, Any]] = {}
    unique = list(dict.fromkeys(niu for niu in nius if niu))
    for start in range(0, len(unique), 1000):
        chunk = unique[start : start + 1000]
        for row in db.scalars(select(ClientLocation).where(ClientLocation.niu.in_(chunk)).order_by(ClientLocation.id)).all():
            result[row.niu] = {"municipio": row.municipio, "direccion": row.direccion, "latitud": row.latitud, "longitud": row.longitud}
    return result


def clients_by_niu(db: Session, nius: list[str]) -> dict[str, dict[str, Any]]:
    """Atributos de catálogo del cliente (zona, ciclo, clase) por lote."""
    result: dict[str, dict[str, Any]] = {}
    unique = list(dict.fromkeys(niu for niu in nius if niu))
    for start in range(0, len(unique), 1000):
        chunk = unique[start : start + 1000]
        for row in db.execute(select(Client.niu, Client.zona_regional, Client.zona_nombre, Client.ciclo_etiqueta, Client.clase_servicio_nombre).where(Client.niu.in_(chunk))).all():
            result[row.niu] = {"zona_regional": row.zona_regional, "zona_nombre": row.zona_nombre, "ciclo_etiqueta": row.ciclo_etiqueta, "clase_servicio_nombre": row.clase_servicio_nombre}
    return result


@router.get("/route")
def visit_route(cycle: int | None = None, limit: int = Query(500, ge=1, le=5000), db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles("SOPORTE", "ADMIN_MODELO"))) -> dict[str, Any]:
    """Lista de gestión por ciclo de lectura con ubicación, para las visitas de campo."""
    try:
        cycles = [
            {"ciclo": ciclo, "ciclo_etiqueta": etiqueta, "clientes": int(clientes)}
            for ciclo, etiqueta, clientes in db.execute(
                select(OperationalManagement.ciclo, OperationalManagement.ciclo_etiqueta, func.count()).group_by(OperationalManagement.ciclo, OperationalManagement.ciclo_etiqueta).order_by(OperationalManagement.ciclo)
            ).all()
        ]
        query = select(OperationalManagement)
        if cycle is not None:
            query = query.where(OperationalManagement.ciclo == cycle)
        rows = db.scalars(query.order_by(nulls_last(OperationalManagement.orden_en_ciclo.asc()), OperationalManagement.valor_riesgo_mes.desc()).limit(limit)).all()
        nius = [row.niu for row in rows]
        locations = locations_by_niu(db, nius)
        clients = clients_by_niu(db, nius)
        items = []
        for item in rows:
            ubicacion = locations.get(item.niu, {})
            atributos = clients.get(item.niu, {})
            items.append(
                {
                    "niu": item.niu,
                    "ciclo": item.ciclo,
                    "ciclo_etiqueta": item.ciclo_etiqueta,
                    "zona_regional": atributos.get("zona_regional"),
                    "zona_nombre": atributos.get("zona_nombre"),
                    "municipio": ubicacion.get("municipio"),
                    "direccion": ubicacion.get("direccion"),
                    "latitud": float(ubicacion["latitud"]) if ubicacion.get("latitud") is not None else None,
                    "longitud": float(ubicacion["longitud"]) if ubicacion.get("longitud") is not None else None,
                    "payload": {**(item.payload or {}), **{key: value for key, value in atributos.items() if value}, **{key: value for key, value in ubicacion.items() if value}},
                }
            )
        return {"cycles": cycles, "items": items, "total": len(items), "cycle": cycle}
    except OperationalError as exc:
        raise schema_error(exc) from exc


MAP_METRICS = (
    {"key": "caida_valor_mes", "label": "Valor en riesgo por caída", "unidad": "$/mes"},
    {"key": "caida_kwh_mes", "label": "Caída de consumo", "unidad": "kWh/mes"},
    {"key": "caidas", "label": "Clientes en caída", "unidad": "clientes"},
    {"key": "fuga_perdida_esperada_mes", "label": "Pérdida esperada por fuga", "unidad": "$/mes"},
    {"key": "fuga_alto_medio", "label": "Riesgo de fuga ALTO/MEDIO", "unidad": "clientes"},
    {"key": "clientes_lista", "label": "Clientes en la lista", "unidad": "clientes"},
)


def _normalize_name(value: Any) -> str:
    return str(value or "").strip().casefold()


@router.get("/municipalities/metrics")
def municipality_metrics(db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    """Métricas agregadas por municipio para el mapa y las tablas de zonas."""
    try:
        catalog_rows, _ = dataset_service.query_dataset(db, "municipalities", 1000, 0)
        catalog: dict[str, dict[str, Any]] = {}
        for row in catalog_rows:
            payload = row["payload"]
            key = _normalize_name(payload.get("municipio"))
            if not key:
                continue
            catalog[key] = {
                "municipio": payload.get("municipio"),
                "codigo_municipio": payload.get("codigo_municipio"),
                "zona_ebsa": payload.get("zona_ebsa"),
                "clientes_tc1": payload.get("clientes_tc1"),
                "lat_centro": payload.get("lat_centro"),
                "lon_centro": payload.get("lon_centro"),
            }

        nius = list(db.scalars(select(OperationalManagement.niu).distinct())) + list(db.scalars(select(ClientChurnRisk.niu).distinct()))
        municipio_por_niu = {niu: ubicacion.get("municipio") for niu, ubicacion in locations_by_niu(db, nius).items()}

        acumulados: dict[str, dict[str, Any]] = {}

        def bucket(niu: str) -> dict[str, Any]:
            key = _normalize_name(municipio_por_niu.get(niu)) or "sin municipio"
            if key not in acumulados:
                acumulados[key] = {"municipio": municipio_por_niu.get(niu) or "Sin municipio", "caidas": 0, "caida_kwh_mes": 0.0, "caida_valor_mes": 0.0, "clientes_lista": 0, "fuga_alto_medio": 0, "fuga_perdida_esperada_mes": 0.0}
            return acumulados[key]

        for niu, perdida, valor in db.execute(select(OperationalManagement.niu, OperationalManagement.perdida_kwh_mes, OperationalManagement.valor_riesgo_mes)).all():
            item = bucket(niu)
            item["clientes_lista"] += 1
            item["caidas"] += 1
            item["caida_kwh_mes"] += float(perdida or 0)
            item["caida_valor_mes"] += float(valor or 0)

        for niu, nivel, perdida in db.execute(select(ClientChurnRisk.niu, ClientChurnRisk.nivel_riesgo, ClientChurnRisk.valor_esperado_perdida_mes).where(ClientChurnRisk.nivel_riesgo.in_(("ALTO", "MEDIO")))).all():
            item = bucket(niu)
            item["fuga_alto_medio"] += 1
            item["fuga_perdida_esperada_mes"] += float(perdida or 0)
            del nivel

        rows = []
        for key, item in acumulados.items():
            info = catalog.get(key, {})
            rows.append({**info, **item, "clave": key})
        rows.sort(key=lambda item: item["caida_valor_mes"], reverse=True)
        return {"metrics": list(MAP_METRICS), "rows": rows}
    except OperationalError as exc:
        raise schema_error(exc) from exc
