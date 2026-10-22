import { useEffect, useRef, useState } from "react";
import type { VisualizationSpec } from "vega-embed";
import type { Spec } from "./vegaSpec";

/**
 * Dibuja una especificación Vega-Lite con el mismo trato que st.vega_lite_chart del Streamlit:
 * ancho del contenedor, sin barra de acciones y redibujo al cambiar el tamaño de la pantalla.
 * vega + vega-lite se cargan bajo demanda (import dinámico) para no pesar en la primera carga.
 */
export function VegaLite({ spec, className, ariaLabel }: { spec: Spec | null; className?: string; ariaLabel?: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const vista = useRef<{ resize: () => unknown; runAsync: () => Promise<unknown>; finalize: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = contenedor.current;
    if (!node || !spec) return;
    let cancelado = false;
    let observador: ResizeObserver | null = null;
    import("vega-embed")
      .then(({ default: embed }) => {
        if (cancelado) return;
        return embed(node, spec as VisualizationSpec, { actions: false, renderer: "svg" }).then((resultado) => {
          if (cancelado) {
            resultado.view.finalize();
            return;
          }
          vista.current = resultado.view as unknown as typeof vista.current;
          observador = new ResizeObserver(() => {
            try {
              vista.current?.resize();
              void vista.current?.runAsync();
            } catch {
              /* la vista ya se cerró */
            }
          });
          observador.observe(node);
        });
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No se pudo dibujar el gráfico.");
      });
    return () => {
      cancelado = true;
      observador?.disconnect();
      vista.current?.finalize();
      vista.current = null;
      node.replaceChildren();
    };
  }, [spec]);

  if (error) return <div className="empty-state">{error}</div>;
  return <div ref={contenedor} className={className} role="img" aria-label={ariaLabel ?? "Gráfico"} />;
}
