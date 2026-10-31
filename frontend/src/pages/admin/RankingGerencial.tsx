import { useEffect, useMemo, useState } from "react";
import { usePresentation } from "../../app/Presentation";
import { api, type DropsItem } from "../../lib/api";
import { Kpis, TituloPagina, type ItemKpi } from "../../components/v2/ui";
import { Deslizador, PanelFiltros, type CampoFiltro } from "../../components/v2/filtros";
import { TablaPro, type Fila } from "../../components/v2/TablaPro";
import { Conteo, md, useEsMovil } from "../../charts/textos";
import { AYUDA_MUNICIPIO, AYUDA_ZONA_REGIONAL, GRUPOS_CONSUMO_ORDEN } from "../../lib/negocio";
import { FichaCliente } from "../../components/v2/FichaCliente";
import { csvCelda, fmtMedida, fmtN, formatoTabla } from "../../lib/format";
import { useCorte } from "../../lib/useCorte";

/**
 * Réplica de la sección "Ranking gerencial" (app_ebsa_v2.py).
 *
 * La lista sale de /drops, que ya devuelve el top-N en el mismo orden que el original (primero lo
 * que hay que gestionar y, dentro de cada prioridad, de mayor a menor medida); los filtros de zona,
 * grupo, clase y municipio se mandan al servidor, igual que los aplica el Streamlit sobre su
 * DataFrame.
 *
 * Columnas: se muestran las que sirve /drops. No están disponibles (sin endpoint) ciclo_etiqueta,
 * estrato, cluster_id, severidad (se sirve la gravedad de negocio), consumo_promedio_semestral_kwh,
 * valor_facturado_mes, tipo_medidor_nombre ni tipo_lectura_nombre, y la columna `ranking` original
 * del archivo gerencial se sustituye por `puesto` (la posición en esta lista).
 */

type DropsData = Awaited<ReturnType<typeof api.drops>>;

/** Columnas de la tabla, en el orden del Streamlit (las que sirve /drops). */
const COLUMNAS = [
  "puesto",
  "NIU",
  "municipio",
  "zona_regional",
  "zona_nombre",
  "clase_servicio_nombre",
  "grupo_consumo",
  "gravedad",
  "trayectoria",
  "estado_en_lista",
  "consumo_anterior_kwh",
  "consumo_reciente_kwh",
  "perdida_kwh_mes",
  "tarifa_kwh",
  "valor_riesgo_mes",
  "referencia_kwh",
  "caida_pct",
];

const PIE =
  "Sin autogeneradores ni las clases área común, autoconsumos EBSA, distritos de riego y provisionales (regla de negocio). "
  + "El filtro de zona usa la zona regional: ciclo urbano, rural y seccionales juntos.";

/** Array vacío compartido: si se creara en cada render, el efecto de la lista se repetiría sin parar. */
const SIN_ELEGIR: string[] = [];

function aFila(item: DropsItem): Fila {
  return {
    puesto: item.puesto,
    NIU: item.niu,
    municipio: item.municipio,
    zona_regional: item.zona_regional,
    zona_nombre: item.ciclo,
    clase_servicio_nombre: item.clase,
    grupo_consumo: item.tamano,
    gravedad: item.gravedad,
    trayectoria: item.trayectoria,
    estado_en_lista: item.situacion,
    consumo_anterior_kwh: item.consumo_anterior_kwh,
    consumo_reciente_kwh: item.consumo_reciente_kwh,
    perdida_kwh_mes: item.perdida_kwh_mes,
    tarifa_kwh: item.tarifa_kwh,
    valor_riesgo_mes: item.valor_riesgo_mes,
    referencia_kwh: item.referencia_kwh,
    caida_pct: item.caida_pct,
  };
}

export function RankingGerencial({ token }: { token?: string | null }) {
  const { measure } = usePresentation();
  const corte = useCorte(token);
  const movil = useEsMovil();
  const [n, setN] = useState(100);
  const [valores, setValores] = useState<Record<string, string[]>>({});
  const [datos, setDatos] = useState<DropsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const zonasElegidas = valores.zona ?? SIN_ELEGIR;
  const municipiosElegidos = valores.municipio ?? SIN_ELEGIR;

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .drops(token, {
        medida: measure,
        n,
        zon: zonasElegidas,
        mun: municipiosElegidos,
        cla: valores.clase ?? SIN_ELEGIR,
        tam: valores.grupo ?? SIN_ELEGIR,
      })
      .then((respuesta) => {
        if (!cancelado) {
          setDatos(respuesta);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar el ranking.");
      });
    return () => {
      cancelado = true;
    };
  }, [token, measure, n, zonasElegidas, municipiosElegidos, valores]);

  // Municipios disponibles: si hay zona elegida, solo los de esa zona (AYUDA_MUNICIPIO).
  const municipios = useMemo(() => {
    const lista = datos?.opciones.municipios ?? [];
    return lista
      .filter((entrada) => !zonasElegidas.length || entrada.zonas.some((zona) => zonasElegidas.includes(zona)))
      .map((entrada) => entrada.municipio)
      .sort((a, b) => a.localeCompare(b));
  }, [datos, zonasElegidas]);

  const campos: CampoFiltro[] = [
    { key: "zona", etiqueta: "Zona regional", opciones: datos?.opciones.zonas ?? [], vacio: "Todas", ayuda: AYUDA_ZONA_REGIONAL },
    {
      key: "grupo",
      etiqueta: "Grupo de consumo",
      opciones: GRUPOS_CONSUMO_ORDEN.filter((grupo) => (datos?.opciones.tamanos ?? []).includes(grupo)),
      vacio: "Todos",
    },
    { key: "clase", etiqueta: "Clase de servicio", opciones: datos?.opciones.clases ?? [], vacio: "Todas" },
    { key: "municipio", etiqueta: "Municipio", opciones: municipios, vacio: "Todos", ayuda: AYUDA_MUNICIPIO },
  ];

  const colMedida = measure === "Consumo" ? "perdida_kwh_mes" : "valor_riesgo_mes";
  const filas = useMemo(() => (datos?.items ?? []).map(aFila), [datos]);
  const formato = formatoTabla(filas, COLUMNAS);

  const sumaTop = (datos?.items ?? []).reduce((total, item) => total + Number(item[colMedida] ?? 0), 0);
  const total = Number(datos?.resumen[colMedida] ?? 0);
  const kpis: ItemKpi[] = datos
    ? [
        {
          titulo: `Los ${fmtN(filas.length)} primeros concentran`,
          valor: fmtMedida(sumaTop, measure),
          unidad: "/mes",
          tono: "g",
        },
        {
          titulo: "Parte del total filtrado",
          valor: `${total ? ((sumaTop / total) * 100).toFixed(1) : "0.0"} %`,
          tono: "marca",
        },
        {
          titulo: measure === "Consumo" ? "Consumo filtrado" : "Valor filtrado",
          valor: fmtMedida(total, measure),
          unidad: "/mes",
          nota: `sobre ${fmtN(datos.resumen.clientes)} clientes`,
        },
      ]
    : [];

  const descarga = filas.length
    ? {
        nombre: "Descargar (CSV)",
        archivo: `ranking_gerencial_${corte || ""}.csv`,
        csv: [COLUMNAS.join(";"), ...filas.map((fila) => COLUMNAS.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n"),
      }
    : null;

  return (
    <div className="stack">
      <TituloPagina titulo={measure === "Consumo" ? "Ranking por consumo en riesgo" : "Ranking por valor en riesgo"} />

      {error && <p className="v2-caption">{error}</p>}

      <PanelFiltros
        campos={campos}
        valores={valores}
        onChange={(clave, valorFiltro) => setValores((actual) => ({ ...actual, [clave]: valorFiltro }))}
        alRestablecer={() => setN(100)}
        movil={movil}
        porFila={4}
        extra={<Deslizador etiqueta="Mostrar top" min={25} max={1000} step={25} valor={n} onChange={setN} />}
      />

      {!datos && !error ? <div className="empty-state cargando" role="status">Consultando el ranking…</div> : null}

      {datos && (
        <>
          <Kpis items={kpis} columnas={3} compacto />
          <Conteo
            mostrados={filas.length}
            filtrados={datos.resumen.clientes}
            enLista={datos.total_lista}
            universo={datos.evaluados}
            que="clientes de la lista"
            queLista="en toda la lista de caída"
            queUniverso="clientes evaluados por el detector"
          />
          <TablaPro
            filas={filas}
            columnas={COLUMNAS}
            formato={formato}
            prioritarias={["puesto", "NIU", "municipio", "zona_regional", "clase_servicio_nombre", "grupo_consumo", "gravedad", "trayectoria", "consumo_anterior_kwh", "consumo_reciente_kwh", colMedida]}
            movil={["puesto", "NIU", "municipio", "gravedad", "trayectoria", colMedida]}
            destacada={colMedida}
            que="clientes"
            descargar={descarga}
            ficha={(niu) => <FichaCliente niu={niu} token={token} />}
          />
          <p className="v2-caption">{md(PIE)}</p>
        </>
      )}
    </div>
  );
}
