import { useEffect, useState } from "react";
import { useAuthOptional } from "../auth/AuthProvider";
import { api, type ExporteFila, type ExportesData } from "../lib/api";
import { formatoTabla, fmtN } from "../lib/format";
import { GRUPO_CONSUMO_DESCRIPCION, GRUPOS_CONSUMO_ORDEN } from "../lib/negocio";
import { md } from "../charts/textos";
import { Aviso, TablaSimple, Tarjeta, TituloPagina } from "./v2/ui";

/**
 * Sección "Descargas por grupo" (Comercial la llama "Descargas"): el índice que deja el pipeline
 * (11_exportes_negocio/indice_exportes.csv), la tarjeta para elegir y descargar un archivo y una
 * tabla por producto con su botón de descarga por archivo (petición de la vista Comercial); cada
 * archivo se lee del disco recién cuando se pide, los grandes pesan ~145 MB.
 *
 * Es el mismo componente para la subpestaña Comercial y para "Descargas por grupo" del
 * Administrador, que en el Streamlit eran dos copias de la misma sección.
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
  // Archivo elegido en el selector de la tarjeta "Descargar un archivo" (st.selectbox, vacío al entrar).
  const [elegido, setElegido] = useState("");
  // Rutas que se están descargando ahora mismo (selector o botón de fila).
  const [bajando, setBajando] = useState<ReadonlySet<string>>(new Set());

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

  // Cada archivo se lee del disco solo cuando su fila pide la descarga (como `if existe:` del Streamlit).
  const descargar = async (ruta: string, archivo: string): Promise<void> => {
    if (bajando.has(ruta)) return;
    setBajando((prev) => new Set(prev).add(ruta));
    setErrorDescarga(null);
    try {
      const blob = await api.exporteArchivo(token ?? undefined, ruta);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = archivo;
      enlace.click();
      // Se libera después de un rato: el navegador sigue leyendo el blob mientras descarga.
      window.setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (cause: unknown) {
      setErrorDescarga(cause instanceof Error ? cause.message : "No fue posible descargar el archivo.");
    } finally {
      setBajando((prev) => {
        const copia = new Set(prev);
        copia.delete(ruta);
        return copia;
      });
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

  const disponibles = productos.some((producto) => producto.filas.some((fila) => fila.estado === "disponible"));

  // Las opciones del selector: solo los archivos que están en disco (como `if existe:` del Streamlit).
  const opciones: Array<{ etiqueta: string; ruta: string; archivo: string }> = [];
  productos.forEach((producto) => {
    producto.filas.forEach((fila) => {
      if (fila.estado !== "disponible") return;
      opciones.push({
        etiqueta: `${NOMBRES_PRODUCTO[producto.producto] ?? producto.producto} — ${fila.grupo_consumo} (${fila.archivo})`,
        ruta: fila.ruta,
        archivo: fila.archivo,
      });
    });
  });
  const seleccionado = opciones.find((opcion) => opcion.ruta === elegido) ?? null;

  return (
    <div className="stack">
      {cabecera}

      {errorDescarga ? <Aviso texto={errorDescarga} tipo="alerta" /> : null}

      <Tarjeta titulo="Descargar un archivo" bajada="Elige el archivo; solo se lee del disco el que escojas">
        {!disponibles ? (
          <Aviso texto="No hay archivos disponibles para descargar." />
        ) : (
          <>
            <div className="campo">
              <span>Archivo</span>
              <select className="filter-select" value={elegido} onChange={(evento) => setElegido(evento.target.value)}>
                <option value="">Elige el archivo que quieres descargar</option>
                {opciones.map((opcion) => (
                  <option key={opcion.ruta} value={opcion.ruta}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            {seleccionado ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => void descargar(seleccionado.ruta, seleccionado.archivo)}
                disabled={bajando.has(seleccionado.ruta)}
              >
                {bajando.has(seleccionado.ruta) ? "Descargando…" : `Descargar ${seleccionado.archivo}`}
              </button>
            ) : null}
            {!tecnico ? <Aviso texto={NIU} tipo="calidad" /> : null}
          </>
        )}
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
            <TablaSimple
              columnas={COLUMNAS}
              filas={filas}
              formato={formato}
              tituloAcciones="Descarga"
              acciones={(_fila, indiceFila) => {
                const origen = producto.filas[indiceFila];
                // Solo los que están en disco ofrecen descarga (como `if existe:` del Streamlit).
                if (origen.estado !== "disponible") return null;
                const bajandoEsta = bajando.has(origen.ruta);
                return (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void descargar(origen.ruta, origen.archivo)}
                    disabled={bajandoEsta}
                  >
                    {bajandoEsta ? "Descargando…" : "Descargar"}
                  </button>
                );
              }}
            />
          </Tarjeta>
        );
      })}

      <p className="v2-caption">{md(PIE_GRUPOS)}</p>
    </div>
  );
}
