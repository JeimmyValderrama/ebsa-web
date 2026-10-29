from __future__ import annotations

import csv
import io
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import String, case, cast, func, nulls_last, select
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
)
from . import datasets as dataset_service
from .security import current_user, require_roles

router = APIRouter(prefix="/api/data", tags=["data"])
ALL_ROLES = ("COMERCIAL", "SOPORTE", "ADMIN_MODELO")
TECHNICAL_ROLES = ("ADMIN_MODELO",)

# Cachés por corte (data_run_id): al importar un corte nuevo la clave cambia y se invalidan
# solas, igual que _FUGA_CACHE y _MUNICIPIOS_LISTA. Guardan la lista COMPLETA sin filtros;
# cada petición filtra o suma su parte en memoria (lo lento es leer la lista, no usarla).
_METRICAS_MUNICIPIO_CACHE: dict[int, dict[str, Any]] = {}
_PANORAMA_CACHE: dict[int, dict[str, Any]] = {}
_DROPS_CACHE: dict[int, dict[str, Any]] = {}
_ZERO_CACHE: dict[int, list[dict[str, Any]]] = {}
_CERO_RESUMEN_CACHE: dict[int, dict[str, Any]] = {}


def _memoiza_corte(cache: dict[int, Any], corte_id: int, valor: Any) -> Any:
    """Memoriza por corte y deja solo los dos más recientes, para no crecer sin límite."""
    while len(cache) >= 2:
        cache.pop(next(iter(cache)))
    cache[corte_id] = valor
    return valor


def _corte_operativo(db: Session) -> int:
    """Corte vigente de la lista de gestión (la misma clave que usan las demás secciones)."""
    return int(db.scalar(select(func.max(OperationalManagement.data_run_id))) or 0)


def schema_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="El esquema Azure SQL aún no está aplicado o no se puede alcanzar.")


def run_dict(run: DataRun) -> dict[str, Any]:
    return {"id": run.id, "period": run.period, "status": run.status, "source_path": run.source_path, "files_total": run.files_total, "rows_imported": run.rows_imported, "created_at": run.created_at.isoformat() if run.created_at else None, "completed_at": run.completed_at.isoformat() if run.completed_at else None}


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        latest = db.scalar(select(DataRun).where(DataRun.status == "COMPLETED").order_by(DataRun.created_at.desc()).limit(1))
        return {"latest_run": run_dict(latest) if latest else None, "counts": {"clients": db.scalar(select(func.count()).select_from(Client)) or 0, "operational": db.scalar(select(func.count()).select_from(OperationalManagement)) or 0, "churn_risks": db.scalar(select(func.count()).select_from(ClientChurnRisk)) or 0, "drop_analysis": db.scalar(select(func.count()).select_from(ClientDropAnalysis)) or 0, "locations": db.scalar(select(func.count()).select_from(ClientLocation)) or 0}}
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
    return [{"horizonte": row.horizonte, "periodo_pronosticado": row.periodo_pronosticado.isoformat() if row.periodo_pronosticado else None, "consumo_pronosticado_kwh": float(row.consumo_pronosticado_kwh) if row.consumo_pronosticado_kwh is not None else None, "grupo_consumo": row.grupo_consumo, "fecha_corte": row.fecha_corte.isoformat() if row.fecha_corte else None, "modelo": (row.payload or {}).get("modelo")} for row in rows]


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


def _acumular(bloque: dict[str, Any], clave: str, perdida: Any, valor: Any, gravedad: str) -> None:
    """Suma clientes, kWh y pesos de un grupo, con el conteo por gravedad (para las barras apiladas)."""
    registro = bloque.setdefault(clave, {"clientes": 0, "perdida_kwh_mes": 0.0, "valor_riesgo_mes": 0.0, "gravedad": {}})
    registro["clientes"] += 1
    registro["perdida_kwh_mes"] += float(perdida or 0)
    registro["valor_riesgo_mes"] += float(valor or 0)
    registro["gravedad"][gravedad] = registro["gravedad"].get(gravedad, 0) + 1


def _gravedad(severidad: Any, veredicto: Any) -> str:
    """Gravedad que ve negocio: una caída sostenida ya no es urgente, es "antigua" (gravedad() del Streamlit)."""
    return "ANTIGUA" if str(veredicto or "") == "CAIDA_SOSTENIDA" else str(severidad or "—")


def _resumen_cero_sostenido(db: Session) -> dict[str, Any]:
    """Clientes sin consumo: cuántos son y cuánto consumían/facturaban antes de quedarse en cero.

    Memorizado por corte: recorrer los ~8.400 registros con payload cada vez costaba
    varios cientos de ms en cada visita de Panorama y de Caídas.
    """
    corte = int(
        db.scalar(
            select(func.max(DatasetRecord.data_run_id)).where(DatasetRecord.dataset_key == "zero_sustained")
        )
        or 0
    )
    cache = _CERO_RESUMEN_CACHE.get(corte)
    if cache is not None:
        return cache
    filas = db.scalars(select(DatasetRecord).where(DatasetRecord.dataset_key == "zero_sustained")).all()
    consumo, valor = 0.0, 0.0
    for fila in filas:
        p = fila.payload or {}
        try:
            consumo += float(p.get("consumo_referencia_kwh") or p.get("consumo_anterior_kwh") or 0)
        except (TypeError, ValueError):
            pass
        try:
            valor += float(p.get("valor_facturaba_antes_mes") or 0)
        except (TypeError, ValueError):
            pass
    resumen = {"clientes": len(filas), "consumo_referencia_kwh": consumo, "valor_facturaba_antes_mes": valor}
    return _memoiza_corte(_CERO_RESUMEN_CACHE, corte, resumen)


@router.get("/panorama")
def panorama(db: Session = Depends(get_db), _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """KPIs agregados del panorama comercial: lista, prioridades, gravedad de negocio, zonas, clases, fuga y cortes."""
    try:
        corte_id = _corte_operativo(db)
        cache = _PANORAMA_CACHE.get(corte_id)
        if cache is not None:
            return cache
        operational = OperationalManagement
        churn = ClientChurnRisk
        total = db.execute(select(func.count(), func.sum(operational.perdida_kwh_mes), func.sum(operational.valor_riesgo_mes))).one()
        por_prioridad = {
            str(prioridad): {"clientes": int(clientes), "perdida_kwh_mes": float(perdida or 0), "valor_riesgo_mes": float(valor or 0)}
            for prioridad, clientes, perdida, valor in db.execute(
                select(operational.prioridad_gestion, func.count(), func.sum(operational.perdida_kwh_mes), func.sum(operational.valor_riesgo_mes)).group_by(operational.prioridad_gestion)
            ).all()
        }
        por_severidad = {
            str(severidad): {"clientes": int(clientes), "perdida_kwh_mes": float(perdida or 0), "valor_riesgo_mes": float(valor or 0)}
            for severidad, clientes, perdida, valor in db.execute(
                select(operational.severidad, func.count(), func.sum(operational.perdida_kwh_mes), func.sum(operational.valor_riesgo_mes)).group_by(operational.severidad)
            ).all()
        }

        # Una sola pasada por la lista: la gravedad que ve negocio (una caída sostenida es "antigua"),
        # las entradas del ciclo y los agregados por zona regional, clase de servicio y tamaño (limpiar_lista + gravedad).
        gravedad: dict[str, int] = {}
        estado: dict[str, int] = {}
        por_zona: dict[str, Any] = {}
        por_clase: dict[str, Any] = {}
        por_grupo: dict[str, Any] = {}
        for severidad, estado_en_lista, perdida, valor, payload in db.execute(
            select(operational.severidad, operational.estado_en_lista, operational.perdida_kwh_mes, operational.valor_riesgo_mes, operational.payload)
        ).all():
            p = payload or {}
            g = _gravedad(severidad, p.get("veredicto"))
            gravedad[g] = gravedad.get(g, 0) + 1
            clave_estado = str(estado_en_lista or "—")
            estado[clave_estado] = estado.get(clave_estado, 0) + 1
            _acumular(por_zona, str(p.get("zona_regional") or "SIN ZONA"), perdida, valor, g)
            _acumular(por_clase, str(p.get("clase_servicio_nombre") or p.get("clase_servicio") or "SIN CLASE"), perdida, valor, g)
            _acumular(por_grupo, str(p.get("grupo_consumo") or p.get("tramo_consumo") or "SIN GRUPO"), perdida, valor, g)

        fuga = db.execute(select(func.count(), func.sum(churn.valor_esperado_perdida_mes), func.sum(churn.valor_en_riesgo_mes)).where(churn.nivel_riesgo.in_(("ALTO", "MEDIO")))).one()
        fuga_niveles = {str(nivel): int(clientes) for nivel, clientes in db.execute(select(churn.nivel_riesgo, func.count()).group_by(churn.nivel_riesgo)).all()}
        # Energía que consumen hoy los clientes con probabilidad de fuga alta o media (promedio de 6 meses).
        fuga_consumo_kwh = 0.0
        for payload in db.execute(select(churn.payload).where(churn.nivel_riesgo.in_(("ALTO", "MEDIO")))).all():
            try:
                fuga_consumo_kwh += float((payload[0] or {}).get("consumo_prom_6m_kwh") or 0)
            except (TypeError, ValueError):
                continue

        # Clientes sin consumo: cuánto consumían y cuánto facturaban antes de quedarse en cero.
        cero = _resumen_cero_sostenido(db)

        # Ya atendidos por otro comercializador: los que el archivo de la empresa marca como "CON OTRO...".
        con_otro = 0
        for payload in db.execute(select(DatasetRecord.payload).where(DatasetRecord.dataset_key == "churn_other_supplier")).all():
            if str((payload[0] or {}).get("estado") or "").startswith("CON OTRO"):
                con_otro += 1

        # Corte facturado de cada zona (el rural va un trimestre atrás).
        cortes_zona = {
            str((payload[0] or {}).get("zona") or "").upper(): str((payload[0] or {}).get("fecha_corte") or "")[:7]
            for payload in db.execute(select(DatasetRecord.payload).where(DatasetRecord.dataset_key == "zone_cuts")).all()
        }

        valor = {
            "lista": {"clientes": int(total[0] or 0), "perdida_kwh_mes": float(total[1] or 0), "valor_riesgo_mes": float(total[2] or 0)},
            "por_prioridad": por_prioridad,
            "por_severidad": por_severidad,
            "gravedad": gravedad,
            "estado_en_lista": estado,
            "por_zona": por_zona,
            "por_clase": por_clase,
            "por_grupo": por_grupo,
            "fuga": {
                # Puntuados por el modelo: todos los niveles (ALTO+MEDIO+BAJO), como len(fuga) del Streamlit.
                "clientes": int(sum(fuga_niveles.values())),
                "alto_medio": int(fuga[0] or 0),
                "perdida_esperada_mes": float(fuga[1] or 0),
                "valor_en_riesgo_mes": float(fuga[2] or 0),
                "consumo_alto_medio_kwh": fuga_consumo_kwh,
                "por_nivel": fuga_niveles,
            },
            "cero_sostenido": dataset_count(db, "zero_sustained"),
            "cero_sostenido_resumen": cero,
            "otro_comercializador": dataset_count(db, "churn_other_supplier"),
            "otro_comercializador_con_otro": con_otro,
            "mercado_no_regulado": dataset_count(db, "churn_non_regulated"),
            "cortes_zona": cortes_zona,
        }
        return _memoiza_corte(_PANORAMA_CACHE, corte_id, valor)
    except OperationalError as exc:
        raise schema_error(exc) from exc


# ---------------------------------------------------------------------------
# Lista de caída: sección "Caídas de consumo" de Comercial y de Soporte
# ---------------------------------------------------------------------------

ZONAS_REGIONALES = ("CENTRO", "TUNDAMA", "SUGAMUXI", "OCCIDENTE", "ORIENTE", "NORTE", "RICAURTE", "PUERTO BOYACA")
GRUPOS_CONSUMO_ORDEN = ("Grande", "Mediano", "Pequeño", "Intermitente", "Sin historia suficiente")
ORDEN_PRIORIDAD = {"GESTIONAR": 0, "SEGUIMIENTO: caída antigua": 1, "VIGILAR: se espera recuperación": 2, "VIGILAR: estacional": 3}

# ZONA_POR_CICLO de utilidades_glosario.py (glosario EBSA, hojas COLUMNA BR/BT): nombre de cada
# ciclo de lectura, tal como lo muestra etiqueta_ciclo en el desplegable "Ciclo" del Streamlit.
ZONA_POR_CICLO = {
    0: "CENTRO", 1: "TUNDAMA", 2: "SUGAMUXI", 3: "OCCIDENTE", 4: "ORIENTE",
    5: "NORTE", 6: "RICAURTE", 7: "PUERTO BOYACA",
    9: "CENTRO (SECCIONALES - URBANO)", 10: "CENTRO RURAL", 11: "TUNDAMA RURAL",
    12: "SUGAMUXI RURAL", 13: "ORIENTE RURAL", 15: "ALUMBRADO PUBLICO",
    19: "CENTRO (SECCIONALES - RURAL)", 21: "NORTE RURAL", 22: "OCCIDENTE RURAL",
    23: "RICAURTE RURAL", 33: "USUARIOS NO REGULADOS", 38: "PUERTO BOYACA RURAL",
    50: "AUTOGENERADORES", 90: "SERVICIOS EBSA", 91: "ARRENDAMIENTO INMUEBLES",
    94: "OTROS SERVICIOS", 96: "ARRENDAMIENTO INFRAESTRUCTURA", 97: "OTROS COMERCIALIZADORES",
    98: "AREAS DE DISTRIBUCION", 99: "CARGOS PARA EL USO DEL STR",
}


def etiqueta_ciclo(ciclo: Any) -> str:
    """'0' -> '00 — CENTRO' (etiqueta_ciclo del Streamlit: dos dígitos y el nombre del glosario)."""
    try:
        n = int(str(ciclo))
    except (TypeError, ValueError):
        return str(ciclo)
    return f"{n:02d} — {ZONA_POR_CICLO.get(n, 'sin nombre en glosario')}"

_MUNICIPIOS_LISTA: dict[str, dict[str, str]] = {}


def _numero(payload: dict[str, Any], *claves: str) -> float | None:
    """Primera clave del payload que traiga un número válido (ignora NaN, null y booleanos)."""
    for clave in claves:
        valor = payload.get(clave)
        if isinstance(valor, (int, float)) and not isinstance(valor, bool) and valor == valor:
            return float(valor)
    return None


def _municipios_de_la_lista(db: Session, clave: str, nius: list[str]) -> dict[str, str]:
    """Municipio de cada NIU de la lista de caída (agregar_municipio), memorizado por corte."""
    mapa = _MUNICIPIOS_LISTA.get(clave)
    if mapa is None:
        mapa = {niu: str(valor.get("municipio") or "") for niu, valor in locations_by_niu(db, nius).items()}
        # solo los dos cortes más recientes, para que la memoria no crezca sin límite
        while len(_MUNICIPIOS_LISTA) >= 2:
            _MUNICIPIOS_LISTA.pop(next(iter(_MUNICIPIOS_LISTA)))
        _MUNICIPIOS_LISTA[clave] = mapa
    return mapa


def _drops_lista(db: Session, corte_id: int) -> dict[str, Any]:
    """Lista COMPLETA de caída (sin filtros), memorizada por corte: registros con municipio,
    gravedad por zona y las opciones de cada filtro. La consulta filtra por petición."""
    registros: list[dict[str, Any]] = []
    gravedad_zona: dict[str, dict[str, int]] = {}
    for niu, severidad, trayectoria, estado, prioridad, perdida, valor, payload in db.execute(
        select(
            OperationalManagement.niu,
            OperationalManagement.severidad,
            OperationalManagement.trayectoria,
            OperationalManagement.estado_en_lista,
            OperationalManagement.prioridad_gestion,
            OperationalManagement.perdida_kwh_mes,
            OperationalManagement.valor_riesgo_mes,
            OperationalManagement.payload,
        )
    ).all():
        p = payload or {}
        gravedad = _gravedad(severidad, p.get("veredicto"))
        zona = str(p.get("zona_regional") or "SIN ZONA")
        gravedad_zona.setdefault(zona, {})
        gravedad_zona[zona][gravedad] = gravedad_zona[zona].get(gravedad, 0) + 1
        registros.append(
            {
                "niu": str(niu).strip(),
                "veredicto": str(p.get("veredicto") or ""),
                "gravedad": gravedad,
                "zona_regional": zona,
                "ciclo": str(p.get("zona_nombre") or ""),
                "clase": str(p.get("clase_servicio_nombre") or p.get("clase_servicio") or "SIN CLASIFICAR"),
                "tamano": str(p.get("grupo_consumo") or p.get("tramo_consumo") or "—"),
                "trayectoria": str(trayectoria or ""),
                "prioridad": str(prioridad or ""),
                "situacion": str(estado or ""),
                "consumo_reciente_kwh": float(p.get("consumo_reciente_kwh") or 0),
                "consumo_anterior_kwh": float(p.get("consumo_anterior_kwh") or 0),
                "perdida_kwh_mes": float(perdida or 0),
                "valor_riesgo_mes": float(valor or 0),
                "tarifa_kwh": float(p.get("tarifa_kwh") or 0),
            }
        )
    # Cruce con el TC1 para el municipio; el mapa queda memorizado por corte (se repite en cada consulta).
    municipios = _municipios_de_la_lista(db, str(corte_id), [registro["niu"] for registro in registros])
    opciones_municipios: dict[str, set[str]] = {}
    for registro in registros:
        registro["municipio"] = municipios.get(registro["niu"], "")
        if registro["municipio"]:
            opciones_municipios.setdefault(registro["municipio"], set()).add(registro["zona_regional"])
    zonas_lista = {registro["zona_regional"] for registro in registros}
    tamanos_lista = {registro["tamano"] for registro in registros}
    return {
        "registros": registros,
        "gravedad_zona": gravedad_zona,
        "zonas": [zona for zona in ZONAS_REGIONALES if zona in zonas_lista] + sorted(zonas_lista - set(ZONAS_REGIONALES)),
        "municipios": [{"municipio": nombre, "zonas": sorted(zonas)} for nombre, zonas in sorted(opciones_municipios.items())],
        "clases": sorted({registro["clase"] for registro in registros}),
        "tamanos": [grupo for grupo in GRUPOS_CONSUMO_ORDEN if grupo in tamanos_lista] + sorted(tamanos_lista - set(GRUPOS_CONSUMO_ORDEN)),
    }


@router.get("/drops")
def drops(
    medida: str = "Consumo",
    n: int = Query(200, ge=25, le=2000),
    pri: str | None = None,
    tip: str | None = None,
    grav: str | None = None,
    ten: str | None = None,
    zon: str | None = None,
    mun: str | None = None,
    cla: str | None = None,
    tam: str | None = None,
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Lista de clientes con caída de consumo: filtros, resumen de la medida elegida, primeros puestos y gravedad por zona.

    Replica la sección "Caídas de consumo" del Streamlit: la lista va de lo que hay que gestionar a lo que se vigila,
    y dentro de cada prioridad, de mayor a menor pérdida (kWh o pesos según la medida elegida).
    """
    try:

        def _elegidos(texto: str | None) -> set[str]:
            return {valor.strip() for valor in (texto or "").split(",") if valor.strip()}

        sel_pri, sel_tip, sel_grav, sel_ten = _elegidos(pri), _elegidos(tip), _elegidos(grav), _elegidos(ten)
        sel_zon, sel_mun, sel_cla, sel_tam = _elegidos(zon), _elegidos(mun), _elegidos(cla), _elegidos(tam)
        col_op = "valor_riesgo_mes" if medida == "Facturación" else "perdida_kwh_mes"

        # La lista completa (29.000+ filas con payload) se memoriza por corte; cada petición
        # solo filtra y ordena su parte en memoria (cambiar un filtro ya no vuelve a leer la BD).
        corte_id = _corte_operativo(db)
        cache = _DROPS_CACHE.get(corte_id)
        if cache is None:
            cache = _memoiza_corte(_DROPS_CACHE, corte_id, _drops_lista(db, corte_id))
        registros = cache["registros"]
        gravedad_zona = cache["gravedad_zona"]

        seleccionados = [
            registro
            for registro in registros
            if (not sel_pri or registro["prioridad"] in sel_pri)
            and (not sel_tip or registro["veredicto"] in sel_tip)
            and (not sel_grav or registro["gravedad"] in sel_grav)
            and (not sel_ten or registro["trayectoria"] in sel_ten)
            and (not sel_zon or registro["zona_regional"] in sel_zon)
            and (not sel_mun or registro["municipio"] in sel_mun)
            and (not sel_cla or registro["clase"] in sel_cla)
            and (not sel_tam or registro["tamano"] in sel_tam)
        ]
        # Orden: primero lo que hay que gestionar, luego vigilar; dentro de cada grupo, de mayor a menor pérdida.
        seleccionados.sort(key=lambda registro: (ORDEN_PRIORIDAD.get(registro["prioridad"], 0), -registro[col_op]))
        top = seleccionados[:n]

        def _suma(filas: list[dict[str, Any]]) -> dict[str, float]:
            return {
                "clientes": len(filas),
                "perdida_kwh_mes": sum(fila["perdida_kwh_mes"] for fila in filas),
                "valor_riesgo_mes": sum(fila["valor_riesgo_mes"] for fila in filas),
            }

        items = []
        for puesto, registro in enumerate(top, start=1):
            # Referencia de la pérdida: consumo reciente + lo que se pierde (referencia_caida).
            referencia = registro["consumo_reciente_kwh"] + registro["perdida_kwh_mes"]
            items.append(
                {
                    "puesto": puesto,
                    **registro,
                    "referencia_kwh": referencia,
                    "caida_pct": ((registro["consumo_reciente_kwh"] - referencia) / referencia * 100) if referencia > 0 else None,
                }
            )

        return {
            "total_lista": len(registros),
            "evaluados": int(db.scalar(select(func.count(func.distinct(ClientDropAnalysis.niu)))) or 0),
            "resumen": _suma(seleccionados),
            "top": _suma(top),
            "items": items,
            "gravedad_zona": gravedad_zona,
            "cero_sostenido": _resumen_cero_sostenido(db),
            "opciones": {
                "zonas": cache["zonas"],
                "municipios": cache["municipios"],
                "clases": cache["clases"],
                "tamanos": cache["tamanos"],
            },
        }
    except OperationalError as exc:
        raise schema_error(exc) from exc


def _zero_lista(db: Session, ultimo_corte: int) -> list[dict[str, Any]]:
    """Lista completa de clientes en cero sostenido, memorizada por corte (zero_sustained)."""
    registros: list[dict[str, Any]] = []
    for registro in db.scalars(
        select(DatasetRecord).where(
            DatasetRecord.dataset_key == "zero_sustained",
            DatasetRecord.data_run_id == ultimo_corte,
        )
    ).all():
        payload = registro.payload or {}
        niu = str(registro.niu or payload.get("NIU") or "").strip()
        if niu.endswith(".0"):
            niu = niu[:-2]
        meses = _numero(payload, "meses_en_cero", "meses_en_cero_min")
        ultimo_mes = str(payload.get("ultimo_mes_con_consumo") or "")
        if ultimo_mes.endswith(".0"):
            ultimo_mes = ultimo_mes[:-2]
        registros.append(
            {
                "niu": niu,
                "municipio": "",
                "zona_regional": str(payload.get("zona_regional") or "SIN ZONA"),
                "clase": str(payload.get("clase_servicio_nombre") or payload.get("clase_servicio") or "SIN CLASIFICAR"),
                "consumo_referencia_kwh": _numero(payload, "consumo_referencia_kwh", "consumo_anterior_kwh") or 0.0,
                "consumo_reciente_kwh": _numero(payload, "consumo_reciente_kwh") or 0.0,
                "valor_facturaba_antes_mes": _numero(payload, "valor_facturaba_antes_mes") or 0.0,
                "tarifa_kwh": _numero(payload, "tarifa_kwh") or 0.0,
                "ultimo_mes_con_consumo": ultimo_mes,
                "meses_en_cero": None if meses is None else int(meses),
            }
        )
    # Cruce con el TC1 para el municipio, memorizado por corte (agregar_municipio).
    municipios = _municipios_de_la_lista(db, f"cero:{ultimo_corte}", [registro["niu"] for registro in registros])
    for registro in registros:
        registro["municipio"] = municipios.get(registro["niu"], "")
    registros.sort(key=lambda registro: registro["niu"])
    return registros


@router.get("/zero")
def zero(
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Clientes en cero o casi cero sostenido (sección "Clientes sin consumo") con su municipio del TC1.

    Devuelve la lista completa: la situación, el tiempo sin consumo, el tamaño, los filtros y el orden
    se calculan en la web sobre estas filas, igual que el Streamlit sobre su CSV.
    """
    try:
        ultimo_corte = int(
            db.scalar(
                select(func.max(DatasetRecord.data_run_id)).where(DatasetRecord.dataset_key == "zero_sustained")
            )
            or 0
        )
        cache = _ZERO_CACHE.get(ultimo_corte)
        if cache is None:
            cache = _memoiza_corte(_ZERO_CACHE, ultimo_corte, _zero_lista(db, ultimo_corte))
        return {"total": len(cache), "items": cache}
    except OperationalError as exc:
        raise schema_error(exc) from exc


# ---------------------------------------------------------------------------
# Riesgo de fuga (sección "Clientes con probabilidad de fuga a otro comercializador")
# ---------------------------------------------------------------------------

_FUGA_CACHE: dict[int, list[dict[str, Any]]] = {}

_ESTADO_LISTA_SIMPLE = {"NUEVO": "Nuevo este mes", "PERSISTENTE": "Sigue desde el corte anterior", "REINCIDENTE": "Ya había estado antes"}

_FUGA_COLUMNAS_CSV = [
    "Prioridad",
    "NIU",
    "Municipio",
    "Zona regional",
    "Ciclo",
    "Clase",
    "Tamaño",
    "Consumo promedio 6 meses (kWh/mes)",
    "Factura promedio 6 meses ($/mes)",
    "Probabilidad de fuga (6 meses)",
    "Riesgo",
    "Consumo esperado en riesgo (kWh/mes)",
    "Pérdida esperada ($/mes)",
    "Señales observadas",
    "Situación",
]


def _es(valor: float, decimales: int = 0) -> str:
    """Número en formato español (punto de miles, coma decimal), como fmt_n del Streamlit."""
    texto = f"{valor:,.{decimales}f}"
    return texto.replace(",", "\u0000").replace(".", ",").replace("\u0000", ".")


def _prob_pct(prob: float) -> str:
    """Probabilidad en %, con decimales suficientes para que 0,004 % no se lea como 0,0 %."""
    v = float(prob) * 100
    if v >= 1:
        return _es(v, 1) + " %"
    if v >= 0.01:
        return _es(v, 2) + " %"
    return "< 0,01 %" if v > 0 else "0 %"


def _csv_texto(columnas: list[str], filas: list[list[Any]]) -> str:
    """CSV con separador ';' y coma decimal (csv_es del Streamlit), listo para Excel en español."""

    def celda(valor: Any) -> str:
        if valor is None:
            return ""
        if isinstance(valor, bool):
            return "Sí" if valor else "No"
        if isinstance(valor, (int, float)):
            return str(valor).replace(".", ",")
        texto = str(valor)
        if any(c in texto for c in (';', '"', "\n")):
            return '"' + texto.replace('"', '""') + '"'
        return texto

    lineas = [";".join(celda(columna) for columna in columnas)]
    lineas.extend(";".join(celda(valor) for valor in fila) for fila in filas)
    return "\r\n".join(lineas)


def _fuga_lista(db: Session, run_id: int | None) -> list[dict[str, Any]]:
    """Riesgo de fuga por cliente con el municipio del TC1, memorizado por corte (riesgo_fuga_clientes.csv)."""
    if run_id is None:
        return []
    cache = _FUGA_CACHE.get(run_id)
    if cache is not None:
        return cache

    registros = db.scalars(select(ClientChurnRisk).where(ClientChurnRisk.data_run_id == run_id)).all()
    municipios = _municipios_de_la_lista(db, f"fuga:{run_id}", [str(registro.niu or "") for registro in registros])
    filas: list[dict[str, Any]] = []
    for registro in registros:
        payload = registro.payload or {}
        prob = _numero(payload, "prob_fuga_6m") or 0.0
        consumo_6m = _numero(payload, "consumo_prom_6m_kwh") or 0.0
        niu = str(registro.niu or payload.get("NIU") or "").strip()
        filas.append(
            {
                "ranking": int(_numero(payload, "ranking") or 0),
                "niu": niu,
                "municipio": municipios.get(niu, ""),
                "zona_regional": str(payload.get("zona_regional") or "SIN ZONA"),
                "ciclo": str(payload.get("zona_nombre") or ""),
                "clase": str(payload.get("clase_servicio_nombre") or "SIN CLASIFICAR"),
                "tamano": str(payload.get("grupo_consumo") or "Sin historia suficiente"),
                "consumo_6m": consumo_6m,
                "valor_riesgo": _numero(payload, "valor_en_riesgo_mes") or 0.0,
                "prob": prob,
                "riesgo": str(registro.nivel_riesgo or payload.get("nivel_riesgo") or ""),
                "consumo_esperado": consumo_6m * prob,
                "valor_esperado": _numero(payload, "valor_esperado_perdida_mes") or 0.0,
                "senales": str(payload.get("senales") or ""),
                "situacion": str(payload.get("estado_en_lista") or ""),
                "corte": str(payload.get("fecha_corte") or registro.fecha_corte or "")[:7],
            }
        )
    # solo los dos cortes más recientes, para que la memoria no crezca sin límite
    while len(_FUGA_CACHE) >= 2:
        _FUGA_CACHE.pop(next(iter(_FUGA_CACHE)))
    _FUGA_CACHE[run_id] = filas
    return filas


def _fuga_vigilancia(db: Session) -> list[dict[str, Any]]:
    """Grandes clientes del mercado no regulado (vigilancia_mercado_no_regulado.csv) con su municipio."""
    ultimo = db.scalar(select(func.max(DatasetRecord.data_run_id)).where(DatasetRecord.dataset_key == "churn_non_regulated"))
    registros = db.scalars(
        select(DatasetRecord).where(DatasetRecord.dataset_key == "churn_non_regulated", DatasetRecord.data_run_id == ultimo)
    ).all()
    nius = [str(registro.niu or (registro.payload or {}).get("NIU") or "") for registro in registros]
    municipios = _municipios_de_la_lista(db, f"vigilancia:{ultimo or 0}", nius)
    filas: list[dict[str, Any]] = []
    for registro, niu in zip(registros, nius):
        payload = registro.payload or {}
        prob = _numero(payload, "prob_fuga_6m")
        filas.append(
            {
                "niu": niu,
                "municipio": municipios.get(niu, ""),
                "motivo": str(payload.get("motivo") or ""),
                "clase": str(payload.get("clase_servicio_nombre") or "SIN CLASIFICAR"),
                "consumo_12m": _numero(payload, "consumo_prom_12m_kwh"),
                "valor_facturado_mes": _numero(payload, "valor_facturado_mes"),
                "riesgo": str(payload.get("nivel_riesgo") or ""),
                "prob": prob,
            }
        )
    filas.sort(key=lambda fila: -(fila["prob"] or 0.0))
    return filas


def _fuga_filtradas(
    filas: list[dict[str, Any]],
    niv: set[str],
    zon: set[str],
    mun: set[str],
    cla: set[str],
    tam: set[str],
) -> list[dict[str, Any]]:
    """Lista de riesgo de fuga con los filtros de la página aplicados, de mayor a menor pérdida esperada."""
    seleccion = [
        fila
        for fila in filas
        if (not niv or fila["riesgo"] in niv)
        and (not zon or fila["zona_regional"] in zon)
        and (not mun or fila["municipio"] in mun)
        and (not cla or fila["clase"] in cla)
        and (not tam or fila["tamano"] in tam)
    ]
    return seleccion


def _fuga_orden(seleccion: list[dict[str, Any]], medida: str) -> list[dict[str, Any]]:
    """De mayor a menor pérdida esperada de la medida activa y, a igual pérdida, de mayor a menor probabilidad."""
    clave = "valor_esperado" if medida == "Facturación" else "consumo_esperado"
    return sorted(seleccion, key=lambda fila: (-fila[clave], -fila["prob"]))


def _fuga_opciones(filas: list[dict[str, Any]]) -> dict[str, Any]:
    """Opciones de los filtros de la página, en el orden del glosario."""
    zonas = {fila["zona_regional"] for fila in filas}
    municipios: dict[str, set[str]] = {}
    for fila in filas:
        if fila["municipio"]:
            municipios.setdefault(fila["municipio"], set()).add(fila["zona_regional"])
    tamanos = {fila["tamano"] for fila in filas}
    return {
        "zonas": [zona for zona in ZONAS_REGIONALES if zona in zonas] + sorted(zonas - set(ZONAS_REGIONALES)),
        "municipios": [{"municipio": nombre, "zonas": sorted(zonales)} for nombre, zonales in sorted(municipios.items())],
        "clases": sorted({fila["clase"] for fila in filas}),
        "tamanos": [grupo for grupo in GRUPOS_CONSUMO_ORDEN if grupo in tamanos] + sorted(tamanos - set(GRUPOS_CONSUMO_ORDEN)),
    }


def _fuga_filtros(niv: str | None, zon: str | None, mun: str | None, cla: str | None, tam: str | None) -> dict[str, set[str]]:
    def _elegidos(texto: str | None) -> set[str]:
        return {valor.strip() for valor in (texto or "").split(",") if valor.strip()}

    return {"niv": _elegidos(niv), "zon": _elegidos(zon), "mun": _elegidos(mun), "cla": _elegidos(cla), "tam": _elegidos(tam)}


@router.get("/fuga")
def fuga(
    medida: str = "Consumo",
    n: int = Query(1000, ge=25, le=5000),
    niv: str | None = None,
    zon: str | None = None,
    mun: str | None = None,
    cla: str | None = None,
    tam: str | None = None,
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Riesgo de fuga a otro comercializador: los primeros n clientes de la lista filtrada, indicadores globales y vigilancia.

    Replica la sección "Clientes con probabilidad de fuga a otro comercializador" del Streamlit: la lista va de mayor a menor
    pérdida esperada de la medida elegida, y la tabla muestra los primeros 1.000 (la descarga trae la lista filtrada completa).
    """
    try:
        run_id = db.scalar(select(func.max(ClientChurnRisk.data_run_id)))
        filas = _fuga_lista(db, run_id)
        elegidos = _fuga_filtros(niv, zon, mun, cla, tam)
        seleccion = _fuga_orden(_fuga_filtradas(filas, **elegidos), medida)
        return {
            "total_lista": len(filas),
            "filtrados": len(seleccion),
            "alto_medio": sum(1 for fila in filas if fila["riesgo"] in ("ALTO", "MEDIO")),
            "corte": filas[0]["corte"] if filas else "",
            # Los indicadores son de la lista filtrada (como en el original); el total y el
            # ALTO/MEDIO son de la lista completa, que es lo que pide la línea de conteo.
            "resumen": {
                "clientes": len(seleccion),
                "consumo_6m": sum(fila["consumo_6m"] for fila in seleccion),
                "valor_riesgo": sum(fila["valor_riesgo"] for fila in seleccion),
                "consumo_esperado": sum(fila["consumo_esperado"] for fila in seleccion),
                "valor_esperado": sum(fila["valor_esperado"] for fila in seleccion),
            },
            "items": seleccion[:n],
            "vigilancia": _fuga_vigilancia(db),
            "opciones": _fuga_opciones(filas),
        }
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/fuga/csv")
def fuga_csv(
    medida: str = "Consumo",
    niv: str | None = None,
    zon: str | None = None,
    mun: str | None = None,
    cla: str | None = None,
    tam: str | None = None,
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(current_user),
) -> Response:
    """La misma lista de riesgo de fuga completa (todas las filas filtradas) como CSV en español, para Excel."""
    try:
        run_id = db.scalar(select(func.max(ClientChurnRisk.data_run_id)))
        filas = _fuga_lista(db, run_id)
        elegidos = _fuga_filtros(niv, zon, mun, cla, tam)
        seleccion = _fuga_orden(_fuga_filtradas(filas, **elegidos), medida)
        filas_csv = [
            [
                fila["ranking"],
                fila["niu"],
                fila["municipio"] or "—",
                fila["zona_regional"],
                fila["ciclo"],
                fila["clase"],
                fila["tamano"],
                round(fila["consumo_6m"]),
                round(fila["valor_riesgo"]),
                _prob_pct(fila["prob"]),
                fila["riesgo"],
                round(fila["consumo_esperado"]),
                round(fila["valor_esperado"]),
                fila["senales"],
                _ESTADO_LISTA_SIMPLE.get(fila["situacion"], ""),
            ]
            for fila in seleccion
        ]
        corte = seleccion[0]["corte"] if seleccion else ""
        return Response(
            _csv_texto(_FUGA_COLUMNAS_CSV, filas_csv),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="clientes_riesgo_de_irse_{corte}.csv"'},
        )
    except OperationalError as exc:
        raise schema_error(exc) from exc


@router.get("/salidas")
def salidas(
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Clientes que ya están con otro comercializador y el perfil de los que se fueron.

    Replica la sección "Clientes que ya se fueron" del Streamlit: la lista entera (459 clientes) para filtrarla en la web,
    los conteos por estado, lo que consumían y facturaban antes de irse y el perfil por dimensión. El nombre del
    comercializador que atiende hoy a cada cliente no se muestra ni se descarga (pedido de negocio, octubre de 2026).
    """
    try:
        ultimo = db.scalar(select(func.max(DatasetRecord.data_run_id)).where(DatasetRecord.dataset_key == "churn_other_supplier"))
        items: list[dict[str, Any]] = []
        corte = ""
        for registro in db.scalars(
            select(DatasetRecord).where(
                DatasetRecord.dataset_key == "churn_other_supplier",
                DatasetRecord.data_run_id == ultimo,
            )
        ).all():
            payload = registro.payload or {}
            if not corte:
                corte = str(payload.get("fecha_corte") or "")[:7]
            items.append(
                {
                    "niu": str(registro.niu or payload.get("NIU") or "").strip(),
                    "estado": str(payload.get("estado") or ""),
                    "municipio": str(payload.get("municipio") or ""),
                    "zona": str(payload.get("zona_nombre") or ""),
                    "clase": str(payload.get("clase_servicio_nombre") or ""),
                    "desde": str(payload.get("primer_mes_otro") or "")[:7],
                    "mes_salida": str(payload.get("mes_salida") or "")[:7],
                    "consumo_antes": _numero(payload, "consumo_prom_6m_antes_salida_kwh"),
                    "valor_antes": _numero(payload, "valor_facturado_antes_salida_mes"),
                }
            )

        conteo: dict[str, int] = {}
        for item in items:
            conteo[item["estado"]] = conteo.get(item["estado"], 0) + 1
        estados = sorted(conteo.items(), key=lambda par: -par[1])

        # Perfil de los que se fueron, sin la dimensión del comercializador (política de la empresa).
        ultimo_perfil = db.scalar(select(func.max(DatasetRecord.data_run_id)).where(DatasetRecord.dataset_key == "churn_left_profiles"))
        perfil: list[dict[str, Any]] = []
        for registro in db.scalars(
            select(DatasetRecord).where(
                DatasetRecord.dataset_key == "churn_left_profiles",
                DatasetRecord.data_run_id == ultimo_perfil,
            )
        ).all():
            payload = registro.payload or {}
            dimension = str(payload.get("dimension") or "")
            if "comercializador" in dimension.lower():
                continue
            perfil.append(
                {
                    "dimension": dimension,
                    "valor": payload.get("valor"),
                    "n": _numero(payload, "n"),
                    "pct": _numero(payload, "pct"),
                }
            )

        return {
            "total": len(items),
            "corte": corte,
            "items": items,
            "resumen": {
                "estados": [{"estado": estado, "clientes": clientes} for estado, clientes in estados],
                "consumo_antes": sum(item["consumo_antes"] or 0.0 for item in items),
                "valor_antes": sum(item["valor_antes"] or 0.0 for item in items),
                "con_historia_consumo": sum(1 for item in items if item["consumo_antes"] is not None),
                "con_historia_valor": sum(1 for item in items if item["valor_antes"] is not None),
            },
            "perfil": perfil,
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
            result[row.niu] = {"municipio": row.municipio, "direccion": row.direccion, "latitud": row.latitud, "longitud": row.longitud, "coordenadas_validas": row.coordenadas_validas}
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


def _directorio_datos() -> Path:
    """Carpeta raíz de resultados del pipeline. En local es streamlit_origen/datos; si existe EBSA_DATA_DIR, esa manda."""
    configurada = os.getenv("EBSA_DATA_DIR")
    if configurada and Path(configurada).is_dir():
        return Path(configurada)
    return Path(__file__).resolve().parents[2] / "streamlit_origen" / "datos"


def _dentro_de(ruta: Path, base: Path) -> bool:
    """Ninguna ruta puede salirse de la carpeta de datos (defensa contra ../)."""
    try:
        return ruta.resolve().is_relative_to(base.resolve())
    except OSError:
        return False


@router.get("/exportes")
def listar_exportes(db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    """Índice de exportes del negocio (11_exportes_negocio) agrupado por producto, con el estado y el
    tamaño reales de cada archivo en disco. Solo se lee el índice: los CSV pesan hasta ~145 MB."""
    try:
        items, total = dataset_service.query_dataset(db, "exports_index", 500, 0)
    except OperationalError as exc:
        raise schema_error(exc) from exc
    base = _directorio_datos()
    productos: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        fila = item.get("payload") or {}
        relativa = str(fila.get("archivo") or "").replace("\\", "/")
        ruta = (base / relativa) if relativa else None
        existe = bool(ruta and ruta.is_file() and _dentro_de(ruta, base))
        clientes = fila.get("clientes")
        productos.setdefault(str(fila.get("producto") or "otros"), []).append({
            "grupo_consumo": fila.get("grupo_consumo"),
            "clientes": int(float(clientes)) if clientes not in (None, "") else 0,
            "fecha_corte": fila.get("fecha_corte"),
            "archivo": Path(relativa).name,
            "ruta": relativa,
            "tamano_mb": round(ruta.stat().st_size / 1e6, 1) if existe else None,
            "estado": "disponible" if existe else "no encontrado",
        })
    return {"productos": [{"producto": producto, "filas": filas} for producto, filas in productos.items()], "total": total, "directorio": base.name}


@router.get("/exportes/archivo")
def descargar_exporte(
    archivo: str = Query(..., description="Ruta relativa tal como aparece en el índice de exportes"),
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(require_roles(*ALL_ROLES)),
) -> Response:
    """Descarga un archivo de 11_exportes_negocio tal como está en disco. Solo se sirven las rutas que
    están en el índice (y dentro de la carpeta de datos); el archivo va por streaming."""
    try:
        items, _ = dataset_service.query_dataset(db, "exports_index", 500, 0)
    except OperationalError as exc:
        raise schema_error(exc) from exc
    permitidas = {str((item.get("payload") or {}).get("archivo") or "").replace("\\", "/") for item in items}
    relativa = archivo.replace("\\", "/").strip()
    if relativa not in permitidas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ese archivo no está en el índice de exportes.")
    base = _directorio_datos()
    ruta = base / relativa
    if not _dentro_de(ruta, base) or not ruta.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El archivo no existe en disco en este equipo. Corre el pipeline (paso 15) y vuelve a intentarlo.")
    return FileResponse(ruta, media_type="text/csv; charset=utf-8", filename=ruta.name)


@router.get("/route")
def visit_route(
    cycle: int | None = None,
    zona: str | None = None,
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(require_roles("SOPORTE", "ADMIN_MODELO")),
) -> dict[str, Any]:
    """Ruta de visitas por ciclo de lectura (sección Visitas por ciclo). Devuelve los ciclos
    disponibles —acotados a la zona regional si se pide, como base_c del original—, las zonas de la
    lista y los clientes del ciclo con su ubicación y las columnas de negocio de la tabla. La zona
    solo decide qué ciclos se ofrecen: los clientes se filtran por el ciclo elegido, igual que en
    el Streamlit."""
    try:
        # Conteos por ciclo sobre la lista entera: linea_conteo los usa como "en el ciclo sin filtros".
        conteo_global = {
            (ciclo, ciclo_etiqueta): int(clientes)
            for ciclo, ciclo_etiqueta, clientes in db.execute(
                select(OperationalManagement.ciclo, OperationalManagement.ciclo_etiqueta, func.count())
                .group_by(OperationalManagement.ciclo, OperationalManagement.ciclo_etiqueta)
                .order_by(OperationalManagement.ciclo)
            ).all()
        }
        # La zona regional vive en el catálogo del cliente; en el original es operativa["zona_regional"].
        disponibles = set(conteo_global)
        if zona:
            disponibles = set(
                db.execute(
                    select(OperationalManagement.ciclo, OperationalManagement.ciclo_etiqueta)
                    .join(Client, Client.niu == OperationalManagement.niu)
                    .where(Client.zona_regional == zona)
                    .distinct()
                ).all()
            )
        cycles = [
            {
                "ciclo": ciclo,
                "ciclo_etiqueta": ciclo_etiqueta,
                "etiqueta": etiqueta_ciclo(ciclo),
                "clientes": conteo_global[(ciclo, ciclo_etiqueta)],
            }
            for ciclo, ciclo_etiqueta in conteo_global
            if (ciclo, ciclo_etiqueta) in disponibles
        ]
        # Las zonas salen del catálogo de los clientes de la lista, sin depender del ciclo pedido.
        zonas_lista = {
            valor
            for valor in db.scalars(select(Client.zona_regional).where(Client.niu.in_(select(OperationalManagement.niu))).distinct()).all()
            if valor
        }
        # Sin ciclo elegido solo se piden las opciones (ciclos y zonas): la lista completa son decenas de
        # miles de filas que el navegador no necesita para pintar los dos desplegables.
        items: list[dict[str, Any]] = []
        rows = []
        consulta_items = select(OperationalManagement)
        if cycle is not None:
            consulta_items = consulta_items.where(OperationalManagement.ciclo == cycle)
            rows = db.scalars(
                consulta_items.order_by(nulls_last(OperationalManagement.orden_en_ciclo.asc()), OperationalManagement.valor_riesgo_mes.desc()).limit(limit)
            ).all()
        locations = locations_by_niu(db, [row.niu for row in rows])
        clients = clients_by_niu(db, [row.niu for row in rows])
        for item in rows:
            ubicacion = locations.get(item.niu, {})
            atributos = clients.get(item.niu, {})
            payload = item.payload or {}
            # Gravedad de negocio y referencia de la caída: mismos cálculos que _drops_lista y referencia_caida.
            reciente = float(payload.get("consumo_reciente_kwh") or 0)
            perdida = float(item.perdida_kwh_mes or 0)
            referencia = reciente + perdida
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
                    "coordenadas_validas": bool(ubicacion.get("coordenadas_validas")),
                    "orden_en_ciclo": item.orden_en_ciclo,
                    "clase": str(payload.get("clase_servicio_nombre") or payload.get("clase_servicio") or "SIN CLASIFICAR"),
                    "lectura": str(payload.get("tipo_lectura_nombre") or ""),
                    "veredicto": str(payload.get("veredicto") or ""),
                    "gravedad": _gravedad(item.severidad, payload.get("veredicto")),
                    "referencia_kwh": referencia,
                    "consumo_reciente_kwh": reciente,
                    "caida_pct": ((reciente - referencia) / referencia * 100) if referencia > 0 else None,
                    "valor_riesgo_mes": float(item.valor_riesgo_mes or 0),
                    "trayectoria": str(item.trayectoria or ""),
                    "prioridad": str(item.prioridad_gestion or ""),
                    "situacion": str(item.estado_en_lista or ""),
                    "payload": {**payload, **{key: value for key, value in atributos.items() if value}, **{key: value for key, value in ubicacion.items() if value}},
                }
            )
        return {
            "cycles": cycles,
            "zonas": [valor for valor in ZONAS_REGIONALES if valor in zonas_lista] + sorted(zonas_lista - set(ZONAS_REGIONALES)),
            "items": items,
            "total": len(items),
            "total_lista": int(db.scalar(select(func.count()).select_from(OperationalManagement)) or 0),
            "cycle": cycle,
        }
    except OperationalError as exc:
        raise schema_error(exc) from exc


# ---------------------------------------------------------------------------
# Ejemplos: el expander "¿No tienes un NIU a mano?" de la sección "Buscar cliente"
# ---------------------------------------------------------------------------
# El original arma en pandas una tabla de TODOS los clientes segmentados (R.clusters, ~596 mil)
# cruzada con el pronóstico (perfil -> grupo de consumo), el ciclo del TC1, la ubicación, la
# lista de caída y la fuga; el propio código avisa que "se arman solo cuando se piden: cruzan
# las tablas de todos los clientes y tardan unos segundos". Aquí se replica en SQL sobre las
# mismas tablas. El municipio y el grupo de las 50 filas visibles se piden aparte (50 lookups)
# en vez de cruzar las dos tablas grandes completas: unir client_locations y client_forecasts
# a los 596 mil clientes se pasa del tiempo máximo de la función en Vercel.
EJEMPLOS_LIMITE = 50
SIN_LISTA = "No está en la lista de caída"
SIN_HISTORIA = "Sin historia suficiente"
NO_PUNTUADO = "No puntuado"
_EJEMPLOS_OPCIONES_CACHE: dict[int, dict[str, Any]] = {}
_EJEMPLOS_CACHE: dict[tuple[int, tuple[tuple[str, str], ...]], dict[str, Any]] = {}


def _ejemplos_opciones(db: Session) -> dict[str, Any]:
    """Valores de los seis filtros del expander, memorizados por corte."""
    corte_id = _corte_operativo(db)
    cache = _EJEMPLOS_OPCIONES_CACHE.get(corte_id)
    if cache is not None:
        return cache
    grupos = {str(g) for g in db.scalars(select(ClientForecast.grupo_consumo).where(ClientForecast.horizonte == 1).distinct()) if g}
    filas_segmento, _ = dataset_service.query_dataset(db, "segment_catalog", 200, 0)
    segmentos = sorted({str(fila["payload"].get("cluster_id")) for fila in filas_segmento if fila["payload"].get("cluster_id")})
    ciclos = sorted({int(c) for c in db.scalars(select(Client.ciclo).where(Client.ciclo.is_not(None)).distinct())})
    municipios = sorted({str(m) for m in db.scalars(select(ClientLocation.municipio).distinct()) if m})
    trayectorias = sorted({str(t) for t in db.scalars(select(OperationalManagement.trayectoria).distinct()) if t})
    opciones = {
        "grupo": [g for g in GRUPOS_CONSUMO_ORDEN if g in grupos] + sorted(grupos - set(GRUPOS_CONSUMO_ORDEN)),
        "segmento": segmentos,
        "ciclo": [f"{ciclo:02d}" for ciclo in ciclos],
        "municipio": municipios,
        "trayectoria": trayectorias + [SIN_LISTA],
        "fuga": ["ALTO", "MEDIO", "BAJO", NO_PUNTUADO],
    }
    return _memoiza_corte(_EJEMPLOS_OPCIONES_CACHE, corte_id, opciones)


def _json_campo(db: Session, columna: Any, ruta: str) -> Any:
    """Un campo del JSON del payload con la función que entiende cada motor: JSON_EXTRACT en
    SQLite (local) y JSON_VALUE en Azure SQL. La extracción por índice de SQLAlchemy
    (columna["$.campo"]) no se compila a ninguna de las dos y devuelve NULL."""
    if db.get_bind().dialect.name == "mssql":
        return func.json_value(columna, ruta)
    return func.json_extract(columna, ruta)


def _ejemplos_buscar(db: Session, filtros: dict[str, str]) -> dict[str, Any]:
    """Conteo y primeras 50 filas de los ejemplos, memorizados por corte y filtros."""
    corte_id = _corte_operativo(db)
    clave = (corte_id, tuple(sorted((k, v) for k, v in filtros.items() if v)))
    cache = _EJEMPLOS_CACHE.get(clave)
    if cache is not None:
        return cache

    dr, cli, om, cr = DatasetRecord, Client, OperationalManagement, ClientChurnRisk
    condiciones: list[Any] = [dr.dataset_key == "clusters", dr.niu.is_not(None)]
    if filtros.get("segmento"):
        # Igual que _payload_equals de datasets.py: LIKE sobre el JSON serializado, portable a Azure SQL.
        condiciones.append(cast(dr.payload, String).like(f'%"cluster_id": "{filtros["segmento"]}"%'))
    if filtros.get("ciclo"):
        try:
            condiciones.append(cli.ciclo == int(filtros["ciclo"]))
        except ValueError:
            pass
    if filtros.get("municipio"):
        condiciones.append(dr.niu.in_(select(ClientLocation.niu).where(ClientLocation.municipio == filtros["municipio"])))
    grupo = filtros.get("grupo")
    if grupo == SIN_HISTORIA:
        # El fillna del original: son los que no tienen fila de pronóstico más los marcados como tales.
        condiciones.append(dr.niu.not_in(select(ClientForecast.niu).where(ClientForecast.horizonte == 1, ClientForecast.grupo_consumo != SIN_HISTORIA)))
    elif grupo:
        condiciones.append(dr.niu.in_(select(ClientForecast.niu).where(ClientForecast.horizonte == 1, ClientForecast.grupo_consumo == grupo)))
    if filtros.get("trayectoria") == SIN_LISTA:
        condiciones.append(om.niu.is_(None))
    elif filtros.get("trayectoria"):
        condiciones.append(om.trayectoria == filtros["trayectoria"])
    if filtros.get("fuga") == NO_PUNTUADO:
        condiciones.append(cr.niu.is_(None))
    elif filtros.get("fuga"):
        condiciones.append(cr.nivel_riesgo == filtros["fuga"])

    def cruces(columnas: list[Any]) -> Any:
        return (
            select(*columnas)
            .select_from(dr)
            .join(cli, cli.niu == dr.niu)
            .outerjoin(om, om.niu == dr.niu)
            .outerjoin(cr, cr.niu == dr.niu)
            .where(*condiciones)
        )

    total = int(db.scalar(select(func.count()).select_from(cruces([dr.niu]).subquery())) or 0)

    mediana = _json_campo(db, dr.payload, "$.mediana_12m_kwh")
    cluster = _json_campo(db, dr.payload, "$.cluster_id")
    zona = _json_campo(db, dr.payload, "$.zona")
    veredicto = _json_campo(db, om.payload, "$.veredicto")
    # Orden del original: valor_riesgo_mes y mediana descendentes, con los vacíos al final
    # (na_position="last"); el CASE es la forma portable de "NULLS LAST" en SQLite y Azure SQL.
    sin_valor = case((om.valor_riesgo_mes.is_(None), 1), else_=0)
    sin_mediana = case((mediana.is_(None), 1), else_=0)
    registros = db.execute(
        cruces([dr.niu, cli.ciclo, cli.zona_nombre, mediana, cluster, zona,
                veredicto, om.severidad, om.trayectoria, om.valor_riesgo_mes,
                cr.nivel_riesgo, cr.prob_fuga_6m])
        .order_by(sin_valor, om.valor_riesgo_mes.desc(), sin_mediana, mediana.desc())
        .limit(EJEMPLOS_LIMITE)
    ).all()

    # Municipio y grupo solo de las 50 filas visibles: 50 lookups en vez de cruzar las tablas enteras.
    nius = [registro[0] for registro in registros]
    municipios = {niu: municipio for niu, municipio in db.execute(select(ClientLocation.niu, ClientLocation.municipio).where(ClientLocation.niu.in_(nius)))} if nius else {}
    grupos_niu = {niu: g for niu, g in db.execute(select(ClientForecast.niu, ClientForecast.grupo_consumo).where(ClientForecast.horizonte == 1, ClientForecast.niu.in_(nius)))} if nius else {}

    items = [
        {
            "niu": niu,
            "municipio": municipios.get(niu) or "",
            "ciclo_etiqueta": f"{int(ciclo):02d}" if ciclo is not None else "SIN_CICLO",
            "zona_nombre": zona_nombre or "",
            "grupo_consumo": grupos_niu.get(niu) or SIN_HISTORIA,
            "cluster_id": cluster_id or "",
            "zona": zona_ or "",
            "mediana_12m_kwh": float(mediana_) if mediana_ is not None else None,
            "veredicto": veredicto or SIN_LISTA,
            "severidad": severidad or SIN_LISTA,
            "trayectoria": trayectoria_ or SIN_LISTA,
            "valor_riesgo_mes": float(valor) if valor is not None else None,
            "riesgo_fuga": nivel_riesgo or NO_PUNTUADO,
            "prob_fuga_6m": float(prob) if prob is not None else None,
        }
        for niu, ciclo, zona_nombre, mediana_, cluster_id, zona_, veredicto, severidad, trayectoria_, valor, nivel_riesgo, prob in registros
    ]
    respuesta = {"total": total, "limite": EJEMPLOS_LIMITE, "opciones": _ejemplos_opciones(db), "items": items}
    if len(_EJEMPLOS_CACHE) >= 64:
        _EJEMPLOS_CACHE.clear()
    _EJEMPLOS_CACHE[clave] = respuesta
    return respuesta


@router.get("/search")
def buscar_en_lista(
    universo: str | None = None,
    municipio: str | None = None,
    gravedad: str | None = None,
    trayectoria: str | None = None,
    grupo: str | None = None,
    segmento: str | None = None,
    ciclo: str | None = None,
    fuga: str | None = None,
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(require_roles(*ALL_ROLES)),
) -> dict[str, Any]:
    """Buscar clientes por municipio o situación. Es el expander "¿No tienes el NIU?" de las
    secciones Consultar/Buscar un cliente: quien no tiene el NIU lo copia de aquí.

    Dos universos, como en el original:
     - `universo=ejemplos` (Administrador): TODOS los clientes segmentados, con los filtros de
       grupo, segmento, ciclo, municipio, situación en caída y riesgo de fuga.
     - por defecto (Soporte): la lista de caída completa por municipio, gravedad o tendencia,
       sobre la caché de _drops_lista, que ya trae el municipio del TC1."""
    try:
        if universo == "ejemplos":
            return _ejemplos_buscar(db, {
                "municipio": municipio or "", "trayectoria": trayectoria or "", "grupo": grupo or "",
                "segmento": segmento or "", "ciclo": ciclo or "", "fuga": fuga or "",
            })
        registros = _drops_lista(db, _corte_operativo(db))
        candidatos = registros["registros"]
        if municipio:
            candidatos = [registro for registro in candidatos if registro["municipio"] == municipio]
        if gravedad:
            candidatos = [registro for registro in candidatos if registro["gravedad"] == gravedad]
        if trayectoria:
            candidatos = [registro for registro in candidatos if registro["trayectoria"] == trayectoria]
        candidatos = sorted(candidatos, key=lambda registro: registro["valor_riesgo_mes"], reverse=True)[:50]
        return {
            "total": len(candidatos),
            # Los municipios salen de la lista COMPLETA (munis del original), sin filtrar.
            "municipios": [entrada["municipio"] for entrada in registros["municipios"]],
            "items": [
                {
                    "niu": registro["niu"],
                    "municipio": registro["municipio"],
                    "clase": registro["clase"],
                    "gravedad": registro["gravedad"],
                    "trayectoria": registro["trayectoria"],
                    "valor_riesgo_mes": registro["valor_riesgo_mes"],
                }
                for registro in candidatos
            ],
        }
    except OperationalError as exc:
        raise schema_error(exc) from exc


def _texto_a_numero(valor: str | None) -> Any:
    """Los CSV del resumen llegan como texto: enteros y decimales pasan a número, el resto queda texto."""
    texto = (valor or "").strip()
    if not texto:
        return texto
    try:
        numero = float(texto)
    except ValueError:
        return texto
    return int(numero) if numero.is_integer() and "." not in texto else numero


@router.get("/retro")
def resultados_de_las_visitas(
    db: Session = Depends(get_db),
    _: dict[str, Any] = Depends(require_roles(*ALL_ROLES)),
) -> dict[str, Any]:
    """Resultados de las visitas contra la lista (sección "Retroalimentación" del Streamlit).

    Primero se lee el resumen real (dataset retro_resumen, Evaluacion_retroalimentacion_gestion.ipynb);
    si no hay ninguno se cae al ejemplo simulado del disco —igual que hace el original con
    R.gestion/retroalimentacion/ejemplo_simulado— y la respuesta lo marca con `ejemplo`."""
    try:
        filas, total = dataset_service.query_dataset(db, "retro_resumen", 2000, 0)
    except OperationalError as exc:
        raise schema_error(exc) from exc
    if total:
        return {"filas": [registro["payload"] for registro in filas], "ejemplo": False}
    base = _directorio_datos()
    ruta = base / "07_gestion_caida" / "retroalimentacion" / "ejemplo_simulado" / "EJEMPLO_SIMULADO_evaluacion_resumen.csv"
    if not (ruta.is_file() and _dentro_de(ruta, base)):
        return {"filas": [], "ejemplo": False}
    with ruta.open(encoding="utf-8-sig", newline="") as archivo:
        lector = csv.DictReader(archivo)
        filas = [{clave: _texto_a_numero(valor) for clave, valor in fila.items() if clave} for fila in lector]
    return {"filas": filas, "ejemplo": True}


MAP_METRICS = (
    {"key": "caida_kwh_mes", "label": "Consumo que se está perdiendo por caída de consumo (kWh/mes)", "unidad": "kWh"},
    {"key": "caida_clientes", "label": "Clientes con caída de consumo para revisar", "unidad": "clientes"},
    {"key": "caida_criticos", "label": "Clientes con caída grave reciente", "unidad": "clientes"},
    {"key": "fuga_alto_medio", "label": "Clientes con probabilidad de fuga alta o media", "unidad": "clientes"},
    {"key": "fuga_consumo_alto_medio_kwh_mes", "label": "Consumo de los clientes con probabilidad de fuga alta o media (kWh/mes)", "unidad": "kWh"},
    {"key": "clientes_tc1", "label": "Clientes de EBSA en el municipio", "unidad": "clientes"},
    {"key": "caida_valor_mes", "label": "Facturación que se está perdiendo por caída de consumo ($/mes)", "unidad": "$"},
    {"key": "fuga_perdida_esperada_mes", "label": "Pérdida esperada por probabilidad de fuga ($/mes)", "unidad": "$"},
    {"key": "clientes_en_serie", "label": "Clientes en la serie de modelado", "unidad": "clientes"},
    {"key": "caida_pct_clientes", "label": "Caída: % de los clientes del municipio en la lista", "unidad": "%"},
    {"key": "caida_acelerando", "label": "Caída: clientes con caída acelerando", "unidad": "clientes"},
    {"key": "fuga_alto", "label": "Fuga: clientes ALTO", "unidad": "clientes"},
)


def _normalize_name(value: Any) -> str:
    return str(value or "").strip().casefold()


@router.get("/municipalities/metrics")
def municipality_metrics(db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles(*ALL_ROLES))) -> dict[str, Any]:
    """Métricas agregadas por municipio para el mapa y las tablas de zonas.
    Réplica de metricas_municipio()/_metricas_municipio_cache() del Streamlit: una fila por municipio con clientes,
    lista de caída, riesgo de fuga y centro geográfico. Memorizado por corte: el TTL de 60 s obligaba a
    recomputar ~9 s cada minuto justo cuando alguien abría el mapa."""
    try:
        corte_id = _corte_operativo(db)
        cache = _METRICAS_MUNICIPIO_CACHE.get(corte_id)
        if cache is not None:
            return cache
        return _memoiza_corte(_METRICAS_MUNICIPIO_CACHE, corte_id, _metricas_municipio(db))
    except OperationalError as exc:
        raise schema_error(exc) from exc


def _metricas_municipio(db: Session) -> dict[str, Any]:
    catalog_rows, _ = dataset_service.query_dataset(db, "municipalities", 1000, 0)
    catalog: dict[str, dict[str, Any]] = {}
    for row in catalog_rows:
        payload = row["payload"]
        key = _normalize_name(payload.get("municipio"))
        if not key:
            continue
        catalog[key] = {
            "municipio": payload.get("municipio"),
            "codigo_municipio": str(payload.get("codigo_municipio") or ""),
            "provincia": payload.get("provincia"),
            "departamento": payload.get("departamento"),
            "zona_ebsa": payload.get("zona_ebsa"),
            "clientes_tc1": payload.get("clientes_tc1"),
            "clientes_en_serie": payload.get("clientes_en_serie"),
            "lat_centro": payload.get("lat_centro"),
            "lon_centro": payload.get("lon_centro"),
        }

    nius = list(db.scalars(select(OperationalManagement.niu).distinct())) + list(db.scalars(select(ClientChurnRisk.niu).distinct()))
    municipio_por_niu = {niu: ubicacion.get("municipio") for niu, ubicacion in locations_by_niu(db, nius).items()}

    acumulados: dict[str, dict[str, Any]] = {}

    def bucket(niu: str) -> dict[str, Any]:
        key = _normalize_name(municipio_por_niu.get(niu)) or "sin municipio"
        if key not in acumulados:
            acumulados[key] = {
                "municipio": municipio_por_niu.get(niu) or "Sin municipio",
                "caida_clientes": 0, "caida_criticos": 0, "caida_acelerando": 0,
                "caida_kwh_mes": 0.0, "caida_valor_mes": 0.0,
                "fuga_alto": 0, "fuga_medio": 0, "fuga_consumo_alto_medio_kwh_mes": 0.0,
                "fuga_perdida_esperada_mes": 0.0,
            }
        return acumulados[key]

    for niu, severidad, trayectoria, perdida, valor in db.execute(
        select(OperationalManagement.niu, OperationalManagement.severidad, OperationalManagement.trayectoria,
               OperationalManagement.perdida_kwh_mes, OperationalManagement.valor_riesgo_mes)
    ).all():
        item = bucket(niu)
        item["caida_clientes"] += 1
        if str(severidad or "").strip().upper() == "CRITICA":
            item["caida_criticos"] += 1
        if str(trayectoria or "").strip().upper() == "CAIDA_ACELERANDO":
            item["caida_acelerando"] += 1
        item["caida_kwh_mes"] += float(perdida or 0)
        item["caida_valor_mes"] += float(valor or 0)

    for niu, nivel, perdida, payload in db.execute(
        select(ClientChurnRisk.niu, ClientChurnRisk.nivel_riesgo, ClientChurnRisk.valor_esperado_perdida_mes, ClientChurnRisk.payload).where(
            ClientChurnRisk.nivel_riesgo.in_(("ALTO", "MEDIO"))
        )
    ).all():
        item = bucket(niu)
        nivel_ = str(nivel or "").strip().upper()
        if nivel_ == "ALTO":
            item["fuga_alto"] += 1
        elif nivel_ == "MEDIO":
            item["fuga_medio"] += 1
        item["fuga_perdida_esperada_mes"] += float(perdida or 0)
        try:
            item["fuga_consumo_alto_medio_kwh_mes"] += float((payload or {}).get("consumo_prom_6m_kwh") or 0)
        except (TypeError, ValueError):
            pass

    rows: list[dict[str, Any]] = []
    for key, item in acumulados.items():
        info = catalog.get(key, {})
        fila: dict[str, Any] = {**info, **item, "clave": key}
        fila["fuga_alto_medio"] = item["fuga_alto"] + item["fuga_medio"]
        try:
            serie = float(fila.get("clientes_en_serie") or 0)
        except (TypeError, ValueError):
            serie = 0.0
        fila["caida_pct_clientes"] = round(item["caida_clientes"] / serie * 100, 2) if serie > 0 else None
        fila["caidas"] = item["caida_clientes"]            # compatibilidad con la versión anterior
        fila["clientes_lista"] = item["caida_clientes"]
        rows.append(fila)
    rows.sort(key=lambda fila: (-float(fila.get("caida_valor_mes") or 0), _normalize_name(fila.get("municipio"))))

    # Solo Boyacá: los municipios vecinos (Santander, Cundinamarca, Casanare) quedan fuera del mapa.
    boyaca = [f for f in rows
              if "boyac" in _normalize_name(f.get("departamento")) and f.get("lat_centro") is not None and f.get("lon_centro") is not None]
    if not boyaca:    # si el catálogo no trae departamento, no se filtra por ubicación
        boyaca = [f for f in rows if f.get("lat_centro") is not None and f.get("lon_centro") is not None]
    return {"metrics": list(MAP_METRICS), "rows": boyaca}

def precalentar(db: Session) -> None:
    """Rellena en segundo plano las cachés de las secciones más pesadas (panorama, caídas,
    cero, métricas del mapa y fuga) para que la primera visita no espere al primer cálculo.
    Se lanza en un hilo desde el arranque de uvicorn; cualquier fallo es inocuo."""
    try:
        panorama(db=db, _={})
        drops(medida="Consumo", n=200, db=db, _={})
        zero(db=db, _={})
        municipality_metrics(db=db, _={})
        _fuga_lista(db, _corte_operativo(db))
    except Exception:  # noqa: BLE001 - el precalentamiento nunca debe tumbar el arranque
        pass
