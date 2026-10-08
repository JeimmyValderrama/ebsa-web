from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from .security import VALID_ROLES, current_user, require_roles

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Devuelve la identidad verificada y el rol proveniente de Custom Claims."""
    role = str(user.get("role", "")).upper()
    if role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta está autenticada, pero todavía no tiene un rol EBSA asignado.",
        )
    return {
        "uid": user.get("uid"),
        "email": user.get("email"),
        "name": user.get("name") or user.get("email"),
        "role": role,
        "email_verified": bool(user.get("email_verified", False)),
    }


@router.get("/admin/auth-check")
def admin_auth_check(user: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> dict[str, str]:
    return {"status": "authorized", "uid": str(user.get("uid"))}
