const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!response.ok) {
    throw new Error(`La API respondió ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => apiGet<{ status: string; service: string; timestamp: string }>("/api/health"),
  status: () => apiGet<{ status: string; database_configured: boolean; firebase_configured: boolean }>("/api/status"),
  summary: (token: string) => apiGet<{ latest_run: { period: string; rows_imported: number; completed_at?: string } | null; counts: Record<string, number> }>("/api/data/summary", token),
  risks: (token: string, limit = 50, offset = 0) => apiGet<{ items: unknown[]; limit: number; offset: number }>(`/api/data/risks?limit=${limit}&offset=${offset}`, token),
  client: (token: string, niu: string) => apiGet<unknown>(`/api/data/clients/${encodeURIComponent(niu)}`, token),
  runs: (token: string) => apiGet<unknown[]>("/api/data/runs", token),
  visits: (token: string) => apiGet<unknown[]>("/api/visits", token),
  recordVisitResult: (token: string, id: number, result: string, notes: string) => fetch(`${API_BASE_URL}/api/visits/${id}/result`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ result, notes }) }).then(async (response) => { if (!response.ok) throw new Error(`La API respondió ${response.status}`); return response.json(); }),
  adminUsers: (token: string) => apiGet<unknown[]>("/api/admin/users", token),
  updateAdminUser: (token: string, uid: string, change: { role?: string; disabled?: boolean }) => fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(uid)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(change) }).then(async (response) => { if (!response.ok) throw new Error(`La API respondió ${response.status}`); return response.json(); }),
  feedback: (token: string) => apiGet<unknown[]>("/api/visits/feedback", token),
};
