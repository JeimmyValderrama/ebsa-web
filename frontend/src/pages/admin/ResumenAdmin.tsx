import { useEffect, useState } from "react";
import { usePresentation } from "../../app/Presentation";
import { api } from "../../lib/api";
import { Aviso, ComoLeer, Kpis, TablaSimple, Tarjeta, TituloPagina, type ItemKpi } from "../../components/v2/ui";
import { Barras } from "../../charts/Graficas";
import { md } from "../../charts/textos";
import { AZUL } from "../../charts/paleta";
import { fmtMedidaCorto, fmtN, formatoTabla, pesos } from "../../lib/format";
import { etiquetaCiclo } from "../../lib/negocio";
import {
  BAJADA_SEVERIDAD,
  NIVEL_FUGA_TEXTO,
  ORDEN_SEVERIDAD,
  QUE_ES_ESTO,
  TRAYECTORIA_TEXTO,
  periodoTexto,
} from "../../components/v2/textos";

/**
 * Réplica de la sección "Resumen" del administrador (app_ebsa_v2.py, seccion == "Resumen").
 *
 * Usa solo datos que la API ya sirve: /panorama (listas, prioridades, severidad, gravedad,
 * zonas, fuga y cortes), /drops por trayectoria (clientes y valor) y los datasets pequeños
 * (cycle_summary, list_entries_exits). Severidad igual al original: /panorama la agrupa con
 * clientes, kWh y valor. Desviación documentada por falta de endpoint: la tabla de estado en
 * lista muestra solo clientes (no kWh ni valor por estado) y se omite el aviso de "clientes sin
 * tarifa en el sistema comercial".
 */

type Panorama = Awaited<ReturnType<typeof api.panorama>>;
type FilaDataset = Record<string, unknown>;

/** Trayectorias del pronóstico que trae la lista (TRAYECTORIA_SIMPLE del Streamlit). */
const TRAYECTORIAS = ["CAIDA_ACELERANDO", "SIN_RECUPERACION_PREVISTA", "RECUPERACION_PREVISTA", "SIN_PRONOSTICO"];

const COLUMNAS_CICLO = [
  "ciclo_etiqueta",
  "zona_nombre",
  "n_clientes",
  "kwh_riesgo_mes",
  "n_criticos",
  "n_rural",
  "valor_riesgo_mes",
  "pct_del_total",
  "acumulado_pct",
];

export function ResumenAdmin({ token }: { token?: string | null }) {
  const { measure } = usePresentation();
  const [panorama, setPanorama] = useState<Panorama | null>(null);
  const [ciclos, setCiclos] = useState<FilaDataset[] | null>(null);
  const [entradas, setEntradas] = useState<FilaDataset | null>(null);
  const [trayectorias, setTrayectorias] = useState<Record<string, { clientes: number; valor: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    setError(null);
    api
      .panorama(token)
      .then((valor) => {
        if (!cancelado) setPanorama(valor);
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar el resumen.");
      });
    api
      .dataset(token, "cycle_summary", { limit: 100 })
      .then((pagina) => {
        if (!cancelado) setCiclos(pagina.items.map((item) => item.payload));
      })
      .catch(() => undefined);
    api
      .dataset(token, "list_entries_exits", { limit: 10 })
      .then((pagina) => {
        if (!cancelado) setEntradas(pagina.items.length ? pagina.items[pagina.items.length - 1].payload : null);
      })
      .catch(() => undefined);
    // El valor por trayectoria no está en /panorama: se pide una lista por trayectoria (los filtros se cachean en servidor).
    Promise.all(TRAYECTORIAS.map((codigo) => api.drops(token, { ten: [codigo], n: 25 })))
      .then((listas) => {
        if (cancelado) return;
        const mapa: Record<string, { clientes: number; valor: number }> = {};
        TRAYECTORIAS.forEach((codigo, indice) => {
          mapa[codigo] = { clientes: listas[indice].resumen.clientes, valor: listas[indice].resumen.valor_riesgo_mes };
        });
        setTrayectorias(mapa);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [token]);

  const kpis: ItemKpi[] = panorama
    ? [
        { titulo: "Clientes en la lista", valor: fmtN(panorama.lista.clientes), tono: "marca" },
        { titulo: "kWh/mes en riesgo", valor: fmtN(panorama.lista.perdida_kwh_mes) },
        {
          titulo: "Valor en riesgo / mes",
          valor: pesos(panorama.lista.valor_riesgo_mes),
          tono: "g",
          ayuda: "Pérdida de kWh × tarifa REAL de cada cliente. Los sin tarifa no se valoran.",
        },
        { titulo: "Ciclos con clientes", valor: ciclos ? fmtN(ciclos.length) : "—" },
      ]
    : [];

  const filasTrayectoria = trayectorias
    ? TRAYECTORIAS.map((codigo) => ({
        trayectoria: codigo,
        clientes: trayectorias[codigo].clientes,
        valor_mes: Math.round(trayectorias[codigo].valor),
      })).sort((a, b) => b.clientes - a.clientes)
    : [];

  const filasEstado = panorama
    ? Object.entries(panorama.estado_en_lista).map(([estado, clientes]) => ({ estado_en_lista: estado, clientes }))
    : [];

  const columnaMedida = measure === "Consumo" ? "kwh_mes" : "valor_riesgo_mes";
  // La tabla de ciclos de lectura usa kwh_riesgo_mes (no kwh_mes), como el _col_rc del original.
  const columnaMedidaCiclo = measure === "Consumo" ? "kwh_riesgo_mes" : "valor_riesgo_mes";
  const nombreMedida = measure === "Consumo" ? "kWh en riesgo / mes" : "Valor en riesgo / mes";
  const formatoMedida = (valor: unknown) => fmtMedidaCorto(Number(valor), measure);
  const filasZona = panorama
    ? Object.entries(panorama.por_zona)
        .map(([zona, valores]) => ({
          zona_regional: zona,
          clientes: valores.clientes,
          criticos: valores.gravedad.CRITICA ?? 0,
          kwh_mes: Math.round(valores.perdida_kwh_mes),
          valor_riesgo_mes: Math.round(valores.valor_riesgo_mes),
        }))
        .sort((a, b) => b[columnaMedida] - a[columnaMedida])
    : [];

  const filasCiclo = ciclos
    ? ciclos
        .map((fila) => ({
          ciclo_etiqueta: etiquetaCiclo(fila.ciclo_etiqueta),
          zona_nombre: etiquetaCiclo(fila.ciclo_etiqueta),
          n_clientes: fila.n_clientes,
          kwh_riesgo_mes: fila.kwh_riesgo_mes,
          n_criticos: fila.n_criticos,
          n_rural: fila.n_rural,
          valor_riesgo_mes: fila.valor_riesgo_mes,
          pct_del_total: fila.pct_del_total,
          acumulado_pct: fila.acumulado_pct,
        }))
        .sort((a, b) => Number(b[columnaMedidaCiclo] ?? 0) - Number(a[columnaMedidaCiclo] ?? 0))
    : [];

  // /panorama agrupa severidad con clientes, kWh y valor, igual que el groupby del original.
  const filasSeveridad = panorama
    ? ORDEN_SEVERIDAD.filter((nivel) => panorama.por_severidad[nivel] !== undefined).map((nivel) => ({
        severidad: nivel,
        clientes: panorama.por_severidad[nivel].clientes,
        kwh_mes: panorama.por_severidad[nivel].perdida_kwh_mes,
        valor_mes: panorama.por_severidad[nivel].valor_riesgo_mes,
      }))
    : [];

  return (
    <div className="stack">
      <TituloPagina titulo="Resumen del periodo facturado" bajada={panorama ? periodoTexto(panorama.cortes_zona) : undefined} />

      {error && <Aviso texto={error} tipo="alerta" />}
      {!panorama && !error && <div className="empty-state">Consultando el resumen del corte…</div>}

      {panorama && (
        <>
          <Kpis items={kpis} columnas={4} />

          <div className="fila-1-1">
            <Tarjeta titulo="¿Qué prevé el modelo para el mes siguiente?">
              {filasTrayectoria.length ? (
                <TablaSimple
                  columnas={["trayectoria", "clientes", "valor_mes"]}
                  filas={filasTrayectoria}
                  formato={formatoTabla(filasTrayectoria, ["trayectoria", "clientes", "valor_mes"])}
                />
              ) : (
                <div className="empty-state">Consultando el pronóstico por trayectoria…</div>
              )}
              <details className="v2-exp">
                <summary>Qué significa cada trayectoria</summary>
                <div className="v2-exp-cuerpo">
                  {Object.entries(TRAYECTORIA_TEXTO).map(([codigo, texto]) => (
                    <p key={codigo}>{md(`**${codigo}** — ${texto}`)}</p>
                  ))}
                </div>
              </details>
            </Tarjeta>

            <Tarjeta titulo="¿Es nuevo en la lista o lleva meses?">
              {filasEstado.length ? (
                <TablaSimple
                  columnas={["estado_en_lista", "clientes"]}
                  filas={filasEstado}
                  formato={formatoTabla(filasEstado, ["estado_en_lista", "clientes"])}
                />
              ) : (
                <div className="empty-state">Sin datos de estado en la lista.</div>
              )}
              <p className="v2-caption">NUEVO: primera vez. PERSISTENTE: también estaba el mes pasado. REINCIDENTE: estuvo en los últimos 12 meses.</p>
              {entradas && (
                <p>{md(`Frente al corte **${String(entradas.corte_anterior)}**: permanecen **${fmtN(Number(entradas.permanecen))}**, salieron **${fmtN(Number(entradas.salieron))}**, entraron **${fmtN(Number(entradas.entraron))}**.`)}</p>
              )}
            </Tarjeta>
          </div>

          <Tarjeta titulo="Riesgo de fuga a otro comercializador">
            <Kpis
              compacto
              items={[
                { titulo: "Clientes puntuados", valor: fmtN(panorama.fuga.clientes), tono: "marca" },
                { titulo: "Riesgo ALTO", valor: fmtN(panorama.fuga.por_nivel.ALTO ?? 0), tono: "alerta", ayuda: NIVEL_FUGA_TEXTO.ALTO },
                { titulo: "Riesgo MEDIO", valor: fmtN(panorama.fuga.por_nivel.MEDIO ?? 0), tono: "aviso", ayuda: NIVEL_FUGA_TEXTO.MEDIO },
                {
                  titulo: "Pérdida esperada / mes (ALTO+MEDIO)",
                  valor: pesos(panorama.fuga.perdida_esperada_mes),
                  ayuda: "Probabilidad de salida × lo que factura hoy (consumo promedio 6 meses × tarifa real).",
                },
              ]}
            />
            <p className="v2-caption">
              {md(
                `Ya atendidos por otro comercializador: **${fmtN(panorama.otro_comercializador)}** NIU en el archivo de la empresa `
                  + `(${fmtN(panorama.otro_comercializador_con_otro)} en el último mes del archivo). Detalle en la sección Riesgo de fuga.`,
              )}
            </p>
          </Tarjeta>

          <Tarjeta
            titulo="Dónde está el valor: zonas regionales"
            bajada="Zona regional = ciclo urbano + rural + seccionales de una misma dirección regional (quien decide las acciones en terreno)"
          >
            <div className="fila-1-1">
              <Barras
                serie={filasZona.map((fila) => [fila.zona_regional, Number(fila[columnaMedida] ?? 0)])}
                opciones={{ formato: formatoMedida, color: AZUL, nombreValor: nombreMedida, nombreCategoria: "Zona regional" }}
              />
              <TablaSimple
                columnas={["zona_regional", "clientes", "criticos", "kwh_mes", "valor_riesgo_mes"]}
                filas={filasZona}
                formato={formatoTabla(filasZona, ["zona_regional", "clientes", "criticos", "kwh_mes", "valor_riesgo_mes"])}
              />
            </div>
          </Tarjeta>

          {filasCiclo.length > 0 && (
            <Tarjeta titulo="Dónde está el valor: ciclos de lectura" plegable>
              <div className="stack">
                <Barras
                  serie={filasCiclo.map((fila) => [fila.zona_nombre, Number(fila[columnaMedidaCiclo] ?? 0)])}
                  opciones={{
                    formato: formatoMedida,
                    color: AZUL,
                    nombreValor: nombreMedida,
                    nombreCategoria: "Ciclo",
                    altoFila: 26,
                    maxEtiqueta: 230,
                  }}
                />
                <TablaSimple columnas={COLUMNAS_CICLO} filas={filasCiclo} formato={formatoTabla(filasCiclo, COLUMNAS_CICLO)} />
              </div>
            </Tarjeta>
          )}

          <Tarjeta titulo="Severidad" bajada={BAJADA_SEVERIDAD} plegable>
            {filasSeveridad.length ? (
              <TablaSimple
                columnas={["severidad", "clientes", "kwh_mes", "valor_mes"]}
                filas={filasSeveridad}
                formato={formatoTabla(filasSeveridad, ["severidad", "clientes", "kwh_mes", "valor_mes"])}
              />
            ) : (
              <div className="empty-state">Sin datos de severidad.</div>
            )}
          </Tarjeta>

          {panorama.cero_sostenido > 0 && (
            <p className="v2-caption">
              {md(
                `Fuera de la lista: ${fmtN(panorama.cero_sostenido)} clientes en cero sostenido (3+ meses en cero o casi cero; \`clientes_cero_sostenido.csv\`), `
                  + "autogeneradores y las clases AC, AU, RI y PR (`clientes_excluidos_de_gestion.csv`).",
              )}
            </p>
          )}

          <ComoLeer texto={QUE_ES_ESTO} titulo="Qué hace el sistema" />
        </>
      )}
    </div>
  );
}
