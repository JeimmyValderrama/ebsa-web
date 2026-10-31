import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import type { Row } from "../components/DataExplorer";
import { Descargas } from "../components/Descargas";
import { MapaBoyaca, TablaMunicipioMapa, TablaZonaMapa, type InfoMapa } from "../components/MapaBoyaca";
import { ListaCaida } from "../components/ListaCaida";
import { SinConsumo } from "../components/SinConsumo";
import { Fuga } from "../components/Fuga";
import { Salidas } from "../components/Salidas";
import { Proyeccion, recortarProyeccion, type Anual, type Mensual } from "../components/Projection";
import { Aviso, Banda, ComoLeer, Kpis, Tarjeta, TituloPagina, type ItemKpi } from "../components/v2/ui";
import { NOTA_CERO_SOSTENIDO, NOTA_REGLAS_LISTA, QUE_ES_ESTO, periodoTexto } from "../components/v2/textos";
import { useCorte } from "../lib/useCorte";
import { MeasureSelector, usePresentation } from "../app/Presentation";
import { useSectionNav } from "../app/SectionNav";
import { energia, fmtMedida, fmtMedidaCorto, fmtN, mesLargo, pesos, pesosMillones, tituloPropio } from "../lib/format";
import { Barras, BarrasApiladas } from "../charts/Graficas";
import { VegaLite } from "../charts/VegaLite";
import { proyeccionTotalSpec } from "../charts/vegaSpec";
import { AZUL, COLOR_GRAVEDAD, C, NARANJA, SEVERIDAD_SIMPLE } from "../charts/paleta";
import { Leyenda, Pie, md, useEsMovil } from "../charts/textos";

type PanoramaData = Awaited<ReturnType<typeof api.panorama>>;

const sections = [
  ["panorama", "Panorama"],
  ["caidas", "Caídas de consumo"],
  ["sin_consumo", "Clientes sin consumo"],
  ["fuga", "Clientes con probabilidad de fuga"],
  ["salidas", "Clientes que ya se fueron"],
  ["proyeccion", "Proyección de consumo"],
  ["descargas", "Descargas"],
] as const;

type Section = (typeof sections)[number][0];

/** Grupos del menú lateral (misma organización que GRUPOS_MENU del Streamlit). */
const GRUPOS: Array<{ nombre: string; items: Array<{ clave: Section; etiqueta: string }> }> = [
  { nombre: "Resumen", items: [{ clave: "panorama", etiqueta: "Panorama" }] },
  {
    nombre: "Listas",
    items: [
      { clave: "caidas", etiqueta: "Caídas de consumo" },
      { clave: "sin_consumo", etiqueta: "Clientes sin consumo" },
      { clave: "fuga", etiqueta: "Probabilidad de fuga" },
      { clave: "salidas", etiqueta: "Clientes que ya se fueron" },
    ],
  },
  {
    nombre: "Planeación",
    items: [
      { clave: "proyeccion", etiqueta: "Proyección de consumo" },
      { clave: "descargas", etiqueta: "Descargas" },
    ],
  },
];


export default function CommercialPage() {
  const { idToken, currentUser } = useAuth();
  const [section, setSection] = useState<Section>("panorama");
  useSectionNav(GRUPOS, section, setSection);
  const navigate = useNavigate();
  // La ficha por NIU vive en Soporte; solo se ofrece a los roles que pueden abrirla.
  const puedeFichas = (currentUser?.role ?? "COMERCIAL") !== "COMERCIAL";
  const abrirFicha = useCallback(
    (row: Row) => {
      const niu = row.niu ?? String(row.payload?.NIU ?? "");
      if (niu && puedeFichas) navigate(`/soporte?niu=${encodeURIComponent(niu)}`);
    },
    [navigate, puedeFichas],
  );

  return (
    <div className="page-content">
      {section === "panorama" && <Panorama token={idToken} />}
      {section === "caidas" && <ListaCaida token={idToken} />}
      {section === "sin_consumo" && <SinConsumo token={idToken} />}
      {section === "fuga" && <Fuga token={idToken} />}
      {section === "salidas" && <Salidas token={idToken} />}
      {section === "proyeccion" && <Proyeccion token={idToken} />}
      {section === "descargas" && <Descargas token={idToken} />}
    </div>
  );
}

/** El total consolidado (la zona que empieza con TOTAL) del escenario base, igual que _proyeccion_total. */
function filtrarTotal<T extends { zona_regional?: string; escenario?: string }>(filas: T[]): T[] {
  const zonas = [...new Set(filas.map((fila) => String(fila.zona_regional ?? "")))];
  const zt = zonas.find((zona) => zona.startsWith("TOTAL")) ?? "";
  return filas.filter((fila) => (!zt || fila.zona_regional === zt) && (fila.escenario ?? "BASE") === "BASE");
}

/** Suma clientes y medida de los que comparten un prefijo de prioridad (GESTIONAR, SEGUIMIENTO..., VIGILAR...). */
function porPrefijo(porPrioridad: PanoramaData["por_prioridad"], prefijo: string, esConsumo: boolean): { clientes: number; medida: number } {
  return Object.entries(porPrioridad)
    .filter(([clave]) => clave.startsWith(prefijo))
    .reduce(
      (acumulado, [, valor]) => ({
        clientes: acumulado.clientes + valor.clientes,
        medida: acumulado.medida + (esConsumo ? valor.perdida_kwh_mes : valor.valor_riesgo_mes),
      }),
      { clientes: 0, medida: 0 },
    );
}

/**
 * Panorama comercial: réplica de la sección "Panorama" del Streamlit (título, selector de medida,
 * tarjeta principal con la banda de prioridades, indicadores, mapa con el top 10, gráficas por zona,
 * clase y tamaño, resumen de la proyección y qué cambió frente al mes anterior).
 */
function Panorama({ token }: { token?: string | null }) {
  const { measure, horizonte } = usePresentation();
  const movil = useEsMovil();
  const corte = useCorte(token);
  const [data, setData] = useState<PanoramaData | null>(null);
  const [proyeccion, setProyeccion] = useState<{ mensual: Mensual[]; anual: Anual[] } | null>(null);
  const [entradasSalidas, setEntradasSalidas] = useState<Row[]>([]);
  const [infoMapa, setInfoMapa] = useState<InfoMapa | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.panorama(token ?? undefined),
      api.dataset(token ?? undefined, "projection_monthly", { limit: 2000 }),
      api.dataset(token ?? undefined, "projection_annual", { limit: 400 }),
      api.dataset(token ?? undefined, "list_entries_exits", { limit: 50 }),
    ])
      .then(([panorama, mensual, anual, es]) => {
        if (cancelled) return;
        setData(panorama);
        setProyeccion({
          mensual: mensual.items.map((fila) => fila.payload as unknown as Mensual),
          anual: anual.items.map((fila) => ({ ...(fila.payload as unknown as Anual), anio: Number((fila.payload as Anual).anio) })),
        });
        setEntradasSalidas(es.items);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar el panorama.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const recorte = useMemo(() => {
    if (!proyeccion) return null;
    return recortarProyeccion(filtrarTotal(proyeccion.mensual), filtrarTotal(proyeccion.anual), horizonte);
  }, [horizonte, proyeccion]);

  const specProy = useMemo(() => (recorte && recorte.mensual.length ? proyeccionTotalSpec(recorte.mensual, { movil }) : null), [movil, recorte]);

  const esConsumo = measure === "Consumo";

  const ges = useMemo(() => (data ? porPrefijo(data.por_prioridad, "GESTIONAR", esConsumo) : { clientes: 0, medida: 0 }), [data, esConsumo]);
  const seg = useMemo(() => (data ? porPrefijo(data.por_prioridad, "SEGUIMIENTO", esConsumo) : { clientes: 0, medida: 0 }), [data, esConsumo]);
  const vig = useMemo(() => (data ? porPrefijo(data.por_prioridad, "VIGILAR", esConsumo) : { clientes: 0, medida: 0 }), [data, esConsumo]);

  if (error) return <div className="empty-state error" role="alert">{error}</div>;
  if (!data) return <div className="empty-state cargando" role="status">Cargando panorama…</div>;

  if (data.lista.clientes === 0) {
    return (
      <>
        <TituloPagina titulo="Panorama comercial" bajada={periodoTexto(data.cortes_zona)} />
        <Aviso
          texto="Todavía no hay salidas del pipeline. Corre python pipeline_mensual.py --modo aplicar y vuelve a abrir la página."
          tipo="alerta"
        />
      </>
    );
  }

  const totalOp = esConsumo ? data.lista.perdida_kwh_mes : data.lista.valor_riesgo_mes;
  const bajadaHero = esConsumo
    ? `Entre todos dejan de consumir **${energia(totalOp)} al mes** (energía que antes pasaba por sus medidores y ya no). `
      + `En pesos: ${pesos(data.lista.valor_riesgo_mes)}/mes con la tarifa real de cada cliente. Así se reparte según lo que hay que hacer:`
    : `Entre todos dejan de facturar **${pesos(totalOp)} al mes**, medido con la tarifa real de cada cliente `
      + `(equivale a ${energia(data.lista.perdida_kwh_mes)}/mes). Así se reparte según lo que hay que hacer:`;

  const fila1: ItemKpi[] = [
    {
      titulo: "Caídas graves recientes",
      valor: fmtN(data.gravedad.CRITICA ?? 0),
      tono: "alerta",
      nota: "Revisar primero medidor y lectura",
      ayuda:
        "Caída reciente muy por encima de lo normal del segmento: revisar medidor y lectura antes de dar por buena la cifra. "
        + "Las que llevan meses así se cuentan aparte, como antiguas.",
    },
    {
      titulo: "Nuevos en la lista este mes",
      valor: fmtN(data.estado_en_lista.NUEVO ?? 0),
      nota: `${fmtN(data.estado_en_lista.PERSISTENTE ?? 0)} vienen del corte anterior`,
    },
    {
      titulo: "Probabilidad de fuga alta o media",
      valor: fmtN(data.fuga.clientes),
      unidad: " clientes",
      nota: "No significa que se vayan a ir: es a quién contactar primero",
      ayuda:
        "Probabilidad de fuga ALTA o MEDIA según el modelo, entre los clientes comerciales, industriales, oficiales y acueductos. "
        + "No significa que se vayan a ir: es a quién contactar primero.",
    },
    esConsumo
      ? {
          titulo: "Consumo de esos clientes",
          valor: energia(data.fuga.consumo_alto_medio_kwh),
          unidad: "/mes",
          nota: "Promedio de los últimos 6 meses",
          ayuda:
            "Energía que consumen hoy los clientes con probabilidad de fuga alta o media (promedio de 6 meses). "
            + "Es lo que estaría en juego si se fueran; no es una predicción de que se vayan.",
        }
      : {
          titulo: "Pérdida esperada (fuga)",
          valor: pesos(data.fuga.perdida_esperada_mes),
          unidad: "/mes",
          nota: "Orden de magnitud para priorizar",
          ayuda: "Probabilidad de fuga × lo que factura hoy cada uno. Es un orden de magnitud para priorizar, no dinero que se vaya a perder con certeza.",
        },
  ];

  const fila2: ItemKpi[] = [
    {
      titulo: "Clientes sin consumo",
      valor: fmtN(data.cero_sostenido_resumen.clientes),
      nota: esConsumo
        ? `3 meses o más en cero o casi cero; consumían ${energia(data.cero_sostenido_resumen.consumo_referencia_kwh)}/mes`
        : `3 meses o más en cero o casi cero; facturaban ${pesos(data.cero_sostenido_resumen.valor_facturaba_antes_mes)}/mes`,
      ayuda: "No se cuentan como caída porque ya no consumen; están en la sección Clientes sin consumo.",
    },
    {
      titulo: "Ya atendidos por otro comercializador",
      valor: fmtN(data.otro_comercializador_con_otro),
      nota: "Según el archivo de otros comercializadores de la empresa",
      ayuda: "Según el archivo de otros comercializadores de la empresa.",
    },
    {
      titulo: "Grandes clientes en vigilancia (no regulados)",
      valor: fmtN(data.mercado_no_regulado),
      nota: "Pueden negociar con cualquier comercializador",
      ayuda: "Ciclo 33, clase no regulada o más de 55.000 kWh/mes: pueden negociar con cualquier comercializador.",
    },
  ];

  // Clientes con caída por zona regional y gravedad (grafico_gravedad_por_zona).
  const zonas = Object.entries(data.por_zona)
    .map(([zona, valor]) => ({
      zona,
      clientes: valor.clientes,
      perdida: valor.perdida_kwh_mes,
      valorRiesgo: valor.valor_riesgo_mes,
      gravedad: valor.gravedad,
      total: Object.values(valor.gravedad).reduce((suma, conteo) => suma + conteo, 0),
    }))
    .sort((a, b) => b.total - a.total);
  const ordenSev = (["CRITICA", "FUERTE", "MODERADA", "ANTIGUA"] as const).filter((sev) => zonas.some((zona) => zona.gravedad[sev] !== undefined));
  const seriesSev = ordenSev.map((sev) => SEVERIDAD_SIMPLE[sev] ?? sev);
  const filasApiladas = zonas.map((zona) => ({
    cat: tituloPropio(zona.zona.replace("USUARIOS NO REGULADOS", "NO REGULADOS")),
    valores: ordenSev.reduce<Record<string, number>>((acumulado, sev) => ({ ...acumulado, [SEVERIDAD_SIMPLE[sev] ?? sev]: zona.gravedad[sev] ?? 0 }), {}),
  }));
  const nombreColZona = esConsumo ? "Consumo que se pierde (kWh/mes)" : "Facturación que se pierde ($/mes)";
  const columnasZona = [
    "Zona regional",
    "Clientes con caída",
    ...(esConsumo ? ["Consumo que se pierde (kWh/mes)", "Facturación que se pierde ($/mes)"] : ["Facturación que se pierde ($/mes)", "Consumo que se pierde (kWh/mes)"]),
  ];
  const filasZona = [...zonas].sort((a, b) => (esConsumo ? b.perdida - a.perdida : b.valorRiesgo - a.valorRiesgo));

  // Consumo/facturación en riesgo por clase de servicio y por tamaño (mismo orden: de mayor a menor).
  const porClase = Object.entries(data.por_clase)
    .map(([clase, valor]) => ({ nombre: clase, medida: esConsumo ? valor.perdida_kwh_mes : valor.valor_riesgo_mes }))
    .sort((a, b) => b.medida - a.medida);
  const porGrupo = Object.entries(data.por_grupo)
    .map(([grupo, valor]) => ({ nombre: grupo, medida: esConsumo ? valor.perdida_kwh_mes : valor.valor_riesgo_mes }))
    .sort((a, b) => b.medida - a.medida);
  const titMed = esConsumo ? "Consumo en riesgo" : "Facturación en riesgo";
  const bajMed = esConsumo ? "kWh por mes, de mayor a menor" : "Pesos por mes, de mayor a menor";

  // Consumo de todos los clientes: celdas por año y serie mensual real + proyección.
  const anuales = (recorte?.anual ?? []).slice(-6);
  const ultimaReal = [...(recorte?.mensual ?? [])]
    .filter((fila) => fila.tipo === "REAL")
    .map((fila) => fila.periodo)
    .sort()
    .pop();
  const bajProy =
    `Consumo real por año y proyección del escenario base a ${horizonte ? `${horizonte} meses` : "todo el horizonte calculado"} (GWh)`
    + (recorte && recorte.fuera.length ? ` · los años ${recorte.fuera.join(", ")} quedan fuera del horizonte mostrado` : "");
  const captionMedida = esConsumo
    ? "**Consumo**: energía que se deja de consumir, en kWh, MWh o GWh por mes. **Facturación**: esa misma energía valorada con la tarifa real "
      + "de cada cliente, en pesos por mes. Cambia la unidad de medida; los clientes y las listas son los mismos."
    : "**Facturación**: pesos por mes que se dejan de facturar, medido con la tarifa real de cada cliente. **Consumo**: la misma pérdida medida en "
      + "energía (kWh, MWh o GWh). Cambia la unidad de medida; los clientes y las listas son los mismos.";

  return (
    <div className="stack">
      <div>
        <TituloPagina titulo="Panorama comercial" bajada={periodoTexto(data.cortes_zona)} />
        <div className="v2-fila-medida">
          <MeasureSelector />
          <p>{md(captionMedida)}</p>
        </div>
      </div>

      <Tarjeta hero titulo={`${fmtN(data.lista.clientes)} clientes consumen menos de lo normal para clientes parecidos`} bajada={bajadaHero}>
        <Banda
          segmentos={[
            { nombre: "Gestionar ahora", valor: fmtMedidaCorto(ges.medida, measure), unidad: "/mes", detalle: `${fmtN(ges.clientes)} clientes`, peso: ges.medida, color: C.gestionar },
            { nombre: "Seguimiento", valor: fmtMedidaCorto(seg.medida, measure), unidad: "/mes", detalle: `${fmtN(seg.clientes)} clientes`, peso: seg.medida, color: C.seguimiento },
            { nombre: "Vigilar", valor: fmtMedidaCorto(vig.medida, measure), unidad: "/mes", detalle: `${fmtN(vig.clientes)} clientes`, peso: vig.medida, color: C.vigilar_osc },
          ]}
        />
        <Pie
          texto={md(
            `**Gestionar ahora** son las caídas recientes (${fmtMedida(ges.medida, measure)}/mes). **Seguimiento** son caídas que llevan `
            + "meses en ese nivel: reales, pero no urgentes. **Vigilar** reúne clientes de temporada y con recuperación prevista.",
          )}
        />
      </Tarjeta>

      <Kpis items={fila1} columnas={4} />
      <Kpis items={fila2} columnas={Math.max(fila2.length, 3)} compacto />

      <div className="fila-3-2 fila-mapa">
        <Tarjeta titulo="Dónde está pasando" bajada="Municipios de Boyacá con sus límites oficiales">
          <MapaBoyaca token={token} corte={corte} onCalculo={setInfoMapa} tablasFuera />
        </Tarjeta>
        <div className="mapa-lateral">
          {infoMapa ? (
            <TopDiez info={infoMapa} />
          ) : (
            <Tarjeta titulo="Los diez municipios con más">
              <div className="empty-state cargando" role="status">Cargando mapa…</div>
            </Tarjeta>
          )}
          {infoMapa && (
            <Tarjeta
              titulo="Resumen por zona"
              bajada={`${infoMapa.metNombre}${infoMapa.enProporcion ? ` (${infoMapa.unidad})` : ""}, agregado por zona EBSA`}
            >
              <TablaZonaMapa info={infoMapa} />
            </Tarjeta>
          )}
        </div>
      </div>
      {infoMapa && (
        <details className="v2-exp mapa-detalle" open>
          <summary>Ver la tabla por municipio</summary>
          <div className="mapa-detalle-cuerpo">
            <TablaMunicipioMapa info={infoMapa} corte={corte} />
          </div>
        </details>
      )}

      <Tarjeta
        titulo="Caídas de consumo por zona regional"
        bajada="Cuántos clientes tienen caída de consumo en cada dirección regional y de qué gravedad"
        plegable
      >
        <div className="fila-3-2">
          <div>
            <Leyenda items={seriesSev.map((serie) => [serie, COLOR_GRAVEDAD[serie] ?? C.mudo] as [string, string])} />
            <BarrasApiladas
              filas={filasApiladas}
              series={seriesSev}
              colores={COLOR_GRAVEDAD}
              opciones={{ nombreCategoria: "Zona regional", nombreSerie: "Gravedad", movil }}
            />
          </div>
          <div className="table-card tabla-alta">
            <table>
              <thead>
                <tr>
                  {columnasZona.map((columna) => (
                    <th key={columna}>{columna}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasZona.map((zona) => (
                  <tr key={zona.zona}>
                    <td>{tituloPropio(zona.zona.replace("USUARIOS NO REGULADOS", "NO REGULADOS"))}</td>
                    <td>{fmtN(zona.clientes)}</td>
                    <td>{esConsumo ? fmtN(Math.round(zona.perdida)) : pesos(Math.round(zona.valorRiesgo))}</td>
                    <td>{esConsumo ? pesos(Math.round(zona.valorRiesgo)) : fmtN(Math.round(zona.perdida))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Pie
          texto={md(
            "**Grave** = caída reciente muy por encima de lo normal del segmento: revisar medidor y lectura primero. "
            + "**Antigua** = lleva meses en ese nivel; va en seguimiento, no como urgente.",
          )}
        />
      </Tarjeta>

      <div className="fila-1-1">
        <Tarjeta titulo={`${titMed} por clase de servicio`} bajada={bajMed} plegable>
          <Barras
            serie={porClase.map((fila) => [fila.nombre, fila.medida])}
            opciones={{ formato: (valor: number) => fmtMedidaCorto(valor, measure), color: AZUL, nombreValor: titMed, nombreCategoria: "Clase de servicio", movil }}
          />
        </Tarjeta>
        <Tarjeta titulo={`${titMed} por tamaño del cliente`} bajada={bajMed} plegable>
          <Barras
            serie={porGrupo.map((fila) => [fila.nombre, fila.medida])}
            opciones={{ formato: (valor: number) => fmtMedidaCorto(valor, measure), color: AZUL, nombreValor: titMed, nombreCategoria: "Tamaño", movil }}
          />
        </Tarjeta>
      </div>

      {specProy && (
        <Tarjeta titulo="Consumo de energía de todos los clientes" bajada={bajProy} plegable>
          {anuales.length > 0 && (
            <div className="year-grid" style={{ ["--cols" as string]: String(anuales.length) }}>
              {anuales.map((fila) => {
                const proy = Number(fila.meses_proyectados ?? 0);
                const real = Number(fila.meses_reales ?? 0);
                const tipo = proy === 0 ? "real" : real === 0 ? "proyectado" : "real + proyección";
                return (
                  <div key={fila.anio} className={proy ? "year-cell year-projected" : "year-cell"}>
                    <b>{fila.anio}</b>
                    <span>{fmtN(fila.total_gwh ?? 0, 1)}</span>
                    <small>{tipo}</small>
                  </div>
                );
              })}
            </div>
          )}
          <Leyenda items={[["Consumo real", AZUL], ["Proyección y rango del 80 %", NARANJA]]} />
          <VegaLite spec={specProy} className="vega-lite-figura" ariaLabel="Consumo real y proyección del total de clientes (GWh)" />
          <Pie
            texto={md(
              "La proyección es un escenario con margen de error, no una cifra exacta: el detalle por zona, las bandas y qué años son "
              + "confiables están en la sección *Proyección de consumo*."
              + (horizonte
                ? ` Se muestran ${horizonte} meses de proyección a partir del último mes real (${ultimaReal ? mesLargo(ultimaReal) : "—"}); `
                  + "el horizonte se cambia en esa sección."
                : ""),
            )}
          />
        </Tarjeta>
      )}

      {entradasSalidas.length > 0 && (
        <details className="v2-exp">
          <summary>Qué cambió frente al mes anterior</summary>
          <div className="v2-exp-cuerpo">
            <TablaEntradasSalidas filas={entradasSalidas} />
            <p>Clientes que entraron, salieron o siguen en la lista de caída frente al corte anterior.</p>
          </div>
        </details>
      )}

      <ComoLeer texto={`${QUE_ES_ESTO}\n\n${NOTA_REGLAS_LISTA}\n\n${NOTA_CERO_SOSTENIDO}`} titulo="Qué es esto y cómo leer las cifras" />
    </div>
  );
}

/** Tarjeta "Los diez municipios con más", con la cifra y el modo que eligió el mapa. */
function TopDiez({ info }: { info: InfoMapa }) {
  const movil = useEsMovil();
  const top = useMemo(() => [...info.filas].sort((a, b) => b.valor - a.valor).slice(0, 10), [info]);
  const suma = top.reduce((total, fila) => total + fila.valor, 0);
  if (!top.length || suma <= 0) return null;
  const cifra = info.metNombre;
  const modoTexto = info.enProporcion ? ` (${info.unidad})` : "";
  const enProporcion = Boolean(modoTexto);
  const esPesos = cifra.includes("$") && !enProporcion;
  const esKwh = cifra.includes("kWh") && !enProporcion;
  const color = /caída|perdiendo/i.test(cifra) ? NARANJA : AZUL;
  const textos = esPesos
    ? top.map((fila) => pesosMillones(fila.valor))
    : esKwh
      ? top.map((fila) => energia(fila.valor))
      : top.map((fila) => fila.valor_texto);
  const total = info.filas.reduce((acumulado, fila) => acumulado + fila.valor_total, 0);
  const sumaTotal = top.reduce((acumulado, fila) => acumulado + fila.valor_total, 0);
  return (
    <Tarjeta titulo="Los diez municipios con más" bajada={`${cifra}${modoTexto}, de mayor a menor`}>
      <Barras
        serie={top.map((fila) => [fila.municipio, fila.valor])}
        opciones={{ color, textos, nombreValor: cifra, nombreCategoria: "Municipio", altoFila: 34, movil }}
      />
      {!enProporcion && total > 0 && (
        <Pie
          texto={md(
            `Estos diez municipios reúnen el **${fmtN((sumaTotal / total) * 100, 0)} %** `
            + `del total de los ${fmtN(info.municipios)} municipios mostrados.`,
          )}
        />
      )}
    </Tarjeta>
  );
}

/** Tabla de entradas y salidas de la lista (list_entries_exits), con las columnas del archivo. */
function TablaEntradasSalidas({ filas }: { filas: Row[] }) {
  const columnas = ["fecha_corte", "corte_anterior", "en_lista_anterior", "en_lista_actual", "permanecen", "salieron", "entraron"];
  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            {columnas.map((columna) => (
              <th key={columna}>{columna}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, index) => (
            <tr key={index}>
              {columnas.map((columna) => {
                const valor = fila.payload?.[columna];
                return <td key={columna}>{typeof valor === "number" ? fmtN(valor) : String(valor ?? "—")}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

