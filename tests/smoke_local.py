"""Comprobación rápida de endpoints contra la base local (no se commitea)."""
import sys
import time

sys.path.insert(0, ".")

from fastapi.testclient import TestClient

from api.app.main import app
from api.app.security import current_user

app.dependency_overrides[current_user] = lambda: {"uid": "t", "role": "ADMIN_MODELO", "email": "t@e.com"}
client = TestClient(app)

for path in ["/api/data/route", "/api/data/route?cycle=45", "/api/data/municipalities/metrics", "/api/data/pipeline"]:
    start = time.time()
    response = client.get(path)
    body = response.json()
    if "cycles" in body:
        extra = f"items={body['total']} ciclos={len(body['cycles'])}"
    elif "rows" in body:
        top = body["rows"][0] if body["rows"] else {}
        extra = f"filas={len(body['rows'])} top={top.get('municipio')} ${round(top.get('caida_valor_mes') or 0):,}"
    else:
        extra = str({key: (len(value) if isinstance(value, list) else value) for key, value in list(body.items())[:3]})
    print(f"{time.time() - start:6.1f}s  {response.status_code}  {path}  {extra}")

niu = client.get("/api/data/route").json()["items"][0]["niu"]
ciclos = client.get("/api/data/route").json()["cycles"]
print("ciclos:", [(item["ciclo"], item["ciclo_etiqueta"], item["clientes"]) for item in ciclos])
if ciclos:
    filtro = client.get(f"/api/data/route?cycle={ciclos[0]['ciclo']}").json()
    print("filtro ciclo:", ciclos[0]["ciclo"], "->", filtro["total"], "items; ejemplo:", filtro["items"][0] if filtro["items"] else None)
for path in [
    f"/api/data/clients/{niu}",
    f"/api/data/clients/{niu}/consumption",
    f"/api/data/clients/{niu}/forecast",
    f"/api/data/datasets/operational?niu={niu}",
    f"/api/data/datasets/drop_analysis?niu={niu}",
    f"/api/data/datasets/churn_scores?niu={niu}",
    f"/api/data/datasets/locations?niu={niu}",
]:
    start = time.time()
    response = client.get(path)
    body = response.text[:90]
    print(f"{time.time() - start:6.1f}s  {response.status_code}  {path.split('datasets/')[-1].split('clients/')[-1]}  {body}")

app.dependency_overrides.clear()
