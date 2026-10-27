import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Aviso, TablaSimple, Tarjeta, TituloPagina } from "../../components/v2/ui";
import { md } from "../../charts/textos";
import { fmtN, formatoTabla } from "../../lib/format";

/**
 * Réplica de la sección "Seguimiento" del administrador (app_ebsa_v2.py, seccion == "Seguimiento"):
 * el error en vivo del pronóstico por corte y horizonte, el riesgo de fuga de los señalados en
 * cortes anteriores y lo que pasó con los clientes de las listas anteriores.
 *
 * Usa solo datasets que la API ya sirve: followup_global, followup_profile, followup_zone,
 * followup_list, churn_followup y forecast_global_metrics (la referencia del backtest).
 */

type FilaDataset = Record<string, unknown>;

/** Índice del pivot de WAPE en vivo: el corte del pronóstico, con qué versión y cuánto sin reentrenar. */
const COLUMNAS_INDICE = ["fecha_corte", "fecha_corte_modelo", "meses_desde_entrenamiento"];
const COLUMNAS_HORIZONTES = ["1", "2", "3", "4", "5", "6"];

/** Grupos del seguimiento de las listas, en el orden del original (listas_seguimiento.csv). */
const CORTE_POR = ["TOTAL", "trayectoria", "veredicto", "severidad", "zona"];

const AYUDA_VIVO =
  "fecha_corte_modelo: con qué versión del modelo se hizo cada pronóstico; meses_desde_entrenamiento: "
  + "cuánto llevaba sin reentrenar. Si el WAPE sube con esa antigüedad, toca reentrenar (estado_modelos.py lo dice).";

const AVISO_VIVO =
  "El error en vivo es mayor que el del backtest, sobre todo en clientes rurales (lectura trimestral): la cifra que vale "
  + "para decidir es esta, la medida contra lo que realmente pasó.";

const AYUDA_LISTAS =
  "RECUPERADO: volvió al menos al 90 % del nivel contra el que se midió su caída (periodo anterior o mismo "
  + "periodo del año pasado, el que originó el veredicto). SIGUE_CAYENDO: quedó por debajo del 90 % del promedio "
  + "de su ventana reciente. ESTABLE_BAJO: se quedó en el nivel caído. Cada lista de zona se cuenta una sola vez.";

const AVISO_LISTAS = "No hay grupo de control: son porcentajes descriptivos, no una prueba de que la lista acierte.";

/** round(2) de las tablas "por perfil" y "por zona" (sp.round(2) y sz.round(2) del original). */
function redondea2(filas: FilaDataset[]): FilaDataset[] {
  return filas.map((fila) => {
    const salida: FilaDataset = {};
    Object.entries(fila).forEach(([clave, valor]) => {
      const numero = Number(valor);
      salida[clave] = typeof valor === "number" && Number.isFinite(numero) ? Math.round(numero * 100) / 100 : valor;
    });
    return salida;
  });
}

export function SeguimientoAdmin({ token }: { token?: string | null }) {
  const [global, setGlobal] = useState<FilaDataset[] | null>(null);
  const [perfil, setPerfil] = useState<FilaDataset[] | null>(null);
  const [zona, setZona] = useState<FilaDataset[] | null>(null);
  const [listas, setListas] = useState<FilaDataset[] | null>(null);
  const [fuga, setFuga] = useState<FilaDataset[] | null>(null);
  const [backtest, setBacktest] = useState<FilaDataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    const pedidos: Array<[string, (filas: FilaDataset[]) => void, (mensaje: string) => void]> = [
      ["followup_global", setGlobal, setError],
      ["followup_profile", setPerfil, () => undefined],
      ["followup_zone", setZona, () => undefined],
      ["followup_list", setListas, () => undefined],
      ["churn_followup", setFuga, () => undefined],
      ["forecast_global_metrics", setBacktest, () => undefined],
    ];
    pedidos.forEach(([key, guardar, fallar]) => {
      api
        .dataset(token, key, { limit: 500 })
        .then((pagina) => {
          if (!cancelado) guardar(pagina.items.map((item) => item.payload));
        })
        .catch((cause: unknown) => {
          if (!cancelado) {
            guardar([]);
            if (cause instanceof Error) fallar(cause.message);
          }
        });
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (error) return <Aviso texto={error} tipo="alerta" />;

  // Pivot: filas = corte en que se hizo el pronóstico (+ versión y antigüedad), columnas = meses adelante.
  const filasPivote = (global ?? []).map((fila) => {
    const salida: FilaDataset = {};
    COLUMNAS_INDICE.forEach((columna) => {
      salida[columna] = fila[columna] ?? null;
    });
    COLUMNAS_HORIZONTES.forEach((horizonte) => {
      const registro = (global ?? []).find(
        (item) =>
          String(item.fecha_corte ?? "") === String(fila.fecha_corte ?? "")
          && String(item.horizonte ?? "") === horizonte,
      );
      salida[horizonte] = registro ? Math.round(Number(registro.WAPE_pct ?? 0) * 10) / 10 : null;
    });
    return salida;
  }).filter(
    (fila, indice, todas) =>
      COLUMNAS_HORIZONTES.some((horizonte) => fila[horizonte] !== null)
      && todas.findIndex((otra) => String(otra.fecha_corte ?? "") === String(fila.fecha_corte ?? "")) === indice,
  );

  // Referencia del backtest por horizonte (h1=15,4 %, h2=20,1 %…).
  const referencia = (backtest ?? [])
    .slice()
    .sort((a, b) => Number(a.horizonte ?? 0) - Number(b.horizonte ?? 0))
    .map((fila) => `h${Number(fila.horizonte ?? 0)}=${fmtN(Number(fila.WAPE_final_pct ?? 0), 1)} %`)
    .join(", ");

  const filasPerfil = redondea2(perfil ?? []);
  const filasZona = redondea2(zona ?? []);

  return (
    <div className="stack">
      <TituloPagina titulo="Seguimiento: lo pronosticado contra lo que pasó" />

      {global === null ? (
        <div className="empty-state">Consultando el seguimiento del pronóstico…</div>
      ) : !global.length ? (
        <Aviso
          texto={
            "Todavía no hay meses pronosticados que ya estén consolidados. Se llena mes a mes "
            + "(Seguimiento_pronostico_mensual.ipynb)."
          }
        />
      ) : (
        <Tarjeta
          titulo="Error en vivo del pronóstico (WAPE %) por corte y horizonte"
          bajada="Filas = corte en que se hizo el pronóstico; columnas = meses adelante"
        >
          <TablaSimple
            columnas={[...COLUMNAS_INDICE, ...COLUMNAS_HORIZONTES]}
            filas={filasPivote}
            formato={formatoTabla(filasPivote, [...COLUMNAS_INDICE, ...COLUMNAS_HORIZONTES])}
          />
          <p className="v2-caption">{md(AYUDA_VIVO)}</p>
          {referencia ? <p className="v2-pie">{md(`Referencia del backtest por horizonte: ${referencia}`)}</p> : null}
          <Aviso texto={AVISO_VIVO} tipo="limite" />

          {filasPerfil.length ? (
            <details className="v2-exp">
              <summary>Por perfil (con diferencia contra el backtest)</summary>
              <div className="v2-exp-cuerpo">
                <TablaSimple
                  columnas={Object.keys(filasPerfil[0])}
                  filas={filasPerfil}
                  formato={formatoTabla(filasPerfil, Object.keys(filasPerfil[0]))}
                />
              </div>
            </details>
          ) : null}

          {filasZona.length ? (
            <details className="v2-exp">
              <summary>Por zona</summary>
              <div className="v2-exp-cuerpo">
                <TablaSimple
                  columnas={Object.keys(filasZona[0])}
                  filas={filasZona}
                  formato={formatoTabla(filasZona, Object.keys(filasZona[0]))}
                />
              </div>
            </details>
          ) : null}
        </Tarjeta>
      )}

      {fuga && fuga.length ? (
        <Tarjeta titulo="Riesgo de fuga: señalados en cortes anteriores que efectivamente se fueron">
          <TablaSimple
            columnas={Object.keys(fuga[0])}
            filas={fuga}
            formato={formatoTabla(fuga, Object.keys(fuga[0]))}
          />
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="Qué pasó con los clientes de las listas anteriores">
        {listas === null ? (
          <div className="empty-state">Consultando los clientes de las listas anteriores…</div>
        ) : !listas.length ? (
          <Aviso texto="Todavía no hay meses posteriores consolidados para ninguna lista." />
        ) : (
          <>
            <p className="v2-caption">{md(AYUDA_LISTAS)}</p>
            <Aviso texto={AVISO_LISTAS} tipo="limite" />
            {CORTE_POR.map((cortePor) => {
              const grupo = listas.filter((fila) => String(fila.corte_por ?? "") === cortePor);
              if (!grupo.length) return null;
              const filas = grupo.map((fila) => {
                const salida: FilaDataset = {};
                Object.entries(fila).forEach(([clave, valor]) => {
                  if (clave !== "corte_por") salida[clave] = valor;
                });
                return salida;
              });
              return (
                <div key={cortePor}>
                  <p className="v2-pie">{md(`**Por ${cortePor.toLowerCase()}**`)}</p>
                  <TablaSimple
                    columnas={Object.keys(filas[0])}
                    filas={filas}
                    formato={formatoTabla(filas, Object.keys(filas[0]))}
                  />
                </div>
              );
            })}
          </>
        )}
      </Tarjeta>
    </div>
  );
}
