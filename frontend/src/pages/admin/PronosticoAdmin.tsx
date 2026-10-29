import { useEffect, useState } from "react";
import { api, type ExporteFila, type ProyectadoData } from "../../lib/api";
import { Aviso, Kpis, TablaSimple, Tarjeta, TituloPagina, type ItemKpi } from "../../components/v2/ui";
import { Barras, ColumnasTiempo } from "../../charts/Graficas";
import { EXPR_DEC1 } from "../../charts/vegaSpec";
import { md } from "../../charts/textos";
import { AZUL } from "../../charts/paleta";
import { fmtN, formatoTabla } from "../../lib/format";
import { GRUPO_CONSUMO_DESCRIPCION, GRUPOS_CONSUMO_ORDEN } from "../../lib/negocio";

/**
 * Réplica de la sección "Pronóstico 6 meses" del administrador (app_ebsa_v2.py,
 * seccion == "Pronóstico 6 meses").
 *
 * Usa solo datos que la API sirve: /panorama (el corte de datos de cada zona),
 * /proyectado (la suma del consumo proyectado por mes calendario), /exportes (los
 * archivos que dejó el pipeline por grupo, con sus clientes) y los datasets
 * forecast_profile_metrics, forecast_naive_comparison, forecast_model_selection,
 * model_versions y model_usage.
 *
 * Desviaciones documentadas por falta de endpoint servido:
 *  - Se omite el pie "N clientes con la regla de cero sostenido": se cuenta sobre la
 *    columna modelo_1m del archivo de predicciones, que la API no sirve.
 *  - El "Corte de datos" (urbano y rural) se toma de /panorama, que trae el mes
 *    facturado de cada zona (la misma fuente que cortes_zona del original).
 */

type Panorama = Awaited<ReturnType<typeof api.panorama>>;
type ExportesData = Awaited<ReturnType<typeof api.exportes>>;
type FilaDataset = Record<string, unknown>;

const COLUMNAS_PIVOTE = ["grupo_consumo", "1", "2", "3", "4", "5", "6"];
const COLUMNAS_INGENUOS = [
  "Meses adelante",
  "Error del modelo (%)",
  "Repetir el último mes (%)",
  "Promedio de 3 meses (%)",
  "Mismo mes del año anterior (%)",
  "Mejor pronóstico simple",
  "Ventaja del modelo (puntos)",
];

/** Los ingenuos vienen en código; así se llaman en la tabla del Streamlit. */
const NOMBRE_INGENUO: Record<string, string> = {
  persistencia: "repetir el último mes",
  media_3m: "promedio de 3 meses",
  media_12m: "promedio de 12 meses",
  mismo_mes_anio_anterior: "mismo mes del año anterior",
  cero: "cero",
};

const AYUDA_CORTE =
  "Urbanos: último mes completo. Rurales: último trimestre cerrado; "
  + "sus primeros meses pronosticados son meses que ya pasaron pero aún no tienen lectura.";

const AYUDA_WAPE =
  "WAPE %: error porcentual ponderado. 'Sin historia suficiente' no tiene modelo (solo línea base): su error "
  + "alto no es un fallo del sistema, es falta de historia. La columna WAPE_baseline_pct del archivo es la línea base "
  + "'mismo mes del año anterior'; la comparación contra pronósticos más simples está en la tabla de abajo.";

const AVISO_INGENUOS =
  "Error porcentual ponderado del backtest. La ventaja del modelo frente al mejor pronóstico simple es pequeña a un mes y "
  + "crece con el plazo; en clientes rurales el backtest a 1 y 2 meses es optimista (lecturas trimestrales repartidas), "
  + "y la cifra que vale para ellos es la del seguimiento en vivo. Detalle por zona y perfil: comparacion_ingenuos_backtest.csv "
  + "(lo genera evaluar_ingenuos_backtest.py).";

const PIE_GRUPOS =
  "Los archivos del pronóstico por grupo, con zona, clase de servicio y valor facturado, están en la sección "
  + "**Descargas por grupo**.";

/** Último registro de un modelo en el registro de uso (registro_uso.csv). */
function ultimoUso(uso: FilaDataset[], modelo: string): FilaDataset | null {
  const filas = uso.filter((fila) => String(fila.modelo ?? "") === modelo);
  return filas.length ? filas[filas.length - 1] : null;
}

export function PronosticoAdmin({ token }: { token?: string | null }) {
  const [panorama, setPanorama] = useState<Panorama | null>(null);
  const [proyectado, setProyectado] = useState<ProyectadoData | null>(null);
  const [exportes, setExportes] = useState<ExportesData | null>(null);
  const [metricas, setMetricas] = useState<FilaDataset[] | null>(null);
  const [ingenuos, setIngenuos] = useState<FilaDataset[] | null>(null);
  const [seleccion, setSeleccion] = useState<FilaDataset[] | null>(null);
  const [versiones, setVersiones] = useState<FilaDataset[] | null>(null);
  const [uso, setUso] = useState<FilaDataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .panorama(token)
      .then((valor) => {
        if (!cancelado) setPanorama(valor);
      })
      .catch(() => undefined);
    api
      .proyectado(token)
      .then((valor) => {
        if (!cancelado) setProyectado(valor);
      })
      .catch(() => undefined);
    api
      .exportes(token)
      .then((valor) => {
        if (!cancelado) setExportes(valor);
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar el pronóstico.");
      });
    const pedidos: Array<[string, (filas: FilaDataset[]) => void]> = [
      ["forecast_profile_metrics", setMetricas],
      ["forecast_naive_comparison", setIngenuos],
      ["forecast_model_selection", setSeleccion],
      ["model_versions", setVersiones],
      ["model_usage", setUso],
    ];
    pedidos.forEach(([key, guardar]) => {
      api
        .dataset(token, key, { limit: 500 })
        .then((pagina) => {
          if (!cancelado) guardar(pagina.items.map((item) => item.payload));
        })
        .catch(() => {
          if (!cancelado) guardar([]);
        });
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const pronostico: ExporteFila[] = (exportes?.productos ?? []).find((producto) => producto.producto === "pronostico_6_meses")?.filas ?? [];
  const usoPron = uso ? ultimoUso(uso, "pronostico") : null;

  // El índice de exportes trae una fila "Todos" (el archivo completo) además de las de cada
  // grupo: sumar todas las filas duplica el total (1.158.802 en vez de 579.401). Se cuenta la
  // de "Todos", que es exactamente len(pred6) del original, o si no está, la suma de los grupos
  // (que da el mismo número porque los grupos parten el mismo archivo).
  const esTodos = (fila: ExporteFila): boolean => String(fila.grupo_consumo ?? "").trim().toLowerCase() === "todos";
  const clientesPronosticados = pronostico.some(esTodos)
    ? pronostico.filter(esTodos).reduce((suma, fila) => suma + Number(fila.clientes ?? 0), 0)
    : pronostico.reduce((suma, fila) => suma + Number(fila.clientes ?? 0), 0);

  // Corte facturado de cada zona, en el orden alfabético del groupby del original (rural, urbano).
  const corteDatos = panorama
    ? Object.keys(panorama.cortes_zona)
        .sort()
        .map((zona) => `${zona.toLowerCase()} ${panorama.cortes_zona[zona]}`)
        .join(" · ")
    : "—";

  const kpis: ItemKpi[] = [
    { titulo: "Clientes pronosticados", valor: fmtN(clientesPronosticados), tono: "marca" },
    { titulo: "Corte de datos", valor: corteDatos, texto: true, ayuda: AYUDA_CORTE },
    { titulo: "Modelo entrenado con corte", valor: usoPron ? String(usoPron.fecha_corte_modelo ?? "—") : "—", texto: true },
    { titulo: "Modo de la última corrida", valor: usoPron ? String(usoPron.modo ?? "—") : "—", texto: true },
  ];

  // Pivot de la precisión por grupo y horizonte (WAPE %), en el orden de GRUPOS_CONSUMO_ORDEN.
  const filasPivote = GRUPOS_CONSUMO_ORDEN.map((grupo) => {
    const fila: Record<string, unknown> = { grupo_consumo: grupo };
    COLUMNAS_PIVOTE.slice(1).forEach((horizonte) => {
      const registro = (metricas ?? []).find(
        (item) => String(item.grupo_consumo ?? "") === grupo && String(item.horizonte ?? "") === horizonte,
      );
      fila[horizonte] = registro ? Math.round(Number(registro.WAPE_final_pct ?? 0) * 10) / 10 : null;
    });
    return fila;
  }).filter((fila) => COLUMNAS_PIVOTE.slice(1).some((horizonte) => fila[horizonte] !== null));

  // El modelo frente a los pronósticos simples: solo la fila de todos los clientes y todos los perfiles.
  const filasIngenuos = (ingenuos ?? [])
    .filter((fila) => String(fila.zona ?? "") === "TODOS" && String(fila.perfil ?? "") === "TODOS")
    .sort((a, b) => Number(a.horizonte ?? 0) - Number(b.horizonte ?? 0))
    .map((fila) => ({
      "Meses adelante": Number(fila.horizonte ?? 0),
      "Error del modelo (%)": redondea1(fila.WAPE_modelo_final_pct),
      "Repetir el último mes (%)": redondea1(fila.WAPE_ingenuo_persistencia_pct),
      "Promedio de 3 meses (%)": redondea1(fila.WAPE_ingenuo_media_3m_pct),
      "Mismo mes del año anterior (%)": redondea1(fila.WAPE_ingenuo_mismo_mes_anio_anterior_pct),
      "Mejor pronóstico simple": NOMBRE_INGENUO[String(fila.mejor_ingenuo ?? "")] ?? String(fila.mejor_ingenuo ?? "—"),
      "Ventaja del modelo (puntos)": redondea1(fila.mejora_vs_mejor_ingenuo_pp),
    }));

  // Consumo proyectado por mes: la tabla de al lado del gráfico (kWh exactos, con la columna
  // llamada "kWh" como en el original) y el pie con el corte por zona (CORTE_ZONA sale de
  // cortes_zona, la misma fuente que /panorama).
  const filasMes = (proyectado?.meses ?? []).map((fila) => ({ mes: fila.mes, kWh: fila.kwh }));
  const pieCorteZona =
    proyectado && panorama && Object.keys(panorama.cortes_zona ?? {}).length
      ? `Urbanos pronosticados desde ${panorama.cortes_zona.URBANO ?? "—"}; rurales desde ${panorama.cortes_zona.RURAL ?? "—"} `
        + "(los meses rurales ya pasados se rellenan con el pronóstico hasta que llegue la lectura trimestral)."
      : "";

  // Clientes por grupo: los archivos de pronóstico del índice parten el archivo por grupo.
  const filasGrupos = GRUPOS_CONSUMO_ORDEN.map((grupo) => ({
    grupo_consumo: grupo,
    clientes: pronostico.filter((fila) => String(fila.grupo_consumo ?? "") === grupo).reduce((suma, fila) => suma + Number(fila.clientes ?? 0), 0),
  })).filter((fila) => fila.clientes > 0);

  if (error) return <Aviso texto={error} tipo="alerta" />;

  return (
    <div className="stack">
      <TituloPagina titulo="Pronóstico de consumo a 6 meses" />

      <Kpis items={kpis} compacto />

      {proyectado?.meses.length ? (
        <Tarjeta titulo="Consumo total proyectado por mes">
          <div className="fila-2-1">
            <div className="stack">
              <ColumnasTiempo
                serie={proyectado.meses.map((fila) => [fila.mes, fila.kwh / 1e6])}
                opciones={{
                  color: AZUL,
                  nombreValor: "Consumo proyectado",
                  alto: 260,
                  formato: (valor) => `${fmtN(valor, 2)} GWh`,
                  ejeExpr: EXPR_DEC1,
                }}
              />
              <p className="v2-caption">{md("Gráfico en GWh (millones de kWh); la tabla trae los kWh exactos.")}</p>
            </div>
            <TablaSimple
              columnas={["mes", "kWh"]}
              filas={filasMes}
              formato={formatoTabla(filasMes, ["mes", "kWh"])}
            />
          </div>
          {proyectado.omitidos > 0 ? (
            <p className="v2-caption">
              {`Se omiten ${proyectado.omitidos} mes(es) de los extremos que solo traen una de las dos zonas (urbana o rural): su total no es comparable.`}
            </p>
          ) : null}
          {pieCorteZona ? <p className="v2-caption">{pieCorteZona}</p> : null}
        </Tarjeta>
      ) : null}

      {filasPivote.length ? (
        <Tarjeta
          titulo="Precisión esperada (backtest) por grupo de consumo y horizonte"
          bajada="Error porcentual ponderado (WAPE %); columnas = meses adelante"
        >
          <TablaSimple
            columnas={COLUMNAS_PIVOTE}
            filas={filasPivote}
            formato={formatoBacktest(filasPivote, COLUMNAS_PIVOTE, COLUMNAS_PIVOTE.slice(1))}
          />
          <p className="v2-caption">{md(AYUDA_WAPE)}</p>
          <p className="v2-pie">
            {md(GRUPOS_CONSUMO_ORDEN.map((grupo) => `**${grupo}**: ${GRUPO_CONSUMO_DESCRIPCION[grupo] ?? ""}`).join(" · "))}
          </p>
        </Tarjeta>
      ) : null}

      {filasIngenuos.length ? (
        <Tarjeta titulo="El modelo frente a pronósticos simples (sin modelo)">
          <TablaSimple
            columnas={COLUMNAS_INGENUOS}
            filas={filasIngenuos}
            formato={formatoBacktest(
              filasIngenuos,
              COLUMNAS_INGENUOS,
              COLUMNAS_INGENUOS.filter((columna) => columna !== "Meses adelante" && columna !== "Mejor pronóstico simple"),
            )}
          />
          <Aviso texto={AVISO_INGENUOS} tipo="limite" />
        </Tarjeta>
      ) : null}

      {seleccion && seleccion.length ? (
        <details className="v2-exp">
          <summary>Qué algoritmo usa cada grupo</summary>
          <div className="v2-exp-cuerpo">
            <TablaSimple
              columnas={Object.keys(seleccion[0])}
              filas={seleccion}
              formato={formatoTabla(seleccion, Object.keys(seleccion[0]))}
            />
          </div>
        </details>
      ) : null}

      {versiones && versiones.length ? (
        <details className="v2-exp">
          <summary>Versiones de los modelos (12_versiones_modelos)</summary>
          <div className="v2-exp-cuerpo">
            <TablaSimple
              columnas={Object.keys(versiones[0])}
              filas={versiones}
              formato={formatoTabla(versiones, Object.keys(versiones[0]))}
            />
            {uso && uso.length ? (
              <>
                <p className="v2-pie">{md("Qué versión usó cada corte:")}</p>
                <TablaSimple columnas={Object.keys(uso[0])} filas={uso} formato={formatoTabla(uso, Object.keys(uso[0]))} />
              </>
            ) : null}
          </div>
        </details>
      ) : null}

      {filasGrupos.length ? (
        <Tarjeta titulo="Clientes por grupo de consumo" plegable>
          <div className="fila-1-2">
            <Barras
              serie={filasGrupos.map((fila) => [String(fila.grupo_consumo), Number(fila.clientes)])}
              opciones={{ color: AZUL, nombreValor: "Clientes", nombreCategoria: "Grupo de consumo", altoFila: 34 }}
            />
            <TablaSimple
              columnas={["grupo_consumo", "clientes"]}
              filas={filasGrupos}
              formato={formatoTabla(filasGrupos, ["grupo_consumo", "clientes"])}
            />
          </div>
          <p className="v2-caption">{md(PIE_GRUPOS)}</p>
        </Tarjeta>
      ) : null}

      {!exportes && !error ? <div className="empty-state">Consultando los archivos del pronóstico…</div> : null}
    </div>
  );
}

/**
 * Celdas numéricas con los decimales del original: estas dos tablas se piden con .round(1) y
 * st.dataframe las pinta tal cual (44,1 / 15,3), mientras que formatoTabla por defecto deja
 * enteros porque fmtN arranca en 0 decimales. Las columnas enteras (meses adelante) van sin decimal.
 */
function formatoBacktest(
  filas: Array<Record<string, unknown>>,
  columnas: string[],
  conDecimal: string[],
): (valor: unknown, columna: string) => string {
  const base = formatoTabla(filas, columnas);
  return (valor, columna) => {
    if (typeof valor === "number" && Number.isFinite(valor)) return fmtN(valor, conDecimal.includes(columna) ? 1 : 0);
    return base(valor, columna);
  };
}

/** round(1) del Streamlit: un decimal para las cifras de backtest. */
function redondea1(valor: unknown): number | null {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 10) / 10 : null;
}
