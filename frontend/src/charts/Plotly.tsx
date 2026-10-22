import { useEffect, useRef } from "react";
import type { Config, Data, Layout } from "plotly.js-dist-min";

/**
 * Dibuja una figura de Plotly igual que st.plotly_chart del Streamlit (proyección de consumo con bandas).
 * plotly.js-dist-min se carga bajo demanda: la proyección es la única sección que lo usa.
 */
export function PlotlyChart({
  data,
  layout,
  config,
  className,
  ariaLabel,
}: {
  data: Data[];
  layout: Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
  ariaLabel?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  // La figura se reconstruye solo cuando cambian los datos (JSON como huella: no depende de la identidad de los objetos).
  const huella = JSON.stringify([data, layout, config ?? null]);

  useEffect(() => {
    const node = contenedor.current;
    if (!node) return;
    let cancelado = false;
    let plotly: typeof import("plotly.js-dist-min").default | null = null;
    let observador: ResizeObserver | null = null;
    import("plotly.js-dist-min")
      .then((modulo) => {
        const lib = modulo.default;
        if (cancelado || !lib) return;
        plotly = lib;
        return lib.newPlot(node, data, { autosize: true, ...layout }, { displaylogo: false, displayModeBar: false, ...config }).then(() => {
          if (cancelado) return;
          observador = new ResizeObserver(() => {
            try {
              plotly?.Plots.resize(node);
            } catch {
              /* el nodo ya se limpió */
            }
          });
          observador.observe(node);
        });
      })
      .catch(() => {
        /* sin Plotly no hay figura: se queda el espacio, como en el Streamlit sin plotly instalado */
      });
    return () => {
      cancelado = true;
      observador?.disconnect();
      if (plotly) {
        try {
          plotly.purge(node);
        } catch {
          /* nada */
        }
      }
      node.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huella]);

  return <div ref={contenedor} className={className} role="img" aria-label={ariaLabel ?? "Gráfico"} />;
}
