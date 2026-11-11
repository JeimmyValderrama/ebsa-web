import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // vega-embed y plotly se importan de forma dinámica (son las únicas secciones que los usan);
  // sin esta lista Vite los optimiza sobre la marcha y el navegador puede pedir una URL que ya no existe.
  optimizeDeps: {
    include: ["vega", "vega-lite", "vega-embed", "plotly.js-dist-min"],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
