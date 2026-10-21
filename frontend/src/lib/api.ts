const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`La API respondió ${response.status}`);
  return response.json() as Promise<T>;
}

export const api = {
  health: () => apiGet<{ status: string; service: string; timestamp: string }>("/api/health"),
  status: () => apiGet<{ status: string; database_configured: boolean; database_engine: string; firebase_configured: boolean }>("/api/status"),
  summary: (token: string) => apiGet<{ latest_run: { period: string; rows_imported: number; completed_at?: string } | null; counts: Record<string, number> }>("/api/data/summary", token),
  risks: (token: string, limit = 200, offset = 0, severity = "") => apiGet<{ items: unknown[]; limit: number; offset: number }>(`/api/data/risks?limit=${limit}&offset=${offset}${severity ? `&severity=${encodeURIComponent(severity)}` : ""}`, token),
  client: (token: string, niu: string) => apiGet<unknown>(`/api/data/clients/${encodeURIComponent(niu)}`, token),
  consumption: (token: string, niu: string) => apiGet<unknown[]>(`/api/data/clients/${encodeURIComponent(niu)}/consumption`, token),
  forecast: (token: string, niu: string) => apiGet<unknown[]>(`/api/data/clients/${encodeURIComponent(niu)}/forecast`, token),
  locations: (token: string, limit = 5000) => apiGet<unknown[]>(`/api/data/locations?limit=${limit}`, token),
  catalog: (token: string) => apiGet<Array<{ dataset_key: string; rows: number }>>("/api/data/datasets/catalog", token),
  dataset: (token: string, key: string, limit = 500, offset = 0, search = "") => apiGet<{ dataset_key: string; items: Array<{ id: number; niu?: string; payload: Record<string, unknown> }>; limit: number; offset: number; returned: number }>(`/api/data/datasets/${encodeURIComponent(key)}?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ""}`, token),
  datasetCsv: async (token: string, key: string) => {
    const response = await fetch(`${API_BASE_URL}/api/data/datasets/${encodeURIComponent(key)}/csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`La API respondió ${response.status}`);
    return response.blob();
  },
  runs: (token: string) => apiGet<unknown[]>("/api/data/runs", token),
  visits: (token: string) => apiGet<unknown[]>("/api/visits", token),
  createVisit: (token: string, data: { niu: string; cycle?: number; scheduled_for?: string }) => fetch(`${API_BASE_URL}/api/visits`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(data) }).then(parseResponse),
  recordVisitResult: (token: string, id: number, result: string, notes: string) => fetch(`${API_BASE_URL}/api/visits/${id}/result`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ result, notes }) }).then(parseResponse),
  adminUsers: (token: string) => apiGet<unknown[]>("/api/admin/users", token),
  updateAdminUser: (token: string, uid: string, change: { role?: string; disabled?: boolean }) => fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(uid)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(change) }).then(parseResponse),
  feedback: (token: string) => apiGet<unknown[]>("/api/visits/feedback", token),
};

async function parseResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`La API respondió ${response.status}`);
  return response.json();
}
