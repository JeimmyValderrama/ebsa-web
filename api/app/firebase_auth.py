from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials


@lru_cache(maxsize=1)
def firebase_is_configured() -> bool:
    return all(
        os.getenv(name)
        for name in (
            "FIREBASE_PROJECT_ID",
            "FIREBASE_CLIENT_EMAIL",
            "FIREBASE_PRIVATE_KEY",
        )
    )


def _get_firebase_app() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        if not firebase_is_configured():
            raise RuntimeError("Firebase Admin SDK no está configurado")

        private_key = os.environ["FIREBASE_PRIVATE_KEY"].replace("\\n", "\n")
        certificate = {
            "project_id": os.environ["FIREBASE_PROJECT_ID"],
            "client_email": os.environ["FIREBASE_CLIENT_EMAIL"],
            "private_key": private_key,
        }
        return firebase_admin.initialize_app(
            credentials.Certificate(certificate),
            {"projectId": os.environ["FIREBASE_PROJECT_ID"]},
        )


def verify_id_token(id_token: str) -> dict[str, Any]:
    return auth.verify_id_token(id_token, app=_get_firebase_app(), check_revoked=True)
