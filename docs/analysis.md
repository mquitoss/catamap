# Hipótesis de la tesis y diseño del mapa

El mapa permitirá explorar cómo la oferta y la promoción alimentarias alrededor
de las escuelas se relacionan con el contexto socioeconómico y el peso escolar.
La tesis utiliza dos muestras complementarias: 153 tiendas para medir
disponibilidad y asequibilidad mediante NEMS-S-MED/IDAS, y 306 establecimientos
de alimentación y restauración para medir promoción mediante PEADC.

La fuente es la tesis de Catalina Londoño Cañola, *Influencias del entorno
alimentario de los centros educativos sobre el peso de los escolares*, UPF, 2023,
disponible en `docs/datasets-raw/Tesis_Doctoral_Catalina_Londoño_Cañola.pdf`.
Las cinco hipótesis aparecen en la página impresa 47, página 71 del PDF; los
objetivos correspondientes están en las páginas impresas 49–50. La fe de
erratas está en las páginas impresas 188–192.

## Las cinco hipótesis

Las formulaciones siguientes sintetizan las hipótesis del capítulo 3. Son
preguntas de investigación; no deben presentarse como resultados confirmados.

| Hipótesis | Relación planteada | Qué puede mostrar el mapa |
|---|---|---|
| H1 | Mayor densidad de establecimientos alrededor de escuelas en barrios más poblados y con menor nivel socioeconómico | Recuentos asignados por escuela, contexto de población y RFD, tipos de actividad y comparación entre escuelas |
| H2 | Mayor disponibilidad de opciones no saludables en entornos de baja densidad poblacional y menor nivel socioeconómico | Las 153 observaciones IDAS, puntuación y clasificación, superpuestas al contexto histórico de cada barrio |
| H3 | Obesidad escolar asociada con proximidad y disponibilidad de establecimientos con oferta no saludable, especialmente en barrios desfavorecidos | Prevalencia por escuela, número y porcentaje observado de tiendas clasificadas como no saludables y distancia caminable a la más cercana observada |
| H4 | Promoción de alimentos de alta densidad calórica más frecuente cerca de escuelas de barrios de menor nivel socioeconómico | Las 306 puntuaciones PEADC, sus componentes, porcentaje con promoción y comparación por contexto de escuela y comercio |
| H5 | Exposición a promoción alimentaria asociada con mayor obesidad escolar, con mayor asociación en barrios desfavorecidos | Comparación entre media PEADC del entorno y obesidad; modo adicional de exceso de peso con enlace reconstruido a la tabla 9 |

H1 cuenta establecimientos asignados a cada escuela en la base del estudio. No es
un inventario completo de todos los locales existentes actualmente en cada barrio.
El indicador por km² divide ese recuento por el área nominal de un círculo de
400 m; no equivale a recalcular todas las intersecciones espaciales.

Para H2 y H3, la proporción de tiendas clasificadas como no saludables utiliza
las observaciones con NEMS de la escuela, no todos sus establecimientos. El
indicador de proximidad describe la tienda observada más cercana, no garantiza
identificar la más cercana entre todos los locales del universo.

H4 debe permitir que los datos contradigan la hipótesis. La tesis encuentra un
PEADC más alto en entornos de NSE medio y alto en el modelo ajustado: tabla 11,
página impresa 99. No debe imponerse a priori una escala que asocie menor renta
con mayor promoción.

## Qué aporta cada proyecto de muestra

| Aspecto | Invest Map | Quirat Barcelona | Decisión para Catamap |
|---|---|---|---|
| Aplicación | HTML, CSS y JavaScript nativos | HTML, CSS y JavaScript nativos | Mantener aplicación estática |
| Motor cartográfico | Leaflet 1.9.4 | Leaflet 1.9.4 | Mantener Leaflet |
| Fondo | CARTO Dark Matter | CARTO Dark Matter | Dark Matter con clave; OSM oscuro como fondo predeterminado |
| Geografías | 73 barrios | Barrios y secciones censales | Escuelas, comercios, círculos y barrios |
| Datos locales | `window.REDIT` desde `bundle.js` | `window.QUIRAT` desde `bundle.js` | `window.CATAMAP` desde `data/clean/bundle.js` |
| Preparación | Python y uv | Python y uv; Shapely para geometrías | Python y uv; lectura de Stata/Excel y proyección UTM |
| Pruebas | pytest y Vitest | pytest y Vitest | pytest para datos; Vitest para interfaz y empaquetado |

La estética de los ejemplos utiliza un panel lateral, fondo oscuro, Space
Grotesk, Inter e IBM Plex Mono, controles nativos y leyendas dinámicas. Se puede
mantener ese diseño con una paleta propia para los indicadores de la tesis.

El mapa debe mostrar datos históricos. No se reutilizan los indicadores de
renta de 2022 ni las cifras inmobiliarias o demográficas de los mapas de muestra.
La RFD de la tesis es un índice relativo con Barcelona=100, no una renta en euros.

## Capas y controles propuestos

1. **Escuelas:** 22 puntos de tamaño fijo, coloreados por obesidad o exceso de
   peso. La ficha muestra titularidad, barrio, RFD, número de comercios del
   estudio, cobertura de cada muestra y medias IDAS/PEADC.
2. **Entorno de 400 m:** círculos reconstruidos que se activan al seleccionar una
   escuela. La asignación original y las distancias del estudio se conservan
   aunque un comercio quede fuera de ese círculo reconstruido.
3. **Oferta alimentaria:** puntos clasificados por actividad, con puntuación
   IDAS y clasificación únicamente donde existen las 153 observaciones.
4. **Promoción alimentaria:** 306 puntos con escala PEADC de 0 a 40 y filtros
   para exposición exterior, interior y mobiliario. Una puntuación cero es una
   observación válida y tiene una representación distinta de «sin dato».
5. **Contexto por barrio:** coropletas de índice RFD o densidad de población,
   con datos históricos en 40 barrios y ausencia explícita en los otros 33.
6. **Comparación de escuelas:** ordenación y gráfico de media PEADC frente a
   obesidad o exceso de peso. Cada escuela cuenta una vez; no se trata a los
   3.644 establecimientos como 3.644 observaciones independientes de peso.

Los filtros deben incluir escuela, distrito, barrio, titularidad, actividad,
muestra observada, clasificación IDAS y puntuación/componentes PEADC. La ficha
de un establecimiento distingue barrio del comercio y barrio de la escuela.
La distancia caminable no debe filtrarse como si fuese un radio euclidiano.

Los porcentajes deben mostrar su denominador, por ejemplo «8 de 10 observados».
Cuando una escuela carezca de observaciones NEMS, la ficha mostrará «sin dato»;
no mostrará 0 % de tiendas no saludables.

## Resultados que se pueden reproducir

- Clasificación publicada: 146 de 153 tiendas no saludables, 95,4 %.
- Promoción: 230 de 306 establecimientos con PEADC positivo, 75,2 %.
- Sin promoción según PEADC: 76 observaciones con puntuación cero.
- Medias PEADC de las 22 escuelas: coinciden con la tabla 9 con diferencia
  inferior a 0,02 puntos por redondeo o truncamiento del texto publicado.
- Los componentes de disponibilidad y precio suman el NEMS total de las 153
  observaciones clasificadas.

«No saludable» es la clasificación de un índice sobre la oferta de una cesta de
alimentos. No describe la seguridad alimentaria de un local ni significa que
todos los productos que vende sean no saludables. En la interfaz conviene usar
«clasificación según IDAS» y explicar la puntuación en la ficha.

## Recuperación del exceso de peso

La base Stata solo contiene `Obesitat`. La tabla 9, página impresa 94 y página
118 del PDF, contiene porcentajes de exceso de peso, pero identifica sus filas
por distrito y titularidad, sin nombres de escuelas.

Se transcriben sus 22 filas en `data/raw/thesis_table9.csv` y se enlazan a las
escuelas por **distrito y media PEADC**, admitiendo una diferencia inferior a
0,02 puntos. Cada fila tiene exactamente una candidata y cada escuela recibe
una sola fila. También se comprueba que exceso de peso sea mayor o igual que
obesidad. No se suman porcentajes inventados ni se estima sobrepeso.

Dos filas del distrito 7 presentan discrepancias de titularidad:

| Escuela enlazada | Tabla 9 | Base Stata y directorio oficial |
|---|---|---|
| Escola Mas Casanovas | Concertada | Pública |
| Centre Educatiu Sant Joan Bosco | Pública | Concertada en Stata; privada en el directorio |

La titularidad del mapa sigue la base Stata; la naturaleza pública o privada del
directorio oficial corrobora la discrepancia. Los valores de exceso de peso se
conservan con `excess_weight_link_reconstructed=true`, fuente, fila y bandera
de conflicto. Es recomendable que este modo muestre esa procedencia en la ficha
de escuela. Para una publicación científica debe confirmarse este enlace con
los datos originales de la autora.

## Límites del análisis

El estudio es transversal y selecciona 22 escuelas por conveniencia. PEADC no
estaba validado según las limitaciones de la tesis. Las prevalencias son
agregados escolares, sin registros individuales ni tamaños de cohorte que
permitan ponderar correctamente por alumnado. El mapa explora asociaciones y
distribuciones; no estima efectos causales.

Los círculos reconstruidos utilizan el directorio oficial de 2019–2020 y una
proyección métrica. Son una reconstrucción de presentación, no la capa QGIS
original. Hay 64 establecimientos fuera de esos círculos reconstruidos, con una
distancia máxima aproximada de 557 m. Por ello los recuentos y las muestras
siguen las asignaciones originales del estudio.

Persisten una discrepancia de umbral IDAS, diferencias entre versiones de las
bases y unidades de precios que necesitan revisión. El texto de la página
impresa 95 afirma que PEADC no varía significativamente por NSE, mientras la
tabla 10 da p=0,0230. La fe de erratas debe leerse junto a la versión depositada.
No se han reproducido los modelos de regresión ni se presentan como validados.


## Interfaz implementada

`../index.html` incorpora las vistas de promoción, oferta, escuelas y universo,
filtros de escuela/distrito/sector/resultado, contexto por barrios, fichas con
procedencia, círculos reconstruidos, descarga CSV y comparación descriptiva
PEADC–obesidad. Los indicadores de escuela conservan todos sus locales observados,
aunque se filtre una selección de puntos. No se añade una regresión causal.

El fondo predeterminado es OpenStreetMap con presentación oscura. CARTO Dark Matter
queda configurable porque [CARTO exige una clave de Basemaps](https://www.carto.com/basemaps/apikey/index.html)
a fecha de esta implementación. Se conserva Leaflet 1.9.4 y JavaScript nativo.
