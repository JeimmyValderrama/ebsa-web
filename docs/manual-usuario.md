# Manual de usuario — EBSA Web

Aplicación web para consultar los resultados del análisis de consumo eléctrico de EBSA (proyecto académico UPTC, no oficial de EBSA). Este manual describe cada pestaña y subpestaña del sistema: para qué sirve, qué controles tiene y qué información muestra cada indicador, tabla y gráfica.

---

## 0. Introducción y elementos globales

### Qué hace el sistema
Lee los archivos TC2 de la empresa y ofrece tres capacidades principales (ver *Qué es esto* al pie del Panorama):
1. **Detecta clientes cuyo consumo cayó** más de lo normal para clientes parecidos y los ordena por la facturación que se está perdiendo.
2. **Estima la probabilidad de fuga** de cada cliente a otro comercializador en los próximos seis meses.
3. **Pronostica el consumo** de cada cliente a seis meses.

El valor en pesos siempre usa la **tarifa real** del cliente, nunca una tarifa supuesta.

### Inicio de sesión
- Pantalla de acceso con **correo y contraseña** (gestionados con Firebase Authentication).
- Tras entrar, la sesión muestra el correo, el botón **Cerrar sesión** y el indicador **API conectada** (la API valida el rol antes de cada operación).

### Roles y qué ve cada usuario

| Rol | Secciones visibles |
|---|---|
| **COMERCIAL** | Comercial |
| **SOPORTE** | Comercial y Soporte |
| **ADMIN_MODELO** (administrador) | Comercial, Soporte y Administrador |

### Elementos globales (aparecen en las partes superiores)

- **Corte activo** (píldora "Corte …" arriba a la derecha): identifica el mes de datos que se está consultando; lo fija el pipeline, no el usuario.
- **Sesión:** permanece abierta aunque apagues el equipo o cierres el navegador (se guarda en el navegador, no en el servidor); se cierra con el botón **Cerrar sesión** o automáticamente después de **1 hora 30 minutos de inactividad**.
- **Medidor Consumo / Facturación**: conmutador que cambia **la unidad de medida de TODA la página** (kWh/MWh/GWh por mes ↔ pesos por mes con la tarifa real). Los clientes y las listas son los mismos; solo cambia la métrica mostrada y el orden de algunas columnas de medida.
- **Modo presentación "Ocultar NIU y direcciones"** (caja lateral izquierda): enmascara los NIU y las direcciones en tablas y fichas para proyectar o compartir pantalla. **Las descargas no cambian** (los CSV se descargan completos).
- **Menú lateral**: las secciones están agrupadas (Resumen / Listas / Planeación, etc.); la navegación también funciona con el teclado y el historial del navegador.
- **Tabla con ficha**: en las tablas que la soportan, al elegir una fila se despliega debajo la **ficha completa del cliente** (mismo comportamiento en todas las listas).

---

## 1. Comercial

### 1.1 Resumen → Panorama comercial
**Para qué sirve:** vista de entrada del área comercial: cuántos clientes tienen caída, cuánto se pierde al mes, dónde está pasando y cómo se reparte lo que hay que hacer.

**Controles:**
- **Medidor Consumo/Facturación** con su leyenda (qué significa cada unidad).
- Selector de **horizonte** de la proyección (se controla desde la sección *Proyección de consumo*).

**Qué muestra:**
- **Tarjeta principal (hero):** total de clientes que consumen menos de lo normal para clientes parecidos, con la cifra consolidada (kWh o $/mes) y una **banda de prioridades**: *Gestionar ahora* (caídas recientes), *Seguimiento* (caídas que llevan meses, reales pero no urgentes) y *Vigilar* (temporada y recuperación prevista).
- **Fila de indicadores 1:** *Caídas graves recientes* (revisar primero medidor y lectura), *Nuevos en la lista este mes* (con nota de cuántos vienen del corte anterior), *Probabilidad de fuga alta o media* (a quién contactar primero; no es predicción de que se vayan), y según el medidor *Consumo de esos clientes* o *Pérdida esperada (fuga)*.
- **Fila de indicadores 2:** *Clientes sin consumo* (3+ meses en cero), *Ya atendidos por otro comercializador*, *Grandes clientes en vigilancia (no regulados)*.
- **Mapa "Dónde está pasando":** municipios de Boyacá con sus límites oficiales, con la tarjeta lateral **Los diez municipios con más**, el **Resumen por zona** y el desplegable **Ver la tabla por municipio**.
- **Caídas de consumo por zona regional:** barras apiladas por gravedad (Grave/Fuerte/Moderada/Antigua) + tabla *Zona regional · Clientes con caída · Facturación que se pierde · Consumo que se pierde* (ordenable desde los encabezados).
- **Consumo/Facturación en riesgo por clase de servicio** y **por tamaño del cliente:** barras de mayor a menor.
- **Consumo de energía de todos los clientes:** tarjetas por año (real / proyectado / real+proyección) y gráfica de serie mensual real + proyección con **banda del 80 %**.
- **Expander "Qué cambió frente al mes anterior":** clientes que entraron, salieron o siguen en la lista de caída respecto del corte anterior.
- **"Qué es esto y cómo leer las cifras"** al pie: reglas de la lista (sin autogeneradores ni área común/autoconsumos/distritos de riego/provisionales) y nota de cero sostenido.

### 1.2 Listas → Caídas de consumo
**Para qué sirve:** la lista de trabajo de campo: los clientes con caída, ordenados por lo que se pierde, con filtros para armar la ruta de la cuadrilla.

**Controles:**
- Filtros múltiples: **Prioridad** (por defecto *GESTIONAR*), **Tipo de caída**, **Gravedad**, **Tendencia**, **Zona regional**, **Municipio** (se acota a la zona elegida), **Clase**, **Tamaño**.
- Deslizador **N** de filas a mostrar (25–2000; la consulta espera300 ms tras dejar de moverse).
- Botón **Descargar esta lista (CSV)** (nombre `caidas_consumo_<corte>.csv`).

**Indicadores:** *Clientes (con los filtros)* · *Consumo/Facturación que se pierde* con su equivalente en la otra unidad · *Los N primeros concentran X %* (concentración de la pérdida en el top de la lista).

**Tabla (columnas):** Puesto · NIU · Municipio · Zona regional · Ciclo · Clase · Tamaño · Tipo de caída · Consumía (kWh/mes) · Consume ahora (kWh/mes) · Caída (%) · Consumo que se pierde (kWh/mes) · Facturación que se pierde ($/mes) · Tarifa ($/kWh) · Gravedad · Tendencia · Prioridad · Situación.

**Al elegir una fila** se abre debajo la ficha del cliente.

**Expansores y avisos:** *Cuántos clientes hay por gravedad en cada zona regional (toda la lista)* (barras apiladas), aviso de clientes en cero sostenido y la tarjeta de ayuda *Cómo leer esta lista*.

### 1.3 Listas → Clientes sin consumo
**Para qué sirve:** clientes con **3 meses o más en cero o casi cero** (no se cuentan como caída porque ya no consumen): sirven para confirmar si están retirados, suspendidos o con el predio desocupado.

**Controles:** filtros **Zona regional · Municipio · Situación · Tiempo sin consumo (tramo) · Tamaño**.

**Indicadores:** *Clientes sin consumo* · *En cero* · *Casi cero*.

**Tabla (columnas):** NIU · Municipio · Zona regional · Clase · Tamaño · Situación · Consumía antes (kWh/mes) · Consume ahora (kWh/mes) · Facturaba antes ($/mes) · Tarifa ($/kWh) · Último mes con consumo · Meses sin consumo · **Qué hacer (sugerido)** (sugerencia de gestión en lenguaje simple).

**Resumen por tramo:** *Tiempo sin consumo · Qué hacer (sugerido) · Clientes · Consumían antes · Facturaban antes* (el orden de las medidas sigue al medidor).

### 1.4 Listas → Probabilidad de fuga
**Para qué sirve:** priorizar contactos comerciales entre clientes con **señales de fuga** (probabilidad de irse a otro comercializador a6 meses). Es una lista de clientes grandes con señales, **no una predicción de quién se va**; la pérdida esperada es un orden de magnitud.

**Controles:**
- Filtros: **Nivel de riesgo** (por defecto ALTO y MEDIO), **Zona regional**, **Grupo de consumo**, **Clase de servicio**, **Municipio**.
- Deslizador de cuántos mostrar; botón de descarga CSV.

**Indicadores:** *Clientes* · *Consumen/Facturan (promedio6 meses)* · *Consumo esperado en riesgo / Pérdida esperada* (según medidor) — con el aviso de límite del modelo (con ~80 clientes que se fueron, no ordena mejor que por tamaño; en validación,4 de los100 primeros se fueron).

**Tabla principal (columnas):** Prioridad · NIU · Municipio · Zona regional · Ciclo · Clase · Tamaño · Consumo promedio6 meses (kWh/mes) · Factura promedio6 meses ($/mes) · Probabilidad de fuga (6 meses) · Riesgo · Consumo esperado en riesgo · Pérdida esperada ($/mes) · Señales observadas · Situación.

**Pie:** tabla **Mercado no regulado** con los grandes clientes en vigilancia aparte.

**Expansores:** *Cómo leer* (el modelo busca clientes parecidos a los que se fueron: caída reciente, meses en cero, zona con más salidas, tamaño; ALTO =1 % mayor puntaje, MEDIO hasta el5 %; probabilidad calibrada y con tope) y *Qué significa cada nivel*.

### 1.5 Listas → Clientes que ya se fueron
**Para qué sirve:** saber **a quién ya no vale la pena buscar**: clientes con estado "con otro comercializador", cuánto consumían y cómo eran, para reconocer a los que se parecen. Por política de la empresa **no se muestra qué comercializador los atiende hoy**.

**Controles:** filtros **Estado** y **Municipio**; medidor (la columna de medida va antes).

**Tabla (columnas):** NIU · Estado · Municipio · Zona · Clase · Desde · Mes de salida estimado · Consumía antes (kWh/mes) · Facturaba antes ($/mes).

**Expansores:** *Cómo son los que se fueron (clase, zona, tamaño, municipio)* con tabla **valor · n · pct**. Los clientes en cero siguen en *Clientes sin consumo*, no aquí.

### 1.6 Planeación → Proyección de consumo
**Para qué sirve:** la proyección de consumo **por zona para la compra de energía**, con horizonte configurable y verificación del modelo (backtest).

**Controles:**
- **Horizonte** (segmentado: de1 a6… meses o *Todo lo calculado*; por defecto12 meses = horizonte verificado).
- Selectores de **zona regional** y **escenario**.

**Indicadores:** *Error del backtest a1 año* · *Error del backtest a2 años* · *Margen de error medido a1/a2 años* (WAPE %).

**Tablas:**
- **Anual (columnas):** Año · Meses reales · Meses proyectados · Consumo real (GWh) · Proyección (GWh) · Total del año (GWh) · Banda80 % · Banda95 % · **Confiabilidad** (CONFIABLE ≤5 % de error a1 año / ORIENTATIVO >5 % / NO VERIFICABLE sin historia) · Error del backtest.
- **Resumen de todas las zonas por año** (expander).
- **Tabla técnica** por zona: modelo elegido, error y línea base de1 y2 años, sesgo.

**Gráfica:** serie proyectada por zona con bandas de incertidumbre80 %/95 %.

### 1.7 Planeación → Descargas
**Para qué sirve:** bajar los **archivos CSV de exportes** que genera el pipeline (listas de caída, pronóstico a6 meses y riesgo de fuga, por grupo de consumo).

**Tabla (columnas):** Grupo de consumo · Clientes · Corte · Archivo · Tamaño (MB) · **Estado** (`disponible` / `no encontrado`).

**Uso:** el botón **Descargar** aparece solo en filas `disponible`; el archivo se baja **directamente desde el almacenamiento** (sin pasar por el servidor). Si ningún archivo está disponible se muestra el aviso correspondiente.

---

## 2. Soporte

### 2.1 Clientes → Consultar un cliente
**Para qué sirve:** abrir la **ficha completa de un cliente escribiendo su NIU** (o buscándolo por municipio/situación).

**Controles:**
- Campo **NIU** (sin puntos ni espacios; se comprueba contra los datos del corte y si no existe avisa).
- Expander **¿No tienes el NIU? Buscar por municipio o situación** con filtros **Municipio · Gravedad · Tendencia** y tabla (NIU · Municipio · Clase · Gravedad · Tendencia · Facturación que se pierde ($/mes)), con leyenda "N clientes de la lista de caída cumplen el filtro (se muestran hasta50)". **Al elegir una fila se abre la ficha debajo.**

**Qué muestra la ficha del cliente** (igual que al elegir fila en las tablas):
1. **Quién es y dónde está:** Municipio · Zona · Dirección · Nivel de tensión (TC1, solo referencia) + clase de servicio, estrato/sector, tamaño y segmento con su descripción.
2. **Situación hoy:** avisos (autogenerador, con otro comercializador, mercado no regulado, meses en cero) y la **caída** con sus tres KPIs (Caída de consumo %, Gravedad, Tendencia), la frase de pérdida (referencia vs actual, con tarifa) y la **sugerencia "Qué revisar / qué decirle"**; después los KPIs de **fuga** (nivel, probabilidad a6 meses, factura promedio).
3. **Cómo ha venido consumiendo:** gráfica de los últimos18 meses (real azul, pronóstico naranja punteado, rombos grises = lectura parcial) con su tabla de datos.
4. **Pronóstico a6 meses:** barras + tabla mes/pronóstico kWh/modelo, con grupo de consumo, zona, corte y modelo entrenado; si no tiene pronóstico explica el motivo.

### 2.2 Clientes → Caídas de consumo
**Misma sección** que *Comercial → Listas → Caídas de consumo* (la lista de caída con sus filtros, KPIs, tabla, ficha y expansores). Ver §1.2.

### 2.3 Trabajo de campo → Visitas por ciclo
**Para qué sirve:** armar la ruta de visitas de las cuadrillas por **ciclo de lectura**.

**Controles:**
- **Zona regional** y **Ciclo** (la ruta); **"Orden1" es el cliente del ciclo con más facturación en riesgo: por ahí empieza la cuadrilla**.
- Filtros: **Municipio · Gravedad · Tendencia · Situación (Nuevo/Persistente/Reincidente) · Tipo de lectura**.
- Botón **Descargar la ruta del ciclo XX (CSV)**.

**Indicadores:** *Clientes para visitar* · *Facturación que se pierde* · *Caídas graves* (CRÍTICA).

**Aviso de calidad:** si algunos clientes tienen **lectura estimada** (la empresa estimó el consumo), se avisa que su caída puede no ser real y conviene confirmar la lectura antes de programar la visita (filtro *Tipo de lectura*).

**Tabla:** clientes del ciclo con sus datos de gestión y la columna **Qué revisar** (sugerencia para la visita); **al elegir una fila se abre la ficha del cliente debajo**.

**Expansores:** *Ver estos clientes en el mapa* y *Cómo usar esta lista*.

### 2.4 Trabajo de campo → Resultado de visitas
**Para qué sirve:** los **resultados de las visitas de campo contra la lista**: cuántos se visitaron, con qué precisión acertó la lista y cómo se comportan los grupos.

**Indicadores (KPIs):** *Clientes visitados* · *Con un problema que la empresa puede corregir* (% de verificados: medidor dañado/manipulado, error de lectura o facturación, falla de red, conexión irregular) · *Caída real, sin nada que corregir* (predio desocupado, cambio de actividad, autogeneración, cliente retirado) · *Sin novedad (falsa alarma)*; más la línea de **facturación asociada a los casos con problema corregible**.

**Tablas por corte** (cada una con su encabezado): **Por severidad · Por trayectoria · Por estado en lista · Por tramo de consumo · Por zona · Por cluster**: visitados, verificados, causas gestionables, caída real sin gestión, sin novedad y las precisiones (`precision_gestionable`, `precision_caida_real`).

**Avisos:** si no hay resultados reales aún, la página lo indica y muestra un **ejemplo ilustrativo** (datos simulados, claramente rotulado).

---

## 3. Administrador

### 3.1 Resumen → Resumen del periodo facturado
**Para qué sirve:** el panorama del administrador sobre el periodo: totales de la lista, ciclo, fuga y severidad.

**Indicadores:** *Clientes en la lista* · *kWh/mes en riesgo* · *Valor en riesgo / mes* · *Ciclos con clientes*; bloque de fuga: *Clientes puntuados · Riesgo ALTO · Riesgo MEDIO · Pérdida esperada / mes (ALTO+MEDIO)*; dato de *Corte · modelo*.

**Tablas:**
- **Por ciclo (columnas):** ciclo_etiqueta (ciclo) · zona_nombre (zona del ciclo) · n_clientes · kwh_riesgo_mes · n_criticos · n_rural · valor_riesgo_mes · pct_del_total · acumulado_pct.
- **Por severidad** (tarjeta plegable): severidad relativa al segmento — CRÍTICA ≥2 escalas sobre el umbral, FUERTE ≥1, MODERADA el resto.

**Expansores:** *Qué significa cada trayectoria* (acelera = máxima urgencia; sin recuperación prevista = se queda en el nivel; recuperación prevista = vigilar; sin pronóstico = historia insuficiente).

### 3.2 Listas y gestión → Gestión por ciclo
**Para qué sirve:** trabajar **un ciclo de lectura** con su lista completa de gestión.

**Controles:**
- Selector **Ciclo** (se abre en el primero disponible).
- Filtros: **Severidad · Trayectoria · Estado en lista · Grupo de consumo · Tipo de lectura · Municipio**.

**Indicadores:** *Clientes* · *kWh/mes* · *Valor/mes* (de lo filtrado).

**Tabla (columnas):** orden en el ciclo · ciclo · NIU · municipio · zona regional · zona del ciclo · clase · estrato · grupo de consumo · segmento (cluster) · severidad · trayectoria · prioridad · estado en lista · meses consecutivos en lista · consumo anterior · consumo reciente · pérdida (kWh) · tarifa · valor en riesgo · pronóstico mes+1 · consumo promedio semestral · valor facturado · tipo de medidor · tipo de lectura. **Al elegir una fila se abre la ficha del cliente.**

**Expansores:** *Clientes por severidad (general o por zona regional)*.

### 3.3 Listas y gestión → Ranking gerencial
**Para qué sirve:** el **ranking de clientes por la medida elegida** (consumo o facturación en riesgo), con exclusiones de regla de negocio (sin autogeneradores ni clases área común, autoconsumos EBSA, distritos de riego y provisionales).

**Controles:** filtros **Zona regional · Grupo de consumo · Clase de servicio · Municipio** + deslizador **Mostrar top** (25–1000, por defecto100).

**Indicadores:** *Parte del total filtrado* (cuánto representa el top mostrado).

**Tabla (columnas):** puesto · NIU · municipio · zona regional · zona del ciclo · clase · grupo de consumo · gravedad · trayectoria · estado en lista · consumo anterior · consumo reciente · pérdida (kWh) · tarifa · valor en riesgo · referencia · caída %. **Ficha al elegir fila.**

### 3.4 Listas y gestión → Riesgo de fuga
**Para qué sirve:** la versión de administración de la fuga, con **seis pestañas**.

**KPIs globales:** *Clientes puntuados · Riesgo ALTO · Riesgo MEDIO · Pérdida esperada / mes · Corte · modelo*.

**Controles (pestaña Lista):** filtros **Nivel de riesgo (defecto ALTO+MEDIO) · Zona regional · Grupo de consumo · Clase · Municipio** y radio **Ordenar por**: *Pérdida esperada (probabilidad × valor)* o *Probabilidad de salida*.

**Pestañas:**
1. **Lista** — columnas: ranking · NIU · nivel de riesgo · probabilidad (6m) · pérdida esperada · valor en riesgo · municipio · zona regional · zona · clase · grupo · estrato · consumo actual · consumo prom6m/12m · variación3m vs12m · meses en cero (3m) · señales · estado en lista · meses consecutivos · tarifa · consumo semestral · medidor · lectura.
2. **Por zona y grupo** — resúmenes: ciclo/zona con puntuados, alto, medio y pérdida esperada; y por grupo de consumo con probabilidad media.
3. **Ya con otro comercializador** — NIU · estado · municipio · primer/último mes con otro · mes de salida · fuente de salida · zona · clase · estrato · consumo antes/después · tarifa · valor facturado antes · nivel de tensión; con expander *Perfil de los que se fueron*.
4. **Vigilancia no regulados** — clientes de mercado no regulado (motivo, riesgo, señales…) con KPIs *En vigilancia · ALTO · MEDIO · Facturación/mes*.
5. **Calidad del modelo** — métricas por conjunto: AUC, precisión/recall/lift en top50/100/200/500.
6. **Seguimiento** — por corte de lista: clientes señalados, salieron en la ventana, % y si la ventana ya es observable.

**Expansores:** *Qué significa cada nivel* (ALTO =1 % mayor puntaje; MEDIO1–5 %; BAJO sin señales).

### 3.5 Listas y gestión → Cortes
**Para qué sirve:** ver **dónde se concentra la facturación en riesgo por cada forma de agrupar a los clientes** (una tarjeta por dimensión: zona, clase, tamaño, ciclo…).

**Tabla por agrupación (columnas):** valor_corte (grupo) · n_clientes · kwh_riesgo_mes · n_criticos · valor_riesgo_mes — **valor en riesgo por mes, de mayor a menor**.

### 3.6 Listas y gestión → Mapa
**Para qué sirve:** el mapa **técnico** de Boyacá (versión ampliada para administración): clientes, caídas y riesgo de fuga sobre los límites oficiales de los municipios, con la medida elegida (consumo o facturación) y sus métricas; incluye las tablas por zona y por municipio y la descarga del mapa en CSV.

### 3.7 Listas y gestión → Buscar cliente
**Para qué sirve:** la búsqueda de NIU de *Consultar un cliente* desde el área del administrador: escribir el NIU y abrir la ficha completa, o expandir la búsqueda por municipio/situación. Ver §2.1 (mismos controles y ficha).

### 3.8 Modelos → Pronóstico 6 meses
**Para qué sirve:** estado y calidad del modelo de pronóstico a seis meses.

**Indicadores:** *Clientes pronosticados* · *Corte de datos* · *Modelo entrenado con corte* · *Modo de la última corrida* (reentrenar/aplicar).

**Tablas:**
- **WAPE por horizonte** (filas = grupo de consumo; columnas = meses adelante1…6): error porcentual ponderado del backtest por grupo.
- **Comparación con pronósticos ingenuos:** Meses adelante · Error del modelo (%) · Repetir el último mes (%) · Promedio de3 meses (%) · Mismo mes del año anterior (%) · Mejor pronóstico simple · Ventaja del modelo (puntos).

**Expansores:** *Qué algoritmo usa cada grupo* y *Versiones de los modelos* (`12_versiones_modelos`).

### 3.9 Modelos → Proyección de consumo
**Mismo componente** que *Comercial → Planeación → Proyección de consumo* (horizonte, backtest, confiabilidad, bandas y resumen por zonas). Ver §1.6.

### 3.10 Modelos → Seguimiento
**Para qué sirve:** comparar **lo pronosticado contra lo que pasó**, corte a corte.

**Tablas:**
- **Índice:** fecha_corte · fecha_corte_modelo · meses desde entrenamiento; **columnas1…6** = error (o diferencia) a cada mes adelante del pronóstico hecho en ese corte.
- **Expansores:** *Por perfil (con diferencia contra el backtest)* y *Por zona*.

### 3.11 Modelos → Retroalimentación
**Mismo panel** que *Soporte → Resultado de visitas* (KPIs de precisión y tablas por severidad/trayectoria/estado/tramo/zona/cluster). Ver §2.4.

### 3.12 Operación → Descargas por grupo
**Mismo componente** que *Comercial → Planeación → Descargas* (tabla con Estado y botón de descarga por archivo), habilitado para el administrador. Ver §1.7.

### 3.13 Operación → Estado del pipeline
**Para qué sirve:** vigilar la salud de la última corrida del pipeline.

**Indicadores:** *Mes evaluado* · *Chequeos correctos (X de N)* · *Chequeos con aviso* · *Chequeos con error*.

**Tablas:**
- **Control de calidad del último mes (columnas):** chequeo · resultado · nivel · valor_mes · referencia · detalle · mes_evaluado.
- **Sesgo del pronóstico (columnas):** zona · n · mediana · p25 · p75.
- **Expansores:** últimas corridas del pipeline.

### 3.14 Sistema → Usuarios y roles
**Para qué sirve:** administrar los accesos de la aplicación (Firebase Authentication).

**Controles y acciones:**
- **Formulario de alta:** correo (validado), contraseña (mínimo6) y rol (COMERCIAL / SOPORTE / ADMIN_MODELO); el botón queda deshabilitado mientras haya errores.
- **Filtro por rol** (incluye "sin rol").
- Por fila: cambiar **rol**, **deshabilitar/habilitar** y **eliminar** usuarios.
- **Protección:** no se puede dejar el sistema sin administrador (el último ADMIN_MODELO activo no se puede deshabilitar ni eliminar).

---

## 4. Glosario breve de términos

| Término | Significado |
|---|---|
| **Gravedad** | Qué tan fuera de lo normal está la caída para su segmento: CRÍTICA ≥2 escalas sobre el umbral, FUERTE ≥1, MODERADA el resto; **ANTIGUA** = caída que ya lleva meses (no se presenta como urgente). |
| **Tendencia / trayectoria** | Lo que el modelo prevé del mes que viene: *CAIDA_ACELERANDO* (sigue bajando, máxima urgencia), *SIN_RECUPERACION_PREVISTA* (se queda en el nivel), *RECUPERACION_PREVISTA* (vuelve; vigilar), rural sin evaluar o sin pronóstico. |
| **Tipo de caída / veredicto** | Clasificación del caso: caída confirmada, sin caída, según ventana del estudio (p. ej. caída sostenida). |
| **Prioridad** | Acción sugerida agrupada: GESTIONAR (ahora), SEGUIMIENTO, VIGILAR (estacional/recuperación prevista). |
| **Situación en la lista** | NUEVO (entró este corte), PERSISTENTE (lleva N cortes seguidos), REINCIDENTE. |
| **Nivel de riesgo de fuga** | ALTO =1 % con mayor puntaje; MEDIO del1 % al5 %; BAJO sin señales por encima de la población. |
| **Probabilidad de fuga (6 meses)** | Probabilidad calibrada con validación de que el cliente se vaya; con tope en la máxima comprobada. |
| **Pérdida esperada** | Probabilidad × lo que factura hoy: orden de magnitud para priorizar. |
| **Grupo de consumo (tamaño)** | Grande / Mediano / Pequeño / Intermitente / Sin historia suficiente (perfíl P0–P4 del pronóstico). |
| **Segmento (cluster)** | Agrupación de clientes por comportamiento de consumo, con descripción y acción sugerida. |
| **Zona regional** | Dirección regional EBSA (ciclo urbano + rural + seccionales); la **zona del ciclo** es solo el ciclo urbano/rural. |
| **Ciclo** | Ciclo de lectura del cliente (la ruta de la cuadrilla); "Orden1" = mayor facturación en riesgo del ciclo. |
| **Confiabilidad de la proyección** | CONFIABLE (error backtest ≤5 % a1 año), ORIENTATIVO (>5 %) o NO VERIFICABLE (historia insuficiente). |
| **Medidor Consumo/Facturación** | Cambia la unidad de toda la aplicación (energía ↔ pesos con tarifa real); no cambia los clientes. |
| **Cero sostenido** |3+ meses en cero o casi cero: no es caída (ya no consumen); vive en *Clientes sin consumo*. |
| **Lectura estimada** | La empresa estimó el consumo del mes: la caída de esos clientes puede no ser real (avisado en Visitas por ciclo). |
| **SAS (enlaces de descarga)** | Firma temporal de lectura para bajar los archivos directamente del almacenamiento. |

---

*Manual generado a partir del código fuente de la aplicación (diciembre de la entrega2026). Si la interfaz cambia, este documento debe actualizarse en consecuencia.*



