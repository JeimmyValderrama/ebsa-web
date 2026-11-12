# Manual de usuario — EBSA Web (versión completa)

> **Versión exhaustiva.** Contiene los mismos contenidos que `manual-usuario.md` (versión concisa) **más los textos literales de la aplicación**: tooltips de ayuda, leyendas de gráficas, avisos, estados vacíos y mensajes, tal como aparecen en pantalla. Sirve para comparar ambas versiones y elegir cuál se queda.

Aplicación web para consultar los resultados del análisis de consumo eléctrico de EBSA (proyecto académico UPTC, no oficial de EBSA).

---

## 0. Introducción y elementos globales

### Qué hace el sistema (texto literal "Qué es esto", al pie del Panorama)

> **Qué es esto.** El sistema lee cada mes los archivos TC2 de la empresa y hace tres cosas: (1) **detecta clientes cuyo consumo cayó** más de lo normal para clientes parecidos y los ordena por la facturación que se está perdiendo, para que el área comercial y las cuadrillas sepan a quién revisar primero; (2) **estima la probabilidad de fuga** de cada cliente a otro comercializador en los próximos seis meses; (3) **pronostica el consumo** de cada cliente a seis meses. El valor en pesos siempre usa la tarifa real del cliente, nunca una tarifa supuesta.

Y sus notas complementarias (misma tarjeta):

> **Reglas de la lista.** Las listas no incluyen autogeneradores ni las clases área común, autoconsumos EBSA, distritos de riego y provisionales (regla de negocio acordada con el experto). El valor en pesos usa la tarifa real de cada cliente.

> **Cero sostenido.** Aparte de las caídas, los clientes que llevan3 meses o más en cero o casi cero no se cuentan como caída porque ya no consumen; están en la sección *Clientes sin consumo*.

### Inicio de sesión (pantalla literal)
- Título: **"Analítica de consumo de clientes"**; cabecera con el logo EBSA y la marca **"Analítica de consumo — Proyecto académico UPTC · no oficial de EBSA"**.
- Campos: **Correo electrónico** y **Contraseña** (con botón de ojo "Ver contraseña / Ocultar contraseña").
- Botón: **"Ingresar"** (durante el envío dice **"Validando…"**).
- Pie: *"Proyecto académico (UPTC) aplicado a datos de EBSA. No es un producto oficial de la empresa."*
- Mensajes de error posibles (traducidos del proveedor de acceso):
  - *"El correo o la contraseña no son correctos. Revísalos e inténtalo de nuevo."*
  - *"El correo electrónico no tiene un formato válido."*
  - *"Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo."*
  - *"No hay conexión con el servicio de acceso. Revisa tu internet e inténtalo de nuevo."*
  - *"Esta cuenta está deshabilitada. Contacta al administrador del proyecto."*
  - *"El acceso con correo y contraseña no está habilitado en el proyecto. Contacta al administrador."*
  - Si el proyecto no está configurado: *"Firebase todavía no está configurado. En la siguiente entrega se agregarán las variables del proyecto y podrás iniciar sesión."*

### Roles y qué ve cada usuario

| Rol | Secciones visibles |
|---|---|
| **COMERCIAL** | Comercial |
| **SOPORTE** | Comercial y Soporte |
| **ADMIN_MODELO** (administrador) | Comercial, Soporte y Administrador |

### Elementos globales

- **Corte activo** (píldora "Corte …", arriba a la derecha): mes de datos consultado; lo fija el pipeline.
  - Leyenda de periodo (texto literal): *"Periodo facturado: **urbano \<mes\>** · **rural \<mes\>** (los rurales se leen por trimestres, por eso su periodo puede ir un par de meses atrás)."*
- **Sesión:** permanece abierta aunque apagues el equipo o cierres el navegador (se guarda en el navegador, no en el servidor); se cierra con el botón **Cerrar sesión** o automáticamente después de **1 hora 30 minutos de inactividad**.
- **Medidor Consumo / Facturación** con su explicación literal:
  - En consumo: *"**Consumo**: energía que se deja de consumir, en kWh, MWh o GWh por mes. **Facturación**: esa misma energía valorada con la tarifa real de cada cliente, en pesos por mes. Cambia la unidad de medida; los clientes y las listas son los mismos."*
  - En facturación: *"**Facturación**: pesos por mes que se dejan de facturar, medido con la tarifa real de cada cliente. **Consumo**: la misma pérdida medida en energía (kWh, MWh o GWh). Cambia la unidad de medida; los clientes y las listas son los mismos."*
- **Modo presentación "Ocultar NIU y direcciones"** (caja lateral): *"Modo presentación: en tablas y fichas se ocultan el NIU y la dirección. Las descargas no cambian."*
- **Menú lateral** con grupos por sección; funciona con el historial del navegador.
- **Tabla con ficha:** al elegir una fila de las tablas habilitadas se despliega debajo la ficha del cliente; el pie de esas tablas avisa: *"Elige una fila para ver la ficha."*
- **Estados genéricos de tabla:** carga ("Consultando…"), error ("No fue posible…") y vacío (*"Ningún cliente cumple estos filtros. Prueba a quitar alguno."* en los filtros de listas).

---

## 1. Comercial

### 1.1 Resumen → Panorama comercial
**Para qué sirve:** vista de entrada: cuántos clientes tienen caída, cuánto se pierde al mes, dónde está pasando y cómo se reparte lo que hay que hacer.

**Controles:**
- **Medidor Consumo/Facturación** (textos literales arriba, en *Elementos globales*).
- Horizonte de la proyección (se controla desde *Proyección de consumo*).

**Tarjeta principal (hero):**
- Título: *"{N} clientes consumen menos de lo normal para clientes parecidos"*.
- Bajada según el medidor (literal): *"Entre todos dejan de consumir **\<X\> al mes** (energía que antes pasaba por sus medidores y ya no). En pesos: $\<Y\>/mes con la tarifa real de cada cliente. Así se reparte según lo que hay que hacer:"* (o la variante en pesos con el equivalente en energía).
- **Banda de prioridades** con tres segmentos: **Gestionar ahora**, **Seguimiento**, **Vigilar** (valor/mes + número de clientes de cada uno).
- Leyenda literal: *"**Gestionar ahora** son las caídas recientes (\<X\>/mes). **Seguimiento** son caídas que llevan meses en ese nivel: reales, pero no urgentes. **Vigilar** reúne clientes de temporada y con recuperación prevista."*

**Fila de indicadores 1 (KPIs con su ayuda literal):**
| Indicador | Nota / tooltip literal |
|---|---|
| **Caídas graves recientes** | nota: "Revisar primero medidor y lectura" · ayuda: *"Caída reciente muy por encima de lo normal del segmento: revisar medidor y lectura antes de dar por buena la cifra. Las que llevan meses así se cuentan aparte, como antiguas."* |
| **Nuevos en la lista este mes** | nota: "N vienen del corte anterior" |
| **Probabilidad de fuga alta o media** | nota: "No significa que se vayan a ir: es a quién contactar primero" · ayuda: *"Probabilidad de fuga ALTA o MEDIA según el modelo, entre los clientes comerciales, industriales, oficiales y acueductos. No significa que se vayan a ir: es a quién contactar primero."* |
| **Consumo de esos clientes** (medidor consumo) | nota: "Promedio de los últimos6 meses" · ayuda: *"Energía que consumen hoy los clientes con probabilidad de fuga alta o media (promedio de6 meses). Es lo que estaría en juego si se fueran; no es una predicción de que se vayan."* |
| **Pérdida esperada (fuga)** (medidor facturación) | nota: "Orden de magnitud para priorizar" · ayuda: *"Probabilidad de fuga × lo que factura hoy cada uno. Es un orden de magnitud para priorizar, no dinero que se vaya a perder con certeza."* |

**Fila de indicadores 2:**
- **Clientes sin consumo** — nota: "3 meses o más en cero o casi cero; consumían/facturaban X" · ayuda: *"No se cuentan como caída porque ya no consumen; están en la sección Clientes sin consumo."*
- **Ya atendidos por otro comercializador** — ayuda: *"Según el archivo de otros comercializadores de la empresa."*
- **Grandes clientes en vigilancia (no regulados)** — nota: "Pueden negociar con cualquier comercializador" · ayuda: *"Ciclo33, clase no regulada o más de55.000 kWh/mes: pueden negociar con cualquier comercializador."*

**Mapa y tablas laterales:**
- Tarjeta **"Dónde está pasando"** — bajada: *"Municipios de Boyacá con sus límites oficiales"*.
- Tarjeta **"Los diez municipios con más"** (ranking de municipios por la medida elegida).
- Tarjeta **"Resumen por zona"** — bajada: *"{métrica}, agregado por zona EBSA"*.
- Desplegable **"Ver la tabla por municipio"**.

**Caídas de consumo por zona regional:**
- Tarjeta con bajada: *"Cuántos clientes tienen caída de consumo en cada dirección regional y de qué gravedad"*.
- Barras apiladas (leyenda de colores por gravedad) + tabla: **Zona regional · Clientes con caída · Facturación/Consumo que se pierde ($/mes o kWh/mes)** — ordenable por columna.
- Leyenda literal: *"**Grave** = caída reciente muy por encima de lo normal del segmento: revisar medidor y lectura primero. **Antigua** = lleva meses en ese nivel; va en seguimiento, no como urgente."*

**Gráficas de barras:** *"Consumo/Facturación en riesgo por clase de servicio"* y *"…por tamaño del cliente"*, ambas con bajada *"kWh (o pesos) por mes, de mayor a menor"*.

**Consumo de energía de todos los clientes:**
- Tarjetas anuales por año (real / proyectado / real + proyección) y gráfica con leyenda literal: *"Consumo real · Proyección y rango del80 %"*.
- Pie literal: *"La proyección es un escenario con margen de error, no una cifra exacta: el detalle por zona, las bandas y qué años son confiables están en la sección Proyección de consumo."*

**Expansores:** *"Qué cambió frente al mes anterior"* — *"Clientes que entraron, salieron o siguen en la lista de caída frente al corte anterior."* · tarjeta de ayuda *"Qué es esto y cómo leer las cifras"* (textos del inicio de este manual).

**Estado sin datos:** *"Todavía no hay salidas del pipeline. Corre python pipeline_mensual.py --modo aplicar y vuelve a abrir la página."*

### 1.2 Listas → Caídas de consumo
**Para qué sirve:** la lista de trabajo de campo, ordenada por lo que se pierde, para armar la ruta de la cuadrilla.

**Controles (etiquetas exactas):** filtros múltiples **Prioridad** (defecto *GESTIONAR*), **Tipo de caída**, **Gravedad**, **Tendencia**, **Zona regional**, **Municipio** (se acota a la zona elegida — ayuda literal: *"Si hay una zona regional elegida, aquí solo aparecen los municipios de esa zona."*), **Clase**, **Tamaño**; deslizador **N** de filas (25–2000, espera300 ms); botón **"Descargar esta lista (CSV)"**.

**Indicadores:**
- **Clientes (con los filtros)**.
- **Consumo/Facturación que se pierde** con su equivalente en la otra unidad.
- **"Los N primeros concentran X %"** — nota: "del consumo/facturación perdido con estos filtros".

**Tabla (columnas exactas):** Puesto · NIU · Municipio · Zona regional · Ciclo · Clase · Tamaño · Tipo de caída · Consumía (kWh/mes) · Consume ahora (kWh/mes) · Caída · Consumo que se pierde (kWh/mes) · Facturación que se pierde ($/mes) · Tarifa ($/kWh) · Gravedad · Tendencia · Prioridad · Situación. (Las columnas de medida cambian de orden con el medidor; el pie de la tabla recuerda elegir fila para ver la ficha.)

**Expanders y avisos:**
- *"Cuántos clientes hay por gravedad en cada zona regional (toda la lista)"*: barras apiladas con leyenda de gravedad (Grave/Fuerte/Moderada/Antigua).
- Aviso de clientes en cero sostenido y la tarjeta **Cómo leer esta lista**.
- Estado vacío: *"Ningún cliente cumple estos filtros. Prueba a quitar alguno."*

### 1.3 Listas → Clientes sin consumo
**Para qué sirve:** clientes con3 meses o más en cero o casi cero (no son caída): confirmar retiro, suspensión o predio desocupado.

**Controles:** **Zona regional · Municipio · Situación · Tiempo sin consumo · Tamaño**.

**Indicadores:** **Clientes sin consumo · En cero · Casi cero**.

**Tabla (columnas):** NIU · Municipio · Zona regional · Clase · Tamaño · Situación · Consumía antes (kWh/mes) · Consume ahora (kWh/mes) · Facturaba antes ($/mes) · Tarifa ($/kWh) · Último mes con consumo · Meses sin consumo · **Qué hacer (sugerido)**.

**Resumen por tramo:** *Tiempo sin consumo · Qué hacer (sugerido) · Clientes · Consumían antes · Facturaban antes*.

**Avisos literales:**
- Sin datos: *"No hay clientes en cero sostenido en este corte (o la lista no se ha recalculado con la versión actual)."*

### 1.4 Listas → Probabilidad de fuga
**Para qué sirve:** priorizar contactos entre clientes con señales de fuga a6 meses. **No es predicción de quién se va.**

**Controles:** **Nivel de riesgo** (defecto ALTO y MEDIO), **Zona regional**, **Grupo de consumo**, **Clase de servicio**, **Municipio** (ayuda: *"Si hay una zona regional elegida, aquí solo aparecen los municipios de esa zona."*), deslizador de cuántos mostrar y **"Descargar esta lista (CSV)"**.

**Indicadores:** **Clientes** · **Consumen/Facturan (promedio6 meses)** · **Consumo esperado en riesgo / Pérdida esperada** (según medidor).

**Tabla principal (columnas):** Prioridad · NIU · Municipio · Zona regional · Ciclo · Clase · Tamaño · Consumo promedio6 meses (kWh/mes) · Factura promedio6 meses ($/mes) · Probabilidad de fuga (6 meses) · Riesgo · Consumo esperado en riesgo (kWh/mes) · Pérdida esperada ($/mes) · Señales observadas · Situación.

**Pie:** tabla grande de **Mercado no regulado** aparte.

**Textos literales de aviso y "cómo leerlo":**
> **Aviso de límite:** "Con unos80 clientes que se han ido, el modelo **no ordena mejor que listar a los clientes por tamaño** (consumo de12 meses); en validación, de los100 primeros se fueron4. Es una lista de clientes grandes con señales para priorizar contactos, no una predicción de quién se va; la pérdida esperada es un orden de magnitud."

> **Cómo leer:** "El modelo mira cómo se comportaron los clientes que ya se fueron y busca los que hoy se parecen: caída reciente, meses en cero, zona con más salidas, tamaño. **ALTO** es el1 % con mayor puntaje del modelo y **MEDIO** llega hasta el5 %; nadie por debajo del riesgo promedio entra. La probabilidad es a6 meses y está calibrada con lo que pasó en validación… Tiene un tope: a los pocos clientes con puntaje más alto que cualquiera visto en validación se les muestra la probabilidad máxima comprobada…; la pérdida esperada es probabilidad × lo que factura."

**Avisos de estado:**
- Sin datos: *"Todavía no hay riesgo de fuga calculado (paso14 del pipeline)."*
- Vigilancia vacía: *"Hoy no hay clientes en vigilancia."*
- Estado vacío de filtros: *"Ningún cliente cumple estos filtros. Prueba a quitar alguno."*

### 1.5 Listas → Clientes que ya se fueron
**Para qué sirve:** a quién ya no vale la pena buscar. **Por política de la empresa no se muestra qué comercializador atiende hoy a cada cliente.**

**Controles:** filtros **Estado** y **Municipio**.

**Tabla (columnas):** NIU · Estado · Municipio · Zona · Clase · Desde · Mes de salida estimado · Consumía antes (kWh/mes) · Facturaba antes ($/mes) (con el medidor, la columna de medida va primero).

**Expander:** *"Cómo son los que se fueron (clase, zona, tamaño, municipio)"* con tabla **valor · n · pct**.

**Pie literal:** *"Sirve para saber a quién ya no vale la pena buscar, cuánto consumían y cómo eran, para reconocer a los que se parecen. Por política de la empresa no se muestra qué comercializador atiende hoy a cada cliente. Los clientes en cero o casi cero (que siguen conectados pero ya no consumen) están en la sección Clientes sin consumo."*

**Avisos de estado:**
- *"No hay archivo de otros comercializadores en 00_otros_comercializadores."* (tipo: calidad de datos)
- *"Ningún cliente cumple estos filtros. Prueba a quitar alguno."*

### 1.6 Planeación → Proyección de consumo
**Para qué sirve:** la proyección de consumo **por zona para la compra de energía**, con horizonte configurable y verificación del modelo.

**Controles:**
- **Horizonte** (segmentado; por defecto12 meses). Ayuda literal: *"El modelo calcula36 meses; por pedido de negocio se presenta un año, que es el horizonte probado contra el pasado (backtest). Los meses y años que no se muestran siguen en los archivos descargables y no cambian."*
- **Zona regional** y **escenario**. Pie literal del escenario: *"El escenario base es el que menos se equivocó al probarlo contra los últimos dos años; el otro responde la hipótesis contraria. Cuál usar es una decisión de planeación: para no comprar de menos, lo usual es tomar el mayor de los dos como techo."*

**Indicadores:** **Error del backtest a1 año · Error del backtest a2 años · Margen de error medido a1/a2 años** (WAPE %).

**Tabla anual (columnas):** Año · Meses reales · Meses proyectados · Consumo real (GWh) · Proyección (GWh) · Total del año (GWh) · Banda80 % (GWh) · Banda95 % (GWh) · **Confiabilidad** · Error del backtest.
- Estados de confiabilidad (texto literal de la tarjeta): *"**CONFIABLE** si el error (…) ≤5 %; **ORIENTATIVO** si fue mayor; **NO VERIFICABLE** cuando la historia disponible (52 meses) no alcanza para probar ese horizonte, así que es extrapolación de tendencia y estacionalidad."*
- Pie de bandas: *"La banda anual suma las bandas mensuales, por eso es conservadora (más ancha que la del año como un todo). El año en curso combina meses reales y proyectados."*
- Años fuera del horizonte: *"Los años … no se muestran porque su proyección va más allá del horizonte elegido (elige Todo lo calculado para verlos; son extrapolación del modelo, no horizonte verificado)."*

**Expanders:** *"Resumen de todas las zonas por año"* · tabla de **margen de error por zona (1 y2 años)** · **tabla técnica** (modelo elegido, errores, línea base y sesgo por zona).

**Sin proyección:** aviso con el comando literal: *"Todavía no existe la proyección. Desde la carpeta del código corre: python proyeccion_anual_consumo.py …"*

**Serie vacía:** *"No hay serie mensual para los filtros elegidos."*

### 1.7 Planeación → Descargas
**Para qué sirve:** bajar los CSV de exportes (listas de caída, pronóstico, riesgo de fuga por grupo).

**Tabla (columnas):** Grupo de consumo · Clientes · Corte · Archivo · Tamaño (MB) · **Estado** (`disponible` / `no encontrado`).

**Botón:** **"Descargar"** por fila (solo en estado `disponible`); el archivo se baja directo del almacenamiento.

**Avisos:** *"No hay archivos disponibles para descargar."* · errores de descarga: *"No fue posible descargar el archivo."*

---

## 2. Soporte

### 2.1 Clientes → Consultar un cliente
**Para qué sirve:** abrir la ficha completa de un cliente por NIU.

**Bajada literal de la página:** *"Escribe el NIU y verás, en una sola página, dónde está, qué le pasa al consumo, qué probabilidad de fuga tiene y qué conviene revisar o decirle."*

**Controles:**
- Campo con placeholder literal: *"Escribe o pega el NIU (sin puntos ni espacios)"*.
- Expander: **"¿No tienes el NIU? Buscar por municipio o situación"** con filtros **Municipio · Gravedad · Tendencia**, leyenda *"N clientes de la lista de caída cumplen el filtro (se muestran hasta50). Copia el NIU y pégalo arriba."* y tabla **NIU · Municipio · Clase · Gravedad · Tendencia · Facturación que se pierde ($/mes)** (al elegir una fila se abre la ficha debajo; el pie de tabla invita a elegir fila).
- Estado vacío de la búsqueda: *"Ningún cliente cumple estos filtros. Prueba a quitar alguno."*

**Si el NIU no existe (aviso literal):** *"No hay ningún cliente con el NIU **X** en los datos del corte. Revisa el número (sin puntos ni espacios) o búscalo por municipio en el desplegable de arriba."*

**La ficha del cliente (4 bloques):**
1. **Quién es y dónde está** — KPIs: Municipio · Zona · Dirección · **Nivel de tensión (TC1)** con ayuda literal: *"Nivel de tensión tal como viene en el archivo TC1 de la empresa (1 = baja tensión;2,3 y4 = niveles superiores). Es el dato registrado en el inventario de usuarios: puede estar desactualizado si el cliente amplió carga después (observación de negocio, octubre2026). El proyecto no dispone de una fuente más reciente, así que se muestra como referencia y no se usa en ningún cálculo."*
   - Pies: *"El nivel de tensión viene del TC1 (corte …) y puede no reflejar ampliaciones de carga posteriores; es solo referencia."* o *"Este NIU no está en el archivo TC1 cruzado (puede ser un cliente nuevo)."*
   - Línea de clase/estrato/tamaño/segmento con la descripción del segmento.
2. **Situación hoy** — avisos:
   - *"**Autogenerador**: produce parte de su propia energía, por eso consume menos de la red. No aparece en las listas de caída ni de fuga; una caída en él no es un problema."*
   - *"**Ya está con otro comercializador**, desde YYYY-MM. Estado en el archivo de la empresa: …"*
   - *"**Cliente de mercado no regulado** (…): por su tamaño puede negociar con cualquier comercializador. Probabilidad de fuga: … (… en6 meses). Lo lleva el área comercial, no la cuadrilla."*
   - *"**Lleva N meses o más en cero o casi cero** (facturaba $X/mes). No está en la lista de caída: ya no hay consumo que revisar; conviene confirmar si está retirado, suspendido o el predio está desocupado."*
   - KPIs de caída: **Caída de consumo (%)** (ayuda: *"Consumo reciente frente a la referencia con la que se midió la pérdida: en una caída reciente, la menor entre el periodo anterior y el mismo periodo del año pasado (para no exagerar); en una caída que lleva meses, el año pasado."*), **Gravedad** (o "Estacional" con ayuda: *"Es temporada baja de un cliente que ya volvió otras veces: no se trata como caída grave."*), **Tendencia**.
   - Frase de la pérdida y la **sugerencia**: *"**Qué revisar / qué decirle:** …"* (textos de la regla `queRevisar`, ver §5 Anexo).
   - KPIs de fuga: nivel (ALTO en alerta), **Probabilidad en6 meses**, **Factura/Consumo promedio (últimos6 meses)** y pie con señales.
   - Si no está en la lista: *"No está en la lista de caída: su consumo se mantiene dentro de lo normal para clientes parecidos."* · *"No está entre los clientes a los que se les calcula probabilidad de fuga (es residencial, alumbrado, provisional o sin historia suficiente)."*
3. **Cómo ha venido consumiendo** — leyenda: *"Consumo real · Pronóstico del modelo · Lectura parcial"*; pie: *"Línea continua azul: consumo real (18 meses hasta el corte). Línea punteada naranja: pronóstico del modelo. Rombos grises: meses con lectura parcial (rurales a la espera de la lectura trimestral)."*; expander *"Ver los datos de la gráfica"*; si es rural: *"Cliente rural (lectura trimestral). Corte rural …: los meses posteriores muestran el pronóstico; el valor real reemplaza al pronosticado cuando llegue la lectura."*; sin serie: *"El NIU no tiene filas en la serie de modelado."*
4. **Pronóstico a6 meses** — tabla mes · pronóstico kWh · modelo; pie con grupo/zona/cortes; sin pronóstico explica el motivo (literal): *"no tiene lectura en el mes de corte (…): su último dato es de …. El modelo solo pronostica a los clientes con dato en el corte; tendrá pronóstico cuando llegue su lectura… Mientras tanto, la lista de caída lo evalúa con su último mes conocido"* / *"solo tiene N meses con dato y el modelo necesita al menos12"* / *"tiene dato en el corte (…) e historia suficiente, pero no quedó en el archivo de pronóstico; revisar en el registro de la corrida el paso de pronóstico…"*; regla en cero: *"Este cliente lleva sus dos últimos meses en cero (o casi): el pronóstico es persistencia del último valor, no una recuperación. Si vuelve a consumir, la regla deja de aplicar sola el mes siguiente."*

### 2.2 Clientes → Caídas de consumo
Ver §1.2 (misma sección).

### 2.3 Trabajo de campo → Visitas por ciclo
**Bajada literal (Streamlit original, referencia):** *"Elige la zona regional y el ciclo (la ruta de lectura). Orden1 es el cliente del ciclo con más facturación en riesgo: por ahí empieza la cuadrilla."*

**Controles:** **Zona regional** y **Ciclo**; filtros **Municipio · Gravedad · Tendencia · Situación (Nuevo/Persistente/Reincidente) · Tipo de lectura**; botón **"Descargar la ruta del ciclo XX (CSV)"**.

**Indicadores:** **Clientes para visitar** · **Facturación que se pierde** · **Caídas graves**.

**Aviso de calidad (literal):** *"6 de estos clientes tienen lectura estimada: la empresa estimó el consumo, así que su caída puede no ser real. Conviene confirmar la lectura antes de programar la visita (filtro Tipo de lectura)."* — rotulado **CALIDAD DE LOS DATOS**.

**Tabla:** clientes del ciclo con datos de gestión y columna **Qué revisar** (regla literal en §5); fila elegida → ficha debajo; filtro vacío: *"Ningún cliente de este ciclo cumple estos filtros. Prueba a quitar alguno o a elegir otra prioridad."*

**Expanders:** *"Ver estos clientes en el mapa"* · *"Cómo usar esta lista"*.

### 2.4 Trabajo de campo → Resultado de visitas
**Para qué sirve:** resultados de las visitas de campo contra la lista (precisión por corte).

**Indicadores (títulos exactos):** **Clientes visitados** · **Con un problema que la empresa puede corregir** (ayuda: *"De los verificados: medidor dañado o manipulado, error de lectura o facturación, falla de red, conexión irregular."*) · **Caída real, sin nada que corregir** (ayuda: *"Predio desocupado, cambio de actividad, autogeneración o cliente retirado: la lista acertó, pero no hay recuperación."*) · **Sin novedad (falsa alarma)** · línea *"Facturación asociada a los casos con problema corregible: $X/mes."*

**Leyenda literal:** *"precision_gestionable: % de verificados con un problema que la empresa puede corregir. precision_caida_real: % donde la caída era real, gestionable o no. sin_novedad: falsos positivos."*

**Tablas por corte** (encabezados): *Por severidad · Por trayectoria · Por estado en lista · Por tramo de consumo · Por zona · Por cluster* (cada una: visitados, verificados, con causa gestionable, caída real sin gestión, sin novedad, precisiones y valor riesgo).

**Avisos (literales):**
- Con ejemplo simulado: *"**EJEMPLO ILUSTRATIVO — RESULTADOS SIMULADOS.** Lo que sigue NO son visitas reales: es una muestra de clientes de la lista a la que se le asignó un hallazgo al azar, solo para mostrar cómo se vería esta página si la empresa registrara las visitas. Todos los grupos se simularon con las mismas probabilidades, así que las diferencias entre grupos son azar y ninguna cifra de aquí mide la calidad de la lista."*
- Estado sin ningún dato: *"Aún no hay resultados de campo. Llenar la plantilla resultado_gestion_plantilla.csv (carpeta07_gestion_caida/retroalimentacion de los datos) y correr Evaluacion_retroalimentacion_gestion.ipynb."* + *"Para ver un ejemplo de cómo se vería esta página con visitas registradas: python generar_ejemplo_retroalimentacion.py"*

---

## 3. Administrador

### 3.1 Resumen → Resumen del periodo facturado
**Título literal:** *"Resumen del periodo facturado"* (con el periodo facturado urbano/rural de la leyenda global).

**Indicadores:** **Clientes en la lista · kWh/mes en riesgo · Valor en riesgo / mes · Ciclos con clientes**; bloque de fuga: **Clientes puntuados · Riesgo ALTO · Riesgo MEDIO · Pérdida esperada / mes (ALTO+MEDIO)** (con la ayuda de nivel: ALTO = *"Está en el1 % de clientes con mayor puntaje del modelo (y por encima del riesgo promedio). Contactar primero."*; MEDIO = *"Está entre el1 % y el5 % con mayor puntaje del modelo. Vigilar y contactar según valor."*) · **Corte · modelo**.

**Tabla por ciclo (columnas):** ciclo · zona del ciclo · n_clientes · kwh_riesgo_mes · n_criticos · n_rural · valor_riesgo_mes · pct_del_total · acumulado_pct.

**Tarjeta "Severidad"** con bajada literal: *"Severidad relativa al segmento: CRITICA ≥2 escalas por encima del umbral, FUERTE ≥1, MODERADA el resto"*.

**Expander "Qué significa cada trayectoria" (literales):**
- *CAIDA_ACELERANDO:* "El modelo prevé que el mes que viene siga bajando. Máxima urgencia."
- *SIN_RECUPERACION_PREVISTA:* "El modelo no prevé cambio mayor a su propio error: se queda en el nivel caído."
- *RECUPERACION_PREVISTA:* "El modelo prevé que vuelva. Vigilar, no despachar."
- *NO_EVALUABLE_RURAL:* "Rural excluido de trayectoria por sesgo del pronóstico en el borde."
- *SIN_PRONOSTICO:* "El cliente no tiene fila en el pronóstico (historia insuficiente)."

**Estados vacíos:** *"Sin datos de estado en la lista."* · *"Sin datos de severidad."*

### 3.2 Listas y gestión → Gestión por ciclo
**Controles:** selector **Ciclo**; filtros **Severidad · Trayectoria · Estado en lista · Grupo de consumo · Tipo de lectura · Municipio**.
- Ayuda de lectura (literal): *"REAL: lectura tomada del medidor. ESTIMADA: la empresa estimó el consumo. Una caída con lectura estimada puede no ser real."*
- Ayuda de municipio: *"Si hay una zona regional elegida, aquí solo aparecen los municipios de esa zona."* (aplica donde aparece).

**Indicadores:** **Clientes · kWh/mes · Valor/mes** (de lo filtrado).

**Tabla (columnas):** orden_en_ciclo · ciclo · NIU · municipio · zona regional · zona del ciclo · clase · estrato · grupo de consumo · cluster · severidad · trayectoria · prioridad · estado en lista · meses consecutivos · consumo anterior · consumo reciente · pérdida (kWh) · tarifa · valor en riesgo · pronóstico mes+1 · consumo semestral · valor facturado · tipo de medidor · tipo de lectura. Fila elegida → ficha.

**Expander "Clientes por severidad (general o por zona regional)"** con sus dos pies literales:
> *"Aquí se muestra la severidad original del estudio de caída (tamaño de la caída frente a clientes parecidos), incluidas las caídas que llevan meses así. En las vistas Comercial y Soporte, y en el mapa, esas caídas antiguas se muestran como 'Antigua' y 'Grave' queda solo para las recientes: por eso el conteo de críticas es menor allá."*
> *"Por zona se usa la gravedad de negocio (la misma de las vistas Comercial y Soporte): las caídas que llevan meses así aparecen como 'Antigua'. La vista General usa la severidad original del estudio de caída, incluidas las antiguas."*

### 3.3 Listas y gestión → Ranking gerencial
**Títulos según medidor:** *"Ranking por consumo en riesgo"* / *"Ranking por valor en riesgo"*.

**Controles:** filtros **Zona regional · Grupo de consumo · Clase de servicio · Municipio** + deslizador **"Mostrar top"** (25–1000; por defecto100; el botón de restablecer vuelve a100).
- Ayuda de zona: *"Agrupa el ciclo urbano, el rural y los seccionales de una misma dirección regional"*.

**Indicador:** **Parte del total filtrado**.

**Tabla (columnas):** puesto · NIU · municipio · zona regional · zona del ciclo · clase · grupo · gravedad · trayectoria · estado en lista · consumo anterior · consumo reciente · pérdida (kWh) · tarifa · valor en riesgo · referencia · caída %. Fila elegida → ficha.

**Pie literal:** *"Sin autogeneradores ni las clases área común, autoconsumos EBSA, distritos de riego y provisionales (regla de negocio). El filtro de zona usa la zona regional: ciclo urbano, rural y seccionales juntos."*

### 3.4 Listas y gestión → Riesgo de fuga
**Título:** *"Riesgo de fuga a otro comercializador"* · **KPIs:** Clientes puntuados · Riesgo ALTO · Riesgo MEDIO · Pérdida esperada / mes · Corte · modelo.

**Controles (pestaña Lista):** **Nivel de riesgo** (defecto ALTO+MEDIO) · **Zona regional** · **Grupo de consumo** · **Clase de servicio** · **Municipio**; radio **Ordenar por**: *"Pérdida esperada (probabilidad × valor)"* o *"Probabilidad de salida"*.

**Pestañas (etiquetas exactas):** **Lista · Por zona y grupo · Ya con otro comercializador · Vigilancia no regulados · Calidad del modelo · Seguimiento.**
1. **Lista (columnas):** ranking · NIU · nivel_riesgo · prob_fuga_6m · valor_esperado_perdida_mes · valor_en_riesgo_mes · municipio · zona_regional · zona_nombre · clase_servicio_nombre · grupo_consumo · estrato · consumo_actual_kwh · consumo_prom_6m_kwh · consumo_prom_12m_kwh · variacion_3m_vs_12m_pct · meses_cero_3m · senales · estado_en_lista · meses_consecutivos_en_lista · tarifa_kwh · consumo_promedio_semestral_kwh · tipo_medidor_nombre · tipo_lectura_nombre.
2. **Por zona y grupo:** por ciclo/zona (ciclo, zona, puntuados, alto, medio, pérdida esperada, zona regional) y por grupo (grupo, puntuados, alto, medio, prob. media, pérdida esperada).
3. **Ya con otro comercializador (columnas):** NIU · estado · municipio · primer_mes_otro · ultimo_mes_otro · mes_salida · fuente_salida · zona · clase · estrato · consumo_prom_6m_antes_salida · consumo_prom_otro · tarifa · valor_facturado_antes_salida · nivel_tension. Expander: *"Perfil de los que se fueron (clase, zona, tamaño, municipio)"* (valor · n · pct). Sin archivo: *"No hay archivo de otros comercializadores en00_otros_comercializadores."*
4. **Vigilancia no regulados (columnas):** NIU · motivo · estado · nivel_riesgo · prob_fuga_6m · municipio · zona · clase · grupo · consumo actual/prom6m/prom12m · tarifa · valor facturado · señales · fecha_corte. KPIs: **En vigilancia · Riesgo ALTO · Riesgo MEDIO · Facturación / mes**. Vacío: *"Ningún cliente cumple hoy los criterios de vigilancia."*
5. **Calidad del modelo (columnas):** conjunto · n_filas · n_positivos · AUC · precision/recall/lift en top50,100,200,500. Sin métricas: *"Sin métricas: el modelo no se ha reentrenado todavía."*
6. **Seguimiento (columnas):** fecha_corte_lista · nivel_riesgo · clientes_senalados · salieron_en_ventana · pct_salieron · meses_transcurridos · ventana_completa · observable · salidas_conocidas_hasta · evaluable_en_corte. Vacío: *"Todavía no hay cortes anteriores con lista de riesgo de fuga. Se llena mes a mes."*

**Expansores/KPIs extra:** *"Qué significa cada nivel"* (ALTO/MEDIO/BAJO, textos del glosario) · ficha de vigilancia con KPIs.

**Sin archivo principal:** *"No existe riesgo_fuga_clientes.csv. Corre el pipeline (paso14) y vuelve a abrir la página."*

### 3.5 Listas y gestión → Cortes
**Bajada literal:** *"Dónde se concentra la facturación en riesgo, por cada forma de agrupar a los clientes."*

**Tabla por agrupación (columnas):** valor_corte (grupo) · n_clientes · kwh_riesgo_mes · n_criticos · valor_riesgo_mes — bajada de cada tarjeta: *"Valor en riesgo por mes, de mayor a menor"*.

**Sin archivo:** *"No existe resumen_gestion_por_corte.csv"* (alerta).

### 3.6 Listas y gestión → Mapa
**Título literal:** *"Mapa: dónde están los clientes, las caídas y el riesgo de fuga"* — versión técnica (altura ampliada) del mapa de Boyacá con la medida elegida, sus métricas (consumo/facturación/técnicas), tablas por zona y municipio y descarga CSV del mapa. Sin coordenadas: *"No hay coordenadas válidas en este corte."*

### 3.7 Listas y gestión → Buscar cliente
Misma pantalla que §2.1 (NIU + expander por municipio/situación + ficha).

### 3.8 Modelos → Pronóstico 6 meses
**Título:** *"Pronóstico de consumo a6 meses"*.

**Indicadores y sus ayudas literales:**
- **Clientes pronosticados**.
- **Corte de datos** — ayuda: *"Urbanos: último mes completo. Rurales: último trimestre cerrado; sus primeros meses pronosticados son meses que ya pasaron pero aún no tienen lectura."*
- **Modelo entrenado con corte** · **Modo de la última corrida**.

**Tabla WAPE por grupo (columnas):** grupo_consumo ·1 ·2 ·3 ·4 ·5 ·6 (meses adelante) — bajada: *"Error porcentual ponderado (WAPE %); columnas = meses adelante"*.
- Ayuda literal: *"WAPE %: error porcentual ponderado. 'Sin historia suficiente' no tiene modelo (solo línea base): su error alto no es un fallo del sistema, es falta de historia. … La comparación contra pronósticos más simples está en la tabla de abajo."*

**Tabla de pronósticos ingenuos (columnas):** Meses adelante · Error del modelo (%) · Repetir el último mes (%) · Promedio de3 meses (%) · Mismo mes del año anterior (%) · Mejor pronóstico simple · Ventaja del modelo (puntos).
- Aviso literal: *"Error porcentual ponderado del backtest. La ventaja del modelo frente al mejor pronóstico simple es pequeña a un mes y crece con el plazo; en clientes rurales el backtest a1 y2 meses es optimista (lecturas trimestrales repartidas), y la cifra que vale para ellos es la del seguimiento en vivo…"*

**Expanders:** *"Qué algoritmo usa cada grupo"* · *"Versiones de los modelos (12_versiones_modelos)"*.

### 3.9 Modelos → Proyección de consumo
Mismo componente que §1.6 (mismos controles, KPIs, tablas y textos).

### 3.10 Modelos → Seguimiento
**Título:** *"Seguimiento: lo pronosticado contra lo que pasó"*.

**Ayudas y avisos literales:**
- Ayuda del índice: *"fecha_corte_modelo: con qué versión del modelo se hizo cada pronóstico; meses_desde_entrenamiento: cuánto llevaba sin reentrenar. Si el WAPE sube con esa antigüedad, toca reentrenar (estado_modelos.py lo dice)."*
- *"El error en vivo es mayor que el del backtest, sobre todo en clientes rurales (lectura trimestral): la cifra que vale para decidir es esta, la medida contra lo que realmente pasó."*

**Tabla índice (columnas):** fecha_corte · fecha_corte_modelo · meses_desde_entrenamiento + **1…6** (error a cada mes adelante); bajada: *"Filas = corte en que se hizo el pronóstico; columnas = meses adelante"*.

**Expanders:**
- *"Por perfil (con diferencia contra el backtest)"* — estados literales: *"RECUPERADO: volvió al menos al90 % del nivel contra el que se midió su caída… SIGUE_CAYENDO: quedó por debajo del90 % del promedio de su ventana reciente. ESTABLE_BAJO: se quedó en el nivel caído. Cada lista de zona se cuenta una sola vez."*
- *"Por zona"* — aviso: *"No hay grupo de control: son porcentajes descriptivos, no una prueba de que la lista acierte."*

**Sin datos:** *"Todavía no hay meses posteriores consolidados para ninguna lista."*

### 3.11 Modelos → Retroalimentación
Mismo panel que §2.4 (KPIs de precisión, avisos y tablas por corte).

### 3.12 Operación → Descargas por grupo
Mismo componente que §1.7 (habilitado para administración).

### 3.13 Operación → Estado del pipeline
**Bajada literal:** *"Control de calidad del último mes que entró, últimas corridas y sesgo del pronóstico."*

**Indicadores:** **Mes evaluado · Chequeos correctos (X de N) · Chequeos con aviso · Chequeos con error**.

**Ayuda literal:** *"En la tabla, resultado dice si el chequeo pasó (OK). nivel no es el resultado: es qué tan grave sería si fallara (ERROR detiene la corrida; AVISO solo informa)."*

**Tablas:** control de calidad (chequeo · resultado · nivel · valor_mes · referencia · detalle · mes_evaluado) · sesgo (zona · n · mediana · p25 · p75) · expander de últimas corridas.

**Avisos:** *"Sin reporte de control de calidad (se genera en Reconstruccion_serie_tiempo_consumo_rural.ipynb)."* · *"Sin corridas registradas."*

### 3.14 Sistema → Usuarios y roles
**Formulario:** correo (validado), contraseña (mínimo6, con "Ver contraseña"), **rol** (COMERCIAL / SOPORTE / ADMIN_MODELO) y botón de crear; validación en línea (correo con formato inválido o clave corta deshabilitan el botón).

**Tabla de usuarios:** filtro por rol (incluye *"sin rol"*), y por fila: **rol**, **deshabilitar/habilitar**, **eliminar**.

**Protección (ayuda literal):** *"Debe existir al menos un administrador."* — el último ADMIN_MODELO activo no se puede deshabilitar ni eliminar.

**Avisos de la cabecera:** confirmaciones y errores de cada acción (aparecen arriba y desaparecen a los5 segundos).

---

## 4. Glosario breve de términos

| Término | Significado |
|---|---|
| **Gravedad** | Severidad relativa al segmento: CRÍTICA ≥2 escalas sobre el umbral, FUERTE ≥1, MODERADA el resto; **ANTIGUA** = caída que lleva meses (en vistas de negocio "Grave" queda solo para recientes). |
| **Tendencia / trayectoria** | Lo que el modelo prevé del mes que viene — textos literales: *CAIDA_ACELERANDO:* "El modelo prevé que el mes que viene siga bajando. Máxima urgencia." · *SIN_RECUPERACION_PREVISTA:* "El modelo no prevé cambio mayor a su propio error: se queda en el nivel caído." · *RECUPERACION_PREVISTA:* "El modelo prevé que vuelva. Vigilar, no despachar." · *NO_EVALUABLE_RURAL:* "Rural excluido de trayectoria por sesgo del pronóstico en el borde." · *SIN_PRONOSTICO:* "El cliente no tiene fila en el pronóstico (historia insuficiente)." |
| **Nivel de riesgo de fuga** | Literales: *ALTO:* "Está en el1 % de clientes con mayor puntaje del modelo (y por encima del riesgo promedio). Contactar primero." · *MEDIO:* "Está entre el1 % y el5 % con mayor puntaje del modelo. Vigilar y contactar según valor." · *BAJO:* "Sin señales por encima de la población." |
| **Probabilidad de fuga (6 meses)** | Calibrada con validación; con tope en la probabilidad máxima comprobada. |
| **Pérdida esperada** | Probabilidad × lo que factura hoy: orden de magnitud para priorizar. |
| **Prioridad / situación** | GESTIONAR (ahora), SEGUIMIENTO, VIGILAR (estacional); estado: NUEVO / PERSISTENTE / REINCIDENTE. |
| **Tipo de caída / veredicto** | Clasificación del estudio (caída confirmada, sostenida/antigua, sin caída, según ventana…). |
| **Grupo de consumo (tamaño)** | Grande / Mediano / Pequeño / Intermitente / Sin historia suficiente (perfíl P0–P4 del pronóstico). |
| **Segmento (cluster)** | Agrupación por comportamiento con descripción y acción sugerida. |
| **Zona regional vs zona del ciclo** | Zona regional = dirección regional (urbano+rural+seccionales); zona del ciclo = solo ciclo urbano/rural. |
| **Ciclo y Orden** | Ciclo de lectura (ruta); "Orden1" = mayor facturación en riesgo del ciclo. |
| **Confiabilidad (proyección)** | CONFIABLE (error ≤5 % a1 año) · ORIENTATIVO (>5 %) · NO VERIFICABLE (historia insuficiente). |
| **Cero sostenido** |3+ meses en cero o casi cero: no es caída; vive en *Clientes sin consumo*. |
| **Lectura REAL / ESTIMADA** | Literales: "REAL: lectura tomada del medidor. ESTIMADA: la empresa estimó el consumo. Una caída con lectura estimada puede no ser real." |
| **Medidor Consumo/Facturación** | Cambia la unidad de toda la app (energía ↔ pesos con tarifa real); los clientes no cambian. |
| **Modo presentación** | "En tablas y fichas se ocultan el NIU y la dirección. Las descargas no cambian." |

---

## 5. Anexo: textos de la regla "Qué revisar / qué decirle"

La columna **Qué revisar** (y la sugerencia de la ficha) arma su frase combinando estos literales:

- **Estacional (VIGILAR):** "Cliente estacional: ya estuvo en cero en temporadas anteriores y volvió, y el modelo prevé que vuelva a consumir. No requiere visita; confirmar con el cliente cuándo reanuda actividad."
- **Antigua + acelera:** "La caída lleva meses y el modelo prevé que siga bajando: no es urgente, pero conviene revisarlo primero dentro del seguimiento y confirmar qué cambió."
- **Acelera:** "El consumo viene bajando y el modelo prevé que siga bajando: conviene contactar pronto."
- **Antigua + sin recuperación:** "La caída no es de ahora: bajó hace meses frente al año pasado y se quedó en ese nivel. No es urgente; en el próximo contacto, confirmar qué cambió (actividad, equipos, ocupación del predio)."
- **Sin recuperación:** "El consumo bajó y se mantiene en ese nivel: preguntar si cambió la actividad, el horario o los equipos."
- **Recuperación prevista:** "El consumo bajó pero el modelo espera que vuelva: vigilar; no hace falta visita todavía."
- Si es **CRÍTICA:** "La caída es grave frente a clientes parecidos: revisar medidor, lectura y posibles fallas antes de dar por buena la cifra."
- Si es **industrial/comercial:** "Cliente de negocio: una caída así suele ser cambio de actividad, cierre parcial, autogeneración o paso a otro comercializador."
- Si es **oficial:** "Entidad oficial: verificar si hubo cierre temporal, traslado o cambio de sede."
- **Por defecto:** "Revisar la lectura y el consumo reciente con el cliente."

---

*Manual completo generado a partir del código fuente de la aplicación. Los textos entre comillas son literales de la interfaz; si la interfaz cambia, este documento debe actualizarse en consecuencia. Versión concisa: `docs/manual-usuario.md`.*





