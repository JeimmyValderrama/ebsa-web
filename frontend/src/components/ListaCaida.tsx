import { useEffect, useMemo, useState } from "react";
import { api, type DropsData } from "../lib/api";
import { usePresentation } from "../app/Presentation";
import { useCorte } from "../lib/useCorte";
import { Aviso, ComoLeer, Kpis, TituloPagina, type ItemKpi } from "./v2/ui";
import { Deslizador, PanelFiltros, type CampoFiltro } from "./v2/filtros";
import { TablaPro, type Fila } from "./v2/TablaPro";
import { FichaCliente } from "./v2/FichaCliente";
import { Conteo, Leyenda, md, useEsMovil } from "../charts/textos";
import { BarrasApiladas } from "../charts/Graficas";
import { C, COLOR_GRAVEDAD, SEVERIDAD_SIMPLE } from "../charts/paleta";
import { csvCelda, energia, fmtMedida, fmtN, formatoTabla, mesLargo, pesos, tituloPropio } from "../lib/format";
import {
  AYUDA_MUNICIPIO,
  AYUDA_ZONA_REGIONAL,
  ESTADO_LISTA_SIMPLE,
  PRIORIDAD_SIMPLE,
  TIPO_CAIDA_SIMPLE,
  TRAYECTORIA_SIMPLE,
  etiqueta,
} from "../lib/negocio";

/**
 * Sección "Caídas de consumo" del Streamlit: filtros de la lista, indicadores, tabla con la ficha
 * del cliente elegido, gravedad por zona de toda la lista, aviso de clientes en cero y cómo leer.
 */

const DEFECTO: Record<string, string[]> = { pri: ["GESTIONAR"], tip: [], grav: [], ten: [], zon: [], mun: [], cla: [], tam: [] };
const GRAVEDADES = ["CRITICA", "FUERTE", "MODERADA", "ANTIGUA"];

const COLUMNAS = [
  "Puesto",
  "NIU",
  "Municipio",
  "Zona regional",
  "Ciclo",
  "Clase",
  "Tamaño",
  "Tipo de caída",
  "Consumía (kWh/mes)",
  "Consume ahora (kWh/mes)",
  "Caída",
  "Consumo que se pierde (kWh/mes)",
  "Facturación que se pierde ($/mes)",
  "Tarifa ($/kWh)",
  "Gravedad",
  "Tendencia",
  "Prioridad",
  "Situación",
];

export function ListaCaida({ token }: { token?: string | null }) {
  const { measure } = usePresentation();
  const movil = useEsMovil();
  const corte = useCorte(token);
  const esConsumo = measure === "Consumo";
  const colVis = esConsumo ? "Consumo que se pierde (kWh/mes)" : "Facturación que se pierde ($/mes)";

  const [valores, setValores] = useState<Record<string, string[]>>({ ...DEFECTO });
  const [n, setN] = useState(200);
  // El deslizador espera 300 ms de calma antes de consultar (como st.slider del Streamlit):
  // arrastrarlo de 25 a 2000 debe ser UNA consulta, no una por tick del ratón.
  const [nConsulta, setNConsulta] = useState(200);
  const [datos, setDatos] = useState<DropsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const temporizador = window.setTimeout(() => setNConsulta(n), 300);
    return () => window.clearTimeout(temporizador);
  }, [n]);

  useEffect(() => {
    let cancelled = false;
    setCargando(true);
    api
      .drops(token ?? undefined, { medida: measure, n: nConsulta, ...valores })
      .then((respuesta) => {
        if (cancelled) return;
        setDatos(respuesta);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar la lista de caída.");
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
  }, [measure, nConsulta, token, valores]);

  // Municipios según la zona elegida (filtro_municipio_opciones: si hay zona, solo sus municipios).
  const permitidos = useMemo(() => {
    const zonales = valores.zon;
    return new Set(
      (datos?.opciones.municipios ?? [])
        .filter((entrada) => zonales.length === 0 || entrada.zonas.some((zona) => zonales.includes(zona)))
        .map((entrada) => entrada.municipio),
    );
  }, [datos, valores.zon]);

  const cambiarFiltro = (clave: string, valor: string[]): void => {
    setValores((actual) => {
      const siguiente = { ...actual, [clave]: valor };
      if (clave === "zon") {
        // Al cambiar la zona, los municipios que ya no quedan disponibles se quitan de la selección.
        const zonas = new Set(valor);
        const validos = new Set(
          (datos?.opciones.municipios ?? [])
            .filter((entrada) => zonas.size === 0 || entrada.zonas.some((zona) => zonas.has(zona)))
            .map((entrada) => entrada.municipio),
        );
        siguiente.mun = (actual.mun ?? []).filter((municipio) => validos.has(municipio));
      }
      return siguiente;
    });
  };

  const campos: CampoFiltro[] = [
    {
      key: "pri",
      etiqueta: "Prioridad",
      opciones: Object.keys(PRIORIDAD_SIMPLE),
      defecto: DEFECTO.pri,
      formato: (valor) => etiqueta(PRIORIDAD_SIMPLE, valor),
      vacio: "Todas",
      ayuda:
        "Por defecto solo lo que hay que gestionar. 'Seguimiento' son caídas que llevan meses en el mismo nivel (reales, pero no urgentes) "
        + "y los 'Vigilar' son estacionales o con recuperación prevista: siguen en la lista, elígelos aquí para verlos.",
    },
    {
      key: "tip",
      etiqueta: "Tipo de caída",
      opciones: Object.keys(TIPO_CAIDA_SIMPLE),
      formato: (valor) => etiqueta(TIPO_CAIDA_SIMPLE, valor),
      vacio: "Todos",
      ayuda:
        "Reciente: cae frente a su periodo anterior y frente al año pasado. Lleva meses así: frente al periodo anterior se mantiene; "
        + "la caída es contra el mismo periodo del año pasado.",
    },
    { key: "grav", etiqueta: "Gravedad", opciones: GRAVEDADES, formato: (valor) => etiqueta(SEVERIDAD_SIMPLE, valor), vacio: "Todas" },
    { key: "ten", etiqueta: "Tendencia", opciones: Object.keys(TRAYECTORIA_SIMPLE), formato: (valor) => etiqueta(TRAYECTORIA_SIMPLE, valor), vacio: "Todas" },
    { key: "zon", etiqueta: "Zona regional", opciones: datos?.opciones.zonas ?? [], vacio: "Todas", ayuda: AYUDA_ZONA_REGIONAL },
    { key: "mun", etiqueta: "Municipio", opciones: [...permitidos].sort(), vacio: "Todos", ayuda: AYUDA_MUNICIPIO },
    { key: "cla", etiqueta: "Clase", opciones: datos?.opciones.clases ?? [], vacio: "Todas" },
    { key: "tam", etiqueta: "Tamaño", opciones: datos?.opciones.tamanos ?? [], vacio: "Todos" },
  ];

  const caption = esConsumo
    ? "ordenados por la energía que se está dejando de consumir cada mes (kWh)."
    : "ordenados por la facturación que se está perdiendo cada mes (pesos, con la tarifa real de cada cliente).";

  const panel = (
    <PanelFiltros
      campos={campos}
      valores={valores}
      onChange={cambiarFiltro}
      alRestablecer={() => setN(200)}
      movil={movil}
      extra={
        <Deslizador
          etiqueta="Cuántos clientes incluir en la tabla y en la descarga"
          min={25}
          max={2000}
          step={25}
          valor={n}
          onChange={setN}
          ayuda="La lista va de mayor a menor pérdida (en la medida elegida: consumo o facturación); aquí se elige hasta qué puesto llega."
        />
      }
    />
  );

  if (error) return <div className="empty-state">{error}</div>;
  if (!datos) {
    return (
      <div className="stack">
        <div>
          <TituloPagina titulo="Clientes cuyo consumo está cayendo" />
          <p className="v2-caption">{md(`Periodo facturado **${mesLargo(corte || "—")}**. ${caption}`)}</p>
        </div>
        {panel}
        <div className={cargando ? "empty-state cargando" : "empty-state"}>{cargando ? "Consultando la lista de caída del corte vigente…" : "Todavía no hay lista de caída (paso 11 del pipeline)."}</div>
      </div>
    );
  }

  const resumen = datos.resumen;
  const medidaFiltrada = esConsumo ? resumen.perdida_kwh_mes : resumen.valor_riesgo_mes;
  const medidaTop = esConsumo ? datos.top.perdida_kwh_mes : datos.top.valor_riesgo_mes;
  const concentracion = medidaFiltrada > 0 ? (medidaTop / medidaFiltrada) * 100 : 0;

  const kpis: ItemKpi[] = [
    { titulo: "Clientes (con los filtros)", valor: fmtN(resumen.clientes), tono: "marca" },
    {
      titulo: esConsumo ? "Consumo que se pierde" : "Facturación que se pierde",
      valor: fmtMedida(medidaFiltrada, measure),
      unidad: "/mes",
      tono: "g",
      nota: esConsumo ? `equivale a ${pesos(resumen.valor_riesgo_mes)}/mes` : `equivale a ${energia(resumen.perdida_kwh_mes)}/mes`,
    },
    {
      titulo: `Los ${fmtN(datos.top.clientes)} primeros concentran`,
      valor: `${fmtN(concentracion, 0)} %`,
      nota: esConsumo ? "del consumo perdido con estos filtros" : "de la facturación perdida con estos filtros",
    },
  ];

  const filas: Fila[] = datos.items.map((item) => ({
    Puesto: item.puesto,
    NIU: item.niu,
    Municipio: item.municipio || "—",
    "Zona regional": item.zona_regional || "—",
    Ciclo: item.ciclo || "—",
    Clase: item.clase || "—",
    "Tamaño": item.tamano || "—",
    "Tipo de caída": etiqueta(TIPO_CAIDA_SIMPLE, item.veredicto),
    "Consumía (kWh/mes)": Math.round(item.referencia_kwh),
    "Consume ahora (kWh/mes)": Math.round(item.consumo_reciente_kwh),
    "Caída": item.caida_pct === null || Number.isNaN(item.caida_pct) ? "—" : `${Math.round(item.caida_pct)} %`,
    "Consumo que se pierde (kWh/mes)": Math.round(item.perdida_kwh_mes),
    "Facturación que se pierde ($/mes)": Math.round(item.valor_riesgo_mes),
    "Tarifa ($/kWh)": item.tarifa_kwh,
    Gravedad: etiqueta(SEVERIDAD_SIMPLE, item.gravedad),
    Tendencia: etiqueta(TRAYECTORIA_SIMPLE, item.trayectoria),
    Prioridad: etiqueta(PRIORIDAD_SIMPLE, item.prioridad),
    Situación: item.situacion ? etiqueta(ESTADO_LISTA_SIMPLE, item.situacion) : "",
  }));

  // Formato de celda igual que formato_tabla del Streamlit (tarifa, kWh y pesos según el nombre de la columna).
  const formato = formatoTabla(filas, COLUMNAS);

  // La caída se guarda como texto ("-45 %"), así que para ordenarla se usa el número de debajo (orden_claves).
  const ordenNumerico = { "Caída": datos.items.map((item) => item.caida_pct ?? Number.NEGATIVE_INFINITY) };

  const descarga = filas.length
    ? {
        nombre: "Descargar esta lista (CSV)",
        archivo: `caidas_consumo_${corte || ""}.csv`,
        csv: [COLUMNAS.join(";"), ...filas.map((fila) => COLUMNAS.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n"),
      }
    : null;

  // Gravedad de toda la lista por zona regional (grafico_gravedad_por_zona).
  const zonas = Object.entries(datos.gravedad_zona)
    .map(([zona, conteos]) => ({ zona, conteos, total: Object.values(conteos).reduce((suma, conteo) => suma + conteo, 0) }))
    .sort((a, b) => b.total - a.total);
  const ordenSev = GRAVEDADES.filter((sev) => zonas.some((zona) => zona.conteos[sev] !== undefined));
  const seriesSev = ordenSev.map((sev) => SEVERIDAD_SIMPLE[sev] ?? sev);
  const filasApiladas = zonas.map((zona) => ({
    cat: tituloPropio(zona.zona.replace("USUARIOS NO REGULADOS", "NO REGULADOS")),
    valores: ordenSev.reduce<Record<string, number>>(
      (acumulado, sev) => ({ ...acumulado, [SEVERIDAD_SIMPLE[sev] ?? sev]: zona.conteos[sev] ?? 0 }),
      {},
    ),
  }));

  const cero = datos.cero_sostenido;

  return (
    <div className="stack">
      <div>
        <TituloPagina titulo="Clientes cuyo consumo está cayendo" />
        <p className="v2-caption">{md(`Periodo facturado **${mesLargo(corte || "—")}**. ${caption}`)}</p>
      </div>

      {panel}

      {cargando && datos && (
        <p className="v2-caption actualizando" role="status">
          Actualizando la lista con los filtros y la medida actuales…
        </p>
      )}

      <div className={cargando && datos ? "resultados atareado" : "resultados"}>
        {resumen.clientes === 0 ? (
          <Aviso
            texto={
              "Ningún cliente cumple estos filtros. Prueba a quitar alguno: por ejemplo, las caídas que llevan meses así están en la "
              + "prioridad *Seguimiento*, no en *Gestionar*."
            }
          />
        ) : (
          <>
            <Kpis items={kpis} columnas={3} />
            <Conteo
              mostrados={datos.top.clientes}
              filtrados={resumen.clientes}
              enLista={datos.total_lista}
              universo={datos.evaluados}
              que="clientes con caída"
              queLista="en toda la lista de caída"
              queUniverso="clientes evaluados por el detector"
            />
            <TablaPro
              filas={filas}
              columnas={COLUMNAS}
              formato={formato}
              prioritarias={["Puesto", "NIU", "Municipio", "Clase", "Consumía (kWh/mes)", "Consume ahora (kWh/mes)", "Caída", colVis, "Gravedad", "Tendencia"]}
              movil={["NIU", "Municipio", colVis, "Caída", "Gravedad", "Tendencia"]}
              destacada={colVis}
              que="clientes con caída"
              columnaId="NIU"
              ordenNumerico={ordenNumerico}
              sensibles={["NIU"]}
              descargar={descarga}
              ficha={(niu) => <FichaCliente token={token} niu={niu} />}
            />
          </>
        )}
      </div>

      <details className="v2-exp" open={!movil}>
        <summary>Cuántos clientes hay por gravedad en cada zona regional (toda la lista)</summary>
        <div className="v2-exp-cuerpo">
          <Leyenda items={seriesSev.map((serie) => [serie, COLOR_GRAVEDAD[serie] ?? C.mudo] as [string, string])} />
          <BarrasApiladas
            filas={filasApiladas}
            series={seriesSev}
            colores={COLOR_GRAVEDAD}
            opciones={{ nombreCategoria: "Zona regional", nombreSerie: "Gravedad", movil }}
          />
        </div>
      </details>

      {cero.clientes > 0 && (
        <Aviso
          texto={`Aparte hay **${fmtN(cero.clientes)} clientes en cero o casi cero** desde hace 3 meses o más (`
            + (esConsumo ? `consumían ${energia(cero.consumo_referencia_kwh)}/mes` : `facturaban ${pesos(cero.valor_facturaba_antes_mes)}/mes`)
            + "). No están en esta lista porque ya no hay una caída que revisar; se listan en la sección **Clientes sin consumo** "
            + "para decidir qué hacer con ellos."}
        />
      )}

      <ComoLeer
        titulo="Cómo leer las columnas"
        texto={
          "**Consumía** es el nivel con el que se midió la pérdida: en una caída reciente, el menor entre el periodo anterior y el mismo "
          + "periodo del año pasado (para no exagerar la pérdida); en una caída que lleva meses, el del año pasado. **Consumo que se pierde** = "
          + "consumía − consume ahora, en kWh por mes. **Facturación que se pierde** = ese consumo × la **tarifa** del cliente ($/kWh, la que "
          + "trae el TC2 en su mes de referencia; cambia cada mes). **Gravedad**: qué tan fuera de lo normal es la caída. **Tendencia**: lo que "
          + "el modelo espera para el mes que viene. Sin autogeneradores ni área común, autoconsumos EBSA, distritos de riego y provisionales."
        }
      />
    </div>
  );
}
