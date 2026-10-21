from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials

from firebase_admin_cert import certificado_servicio, firebase_configurado


@lru_cache(maxsize=1)
def _configurado_cache() -> bool:
    return firebase_configurado()


def firebase_is_configured() -> bool:
    return _configurado_cache()


def _get_firebase_app() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        if not firebase_is_configured():
            raise RuntimeError("Firebase Admin SDK no está configurado")

        return firebase_admin.initialize_app(
            credentials.Certificate(certificado_servicio()),
            {"projectId": os.environ["FIREBASE_PROJECT_ID"]},
        )


def verify_id_token(id_token: str) -> dict[str, Any]:
    return auth.verify_id_token(id_token, app=_get_firebase_app(), check_revoked=True)
