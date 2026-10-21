import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type DatasetPage } from "../lib/api";
import { enmascarar, formatCelda, fmtN, esColumnaSensible } from "../lib/format";
import { usePresentation } from "../app/Presentation";

export type Row = { id: number | string; niu?: string | null; payload: Record<string, unknown> };

export function flattenRow(row: Row): Record<string, unknown> {
  return { NIU: row.niu ?? "", ...row.payload };
}

export type FilterField = { key: string; label: string; options?: string[] };

type ToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  filters: FilterField[];
  active: Record<string, string>;
  onFilter: (key: string, value: string) => void;
  onReset: () => void;
  onDownload: () => void;
  downloading: boolean;
};

function FilterToolbar({ search, onSearch, filters, active, onFilter, onReset, onDownload, downloading }: ToolbarProps) {
  const hayFiltros = Boolean(search) || Object.values(active).some(Boolean);
  return (
    <div className="data-toolbar">
      <input
        type="search"
        className="search-input"
        placeholder="Buscar por NIU, municipio, zona…"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        aria-label="Buscar en el dataset"
      />
      {filters.map((field) => (
        <select
          key={field.key}
          className="filter-select"
          value={active[field.key] ?? ""}
          onChange={(event) => onFilter(field.key, event.target.value)}
          aria-label={field.label}
        >
          <option value="">{field.label}: todos</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ))}
      {hayFiltros && (
        <button type="button" className="ghost-button" onClick={onReset}>
          Limpiar
        </button>
      )}
      <button type="button" className="ghost-button" onClick={onDownload} disabled={downloading}>
        {downloading ? "Preparando…" : "Descargar CSV"}
      </button>
    </div>
  );
}

function Pagination({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const pagina = Math.floor(offset / limit) + 1;
  const paginas = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination-row">
      <button type="button" className="ghost-button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        Anteriores
      </button>
      <span className="pagination-label">
        Página {fmtN(pagina)} de {fmtN(paginas)} · {fmtN(total)} registros
      </span>
      <button type="button" className="ghost-button" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
        Siguientes
      </button>
    </div>
  );
}

export function DatasetTable({
  rows,
  max = 200,
  prioritarias = [],
  action,
  actionLabel,
}: {
  rows: Row[];
  max?: number;
  prioritarias?: string[];
  action?: (row: Row) => void;
  actionLabel?: string;
}) {
  const { hideIds } = usePresentation();
  const flat = rows.slice(0, max).map(flattenRow);
  const columns = useMemo(() => {
    const all = Array.from(new Set(flat.flatMap((row) => Object.keys(row))));
    const head = prioritarias.filter((column) => all.includes(column));
    return [...head, ...all.filter((column) => !head.includes(column))].slice(0, 24);
  }, [flat, prioritarias]);

  if (!flat.length) return <div className="empty-state">No hay registros para este corte o filtro.</div>;

  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{human(column)}</th>
            ))}
            {action && <th>{actionLabel ?? "Acción"}</th>}
          </tr>
        </thead>
        <tbody>
          {flat.map((row, index) => (
            <tr key={`${String(row.NIU)}-${index}`}>
              {columns.map((column) => (
                <td key={column}>{hideIds && esColumnaSensible(column) ? enmascarar(row[column]) : formatCelda(row[column], column)}</td>
              ))}
              {action && (
                <td>
                  <button type="button" className="ghost-button" onClick={() => action(rows[index])}>
                    {actionLabel ?? "Ver"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function human(column: string): string {
  return String(column)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type DatasetViewProps = {
  token?: string | null;
  datasetKey: string;
  title: string;
  description?: string;
  filters?: FilterField[];
  prioritarias?: string[];
  pageSize?: number;
  action?: (row: Row) => void;
  actionLabel?: string;
  emptyText?: string;
};

/** Vista genérica de un dataset: búsqueda, filtros, paginación y descarga CSV (igual que la app original). */
export function DatasetView({ token, datasetKey, title, description, filters = [], prioritarias = [], pageSize = 50, action, actionLabel, emptyText }: DatasetViewProps) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DatasetPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const debouncedSearch = useDebounced(search);
  const firstLoad = useRef(true);

  const filterParams = useMemo(
    () => filters.filter((field) => active[field.key]).map((field) => `${field.key}:${active[field.key]}`),
    [active, filters],
  );

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, filterParams.join("|")]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .dataset(token ?? undefined, datasetKey, { limit: pageSize, offset, search: debouncedSearch || undefined, filters: filterParams })
      .then((result) => {
        if (cancelled) return;
        setPage(result);
        setError(null);
        // Opciones de los filtros sin catálogo fijo: se derivan de los primeros registros.
        if (firstLoad.current) {
          firstLoad.current = false;
          const derived: Record<string, string[]> = {};
          for (const field of filters) {
            if (field.options) continue;
            const values = Array.from(
              new Set(result.items.map((row) => String(row.payload[field.key] ?? "")).filter((value) => value && value !== "None")),
            ).sort();
            if (values.length) derived[field.key] = values;
          }
          setDynamicOptions(derived);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar el dataset.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetKey, debouncedSearch, filterParams, offset, pageSize, token]);

  const download = useCallback(() => {
    setDownloading(true);
    api
      .datasetCsv(token ?? undefined, datasetKey, { search: debouncedSearch || undefined, filters: filterParams })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `ebsa_${datasetKey}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No fue posible descargar el archivo."))
      .finally(() => setDownloading(false));
  }, [datasetKey, debouncedSearch, filterParams, token]);

  const campos: FilterField[] = filters.map((field) => ({ ...field, options: field.options ?? dynamicOptions[field.key] ?? [] }));
  const items = page?.items ?? [];

  return (
    <section className="data-module">
      <header className="module-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <FilterToolbar
        search={search}
        onSearch={setSearch}
        filters={campos}
        active={active}
        onFilter={(key, value) => setActive((current) => ({ ...current, [key]: value }))}
        onReset={() => {
          setSearch("");
          setActive({});
        }}
        onDownload={download}
        downloading={downloading}
      />
      {loading && <div className="empty-state">Cargando registros…</div>}
      {error && <div className="empty-state">{error}</div>}
      {!loading && !error && items.length === 0 && <div className="empty-state">{emptyText ?? "No hay registros para este corte o filtro."}</div>}
      {items.length > 0 && (
        <>
          <div className="section-status">
            Mostrando {fmtN(items.length)} de {fmtN(page?.total ?? items.length)} registros
            {Object.values(active).some(Boolean) || debouncedSearch ? " (con los filtros aplicados)" : ""}
          </div>
          <DatasetTable rows={items} prioritarias={prioritarias} action={action} actionLabel={actionLabel} />
          <Pagination offset={offset} limit={pageSize} total={page?.total ?? items.length} onChange={setOffset} />
        </>
      )}
    </section>
  );
}

/** Catálogo de todos los datasets cargados, con su número de filas. */
export function DatasetCatalog({ token, onSelect }: { token?: string | null; onSelect?: (key: string) => void }) {
  const [items, setItems] = useState<Array<{ dataset_key: string; rows: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .catalog(token ?? undefined)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar el catálogo.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!items.length) return <div className="empty-state">Aún no hay datasets cargados en la base.</div>;

  return (
    <div className="catalog-grid">
      {items.map((item) => (
        <button key={item.dataset_key} type="button" className="catalog-card" onClick={() => onSelect?.(item.dataset_key)}>
          <span className="catalog-key">{human(item.dataset_key)}</span>
          <span className="catalog-rows">{fmtN(item.rows)} filas</span>
        </button>
      ))}
    </div>
  );
}

/** Gráfico de barras mínimo sin librerías externas. */
export function MiniBars({ data, height = 96, label }: { data: Array<{ label: string; value: number }>; height?: number; label?: string }) {
  const max = Math.max(1, ...data.map((item) => Math.abs(item.value)));
  if (!data.length) return <div className="empty-state">Sin datos para graficar.</div>;
  return (
    <div className="mini-chart" role="img" aria-label={label ?? "Barras"}>
      {data.map((item, index) => (
        <div key={`${item.label}-${index}`} className="bar-row" title={`${item.label}: ${fmtN(item.value)}`}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(2, (Math.abs(item.value) / max) * 100)}%` }} />
          </span>
          <span className="bar-value">{fmtN(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Dispersión de clientes por coordenadas geográficas (mínimo requisito del mapa). */
export function LocationPlot({ points }: { points: Array<{ niu: string; lat: number; lon: number }> }) {
  const { hideIds } = usePresentation();
  if (!points.length) return <div className="empty-state">No hay coordenadas válidas en este corte.</div>;
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const spanLat = maxLat - minLat || 1;
  const spanLon = maxLon - minLon || 1;
  return (
    <div className="map-panel">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="coordinate-plot">
        {points.map((point, index) => (
          <circle
            key={`${point.niu}-${index}`}
            cx={((point.lon - minLon) / spanLon) * 100}
            cy={100 - ((point.lat - minLat) / spanLat) * 100}
            r={0.7}
            className="map-dot"
          >
            <title>{hideIds ? enmascarar(point.niu) : point.niu}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export type { ReactNode };
