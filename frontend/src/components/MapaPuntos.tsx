import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Punto del mapa: coordenadas válidas del TC1 y color ya pintado por gravedad
 * (st.map pinta cada punto con el color de su columna).
 */
export type PuntoMapa = { lat: number; lon: number; color: string };

/**
 * Réplica de st.map() de la sección "Visitas por ciclo": mismos círculos (radio de 120 metros con
 * piso de 3 px, color opaco por gravedad) y el mismo encuadre automático (_get_viewport_details del
 * original: centro en el medio del bounding box y zoom por la mayor distancia en grados).
 *
 * Azulejos: OpenStreetMap (tile.openstreetmap.org) en vez del Positron de Carto que usa Streamlit.
 * Desde el 29-09-2026 basemaps.cartocdn.com exige ?key= en cada azulejo y sin ella devuelve una
 * imagen con la leyenda "API KEY REQUIRED": se probó la key publica que Streamlit reparte en su
 * bundle y aun asi seguia llegando la leyenda, asi que se paso a OSM, que no pide key ni query de
 * ningun tipo. Para volver a Positron basta pedir key propia gratis en carto.com/basemaps/apikey
 * (5 M de tiles/mes) y restaurar https://{a|b|c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png
 * con ?key= (y devolverle la atribucion "© CARTO" al pie). OSM no tiene variantes @2x: en
 * pantallas retina se sirve el azulejo normal, como aqui. Zoom tope 18 (OSM llega a 19).
 */
const ZOOM_POR_GRADOS = [
  360, 180, 90, 45, 22.5, 11.25, 5.625, 2.813, 1.406, 0.703, 0.352, 0.176, 0.088, 0.044, 0.022, 0.011, 0.005, 0.003, 0.001, 0.0005, 0.00025,
];

/** Zoom en el que cabe la distancia en grados pedida (_get_zoom_level; suelo de 12 si no aplica). */
function zoomAjustado(distancia: number): number {
  for (let i = 0; i < ZOOM_POR_GRADOS.length - 1; i++) {
    if (ZOOM_POR_GRADOS[i + 1] < distancia && distancia <= ZOOM_POR_GRADOS[i]) return i;
  }
  return 12;
}

const mundo = (zoom: number): number => 256 * 2 ** zoom;

/** Latitud/longitud a píxeles del mundo (proyección mercator esférica, como deck.gl). */
function aMundo(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const rad = (lat * Math.PI) / 180;
  const lado = mundo(zoom);
  return {
    x: ((lon + 180) / 360) * lado,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * lado,
  };
}

/** Píxeles del mundo a latitud/longitud. */
function desdeMundo(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const lado = mundo(zoom);
  const lon = (x / lado) * 360 - 180;
  const n = Math.PI - 2 * Math.PI * (y / lado);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

const metrosPorPixel = (lat: number, zoom: number): number => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

const CLIPA_LAT = (lat: number): number => Math.max(-85.05, Math.min(85.05, lat));

type Vista = { lat: number; lon: number; zoom: number };

/** Encuadre inicial: centro del bounding box y zoom por la mayor distancia en grados. */
function vistaInicial(puntos: PuntoMapa[]): Vista {
  if (!puntos.length) return { lat: 5.5, lon: -73.4, zoom: 12 };
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const punto of puntos) {
    if (punto.lat < minLat) minLat = punto.lat;
    if (punto.lat > maxLat) maxLat = punto.lat;
    if (punto.lon < minLon) minLon = punto.lon;
    if (punto.lon > maxLon) maxLon = punto.lon;
  }
  return {
    lat: (maxLat + minLat) / 2,
    lon: (maxLon + minLon) / 2,
    zoom: zoomAjustado(Math.max(Math.abs(maxLat - minLat), Math.abs(maxLon - minLon))),
  };
}

/** Nueva vista manteniendo fijo el punto de la pantalla (x, y) al cambiar de zoom. */
function anclar(vista: Vista, x: number, y: number, ancho: number, alto: number, zoom: number): Vista {
  const centro = aMundo(vista.lat, vista.lon, vista.zoom);
  const punto = desdeMundo(centro.x - ancho / 2 + x, centro.y - alto / 2 + y, vista.zoom);
  const mundoNuevo = aMundo(punto.lat, punto.lon, zoom);
  const siguiente = desdeMundo(mundoNuevo.x - x + ancho / 2, mundoNuevo.y - y + alto / 2, zoom);
  return { lat: CLIPA_LAT(siguiente.lat), lon: siguiente.lon, zoom };
}

export function MapaPuntos({ puntos, altura, etiqueta = "Clientes con coordenadas válidas en el mapa" }: { puntos: PuntoMapa[]; altura: number; etiqueta?: string }) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const distPinza = useRef(0);
  const [tamano, setTamano] = useState({ ancho: 0, alto: 0 });
  const [vista, setVista] = useState<Vista>(() => vistaInicial(puntos));
  const [arrastrando, setArrastrando] = useState(false);

  // Cada lista nueva vuelve al encuadre automático, como el st.map que se repinta.
  useEffect(() => setVista(vistaInicial(puntos)), [puntos]);

  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento) return;
    const observador = new ResizeObserver((entradas) => {
      const rectangulo = entradas[0].contentRect;
      setTamano({ ancho: Math.round(rectangulo.width), alto: Math.round(rectangulo.height) });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // Rueda del ratón (zoom alrededor del cursor); passive: false para poder cancelar el scroll.
  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento || !tamano.ancho) return;
    const alRodar = (evento: WheelEvent): void => {
      evento.preventDefault();
      const rectangulo = elemento.getBoundingClientRect();
      const paso = evento.deltaY < 0 ? 1 : -1;
      setVista((vistaActual) => {
        const zoom = Math.min(18, Math.max(0, vistaActual.zoom + paso));
        if (zoom === vistaActual.zoom) return vistaActual;
        return anclar(vistaActual, evento.clientX - rectangulo.left, evento.clientY - rectangulo.top, tamano.ancho, tamano.alto, zoom);
      });
    };
    elemento.addEventListener("wheel", alRodar, { passive: false });
    return () => elemento.removeEventListener("wheel", alRodar);
  }, [tamano]);

  // Azulejos de OpenStreetMap (sin key) que cubren la pantalla: misma malla de 256 px que st.map.
  const baldosas = useMemo(() => {
    const { ancho, alto } = tamano;
    if (!ancho || !alto) return [];
    const zoom = Math.round(vista.zoom);
    const lado = 2 ** zoom;
    const centro = aMundo(vista.lat, vista.lon, zoom);
    const origenX = centro.x - ancho / 2;
    const origenY = centro.y - alto / 2;
    const lista: Array<{ clave: string; url: string; izquierda: number; arriba: number }> = [];
    for (let x = Math.floor(origenX / 256); x <= Math.floor((origenX + ancho) / 256); x++) {
      for (let y = Math.floor(origenY / 256); y <= Math.floor((origenY + alto) / 256); y++) {
        if (y < 0 || y >= lado) continue;
        const columna = ((x % lado) + lado) % lado;
        lista.push({
          clave: `${zoom}/${x}/${y}`,
          url: `https://tile.openstreetmap.org/${zoom}/${columna}/${y}.png`,
          izquierda: x * 256 - origenX,
          arriba: y * 256 - origenY,
        });
      }
    }
    return lista;
  }, [tamano, vista]);

  // Los puntos en un lienzo: los mismos 120 metros de radio (piso de 3 px) y color opaco de st.map.
  useEffect(() => {
    const canvas = lienzo.current;
    const { ancho, alto } = tamano;
    if (!canvas || !ancho || !alto) return;
    const escala = window.devicePixelRatio || 1;
    canvas.width = Math.round(ancho * escala);
    canvas.height = Math.round(alto * escala);
    const contexto = canvas.getContext("2d");
    if (!contexto) return;
    contexto.setTransform(escala, 0, 0, escala, 0, 0);
    contexto.clearRect(0, 0, ancho, alto);
    const centro = aMundo(vista.lat, vista.lon, vista.zoom);
    const bordeX = centro.x - ancho / 2;
    const bordeY = centro.y - alto / 2;
    for (const punto of puntos) {
      const radio = Math.max(3, 120 / metrosPorPixel(punto.lat, vista.zoom));
      const posicion = aMundo(punto.lat, punto.lon, vista.zoom);
      const x = posicion.x - bordeX;
      const y = posicion.y - bordeY;
      if (x < -radio || y < -radio || x > ancho + radio || y > alto + radio) continue;
      contexto.fillStyle = punto.color;
      contexto.beginPath();
      contexto.arc(x, y, radio, 0, Math.PI * 2);
      contexto.fill();
    }
  }, [puntos, vista, tamano]);

  const moverVista = (dx: number, dy: number): void =>
    setVista((vistaActual) => {
      const centro = aMundo(vistaActual.lat, vistaActual.lon, vistaActual.zoom);
      const siguiente = desdeMundo(centro.x - dx, centro.y - dy, vistaActual.zoom);
      return { ...vistaActual, lat: CLIPA_LAT(siguiente.lat), lon: siguiente.lon };
    });

  const separacion = (): number => {
    const [primero, segundo] = [...punteros.current.values()];
    return primero && segundo ? Math.hypot(segundo.x - primero.x, segundo.y - primero.y) : 0;
  };

  return (
    <div
      ref={contenedor}
      className={`mapa-st${arrastrando ? " arrastrando" : ""}`}
      style={{ height: `${altura}px` }}
      role="img"
      aria-label={etiqueta}
      onPointerDown={(evento) => {
        evento.currentTarget.setPointerCapture(evento.pointerId);
        punteros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
        if (punteros.current.size === 2) {
          distPinza.current = separacion();
          setArrastrando(false);
        } else {
          setArrastrando(true);
        }
      }}
      onPointerMove={(evento) => {
        const previo = punteros.current.get(evento.pointerId);
        if (!previo) return;
        const actual = { x: evento.clientX, y: evento.clientY };
        if (punteros.current.size === 1) {
          moverVista(actual.x - previo.x, actual.y - previo.y);
        } else if (punteros.current.size === 2) {
          punteros.current.set(evento.pointerId, actual);
          const distancia = separacion();
          if (distPinza.current > 0 && distancia > distPinza.current * 1.6) {
            setVista((vistaActual) => ({ ...vistaActual, zoom: Math.min(18, vistaActual.zoom + 1) }));
            distPinza.current = distancia;
          } else if (distPinza.current > 0 && distancia < distPinza.current / 1.6) {
            setVista((vistaActual) => ({ ...vistaActual, zoom: Math.max(0, vistaActual.zoom - 1) }));
            distPinza.current = distancia;
          }
        }
        punteros.current.set(evento.pointerId, actual);
      }}
      onPointerUp={(evento) => {
        punteros.current.delete(evento.pointerId);
        if (punteros.current.size < 2) distPinza.current = 0;
        if (punteros.current.size === 0) setArrastrando(false);
      }}
      onPointerCancel={(evento) => {
        punteros.current.delete(evento.pointerId);
        if (punteros.current.size < 2) distPinza.current = 0;
        if (punteros.current.size === 0) setArrastrando(false);
      }}
      onDoubleClick={(evento) => {
        const rectangulo = evento.currentTarget.getBoundingClientRect();
        setVista((vistaActual) => {
          const zoom = Math.min(18, vistaActual.zoom + 1);
          if (zoom === vistaActual.zoom) return vistaActual;
          return anclar(vistaActual, evento.clientX - rectangulo.left, evento.clientY - rectangulo.top, tamano.ancho, tamano.alto, zoom);
        });
      }}
    >
      {baldosas.map((baldosa) => (
        <img key={baldosa.clave} className="mapa-st-baldosa" src={baldosa.url} alt="" draggable={false} style={{ left: `${baldosa.izquierda}px`, top: `${baldosa.arriba}px` }} />
      ))}
      <canvas ref={lienzo} className="mapa-st-lienzo" style={{ width: `${tamano.ancho}px`, height: `${tamano.alto}px` }} aria-hidden="true" />
      <span className="mapa-st-atrib">© OpenStreetMap contributors</span>
    </div>
  );
}
