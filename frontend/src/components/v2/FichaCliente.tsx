import { useEffect, useMemo, useState } from "react";
import { api, type DatasetPage } from "../../lib/api";
import { enmascarar, energia, fmtN, pesos, probPct, queRevisar } from "../../lib/format";
import {
  ESTADO_LISTA_SIMPLE,
  GRUPO_CONSUMO_NOMBRE,
  NIVEL_FUGA_SIMPLE,
  PRIORIDAD_SIMPLE,
  TRAYECTORIA_SIMPLE,
  VEREDICTO_TEXTO,
  etiqueta,
} from "../../lib/negocio";
import { NARANJA, SEVERIDAD_SIMPLE } from "../../charts/paleta";
import { columnasTiempoSpec, serieClienteSpec, type DatoCliente } from "../../charts/vegaSpec";
import { VegaLite } from "../../charts/VegaLite";
import { usePresentation, Sensitive } from "../../app/Presentation";
import { Leyenda, Pie, md, useEsMovil } from "../../charts/textos";
import { Aviso, Encabezado, Kpis, TablaSimple, type ItemKpi } from "./ui";

/**
 * Ficha de un cliente (ficha_cliente_simple del Streamlit): quién es y dónde está, situación hoy
 * (avisos, la caída con sus tres casos y la fuga), cómo ha venido consumiendo y el pronóstico a
 * 6 meses con sus columnas. Se usa debajo de las tablas (tabla_con_ficha) y en "Consultar un cliente".
 */

/** AYUDA_NIVEL_TENSION del Streamlit. */
const AYUDA_NIVEL_TENSION =
  "Nivel de tensión tal como viene en el archivo TC1 de la empresa (1 = baja tensión; 2, 3 y 4 = niveles superiores). "
  + "Es el dato registrado en el inventario de usuarios: puede estar desactualizado si el cliente amplió carga después "
  + "(observación de negocio, octubre 2026). El proyecto no dispone de una fuente más reciente, así que se muestra como "
  + "referencia y no se usa en ningún cálculo.";

/** kwh() del Streamlit: siempre en kWh y con separador de miles, sin escalar a MWh. */
function kwhFmt(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  const v = Number(valor);
  return Number.isNaN(v) ? "—" : fmtN(v) + " kWh";
}

type Datos = {
  cliente: Record<string, unknown> | null;
  operativa: Record<string, unknown> | null;
  fuga: Record<string, unknown> | null;
  ubicacion: Record<string, unknown> | null;
  otros: Record<string, unknown> | null;
  noRegulado: Record<string, unknown> | null;
  cero: Record<string, unknown> | null;
  auto: Record<string, unknown> | null;
  segmento: Record<string, unknown> | null;
  cortes: Array<Record<string, unknown>>;
  usoModelos: Array<Record<string, unknown>>;
  consumo: Array<{ periodo: string; consumo_kwh: number | null; estado_mes?: string | null; es_rural?: boolean | null }>;
  pronostico: Array<{
    horizonte: number | null;
    periodo_pronosticado: string | null;
    consumo_pronosticado_kwh: number | null;
    grupo_consumo?: string | null;
    fecha_corte?: string | null;
    modelo?: string | null;
  }>;
};

const soloItem = (pagina: DatasetPage | null): Record<string, unknown> | null => pagina?.items[0]?.payload ?? null;
const todosItems = (pagina: DatasetPage | null): Array<Record<string, unknown>> => pagina?.items.map((item) => item.payload) ?? [];

/** es_rural del último mes de la serie (sc["es_rural"].iloc[-1] del original). */
const esRuralDe = (consumo: Datos["consumo"]): boolean => Boolean(consumo.length ? consumo[consumo.length - 1]?.es_rural : false);

/** Corte del mes de la zona (CORTE_ZONA); si no está, el último mes de la serie. */
const corteDe = (cortes: Array<Record<string, unknown>>, consumo: Datos["consumo"], esRural: boolean): string => {
  const fila = cortes.find((corte) => String(corte.zona ?? "") === (esRural ? "RURAL" : "URBANO"));
  if (fila?.fecha_corte) return String(fila.fecha_corte).slice(0, 7);
  return consumo.length ? String(consumo[consumo.length - 1].periodo).slice(0, 7) : "—";
};

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
      api.dataset(token ?? undefined, "autogenerators", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "clusters", { niu, limit: 1 }).catch(() => null),
      api.dataset(token ?? undefined, "zone_cuts", { limit: 5 }).catch(() => null),
      api.dataset(token ?? undefined, "model_usage", { limit: 30 }).catch(() => null),
    ])
      .then(([cliente, operativa, fuga, ubicacion, otros, noRegulado, cero, consumo, pronostico, auto, segmento, cortes, uso]) => {
        if (cancelled) return;
        setDatos({
          cliente,
          operativa: soloItem(operativa as DatasetPage),
          fuga: soloItem(fuga as DatasetPage),
          ubicacion: soloItem(ubicacion as DatasetPage),
          otros: soloItem(otros as DatasetPage),
          noRegulado: soloItem(noRegulado as DatasetPage),
          cero: soloItem(cero as DatasetPage),
          auto: soloItem(auto as DatasetPage),
          segmento: soloItem(segmento as DatasetPage),
          cortes: todosItems(cortes as DatasetPage),
          usoModelos: todosItems(uso as DatasetPage),
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
    if (!datos || !datos.consumo.length) return [];
    const ordenar = (filas: DatoCliente[]): DatoCliente[] => [...filas].sort((a, b) => a.mes.localeCompare(b.mes));
    const corte = corteDe(datos.cortes, datos.consumo, esRuralDe(datos.consumo));
    const mesDe = (fila: { periodo: string }): string => String(fila.periodo).slice(0, 7);
    // El corte de la zona marca la frontera: hasta el corte es dato real (los últimos 18 meses); después, meses en parcial (rural a la espera del trimestre).
    const real = ordenar(
      datos.consumo
        .filter((fila) => mesDe(fila) <= corte)
        .slice(-18)
        .map((fila) => ({ mes: mesDe(fila), serie: "Real" as const, kwh: Number(fila.consumo_kwh ?? 0) })),
    );
    const parcial = ordenar(
      datos.consumo
        .filter((fila) => mesDe(fila) > corte)
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
  const cli = (datos.cliente?.client ?? null) as Record<string, unknown> | null;
  const drop = (datos.cliente?.drop ?? null) as Record<string, unknown> | null;

  // ----- Quién es y dónde está (kpis del TC1) -----
  const conTc1 = Boolean(datos.ubicacion);
  const direccion = String(datos.ubicacion?.direccion ?? "—").slice(0, 28);
  const donde: ItemKpi[] = conTc1
    ? [
        { titulo: "Municipio", valor: String(datos.ubicacion?.municipio ?? "—"), texto: true },
        { titulo: "Zona", valor: String(datos.ubicacion?.zona_mapa ?? "—"), texto: true },
        { titulo: "Dirección", valor: hideIds ? enmascarar(direccion) : direccion, texto: true },
        { titulo: "Nivel de tensión (TC1)", valor: String(datos.ubicacion?.nivel_tension ?? "—"), texto: true, ayuda: AYUDA_NIVEL_TENSION },
      ]
    : [{ titulo: "Municipio", valor: "—", texto: true }];

  // ----- Situación hoy: avisos (autogenerador, otro comercializador, mercado no regulado, cero) -----
  const avisos: Array<{ texto: string; tipo: string }> = [];
  const esAuto = Boolean(datos.ubicacion?.autogenerador_tc1) || Boolean(datos.auto);
  if (esAuto) {
    avisos.push({
      tipo: "info",
      texto:
        "**Autogenerador**: produce parte de su propia energía, por eso consume menos de la red. "
        + "No aparece en las listas de caída ni de fuga; una caída en él no es un problema.",
    });
  }
  if (datos.otros) {
    avisos.push({
      tipo: "alerta",
      texto: `**Ya está con otro comercializador**, desde ${String(datos.otros.primer_mes_otro ?? "").slice(0, 7)}. Estado en el archivo de la empresa: ${String(datos.otros.estado ?? "—")}.`,
    });
  }
  if (datos.noRegulado) {
    let texto = `**Cliente de mercado no regulado** (${String(datos.noRegulado.motivo ?? "")}): por su tamaño puede negociar con cualquier comercializador. `;
    const prob = datos.noRegulado.prob_fuga_6m;
    if (prob !== null && prob !== undefined && !Number.isNaN(Number(prob))) {
      texto += `Probabilidad de fuga: **${String(datos.noRegulado.nivel_riesgo ?? "—")}** (${probPct(Number(prob))} en 6 meses). Lo lleva el área comercial, no la cuadrilla.`;
    }
    avisos.push({ tipo: "info", texto });
  }
  if (datos.cero) {
    avisos.push({
      tipo: "info",
      texto: `**Lleva ${fmtN(Number(datos.cero.meses_en_cero_min ?? 3))} meses o más en cero o casi cero** (facturaba ${pesos(Number(datos.cero.valor_facturaba_antes_mes ?? 0))}/mes). `
        + "No está en la lista de caída: ya no hay consumo que revisar; conviene confirmar si está retirado, suspendido o el predio está desocupado.",
    });
  }

  // ----- Caída: en la operativa, en el estudio (drop) o sin dato (los tres casos del original) -----
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

  const verDrop = String(drop?.veredicto ?? "");
  const palabrasVeredicto = verDrop.replace(/_/g, " ");
  const kpisDrop: ItemKpi[] = drop
    ? [
        {
          titulo: "Caída de consumo",
          valor: verDrop === "SIN_CAIDA" ? "Sin caída" : palabrasVeredicto.charAt(0).toUpperCase() + palabrasVeredicto.slice(1).toLowerCase(),
          texto: true,
        },
        { titulo: "Consumo anterior", valor: kwhFmt(drop.consumo_anterior_kwh) },
        { titulo: "Consumo reciente", valor: kwhFmt(drop.consumo_reciente_kwh) },
      ]
    : [];

  const esAntigua = String(o?.veredicto ?? "") === "CAIDA_SOSTENIDA";
  const perdidaTxt = esConsumo
    ? `deja de consumir **${kwhFmt(p("perdida_kwh_mes"))}/mes** (${pesos(p("valor_riesgo_mes"))}/mes con su tarifa de ${pesos(p("tarifa_kwh"))}/kWh)`
    : `son **${pesos(p("valor_riesgo_mes"))}/mes** menos de facturación (${kwhFmt(p("perdida_kwh_mes"))}/mes a su tarifa de ${pesos(p("tarifa_kwh"))}/kWh)`;
  const fraseCaida = o
    ? (esAntigua
        ? `Hace un año consumía **${kwhFmt(referencia)}/mes** y ahora **${kwhFmt(p("consumo_reciente_kwh"))}/mes**: ${perdidaTxt}. `
          + `Frente a los meses anteriores (**${kwhFmt(p("consumo_anterior_kwh"))}/mes**) se mantiene: es una caída que lleva meses, no reciente. `
        : `Consumía **${kwhFmt(referencia)}/mes** y ahora **${kwhFmt(p("consumo_reciente_kwh"))}/mes**: ${perdidaTxt}. `)
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

  // ----- Consumo: corte de la zona y razones del original (CORTE_ZONA + grafica_consumo_cliente) -----
  const esRural = esRuralDe(datos.consumo);
  const corteC = corteDe(datos.cortes, datos.consumo, esRural);
  // La tabla del expander redondea a 1 decimal antes de decidir cuántos mostrar (formato_tabla del original).
  const decimalesGrafica = serie.every((dato) => (Math.round(dato.kwh * 10) / 10) % 1 === 0) ? 0 : 1;
  const filasGrafica = serie.map((dato) => ({ mes: dato.mes, kWh: fmtN(dato.kwh, decimalesGrafica), serie: dato.serie }));

  // ----- Pronóstico: columnas, pie y avisos (Pronóstico a 6 meses del original) -----
  const hayPronostico = datos.pronostico.length > 0;
  const decimalesPron = datos.pronostico.every((fila) => Number(fila.consumo_pronosticado_kwh ?? 0) % 1 === 0) ? 0 : 1;
  const filasBarras: Array<[string, number]> = datos.pronostico.map((fila) => [
    String(fila.periodo_pronosticado ?? "").slice(0, 7),
    Number(fila.consumo_pronosticado_kwh ?? 0),
  ]);
  const grupoBruto = String(datos.pronostico[0]?.grupo_consumo ?? "—");
  const grupoNombre = GRUPO_CONSUMO_NOMBRE[grupoBruto] ?? grupoBruto;
  const zonaRegimen = datos.consumo.length ? (esRural ? "RURAL" : "URBANO") : "—";
  const fechaCorteMes = String(datos.pronostico[0]?.fecha_corte ?? "").slice(0, 7) || "—";
  const fechaModeloEntrenado = (): string => {
    const candidatas = datos.usoModelos.filter(
      (fila) => String(fila.modelo ?? "") === "pronostico" && String(fila.fecha_corte ?? "").slice(0, 7) === fechaCorteMes,
    );
    const fila = candidatas.find((uso) => String(uso.modo ?? "") === "reentrenar") ?? candidatas[0];
    return String(fila?.fecha_corte_modelo ?? "").slice(0, 7) || "—";
  };
  const modelo1 = String(datos.pronostico.find((fila) => Number(fila.horizonte) === 1)?.modelo ?? "");
  let razonPronostico = "historia insuficiente o sin dato en el mes de corte";
  if (!hayPronostico && datos.consumo.length) {
    const conDato = datos.consumo.filter((fila) => fila.consumo_kwh !== null && fila.consumo_kwh !== undefined && !Number.isNaN(Number(fila.consumo_kwh)));
    const nOk = conDato.length;
    const ultimo = nOk ? String(conDato[nOk - 1].periodo).slice(0, 7) : "";
    if (ultimo && ultimo < corteC) {
      razonPronostico =
        `**no tiene lectura en el mes de corte (${corteC})**: su último dato es de ${ultimo}. El modelo solo pronostica a los clientes con dato en el corte; `
        + `tendrá pronóstico cuando llegue su lectura de ${corteC}. Mientras tanto, la lista de caída lo evalúa con su último mes conocido`;
    } else if (nOk < 12) {
      razonPronostico = `solo tiene ${nOk} meses con dato y el modelo necesita al menos 12`;
    } else {
      razonPronostico =
        `tiene dato en el corte (${corteC}) e historia suficiente, pero no quedó en el archivo de pronóstico; revisar en el registro de la corrida `
        + "el paso de pronóstico (por ejemplo, un cambio de zona o de perfil en el mes)";
    }
  }

  return (
    <div className="stack">
      <div>
        <Encabezado titulo="Quién es y dónde está" />
        <Kpis items={donde} columnas={4} compacto />
        <p className="v2-pie">
          {conTc1
            ? `El nivel de tensión viene del TC1 (corte ${String(datos.ubicacion?.periodo_tc1 ?? "—")}) y puede no reflejar ampliaciones de carga posteriores; es solo referencia.`
            : "Este NIU no está en el archivo TC1 cruzado (puede ser un cliente nuevo)."}
        </p>
        <p className="v2-pie">
          {md(
            `Clase de servicio **${String(o?.clase_servicio_nombre ?? z?.clase_servicio_nombre ?? cli?.clase_servicio_nombre ?? o?.clase_servicio ?? z?.clase_servicio ?? cli?.clase_servicio ?? "—")}** · estrato/sector `
            + `**${String(o?.estrato ?? z?.estrato ?? cli?.estrato ?? "—")}** · tamaño **${String(o?.grupo_consumo ?? z?.grupo_consumo ?? cli?.grupo_consumo ?? "—")}**`
            + (datos.segmento ? ` · segmento **${String(datos.segmento.cluster_id ?? "—")}**` : ""),
          )}
        </p>
        {typeof datos.segmento?.segmento_descripcion === "string" && datos.segmento.segmento_descripcion ? (
          <p className="v2-pie">{String(datos.segmento.segmento_descripcion)}</p>
        ) : null}
      </div>

      <div>
        <Encabezado titulo="Situación hoy" />
        {avisos.map((aviso) => (
          <Aviso key={aviso.texto} texto={aviso.texto} tipo={aviso.tipo} />
        ))}

        {o ? (
          <>
            <Kpis items={kpisCaida} columnas={3} compacto />
            {(prioridad.startsWith("VIGILAR") || prioridad.startsWith("SEGUIMIENTO")) && (
              <p className="v2-pie">Prioridad: <b>{etiqueta(PRIORIDAD_SIMPLE, prioridad)}</b></p>
            )}
            <p className="v2-pie">{md(fraseCaida)}</p>
            <Aviso texto={`**Qué revisar / qué decirle:** ${queRevisar({ ...o, gravedad })}`} tipo="info" rotulo="Sugerencia" />
          </>
        ) : drop ? (
          <>
            <Kpis items={kpisDrop} columnas={3} compacto />
            {VEREDICTO_TEXTO[verDrop] ? <p className="v2-pie">{VEREDICTO_TEXTO[verDrop]}</p> : null}
            {verDrop === "SIN_CAIDA" && (
              <Aviso texto="No está en la lista de caída: su consumo se mantiene dentro de lo normal para clientes parecidos." tipo="bien" />
            )}
          </>
        ) : (
          <>
            <Kpis items={[{ titulo: "Caída de consumo", valor: "Sin dato", texto: true }]} columnas={3} compacto />
            <p className="v2-pie">No está en el estudio de caída (sin historia suficiente, alumbrado, provisional o excluido).</p>
          </>
        )}

        {kpisFuga.length > 0 ? (
          <>
            <Kpis items={kpisFuga} columnas={3} compacto />
            <p className="v2-pie">
              {etiqueta(NIVEL_FUGA_SIMPLE, z?.nivel_riesgo)}
              {typeof z?.senales === "string" && z.senales ? `. Señales: ${String(z.senales)}` : ""}
            </p>
          </>
        ) : !datos.noRegulado && !datos.otros ? (
          <p className="v2-pie">
            No está entre los clientes a los que se les calcula probabilidad de fuga (es residencial, alumbrado, provisional o sin historia suficiente).
          </p>
        ) : null}
      </div>

      <div>
        <Encabezado titulo="Cómo ha venido consumiendo" bajada="Consumo de los últimos 18 meses y pronóstico a 6" />
        {datos.consumo.length > 0 ? (
          <>
            <Leyenda items={[["Consumo real", "#2a78d6"], ["Pronóstico del modelo", "#eb6834"], ["Lectura parcial", "#8a8a8a"]]} />
            <VegaLite spec={serieClienteSpec(serie, { movil })} className="vega-lite-figura" ariaLabel="Consumo mensual del cliente y pronóstico" />
            <Pie
              texto={md(
                "Línea continua azul: consumo real (18 meses hasta el corte). Línea punteada naranja: pronóstico del modelo. "
                + "Rombos grises: meses con lectura parcial (rurales a la espera de la lectura trimestral).",
              )}
            />
            {esRural && (
              <Aviso
                tipo="calidad"
                texto={`Cliente rural (lectura trimestral). Corte rural ${corteC}: los meses posteriores muestran el pronóstico; el valor real reemplaza al pronosticado cuando llegue la lectura.`}
              />
            )}
            <details className="v2-exp">
              <summary>Ver los datos de la gráfica</summary>
              <div className="v2-exp-cuerpo">
                <TablaSimple columnas={["mes", "kWh", "serie"]} filas={filasGrafica} />
              </div>
            </details>
          </>
        ) : (
          <Aviso texto="El NIU no tiene filas en la serie de modelado." tipo="info" />
        )}
      </div>

      <div>
        <Encabezado titulo="Pronóstico a 6 meses" />
        {hayPronostico ? (
          <>
            <div className="pron-grid">
              <VegaLite
                spec={columnasTiempoSpec(filasBarras, { formato: (valor) => fmtN(valor, 1) + " kWh", color: NARANJA, nombreValor: "Pronóstico", alto: 230 })}
                className="vega-lite-figura"
                ariaLabel="Pronóstico de consumo a 6 meses"
              />
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>mes</th>
                      <th>pronóstico kWh</th>
                      <th>modelo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.pronostico.map((fila) => (
                      <tr key={String(fila.horizonte)}>
                        <td>{String(fila.periodo_pronosticado ?? "").slice(0, 7)}</td>
                        <td>{fmtN(Number(fila.consumo_pronosticado_kwh ?? 0), decimalesPron)}</td>
                        <td>{String(fila.modelo ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="v2-pie">
              {`Grupo de consumo: ${grupoNombre} · zona ${zonaRegimen} · corte del pronóstico: ${fechaCorteMes} · modelo entrenado con corte ${fechaModeloEntrenado()}`}
            </p>
            {modelo1 === "REGLA_CERO_SOSTENIDO" && (
              <Aviso
                tipo="limite"
                texto={
                  "Este cliente lleva sus dos últimos meses en cero (o casi): el pronóstico es persistencia del último valor, no una recuperación. "
                  + "Si vuelve a consumir, la regla deja de aplicar sola el mes siguiente."
                }
              />
            )}
          </>
        ) : (
          <Aviso texto={`El NIU no tiene pronóstico: ${razonPronostico}.`} tipo="calidad" />
        )}
      </div>

      <p className="v2-pie">
        NIU <Sensitive value={niu} /> · los datos corresponden al corte importado más reciente.
      </p>
    </div>
  );
}
