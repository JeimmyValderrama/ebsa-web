import { useEffect, useMemo, useState } from "react";
import { api, type FugaData } from "../../lib/api";
import { Aviso, Encabezado, Kpis, TablaSimple, Tarjeta, TituloPagina, type ItemKpi } from "../../components/v2/ui";
import { PanelFiltros, type CampoFiltro } from "../../components/v2/filtros";
import { TablaPro, type Fila } from "../../components/v2/TablaPro";
import { FichaCliente } from "../../components/v2/FichaCliente";
import { Barras, BarrasApiladas } from "../../charts/Graficas";
import { Conteo, md, useEsMovil } from "../../charts/textos";
import { AZUL, NARANJA } from "../../charts/paleta";
import { csvCelda, fmtN, formatoTabla, pesos } from "../../lib/format";
import {
  AYUDA_MUNICIPIO,
  AYUDA_ZONA_REGIONAL,
  ESTADO_OTRO_TEXTO,
  GRUPO_CONSUMO_DESCRIPCION,
  GRUPOS_CONSUMO_ORDEN,
} from "../../lib/negocio";
import { NIVEL_FUGA_TEXTO } from "../../components/v2/textos";

/**
 * Réplica de la sección "Riesgo de fuga a otro comercializador" del administrador
 * (app_ebsa_v2.py, seccion == "Riesgo de fuga") con sus seis pestañas: Lista,
 * Por zona y grupo, Ya con otro comercializador, Vigilancia no regulados,
 * Calidad del modelo y Seguimiento.
 *
 * Usa solo datos que la API ya sirve: /fuga (lista filtrada, municipios y vigilancia),
 * /panorama (los KPIs de nivel y pérdida esperada de toda la lista, sin filtrar) y los
 * datasets churn_* de la misma corrida (churn_managerial, churn_zone_summary,
 * churn_group_summary, churn_other_supplier, churn_left_profiles, churn_non_regulated,
 * churn_metrics, churn_feature_importance y churn_followup).
 *
 * Desviaciones documentadas por falta de endpoint servido:
 *  - Las columnas estrato, consumo_actual_kwh, consumo_prom_12m_kwh, variacion_3m_vs_12m_pct,
 *    meses_cero_3m, meses_consecutivos_en_lista, tarifa_kwh, consumo_promedio_semestral_kwh,
 *    tipo_medidor_nombre y tipo_lectura_nombre se cruzan desde churn_managerial: ese archivo
 *    gerencial solo trae los niveles ALTO y MEDIO (2.301 clientes), así que si el filtro
 *    incluye BAJO esas columnas quedan en "—"; el resto de la tabla sale de /fuga, que sí
 *    tiene los 46.026 clientes puntuados.
 *  - El orden "Probabilidad de salida" se aplica en el navegador sobre los primeros 1.000 de
 *    /fuga; la descarga del CSV la ordena el servidor por pérdida esperada (medida Facturación).
 *  - El CSV de la pestaña "Ya con otro comercializador" y el de la vigilancia se arman en el
 *    navegador con las columnas que se ven en pantalla (el Streamlit exportaba el DataFrame
 *    completo, con el comercializador y el titular que no se pueden mostrar).
 *  - Las pestañas se cargan al abrirse (una petición por dataset) en vez de todas de golpe.
 */

type Panorama = Awaited<ReturnType<typeof api.panorama>>;
type FilaDataset = Record<string, unknown>;

/** Pestañas del Streamlit, en el mismo orden (st.tabs). */
const PESTANAS = [
  "Lista",
  "Por zona y grupo",
  "Ya con otro comercializador",
  "Vigilancia no regulados",
  "Calidad del modelo",
  "Seguimiento",
];

/** Opciones del radio "Ordenar por" (fuga_orden). */
const ORDENES = ["Pérdida esperada (probabilidad × valor)", "Probabilidad de salida"];

const DEFECTO: Record<string, string[]> = { niv: ["ALTO", "MEDIO"], zon: [], mun: [], cla: [], tam: [] };
const DEFECTO_OTRO: Record<string, string[]> = { est: [], mun: [] };

/** Columnas de la lista, en el mismo orden que las pide el Streamlit. */
const COLUMNAS = [
  "ranking",
  "NIU",
  "nivel_riesgo",
  "prob_fuga_6m",
  "valor_esperado_perdida_mes",
  "valor_en_riesgo_mes",
  "municipio",
  "zona_regional",
  "zona_nombre",
  "clase_servicio_nombre",
  "grupo_consumo",
  "estrato",
  "consumo_actual_kwh",
  "consumo_prom_6m_kwh",
  "consumo_prom_12m_kwh",
  "variacion_3m_vs_12m_pct",
  "meses_cero_3m",
  "senales",
  "estado_en_lista",
  "meses_consecutivos_en_lista",
  "tarifa_kwh",
  "consumo_promedio_semestral_kwh",
  "tipo_medidor_nombre",
  "tipo_lectura_nombre",
];

/** Columnas de churn_zone_summary y churn_group_summary. */
const COLUMNAS_ZONA = [
  "ciclo",
  "zona_nombre",
  "clientes_puntuados",
  "riesgo_alto",
  "riesgo_medio",
  "valor_esperado_perdida_mes",
  "zona_regional",
];
const COLUMNAS_GRUPO = [
  "grupo_consumo",
  "clientes_puntuados",
  "riesgo_alto",
  "riesgo_medio",
  "prob_media",
  "valor_esperado_perdida_mes",
];

/** Columnas de "Ya con otro comercializador" (churn_other_supplier), sin comercializador ni titular. */
const COLUMNAS_OTRO = [
  "NIU",
  "estado",
  "municipio",
  "primer_mes_otro",
  "ultimo_mes_otro",
  "mes_salida",
  "fuente_salida",
  "zona_nombre",
  "clase_servicio_nombre",
  "estrato",
  "consumo_prom_6m_antes_salida_kwh",
  "consumo_prom_otro_kwh",
  "tarifa_kwh",
  "valor_facturado_antes_salida_mes",
  "nivel_tension",
];

/** Columnas de la vigilancia (churn_non_regulated + el municipio del TC1). */
const COLUMNAS_VIGILANCIA = [
  "NIU",
  "motivo",
  "estado",
  "nivel_riesgo",
  "prob_fuga_6m",
  "municipio",
  "zona_nombre",
  "clase_servicio_nombre",
  "grupo_consumo",
  "consumo_actual_kwh",
  "consumo_prom_6m_kwh",
  "consumo_prom_12m_kwh",
  "tarifa_kwh",
  "valor_facturado_mes",
  "senales",
  "fecha_corte",
];

/** Columnas de churn_metrics y churn_followup (tabla() del Streamlit). */
const COLUMNAS_METRICAS = [
  "conjunto",
  "n_filas",
  "n_positivos",
  "AUC",
  "precision_promedio",
  "precision_top50_pct",
  "recall_top50_pct",
  "lift_top50",
  "precision_top100_pct",
  "recall_top100_pct",
  "lift_top100",
  "precision_top200_pct",
  "recall_top200_pct",
  "lift_top200",
  "precision_top500_pct",
  "recall_top500_pct",
  "lift_top500",
];
const COLUMNAS_SEGUIMIENTO = [
  "fecha_corte_lista",
  "nivel_riesgo",
  "clientes_senalados",
  "salieron_en_ventana",
  "pct_salieron",
  "meses_transcurridos",
  "ventana_completa",
  "observable",
  "salidas_conocidas_hasta",
  "evaluado_en_corte",
];

const NO_REGULADO =
  "Clientes en el ciclo 33 (USUARIOS NO REGULADOS), con clase IR (NO REGULADO) o con consumo promedio "
  + "≥ 55.000 kWh/mes: por tamaño pueden negociar con cualquier comercializador. Se puntúan con el mismo "
  + "modelo pero **no entran al ranking ni a las listas**: su seguimiento es comercial, no de cuadrilla. "
  + "El nivel sale solo de la probabilidad (ALTO ≥ 5 × tasa base, MEDIO ≥ 2 ×).";

const AVISO_CALIDAD =
  "Con unos 80 clientes que se han ido, el modelo no ordena mejor que listar a los clientes por tamaño (consumo de 12 meses). "
  + "Las probabilidades sirven para priorizar contactos, no para afirmar quién se va.";

const PIE_FUGA =
  "Se puntúan los clientes de las clases de servicio que aparecen entre los que ya se fueron "
  + "(comercial, industrial, oficial, acueductos), sin alumbrado, provisionales ni autogeneradores. "
  + "Probabilidad de salida en los próximos 6 meses; el valor es lo que factura hoy con su tarifa real. "
  + "El mercado no regulado (ciclo 33, clase IR o ≥ 55.000 kWh/mes) se puntúa aparte y solo aparece en "
  + "la pestaña **Vigilancia no regulados**, nunca en este ranking.";

/** Carga un dataset completo por páginas de 2.000 filas (el tope del endpoint de datasets). */
async function cargarDataset(token: string | undefined, key: string): Promise<FilaDataset[]> {
  const filas: FilaDataset[] = [];
  let offset = 0;
  for (;;) {
    const pagina = await api.dataset(token, key, { limit: 2000, offset });
    filas.push(...pagina.items.map((item) => item.payload));
    offset += pagina.items.length;
    if (!pagina.items.length || offset >= pagina.total) break;
  }
  return filas;
}

/** Carga un dataset completo y devuelve sus payloads (null mientras carga, [] si está vacío). */
function useDataset(token: string | null | undefined, key: string): FilaDataset[] | null {
  const [filas, setFilas] = useState<FilaDataset[] | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    cargarDataset(token, key)
      .then((resultado) => {
        if (!cancelado) setFilas(resultado);
      })
      .catch(() => {
        if (!cancelado) setFilas([]);
      });
    return () => {
      cancelado = true;
    };
  }, [token, key]);
  return filas;
}

/** Formato de mes corto "2025-12-01" → "2025-12" (fecha_corta del Streamlit). */
function fechaCorta(valor: unknown): string {
  const texto = String(valor ?? "");
  return texto ? texto.slice(0, 7) : "—";
}

/** CSV en español de las columnas que se ven en pantalla (csv_es). */
function csvDe(columnas: string[], filas: Fila[]): string {
  return [columnas.join(";"), ...filas.map((fila) => columnas.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n");
}

export function FugaAdmin({ token }: { token?: string | null }) {
  const movil = useEsMovil();
  const [pestana, setPestana] = useState(PESTANAS[0]);
  const [datos, setDatos] = useState<FugaData | null>(null);
  const [gerencial, setGerencial] = useState<FilaDataset | null>(null);
  const [valores, setValores] = useState<Record<string, string[]>>({ ...DEFECTO });
  const [orden, setOrden] = useState(ORDENES[0]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  // KPIs globales del riesgo de fuga (sin los filtros de la tabla).
  const [panorama, setPanorama] = useState<Panorama | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    api
      .fuga(token ?? undefined, {
        // La lista del administrador se ordena siempre por pérdida esperada en pesos, como el original.
        medida: "Facturación",
        n: 1000,
        niv: valores.niv?.length ? valores.niv : undefined,
        zon: valores.zon?.length ? valores.zon : undefined,
        mun: valores.mun?.length ? valores.mun : undefined,
        cla: valores.cla?.length ? valores.cla : undefined,
        tam: valores.tam?.length ? valores.tam : undefined,
      })
      .then((respuesta) => {
        if (cancelado) return;
        setDatos(respuesta);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar el riesgo de fuga.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token, valores]);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .panorama(token)
      .then((valor) => {
        if (!cancelado) setPanorama(valor);
      })
      .catch(() => undefined);
    // churn_managerial es el archivo gerencial de la fuga: trae las columnas de detalle y el método del modelo.
    cargarDataset(token, "churn_managerial")
      .then((filas) => {
        if (cancelado || !filas.length) return;
        setGerencial(filas[0]);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [token]);

  const corte = datos?.corte ?? "";
  const { zon } = valores;
  const permitidos = useMemo(
    () =>
      new Set(
        (datos?.opciones.municipios ?? [])
          .filter((fila) => zon.length === 0 || fila.zonas.some((z) => zon.includes(z)))
          .map((fila) => fila.municipio),
      ),
    [datos, zon],
  );

  const cambiarFiltro = (clave: string, valor: string[]): void => {
    setValores((actual) => {
      const siguiente = { ...actual, [clave]: valor };
      if (clave === "zon") {
        // Al cambiar la zona, los municipios que ya no quedan disponibles se quitan de la selección.
        const elegidas = new Set(valor);
        const validos = new Set(
          (datos?.opciones.municipios ?? [])
            .filter((fila) => elegidas.size === 0 || fila.zonas.some((z) => elegidas.has(z)))
            .map((fila) => fila.municipio),
        );
        siguiente.mun = (actual.mun ?? []).filter((municipio) => validos.has(municipio));
      }
      return siguiente;
    });
  };

  const filas: Fila[] = useMemo(() => {
    if (!datos) return [];
    const detalle = gerencial ?? {};
    const base = datos.items.map((item) => ({
      ranking: item.ranking,
      NIU: item.niu,
      nivel_riesgo: item.riesgo,
      prob_fuga_6m: item.prob,
      valor_esperado_perdida_mes: item.valor_esperado,
      valor_en_riesgo_mes: item.valor_riesgo,
      municipio: item.municipio || "—",
      zona_regional: item.zona_regional || "—",
      zona_nombre: item.ciclo || "—",
      clase_servicio_nombre: item.clase || "—",
      grupo_consumo: item.tamano,
      estrato: detalle.estrato ?? null,
      consumo_actual_kwh: detalle.consumo_actual_kwh ?? null,
      consumo_prom_6m_kwh: detalle.consumo_prom_6m_kwh ?? item.consumo_6m,
      consumo_prom_12m_kwh: detalle.consumo_prom_12m_kwh ?? null,
      variacion_3m_vs_12m_pct: detalle.variacion_3m_vs_12m_pct ?? null,
      meses_cero_3m: detalle.meses_cero_3m ?? null,
      senales: item.senales,
      estado_en_lista: item.situacion,
      meses_consecutivos_en_lista: detalle.meses_consecutivos_en_lista ?? null,
      tarifa_kwh: detalle.tarifa_kwh ?? null,
      consumo_promedio_semestral_kwh: detalle.consumo_promedio_semestral_kwh ?? null,
      tipo_medidor_nombre: detalle.tipo_medidor_nombre ?? null,
      tipo_lectura_nombre: detalle.tipo_lectura_nombre ?? null,
    }));
    // Orden del radio: el servidor ya ordena por pérdida esperada; solo hay que reordenar por probabilidad.
    return orden.startsWith("Probabilidad")
      ? [...base].sort((a, b) => Number(b.prob_fuga_6m ?? 0) - Number(a.prob_fuga_6m ?? 0))
      : base;
  }, [datos, gerencial, orden]);

  const campos: CampoFiltro[] = [
    { key: "niv", etiqueta: "Nivel de riesgo", opciones: ["ALTO", "MEDIO", "BAJO"], defecto: DEFECTO.niv, vacio: "Todos" },
    {
      key: "zon",
      etiqueta: "Zona regional",
      opciones: datos?.opciones.zonas ?? [],
      vacio: "Todas",
      ayuda: AYUDA_ZONA_REGIONAL,
      visible: (datos?.opciones.zonas.length ?? 0) > 0,
    },
    {
      key: "tam",
      etiqueta: "Grupo de consumo",
      opciones: GRUPOS_CONSUMO_ORDEN.filter((grupo) => (datos?.opciones.tamanos ?? []).includes(grupo)),
      vacio: "Todos",
    },
    { key: "cla", etiqueta: "Clase de servicio", opciones: datos?.opciones.clases ?? [], vacio: "Todas" },
    { key: "mun", etiqueta: "Municipio", opciones: [...permitidos].sort(), vacio: "Todos", ayuda: AYUDA_MUNICIPIO },
  ];

  const kpis: ItemKpi[] = panorama
    ? [
        // El Streamlit pone len(fuga): todos los puntuados por el modelo, BAJO incluido.
        { titulo: "Clientes puntuados", valor: fmtN(panorama.fuga.clientes), tono: "marca" },
        { titulo: "Riesgo ALTO", valor: fmtN(panorama.fuga.por_nivel.ALTO ?? 0), tono: "alerta" },
        { titulo: "Riesgo MEDIO", valor: fmtN(panorama.fuga.por_nivel.MEDIO ?? 0), tono: "aviso" },
        { titulo: "Pérdida esperada / mes", valor: pesos(panorama.fuga.perdida_esperada_mes), tono: "g" },
        {
          titulo: "Corte · modelo",
          valor: `${corte || "—"} · ${fechaCorta(gerencial?.fecha_corte_modelo)}`,
          ayuda: `Método: ${gerencial?.metodo ? String(gerencial.metodo) : "—"}`,
          texto: true,
        },
      ]
    : [];

  const formato = formatoTabla(filas, COLUMNAS);

  const descargarLista = (): void => {
    setErrorDescarga(null);
    api
      .fugaCsv(token ?? undefined, {
        medida: "Facturación",
        niv: valores.niv?.length ? valores.niv : undefined,
        zon: valores.zon?.length ? valores.zon : undefined,
        mun: valores.mun?.length ? valores.mun : undefined,
        cla: valores.cla?.length ? valores.cla : undefined,
        tam: valores.tam?.length ? valores.tam : undefined,
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `riesgo_fuga_${corte}.csv`;
        enlace.click();
        URL.revokeObjectURL(url);
      })
      .catch((cause: unknown) => setErrorDescarga(cause instanceof Error ? cause.message : "No fue posible descargar la lista."));
  };

  return (
    <div className="stack">
      <TituloPagina titulo="Riesgo de fuga a otro comercializador" />

      {error && <Aviso texto={error} tipo="alerta" />}
      {!datos && !error && <div className="empty-state">Consultando el riesgo de fuga del corte vigente…</div>}

      {datos && datos.total_lista === 0 && (
        <Aviso texto="No existe riesgo_fuga_clientes.csv. Corre el pipeline (paso 14) y vuelve a abrir la página." tipo="alerta" />
      )}

      {datos && datos.total_lista > 0 && (
        <>
          <Kpis items={kpis} columnas={5} compacto />

          <div className="admin-tabs" role="tablist">
            {PESTANAS.map((nombre) => (
              <button
                key={nombre}
                type="button"
                role="tab"
                aria-selected={pestana === nombre}
                className={pestana === nombre ? "admin-tab active" : "admin-tab"}
                onClick={() => setPestana(nombre)}
              >
                {nombre}
              </button>
            ))}
          </div>

          {pestana === PESTANAS[0] && (
            <>
              <PanelFiltros
                campos={campos}
                valores={valores}
                onChange={cambiarFiltro}
                movil={movil}
                porFila={5}
                extra={
                  <div className="campo">
                    <span>Ordenar por</span>
                    <div className="v2-radio" role="radiogroup" aria-label="Ordenar por">
                      {ORDENES.map((opcion) => (
                        <button
                          key={opcion}
                          type="button"
                          role="radio"
                          aria-checked={orden === opcion}
                          className={orden === opcion ? "activo" : ""}
                          onClick={() => setOrden(opcion)}
                        >
                          {opcion}
                        </button>
                      ))}
                    </div>
                  </div>
                }
                alRestablecer={() => setOrden(ORDENES[0])}
              />

              <p className="v2-conteo">
                <b>{fmtN(datos.resumen.clientes)}</b> clientes · pérdida esperada <b>{pesos(datos.resumen.valor_esperado)}/mes</b> ·
                facturación en juego <b>{pesos(datos.resumen.valor_riesgo)}/mes</b>
              </p>

              <Conteo
                mostrados={Math.min(filas.length, 1000)}
                filtrados={datos.filtrados}
                enLista={datos.alto_medio}
                universo={datos.total_lista}
                que="clientes"
                queLista="con riesgo ALTO o MEDIO en total"
                queUniverso="clientes puntuados por el modelo"
              />

              <div>
                <button type="button" className="ghost-button" onClick={descargarLista} title="La lista filtrada completa, no solo la tabla">
                  Descargar lo filtrado (CSV)
                </button>
                {errorDescarga ? <p className="v2-pie">{errorDescarga}</p> : null}
              </div>

              <TablaPro
                filas={filas}
                columnas={COLUMNAS}
                formato={formato}
                prioritarias={[
                  "ranking",
                  "NIU",
                  "nivel_riesgo",
                  "prob_fuga_6m",
                  "valor_esperado_perdida_mes",
                  "valor_en_riesgo_mes",
                  "municipio",
                  "clase_servicio_nombre",
                  "grupo_consumo",
                  "senales",
                  "estado_en_lista",
                ]}
                movil={["ranking", "NIU", "nivel_riesgo", "prob_fuga_6m", "valor_esperado_perdida_mes", "senales"]}
                destacada="valor_esperado_perdida_mes"
                que="clientes"
                columnaId="NIU"
                ordenNumerico={{
                  prob_fuga_6m: filas.map((fila) => Number(fila.prob_fuga_6m ?? 0)),
                  ranking: filas.map((fila) => Number(fila.ranking ?? 0)),
                }}
                ficha={(niu) => <FichaCliente token={token} niu={niu} />}
              />

              <details className="v2-exp" open={!movil}>
                <summary>Qué significa cada nivel</summary>
                <div className="v2-exp-cuerpo">
                  {Object.entries(NIVEL_FUGA_TEXTO).map(([clave, texto]) => (
                    <p key={clave}>{md(`**${clave}** — ${texto}`)}</p>
                  ))}
                  <p>
                    {md(
                      "**Señales** — resumen en texto de por qué el modelo lo pone arriba: caída reciente, meses en cero, "
                      + "zona con más salidas, tamaño. **estado_en_lista** — NUEVO / PERSISTENTE / REINCIDENTE frente a los cortes anteriores.",
                    )}
                  </p>
                </div>
              </details>
            </>
          )}

          {pestana === PESTANAS[1] && <PestanaZona token={token} />}

          {pestana === PESTANAS[2] && <PestanaOtro token={token} corte={corte} />}

          {pestana === PESTANAS[3] && <PestanaVigilancia token={token} corte={corte} municipios={datos.vigilancia} />}

          {pestana === PESTANAS[4] && (
            <PestanaCalidad
              token={token}
              metodo={gerencial?.metodo ? String(gerencial.metodo) : "—"}
              corteModelo={fechaCorta(gerencial?.fecha_corte_modelo)}
            />
          )}

          {pestana === PESTANAS[5] && <PestanaSeguimiento token={token} />}
        </>
      )}

      <p className="v2-caption">{md(PIE_FUGA)}</p>
    </div>
  );
}

/** Pestaña "Por zona y grupo": el resumen de riesgo por zona y por grupo de consumo. */
function PestanaZona({ token }: { token?: string | null }) {
  const zonas = useDataset(token, "churn_zone_summary");
  const grupos = useDataset(token, "churn_group_summary");

  const filasZona = zonas ?? [];
  const filasGrupo = grupos ?? [];

  return (
    <div className="fila-1-1">
      <Tarjeta>
        <Encabezado titulo="Por zona" />
        {zonas === null ? (
          <div className="empty-state">Consultando el resumen por zona…</div>
        ) : filasZona.length ? (
          <>
            <BarrasApiladas
              filas={filasZona.map((fila) => ({
                cat: String(fila.zona_nombre ?? "—"),
                valores: { "Riesgo alto": Number(fila.riesgo_alto ?? 0), "Riesgo medio": Number(fila.riesgo_medio ?? 0) },
              }))}
              series={["Riesgo alto", "Riesgo medio"]}
              colores={{ "Riesgo alto": NARANJA, "Riesgo medio": AZUL }}
              opciones={{ nombreCategoria: "Zona", nombreSerie: "Nivel", altoFila: 26 }}
            />
            <TablaSimple columnas={COLUMNAS_ZONA} filas={filasZona} formato={formatoTabla(filasZona, COLUMNAS_ZONA)} />
          </>
        ) : null}
      </Tarjeta>

      <Tarjeta>
        <Encabezado titulo="Por grupo de consumo" />
        {grupos === null ? (
          <div className="empty-state">Consultando el resumen por grupo…</div>
        ) : filasGrupo.length ? (
          <>
            <TablaSimple columnas={COLUMNAS_GRUPO} filas={filasGrupo} formato={formatoTabla(filasGrupo, COLUMNAS_GRUPO)} />
            <p className="v2-pie">
              {md(GRUPOS_CONSUMO_ORDEN.map((grupo) => `**${grupo}**: ${GRUPO_CONSUMO_DESCRIPCION[grupo] ?? ""}`).join(" · "))}
            </p>
          </>
        ) : null}
      </Tarjeta>
    </div>
  );
}

/** Pestaña "Ya con otro comercializador": los clientes que ya aparecen en el archivo de la empresa. */
function PestanaOtro({ token, corte }: { token?: string | null; corte: string }) {
  const movil = useEsMovil();
  const otros = useDataset(token, "churn_other_supplier");
  const perfil = useDataset(token, "churn_left_profiles");
  const [valores, setValores] = useState<Record<string, string[]>>({ ...DEFECTO_OTRO });

  const filas = otros ?? [];
  const estados = useMemo(() => {
    const cuenta = new Map<string, number>();
    filas.forEach((fila) => {
      const estado = String(fila.estado ?? "");
      cuenta.set(estado, (cuenta.get(estado) ?? 0) + 1);
    });
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [filas]);
  const municipios = useMemo(
    () => [...new Set(filas.map((fila) => String(fila.municipio ?? "")).filter(Boolean))].sort(),
    [filas],
  );

  const seleccion = filas.filter(
    (fila) =>
      (!valores.est?.length || valores.est.includes(String(fila.estado ?? "")))
      && (!valores.mun?.length || valores.mun.includes(String(fila.municipio ?? ""))),
  );

  const filasTabla: Fila[] = seleccion.map((fila) => ({
    NIU: fila.NIU,
    estado: fila.estado,
    municipio: fila.municipio ?? "—",
    primer_mes_otro: fila.primer_mes_otro ?? null,
    ultimo_mes_otro: fila.ultimo_mes_otro ?? null,
    mes_salida: fila.mes_salida ?? null,
    fuente_salida: fila.fuente_salida ?? null,
    zona_nombre: fila.zona_nombre ?? "—",
    clase_servicio_nombre: fila.clase_servicio_nombre ?? "—",
    estrato: fila.estrato ?? null,
    consumo_prom_6m_antes_salida_kwh: fila.consumo_prom_6m_antes_salida_kwh ?? null,
    consumo_prom_otro_kwh: fila.consumo_prom_otro_kwh ?? null,
    tarifa_kwh: fila.tarifa_kwh ?? null,
    valor_facturado_antes_salida_mes: fila.valor_facturado_antes_salida_mes ?? null,
    nivel_tension: fila.nivel_tension ?? null,
  }));

  const formato = formatoTabla(filasTabla, COLUMNAS_OTRO);
  const facturado = filasTabla.reduce((suma, fila) => suma + Number(fila.valor_facturado_antes_salida_mes ?? 0), 0);
  const conTarifa = filasTabla.filter((fila) => fila.valor_facturado_antes_salida_mes !== null).length;

  const kpis: ItemKpi[] = estados.map(([estado, cantidad]) => ({
    titulo: estado.length < 28 ? estado : `${estado.slice(0, 26)}…`,
    valor: fmtN(cantidad),
    ayuda: ESTADO_OTRO_TEXTO[estado] ?? estado,
  }));

  const campos: CampoFiltro[] = [
    { key: "est", etiqueta: "Estado", opciones: estados.map(([estado]) => estado), vacio: "Todos" },
    { key: "mun", etiqueta: "Municipio", opciones: municipios, vacio: "Todos" },
  ];

  const filasPerfil = (perfil ?? []).filter(
    (fila) => !String(fila.dimension ?? "").toLowerCase().includes("comercializador"),
  );
  const dimensiones = [...new Set(filasPerfil.map((fila) => String(fila.dimension ?? "")))];

  if (!otros) return <div className="empty-state">Consultando los clientes con otro comercializador…</div>;
  if (!filas.length) return <Aviso texto="No hay archivo de otros comercializadores en 00_otros_comercializadores." tipo="calidad" />;

  return (
    <>
      <Encabezado titulo="Clientes atendidos por otros comercializadores (archivo de la empresa)" />

      <Kpis items={kpis} columnas={Math.min(estados.length, 4)} compacto />

      <p className="v2-pie">
        {md(
          `Facturaban antes de irse (solo con tarifa real): **${pesos(facturado)}/mes** `
          + `sobre ${fmtN(conTarifa)} clientes con historia TC2.`,
        )}
      </p>

      <PanelFiltros
        campos={campos}
        valores={valores}
        onChange={(clave, valor) => setValores((actual) => ({ ...actual, [clave]: valor }))}
        movil={movil}
        porFila={2}
      />

      <TablaPro
        filas={filasTabla}
        columnas={COLUMNAS_OTRO}
        formato={formato}
        prioritarias={["NIU", "estado", "municipio", "primer_mes_otro", "mes_salida", "clase_servicio_nombre", "consumo_prom_6m_antes_salida_kwh", "valor_facturado_antes_salida_mes"]}
        movil={["NIU", "estado", "municipio", "mes_salida", "consumo_prom_6m_antes_salida_kwh"]}
        que="clientes"
        columnaId="NIU"
        descargar={
          filasTabla.length
            ? { nombre: "Descargar (CSV)", archivo: `clientes_con_otro_comercializador_${corte}.csv`, csv: csvDe(COLUMNAS_OTRO, filasTabla) }
            : null
        }
      />

      <p className="v2-caption">
        {md(
          "Por política de la empresa no se muestra ni se descarga el nombre del comercializador que atiende hoy a cada cliente ni el del titular; "
          + "el archivo original en 00_otros_comercializadores no se modifica.",
        )}
      </p>

      {dimensiones.length ? (
        <details className="v2-exp">
          <summary>Perfil de los que se fueron (clase, zona, tamaño, municipio)</summary>
          <div className="v2-exp-cuerpo">
            {dimensiones.map((dimension) => {
              const grupo = filasPerfil.filter((fila) => String(fila.dimension ?? "") === dimension).slice(0, 15);
              return (
                <div key={dimension}>
                  <p className="v2-pie">{md(`**${dimension}**`)}</p>
                  <TablaSimple columnas={["valor", "n", "pct"]} filas={grupo} formato={formatoTabla(grupo, ["valor", "n", "pct"])} />
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </>
  );
}

/** Pestaña "Vigilancia no regulados": el mercado no regulado, que no entra al ranking. */
function PestanaVigilancia({
  token,
  corte,
  municipios,
}: {
  token?: string | null;
  corte: string;
  municipios: Array<{ niu: string; municipio: string }>;
}) {
  const filas = useDataset(token, "churn_non_regulated");

  const porNiu = useMemo(() => {
    const mapa = new Map<string, string>();
    municipios.forEach((fila) => mapa.set(fila.niu, fila.municipio));
    return mapa;
  }, [municipios]);

  const filasTabla: Fila[] = (filas ?? []).map((fila) => ({
    NIU: fila.NIU,
    motivo: fila.motivo ?? "—",
    estado: fila.estado ?? null,
    nivel_riesgo: fila.nivel_riesgo ?? "—",
    prob_fuga_6m: fila.prob_fuga_6m ?? null,
    municipio: porNiu.get(String(fila.NIU ?? "")) ?? "—",
    zona_nombre: fila.zona_nombre ?? "—",
    clase_servicio_nombre: fila.clase_servicio_nombre ?? "—",
    grupo_consumo: fila.grupo_consumo ?? "—",
    consumo_actual_kwh: fila.consumo_actual_kwh ?? null,
    consumo_prom_6m_kwh: fila.consumo_prom_6m_kwh ?? null,
    consumo_prom_12m_kwh: fila.consumo_prom_12m_kwh ?? null,
    tarifa_kwh: fila.tarifa_kwh ?? null,
    valor_facturado_mes: fila.valor_facturado_mes ?? null,
    senales: fila.senales ?? null,
    fecha_corte: fila.fecha_corte ?? null,
  }));

  const formato = formatoTabla(filasTabla, COLUMNAS_VIGILANCIA);

  const motivos = useMemo(() => {
    const cuenta = new Map<string, number>();
    filasTabla.forEach((fila) => {
      const motivo = String(fila.motivo ?? "");
      cuenta.set(motivo, (cuenta.get(motivo) ?? 0) + 1);
    });
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [filasTabla]);

  const kpis: ItemKpi[] = filasTabla.length
    ? [
        { titulo: "En vigilancia", valor: fmtN(filasTabla.length), tono: "marca" },
        { titulo: "Riesgo ALTO", valor: fmtN(filasTabla.filter((fila) => fila.nivel_riesgo === "ALTO").length), tono: "alerta" },
        { titulo: "Riesgo MEDIO", valor: fmtN(filasTabla.filter((fila) => fila.nivel_riesgo === "MEDIO").length), tono: "aviso" },
        {
          titulo: "Facturación / mes",
          valor: pesos(filasTabla.reduce((suma, fila) => suma + Number(fila.valor_facturado_mes ?? 0), 0)),
        },
      ]
    : [];

  if (!filas) return <div className="empty-state">Consultando la vigilancia del mercado no regulado…</div>;
  if (!filasTabla.length) return <Aviso texto="Ningún cliente cumple hoy los criterios de vigilancia." />;

  return (
    <>
      <Encabezado titulo="Mercado no regulado" />
      <p className="v2-caption">{md(NO_REGULADO)}</p>

      <Kpis items={kpis} columnas={4} compacto />

      {motivos.length ? (
        <p className="v2-pie">{md(motivos.map(([motivo, cantidad]) => `**${motivo}**: ${fmtN(cantidad)}`).join(" · "))}</p>
      ) : null}

      <TablaPro
        filas={filasTabla}
        columnas={COLUMNAS_VIGILANCIA}
        formato={formato}
        prioritarias={["NIU", "motivo", "estado", "nivel_riesgo", "prob_fuga_6m", "municipio", "clase_servicio_nombre", "consumo_prom_12m_kwh", "valor_facturado_mes", "senales"]}
        movil={["NIU", "motivo", "nivel_riesgo", "prob_fuga_6m", "municipio", "valor_facturado_mes"]}
        que="clientes"
        columnaId="NIU"
        ordenNumerico={{ prob_fuga_6m: filasTabla.map((fila) => Number(fila.prob_fuga_6m ?? 0)) }}
        descargar={
          filasTabla.length
            ? { nombre: "Descargar (CSV)", archivo: `vigilancia_no_regulados_${corte}.csv`, csv: csvDe(COLUMNAS_VIGILANCIA, filasTabla) }
            : null
        }
      />
    </>
  );
}

/** Pestaña "Calidad del modelo": las métricas de validación y las variables más importantes. */
function PestanaCalidad({ token, metodo, corteModelo }: { token?: string | null; metodo: string; corteModelo: string }) {
  const metricas = useDataset(token, "churn_metrics");
  const importancia = useDataset(token, "churn_feature_importance");

  const filasMetricas = metricas ?? [];
  const variables = (importancia ?? []).slice(0, 15);

  return (
    <>
      <Encabezado titulo="Qué tan bien ordena el modelo a los que efectivamente se fueron" />
      <Aviso texto={AVISO_CALIDAD} tipo="limite" />

      {metricas === null ? (
        <div className="empty-state">Consultando las métricas del modelo…</div>
      ) : filasMetricas.length ? (
        <>
          <p className="v2-caption">
            {md(
              "Evaluación por cortes en el tiempo: se entrena con cortes anteriores y se mira si los clientes que "
              + "salieron en los 6 meses siguientes quedaron arriba en el ranking. AUC 0,5 = azar, 1 = perfecto. "
              + "precision_top100: de los 100 primeros, % que se fue. lift: cuántas veces más que elegir al azar.",
            )}
          </p>
          <TablaSimple columnas={COLUMNAS_METRICAS} filas={filasMetricas} formato={formatoTabla(filasMetricas, COLUMNAS_METRICAS)} />
        </>
      ) : (
        <Aviso texto="Sin métricas: el modelo no se ha reentrenado todavía." />
      )}

      {variables.length ? (
        <Tarjeta titulo="Variables que más pesan" bajada="Porcentaje de la importancia total del modelo">
          <Barras
            serie={variables.map((fila) => [String(fila.variable ?? "—"), Number(fila.importancia_pct ?? 0)])}
            opciones={{
              formato: (valor) => `${fmtN(valor, 2)} %`,
              color: AZUL,
              nombreValor: "Importancia",
              nombreCategoria: "Variable",
              altoFila: 26,
              maxEtiqueta: 240,
            }}
          />
        </Tarjeta>
      ) : null}

      <p className="v2-pie">{md(`Método: **${metodo}** · modelo entrenado con corte **${corteModelo}**.`)}</p>
    </>
  );
}

/** Pestaña "Seguimiento": qué pasó con los señalados en cortes anteriores. */
function PestanaSeguimiento({ token }: { token?: string | null }) {
  const filas = useDataset(token, "churn_followup");

  const filasTabla = (filas ?? []).map((fila) => ({
    ...fila,
    ventana_completa: String(fila.ventana_completa ?? "").toLowerCase() === "true" ? "Sí (6 meses cumplidos)" : "No (en curso)",
  }));

  if (!filas) return <div className="empty-state">Consultando el seguimiento de los señalados…</div>;
  if (!filasTabla.length) return <Aviso texto="Todavía no hay cortes anteriores con lista de riesgo de fuga. Se llena mes a mes." />;

  return (
    <>
      <Encabezado titulo="Qué pasó con los señalados en cortes anteriores" />
      <p className="v2-caption">
        {md(
          "pct_salieron: % de los señalados en ese corte que aparecen luego en el archivo de otros "
          + "comercializadores (o en cero sostenido) dentro de sus 6 meses. Compararlo con la fila 'TODOS (tasa base)'. "
          + "La ventana se completa cuando pasan los 6 meses del corte; no es algo que se marque a mano. "
          + "Si la columna *observable* dice NO, las celdas vacías no significan que nadie se fue: el archivo de otros "
          + "comercializadores termina antes de esa lista y todavía no se puede saber.",
        )}
      </p>
      <TablaSimple columnas={COLUMNAS_SEGUIMIENTO} filas={filasTabla} formato={formatoTabla(filasTabla, COLUMNAS_SEGUIMIENTO)} />
    </>
  );
}
