from __future__ import annotations

import argparse
import os

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import auth, credentials

# En local las credenciales viven en el .env de la raíz; en un servidor se exportan.
load_dotenv()


def main() -> None:
    parser = argparse.ArgumentParser(description="Asigna el claim ADMIN_MODELO a un usuario Firebase existente.")
    parser.add_argument("email", help="Correo exacto del usuario en Firebase Authentication")
    args = parser.parse_args()
    required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise SystemExit(f"Faltan variables: {', '.join(missing)}")
    certificate = {"project_id": os.environ["FIREBASE_PROJECT_ID"], "client_email": os.environ["FIREBASE_CLIENT_EMAIL"], "private_key": os.environ["FIREBASE_PRIVATE_KEY"].replace("\\n", "\n")}
    firebase_admin.initialize_app(credentials.Certificate(certificate))
    user = auth.get_user_by_email(args.email)
    claims = dict(user.custom_claims or {})
    claims["role"] = "ADMIN_MODELO"
    auth.set_custom_user_claims(user.uid, claims)
    print(f"Rol ADMIN_MODELO asignado a {user.email}. Cierra y vuelve a iniciar sesión para renovar el token.")


if __name__ == "__main__":
    main()
