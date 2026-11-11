import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * Periodo del corte vigente ("2026-04") compartido por toda la app.
 * Se pide una sola vez al summary y queda en caché en memoria, como corte_actual del Streamlit.
 */

let cache: { token?: string | null; periodo?: string } = {};
const pendientes = new Map<string, Promise<string>>();

export function useCorte(token?: string | null): string {
  const [periodo, setPeriodo] = useState(() => cache.periodo ?? "");

  useEffect(() => {
    if (!token) return;
    if (cache.token === token && cache.periodo !== undefined) {
      setPeriodo(cache.periodo);
      return;
    }
    let cancelled = false;
    const promesa =
      pendientes.get(token) ??
      api
        .summary(token)
        .then((resumen) => resumen.latest_run?.period ?? "")
        .finally(() => pendientes.delete(token));
    pendientes.set(token, promesa);
    promesa
      .then((value) => {
        cache = { token, periodo: value };
        if (!cancelled) setPeriodo(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  return periodo;
}
