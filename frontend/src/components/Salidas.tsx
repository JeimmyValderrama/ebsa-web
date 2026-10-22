import { useEffect, useMemo, useState } from "react";
import { api, type SalidasData } from "../lib/api";
import { usePresentation } from "../app/Presentation";
import { Aviso, Kpis, TituloPagina, type ItemKpi } from "./v2/ui";
import { PanelFiltros, type CampoFiltro } from "./v2/filtros";
import { TablaPro, type Fila } from "./v2/TablaPro";
import { FichaCliente } from "./v2/FichaCliente";
import { md, useEsMovil } from "../charts/textos";
import { csvCelda, energia, fmtN, formatoTabla, pesos } from "../lib/format";
import { ESTADO_OTRO_TEXTO } from "../lib/negocio";

/**
 * Sección "Clientes que ya se fueron" del Streamlit: el archivo de otros comercializadores cruzado con la historia
 * de consumo en EBSA, con los estados, lo que consumían y facturaban antes de irse y el perfil de los que se fueron.
 * El nombre del comercializador que atiende hoy a cada cliente no se muestra ni se descarga (pedido de negocio).
 */

const DEFECTO: Record<string, string[]> = { est: [], mun: [] };

const COLUMNAS_CONSUMO = [
  "NIU",
  "Estado",
  "Municipio",
  "Zona",
  "Clase",
  "Desde",
  "Mes de salida estimado",
  "Consumía antes (kWh/mes)",
  "Facturaba antes ($/mes)",
];

/** En la medida de facturación la columna de pesos va antes que la de energía. */
const COLUMNAS_PESOS = [
  "NIU",
  "Estado",
  "Municipio",
  "Zona",
  "Clase",
  "Desde",
  "Mes de salida estimado",
  "Facturaba antes ($/mes)",
  "Consumía antes (kWh/mes)",
];

const COLUMNAS_PERFIL = ["valor", "n", "pct"];

const PIE =
  "Sirve para saber a quién ya no vale la pena buscar, cuánto consumían y cómo eran, para reconocer a los que se parecen. "
  + "Por política de la empresa no se muestra qué comercializador atiende hoy a cada cliente. "
  + "Los clientes en cero o casi cero (que siguen conectados pero ya no consumen) están en la sección *Clientes sin consumo*.";

export function Salidas({ token }: { token?: string | null }) {
  const { measure } = usePresentation();
  const movil = useEsMovil();
  const esConsumo = measure === "Consumo";
  const colAntes = esConsumo ? "Consumía antes (kWh/mes)" : "Facturaba antes ($/mes)";

  const [datos, setDatos] = useState<SalidasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [valores, setValores] = useState<Record<string, string[]>>({ ...DEFECTO });

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    api
      .salidas(token ?? undefined)
      .then((respuesta) => {
        if (cancelado) return;
        setDatos(respuesta);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar los clientes que ya se fueron.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const estados = useMemo(() => datos?.resumen.estados.map((entrada) => entrada.estado) ?? [], [datos]);
  const municipios = useMemo(
    () => [...new Set((datos?.items ?? []).map((item) => item.municipio).filter((municipio) => municipio !== ""))].sort(),
    [datos],
  );

  const titulo = (
    <TituloPagina
      titulo="Clientes que ya están con otro comercializador"
      bajada="Viene del archivo de otros comercializadores que entrega la empresa, cruzado con la historia de consumo en EBSA."
    />
  );

  if (error) return <div className="empty-state">{error}</div>;
  if (!datos) {
    return (
      <div className="stack">
        {titulo}
        <div className="empty-state">{cargando ? "Consultando el archivo de otros comercializadores…" : "No hay archivo de otros comercializadores en 00_otros_comercializadores."}</div>
      </div>
    );
  }
  if (datos.total === 0) {
    return (
      <div className="stack">
        {titulo}
        <Aviso texto="No hay archivo de otros comercializadores en 00_otros_comercializadores." tipo="calidad" />
      </div>
    );
  }

  const { resumen } = datos;
  const kpis: ItemKpi[] = resumen.estados.map((entrada) => ({
    titulo: entrada.estado.length < 30 ? entrada.estado : entrada.estado.slice(0, 28) + "…",
    valor: fmtN(entrada.clientes),
    ayuda: ESTADO_OTRO_TEXTO[entrada.estado] ?? entrada.estado,
    tono: entrada.estado.startsWith("CON OTRO") ? "alerta" : undefined,
  }));

  const conHistoria = resumen.con_historia_consumo > 0 || resumen.con_historia_valor > 0;
  const lineaHistoria = esConsumo
    ? `Consumían antes de irse **${energia(resumen.consumo_antes)}/mes** (sobre ${fmtN(resumen.con_historia_consumo)} clientes con historia en EBSA; facturaban ${pesos(resumen.valor_antes)}/mes).`
    : `Facturaban antes de irse **${pesos(resumen.valor_antes)}/mes** (sobre ${fmtN(resumen.con_historia_valor)} clientes con historia en EBSA; consumían ${energia(resumen.consumo_antes)}/mes).`;

  const campos: CampoFiltro[] = [
    { key: "est", etiqueta: "Estado", opciones: estados, vacio: "Todos" },
    { key: "mun", etiqueta: "Municipio", opciones: municipios, vacio: "Todos" },
  ];

  const { est, mun } = valores;
  const filtradas = datos.items.filter(
    (item) => (est.length === 0 || est.includes(item.estado)) && (mun.length === 0 || mun.includes(item.municipio)),
  );

  const columnas = esConsumo ? COLUMNAS_CONSUMO : COLUMNAS_PESOS;
  const filasTabla: Fila[] = filtradas.map((item) => ({
    NIU: item.niu,
    Estado: item.estado,
    Municipio: item.municipio || "—",
    Zona: item.zona || "—",
    Clase: item.clase || "—",
    Desde: item.desde || "—",
    "Mes de salida estimado": item.mes_salida || "—",
    "Consumía antes (kWh/mes)": item.consumo_antes === null ? null : Math.round(item.consumo_antes),
    "Facturaba antes ($/mes)": item.valor_antes === null ? null : Math.round(item.valor_antes),
  }));
  const formato = formatoTabla(filasTabla, columnas);
  const descarga = filasTabla.length
    ? {
        nombre: "Descargar (CSV)",
        archivo: "clientes_con_otro_comercializador.csv",
        csv: [columnas.join(";"), ...filasTabla.map((fila) => columnas.map((columna) => csvCelda(fila[columna])).join(";"))].join("\r\n"),
      }
    : null;

  // El perfil de los que se fueron: una tabla corta por dimensión, en el orden del archivo.
  const perfilPorDimension: Array<{ dimension: string; filas: Fila[] }> = [];
  for (const entrada of datos.perfil) {
    const ultima = perfilPorDimension[perfilPorDimension.length - 1];
    const fila: Fila = { valor: entrada.valor, n: entrada.n, pct: entrada.pct };
    if (ultima && ultima.dimension === entrada.dimension) ultima.filas.push(fila);
    else perfilPorDimension.push({ dimension: entrada.dimension, filas: [fila] });
  }
  const formatoPerfil = formatoTabla(datos.perfil.map((entrada) => ({ valor: entrada.valor, n: entrada.n, pct: entrada.pct })), COLUMNAS_PERFIL);

  return (
    <div className="stack">
      {titulo}

      <Kpis items={kpis} columnas={Math.min(resumen.estados.length, 4)} />

      {conHistoria ? <p>{md(lineaHistoria)}</p> : null}

      <PanelFiltros campos={campos} valores={valores} onChange={(clave, valor) => setValores((actual) => ({ ...actual, [clave]: valor }))} movil={movil} porFila={2} />

      <TablaPro
        filas={filasTabla}
        columnas={columnas}
        formato={formato}
        movil={["NIU", "Estado", "Municipio", "Desde", colAntes]}
        destacada={colAntes}
        que="clientes"
        columnaId="NIU"
        sensibles={["NIU"]}
        descargar={descarga}
        ficha={(niu) => <FichaCliente token={token} niu={niu} />}
      />

      {perfilPorDimension.length ? (
        <details className="v2-exp">
          <summary>Cómo son los que se fueron (clase, zona, tamaño, municipio)</summary>
          <div className="v2-exp-cuerpo">
            {perfilPorDimension.map((grupo) => (
              <div key={grupo.dimension}>
                <p>
                  <b>{grupo.dimension}</b>
                </p>
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        {COLUMNAS_PERFIL.map((columna) => (
                          <th key={columna}>{columna}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.filas.slice(0, 15).map((fila, index) => (
                        <tr key={index}>
                          {COLUMNAS_PERFIL.map((columna) => (
                            <td key={columna}>{formatoPerfil(fila[columna], columna)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <p className="v2-caption">{md(PIE)}</p>
    </div>
  );
}
