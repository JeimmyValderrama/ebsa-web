from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth
from firebase_admin.exceptions import FirebaseError
from pydantic import BaseModel, Field

from .firebase_auth import firebase_is_configured
from .security import require_roles

router = APIRouter(prefix="/api/admin", tags=["admin"])
Role = Literal["COMERCIAL", "SOPORTE", "ADMIN_MODELO"]
CORREO_RE = re.compile(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}")


class UserUpdate(BaseModel):
    # "" significa "sin rol": se acepta solo para borrar el claim (los clientes viejos lo envían).
    role: Role | Literal[""] | None = None
    disabled: bool | None = None


class UserCreate(BaseModel):
    email: str
    password: str
    role: Role


def _usuarios_firebase() -> list[Any]:
    """Todos los usuarios de Firebase Authentication, recorriendo todas las páginas."""
    result: list[Any] = []
    page = auth.list_users()
    while page:
        result.extend(page.users)
        page = page.get_next_page()
    return result


def _rol_de(user: Any) -> str:
    return str((user.custom_claims or {}).get("role") or "")


@router.get("/users")
def list_users(_: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> list[dict[str, Any]]:
    if not firebase_is_configured():
        raise HTTPException(status_code=503, detail="Firebase Admin SDK no está configurado.")
    return [
        {"uid": user.uid, "email": user.email, "display_name": user.display_name, "disabled": user.disabled, "email_verified": user.email_verified, "role": _rol_de(user) or None}
        for user in _usuarios_firebase()
    ]


@router.patch("/users/{uid}")
def update_user(uid: str, change: UserUpdate, admin: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> dict[str, Any]:
    if not firebase_is_configured():
        raise HTTPException(status_code=503, detail="Firebase Admin SDK no está configurado.")
    if change.disabled is True and uid == admin.get("uid"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes deshabilitar tu propia cuenta.")
    try:
        user = auth.get_user(uid)
        if change.role is not None:
            claims = dict(user.custom_claims or {})
            if change.role == "":
                claims.pop("role", None)
            else:
                claims["role"] = change.role
            auth.set_custom_user_claims(uid, claims)
        if change.disabled is not None:
            user = auth.update_user(uid, disabled=change.disabled)
        user = auth.get_user(uid)
        return {"uid": user.uid, "email": user.email, "disabled": user.disabled, "role": (user.custom_claims or {}).get("role")}
    except auth.UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario Firebase no encontrado.") from exc


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, _: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> dict[str, Any]:
    """Crea una cuenta en Firebase Authentication con su rol inicial en Custom Claims."""
    if not firebase_is_configured():
        raise HTTPException(status_code=503, detail="Firebase Admin SDK no está configurado.")
    email = payload.email.strip().lower()
    password = payload.password
    if not CORREO_RE.fullmatch(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El correo electrónico no tiene un formato válido.")
    if len(password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña debe tener al menos 6 caracteres.")
    try:
        user = auth.create_user(email=email, password=password)
    except auth.EmailAlreadyExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese correo electrónico.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El correo o la contraseña no son válidos.") from exc
    except FirebaseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Firebase no pudo crear la cuenta. Inténtalo de nuevo.") from exc
    try:
        auth.set_custom_user_claims(user.uid, {"role": payload.role})
    except FirebaseError as exc:
        # Sin el rol la cuenta no sirve: se revierte para no dejar usuarios huérfanos.
        try:
            auth.delete_user(user.uid)
        except FirebaseError:
            pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No se pudo asignar el rol. Inténtalo de nuevo.") from exc
    return {"uid": user.uid, "email": user.email, "disabled": user.disabled, "role": payload.role}


@router.delete("/users/{uid}")
def delete_user(uid: str, admin: dict[str, Any] = Depends(require_roles("ADMIN_MODELO"))) -> dict[str, Any]:
    """Borra una cuenta de Firebase Authentication, con protecciones para no quedarse sin administradores."""
    if not firebase_is_configured():
        raise HTTPException(status_code=503, detail="Firebase Admin SDK no está configurado.")
    if uid == admin.get("uid"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes eliminar tu propia cuenta.")
    try:
        objetivo = auth.get_user(uid)
    except auth.UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario Firebase no encontrado.") from exc
    if _rol_de(objetivo) == "ADMIN_MODELO":
        administradores = [user for user in _usuarios_firebase() if _rol_de(user) == "ADMIN_MODELO"]
        activos = [user for user in administradores if not user.disabled]
        if len(administradores) == 1 or (not objetivo.disabled and len(activos) == 1):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede eliminar el último administrador del modelo.")
    try:
        auth.delete_user(uid)
    except auth.UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario Firebase no encontrado.") from exc
    except FirebaseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Firebase no pudo eliminar la cuenta. Inténtalo de nuevo.") from exc
    return {"uid": uid, "eliminado": True}
