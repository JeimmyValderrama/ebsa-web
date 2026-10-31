import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Aviso, TablaSimple, Tarjeta, TituloPagina } from "../../components/v2/ui";
import { Barras } from "../../charts/Graficas";
import { AZUL } from "../../charts/paleta";
import { formatoTabla, pesosMillones } from "../../lib/format";

/**
 * Réplica de la sección "Cortes" del administrador (app_ebsa_v2.py, seccion == "Cortes"):
 * resumen_gestion_por_corte.csv agrupado por la columna "corte" (clase de servicio, grupo de
 * consumo, municipio, zona regional…), con las barras del valor en riesgo y la tabla del grupo.
 *
 * Usa solo el dataset cut_summary, que la API ya sirve (19 filas, sin paginar).
 */

type FilaDataset = Record<string, unknown>;

const COLUMNAS = ["valor_corte", "n_clientes", "kwh_riesgo_mes", "n_criticos", "valor_riesgo_mes"];

/** str.capitalize() de Python: primera letra en mayúscula y el resto en minúscula. */
function capital(texto: string): string {
  const limpio = texto.replace(/_/g, " ");
  return limpio ? limpio[0].toUpperCase() + limpio.slice(1).toLowerCase() : limpio;
}

export function CortesAdmin({ token }: { token?: string | null }) {
  const [filas, setFilas] = useState<FilaDataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .dataset(token, "cut_summary", { limit: 200 })
      .then((pagina) => {
        if (!cancelado) setFilas(pagina.items.map((item) => item.payload));
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar los cortes.");
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (error) return <Aviso texto={error} tipo="alerta" />;
  if (!filas) return <div className="empty-state cargando">Consultando el valor en riesgo por cortes…</div>;
  if (!filas.length) return <Aviso texto="No existe resumen_gestion_por_corte.csv" tipo="alerta" />;

  // groupby del Streamlit: los grupos salen ordenados por nombre y cada uno va de mayor a menor valor.
  const nombres = [...new Set(filas.map((fila) => String(fila.corte ?? "")))].sort();

  return (
    <div className="stack">
      <TituloPagina
        titulo="Valor en riesgo por cortes de gestión"
        bajada="Dónde se concentra la facturación en riesgo, por cada forma de agrupar a los clientes."
      />

      {nombres.map((nombre) => {
        const grupo = filas
          .filter((fila) => String(fila.corte ?? "") === nombre)
          .map((fila) => ({
            valor_corte: fila.valor_corte ?? "—",
            n_clientes: fila.n_clientes ?? null,
            kwh_riesgo_mes: fila.kwh_riesgo_mes ?? null,
            n_criticos: fila.n_criticos ?? null,
            valor_riesgo_mes: fila.valor_riesgo_mes ?? null,
          }))
          .sort((a, b) => Number(b.valor_riesgo_mes ?? 0) - Number(a.valor_riesgo_mes ?? 0));

        return (
          <Tarjeta key={nombre} titulo={capital(nombre)} bajada="Valor en riesgo por mes, de mayor a menor">
            <div className="fila-1-1">
              <Barras
                serie={grupo.map((fila) => [String(fila.valor_corte), Number(fila.valor_riesgo_mes ?? 0)])}
                opciones={{
                  formato: pesosMillones,
                  color: AZUL,
                  nombreValor: "Valor en riesgo / mes",
                  nombreCategoria: capital(nombre),
                }}
              />
              <TablaSimple columnas={COLUMNAS} filas={grupo} formato={formatoTabla(grupo, COLUMNAS)} />
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}
