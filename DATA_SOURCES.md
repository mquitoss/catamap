# Fuentes y decisiones de limpieza

Los indicadores de Catamap proceden de los archivos de la tesis. Los datos
externos aportan geometría y coordenadas; no sustituyen los indicadores
históricos por cifras actuales. La preparación es reproducible a partir de
los originales y de los snapshots conservados en `data/raw`.

## Fuentes de la tesis

| Fuente | Uso | Fecha o periodo |
|---|---|---|
| `docs/datasets-raw/Tesis_Doctoral_Catalina_Londoño_Cañola.pdf` | Hipótesis, metodología, instrumentos, tabla 9 y fe de erratas | Tesis UPF 2023; observaciones 2019–2020 |
| `docs/datasets-raw/bbdd_Alimentacion_BCN_Gemma_Catalina_131222.dta` | Fuente principal de mediciones, asignaciones, contexto y obesidad | Versión guardada el 13 de diciembre de 2022 |
| `docs/datasets-raw/bbdd_Alimentacion_BCN_040521_nems_censo.dta` | Comparación de versiones y auditoría de cambios | Versión guardada el 4 de mayo de 2021 |
| `docs/datasets-raw/establiments_muestreo_306.xlsx` | Coordenadas de 306 locales de la muestra histórica | Fechas censales de 2016–2020; coincide con la selección de 2021 |

Los hashes SHA-256 de los cuatro originales quedan registrados en
`data/clean/metadata.json`. El contexto demográfico se etiqueta como 2016 según
la metodología de la tesis; las bases no contienen un año de fuente por fila.
La fecha de versión de Stata no se utiliza como año de observación.

## Coordenadas del censo municipal de 2016

- Publicador: Ajuntament de Barcelona.
- [Ficha del catálogo público](https://datos.gob.es/es/catalogo/l01080193-censo-locales-en-planta-baja-destinados-a-actividad-economica-de-la-ciudad-de-barcelona).
- [Recurso oficial de 2016](https://opendata-ajuntament.barcelona.cat/data/dataset/fe177673-0f83-42e7-b35a-ddea901be8bc/resource/e6e7610c-f35a-430f-8527-de0945a1fd96/download).
- [Copia utilizada, fijada a un commit](https://raw.githubusercontent.com/Artagok/HotSpots/2e5809049f53fe53f386cecb56827976398705f1/API/fetcher/data/2016_cens_locals_plantabaixa.csv).
- Acceso: 11 de octubre de 2026.
- Licencia indicada por el catálogo: CC BY 4.0; atribución al Ajuntament de Barcelona.

El portal municipal agotó el tiempo de espera en las consultas y descargas.
Se recuperó una copia del CSV histórico conservada en GitHub. Su tamaño de
20.825.221 bytes coincide con el tamaño del recurso de 2016 en el catálogo.
Esto no constituye una verificación criptográfica contra el servidor oficial.
El hash de la descarga utilizada queda registrado en `data/raw/sources.json`.

El archivo completo contiene 78.033 locales. Se conservan únicamente las 3.639
filas cuyo `ID_BCN` pertenece al universo de la tesis, en
`data/raw/census_2016_thesis_subset.csv`. El enlace es por `id_bcn`, no por
nombre, dirección, posición de fila o identificadores internos de QGIS.

Las coordenadas de los 305 registros que coinciden con el Excel son
exactamente iguales. Se priorizan las coordenadas del Excel cuando están
disponibles, incluyendo el local adicional `1000001`. Los cuatro locales
adicionales `1000002`–`1000005` permanecen sin coordenadas. El censo externo no
añade establecimientos al estudio ni modifica su actividad o mediciones.

## Coordenadas oficiales de las escuelas

- Publicador: Generalitat de Catalunya.
- [Directorio histórico de centros docentes](https://analisi.transparenciacatalunya.cat/d/e2ef-eiqj).
- API utilizada: `https://analisi.transparenciacatalunya.cat/resource/e2ef-eiqj.json?$limit=50000`.
- Periodo seleccionado: **2019/2020**, municipio de Barcelona.
- [Condiciones de reutilización](https://administraciodigital.gencat.cat/ca/dades/dades-obertes/informacio-practica/llicencies/).
- Acceso: 11 de octubre de 2026.

La descarga recuperó 43.493 registros, por debajo del límite solicitado.
Se conserva un snapshot de los 22 centros seleccionados en
`data/raw/schools_directory_2019_2020.json`. La correspondencia entre el código
municipal `EG…` de la tesis y el código de centro de la Generalitat se verificó
por nombre y dirección y está en `data/raw/school_crosswalk.json`.

Se usan los campos explícitos `coordenades_geo_x` y `coordenades_geo_y` del
curso histórico, no los datos de cursos actuales. Los 22 puntos se encuentran
en el barrio de escuela indicado por la tesis, comprobado contra los polígonos
con una tolerancia de aproximadamente diez metros.

## Geometría de barrios

- Publicador original: Ajuntament de Barcelona / CartoBCN.
- [Distribución de bcn-geodata](https://raw.githubusercontent.com/martgnz/bcn-geodata/master/barris/barris.geojson).
- Snapshot reutilizado: `/Users/marc/Documents/Projects/quirat-barcelona/data/barris.geojson`.
- Fecha de descarga registrada por el proyecto de referencia: 25 de junio de 2026.
- Licencia registrada por el proyecto de referencia: CC BY, Ajuntament de Barcelona / CartoBCN.

Se copia la geometría y sus propiedades `NOM`, `BARRI` y `AREA`. No se copian
los indicadores de Quirat ni de Invest Map. El snapshot de origen queda en
`data/raw/barris.geojson`; su hash está en `data/raw/sources.json`.

El polígono del barrio 37 contiene una autointersección derivada del redondeo
de coordenadas. La capa limpia se repara con `shapely.make_valid`, manteniendo
las partes poligonales y verificando que el cambio relativo de área sea inferior
a 0,001 %. El original se conserva. El método y el cambio medido aparecen en
el informe de calidad.

Esta geometría sirve como fondo administrativo. No se afirma que sea la capa
exacta utilizada por la tesis ni que las secciones censales actuales equivalgan
a las de 2016.

## Reglas de preparación

1. **Versión principal:** mediciones y muestra de la base de 2022. La base de
   2021 sirve para auditar diferencias. Cambian seis campos comunes, incluida
   la selección de dos registros que intercambian su condición de visitado.
2. **Identificadores:** establecimiento por `id_bcn`, escuela por `id` municipal
   y barrio por código numérico. No se eliminan locales distintos por compartir
   nombre o dirección, especialmente puestos de mercado.
3. **Texto:** normalización Unicode, reparación reversible de texto mal
   decodificado y eliminación de espacios repetidos. Los vacíos se vuelven nulos.
4. **Muestras:** NEMS solo en las 153 observaciones con clasificación; PEADC
   solo en los 306 registros visitados en 2022. Se excluyen de los indicadores
   cinco puntuaciones NEMS sin clasificación y ocho campos derivados de
   promoción presentes fuera de la muestra, conservando su evidencia en auditoría.
5. **Clasificación NEMS:** se conserva la clasificación publicada y se añade
   la regla escrita ≤36. El registro `23282` queda marcado como conflicto.
6. **PEADC:** se utiliza `peadc_v2`, que reproduce los 76 ceros y 230 positivos.
   `peadc_v1` no se utiliza como indicador del mapa.
7. **Contexto:** el barrio del comercio y el de la escuela se mantienen
   separados. Los valores de escuela se buscan por su código de barrio.
8. **Unidades:** `Densitat` de 2022 se multiplica por 1.000 para expresar
   habitantes/km². Se comprueba contra población dividida por superficie.
9. **Precios:** se decodifican las etiquetas de Stata. Se conservan valor
   numérico de origen, valor decodificado y formatos. Las unidades variables y
   los posibles valores anómalos no se corrigen por suposición; los registros
   llevan `requires_unit_review=true` y no alimentan una comparación de precios.
10. **Geometría:** EPSG:4326 para Leaflet y orden longitud, latitud. Las
    distancias reconstruidas y los círculos se calculan en EPSG:25831. Las
    distancias caminables y la asignación original se conservan.
11. **Ausencias:** un dato no disponible permanece nulo; un cero observado
    permanece cero. Las proporciones sin observaciones son nulas.
12. **Agregación:** las medias PEADC principales incluyen ceros. Se ofrece
    también una media de positivos con nombre y denominador distintos. El
    porcentaje de tiendas no saludables usa la muestra NEMS de cada escuela.

## Tabla 9 y exceso de peso

`data/raw/thesis_table9.csv` transcribe las 22 filas de la página 118 del PDF
(página impresa 94). `thesis_table9_school_links.json` conserva fila original,
distrito, porcentaje, titularidad publicada y media PEADC, junto con el enlace
reconstruido por distrito y media PEADC. El enlace requiere una candidata única
y una diferencia menor a 0,02 puntos; si es ambiguo, la preparación falla.

La tabla no incluye nombres de escuelas. La asociación reconstruida no se
presenta como un identificador explícito de la fuente. Dos filas de Horta-
Guinardó discrepan en titularidad; se conserva la titularidad de Stata y la
bandera del conflicto. No se modifica el porcentaje publicado de exceso de peso.
El valor 0,01 % de la fila de Tres Pins se conserva tal como aparece en la tabla.

## Condiciones de uso de los datos de investigación

Los archivos de investigación no incluyen una licencia explícita de
redistribución. Prepararlos localmente no les asigna la licencia de los datos
cartográficos ni la del código. El artículo incluido en la tesis declara que
sus datos están disponibles mediante solicitud a la autora. La atribución y
las condiciones de una futura publicación deben acompañar a las fuentes.
