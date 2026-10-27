import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Aviso, Kpis, TablaSimple, Tarjeta, TituloPagina, type ItemKpi } from "../../components/v2/ui";
import { md } from "../../charts/textos";
import { fmtN, mesCorto } from "../../lib/format";

/**
 * Réplica de la sección "Estado del pipeline" del administrador (app_ebsa_v2.py,
 * seccion == "Estado del pipeline"): control de calidad del último mes entrante,
 * últimas corridas y sesgo del pronóstico rural vs. urbano.
 *
 * Usa /pipeline, que sirve quality_control, forecast_bias y las corridas registradas
 * (carpeta corridas/, con su resumen de texto).
 *
 * Desviación documentada: si no hay corridas registradas se avisa "Sin corridas
 * registradas."; el original distingue además el caso de la carpeta corridas/ ausente,
 * que la API no expone.
 */

type PipelineData = Awaited<ReturnType<typeof api.pipeline>>;
type FilaDataset = Record<string, unknown>;

/** Orden de columnas del control de calidad (column_order del Streamlit). */
const COLUMNAS_CALIDAD = ["chequeo", "resultado", "nivel", "valor_mes", "referencia", "detalle", "mes_evaluado"];
const COLUMNAS_SESGO = ["zona", "n", "mediana", "p25", "p75"];

const AYUDA_CALIDAD =
  "En la tabla, **resultado** dice si el chequeo pasó (OK). **nivel** no es el resultado: es qué tan grave sería si fallara "
  + "(ERROR detiene la corrida; AVISO solo informa).";

export function PipelineAdmin({ token }: { token?: string | null }) {
  const [datos, setDatos] = useState<PipelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .pipeline(token)
      .then((valor) => {
        if (!cancelado) {
          setDatos(valor);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar el estado del pipeline.");
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (error) return <Aviso texto={error} tipo="alerta" />;
  if (!datos) return <div className="empty-state">Consultando el estado del pipeline…</div>;

  const calidad: FilaDataset[] = datos.quality_control ?? [];
  const sesgo: FilaDataset[] = datos.forecast_bias ?? [];
  const corridas: Array<Record<string, unknown>> = datos.runs ?? [];

  const correctos = calidad.filter((fila) => String(fila.resultado ?? "").toUpperCase() === "OK").length;
  const fallas = calidad.filter((fila) => String(fila.resultado ?? "").toUpperCase() !== "OK");
  const errores = fallas.filter((fila) => String(fila.nivel ?? "").toUpperCase() === "ERROR").length;
  const avisos = fallas.length - errores;

  const kpis: ItemKpi[] = [
    { titulo: "Mes evaluado", valor: String(calidad[0]?.mes_evaluado ?? "—"), tono: "marca", texto: true },
    { titulo: "Chequeos correctos", valor: `${fmtN(correctos)} de ${fmtN(calidad.length)}`, tono: "bien", texto: true },
    { titulo: "Chequeos con aviso", valor: String(avisos), tono: avisos ? "aviso" : undefined },
    { titulo: "Chequeos con error", valor: String(errores), tono: errores ? "alerta" : undefined },
  ];

  return (
    <div className="stack">
      <TituloPagina
        titulo="Estado del pipeline"
        bajada="Control de calidad del último mes que entró, últimas corridas y sesgo del pronóstico."
      />

      <Tarjeta titulo="Control de calidad del último mes entrante">
        {!calidad.length ? (
          <Aviso texto="Sin reporte de control de calidad (se genera en Reconstruccion_serie_tiempo_consumo_rural.ipynb)." />
        ) : (
          <>
            <Kpis items={kpis} compacto />
            <p className="v2-caption">{md(AYUDA_CALIDAD)}</p>
            <TablaSimple columnas={COLUMNAS_CALIDAD} filas={calidad} />
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Últimas corridas">
        {!corridas.length ? (
          <Aviso texto="Sin corridas registradas." />
        ) : (
          corridas.map((corrida) => {
            const clave = String(corrida.id ?? corrida.folder_name ?? "");
            const abiertoAhora = abierto === clave;
            return (
              <details
                key={clave}
                className="v2-exp"
                open={abiertoAhora}
                onToggle={(evento) => setAbierto((evento.currentTarget as HTMLDetailsElement).open ? clave : null)}
              >
                <summary>
                  {String(corrida.folder_name ?? "—")}
                  {" · "}
                  {corrida.started_at ? mesCorto(String(corrida.started_at).slice(0, 7)) : "sin fecha"}
                </summary>
                <div className="v2-exp-cuerpo">
                  <pre className="ficha-note" style={{ whiteSpace: "pre-wrap" }}>
                    {String(corrida.summary_text ?? "(sin resumen)")}
                  </pre>
                </div>
              </details>
            );
          })
        )}
      </Tarjeta>

      {sesgo.length ? (
        <Tarjeta titulo="Sesgo del pronóstico rural vs. urbano (última priorización)">
          <TablaSimple columnas={COLUMNAS_SESGO} filas={sesgo} />
        </Tarjeta>
      ) : null}
    </div>
  );
}
