# Guion de exposición — EBSA Web

**Duración estimada:** 20–25 minutos + preguntas. **Formato:** pantalla compartida con demo en vivo.
**Estructura:** Apertura (1) · **Demo en vivo (13–14, el centro)** · Arquitectura (2) · Justificación (1.5) · Cierre (1).

> Datos reales usados en el guion (producción al momento de escribirlo): corte **abril 2026**;6.037 caídas graves recientes;14.245 nuevos en la lista (13.992 del corte anterior); fuga alta o media **2.301** (460 ALTO +1.841 MEDIO) con9,20 GWh/mes;8.390 clientes sin consumo (713 MWh/mes);108 con otro comercializador;55 en vigilancia; mapa:123 municipios ·2,72 GWh; ciclo completo de visitas:1.650 clientes;21 archivos de descarga (mayor152,3 MB).

---

## Bloque1 · Apertura (≈1 min)

> "Buenas tardes. Les presento **EBSA Web**, la aplicación para consultar los resultados del análisis de consumo eléctrico de la empresa. Es un proyecto académico de la Especialización en Analítica Estratégica de Datos de la UPTC, aplicado a datos de EBSA — no es un producto oficial de la empresa.
>
> El sistema resuelve tres preguntas de negocio: **¿qué clientes están consumiendo menos de lo normal y conviene revisar primero?**, **¿qué clientes se podrían ir a otro comercializador?** y **¿qué van a consumir los próximos seis meses?**. Todo a partir de los archivos TC2 de la empresa, procesados por nuestro pipeline.
>
> En los próximos minutos les mostraré el recorrido por las tres vistas —Comercial, Soporte y Administrador—, luego la arquitectura y por qué el diseño es a la vez **limitado en capacidades y escalable**."

*[Encender/compartir pantalla]*

---

## Bloque2 · Demo en vivo — minuto a minuto (≈13–14 min) ← centro de la exposición

### 2.0 · Preparación previa (antes de encender la pantalla) [30 s]
- Sesión **cerrada** (para mostrar el login), pestaña **Comercial → Panorama** como última vista visitada, y anotar a mano: **NIU `838622969`** (o `633620052`) por si acaso.
- Tener a mano el panel de Vercel por si hay fallo (no mostrarlo salvo necesidad).
- Frase de arranque: *"Voy a recorrer la aplicación como la usaría una persona real: entro, miro el panorama, trabajo la lista de caída, preparo una ruta de visitas y descargo un archivo. Los invito a interrumpirme en cualquier momento."*

### 2.1 · Login y controles globales [≈1,5 min]
**Pantalla:** Login (título *"Analítica de consumo de clientes"*).
1. Escribir correo y contraseña → botón **Ingresar**.
   - **Decir:** *"El acceso es con correo y contraseña; detrás, Firebase Authentication emite un token que la API verifica **en cada operación**, junto con el rol. No hay forma de saltarse el rol."*
2. Tras entrar, señalar la **barra superior**: pestañas Comercial/Soporte/Administrador (se ven según rol), **píldora "Corte Abril de 2026"** y el correo con **Cerrar sesión**.
   - **Decir:** *"El corte es abril de 2026: el mes de datos sobre el que calculamos todo. Si entrara un usuario sin rol, vería solo su área."*
3. Señalar la **caja lateral**: conmutador **Consumo ↔ Facturación** y checkbox **"Ocultar NIU y direcciones"**.
   - **Decir:** *"Este conmutador cambia la unidad de TODA la aplicación —kWh o pesos con la tarifa real— sin cambiar los clientes. Y el modo presentación enmascara NIU y direcciones para proyectar sin exponer datos sensibles: actívenlo [hacerlo un segundo y desactivarlo]."*
4. **Decir:** *"Arrancamos en Comercial."*

### 2.2 · Comercial → Panorama comercial [≈3,5 min] ← pieza central
**Pantalla:** Panorama (título *"Panorama comercial"* + bajada de periodo facturado urbano/rural).

**Paso A — Medidor (arriba):**
- **Decir:** *"Todo lo que ven está en la unidad que elija el conmutador. Muestro la vista en facturación… [clic] …y en consumo: mismos clientes, distinta métrica. Vuelvo a facturación [clic]."*

**Paso B — Tarjeta hero (banda de prioridades):**
- Señalar el título: **"N clientes consumen menos de lo normal…"** y la cifra consolidada.
- Recorrer la **banda**: *Gestionar ahora* → *Seguimiento* → *Vigilar* con sus importes y conteos.
- **Decir:** *"La banda reparte la pérdida según lo que hay que hacer: **gestionar ahora** son las caídas recientes; **seguimiento**, caídas reales que ya llevan meses —no urgentes—; **vigilar**, clientes de temporada con recuperación prevista."*

**Paso C — Fila 1 de indicadores (4 tarjetas), una por una:**
1. **Caídas graves recientes — 6.037** (punto rojo): *"Caída muy por encima de lo normal del segmento: primero se revisa medidor y lectura antes de creer la cifra; las que llevan meses se cuentan aparte como antiguas."* → pasar el cursor sobre el **índice (i)** para que se vea el tooltip.
2. **Nuevos en la lista este mes — 14.245** con nota *"13.992 vienen del corte anterior"*: *"El resto —unos 250— entraron este corte: sirve para ver cuánto renueva la lista cada mes."*
3. **Probabilidad de fuga alta o media — 2.301 clientes**: *"ALTO son los 460 con mayor puntaje —el 1 %— y MEDIO los 1.841 siguientes —hasta el 5 %—. **No es una predicción de que se vayan: es a quién contactar primero.**"* Señalar también **Consumo de esos clientes — 9,20 GWh/mes**: *"lo que estaría en juego si se fueran, promedio de 6 meses."*
4. Pase el cursor por el **índice (i)** del KPI de fuga para mostrar la ayuda completa.

**Paso D — Fila 2 de indicadores (3 tarjetas):**
- **Clientes sin consumo — 8.390** (*"3 meses o más en cero; consumían 713 MWh/mes"*): *"No cuentan como caída porque ya no consumen; viven en su propia sección."*
- **Ya atendidos por otro comercializador — 108**: *"viene del archivo de otros comercializadores de la empresa."*
- **Grandes clientes en vigilancia (no regulados) — 55**: *"ciclo 33 o grandes: pueden negociar con cualquier comercializador."*

**Paso E — Mapa (izquierda) + tarjetas laterales:**
1. Señalar el mapa: *"Boyacá con sus límites oficiales; el color es la medida elegida."*
2. Tarjeta **Los diez municipios con más** → nombrar el primero con su cifra.
3. Tarjeta **Resumen por zona** → señalar una fila.
4. Abrir el desplegable **"Ver la tabla por municipio"** → señalar columnas; cerrar.
5. **Decir:** *"La línea de estado resume: 123 municipios, 2,72 GWh y **corte 2026-04** — el corte real de los datos."*

**Paso F — "Caídas de consumo por zona regional":**
- Señalar la **leyenda de gravedad** (Grave/Fuerte/Moderada/Antigua) y las **barras apiladas** por zona.
- Señalar la **tabla** al lado y probar **un orden** (clic en encabezado "Clientes con caída").
- **Decir:** *"Grave es la caída reciente que hay que revisar primero; **antigua** lleva meses y va en seguimiento — por eso la distinción. Noten que las zonas 'sin zona' y 'no regulados' quedan fuera de esta vista por regla de negocio."*
- Pasar el cursor por la leyenda inferior: *"Grave = revisar medidor y lectura primero; antigua = seguimiento, no urgencia."*

**Paso G — "…por clase de servicio" y "…por tamaño":**
- Ambas son **plegables**; si están cerradas, abrirlas.
- **Decir:** *"De mayor a menor: dónde se concentra la pérdida por tipo de cliente y por tamaño. Recuerden: el conmutador de arriba cambia qué mide el eje."*

**Paso H — "Consumo de energía de todos los clientes":**
- Señalar las **tarjetas por año** (real / proyectado) y la **gráfica con banda naranja del 80 %**.
- **Decir:** *"Lo real en azul, la proyección con su margen de error en naranja. Es un escenario, no una cifra exacta; el detalle con bandas y confiabilidad está en Proyección de consumo."*

**Paso I — Expanders al pie:**
1. Abrir **"Qué cambió frente al mes anterior"**: *"entraron, salieron o siguen respecto del corte anterior."* Cerrar.
2. Señalar **"Qué es esto y cómo leer las cifras"**: *"esta tarjeta documenta las reglas: sin autogeneradores ni ciertas clases, y la tarifa siempre es la real."*

**Transición:** *"Ese es el resumen. Ahora bajamos al detalle: la lista que usa el área para trabajar."*

### 2.3 · Comercial → Caídas de consumo (+ ficha) [≈4 min] ← pieza central
**Pantalla:** *"Clientes cuyo consumo está cayendo"*.

**Paso A — Filtros en vivo:**
1. Dejar ver el estado inicial: *"viene por defecto en prioridad GESTIONAR."*
2. Aplicar **dos filtros reales** en vivo (ej. **Zona: CENTRO** y **Gravedad: CRÍTICA**) y esperar el refresco.
   - **Decir:** *"Los filtros se aplican en base de datos, no en el navegador: el servidor devuelve solo lo que cumple. Noten que al elegir zona, **el municipio se acota** a esa zona."*
3. **Restablecer** para volver al estado completo.

**Paso B — Los 3 indicadores:**
- **Clientes (con los filtros)**: *"la lista filtrada."*
- **Facturación que se pierde** + su equivalente en energía: *"la pérdida total de lo filtrado, con tarifa real."*
- **Los N primeros concentran X %**: *"el 80/20 del negocio: unos pocos clientes concentran la mayor parte de la pérdida — por eso la lista está ordenada."*

**Paso C — La tabla (recorrer columnas con el cursor):**
- **Decir:** *"Columnas de negocio: **puesto** (el orden de la ruta), **NIU**, **municipio, zona y ciclo**, **clase y tamaño**, **tipo de caída**, lo que **consumía vs. consume ahora**, la **caída %**, **cuánto se pierde** en kWh y en pesos, la **tarifa**, y las etiquetas de **gravedad, tendencia, prioridad y situación**."*
- Señalar que **la columna de medida va resaltada** según el conmutador y que **desde el encabezado se puede ordenar**.

**Paso D — ⭐ Click en una fila → ficha del cliente (la demo de oro):**
1. Elegir una fila con caída visible → **esperar a que abra debajo** (si tarda: *"la ficha consulta el servidor una sola vez; ya quedará en caché"*).
2. Recorrer la ficha en 4 bloques:
   - **"Quién es y dónde está":** *"municipio, zona, dirección y nivel de tensión —este viene del TC1 y es solo referencia—, más clase, estrato, tamaño y **segmento** con su descripción."*
   - **"Situación hoy":** señalar **Caída de consumo %** → la frase *"Consumía X y ahora Y…"* → **"Qué revisar / qué decirle":** *"esta es la sugerencia en lenguaje simple para el asesor: qué preguntar, qué revisar, a quién contactar."* → KPIs de **fuga** (nivel, probabilidad, factura promedio).
   - **"Cómo ha venido consumiendo":** *"azul real, naranja punteado pronóstico, rombos grises lectura parcial; pueden abrir 'Ver los datos de la gráfica'."*
   - **"Pronóstico a 6 meses":** tabla mes/valor/modelo + *"grupo, zona, corte y modelo entrenado"*. Si el NIU no tiene pronóstico, leer el motivo que da el sistema.
3. **Decir:** *"Esta misma ficha aparece al elegir fila en cualquier tabla del sistema — es un solo componente."*

**Paso E — Expanders y descarga:**
1. Abrir **"Cuántos clientes hay por gravedad en cada zona regional (toda la lista)"**: señalar barras apiladas (*"toda la lista, sin filtros"*). Cerrar.
2. Señalar el botón **"Descargar esta lista (CSV)"**: *"el CSV respeta los filtros aplicados."* (No hace falta descargarlo en vivo salvo tiempo.)

**Transición:** *"Con la lista lista para la cuadrilla, pasemos al área de soporte."*

### 2.4 · Comercial → las otras listas (recorrido rápido) [≈1,5 min]
- **Clientes sin consumo:** *"8.390 clientes en cero; la columna '**Qué hacer (sugerido)**' traduce el caso en una acción."* Mostrar 1–2 filtros.
- **Probabilidad de fuga:** señalar filtros (nivel por defecto **ALTO+MEDIO**) y la columna **señales observadas**; el aviso del pie: *"lista para priorizar contactos, no predicción."*
- **Clientes que ya se fueron:** *"a quién ya no vale la pena buscar; por política NO se muestra qué comercializador los atiende hoy."*
- **Frases puente cortas** en cada uno (20–25 s cada pantalla).

### 2.5 · Comercial → Proyección de consumo [≈1,5 min]
1. Señalar el **selector de horizonte** (12 meses por defecto): *"el modelo calcula 36; por diseño de negocio mostramos 12 —que es el que se probó contra el pasado."*
2. **KPIs de error:** *"Error del backtest a 1 año: 2,0 % — **lo que la proyección se equivocó al probarla contra el pasado**— y a 2 años: 2,3 %."*
3. **Tabla anual:** columna **Confiabilidad** → los tres estados: *"CONFIABLE si el error ≤ 5 %, ORIENTATIVO si no, NO VERIFICABLE cuando no hay historia para probarlo."*
4. Señalar las **bandas 80 %/95 %** en la gráfica.
5. Mencionar expanders: *"Resumen de todas las zonas por año"* y tabla técnica.

### 2.6 · Comercial → Descargas [≈1 min]
1. Señalar la tabla: *"Grupo de consumo, clientes, corte, archivo, tamaño y **estado**."*
2. **Decir:** *"Hoy los 21 archivos están **disponibles** —el mayor, de 152 MB—. Al pulsar **Descarga**, el archivo baja **directamente desde Blob Storage con una firma temporal**: no pasa por el servidor, así que Vercel no se ve limitado por tamaño."*
3. (Opcional en vivo) pulsar uno pequeño y dejar que baje.

### 2.7 · Soporte → Consultar un cliente [≈1 min]
1. Escribir el **NIU a mano** (el de preparación) → Enter/espera → *"si el NIU existe, se comprueba contra el corte y se abre la ficha —la misma que acaban de ver."*
2. Mostrar el error rápido: escribir un NIU inexistente → *"avisa en lugar de fallar."*
3. Abrir el expander **"¿No tienes el NIU? Buscar por municipio o situación"**: elegir un municipio → señalar la tabla de resultados → **click en fila** → *"la ficha también se abre desde aquí."*

### 2.8 · Soporte → Visitas por ciclo [≈1,5 min] ← pieza central
1. Elegir **Zona regional** y **Ciclo** en los dos selects.
   - **Decir:** *"Esta es la ruta de la cuadrilla. **El orden 1 es el cliente del ciclo con más facturación en riesgo: por ahí se empieza.**"*
2. Señalar los **KPIs**: *Clientes para visitar* (1.650 en el ciclo completo), *Facturación que se pierde*, *Caídas graves*.
3. Señalar el **aviso de calidad**: *"si algún cliente tiene **lectura estimada**, la empresa calculó el consumo: su caída puede no ser real — conviene confirmar la lectura antes de programar la visita. El filtro 'Tipo de lectura' los separa."*
4. **Filtros:** aplicar uno (ej. Gravedad CRÍTICA) → *"la lista se acota en el servidor."*
5. **Tabla:** señalar la columna **"Qué revisar"** — *"sugerencia para la visita: qué preguntar, qué revisar, a quién contactar"* — y que **al elegir fila se abre la ficha** (si hay tiempo, un click).
6. Expanders: **"Ver estos clientes en el mapa"** (rápido) y **"Cómo usar esta lista"**.
7. Señalar **"Descargar la ruta del ciclo XX (CSV)"**.

### 2.9 · Soporte → Resultado de visitas [≈1,5 min] ← pieza central
1. Al entrar, señalar el **banner de ejemplo**: *"hoy no hay visitas reales registradas, así que el sistema muestra un **ejemplo simulado claramente rotulado** — ninguna cifra de aquí mide la calidad de la lista."*
2. **KPIs con sus ayudas (hover):**
   - *Clientes visitados* (300 en el ejemplo) · *Con un problema que la empresa puede corregir* — *"medidor, lectura, facturación, red…"* · *Caída real, sin nada que corregir* — *"predio desocupado, cambio de actividad: la lista acertó"* · *Sin novedad (falsa alarma)*.
   - Línea de **facturación asociada a los casos corregibles**.
3. **Tablas por corte:** señalar los encabezados *"Por severidad, por trayectoria, por estado, por tramo, por zona, por cluster"* y explicar las **precisiones**: *"precision_gestionable = % de verificados con causa corregible; precision_caida_real; sin_novedad = falsos positivos."*
4. **Decir:** *"Cuando la empresa cargue las visitas reales —plantilla → notebook → importador—, estas tablas se llenan con datos reales y el banner desaparece."*

### 2.10 · Administrador — recorrido exprés [≈1,5 min]
1. **Usuarios y roles:** *"alta de usuario con validación —correo y clave mínima—, cambio de rol, deshabilitar y eliminar; con **protección**: no se puede quedar sin administrador."*
2. **Estado del pipeline:** *"chequeos del último mes: correctos, avisos y errores; y el sesgo del pronóstico."*
3. (Si alcanza) **Gestión por ciclo** o **Seguimiento**: una pantalla, una frase.

**Transición al Bloque 3:** *"Hasta aquí la aplicación en uso. Veamos cómo está construida."*

---

## Bloque 3 · Arquitectura (≈2 min)

> "La arquitectura tiene tres anillos:
>
> **1. Fuera de la atención web — el procesamiento.** Nuestro módulo **ProyectoEBSA** hace el trabajo pesado —entrenamiento, segmentación y pronósticos— sobre series de hasta **28,5 millones de registros**, y produce CSV y Parquet. Un **importador con checkpoint reanudable** los carga por lotes en la base de datos, una vez por corte.
>
> **2. La capa de servicio.** En **Vercel** corre el frontend **React con TypeScript** y una **API FastAPI en funciones serverless** —máximo 300 segundos por ejecución— que verifica el token y el rol de Firebase antes de cada consulta. Se respetan los límites de 4,5 MB por respuesta y 100 MB por archivo, por eso los archivos grandes **nunca pasan por la API**.
>
> **3. Los datos.** **Azure SQL**, nivel Standard S3 con 100 DTUs en región **México Central**, con 608 mil clientes, 3,4 millones de pronósticos y 28,5 millones de registros de consumo; **Blob Storage** con los 342 MB de exportes; y **Firebase Authentication** con su plan gratuito para usuarios y roles."

---

## Bloque 4 · Justificación: limitado pero escalable (≈1,5 min)

> "Una pregunta inevitable: **¿no es limitado?** Sí — la capacidad está definida por lo que se contrata hoy: el plan Hobby de Vercel y los 100 DTUs de Azure SQL. Pero el sistema es **escalable sin rediseñar nada**: Vercel agrega instancias automáticamente ante más tráfico —la API no guarda estado, así que se replica— y Azure SQL sube de SKU en minutos. **El techo lo pone la tarjeta, no el diseño**, y el costo crece proporcional a la demanda.
>
> Y sobre el **procesamiento**: está deliberadamente **fuera de la línea de atención**. El entrenamiento y la segmentación ocurren una vez por corte en lote; la web **nunca calcula resultados**, solo sirve consultas indexadas de 0,1 a 0,3 segundos. Por eso el plan más barato es suficiente para atender, y lo que crece —el número de usuarios— lo absorbe el escalado automático, no un redimensionamiento del sistema."

---

## Bloque 5 · Cierre (≈1 min)

> "Para cerrar: el sistema **hoy funciona en producción**, con las tres vistas, control de acceso por rol, descargas directas desde Blob, caché de fichas para abrir clientes instantáneos, y cierre de sesión automático a los 90 minutos de inactividad.
>
> **Datos:** manejamos información real de clientes de la empresa —por eso el modo presentación oculta NIU y direcciones para proyectar—, con corte en abril de 2026. Y el **15 de noviembre** retiramos los recursos de Azure, con la migración del almacenamiento a S3 planificada en esa ventana.
>
> Quedo atento a sus preguntas. Gracias."

---

## Anexo 1 · Posibles preguntas y respuestas

| Pregunta | Respuesta |
|---|---|
| *¿La web entrena modelos?* | No. Entrena **ProyectoEBSA** (nuestro módulo batch); la web solo importa y sirve resultados. |
| *¿Los datos son reales?* | Sí: archivos TC1/TC2 de la empresa procesados por el pipeline; nunca inventamos clientes. El único simulado es el ejemplo de visitas, rotulado como tal. |
| *¿Por qué13 peticiones y después1?* | La ficha originalmente disparaba 13 consultas; las agrupamos en un endpoint que las corre en paralelo en el servidor: de 14–21 s a ~5–7 s. |
| *¿Y la lentitud de visitas por ciclo?* | Un plan de consulta de `pymssql` escaneaba 28,5 M de filas; con un CAST del parámetro al tipo exacto bajó de 21 s a 0,13 s. |
| *¿Cuánto cuesta?* | En fase académica ≈ 0: Vercel Hobby, Firebase gratis, crédito Azure for Students. |
| *¿Es seguro?* | RBAC por rol en cada endpoint, token verificado con revocación en cada petición, modo presentación para no exponer NIU, y la BD privada con autenticación. |
| *¿La sesión qué tan larga es?* | El token se renueva en silencio; la sesión se cierra con el botón o a los 90 minutos de inactividad. Apagar el equipo no cierra la sesión (es comportamiento estándar de la web). |
| *¿Y si falla internet en campo?* | La app es de consulta; las rutas se descargan en CSV antes de salir y la ficha queda en caché local del navegador5 minutos. |
| *¿Qué falta?* | Cargar visitas reales (plantilla → notebook → importador), migrar Blob a S3 antes del 15/11 y, opcionalmente, más pruebas de usuario. |

## Anexo 2 · Tips de la demo

- Orden recomendado: **login → Panorama → Caídas (elegir fila para la ficha) → Visitas por ciclo → Resultado de visitas → Descargas → Usuarios**.
- Ten a mano el NIU `838622969` (o `633620052`) por si algo tarda.
- Si la primera carga va lenta: es el arranque en frío de Vercel; la segunda consulta va rápida (caché).
- Si el tiempo aprieta, recorta en este orden: 2.4 → 2.10 → 2.5 → 2.6 (nunca 2.2/2.3/2.8/2.9).
- Si sobra tiempo, en 2.3.D profundiza la ficha: es donde más preguntas nacen.

---

*Guion generado a partir del código fuente y las mediciones de producción del proyecto. Actualízalo si cambian los datos mostrados (corte, cifras de ejemplo).*
