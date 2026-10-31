import { useEffect, useMemo, useState } from "react";
import { api, type CeroData, type CeroItem } from "../lib/api";
import { usePresentation } from "../app/Presentation";
import { useCorte } from "../lib/useCorte";
import { Aviso, ComoLeer, Kpis, Tarjeta, TituloPagina, type ItemKpi } from "./v2/ui";
import { PanelFiltros, type CampoFiltro } from "./v2/filtros";
import { TablaPro, type Fila } from "./v2/TablaPro";
import { FichaCliente } from "./v2/FichaCliente";
import { Conteo, Pie, md, useEsMovil } from "../charts/textos";
import { Barras } from "../charts/Graficas";
import { AZUL } from "../charts/paleta";
import { csvCelda, energia, fmtMedida, fmtN, formatoTabla, mesLargo, pesos } from "../lib/format";
import {
  AYUDA_MUNICIPIO,
  AYUDA_ZONA_REGIONAL,
  QUE_HACER_CERO,
  SITUACION_CERO,
  TRAMOS_CERO,
  ZONAS_REGIONALES,
  situacionCero,
  tamanoPorConsumo,
  tramoCero,
} from "../lib/negocio";

/**
 * Sección "Clientes sin consumo" del Streamlit: clientes que llevan toda su ventana en cero o casi cero,
 * con lo que consumían y facturaban antes, el tiempo que llevan así y la sugerencia de qué hacer.
 * La API entrega la lista completa y aquí se filtra, se ordena y se calculan los indicadores.
 */

type Derivada = CeroItem & { situacion: string; tramo: string; tamano: string };

const DEFECTO: Record<string, string[]> = { zon: [], mun: [], sit: [], tie: [], tam: [] };
const TAMANOS_CERO = ["Grande", "Mediano", "Pequeño"];

const COLUMNAS = [
  "NIU",
  "Municipio",
  "Zona regional",
  "Clase",
  "Tamaño",
  "Situación",
  "Consumía antes (kWh/mes)",
  "Consume ahora (kWh/mes)",
  "Facturaba antes ($/mes)",
  "Tarifa ($/kWh)",
  "Último mes con consumo",
  "Meses sin consumo",
  "Qué hacer (sugerido)",
];

const COLUMNAS_RESUMEN = (esConsumo: boolean): string[] =>
  esConsumo
    ? ["Tiempo sin consumo", "Qué hacer (sugerido)", "Clientes", "Consumían antes (kWh/mes)", "Facturaban antes ($/mes)"]
    : ["Tiempo sin consumo", "Qué hacer (sugerido)", "Clientes", "Facturaban antes ($/mes)", "Consumían antes (kWh/mes)"];

export function SinConsumo({ token }: { token?: string | null }) {
  const { measure } = usePresentation();
  const movil = useEsMovil();
  const corte = useCorte(token);
  const esConsumo = measure === "Consumo";
  const colVis = esConsumo ? "Consumía antes (kWh/mes)" : "Facturaba antes ($/mes)";

  const [datos, setDatos] = useState<CeroData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string[]>>({ ...DEFECTO });

  useEffect(() => {
    let cancelado = false;
    api
      .zero(token ?? undefined)
      .then((respuesta) => {
        if (!cancelado) {
          setDatos(respuesta);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar los clientes sin consumo.");
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Lo que se deriva de cada fila (mismas reglas que np.select del Streamlit).
  const filas = useMemo<Derivada[]>(
    () =>
      (datos?.items ?? []).map((item) => ({
        ...item,
        situacion: situacionCero(item.consumo_reciente_kwh),
        tramo: tramoCero(item.meses_en_cero),
        tamano: tamanoPorConsumo(item.consumo_referencia_kwh),
      })),
    [datos],
  );

  const permitidos = useMemo(() => {
    const zonales = valores.zon;
    return new Set(
      filas
        .filter((fila) => zonales.length === 0 || zonales.includes(fila.zona_regional))
        .map((fila) => fila.municipio)
        .filter((municipio) => municipio !== ""),
    );
  }, [filas, valores.zon]);

  const cambiarFiltro = (clave: string, valor: string[]): void => {
    setValores((actual) => {
      const siguiente = { ...actual, [clave]: valor };
      if (clave === "zon") {
        // Al cambiar la zona, los municipios que ya no quedan disponibles se quitan de la selección.
        const zonas = new Set(valor);
        const validos = new Set(
          filas
            .filter((fila) => zonas.size === 0 || zonas.has(fila.zona_regional))
            .map((fila) => fila.municipio)
            .filter((municipio) => municipio !== ""),
        );
        siguiente.mun = (actual.mun ?? []).filter((municipio) => validos.has(municipio));
      }
      return siguiente;
    });
  };

  const titulo = <TituloPagina titulo="Clientes sin consumo (en cero o casi cero)" />;
  const caption = (
    <p className="v2-caption">
      {md(
        `Periodo facturado **${mesLargo(corte || "—")}**. Clientes que llevan toda su ventana reciente en cero o casi cero: `
        + "no se cuentan como caída, pero sí importan a comercial.",
      )}
    </p>
  );

  if (error) return <div className="empty-state error" role="alert">{error}</div>;
  if (!datos) {
    return (
      <div className="stack">
        <div>
          {titulo}
          {caption}
        </div>
        <div className="empty-state cargando" role="status">Cargando los clientes sin consumo…</div>
      </div>
    );
  }
  if (!filas.length) {
    return (
      <div className="stack">
        <div>
          {titulo}
          {caption}
        </div>
        <Aviso texto="No hay clientes en cero sostenido en este corte (o la lista no se ha recalculado con la versión actual)." />
      </div>
    );
  }

  // Indicadores y resumen por tiempo sin consumo: se calculan sobre toda la lista, como en el Streamlit.
  const enCero = filas.filter((fila) => fila.situacion === "En cero").length;
  const sumaReferencia = filas.reduce((suma, fila) => suma + fila.consumo_referencia_kwh, 0);
  const sumaValor = filas.reduce((suma, fila) => suma + fila.valor_facturaba_antes_mes, 0);
  const porTramo = TRAMOS_CERO.map((tramo) => {
    const grupo = filas.filter((fila) => fila.tramo === tramo);
    return {
      tramo,
      clientes: grupo.length,
      referencia: grupo.reduce((suma, fila) => suma + fila.consumo_referencia_kwh, 0),
      valor: grupo.reduce((suma, fila) => suma + fila.valor_facturaba_antes_mes, 0),
    };
  });

  const kpis: ItemKpi[] = [
    { titulo: "Clientes sin consumo", valor: fmtN(filas.length), tono: "marca" },
    { titulo: "En cero", valor: fmtN(enCero) },
    {
      titulo: "Casi cero",
      valor: fmtN(filas.length - enCero),
      ayuda: "Consumen algo, pero ningún mes de la ventana pasa de 10 kWh ni del 5 % de lo que consumían.",
    },
    {
      titulo: esConsumo ? "Consumían antes" : "Facturaban antes",
      valor: fmtMedida(esConsumo ? sumaReferencia : sumaValor, measure),
      unidad: "/mes",
      tono: "g",
      nota: esConsumo ? `equivale a ${pesos(sumaValor)}/mes` : `equivale a ${energia(sumaReferencia)}/mes`,
    },
  ];

  // Filtros (filtros("com_cero", ..., por_fila=5)).
  const zonasPresentes = new Set(filas.map((fila) => fila.zona_regional));
  const zonasOpciones = [
    ...ZONAS_REGIONALES.filter((zona) => zonasPresentes.has(zona)),
    ...[...zonasPresentes].filter((zona) => !ZONAS_REGIONALES.includes(zona)).sort(),
  ];
  const tamanoPresentes = TAMANOS_CERO.filter((tamano) => filas.some((fila) => fila.tamano === tamano));
  const campos: CampoFiltro[] = [
    { key: "zon", etiqueta: "Zona regional", opciones: zonasOpciones, vacio: "Todas", ayuda: AYUDA_ZONA_REGIONAL },
    { key: "mun", etiqueta: "Municipio", opciones: [...permitidos].sort(), vacio: "Todos", ayuda: AYUDA_MUNICIPIO },
    { key: "sit", etiqueta: "Situación", opciones: SITUACION_CERO, vacio: "Todas" },
    { key: "tie", etiqueta: "Tiempo sin consumo", opciones: TRAMOS_CERO, vacio: "Todos" },
    { key: "tam", etiqueta: "Tamaño (por lo que consumía)", opciones: tamanoPresentes, vacio: "Todos" },
  ];

  const { zon, mun, sit, tie, tam } = valores;
  const claveOrden = esConsumo ? "consumo_referencia_kwh" : "valor_facturaba_antes_mes";
  const filtradas = filas
    .filter(
      (fila) =>
        (zon.length === 0 || zon.includes(fila.zona_regional))
        && (mun.length === 0 || mun.includes(fila.municipio))
        && (sit.length === 0 || sit.includes(fila.situacion))
        && (tie.length === 0 || tie.includes(fila.tramo))
        && (tam.length === 0 || tam.includes(fila.tamano)),
    )
    .sort((a, b) => b[claveOrden] - a[claveOrden]);

  const filasTabla: Fila[] = filtradas.map((fila) => ({
    NIU: fila.niu,
    Municipio: fila.municipio || "—",
    "Zona regional": fila.zona_regional || "—",
    Clase: fila.clase || "—",
    "Tamaño": fila.tamano,
    "Situación": fila.situacion,
    "Consumía antes (kWh/mes)": Math.round(fila.consumo_referencia_kwh),
    "Consume ahora (kWh/mes)": Math.round(fila.consumo_reciente_kwh * 10) / 10,
    "Facturaba antes ($/mes)": Math.round(fila.valor_facturaba_antes_mes),
    "Tarifa ($/kWh)": fila.tarifa_kwh,
    "Último mes con consumo": fila.ultimo_mes_con_consumo || "sin consumo en la serie",
    "Meses sin consumo": fila.meses_en_cero,
    "Qué hacer (sugerido)": QUE_HACER_CERO[fila.tramo],
  }));

  // El formato de cada celda sigue formato_tabla: tarifa, kWh y pesos según el nombre de la columna.
  const formato = formatoTabla(filasTabla, COLUMNAS);

  const descarga = filasTabla.length
    ? {
        nombre: "Descargar clientes sin consumo (CSV)",
        archivo: `clientes_sin_consumo_${corte || ""}.csv`,
        csv: [COLUMNAS.join(";"), ...filasTabla.map((fila) => COLUMNAS.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n"),
      }
    : null;

  return (
    <div className="stack">
      <div>
        {titulo}
        {caption}
      </div>

      <Kpis items={kpis} columnas={4} />

      <Tarjeta titulo="Cuántos hay según el tiempo que llevan sin consumo" plegable>
        <div className="fila-2-3">
          <Barras
            serie={porTramo.map((fila) => [fila.tramo, fila.clientes])}
            opciones={{ color: AZUL, nombreValor: "Clientes", nombreCategoria: "Tiempo sin consumo", altoFila: 34 }}
          />
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  {COLUMNAS_RESUMEN(esConsumo).map((columna) => (
                    <th key={columna}>{columna}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porTramo.map((fila) => (
                  <tr key={fila.tramo}>
                    <td>{fila.tramo}</td>
                    <td>{QUE_HACER_CERO[fila.tramo]}</td>
                    <td>{fmtN(fila.clientes)}</td>
                    {esConsumo ? (
                      <>
                        <td>{fmtN(Math.round(fila.referencia))}</td>
                        <td>{pesos(Math.round(fila.valor))}</td>
                      </>
                    ) : (
                      <>
                        <td>{pesos(Math.round(fila.valor))}</td>
                        <td>{fmtN(Math.round(fila.referencia))}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Pie
          texto={md(
            "**Meses sin consumo**: los transcurridos desde el último mes en que el cliente consumió por encima de su umbral de casi cero. "
            + "**Qué hacer** es una sugerencia por ese tiempo; el proyecto es académico y no hay gestión real de clientes.",
          )}
        />
      </Tarjeta>

      <PanelFiltros campos={campos} valores={valores} onChange={cambiarFiltro} movil={movil} porFila={5} />

      <Conteo
        mostrados={filasTabla.length}
        filtrados={filtradas.length}
        enLista={filas.length}
        que="clientes sin consumo"
        queLista="en total"
      />

      <TablaPro
        filas={filasTabla}
        columnas={COLUMNAS}
        formato={formato}
        prioritarias={[
          "NIU",
          "Municipio",
          "Clase",
          "Tamaño",
          "Situación",
          "Consumía antes (kWh/mes)",
          "Facturaba antes ($/mes)",
          "Último mes con consumo",
          "Meses sin consumo",
          "Qué hacer (sugerido)",
        ]}
        movil={["NIU", "Municipio", "Situación", colVis, "Meses sin consumo", "Qué hacer (sugerido)"]}
        destacada={colVis}
        que="clientes sin consumo"
        columnaId="NIU"
        sensibles={["NIU"]}
        descargar={descarga}
        ficha={(niu) => <FichaCliente token={token} niu={niu} />}
      />

      <ComoLeer
        titulo="Qué clientes entran aquí"
        texto={
          "Clientes que llevan toda su ventana reciente (3 meses los de lectura mensual, 6 los rurales de lectura trimestral) "
          + "**en cero o casi cero**: ningún mes pasa de 10 kWh ni del 5 % de lo que consumían. No se cuentan como caída de consumo "
          + "(no hay una caída que una cuadrilla pueda revisar) y no suman a la facturación en riesgo, pero sí importan a comercial: "
          + "aquí está lo que facturaban antes (referencia del periodo anterior o del mismo periodo del año pasado, con su tarifa real), "
          + "para decidir qué hacer con cada uno."
        }
      />
    </div>
  );
}
