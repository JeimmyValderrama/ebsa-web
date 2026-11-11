"""Certificado de la cuenta de servicio para el Firebase Admin SDK.

Lo comparten la API (verificación de tokens) y scripts/seed_admin.py, para que
ambos armen exactamente el mismo diccionario y no haya sorpresas en el login.

Se necesitan tres variables en el entorno (o en el .env de la raíz):
    FIREBASE_PROJECT_ID      p.ej. ebsa-consumo
    FIREBASE_CLIENT_EMAIL    p.ej. firebase-adminsdk-xxxxx@ebsa-consumo.iam.gserviceaccount.com
    FIREBASE_PRIVATE_KEY     la clave PEM con los \\n tal cual vienen en el JSON
"""

from __future__ import annotations

import os
from typing import Any

FIREBASE_VARS = ("FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY")


def firebase_configurado() -> bool:
    return all(os.getenv(name) for name in FIREBASE_VARS)


def certificado_servicio() -> dict[str, Any]:
    """Diccionario con el formato exacto que exige credentials.Certificate."""
    faltan = [name for name in FIREBASE_VARS if not os.getenv(name)]
    if faltan:
        raise RuntimeError(f"Faltan variables de Firebase: {', '.join(faltan)}")
    return {
        "type": "service_account",
        "project_id": os.environ["FIREBASE_PROJECT_ID"],
        "client_email": os.environ["FIREBASE_CLIENT_EMAIL"],
        "private_key": os.environ["FIREBASE_PRIVATE_KEY"].replace("\\n", "\n"),
        # google-auth exige token_uri; el JSON descargado lo trae, aquí se reconstruye.
        "token_uri": "https://oauth2.googleapis.com/token",
    }
