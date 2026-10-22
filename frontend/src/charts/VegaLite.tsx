import { useEffect, useRef, useState } from "react";
import type { VisualizationSpec } from "vega-embed";
import type { Spec } from "./vegaSpec";

/**
 * Dibuja una especificación Vega-Lite con el mismo trato que st.vega_lite_chart del Streamlit:
 * ancho del contenedor, sin barra de acciones y redibujo al cambiar el tamaño de la pantalla.
 * vega + vega-lite se cargan bajo demanda (import dinámico) para no pesar en la primera carga.
 */

const MENSAJE_ERROR = "No se pudo cargar la librería de gráficas (vega-embed). Recarga la página para volver a intentarlo.";

/**
 * vega-embed solo se importa de forma dinámica. Si Vite reoptimiza las dependencias en caliente
 * (por ejemplo al instalar otra librería), el primer intento puede apuntar a un módulo obsoleto:
 * se reintenta una vez antes de rendirse.
 */
async function cargarVegaEmbed() {
  try {
    return (await import("vega-embed")).default;
  } catch {
    await new Promise((resolver) => window.setTimeout(resolver, 1200));
    return (await import("vega-embed")).default;
  }
}

export function VegaLite({ spec, className, ariaLabel }: { spec: Spec | null; className?: string; ariaLabel?: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const vista = useRef<{ resize: () => unknown; runAsync: () => Promise<unknown>; finalize: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = contenedor.current;
    if (!node || !spec) return;
    let cancelado = false;
    let observador: ResizeObserver | null = null;
    cargarVegaEmbed()
      .then((embed) => {
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
      .catch(() => {
        if (!cancelado) setError(MENSAJE_ERROR);
      });
    return () => {
      cancelado = true;
      observador?.disconnect();
      vista.current?.finalize();
      vista.current = null;
      node.replaceChildren();
    };
  }, [spec]);

  // El aviso ocupa el mismo espacio que la figura: nada de saltos ni de cajas que se monten encima.
  if (error) {
    return (
      <div className={className} style={{ minHeight: 280 }} role="img" aria-label={ariaLabel ?? "Gráfico"}>
        <div className="empty-state">{error}</div>
      </div>
    );
  }
  return <div ref={contenedor} className={className} role="img" aria-label={ariaLabel ?? "Gráfico"} />;
}
