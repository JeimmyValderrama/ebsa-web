import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api, type BusquedaData, type CicloRuta, type RetroData, type RutaData } from "../lib/api";
import { useSectionNav } from "../app/SectionNav";
import { useCorte } from "../lib/useCorte";
import { csvCelda, fmtN, formatoTabla, limpiarNiu, pesos, queRevisar } from "../lib/format";
import { FichaCliente } from "../components/v2/FichaCliente";
import { ListaCaida } from "../components/ListaCaida";
import { Aviso, ComoLeer, Kpis, TablaSimple, Tarjeta, TituloPagina, type ItemKpi } from "../components/v2/ui";
import { PanelFiltros, type CampoFiltro } from "../components/v2/filtros";
import { TablaPro, type Fila } from "../components/v2/TablaPro";
import { Conteo, Leyenda, md, useEsMovil } from "../charts/textos";
import { MapaPuntos, type PuntoMapa } from "../components/MapaPuntos";
import { COLOR_GRAVEDAD, SEVERIDAD_SIMPLE } from "../charts/paleta";
import { ESTADO_LISTA_SIMPLE, PRIORIDAD_SIMPLE, TRAYECTORIA_SIMPLE, etiqueta } from "../lib/negocio";

const sections = [
  ["cliente", "Consultar un cliente"],
  ["visitas", "Visitas por ciclo"],
  ["caidas", "Caídas de consumo"],
  ["resultados", "Registrar resultado de visitas"],
] as const;

type Section = (typeof sections)[number][0];

/** Grupos del menú lateral (GRUPOS_MENU["Soporte"] del Streamlit). */
const GRUPOS: Array<{ nombre: string; items: Array<{ clave: Section; etiqueta: string }> }> = [
  {
    nombre: "Clientes",
    items: [
      { clave: "cliente", etiqueta: "Consultar un cliente" },
      { clave: "caidas", etiqueta: "Caídas de consumo" },
    ],
  },
  {
    nombre: "Trabajo de campo",
    items: [
      { clave: "visitas", etiqueta: "Visitas por ciclo" },
      { clave: "resultados", etiqueta: "Resultado de visitas" },
    ],
  },
];

export default function SupportPage() {
  const { idToken } = useAuth();
  const [section, setSection] = useState<Section>("cliente");
  useSectionNav(GRUPOS, section, setSection);
  const [searchParams] = useSearchParams();
  const niuInicial = searchParams.get("niu") ?? "";

  useEffect(() => {
    if (niuInicial) setSection("cliente");
  }, [niuInicial]);

  return (
    <div className="page-content">
      {section === "cliente" && <ClientLookup token={idToken} initialNiu={niuInicial} />}
      {section === "caidas" && <ListaCaida token={idToken} />}
      {section === "visitas" && <VisitasPorCiclo token={idToken} />}
      {section === "resultados" && <Retroalimentacion token={idToken} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Consultar un cliente                                                        */
/* -------------------------------------------------------------------------- */

function ClientLookup({ token, initialNiu }: { token?: string | null; initialNiu: string }) {
  const [busqueda, setBusqueda] = useState(initialNiu);
  const [niu, setNiu] = useState(initialNiu);
  const [existe, setExiste] = useState<boolean | null>(null);

  useEffect(() => {
    if (initialNiu) setBusqueda(initialNiu);
  }, [initialNiu]);

  // El text_input del Streamlit se repinta al escribir: se espera medio segundo para que el
  // fichero se actualice mientras se teclea sin disparar una consulta por letra.
  useEffect(() => {
    if (busqueda === niu) return;
    const temporizador = window.setTimeout(() => setNiu(limpiarNiu(busqueda)), 500);
    return () => window.clearTimeout(temporizador);
  }, [busqueda, niu]);

  // niu_existe() del Streamlit: ¿aparece el NIU en alguna tabla del corte? El original mira la
  // ubicación del TC1, el pronóstico, la lista de caída, la fuga y el cero sostenido; aquí se
  // pregunta al TC1, que es la lista maestra donde estaría cualquier cliente del corte. No se
  // borra el valor anterior mientras se comprueba, para que no parpadee entre teclas.
  useEffect(() => {
    if (!niu) {
      setExiste(null);
      return;
    }
    let cancelado = false;
    api
      .dataset(token ?? undefined, "locations", { niu, limit: 1 })
      .then((pagina) => {
        if (!cancelado) setExiste(pagina.total > 0);
      })
      .catch(() => {
        // Sin poder comprobarlo no se bloquea la ficha: ella misma avisará si no hay datos.
        if (!cancelado) setExiste(true);
      });
    return () => {
      cancelado = true;
    };
  }, [niu, token]);

  return (
    <>
      <TituloPagina
        titulo="Consultar un cliente"
        bajada="Escribe el NIU y verás, en una sola página, dónde está, qué le pasa al consumo, qué probabilidad de fuga tiene y qué conviene revisar o decirle."
      />

      <Tarjeta>
        <form
          className="data-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            setNiu(limpiarNiu(busqueda));
          }}
        >
          <input
            className="search-input"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Escribe o pega el NIU (sin puntos ni espacios)"
            aria-label="NIU del cliente"
          />
        </form>

        <details className="v2-exp">
          <summary>¿No tienes el NIU? Buscar por municipio o situación</summary>
          <div className="v2-exp-cuerpo">
            <BuscaPorMunicipio token={token} />
          </div>
        </details>
      </Tarjeta>

      {niu && existe === false ? (
        <Aviso
          tipo="alerta"
          texto={`No hay ningún cliente con el NIU **${niu}** en los datos del corte. Revisa el número (sin puntos ni espacios) o búscalo por municipio en el desplegable de arriba.`}
        />
      ) : niu && existe ? (
        <Tarjeta>
          <FichaCliente token={token} niu={niu} />
        </Tarjeta>
      ) : null}
    </>
  );
}

/** Expander "¿No tienes el NIU?": busca en la lista de caída por municipio, gravedad o tendencia. */
function BuscaPorMunicipio({ token }: { token?: string | null }) {
  const [municipio, setMunicipio] = useState("");
  const [gravedad, setGravedad] = useState("");
  const [trayectoria, setTrayectoria] = useState("");
  const [datos, setDatos] = useState<BusquedaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    api
      .search(token ?? undefined, { municipio, gravedad, trayectoria })
      .then((respuesta) => {
        if (!cancelado) {
          setDatos(respuesta);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible consultar la lista de caída.");
      });
    return () => {
      cancelado = true;
    };
  }, [gravedad, municipio, token, trayectoria]);

  const columnas = ["NIU", "Municipio", "Clase", "Gravedad", "Tendencia", "Facturación que se pierde ($/mes)"];
  const filas = (datos?.items ?? []).map((item) => ({
    NIU: item.niu,
    Municipio: item.municipio || "—",
    Clase: item.clase || "—",
    Gravedad: etiqueta(SEVERIDAD_SIMPLE, item.gravedad),
    Tendencia: etiqueta(TRAYECTORIA_SIMPLE, item.trayectoria),
    "Facturación que se pierde ($/mes)": Math.round(item.valor_riesgo_mes),
  }));
  const formato = formatoTabla(filas, columnas);

  return (
    <div className="stack">
      <div className="fila-3">
        <label className="campo">
          Municipio
          <select className="filter-select" value={municipio} onChange={(event) => setMunicipio(event.target.value)}>
            <option value="">(todos)</option>
            {(datos?.municipios ?? []).map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Gravedad
          <select className="filter-select" value={gravedad} onChange={(event) => setGravedad(event.target.value)}>
            <option value="">(todas)</option>
            {Object.keys(SEVERIDAD_SIMPLE).map((codigo) => (
              <option key={codigo} value={codigo}>
                {SEVERIDAD_SIMPLE[codigo]}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Tendencia
          <select className="filter-select" value={trayectoria} onChange={(event) => setTrayectoria(event.target.value)}>
            <option value="">(todas)</option>
            {Object.keys(TRAYECTORIA_SIMPLE).map((codigo) => (
              <option key={codigo} value={codigo}>
                {TRAYECTORIA_SIMPLE[codigo]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="empty-state">{error}</div>}
      {!error && (
        <p className="v2-caption">
          {md(
            `${fmtN(datos?.total ?? 0)} clientes de la lista de caída cumplen el filtro (se muestran hasta 50). Copia el NIU y pégalo arriba.`,
          )}
        </p>
      )}

      {filas.length > 0 && <TablaSimple columnas={columnas} filas={filas} formato={formato} alto={360} />}
      {filas.length === 0 && !error && <div className="empty-state">Ningún cliente cumple estos filtros. Prueba a quitar alguno.</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Visitas por ciclo                                                           */
/* -------------------------------------------------------------------------- */

/** Prioridades del filtro (PRIORIDAD_SIMPLE), con la de por defecto del original. */
const PRIORIDADES_VISITA = Object.keys(PRIORIDAD_SIMPLE);
const DEFECTO_VISITA: Record<string, string[]> = { pri: ["GESTIONAR"], mun: [], grav: [], ten: [], est: [], lec: [] };

function VisitasPorCiclo({ token }: { token?: string | null }) {
  const movil = useEsMovil();
  const corte = useCorte(token);

  const [zona, setZona] = useState("");
  const [ciclo, setCiclo] = useState<number | "">("");
  const [ciclos, setCiclos] = useState<CicloRuta[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [datos, setDatos] = useState<RutaData | null>(null);
  const [valores, setValores] = useState<Record<string, string[]>>({ ...DEFECTO_VISITA });
  const [cargandoOpciones, setCargandoOpciones] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Opciones de los dos desplegables (ciclos de la lista, acotados a la zona; y zonas).
  useEffect(() => {
    let cancelado = false;
    setCargandoOpciones(true);
    api
      .route(token ?? undefined, { zona: zona || undefined })
      .then((respuesta) => {
        if (cancelado) return;
        setCiclos(respuesta.cycles);
        setZonas(respuesta.zonas);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar la lista de caída (paso 11 del pipeline).");
      })
      .finally(() => {
        if (!cancelado) setCargandoOpciones(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token, zona]);

  // El ciclo elegido se valida contra la zona: si ya no existe, se toma el primero (vis_ciclo del original).
  const cicloElegido = ciclos.find((entrada) => entrada.ciclo === ciclo)?.ciclo ?? ciclos[0]?.ciclo ?? null;
  const clientesDelCiclo = ciclos.find((entrada) => entrada.ciclo === cicloElegido)?.clientes ?? 0;
  // Código del ciclo con dos dígitos ('00'…), el mismo que usa el original en la descarga.
  const codigoCiclo = cicloElegido === null ? "" : String(cicloElegido).padStart(2, "0");

  // Los clientes se filtran solo por el ciclo: en el original la zona sirve para acertar el
  // desplegable de ciclos, no para recortar la tabla.
  useEffect(() => {
    if (cicloElegido === null) return;
    let cancelado = false;
    setCargando(true);
    api
      .route(token ?? undefined, { cycle: cicloElegido, limit: 5000 })
      .then((respuesta) => {
        if (!cancelado) {
          setDatos(respuesta);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar la ruta de visitas.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cicloElegido, token]);

  // Como en vis_ciclo del original: si el ciclo elegido ya no existe (porque cambió la zona), se olvida.
  useEffect(() => {
    if (ciclo !== "" && !ciclos.some((entrada) => entrada.ciclo === ciclo)) setCiclo("");
  }, [ciclos, ciclo]);

  const items = datos?.items ?? [];

  const municipios = useMemo(() => [...new Set(items.map((item) => item.municipio ?? "").filter(Boolean))].sort(), [items]);
  const lecturas = useMemo(() => [...new Set(items.map((item) => item.lectura).filter(Boolean))].sort(), [items]);

  const filtrados = useMemo(
    () =>
      items.filter(
        (item) =>
          (valores.pri.length === 0 || valores.pri.includes(item.prioridad)) &&
          (valores.mun.length === 0 || valores.mun.includes(item.municipio ?? "")) &&
          (valores.grav.length === 0 || valores.grav.includes(item.gravedad)) &&
          (valores.ten.length === 0 || valores.ten.includes(item.trayectoria)) &&
          (valores.est.length === 0 || valores.est.includes(item.situacion)) &&
          (valores.lec.length === 0 || valores.lec.includes(item.lectura)),
      ),
    [items, valores],
  );

  const ordenados = useMemo(() => [...filtrados].sort((a, b) => (a.orden_en_ciclo ?? 0) - (b.orden_en_ciclo ?? 0)), [filtrados]);
  const conLecturaEstimada = ordenados.filter((item) => item.lectura.toUpperCase().includes("ESTIMAD")).length;

  const cambiarFiltro = (clave: string, valor: string[]): void => setValores((actual) => ({ ...actual, [clave]: valor }));

  const kpis: ItemKpi[] = [
    { titulo: "Clientes para visitar", valor: fmtN(ordenados.length), tono: "marca" },
    {
      titulo: "Facturación que se pierde",
      valor: pesos(ordenados.reduce((suma, item) => suma + item.valor_riesgo_mes, 0)),
      unidad: "/mes",
      tono: "g",
    },
    { titulo: "Caídas graves", valor: fmtN(ordenados.filter((item) => item.gravedad === "CRITICA").length), tono: "alerta" },
  ];

  const columnas = [
    "Orden",
    "NIU",
    "Municipio",
    "Dirección",
    "Clase",
    "Lectura",
    "Tipo de caída",
    "Consumía (kWh/mes)",
    "Consume ahora (kWh/mes)",
    "Caída",
    "Facturación que se pierde ($/mes)",
    "Gravedad",
    "Tendencia",
    "Prioridad",
    "Situación",
    "Qué revisar",
  ];

  const filas: Fila[] = ordenados.map((item) => ({
    Orden: item.orden_en_ciclo ?? 0,
    NIU: item.niu,
    Municipio: item.municipio || "—",
    Dirección: item.direccion || "—",
    Clase: item.clase || "—",
    Lectura: item.lectura || "—",
    "Tipo de caída": traducirTipoCaida(item.veredicto),
    "Consumía (kWh/mes)": Math.round(item.referencia_kwh),
    "Consume ahora (kWh/mes)": Math.round(item.consumo_reciente_kwh),
    Caída: item.caida_pct === null || Number.isNaN(item.caida_pct) ? "—" : `${Math.round(item.caida_pct)} %`,
    "Facturación que se pierde ($/mes)": Math.round(item.valor_riesgo_mes),
    Gravedad: etiqueta(SEVERIDAD_SIMPLE, item.gravedad),
    Tendencia: etiqueta(TRAYECTORIA_SIMPLE, item.trayectoria),
    Prioridad: etiqueta(PRIORIDAD_SIMPLE, item.prioridad),
    Situación: item.situacion ? etiqueta(ESTADO_LISTA_SIMPLE, item.situacion) : "",
    "Qué revisar": queRevisar({ ...item.payload, ...item }),
  }));

  const formato = formatoTabla(filas, columnas);
  const ordenNumerico = { Caída: ordenados.map((item) => item.caida_pct ?? Number.NEGATIVE_INFINITY) };

  const puntos = useMemo<PuntoMapa[]>(
    () =>
      ordenados
        .filter((item) => item.coordenadas_validas && item.latitud !== null && item.longitud !== null)
        .map((item) => ({
          lat: Number(item.latitud),
          lon: Number(item.longitud),
          color: COLOR_GRAVEDAD[etiqueta(SEVERIDAD_SIMPLE, item.gravedad)] ?? "#7a9bb8",
        })),
    [ordenados],
  );

  // El original hace "st.stop()" si no hay lista de caída: no se pinta ni el pie ni los selects.
  const sinDatos = ciclos.length === 0 && !cargandoOpciones;

  return (
    <>
      <TituloPagina titulo="Lista de visitas por ciclo de lectura" />

      {error ? (
        <Aviso tipo="alerta" texto={error} />
      ) : sinDatos ? (
        <Aviso tipo="alerta" texto="Todavía no hay lista de caída (paso 11 del pipeline)." />
      ) : null}

      {!sinDatos && (
        <>
          <p className="v2-caption">
            {md(
              "Elige la zona regional y el ciclo (la ruta de lectura). **Orden 1 es el cliente del ciclo con más facturación en riesgo**: "
              + "por ahí empieza la cuadrilla.",
            )}
          </p>

          <Tarjeta>
            <div className="fila-1-2">
              <div className="proy-campo">
                Zona regional
                <select
                  className="filter-select"
                  value={zona}
                  onChange={(event) => setZona(event.target.value)}
                  aria-label="Zona regional"
                >
                  <option value="">(todas)</option>
                  {zonas.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="proy-campo">
                Ciclo
                <select
                  className="filter-select"
                  value={cicloElegido === null ? "" : String(cicloElegido)}
                  onChange={(event) => setCiclo(event.target.value === "" ? "" : Number(event.target.value))}
                  aria-label="Ciclo"
                  disabled={cargandoOpciones || ciclos.length === 0}
                >
                  {ciclos.map((entrada) => (
                    <option key={entrada.ciclo} value={entrada.ciclo}>
                      {entrada.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Tarjeta>

          {!datos && <div className="empty-state">Consultando la lista de caída…</div>}
        </>
      )}

      {datos && (
        <div className={cargando ? "stack atareado" : "stack"}>
          <PanelFiltrosVisita valores={valores} onChange={cambiarFiltro} municipios={municipios} lecturas={lecturas} />

          {ordenados.length === 0 ? (
            <Aviso texto="Ningún cliente de este ciclo cumple estos filtros. Prueba a quitar alguno o a elegir otra prioridad." />
          ) : (
            <>
              <Kpis items={kpis} columnas={3} />
              <Conteo
                mostrados={ordenados.length}
                filtrados={ordenados.length}
                enLista={clientesDelCiclo}
                universo={datos.total_lista}
                que="clientes de este ciclo"
                queLista="en el ciclo sin filtros"
                queUniverso="clientes en toda la lista de caída"
              />

              {conLecturaEstimada > 0 && (
                <Aviso
                  tipo="calidad"
                  texto={
                    `**${fmtN(conLecturaEstimada)}** de estos clientes tienen lectura estimada: la empresa estimó el consumo, así que su caída `
                    + "puede no ser real. Conviene confirmar la lectura antes de programar la visita (filtro *Tipo de lectura*)."
                  }
                />
              )}

              <TablaPro
                filas={filas}
                columnas={columnas}
                formato={formato}
                prioritarias={[
                  "Orden",
                  "NIU",
                  "Municipio",
                  "Dirección",
                  "Clase",
                  "Lectura",
                  "Consume ahora (kWh/mes)",
                  "Caída",
                  "Facturación que se pierde ($/mes)",
                  "Gravedad",
                  "Qué revisar",
                ]}
                movil={["Orden", "NIU", "Dirección", "Municipio", "Caída", "Facturación que se pierde ($/mes)"]}
                destacada="Facturación que se pierde ($/mes)"
                que="clientes"
                columnaId="NIU"
                ordenNumerico={ordenNumerico}
                sensibles={["NIU", "Dirección"]}
                descargar={{
                  nombre: `Descargar la ruta del ciclo ${codigoCiclo} (CSV)`,
                  archivo: `visitas_ciclo_${codigoCiclo}_${corte || ""}.csv`,
                  csv: [columnas.join(";"), ...filas.map((fila) => columnas.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n"),
                }}
                ficha={(niu) => <FichaCliente token={token} niu={niu} />}
              />

              {puntos.length > 0 && (
                <details className="v2-exp">
                  <summary>Ver estos clientes en el mapa</summary>
                  <div className="v2-exp-cuerpo">
                    <Leyenda
                      items={[
                        ["Grave", COLOR_GRAVEDAD.Grave],
                        ["Fuerte", COLOR_GRAVEDAD.Fuerte],
                        ["Moderada", COLOR_GRAVEDAD.Moderada],
                        ["Antigua (lleva meses así)", COLOR_GRAVEDAD["Antigua (lleva meses así)"]],
                      ]}
                    />
                    <MapaPuntos puntos={puntos} altura={movil ? 420 : 480} etiqueta="Clientes del ciclo con coordenadas válidas" />
                    <p className="v2-pie">
                      Cada punto es un cliente del ciclo con coordenadas válidas en el TC1. El fondo del mapa se descarga de internet; sin
                      conexión se ven solo los puntos.
                    </p>
                  </div>
                </details>
              )}

              <ComoLeer
                titulo="Cómo usar esta lista"
                texto={
                  "Los clientes van de mayor a menor facturación perdida. La columna **Qué revisar** resume lo que conviene mirar en la visita. "
                  + "No incluye autogeneradores ni área común, autoconsumos EBSA, distritos de riego y provisionales. "
                  + "El proyecto es académico: la ruta es una propuesta de orden, no hubo visitas de campo."
                }
              />
            </>
          )}
        </div>
      )}
    </>
  );
}

/** TIPO_CAIDA_SIMPLE del Streamlit (el mapa de códigos va aparte de los de negocio). */
const TIPO_CAIDA_SIMPLE: Record<string, string> = { CAIDA_CONFIRMADA: "Reciente", CAIDA_SOSTENIDA: "Lleva meses así" };

function traducirTipoCaida(veredicto: string): string {
  return TIPO_CAIDA_SIMPLE[veredicto] ?? "—";
}

/** Los seis filtros de la ruta de visitas (filtros("sop_vis") del Streamlit, por_fila=3). */
function PanelFiltrosVisita({
  valores,
  onChange,
  municipios,
  lecturas,
}: {
  valores: Record<string, string[]>;
  onChange: (clave: string, valor: string[]) => void;
  municipios: string[];
  lecturas: string[];
}) {
  const unValor = (clave: string, etiqueta: string, opciones: string[], vacio: string, formato?: (valor: string) => string): CampoFiltro => ({
    key: clave,
    etiqueta,
    opciones,
    vacio,
    ...(formato ? { formato } : {}),
  });

  return (
    <PanelFiltros
      porFila={3}
      valores={valores}
      onChange={onChange}
      campos={[
        {
          key: "pri",
          etiqueta: "Prioridad",
          opciones: PRIORIDADES_VISITA,
          defecto: ["GESTIONAR"],
          vacio: "Todas",
          formato: (valor) => PRIORIDAD_SIMPLE[valor] ?? valor,
          ayuda:
            "Por defecto solo lo que hay que gestionar; 'Seguimiento' son caídas que llevan meses en el mismo nivel y los 'Vigilar' son "
            + "estacionales o con recuperación prevista: van después en el ciclo.",
        },
        unValor("mun", "Municipio", municipios, "Todos"),
        unValor("grav", "Gravedad", Object.keys(SEVERIDAD_SIMPLE), "Todas", (valor) => SEVERIDAD_SIMPLE[valor] ?? valor),
        unValor("ten", "Tendencia", Object.keys(TRAYECTORIA_SIMPLE), "Todas", (valor) => TRAYECTORIA_SIMPLE[valor] ?? valor),
        unValor("est", "Situación", ["NUEVO", "PERSISTENTE", "REINCIDENTE"], "Todas", (valor) => ESTADO_LISTA_SIMPLE[valor] ?? valor),
        {
          ...unValor("lec", "Tipo de lectura", lecturas, "Todas"),
          ayuda: "REAL: leída del medidor. ESTIMADA: la empresa estimó el consumo; una caída con lectura estimada puede no ser real.",
        },
      ]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Registrar resultado de visitas (= "Retroalimentación" del Streamlit)         */
/* -------------------------------------------------------------------------- */

/** Cortes del resumen de retroalimentación, en el orden del original. */
const CORTES_RETRO = ["TOTAL", "severidad", "trayectoria", "estado_en_lista", "tramo_consumo", "zona", "cluster_id"];

function Retroalimentacion({ token }: { token?: string | null }) {
  const [respuesta, setRespuesta] = useState<RetroData | null>(null);
  const [cargando, setCargando] = useState(true);

  // El original lee el resumen que produce Evaluacion_retroalimentacion_gestion.ipynb y, si no hay
  // ninguno, cae en el ejemplo simulado que está en la carpeta de datos (R.gestion/retroalimentacion).
  useEffect(() => {
    let cancelado = false;
    api
      .retro(token ?? undefined)
      .then((datos) => {
        if (!cancelado) setRespuesta(datos);
      })
      .catch(() => {
        if (!cancelado) setRespuesta({ filas: [], ejemplo: false });
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const filas = respuesta?.filas ?? [];
  const ejemplo = Boolean(respuesta?.ejemplo);
  const sufijo = ejemplo ? " (simulado)" : "";
  const total = filas.find((fila) => fila.corte_por === "TOTAL");

  if (cargando) {
    return (
      <>
        <TituloPagina titulo="Resultados de las visitas contra la lista" />
        <div className="empty-state">Consultando los resultados de campo…</div>
      </>
    );
  }

  // Sin resumen real ni ejemplo: el original avisa y hace st.stop().
  if (!filas.length) {
    return (
      <>
        <TituloPagina titulo="Resultados de las visitas contra la lista" />
        <Aviso
          tipo="info"
          texto={
            "Aún no hay resultados de campo. Llenar la plantilla resultado_gestion_plantilla.csv (carpeta "
            + "07_gestion_caida/retroalimentacion de los datos) y correr Evaluacion_retroalimentacion_gestion.ipynb."
          }
        />
        <p className="v2-caption">
          Para ver un ejemplo de cómo se vería esta página con visitas registradas: python generar_ejemplo_retroalimentacion.py
        </p>
      </>
    );
  }

  const verificados = Number(total?.verificados ?? 0);
  const porcentaje = (clave: string): string => {
    const valor = Number(total?.[clave] ?? 0);
    return verificados ? `${Math.round((valor / verificados) * 100)} %` : "—";
  };

  const kpis: ItemKpi[] = [
    { titulo: `Clientes visitados${sufijo}`, valor: fmtN(Number(total?.visitados ?? 0)), tono: "marca" },
    {
      titulo: `Con un problema que la empresa puede corregir${sufijo}`,
      valor: porcentaje("con_causa_gestionable"),
      tono: "g",
      ayuda: "De los verificados: medidor dañado o manipulado, error de lectura o facturación, falla de red, conexión irregular.",
    },
    {
      titulo: `Caída real, sin nada que corregir${sufijo}`,
      valor: porcentaje("caida_real_sin_gestion"),
      ayuda: "Predio desocupado, cambio de actividad, autogeneración o cliente retirado: la lista acertó, pero no hay recuperación.",
    },
    { titulo: `Sin novedad (falsa alarma)${sufijo}`, valor: porcentaje("sin_novedad") },
  ];

  return (
    <>
      <TituloPagina titulo="Resultados de las visitas contra la lista" />

      {/* El aviso de "sin resultados" se ve antes de caer en el ejemplo, igual que en el original. */}
      {ejemplo && (
        <Aviso
          tipo="info"
          texto={
            "Aún no hay resultados de campo. Llenar la plantilla resultado_gestion_plantilla.csv (carpeta "
            + "07_gestion_caida/retroalimentacion de los datos) y correr Evaluacion_retroalimentacion_gestion.ipynb."
          }
        />
      )}
      {ejemplo && (
        <Aviso
          tipo="ejemplo"
          texto={
            "**EJEMPLO ILUSTRATIVO — RESULTADOS SIMULADOS.** Lo que sigue NO son visitas reales: es una muestra de clientes de la lista "
            + "a la que se le asignó un hallazgo al azar, solo para mostrar cómo se vería esta página si la empresa registrara las "
            + "visitas. Todos los grupos se simularon con las mismas probabilidades, así que las diferencias entre grupos son azar y "
            + "ninguna cifra de aquí mide la calidad de la lista."
          }
        />
      )}

      {total && (
        <>
          <Kpis items={kpis} columnas={4} />
          {total.valor_riesgo_gestionable_mes !== undefined && (
            <p className="v2-caption">
              {`Facturación asociada a los casos con problema corregible${sufijo}: ${pesos(Number(total.valor_riesgo_gestionable_mes))}/mes.`}
            </p>
          )}
        </>
      )}

      <p className="v2-caption">
        {md(
          "precision_gestionable: % de verificados con un problema que la empresa puede corregir. precision_caida_real: % donde la caída "
          + "era real, gestionable o no. sin_novedad: falsos positivos."
          + (ejemplo
            ? " Con visitas reales, un grupo con precisión baja de forma sostenida debe bajar en el orden de la lista."
            : ""),
        )}
      </p>

      {CORTES_RETRO.map((cortePor) => {
        const bloque = filas.filter((fila) => fila.corte_por === cortePor);
        if (!bloque.length) return null;
        const columnas = Object.keys(bloque[0]).filter((columna) => columna !== "corte_por");
        return (
          <Tarjeta titulo={`Por ${cortePor.toLowerCase().replaceAll("_", " ")}${sufijo}`} key={cortePor}>
            <TablaSimple columnas={columnas} filas={bloque} formato={formatoTabla(bloque, columnas)} />
          </Tarjeta>
        );
      })}
    </>
  );
}
