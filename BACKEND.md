# Backend FastAPI

El backend de EBSA está en la carpeta `api/`.

```text
api/
├── index.py                 # Entrada FastAPI para Vercel
├── requirements.txt         # Dependencias del backend
└── app/
    ├── main.py             # Aplicación y health/status
    ├── firebase_auth.py    # Firebase Admin SDK
    ├── security.py         # ID Token y RBAC
    ├── auth_routes.py      # Identidad
    ├── data_routes.py      # Clientes, riesgos, consumo, forecast y ubicaciones
    ├── admin_routes.py     # Usuarios y roles Firebase
    └── visit_routes.py     # Visitas y feedback
```

Para ejecutarlo localmente desde la raíz del proyecto:

```powershell
.venv\Scripts\Activate.ps1
uvicorn api.index:app --reload --host 127.0.0.1 --port 8000
```

URLs:

```text
http://localhost:8000/health
http://localhost:8000/api/status
http://localhost:8000/docs
```

No existe una carpeta separada llamada `backend` porque Vercel reconoce `api/index.py` como función Python. `api/` es el backend.
