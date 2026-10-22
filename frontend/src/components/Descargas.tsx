import { useEffect, useMemo, useState } from "react";
import { useAuthOptional } from "../auth/AuthProvider";
import { api, type ExporteFila, type ExportesData } from "../lib/api";
import { formatoTabla, fmtN } from "../lib/format";
import { GRUPO_CONSUMO_DESCRIPCION, GRUPOS_CONSUMO_ORDEN } from "../lib/negocio";
import { md } from "../charts/textos";
import { Aviso, TablaSimple, Tarjeta, TituloPagina } from "./v2/ui";

/**
 * Sección "Descargas por grupo" (Comercial la llama "Descargas"): el índice que deja el pipeline
 * (11_exportes_negocio/indice_exportes.csv), una tabla por producto y la descarga del archivo
 * elegido, que se lee del disco recién cuando se pide (los grandes pesan ~145 MB).
 */

/** NOMBRES_PRODUCTO del Streamlit. */
const NOMBRES_PRODUCTO: Record<string, string> = {
  pronostico_6_meses: "Pronóstico a 6 meses",
  lista_caida: "Lista de caída de consumo",
  riesgo_fuga: "Riesgo de fuga a otro comercializador",
};

const BAJADA =
  "Archivos que deja el pipeline: una lista por grupo de consumo y una con todos, con zona, clase de servicio, "
  + "tipo de medidor y de lectura, promedio semestral y valor facturado.";

const COLUMNAS = ["Grupo de consumo", "Clientes", "Corte", "Archivo", "Tamaño (MB)", "Estado"];

const SIN_INDICE = "No existe 11_exportes_negocio/indice_exportes.csv. Corre el pipeline (paso 15).";
const NIU = "Estos archivos traen el NIU de cada cliente: son para trabajo interno y no deben compartirse fuera de la empresa.";
const PIE_GRUPOS = GRUPOS_CONSUMO_ORDEN.map((grupo) => `**${grupo}**: ${GRUPO_CONSUMO_DESCRIPCION[grupo]}`).join(" · ");

function filaTabla(fila: ExporteFila): Record<string, unknown> {
  return {
    "Grupo de consumo": fila.grupo_consumo ?? "",
    Clientes: fila.clientes,
    Corte: fila.fecha_corte ?? "",
    Archivo: fila.archivo,
    "Tamaño (MB)": fila.tamano_mb,
    Estado: fila.estado,
  };
}

export function Descargas({ token }: { token?: string | null }) {
  const auth = useAuthOptional();
  const tecnico = auth?.currentUser?.role === "ADMIN_MODELO";

  const [indice, setIndice] = useState<ExportesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [elegido, setElegido] = useState("");
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    api
      .exportes(token ?? undefined)
      .then((datos) => {
        if (cancelado) return;
        setIndice(datos);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelado) setError(cause instanceof Error ? cause.message : "No fue posible cargar el índice de exportes.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Solo los archivos que están en disco entran al selector (como `if existe:` del Streamlit).
  const opciones = useMemo(
    () =>
      (indice?.productos ?? []).flatMap((producto) =>
        producto.filas
          .filter((fila) => fila.estado === "disponible")
          .map((fila) => ({
            ruta: fila.ruta,
            archivo: fila.archivo,
            etiqueta: `${NOMBRES_PRODUCTO[producto.producto] ?? producto.producto} — ${fila.grupo_consumo} (${fila.archivo})`,
          })),
      ),
    [indice],
  );
  const seleccion = opciones.find((opcion) => opcion.ruta === elegido) ?? null;

  const descargar = async (): Promise<void> => {
    if (!elegido || bajando) return;
    setBajando(true);
    setErrorDescarga(null);
    try {
      const blob = await api.exporteArchivo(token ?? undefined, elegido);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = seleccion?.archivo ?? "archivo.csv";
      enlace.click();
      // Se libera después de un rato: el navegador sigue leyendo el blob mientras descarga.
      window.setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (cause: unknown) {
      setErrorDescarga(cause instanceof Error ? cause.message : "No fue posible descargar el archivo.");
    } finally {
      setBajando(false);
    }
  };

  const cabecera = <TituloPagina titulo="Descargas por grupo de consumo" bajada={BAJADA} />;

  if (error) {
    return (
      <div className="stack">
        {cabecera}
        <div className="empty-state">{error}</div>
      </div>
    );
  }
  if (cargando) {
    return (
      <div className="stack">
        {cabecera}
        <div className="empty-state">Consultando 11_exportes_negocio/indice_exportes.csv…</div>
      </div>
    );
  }

  const productos = indice?.productos ?? [];
  if (!productos.length) {
    return (
      <div className="stack">
        {cabecera}
        <Aviso texto={SIN_INDICE} tipo="alerta" />
      </div>
    );
  }

  return (
    <div className="stack">
      {cabecera}

      <Tarjeta titulo="Descargar un archivo" bajada="Elige el archivo; solo se lee del disco el que escojas">
        {!opciones.length ? (
          <Aviso texto="No hay archivos disponibles para descargar." />
        ) : (
          <div className="dl-sel">
            <label className="proy-campo">
              Archivo
              <select className="filter-select" value={elegido} onChange={(event) => setElegido(event.target.value)} aria-label="Archivo">
                <option value="">Elige el archivo que quieres descargar</option>
                {opciones.map((opcion) => (
                  <option key={opcion.ruta} value={opcion.ruta}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            {elegido ? (
              <button type="button" className="ghost-button" onClick={() => void descargar()} disabled={bajando}>
                {bajando ? "Descargando…" : `Descargar ${seleccion?.archivo ?? ""}`}
              </button>
            ) : null}
          </div>
        )}
        {errorDescarga ? <Aviso texto={errorDescarga} tipo="alerta" /> : null}
        {opciones.length > 0 && !tecnico ? <Aviso texto={NIU} tipo="calidad" /> : null}
      </Tarjeta>

      {productos.map((producto) => {
        const filas = producto.filas.map(filaTabla);
        const base = formatoTabla(filas, COLUMNAS);
        const formato = (valor: unknown, columna: string): string => {
          if (valor === null || valor === undefined || valor === "") return "";
          // Tamaño en MB: siempre un decimal (round(..., 1) del Streamlit).
          if (columna === "Tamaño (MB)" && typeof valor === "number") return fmtN(valor, 1);
          return base(valor, columna);
        };
        return (
          <Tarjeta key={producto.producto} titulo={NOMBRES_PRODUCTO[producto.producto] ?? producto.producto}>
            <TablaSimple columnas={COLUMNAS} filas={filas} formato={formato} />
          </Tarjeta>
        );
      })}

      <p className="v2-caption">{md(PIE_GRUPOS)}</p>
    </div>
  );
}
