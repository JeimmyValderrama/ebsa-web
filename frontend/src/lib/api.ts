const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  token?: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accept?: string;
  raw?: boolean;
};

type TokenProvider = (forceRefresh?: boolean) => Promise<string>;

let tokenProvider: TokenProvider | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** AuthProvider registra cómo obtener el token y qué hacer cuando la sesión caduca. */
export function configureApi(options: { getToken?: TokenProvider; onUnauthorized?: () => void }): void {
  if (options.getToken) tokenProvider = options.getToken;
  if (options.onUnauthorized) unauthorizedHandler = options.onUnauthorized;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = (token?: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: options.accept ?? "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let token = options.token ?? (tokenProvider ? await tokenProvider() : undefined);
  let response = await send(token);

  if (response.status === 401 && tokenProvider && !options.token) {
    // El token pudo caducar en una sesión larga: se renueva una vez y se reintenta.
    token = await tokenProvider(true);
    response = await send(token);
  }

  if (response.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(401, "La sesión expiró. Vuelve a iniciar sesión.");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;
    throw new ApiError(response.status, detail ?? `La API respondió ${response.status}.`);
  }
  if (options.raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function query(params: Record<string, string | number | undefined | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export type DatasetQuery = { limit?: number; offset?: number; search?: string; niu?: string; filters?: string[] };
export type DatasetPage = { dataset_key: string; items: Array<{ id: number | string; niu?: string | null; payload: Record<string, unknown> }>; limit: number; offset: number; returned: number; total: number };

/** Filtros de las listas de negocio (un valor vacío = sin filtro, como en el Streamlit). */
export type FiltroLista = {
  pri?: string[]; tip?: string[]; grav?: string[]; ten?: string[];
  zon?: string[]; mun?: string[]; cla?: string[]; tam?: string[];
};

export type DropsItem = {
  puesto: number;
  niu: string;
  municipio: string;
  zona_regional: string;
  ciclo: string;
  clase: string;
  tamano: string;
  veredicto: string;
  gravedad: string;
  trayectoria: string;
  prioridad: string;
  situacion: string;
  consumo_reciente_kwh: number;
  consumo_anterior_kwh: number;
  perdida_kwh_mes: number;
  valor_riesgo_mes: number;
  tarifa_kwh: number;
  referencia_kwh: number;
  caida_pct: number | null;
};

/** Filtros de las listas de negocio (la API los recibe como query y aplica en servidor). */
export type FiltroFuga = {
  niv?: string[];
  zon?: string[];
  mun?: string[];
  cla?: string[];
  tam?: string[];
};

/** Lista de riesgo de fuga (riesgo_fuga_clientes.csv) con el municipio del TC1 ya cruzado. */
export type FugaItem = {
  ranking: number;
  niu: string;
  municipio: string;
  zona_regional: string;
  ciclo: string;
  clase: string;
  tamano: string;
  consumo_6m: number;
  valor_riesgo: number;
  prob: number;
  riesgo: string;
  consumo_esperado: number;
  valor_esperado: number;
  senales: string;
  situacion: string;
  corte: string;
};

/** Grandes clientes del mercado no regulado que se acompañan desde el área comercial. */
export type VigilanciaItem = {
  niu: string;
  municipio: string;
  motivo: string;
  clase: string;
  consumo_12m: number | null;
  valor_facturado_mes: number | null;
  riesgo: string;
  prob: number | null;
};

export type FugaData = {
  total_lista: number;
  alto_medio: number;
  corte: string;
  resumen: { clientes: number; consumo_6m: number; valor_riesgo: number; consumo_esperado: number; valor_esperado: number };
  items: FugaItem[];
  vigilancia: VigilanciaItem[];
  opciones: {
    zonas: string[];
    municipios: Array<{ municipio: string; zonas: string[] }>;
    clases: string[];
    tamanos: string[];
  };
};

/** Clientes sin consumo (cero sostenido): fila con lo que consumía, lo que factura y cuánto lleva así. */
export type CeroItem = {
  niu: string;
  municipio: string;
  zona_regional: string;
  clase: string;
  consumo_referencia_kwh: number;
  consumo_reciente_kwh: number;
  valor_facturaba_antes_mes: number;
  tarifa_kwh: number;
  ultimo_mes_con_consumo: string;
  meses_en_cero: number | null;
};

export type CeroData = { total: number; items: CeroItem[] };

export type DropsData = {
  total_lista: number;
  evaluados: number;
  resumen: { clientes: number; perdida_kwh_mes: number; valor_riesgo_mes: number };
  top: { clientes: number; perdida_kwh_mes: number; valor_riesgo_mes: number };
  items: DropsItem[];
  gravedad_zona: Record<string, Record<string, number>>;
  cero_sostenido: { clientes: number; consumo_referencia_kwh: number; valor_facturaba_antes_mes: number };
  opciones: {
    zonas: string[];
    municipios: Array<{ municipio: string; zonas: string[] }>;
    clases: string[];
    tamanos: string[];
  };
};

export const api = {
  health: () => request<{ status: string; service: string; timestamp: string }>("/api/health"),
  status: () => request<{ status: string; database_configured: boolean; database_engine: string; firebase_configured: boolean }>("/api/status"),
  summary: (token?: string) => request<{ latest_run: { period: string; rows_imported: number; completed_at?: string } | null; counts: Record<string, number> }>("/api/data/summary", { token }),
  risks: (token: string | undefined, limit = 200, offset = 0, severity = "", prioridad = "") => request<{ items: Array<Record<string, unknown>>; limit: number; offset: number; total: number }>(`/api/data/risks${query({ limit, offset, severity, prioridad })}`, { token }),
  client: (token: string | undefined, niu: string) => request<Record<string, any>>(`/api/data/clients/${encodeURIComponent(niu)}`, { token }),
  consumption: (token: string | undefined, niu: string) => request<Array<{ periodo: string; consumo_kwh: number | null; estado_mes?: string | null }>>(`/api/data/clients/${encodeURIComponent(niu)}/consumption`, { token }),
  forecast: (token: string | undefined, niu: string) => request<Array<{ horizonte: number | null; periodo_pronosticado: string | null; consumo_pronosticado_kwh: number | null }>>(`/api/data/clients/${encodeURIComponent(niu)}/forecast`, { token }),
  locations: (token: string | undefined, limit = 5000) => request<Array<Record<string, unknown>>>(`/api/data/locations${query({ limit })}`, { token }),
  catalog: (token: string | undefined) => request<Array<{ dataset_key: string; rows: number }>>("/api/data/datasets/catalog", { token }),
  panorama: (token: string | undefined) =>
    request<{
      lista: { clientes: number; perdida_kwh_mes: number; valor_riesgo_mes: number };
      por_prioridad: Record<string, { clientes: number; perdida_kwh_mes: number; valor_riesgo_mes: number }>;
      por_severidad: Record<string, number>;
      gravedad: Record<string, number>;
      estado_en_lista: Record<string, number>;
      por_zona: Record<string, { clientes: number; perdida_kwh_mes: number; valor_riesgo_mes: number; gravedad: Record<string, number> }>;
      por_clase: Record<string, { clientes: number; perdida_kwh_mes: number; valor_riesgo_mes: number; gravedad: Record<string, number> }>;
      por_grupo: Record<string, { clientes: number; perdida_kwh_mes: number; valor_riesgo_mes: number; gravedad: Record<string, number> }>;
      fuga: { clientes: number; perdida_esperada_mes: number; valor_en_riesgo_mes: number; consumo_alto_medio_kwh: number; por_nivel: Record<string, number> };
      cero_sostenido: number;
      cero_sostenido_resumen: { clientes: number; consumo_referencia_kwh: number; valor_facturaba_antes_mes: number };
      otro_comercializador: number;
      otro_comercializador_con_otro: number;
      mercado_no_regulado: number;
      cortes_zona: Record<string, string>;
    }>("/api/data/panorama", { token }),
  drops: (token: string | undefined, opciones: { medida?: string; n?: number } & FiltroLista = {}) => {
    const csv = (valor?: string[]): string | undefined => (valor?.length ? valor.join(",") : undefined);
    return request<DropsData>(
      `/api/data/drops${query({
        medida: opciones.medida,
        n: opciones.n,
        pri: csv(opciones.pri),
        tip: csv(opciones.tip),
        grav: csv(opciones.grav),
        ten: csv(opciones.ten),
        zon: csv(opciones.zon),
        mun: csv(opciones.mun),
        cla: csv(opciones.cla),
        tam: csv(opciones.tam),
      })}`,
      { token },
    );
  },
  /** Lista completa de clientes en cero sostenido; los filtros se aplican en la web. */
  zero: (token: string | undefined) => request<CeroData>("/api/data/zero", { token }),
  /** Riesgo de fuga a otro comercializador: lista filtrada, indicadores globales y vigilancia de no regulados. */
  fuga: (token: string | undefined, opciones: { medida?: string; n?: number } & FiltroFuga = {}) => {
    const csv = (valor?: string[]): string | undefined => (valor?.length ? valor.join(",") : undefined);
    return request<FugaData>(
      `/api/data/fuga${query({
        medida: opciones.medida,
        n: opciones.n,
        niv: csv(opciones.niv),
        zon: csv(opciones.zon),
        mun: csv(opciones.mun),
        cla: csv(opciones.cla),
        tam: csv(opciones.tam),
      })}`,
      { token },
    );
  },
  /** La misma lista filtrada completa como CSV (todas las filas, no solo las de la tabla). */
  fugaCsv: (token: string | undefined, opciones: { medida?: string } & FiltroFuga = {}) => {
    const csv = (valor?: string[]): string | undefined => (valor?.length ? valor.join(",") : undefined);
    return request<Response>(
      `/api/data/fuga/csv${query({
        medida: opciones.medida,
        niv: csv(opciones.niv),
        zon: csv(opciones.zon),
        mun: csv(opciones.mun),
        cla: csv(opciones.cla),
        tam: csv(opciones.tam),
      })}`,
      { token, raw: true, accept: "text/csv" },
    ).then((response) => response.blob());
  },
  dataset: (token: string | undefined, key: string, options: DatasetQuery = {}) => request<DatasetPage>(`/api/data/datasets/${encodeURIComponent(key)}${query({ limit: options.limit ?? 200, offset: options.offset ?? 0, search: options.search, niu: options.niu, filter: options.filters })}`, { token }),
  datasetCsv: (token: string | undefined, key: string, options: Pick<DatasetQuery, "search" | "filters"> = {}) =>
    request<Response>(`/api/data/datasets/${encodeURIComponent(key)}/csv${query({ search: options.search, filter: options.filters })}`, { token, raw: true, accept: "text/csv" }).then((response) => response.blob()),
  runs: (token: string | undefined) => request<Array<Record<string, unknown>>>("/api/data/runs", { token }),
  pipeline: (token: string | undefined) => request<{ quality_control: Array<Record<string, unknown>>; forecast_bias: Array<Record<string, unknown>>; runs: Array<Record<string, unknown>> }>("/api/data/pipeline", { token }),
  route: (token: string | undefined, options: { cycle?: number; limit?: number } = {}) => request<{ cycles: Array<Record<string, unknown>>; items: Array<Record<string, unknown>>; total: number; cycle: number | null }>(`/api/data/route${query(options)}`, { token }),
  municipalityMetrics: (token: string | undefined) => request<{ metrics: Array<{ key: string; label: string; unidad: string }>; rows: Array<Record<string, unknown>> }>("/api/data/municipalities/metrics", { token }),
  visits: (token: string | undefined) => request<unknown[]>("/api/visits", { token }),
  createVisit: (token: string | undefined, data: { niu: string; cycle?: number; scheduled_for?: string }) => request<unknown>("/api/visits", { token, method: "POST", body: data }),
  recordVisitResult: (token: string | undefined, id: number, result: string, notes: string) => request<unknown>(`/api/visits/${id}/result`, { token, method: "POST", body: { result, notes } }),
  adminUsers: (token: string | undefined) => request<unknown[]>("/api/admin/users", { token }),
  updateAdminUser: (token: string | undefined, uid: string, change: { role?: string; disabled?: boolean }) => request<unknown>(`/api/admin/users/${encodeURIComponent(uid)}`, { token, method: "PATCH", body: change }),
  feedback: (token: string | undefined) => request<unknown[]>("/api/visits/feedback", { token }),
};
