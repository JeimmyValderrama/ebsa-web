from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Client, Visit, VisitResult
from .security import require_roles

router = APIRouter(prefix="/api/visits", tags=["visits"])


class VisitCreate(BaseModel):
    niu: str = Field(min_length=1, max_length=80)
    cycle: int | None = None
    scheduled_for: date | None = None
    assigned_to_uid: str | None = None


class VisitResultCreate(BaseModel):
    result: str = Field(min_length=1, max_length=80)
    notes: str | None = None


def visit_dict(visit: Visit, result: VisitResult | None = None) -> dict[str, Any]:
    return {"id": visit.id, "niu": visit.niu, "cycle": visit.cycle, "scheduled_for": visit.scheduled_for.isoformat() if visit.scheduled_for else None, "assigned_to_uid": visit.assigned_to_uid, "status": visit.status, "result": {"result": result.result, "notes": result.notes, "created_by_uid": result.created_by_uid} if result else None}


@router.get("")
def list_visits(cycle: int | None = Query(None), visit_status: str | None = Query(None, alias="status"), db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles("SOPORTE", "ADMIN_MODELO"))) -> list[dict[str, Any]]:
    query = select(Visit).order_by(Visit.scheduled_for.asc(), Visit.id.desc())
    if cycle is not None:
        query = query.where(Visit.cycle == cycle)
    if visit_status:
        query = query.where(Visit.status == visit_status)
    visits = db.scalars(query.limit(500)).all()
    results = {item.visit_id: item for item in db.scalars(select(VisitResult).where(VisitResult.visit_id.in_([item.id for item in visits]))).all()} if visits else {}
    return [visit_dict(item, results.get(item.id)) for item in visits]


@router.post("", status_code=201)
def create_visit(data: VisitCreate, db: Session = Depends(get_db), user: dict[str, Any] = Depends(require_roles("SOPORTE", "ADMIN_MODELO"))) -> dict[str, Any]:
    if db.get(Client, data.niu) is None:
        raise HTTPException(status_code=404, detail="El NIU no existe en la base importada.")
    visit = Visit(niu=data.niu, cycle=data.cycle, scheduled_for=data.scheduled_for, assigned_to_uid=data.assigned_to_uid or str(user.get("uid")))
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return visit_dict(visit)


@router.post("/{visit_id}/result")
def record_result(visit_id: int, data: VisitResultCreate, db: Session = Depends(get_db), user: dict[str, Any] = Depends(require_roles("SOPORTE", "ADMIN_MODELO"))) -> dict[str, Any]:
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise HTTPException(status_code=404, detail="Visita no encontrada.")
    result = db.scalar(select(VisitResult).where(VisitResult.visit_id == visit_id))
    if result is None:
        result = VisitResult(visit_id=visit_id, result=data.result, notes=data.notes, created_by_uid=str(user.get("uid")))
        db.add(result)
    else:
        result.result, result.notes, result.created_by_uid = data.result, data.notes, str(user.get("uid"))
    visit.status = "COMPLETADA"
    db.commit()
    db.refresh(result)
    return visit_dict(visit, result)


@router.get("/feedback")
def feedback(db: Session = Depends(get_db), _: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> list[dict[str, Any]]:
    rows = db.scalars(select(VisitResult).order_by(VisitResult.created_at.desc()).limit(500)).all()
    return [{"visit_id": row.visit_id, "result": row.result, "notes": row.notes, "created_by_uid": row.created_by_uid, "created_at": row.created_at.isoformat()} for row in rows]
