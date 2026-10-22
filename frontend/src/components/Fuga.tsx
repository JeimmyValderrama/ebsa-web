import { useEffect, useMemo, useState } from "react";
import { api, type FugaData } from "../lib/api";
import { usePresentation } from "../app/Presentation";
import { Aviso, ComoLeer, Kpis, Tarjeta, TituloPagina, type ItemKpi } from "./v2/ui";
import { PanelFiltros, type CampoFiltro } from "./v2/filtros";
import { TablaPro, type Fila } from "./v2/TablaPro";
import { FichaCliente } from "./v2/FichaCliente";
import { Conteo, md, useEsMovil } from "../charts/textos";
import { csvCelda, energia, fmtN, formatoTabla, mesLargo, pesos, probPct } from "../lib/format";
import { AYUDA_MUNICIPIO, AYUDA_ZONA_REGIONAL, ESTADO_LISTA_SIMPLE, etiqueta } from "../lib/negocio";

/**
 * Sección "Clientes con probabilidad de fuga a otro comercializador" del Streamlit: la lista va de mayor a menor
 * pérdida esperada (kWh o pesos según la medida), la tabla muestra los primeros 1.000 y la descarga trae la lista
 * filtrada completa desde la API. Al pie, los grandes clientes del mercado no regulado que se acompañan aparte.
 */

const DEFECTO: Record<string, string[]> = { niv: ["ALTO", "MEDIO"], zon: [], mun: [], cla: [], tam: [] };
const NIVELES = ["ALTO", "MEDIO", "BAJO"];

const COLUMNAS = [
  "Prioridad",
  "NIU",
  "Municipio",
  "Zona regional",
  "Ciclo",
  "Clase",
  "Tamaño",
  "Consumo promedio 6 meses (kWh/mes)",
  "Factura promedio 6 meses ($/mes)",
  "Probabilidad de fuga (6 meses)",
  "Riesgo",
  "Consumo esperado en riesgo (kWh/mes)",
  "Pérdida esperada ($/mes)",
  "Señales observadas",
  "Situación",
];

const COLUMNAS_VIGILANCIA = [
  "NIU",
  "Municipio",
  "Por qué está aquí",
  "Clase",
  "Consumo promedio (kWh/mes)",
  "Factura ($/mes)",
  "Probabilidad de fuga",
  "Probabilidad (6 meses)",
];

const AVISO_LIMITE =
  "Con unos 80 clientes que se han ido, el modelo **no ordena mejor que listar a los clientes por tamaño** (consumo de 12 meses); "
  + "en validación, de los 100 primeros se fueron 4. Es una lista de clientes grandes con señales para priorizar contactos, "
  + "no una predicción de quién se va; la pérdida esperada es un orden de magnitud.";

const COMO_LEER =
  "El modelo mira cómo se comportaron los clientes que ya se fueron y busca los que hoy se parecen: "
  + "caída reciente, meses en cero, zona con más salidas, tamaño. "
  + "ALTO es el 1 % con mayor puntaje del modelo y MEDIO llega hasta el 5 %; nadie por debajo del riesgo promedio entra. "
  + "La probabilidad es a 6 meses y está calibrada con lo que pasó en validación (de los clientes con ese puntaje, qué fracción "
  + "se fue). Tiene un tope: a los pocos clientes con puntaje más alto que cualquiera visto en validación se les muestra la "
  + "probabilidad máxima comprobada, no una mayor; la pérdida esperada es probabilidad × lo que factura.\n\n"
  + "**Cómo leerlo:** con unos 80 clientes que se han ido, el modelo no ordena mejor que listar a los clientes por tamaño "
  + "(consumo de 12 meses); en validación, de los 100 primeros se fueron 4. Es una lista de clientes grandes con señales para "
  + "priorizar contactos, no una predicción de quién se va; la pérdida esperada es un orden de magnitud.";

export function Fuga({ token }: { token?: string | null }) {
  const { measure } = usePresentation();
  const movil = useEsMovil();
  const esConsumo = measure === "Consumo";
  const colProm = esConsumo ? "Consumo promedio 6 meses (kWh/mes)" : "Factura promedio 6 meses ($/mes)";
  const colEsperado = esConsumo ? "Consumo esperado en riesgo (kWh/mes)" : "Pérdida esperada ($/mes)";

  const [datos, setDatos] = useState<FugaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string[]>>({ ...DEFECTO });

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    api
      .fuga(token ?? undefined, {
        medida: measure,
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
  }, [measure, token, valores]);

  const corte = datos?.corte ?? "";
  const { zon } = valores;
  const permitidos = useMemo(
    () => new Set((datos?.opciones.municipios ?? []).filter((fila) => zon.length === 0 || fila.zonas.some((z) => zon.includes(z))).map((fila) => fila.municipio)),
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

  const titulo = <TituloPagina titulo="Clientes con probabilidad de fuga a otro comercializador" />;
  const caption = (
    <p className="v2-caption">
      {md(
        `Corte **${mesLargo(corte || "—")}**. **Riesgo ALTO: contactar primero. MEDIO: vigilar y contactar según valor.** `
        + "No significa que estos clientes se vayan a ir: es una lista para priorizar contactos.",
      )}
    </p>
  );

  if (error) return <div className="empty-state">{error}</div>;
  if (!datos) {
    return (
      <div className="stack">
        <div>
          {titulo}
          {caption}
        </div>
        <div className="empty-state">
          {cargando ? "Consultando el riesgo de fuga del corte vigente…" : "Todavía no hay riesgo de fuga calculado (paso 14 del pipeline)."}
        </div>
      </div>
    );
  }
  if (datos.total_lista === 0) {
    return (
      <div className="stack">
        <div>
          {titulo}
          {caption}
        </div>
        <Aviso texto="Todavía no hay riesgo de fuga calculado (paso 14 del pipeline)." tipo="alerta" />
      </div>
    );
  }

  const { resumen } = datos;
  const kpis: ItemKpi[] = esConsumo
    ? [
        { titulo: "Clientes", valor: fmtN(resumen.clientes), tono: "marca" },
        {
          titulo: "Consumen (promedio 6 meses)",
          valor: energia(resumen.consumo_6m),
          unidad: "/mes",
          nota: `facturan ${pesos(resumen.valor_riesgo)}/mes`,
        },
        {
          titulo: "Consumo esperado en riesgo",
          valor: energia(resumen.consumo_esperado),
          unidad: "/mes",
          tono: "g",
          nota: "Probabilidad × lo que consume: orden de magnitud",
          ayuda:
            "Probabilidad de fuga a 6 meses × consumo promedio de 6 meses de cada cliente, en kWh. Misma definición que la pérdida "
            + "esperada en pesos, medida en energía en lugar de con la tarifa.",
        },
      ]
    : [
        { titulo: "Clientes", valor: fmtN(resumen.clientes), tono: "marca" },
        {
          titulo: "Facturan (promedio 6 meses)",
          valor: pesos(resumen.valor_riesgo),
          unidad: "/mes",
          nota: `consumen ${energia(resumen.consumo_6m)}/mes`,
        },
        {
          titulo: "Pérdida esperada",
          valor: pesos(resumen.valor_esperado),
          unidad: "/mes",
          tono: "g",
          nota: "Probabilidad × lo que factura: orden de magnitud",
        },
      ];

  const campos: CampoFiltro[] = [
    { key: "niv", etiqueta: "Probabilidad de fuga", opciones: NIVELES, defecto: DEFECTO.niv, vacio: "Todas" },
    {
      key: "zon",
      etiqueta: "Zona regional",
      opciones: datos.opciones.zonas,
      vacio: "Todas",
      ayuda: AYUDA_ZONA_REGIONAL,
      visible: datos.opciones.zonas.length > 0,
    },
    { key: "mun", etiqueta: "Municipio", opciones: [...permitidos].sort(), vacio: "Todos", ayuda: AYUDA_MUNICIPIO },
    { key: "cla", etiqueta: "Clase de servicio", opciones: datos.opciones.clases, vacio: "Todas" },
    { key: "tam", etiqueta: "Tamaño (por lo que consumía)", opciones: datos.opciones.tamanos, vacio: "Todos" },
  ];

  const filasTabla: Fila[] = datos.items.map((fila) => ({
    Prioridad: fila.ranking,
    NIU: fila.niu,
    Municipio: fila.municipio || "—",
    "Zona regional": fila.zona_regional || "—",
    Ciclo: fila.ciclo || "—",
    Clase: fila.clase || "—",
    "Tamaño": fila.tamano,
    "Consumo promedio 6 meses (kWh/mes)": Math.round(fila.consumo_6m),
    "Factura promedio 6 meses ($/mes)": Math.round(fila.valor_riesgo),
    "Probabilidad de fuga (6 meses)": probPct(fila.prob),
    Riesgo: fila.riesgo,
    "Consumo esperado en riesgo (kWh/mes)": Math.round(fila.consumo_esperado),
    "Pérdida esperada ($/mes)": Math.round(fila.valor_esperado),
    "Señales observadas": fila.senales,
    "Situación": etiqueta(ESTADO_LISTA_SIMPLE, fila.situacion),
  }));
  const ordenNumerico: Record<string, number[]> = {
    "Probabilidad de fuga (6 meses)": datos.items.map((fila) => fila.prob),
  };
  const formato = formatoTabla(filasTabla, COLUMNAS);

  const descargar = (): void => {
    setErrorDescarga(null);
    api
      .fugaCsv(token ?? undefined, {
        medida: measure,
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
        enlace.download = `clientes_riesgo_de_irse_${corte}.csv`;
        enlace.click();
        URL.revokeObjectURL(url);
      })
      .catch((cause: unknown) => setErrorDescarga(cause instanceof Error ? cause.message : "No fue posible descargar la lista."));
  };

  const filasVigilancia: Fila[] = datos.vigilancia.map((fila) => ({
    NIU: fila.niu,
    Municipio: fila.municipio || "—",
    "Por qué está aquí": fila.motivo,
    Clase: fila.clase || "—",
    "Consumo promedio (kWh/mes)": fila.consumo_12m === null ? null : Math.round(fila.consumo_12m),
    "Factura ($/mes)": fila.valor_facturado_mes === null ? null : Math.round(fila.valor_facturado_mes),
    "Probabilidad de fuga": fila.riesgo || "Sin puntuar",
    "Probabilidad (6 meses)": probPct(fila.prob),
  }));
  const colVig = esConsumo ? "Consumo promedio (kWh/mes)" : "Factura ($/mes)";
  const formatoVigilancia = formatoTabla(filasVigilancia, COLUMNAS_VIGILANCIA);
  const descargaVigilancia = filasVigilancia.length
    ? {
        nombre: "Descargar grandes clientes (CSV)",
        archivo: `grandes_clientes_no_regulados_${corte}.csv`,
        csv: [
          COLUMNAS_VIGILANCIA.join(";"),
          ...filasVigilancia.map((fila) => COLUMNAS_VIGILANCIA.map((columna) => csvCelda(fila[columna])).join(";")),
        ].join("\r\n"),
      }
    : null;

  return (
    <div className="stack">
      <div>
        {titulo}
        {caption}
      </div>

      <PanelFiltros campos={campos} valores={valores} onChange={cambiarFiltro} movil={movil} porFila={5} />

      <Kpis items={kpis} columnas={3} />

      <Conteo
        mostrados={filasTabla.length}
        filtrados={datos.total_lista}
        enLista={datos.alto_medio}
        universo={datos.total_lista}
        que="clientes con riesgo"
        queLista="con riesgo ALTO o MEDIO en total"
        queUniverso="clientes evaluados por el modelo"
      />

      <div>
        <button type="button" className="ghost-button" onClick={descargar} title="La lista filtrada completa, no solo la tabla">
          Descargar esta lista completa (CSV)
        </button>
        {errorDescarga ? <p className="v2-pie">{errorDescarga}</p> : null}
      </div>

      <TablaPro
        filas={filasTabla}
        columnas={COLUMNAS}
        formato={formato}
        prioritarias={["Prioridad", "NIU", "Municipio", "Clase", "Tamaño", colProm, "Probabilidad de fuga (6 meses)", "Riesgo", colEsperado, "Señales observadas"]}
        movil={["NIU", "Municipio", "Clase", "Riesgo", "Probabilidad de fuga (6 meses)", colEsperado, "Señales observadas"]}
        destacada={colEsperado}
        que="clientes"
        columnaId="NIU"
        ordenNumerico={ordenNumerico}
        sensibles={["NIU"]}
        ficha={(niu) => <FichaCliente token={token} niu={niu} />}
      />

      <Aviso texto={AVISO_LIMITE} tipo="limite" />

      <Tarjeta
        titulo="Grandes clientes del mercado no regulado (seguimiento comercial)"
        bajada={
          "Clientes del ciclo 33, de clase no regulada o con más de 55.000 kWh/mes. Por su tamaño pueden negociar con cualquier "
          + "comercializador, así que no van en la lista de arriba: se acompañan desde el área comercial."
        }
        plegable
      >
        {filasVigilancia.length === 0 ? (
          <Aviso texto="Hoy no hay clientes en vigilancia." />
        ) : (
          <TablaPro
            filas={filasVigilancia}
            columnas={COLUMNAS_VIGILANCIA}
            formato={formatoVigilancia}
            movil={["NIU", "Municipio", "Por qué está aquí", colVig, "Probabilidad de fuga", "Probabilidad (6 meses)"]}
            que="clientes"
            columnaId="NIU"
            ordenNumerico={{ "Probabilidad (6 meses)": datos.vigilancia.map((fila) => fila.prob ?? 0) }}
            sensibles={["NIU"]}
            descargar={descargaVigilancia}
            ficha={(niu) => <FichaCliente token={token} niu={niu} />}
          />
        )}
      </Tarjeta>

      <ComoLeer titulo="Cómo se calcula la probabilidad y cómo leerla" texto={COMO_LEER} />
    </div>
  );
}
