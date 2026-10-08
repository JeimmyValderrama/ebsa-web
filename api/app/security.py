from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from .firebase_auth import firebase_is_configured, verify_id_token

bearer_scheme = HTTPBearer(auto_error=False)
VALID_ROLES = {"COMERCIAL", "SOPORTE", "ADMIN_MODELO"}


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if not firebase_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Authentication aún no está configurado en el servidor.",
        )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere un Firebase ID Token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        decoded = verify_id_token(credentials.credentials)
    except (ValueError, auth.InvalidIdTokenError, auth.ExpiredIdTokenError, auth.RevokedIdTokenError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token de Firebase es inválido, expiró o fue revocado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if decoded.get("disabled") is True:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="La cuenta está deshabilitada.")

    return decoded


def require_roles(*allowed_roles: str) -> Callable[..., dict[str, Any]]:
    expected = {role.upper() for role in allowed_roles}
    unknown = expected - VALID_ROLES
    if unknown:
        raise ValueError(f"Roles no válidos: {', '.join(sorted(unknown))}")

    def dependency(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        role = str(user.get("role", "")).upper()
        if role not in expected:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El usuario no tiene permisos para esta operación.",
            )
        return user

    return dependency
