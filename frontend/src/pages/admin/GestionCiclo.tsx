import { useEffect, useMemo, useRef, useState } from "react";
import { api, type RutaVisita } from "../../lib/api";
import { Kpis, TablaSimple, Tarjeta, TituloPagina, type ItemKpi } from "../../components/v2/ui";
import { PanelFiltros, type CampoFiltro } from "../../components/v2/filtros";
import { TablaPro, type Fila } from "../../components/v2/TablaPro";
import { Conteo, md, useEsMovil } from "../../charts/textos";
import { Barras, BarrasApiladas } from "../../charts/Graficas";
import { AZUL, COLOR_GRAVEDAD, GRIS_ANTIGUA } from "../../charts/paleta";
import { AYUDA_ZONA_REGIONAL, GRUPOS_CONSUMO_ORDEN, ZONAS_REGIONALES, etiquetaCiclo } from "../../lib/negocio";
import { BAJADA_SEVERIDAD, ORDEN_SEVERIDAD } from "../../components/v2/textos";
import { FichaCliente } from "../../components/v2/FichaCliente";
import { csvCelda, fmtN, formatoTabla, pesos } from "../../lib/format";
import { useCorte } from "../../lib/useCorte";

/**
 * Réplica de la sección "Gestión por ciclo" (app_ebsa_v2.py).
 *
 * Los ciclos y los clientes salen de /route (mismo orden que el original: dentro del ciclo, de mayor
 * a menor valor en riesgo); los seis filtros de la tabla se aplican en el navegador sobre los
 * clientes del ciclo elegido, como hace el Streamlit sobre su DataFrame.
 *
 * Desviación documentada: en el expander "Clientes por severidad", la vista "Por zona regional"
 * usa la gravedad de negocio (CRITICA/FUERTE/MODERADA/ANTIGUA, con ANTIGUA en gris) en lugar de la
 * severidad original, porque la API no sirve severidad × zona. La vista "General" sí usa la
 * severidad original (/panorama).
 */

const COLUMNAS = [
  "orden_en_ciclo",
  "ciclo_etiqueta",
  "NIU",
  "municipio",
  "zona_regional",
  "zona_nombre",
  "clase_servicio_nombre",
  "estrato",
  "grupo_consumo",
  "cluster_id",
  "severidad",
  "trayectoria",
  "prioridad_gestion",
  "estado_en_lista",
  "meses_consecutivos_en_lista",
  "consumo_anterior_kwh",
  "consumo_reciente_kwh",
  "perdida_kwh_mes",
  "tarifa_kwh",
  "valor_riesgo_mes",
  "pred_1m_kwh",
  "consumo_promedio_semestral_kwh",
  "valor_facturado_mes",
  "tipo_medidor_nombre",
  "tipo_lectura_nombre",
];

const PRIORITARIAS = [
  "orden_en_ciclo",
  "NIU",
  "municipio",
  "clase_servicio_nombre",
  "grupo_consumo",
  "severidad",
  "trayectoria",
  "prioridad_gestion",
  "estado_en_lista",
  "consumo_anterior_kwh",
  "consumo_reciente_kwh",
  "valor_riesgo_mes",
];

const MOVIL = ["orden_en_ciclo", "NIU", "municipio", "severidad", "trayectoria", "valor_riesgo_mes"];

const AYUDA_LECTURA =
  "REAL: lectura tomada del medidor. ESTIMADA: la empresa estimó el consumo. Una caída con lectura estimada puede no ser real.";

const PIE_SEVERIDAD =
  "Aquí se muestra la **severidad original** del estudio de caída (tamaño de la caída frente a clientes parecidos), "
  + "incluidas las caídas que llevan meses así. En las vistas Comercial y Soporte, y en el mapa, esas caídas antiguas "
  + "se muestran como 'Antigua' y 'Grave' queda solo para las recientes: por eso el conteo de críticas es menor allá.";

const PIE_SEVERIDAD_ZONA =
  "Por zona se usa la **gravedad de negocio** (la misma de las vistas Comercial y Soporte): las caídas que llevan meses "
  + "así aparecen como 'Antigua'. La vista *General* usa la severidad original del estudio de caída, incluidas las antiguas.";

type Panorama = Awaited<ReturnType<typeof api.panorama>>;

function aFila(item: RutaVisita): Fila {
  const payload = item.payload;
  return {
    orden_en_ciclo: item.orden_en_ciclo,
    ciclo_etiqueta: item.ciclo_etiqueta,
    NIU: item.niu,
    municipio: item.municipio,
    zona_regional: item.zona_regional,
    zona_nombre: item.zona_nombre,
    clase_servicio_nombre: item.clase,
    estrato: payload.estrato,
    grupo_consumo: payload.grupo_consumo,
    cluster_id: payload.cluster_id,
    severidad: payload.severidad,
    trayectoria: item.trayectoria,
    prioridad_gestion: item.prioridad,
    estado_en_lista: item.situacion,
    meses_consecutivos_en_lista: payload.meses_consecutivos_en_lista,
    consumo_anterior_kwh: payload.consumo_anterior_kwh,
    consumo_reciente_kwh: item.consumo_reciente_kwh,
    perdida_kwh_mes: payload.perdida_kwh_mes,
    tarifa_kwh: payload.tarifa_kwh,
    valor_riesgo_mes: item.valor_riesgo_mes,
    pred_1m_kwh: payload.pred_1m_kwh,
    consumo_promedio_semestral_kwh: payload.consumo_promedio_semestral_kwh,
    valor_facturado_mes: payload.valor_facturado_mes,
    tipo_medidor_nombre: payload.tipo_medidor_nombre,
    tipo_lectura_nombre: item.lectura,
  };
}

export function GestionCiclo({ token }: { token?: string | null }) {
  const corte = useCorte(token);
  const movil = useEsMovil();
  const [zona, setZona] = useState("");
  const [ciclo, setCiclo] = useState<number | null>(null);
  const [ciclos, setCiclos] = useState<Array<{ ciclo: number; etiqueta: string }> | null>(null);
  const [zonas, setZonas] = useState<string[]>([]);
  const [items, setItems] = useState<RutaVisita[] | null>(null);
  const [totalLista, setTotalLista] = useState<number | null>(null);
  const [panorama, setPanorama] = useState<Panorama | null>(null);
  const [filtros, setFiltros] = useState<Record<string, string[]>>({});
  const [verSev, setVerSev] = useState("General");
  const [error, setError] = useState<string | null>(null);
  const cicloRef = useRef<number | null>(null);
  cicloRef.current = ciclo;

  // Ciclos y zonas: la zona solo decide qué ciclos se ofrecen (como base_c del original).
  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .route(token, { zona: zona || undefined })
      .then((datos) => {
        if (cancelado) return;
        setZonas(datos.zonas);
        setCiclos(datos.cycles.map((entrada) => ({ ciclo: entrada.ciclo, etiqueta: entrada.etiqueta })));
        if (!datos.cycles.some((entrada) => entrada.ciclo === cicloRef.current)) {
          setCiclo(datos.cycles.length ? datos.cycles[0].ciclo : null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar los ciclos.");
      });
    return () => {
      cancelado = true;
    };
  }, [token, zona]);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .panorama(token)
      .then((valor) => {
        if (!cancelado) setPanorama(valor);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Clientes del ciclo elegido.
  useEffect(() => {
    if (!token || ciclo === null) {
      setItems(null);
      return;
    }
    let cancelado = false;
    setItems(null);
    setError(null);
    api
      .route(token, { cycle: ciclo, limit: 5000 })
      .then((datos) => {
        if (cancelado) return;
        setItems(datos.items);
        setTotalLista(datos.total_lista);
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar el ciclo.");
      });
    return () => {
      cancelado = true;
    };
  }, [token, ciclo]);

  // Opciones de los filtros: salen del ciclo entero, antes de filtrar (como d en el Streamlit).
  const opciones = useMemo(() => {
    const campo = (valor: unknown): string => String(valor ?? "");
    const severidades = new Set<string>();
    const trayectorias = new Set<string>();
    const estados = new Set<string>();
    const grupos = new Set<string>();
    const lecturas = new Set<string>();
    const municipios = new Set<string>();
    for (const item of items ?? []) {
      severidades.add(campo(item.payload.severidad));
      trayectorias.add(item.trayectoria);
      estados.add(item.situacion);
      grupos.add(campo(item.payload.grupo_consumo));
      lecturas.add(item.lectura);
      municipios.add(campo(item.municipio));
    }
    return {
      severidades: [...severidades].filter(Boolean).sort(),
      trayectorias: [...trayectorias].filter(Boolean).sort(),
      estados: [...estados].filter(Boolean).sort(),
      grupos: GRUPOS_CONSUMO_ORDEN.filter((grupo) => grupos.has(grupo)),
      lecturas: [...lecturas].filter(Boolean).sort(),
      municipios: [...municipios].filter(Boolean).sort(),
    };
  }, [items]);

  const filtrados = useMemo(() => {
    const elegido = (clave: string): string[] => filtros[clave] ?? [];
    const sev = elegido("severidad");
    const tra = elegido("trayectoria");
    const est = elegido("estado");
    const grp = elegido("grupo");
    const lec = elegido("lectura");
    const mun = elegido("municipio");
    if (!sev.length && !tra.length && !est.length && !grp.length && !lec.length && !mun.length) return items ?? [];
    return (items ?? []).filter((item) => {
      if (sev.length && !sev.includes(String(item.payload.severidad ?? ""))) return false;
      if (tra.length && !tra.includes(item.trayectoria)) return false;
      if (est.length && !est.includes(item.situacion)) return false;
      if (grp.length && !grp.includes(String(item.payload.grupo_consumo ?? ""))) return false;
      if (lec.length && !lec.includes(item.lectura)) return false;
      if (mun.length && !mun.includes(String(item.municipio ?? ""))) return false;
      return true;
    });
  }, [items, filtros]);

  const filas = useMemo(() => (filtrados ?? []).map(aFila), [filtrados]);
  const formato = formatoTabla(filas, COLUMNAS);

  const kwh = (filtrados ?? []).reduce((total, item) => total + Number(item.payload.perdida_kwh_mes ?? 0), 0);
  const valor = (filtrados ?? []).reduce((total, item) => total + item.valor_riesgo_mes, 0);
  const kpis: ItemKpi[] = [
    { titulo: "Clientes", valor: fmtN(filtrados?.length ?? 0), tono: "marca" },
    { titulo: "kWh/mes", valor: fmtN(kwh) },
    { titulo: "Valor/mes", valor: pesos(valor), tono: "g" },
  ];

  const campos: CampoFiltro[] = [
    { key: "severidad", etiqueta: "Severidad", opciones: opciones.severidades, vacio: "Todas" },
    { key: "trayectoria", etiqueta: "Trayectoria", opciones: opciones.trayectorias, vacio: "Todas" },
    { key: "estado", etiqueta: "Estado en lista", opciones: opciones.estados, vacio: "Todos" },
    { key: "grupo", etiqueta: "Grupo de consumo", opciones: opciones.grupos, vacio: "Todos" },
    { key: "lectura", etiqueta: "Tipo de lectura", opciones: opciones.lecturas, vacio: "Todas", ayuda: AYUDA_LECTURA },
    { key: "municipio", etiqueta: "Municipio", opciones: opciones.municipios, vacio: "Todos" },
  ];

  // Severidad: general desde /panorama; por zona, la gravedad que trae cada zona.
  const severidades = ORDEN_SEVERIDAD.filter((nivel) => panorama?.por_severidad[nivel] !== undefined);
  const filasSevZona = panorama
    ? Object.entries(panorama.por_zona)
        .map(([zonaNombre, valores]) => {
          const conteo: Record<string, number> = {};
          for (const nivel of ORDEN_SEVERIDAD) conteo[nivel] = valores.gravedad[nivel] ?? 0;
          const antigua = valores.gravedad.ANTIGUA ?? 0;
          if (antigua) conteo.ANTIGUA = antigua;
          return { cat: zonaNombre, valores: conteo, total: Object.values(conteo).reduce((t, v) => t + v, 0) };
        })
        .sort((a, b) => b.total - a.total)
    : [];
  const seriesSevZona = filasSevZona.length
    ? ORDEN_SEVERIDAD.concat(filasSevZona.some((fila) => fila.valores.ANTIGUA) ? ["ANTIGUA"] : [])
    : ORDEN_SEVERIDAD;

  const cicloTexto = ciclo === null ? "" : String(ciclo).padStart(2, "0");
  const descarga = filas.length
    ? {
        nombre: `Descargar ciclo ${cicloTexto} (CSV)`,
        archivo: `gestion_ciclo_${cicloTexto}_${corte || ""}.csv`,
        csv: [COLUMNAS.join(";"), ...filas.map((fila) => COLUMNAS.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n"),
      }
    : null;

  return (
    <div className="stack">
      <TituloPagina
        titulo="Lista operativa por ciclo de lectura"
        bajada="Dentro de cada ciclo los clientes van de mayor a menor valor en riesgo: una cuadrilla empieza por el primero."
      />

      {error && <p className="v2-caption">{error}</p>}

      <Tarjeta>
        <div className="fila-1-2">
          <label className="campo">
            <span>
              Zona regional
              <span className="ayuda-info" title={AYUDA_ZONA_REGIONAL} aria-label={AYUDA_ZONA_REGIONAL}>
                i
              </span>
            </span>
            <select className="filter-select" value={zona} onChange={(evento) => setZona(evento.target.value)}>
              <option value="">(todas)</option>
              {ZONAS_REGIONALES.filter((nombre) => zonas.includes(nombre))
                .concat(zonas.filter((nombre) => !ZONAS_REGIONALES.includes(nombre)))
                .map((nombre) => (
                  <option key={nombre} value={nombre}>
                    {nombre}
                  </option>
                ))}
            </select>
          </label>
          <label className="campo">
            <span>Ciclo (ruta de lectura)</span>
            <select className="filter-select" value={ciclo === null ? "" : String(ciclo)} onChange={(evento) => setCiclo(Number(evento.target.value))}>
              {(ciclos ?? []).map((entrada) => (
                <option key={entrada.ciclo} value={String(entrada.ciclo)}>
                  {entrada.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Tarjeta>

      <PanelFiltros
        campos={campos}
        valores={filtros}
        onChange={(clave, valorFiltro) => setFiltros((actual) => ({ ...actual, [clave]: valorFiltro }))}
        movil={movil}
        porFila={3}
      />

      {items === null && !error ? <div className="empty-state">Consultando el ciclo…</div> : null}

      {items !== null && (
        <>
          <Kpis items={kpis} columnas={3} />
          <Conteo
            mostrados={filtrados.length}
            filtrados={filtrados.length}
            enLista={items.length}
            universo={totalLista}
            que="clientes de este ciclo"
            queLista="en el ciclo sin filtros"
            queUniverso="clientes en toda la lista de caída"
          />

          <TablaPro
            filas={filas}
            columnas={COLUMNAS}
            formato={formato}
            prioritarias={PRIORITARIAS}
            movil={MOVIL}
            destacada="valor_riesgo_mes"
            que="clientes"
            descargar={descarga}
            ficha={(niu) => <FichaCliente niu={niu} token={token} />}
          />

          <details className="v2-exp" open={!movil}>
            <summary>Clientes por severidad (general o por zona regional)</summary>
            <div className="v2-exp-cuerpo">
              <div className="v2-radio" role="radiogroup" aria-label="Ver">
                {["General", "Por zona regional"].map((opcion) => (
                  <button
                    key={opcion}
                    type="button"
                    role="radio"
                    aria-checked={verSev === opcion}
                    className={verSev === opcion ? "activo" : ""}
                    onClick={() => setVerSev(opcion)}
                  >
                    {opcion}
                  </button>
                ))}
              </div>
              {verSev === "General" ? (
                <Barras
                  serie={severidades.map((nivel) => [nivel, panorama?.por_severidad[nivel] ?? 0])}
                  opciones={{ color: AZUL, nombreValor: "Clientes", nombreCategoria: "Severidad", altoFila: 34 }}
                />
              ) : (
                <>
                  <BarrasApiladas
                    filas={filasSevZona.map((fila) => ({ cat: fila.cat, valores: fila.valores }))}
                    series={seriesSevZona}
                    colores={{ ...COLOR_GRAVEDAD, ANTIGUA: GRIS_ANTIGUA }}
                    opciones={{ nombreCategoria: "Zona regional", nombreSerie: "Severidad" }}
                  />
                  <TablaSimple
                    columnas={["zona_regional", ...seriesSevZona]}
                    filas={filasSevZona.map((fila) => ({ zona_regional: fila.cat, ...fila.valores }))}
                    formato={(valorCelda, columna) => (columna === "zona_regional" ? String(valorCelda) : fmtN(Number(valorCelda)))}
                  />
                </>
              )}
              <p className="v2-caption">{md(verSev === "General" ? PIE_SEVERIDAD : PIE_SEVERIDAD_ZONA)}</p>
            </div>
          </details>

          <p className="v2-caption">
            {md(
              "**orden_en_ciclo** es el puesto dentro del ciclo: 1 es el cliente con más facturación en riesgo. "
                + "No incluye autogeneradores ni las clases área común, autoconsumos EBSA, distritos de riego y provisionales (regla de negocio).",
            )}
          </p>
        </>
      )}
    </div>
  );
}
