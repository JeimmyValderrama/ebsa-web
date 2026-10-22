import { useEffect, useMemo, useState } from "react";
import { api, type DatasetPage } from "../../lib/api";
import { enmascarar, energia, fmtN, mesCorto, pesos, probPct, queRevisar } from "../../lib/format";
import { ESTADO_LISTA_SIMPLE, NIVEL_FUGA_SIMPLE, PRIORIDAD_SIMPLE, TRAYECTORIA_SIMPLE, etiqueta } from "../../lib/negocio";
import { SEVERIDAD_SIMPLE } from "../../charts/paleta";
import { serieClienteSpec, type DatoCliente } from "../../charts/vegaSpec";
import { VegaLite } from "../../charts/VegaLite";
import { usePresentation, Sensitive } from "../../app/Presentation";
import { Leyenda, Pie, md, useEsMovil } from "../../charts/textos";
import { Aviso, Encabezado, Kpis, type ItemKpi } from "./ui";

/**
 * Ficha de un cliente (ficha_cliente_simple del Streamlit): quién es y dónde está, situación hoy,
 * la caída con su sugerencia, la probabilidad de fuga y cómo ha venido consumiendo.
 * Se usa debajo de las tablas (tabla_con_ficha) y en "Consultar un cliente".
 */

type Datos = {
  cliente: Record<string, unknown> | null;
  operativa: Record<string, unknown> | null;
  fuga: Record<string, unknown> | null;
  ubicacion: Record<string, unknown> | null;
  otros: Record<string, unknown> | null;
  noRegulado: Record<string, unknown> | null;
  cero: Record<string, unknown> | null;
  consumo: Array<{ periodo: string; consumo_kwh: number | null; estado_mes?: string | null }>;
  pronostico: Array<{ horizonte: number | null; periodo_pronosticado: string | null; consumo_pronosticado_kwh: number | null }>;
};

const soloItem = (pagina: DatasetPage | null): Record<string, unknown> | null => pagina?.items[0]?.payload ?? null;

export function FichaCliente({ token, niu }: { token?: string | null; niu: string }) {
  const { measure, hideIds } = usePresentation();
  const movil = useEsMovil();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(Boolean(niu));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!niu) {
      setDatos(null);
      setCargando(false);
      return;
    }
    let cancelled = false;
    setCargando(true);
    Promise.all([
      api.client(token ?? undefined, niu).catch(() => null),
      api.dataset(token ?? undefined, "operational", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "churn_scores", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "locations", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "churn_other_supplier", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "churn_non_regulated", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "zero_sustained", { niu, limit: 1 }).catch(() => null),
      api.consumption(token ?? undefined, niu).catch(() => []),
      api.forecast(token ?? undefined, niu).catch(() => []),
    ])
      .then(([cliente, operativa, fuga, ubicacion, otros, noRegulado, cero, consumo, pronostico]) => {
        if (cancelled) return;
        setDatos({
          cliente,
          operativa: soloItem(operativa as DatasetPage),
          fuga: soloItem(fuga as DatasetPage),
          ubicacion: soloItem(ubicacion as DatasetPage),
          otros: soloItem(otros as DatasetPage),
          noRegulado: soloItem(noRegulado as DatasetPage),
          cero: soloItem(cero as DatasetPage),
          consumo,
          pronostico,
        });
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

  const o = datos?.operativa ?? null;
  const z = datos?.fuga ?? null;
  const p = (clave: string): number => Number(o?.[clave] ?? 0) || 0;

  const serie = useMemo<DatoCliente[]>(() => {
    if (!datos) return [];
    const ordenar = (filas: DatoCliente[]): DatoCliente[] => [...filas].sort((a, b) => a.mes.localeCompare(b.mes));
    const ultimos = datos.consumo.slice(-18);
    const mesDe = (fila: { periodo: string }): string => String(fila.periodo).slice(0, 7);
    // Meses con lectura provisional (rurales a la espera del trimestre) se dibujan aparte, como "parciales".
    const real = ordenar(
      ultimos
        .filter((fila) => fila.estado_mes !== "PROVISIONAL")
        .map((fila) => ({ mes: mesDe(fila), serie: "Real" as const, kwh: Number(fila.consumo_kwh ?? 0) })),
    );
    const parcial = ordenar(
      ultimos
        .filter((fila) => fila.estado_mes === "PROVISIONAL")
        .map((fila) => ({ mes: mesDe(fila), serie: "Parcial (sin lectura completa)" as const, kwh: Number(fila.consumo_kwh ?? 0) })),
    );
    const pronostico = ordenar(
      datos.pronostico.map((fila) => ({
        mes: String(fila.periodo_pronosticado ?? "").slice(0, 7),
        serie: "Pronóstico" as const,
        kwh: Number(fila.consumo_pronosticado_kwh ?? 0),
      })),
    );
    // La línea punteada arranca en el último mes real para que se lea continua.
    const enlace = pronostico.length && real.length ? [{ ...real[real.length - 1], serie: "Pronóstico" as const }] : [];
    return [...real, ...parcial, ...enlace, ...pronostico];
  }, [datos]);

  if (error) return <Aviso texto={error} tipo="alerta" />;
  if (!datos) return cargando ? <p className="v2-pie">Consultando el corte vigente…</p> : null;

  const esConsumo = measure === "Consumo";
  // Gravedad de negocio: una caída que lleva meses deja de contar como urgente y pasa a "antigua".
  const gravedad = String(o?.veredicto ?? "") === "CAIDA_SOSTENIDA" ? "ANTIGUA" : String(o?.severidad ?? "—");
  const municipio = String(datos.ubicacion?.municipio ?? "—");
  const direccion = String(datos.ubicacion?.direccion ?? "—");
  const donde: ItemKpi[] = [
    { titulo: "Municipio", valor: municipio, texto: true },
    { titulo: "Zona regional", valor: String(datos.cliente?.zona_regional ?? o?.zona_regional ?? "—"), texto: true },
    { titulo: "Ciclo", valor: String(datos.cliente?.ciclo_etiqueta ?? o?.ciclo_etiqueta ?? "—"), texto: true },
    { titulo: "Dirección", valor: hideIds ? enmascarar(direccion) : direccion, texto: true },
  ];

  const avisos: Array<{ texto: string; tipo: string }> = [];
  if (datos.otros) {
    avisos.push({
      tipo: "alerta",
      texto: `**Ya está con otro comercializador**, desde ${String(datos.otros.primer_mes_otro ?? "").slice(0, 7)}. Estado en el archivo de la empresa: ${String(datos.otros.estado ?? "—")}.`,
    });
  }
  if (datos.noRegulado) {
    avisos.push({
      tipo: "info",
      texto: `**Cliente de mercado no regulado** (${String(datos.noRegulado.motivo ?? "")}): por su tamaño puede negociar con cualquier comercializador.`,
    });
  }
  if (datos.cero) {
    avisos.push({
      tipo: "info",
      texto: `**Lleva ${fmtN(Number(datos.cero.meses_en_cero_min ?? 3))} meses o más en cero o casi cero** (facturaba ${pesos(Number(datos.cero.valor_facturaba_antes_mes ?? 0))}/mes). `
        + "No está en la lista de caída: ya no hay consumo que revisar; conviene confirmar si está retirado, suspendido o el predio está desocupado.",
    });
  }

  const referencia = p("consumo_reciente_kwh") + p("perdida_kwh_mes");
  const caidaPct = referencia > 0 ? ((p("consumo_reciente_kwh") - referencia) / referencia) * 100 : Number.NaN;
  const prioridad = String(o?.prioridad_gestion ?? "");
  const kpisCaida: ItemKpi[] = o
    ? [
        {
          titulo: "Caída de consumo",
          valor: Number.isNaN(caidaPct) ? "—" : `${fmtN(caidaPct, 0)} %`,
          tono: "g",
          ayuda:
            "Consumo reciente frente a la referencia con la que se midió la pérdida: en una caída reciente, la menor entre el periodo anterior "
            + "y el mismo periodo del año pasado (para no exagerar); en una caída que lleva meses, el año pasado.",
        },
        prioridad === "VIGILAR: estacional"
          ? { titulo: "Gravedad", valor: "Estacional", texto: true, ayuda: "Es temporada baja de un cliente que ya volvió otras veces: no se trata como caída grave." }
          : { titulo: "Gravedad", valor: etiqueta(SEVERIDAD_SIMPLE, gravedad), texto: true, tono: gravedad === "CRITICA" ? "alerta" : undefined },
        { titulo: "Tendencia", valor: etiqueta(TRAYECTORIA_SIMPLE, o?.trayectoria), texto: true, ayuda: PRIORIDAD_SIMPLE[prioridad] || undefined },
      ]
    : [];

  const esAntigua = String(o?.veredicto ?? "") === "CAIDA_SOSTENIDA";
  const perdidaTxt = esConsumo
    ? `deja de consumir **${energia(p("perdida_kwh_mes"))}/mes** (${pesos(p("valor_riesgo_mes"))}/mes con su tarifa de ${fmtN(p("tarifa_kwh"), 1)} $/kWh)`
    : `son **${pesos(p("valor_riesgo_mes"))}/mes** menos de facturación (${energia(p("perdida_kwh_mes"))}/mes a su tarifa de ${fmtN(p("tarifa_kwh"), 1)} $/kWh)`;
  const fraseCaida = o
    ? (esAntigua
        ? `Hace un año consumía **${energia(referencia)}/mes** y ahora **${energia(p("consumo_reciente_kwh"))}/mes**: ${perdidaTxt}. `
          + `Frente a los meses anteriores (**${energia(p("consumo_anterior_kwh"))}/mes**) se mantiene: es una caída que lleva meses, no reciente. `
        : `Consumía **${energia(referencia)}/mes** y ahora **${energia(p("consumo_reciente_kwh"))}/mes**: ${perdidaTxt}. `)
      + etiqueta(ESTADO_LISTA_SIMPLE, o?.estado_en_lista)
      + (String(o?.estado_en_lista ?? "") === "PERSISTENTE" ? ` (lleva ${fmtN(Number(o?.meses_consecutivos_en_lista ?? 1))} cortes seguidos en la lista).` : ".")
    : "";

  const kpisFuga: ItemKpi[] =
    z && !datos.otros
      ? [
          { titulo: "Probabilidad de fuga a otro comercializador", valor: String(z.nivel_riesgo ?? "—"), texto: true, tono: z.nivel_riesgo === "ALTO" ? "alerta" : z.nivel_riesgo === "MEDIO" ? "aviso" : undefined },
          { titulo: "Probabilidad en 6 meses", valor: probPct(z.prob_fuga_6m) },
          esConsumo
            ? {
                titulo: "Consumo promedio (últimos 6 meses)",
                valor: energia(Number(z.consumo_prom_6m_kwh ?? 0)),
                unidad: "/mes",
                nota: `factura ${pesos(Number(z.valor_en_riesgo_mes ?? 0))}/mes`,
                ayuda: "Consumo promedio de los últimos 6 meses; en un cliente estacional incluye la temporada alta. El valor en pesos usa su tarifa real.",
              }
            : {
                titulo: "Factura promedio (últimos 6 meses)",
                valor: pesos(Number(z.valor_en_riesgo_mes ?? 0)),
                unidad: "/mes",
                nota: `consume ${energia(Number(z.consumo_prom_6m_kwh ?? 0))}/mes`,
                ayuda: "Consumo promedio de los últimos 6 meses por su tarifa real; en un cliente estacional incluye la temporada alta.",
              },
        ]
      : [];

  return (
    <div className="stack">
      <div>
        <Encabezado titulo="Quién es y dónde está" />
        <Kpis items={donde} columnas={4} compacto />
        <p className="v2-pie">
          {md(
            `Clase de servicio **${String(datos.cliente?.clase_servicio_nombre ?? o?.clase_servicio_nombre ?? "—")}** · estrato/sector `
            + `**${String(datos.cliente?.estrato ?? o?.estrato ?? "—")}** · tamaño **${String(datos.cliente?.grupo_consumo ?? o?.grupo_consumo ?? "—")}**`,
          )}
        </p>
      </div>

      {avisos.length > 0 && (
        <div>
          <Encabezado titulo="Situación hoy" />
          {avisos.map((aviso) => (
            <Aviso key={aviso.texto} texto={aviso.texto} tipo={aviso.tipo} />
          ))}
        </div>
      )}

      {o ? (
        <div>
          <Encabezado titulo="La caída de consumo" />
          <Kpis items={kpisCaida} columnas={3} compacto />
          {(prioridad.startsWith("VIGILAR") || prioridad.startsWith("SEGUIMIENTO")) && (
            <p className="v2-pie">Prioridad: <b>{etiqueta(PRIORIDAD_SIMPLE, prioridad)}</b></p>
          )}
          <p className="v2-pie">{md(fraseCaida)}</p>
          <Aviso texto={`**Qué revisar / qué decirle:** ${queRevisar({ ...o, gravedad })}`} tipo="info" rotulo="Sugerencia" />
        </div>
      ) : null}

      {kpisFuga.length > 0 ? (
        <div>
          <Encabezado titulo="Probabilidad de fuga" />
          <Kpis items={kpisFuga} columnas={3} compacto />
          <p className="v2-pie">
            {etiqueta(NIVEL_FUGA_SIMPLE, z?.nivel_riesgo)}
            {typeof z?.senales === "string" && z.senales ? `. Señales: ${String(z.senales)}` : ""}
          </p>
        </div>
      ) : null}

      {serie.length > 0 && (
        <div>
          <Encabezado titulo="Cómo ha venido consumiendo" bajada="Consumo de los últimos 18 meses y pronóstico a 6" />
          <Leyenda items={[["Consumo real", "#2a78d6"], ["Pronóstico del modelo", "#eb6834"], ["Lectura parcial", "#8a8a8a"]]} />
          <VegaLite spec={serieClienteSpec(serie, { movil })} className="vega-lite-figura" ariaLabel="Consumo mensual del cliente y pronóstico" />
          <Pie
            texto={md(
              "Línea continua azul: consumo real (18 meses hasta el corte). Línea punteada naranja: pronóstico del modelo. "
              + "Rombos grises: meses con lectura parcial (rurales a la espera de la lectura trimestral).",
            )}
          />
        </div>
      )}

      {datos.pronostico.length > 0 && (
        <div>
          <Encabezado titulo="Pronóstico a 6 meses" />
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Horizonte</th>
                  <th>Mes</th>
                  <th>Consumo esperado</th>
                </tr>
              </thead>
              <tbody>
                {datos.pronostico.map((fila) => (
                  <tr key={String(fila.horizonte)}>
                    <td>{fmtN(fila.horizonte)}</td>
                    <td>{mesCorto(fila.periodo_pronosticado)}</td>
                    <td>{energia(fila.consumo_pronosticado_kwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="v2-pie">
        NIU <Sensitive value={niu} /> · los datos corresponden al corte importado más reciente.
      </p>
    </div>
  );
}
