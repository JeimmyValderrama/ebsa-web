from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth
from pydantic import BaseModel, Field

from .firebase_auth import firebase_is_configured
from .security import require_roles

router = APIRouter(prefix="/api/admin", tags=["admin"])
Role = Literal["COMERCIAL", "SOPORTE", "ADMIN_MODELO"]


class UserUpdate(BaseModel):
    role: Role | None = None
    disabled: bool | None = None


@router.get("/users")
def list_users(_: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> list[dict[str, Any]]:
    if not firebase_is_configured():
        raise HTTPException(status_code=503, detail="Firebase Admin SDK no está configurado.")
    result: list[dict[str, Any]] = []
    page = auth.list_users()
    while page:
        for user in page.users:
            result.append({"uid": user.uid, "email": user.email, "display_name": user.display_name, "disabled": user.disabled, "email_verified": user.email_verified, "role": (user.custom_claims or {}).get("role")})
        page = page.get_next_page()
    return result


@router.patch("/users/{uid}")
def update_user(uid: str, change: UserUpdate, _: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> dict[str, Any]:
    if not firebase_is_configured():
        raise HTTPException(status_code=503, detail="Firebase Admin SDK no está configurado.")
    try:
        user = auth.get_user(uid)
        if change.role is not None:
            claims = dict(user.custom_claims or {})
            claims["role"] = change.role
            auth.set_custom_user_claims(uid, claims)
        if change.disabled is not None:
            user = auth.update_user(auth.UpdateRequest(uid=uid, disabled=change.disabled))
        user = auth.get_user(uid)
        return {"uid": user.uid, "email": user.email, "disabled": user.disabled, "role": (user.custom_claims or {}).get("role")}
    except auth.UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario Firebase no encontrado.") from exc
