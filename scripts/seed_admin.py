from __future__ import annotations

import argparse
import sys
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import auth, credentials

# El script se ejecuta desde scripts/, así que la raíz del repo va al path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from firebase_admin_cert import certificado_servicio, firebase_configurado  # noqa: E402

# En local las credenciales viven en el .env de la raíz; en un servidor se exportan.
load_dotenv()


def main() -> None:
    parser = argparse.ArgumentParser(description="Asigna el claim ADMIN_MODELO a un usuario Firebase existente.")
    parser.add_argument("email", help="Correo exacto del usuario en Firebase Authentication")
    args = parser.parse_args()
    if not firebase_configurado():
        raise SystemExit("Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY en el .env.")
    firebase_admin.initialize_app(credentials.Certificate(certificado_servicio()))
    user = auth.get_user_by_email(args.email)
    claims = dict(user.custom_claims or {})
    claims["role"] = "ADMIN_MODELO"
    auth.set_custom_user_claims(user.uid, claims)
    print(f"Rol ADMIN_MODELO asignado a {user.email}. Cierra y vuelve a iniciar sesión para renovar el token.")


if __name__ == "__main__":
    main()
