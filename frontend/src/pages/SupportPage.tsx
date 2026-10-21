import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api, type DatasetPage } from "../lib/api";
import { DatasetView } from "../components/DataExplorer";
import { Sensitive } from "../app/Presentation";
import { energia, fechaCo, fmtN, limpiarNiu, mesCorto, pesos, queRevisar } from "../lib/format";

const sections = [
  ["cliente", "Consultar un cliente"],
  ["visitas", "Visitas por ciclo"],
  ["caidas", "Caídas de consumo"],
  ["resultados", "Registrar resultado de visitas"],
] as const;

type Section = (typeof sections)[number][0];

type Ficha = {
  cliente: Record<string, unknown> | null;
  operativa: Record<string, unknown> | null;
  caida: Record<string, unknown> | null;
  fuga: Record<string, unknown> | null;
  ubicacion: Record<string, unknown> | null;
  consumo: Array<{ periodo: string; consumo_kwh: number | null }>;
  pronostico: Array<{ horizonte: number | null; periodo_pronosticado: string | null; consumo_pronosticado_kwh: number | null }>;
};

function Item({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="ficha-item">
      <span>{label}</span>
      <b>{value === null || value === undefined || value === "" ? "—" : String(value)}</b>
    </div>
  );
}

function ConsumoChart({ puntos }: { puntos: Array<{ periodo: string; valor: number }> }) {
  if (!puntos.length) return <div className="empty-state">Este cliente no tiene serie de consumo importada (la serie completa se carga en la importación de producción).</div>;
  const width = 720;
  const height = 200;
  const padding = 28;
  const max = Math.max(1, ...puntos.map((punto) => punto.valor));
  const path = puntos
    .map((punto, index) => {
      const x = padding + (index / Math.max(1, puntos.length - 1)) * (width - padding * 2);
      const y = height - padding - (punto.valor / max) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="chart-card">
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" aria-label="Consumo mensual">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
        <path d={path} className="chart-line chart-real" />
      </svg>
      <div className="chart-axis-labels">
        <span>
          {mesCorto(puntos[0].periodo)} · máximo {energia(max)}
        </span>
        <span>{mesCorto(puntos[puntos.length - 1].periodo)}</span>
      </div>
    </div>
  );
}

export default function SupportPage() {
  const { idToken } = useAuth();
  const [section, setSection] = useState<Section>("cliente");
  const [searchParams] = useSearchParams();
  const niuInicial = searchParams.get("niu") ?? "";

  useEffect(() => {
    if (niuInicial) setSection("cliente");
  }, [niuInicial]);

  return (
    <div className="page-content">
      <section className="page-intro">
        <div>
          <div className="eyebrow accent-eyebrow">SOPORTE / ATENCIÓN AL CLIENTE</div>
          <h1>La ficha del cliente y la ruta de visita.</h1>
          <p>Consulta una cuenta, mira qué pasó con su consumo y prepara la visita con la sugerencia del modelo.</p>
        </div>
      </section>

      <div className="admin-tabs">
        {sections.map(([key, label]) => (
          <button key={key} className={section === key ? "admin-tab active" : "admin-tab"} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {section === "cliente" && <ClientLookup token={idToken} initialNiu={niuInicial} />}
      {section === "visitas" && <VisitasPorCiclo token={idToken} />}
      {section === "caidas" && (
        <DatasetView
          token={idToken}
          datasetKey="drop_analysis"
          title="Clientes cuya facturación está cayendo"
          description="Misma lista que ve Comercial, con el detalle del estudio de caída."
          filters={[{ key: "veredicto", label: "Veredicto" }, { key: "severidad", label: "Gravedad" }, { key: "zona", label: "Zona" }]}
          prioritarias={["NIU", "veredicto", "severidad", "consumo_anterior_kwh", "consumo_reciente_kwh", "variacion_vs_anterior_pct"]}
        />
      )}
      {section === "resultados" && <RegistroResultados token={idToken} />}
    </div>
  );
}

function ClientLookup({ token, initialNiu }: { token?: string | null; initialNiu: string }) {
  const [busqueda, setBusqueda] = useState(initialNiu);
  const [niu, setNiu] = useState(initialNiu);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialNiu) setBusqueda(initialNiu);
  }, [initialNiu]);

  useEffect(() => {
    if (!niu) {
      setFicha(null);
      return;
    }
    let cancelled = false;
    setCargando(true);
    const soloItem = (pagina: DatasetPage) => pagina.items[0]?.payload ?? null;
    Promise.all([
      api.client(token ?? undefined, niu).catch(() => null),
      api.dataset(token ?? undefined, "operational", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "drop_analysis", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "churn_scores", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "locations", { niu, limit: 1 }).catch(() => null),
      api.consumption(token ?? undefined, niu).catch(() => []),
      api.forecast(token ?? undefined, niu).catch(() => []),
    ])
      .then(([cliente, operativa, caida, fuga, ubicacion, consumo, pronostico]) => {
        if (cancelled) return;
        setFicha({ cliente, operativa: soloItem(operativa as DatasetPage), caida: soloItem(caida as DatasetPage), fuga: soloItem(fuga as DatasetPage), ubicacion: soloItem(ubicacion as DatasetPage), consumo, pronostico });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible consultar el cliente.");
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
  }, [niu, token]);

  const serieConsumo = useMemo(
    () => (ficha?.consumo ?? []).filter((row) => row.consumo_kwh !== null).slice(-18).map((row) => ({ periodo: row.periodo, valor: Number(row.consumo_kwh) })),
    [ficha],
  );
  const sugerencia = useMemo(() => (ficha?.operativa ? queRevisar(ficha.operativa) : ""), [ficha]);

  return (
    <section className="data-module">
      <header className="module-heading">
        <div>
          <div className="eyebrow">CONSULTA POR NIU</div>
          <h2>Consultar un cliente</h2>
          <p>Escribe el NIU tal como lo tiene el cliente (se admite el formato de Excel). La ficha reúne lista de caída, riesgo de fuga, ubicación, consumo y pronóstico.</p>
        </div>
      </header>

      <form
        className="data-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setNiu(limpiarNiu(busqueda));
        }}
      >
        <input className="search-input" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="NIU del cliente" aria-label="NIU del cliente" />
        <button type="submit" className="primary-button">
          Consultar
        </button>
      </form>

      {cargando && <div className="empty-state">Consultando el corte vigente…</div>}
      {error && <div className="empty-state">{error}</div>}

      {ficha && !cargando && (
        <>
          <div className="ficha-grid">
            <div className="ficha-item">
              <span>NIU</span>
              <b>
                <Sensitive value={niu} />
              </b>
            </div>
            <Item label="Clase de servicio" value={ficha.cliente?.clase_servicio_nombre ?? ficha.operativa?.clase_servicio_nombre} />
            <Item label="Grupo de consumo" value={ficha.cliente?.grupo_consumo ?? ficha.operativa?.grupo_consumo} />
            <Item label="Zona regional" value={ficha.cliente?.zona_regional ?? ficha.operativa?.zona_regional} />
            <Item label="Ciclo" value={ficha.cliente?.ciclo_etiqueta ?? ficha.operativa?.ciclo_etiqueta} />
            <div className="ficha-item">
              <span>Municipio</span>
              <b>{String(ficha.ubicacion?.municipio ?? "—")}</b>
            </div>
            <div className="ficha-item">
              <span>Dirección</span>
              <b>
                <Sensitive value={ficha.ubicacion?.direccion} />
              </b>
            </div>
            <Item label="Gravedad de la caída" value={ficha.caida?.severidad ?? ficha.operativa?.gravedad} />
            <Item label="Veredicto" value={ficha.caida?.veredicto} />
            <Item label="Trayectoria" value={ficha.operativa?.trayectoria} />
            <Item label="Prioridad de gestión" value={ficha.operativa?.prioridad_gestion} />
            <Item label="Riesgo de fuga" value={ficha.fuga?.nivel_riesgo} />
            <Item label="Pérdida esperada ($/mes)" value={ficha.fuga?.valor_esperado_perdida_mes ? pesos(Number(ficha.fuga.valor_esperado_perdida_mes)) : "—"} />
          </div>

          {sugerencia && (
            <div className="ficha-note">
              <strong>Qué revisar:</strong> {sugerencia}
            </div>
          )}

          <h3>Consumo mensual (últimos 18 meses)</h3>
          <ConsumoChart puntos={serieConsumo} />

          <h3>Pronóstico de 6 meses</h3>
          {ficha.pronostico.length ? (
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Horizonte</th>
                    <th>Periodo</th>
                    <th>Consumo esperado</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.pronostico.map((row) => (
                    <tr key={String(row.horizonte)}>
                      <td>{fmtN(row.horizonte)}</td>
                      <td>{mesCorto(row.periodo_pronosticado)}</td>
                      <td>{energia(row.consumo_pronosticado_kwh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">Sin pronóstico importado para este cliente en el corte actual.</div>
          )}

          {(ficha.caida || ficha.operativa) && (
            <p className="quiet-note">
              Última actualización del estudio: {fechaCo(ficha.caida?.fecha_corte ?? ficha.operativa?.fecha_corte)}. Los datos corresponden al corte importado más reciente.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function VisitasPorCiclo({ token }: { token?: string | null }) {
  const [ciclo, setCiclo] = useState<number | "">("");
  const [datos, setDatos] = useState<{ cycles: Array<{ ciclo: number; ciclo_etiqueta: string; clientes: number }>; items: Array<Record<string, unknown>>; total: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [agendadas, setAgendadas] = useState<Record<string, "ok" | "error">>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCargando(true);
    api
      .route(token ?? undefined, { cycle: ciclo === "" ? undefined : ciclo, limit: 300 })
      .then((result) => {
        if (cancelled) return;
        setDatos({ cycles: result.cycles as Array<{ ciclo: number; ciclo_etiqueta: string; clientes: number }>, items: result.items, total: result.total });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar la ruta de visitas.");
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ciclo, token]);

  const agendar = useCallback(
    async (row: Record<string, unknown>) => {
      const niu = String(row.niu ?? "");
      if (!niu) return;
      setAgendadas((current) => ({ ...current, [niu]: "ok" }));
      try {
        await api.createVisit(token ?? undefined, { niu, cycle: Number(row.ciclo ?? 0) || undefined });
      } catch {
        setAgendadas((current) => ({ ...current, [niu]: "error" }));
      }
    },
    [token],
  );

  const descargar = useCallback(() => {
    if (!datos) return;
    const columnas = ["NIU", "ciclo_etiqueta", "zona_regional", "municipio", "direccion", "gravedad", "prioridad_gestion", "que_revisar"];
    const lineas: Array<Record<string, unknown>> = datos.items.map((row) => ({
      ...((row.payload ?? {}) as Record<string, unknown>),
      NIU: row.niu,
      ciclo_etiqueta: row.ciclo_etiqueta,
      zona_regional: row.zona_regional,
      municipio: row.municipio,
      direccion: row.direccion,
      que_revisar: queRevisar({ ...((row.payload ?? {}) as Record<string, unknown>), niu: row.niu }),
    }));
    const csv = [columnas.join(";"), ...lineas.map((row) => columnas.map((columna) => `"${String(row[columna] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ruta_visitas_ciclo_${ciclo === "" ? "todos" : ciclo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [ciclo, datos]);

  return (
    <section className="data-module">
      <header className="module-heading">
        <div>
          <div className="eyebrow">RUTAS DE CAMPO</div>
          <h2>Visitas por ciclo</h2>
          <p>La lista de gestión del ciclo, con municipio, dirección y la sugerencia del modelo de qué revisar en cada cuenta. Agenda la visita desde la misma tabla.</p>
        </div>
      </header>

      <div className="data-toolbar">
        <select className="filter-select" value={ciclo === "" ? "" : String(ciclo)} onChange={(event) => setCiclo(event.target.value === "" ? "" : Number(event.target.value))} aria-label="Ciclo de lectura">
          <option value="">Ciclos: todos</option>
          {(datos?.cycles ?? []).map((item) => (
            <option key={item.ciclo} value={item.ciclo}>
              Ciclo {item.ciclo_etiqueta} · {fmtN(item.clientes)} clientes
            </option>
          ))}
        </select>
        <span className="section-status">{datos ? `${fmtN(datos.total)} clientes en la ruta (máximo 300 por consulta)` : ""}</span>
        <button type="button" className="ghost-button" onClick={descargar} disabled={!datos?.items.length}>
          Descargar CSV
        </button>
      </div>

      {cargando && <div className="empty-state">Cargando la ruta…</div>}
      {error && <div className="empty-state">{error}</div>}
      {!cargando && datos && !datos.items.length && <div className="empty-state">No hay clientes en la lista para ese ciclo.</div>}

      {datos && datos.items.length > 0 && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>NIU</th>
                <th>Zona</th>
                <th>Municipio</th>
                <th>Dirección</th>
                <th>Gravedad</th>
                <th>Prioridad</th>
                <th>Qué revisar</th>
                <th>Visita</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((row) => {
                const payload = (row.payload ?? {}) as Record<string, unknown>;
                return (
                  <tr key={String(row.niu)}>
                    <td>{fmtN(Number(payload.orden_en_ciclo ?? 0))}</td>
                    <td>
                      <Sensitive value={row.niu} />
                    </td>
                    <td>{String(row.zona_regional ?? payload.zona_nombre ?? "—")}</td>
                    <td>{String(row.municipio ?? "—")}</td>
                    <td>
                      <Sensitive value={row.direccion} />
                    </td>
                    <td>{String(payload.gravedad ?? "—")}</td>
                    <td>{String(payload.prioridad_gestion ?? "—")}</td>
                    <td>{queRevisar({ ...payload, ...row })}</td>
                    <td>
                      <button type="button" className="ghost-button" onClick={() => agendar(row)} disabled={agendadas[String(row.niu)] === "ok"}>
                        {agendadas[String(row.niu)] === "ok" ? "Agendada ✓" : "Agendar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RegistroResultados({ token }: { token?: string | null }) {
  const [visitas, setVisitas] = useState<Array<Record<string, unknown>>>([]);
  const [seleccion, setSeleccion] = useState<Record<string, unknown> | null>(null);
  const [resultado, setResultado] = useState("CONTACTADO_CON_EXITO");
  const [notas, setNotas] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .visits(token ?? undefined)
      .then((data) => {
        if (!cancelled) {
          setVisitas(data as Array<Record<string, unknown>>);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar las visitas agendadas.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const guardar = useCallback(async () => {
    if (!seleccion) return;
    try {
      await api.recordVisitResult(token ?? undefined, Number(seleccion.id), resultado, notas);
      setMensaje("Resultado registrado. Queda en el historial de la cuenta.");
      setNotas("");
      const data = (await api.visits(token ?? undefined)) as Array<Record<string, unknown>>;
      setVisitas(data);
    } catch (cause: unknown) {
      setMensaje(null);
      setError(cause instanceof Error ? cause.message : "No fue posible registrar el resultado.");
    }
  }, [notas, resultado, seleccion, token]);

  return (
    <section className="data-module">
      <header className="module-heading">
        <div>
          <div className="eyebrow">SEGUIMIENTO DE VISITAS</div>
          <h2>Registrar resultado de visitas</h2>
          <p>Elige una visita agendada, registra lo que pasó en la cuenta y deja las notas para el histórico.</p>
        </div>
      </header>

      {error && <div className="empty-state">{error}</div>}
      {!visitas.length && !error && <div className="empty-state">Aún no hay visitas agendadas. Agenda una desde “Visitas por ciclo”.</div>}

      {visitas.length > 0 && (
        <div className="split-panel">
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>NIU</th>
                  <th>Ciclo</th>
                  <th>Agendada</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visitas.map((visita) => (
                  <tr key={String(visita.id)} className="clickable-row" onClick={() => setSeleccion(visita)}>
                    <td>
                      <Sensitive value={visita.niu} />
                    </td>
                    <td>{String(visita.cycle ?? "—")}</td>
                    <td>{fechaCo(visita.scheduled_for)}</td>
                    <td>
                      <span className="badge">{String(visita.status ?? "Pendiente")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="filter-card">
            <div className="eyebrow">RESULTADO</div>
            <h3>{seleccion ? `Cuenta ${String(seleccion.niu)}` : "Selecciona una visita"}</h3>
            <select className="filter-select" value={resultado} onChange={(event) => setResultado(event.target.value)} disabled={!seleccion}>
              <option value="CONTACTADO_CON_EXITO">Contactado con éxito</option>
              <option value="SIN_RESPUESTA">Sin respuesta</option>
              <option value="NO_APLICA">No aplica</option>
            </select>
            <textarea className="search-input" rows={4} placeholder="Notas de la visita" value={notas} onChange={(event) => setNotas(event.target.value)} disabled={!seleccion} />
            <button type="button" className="primary-button" onClick={guardar} disabled={!seleccion}>
              Registrar resultado
            </button>
            {mensaje && <p className="quiet-note">{mensaje}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
