# Contrato de los datasets del mapa

`clean/` contiene los datos de consumo del mapa; `raw/` conserva los snapshots,
la correspondencia de escuelas y la transcripción de la tabla 9. Los originales
Stata, Excel y PDF permanecen en `docs/datasets-raw`.

## Carga con el stack de los ejemplos

```html
<script src="data/clean/bundle.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
```

```javascript
const data = window.CATAMAP;
L.geoJSON(data.geo);                // Barrios e indicadores históricos.
L.geoJSON(data.layers.schools);     // 22 escuelas.
L.geoJSON(data.layers.stores);      // 3.640 puntos; cuatro geometrías nulas.
L.geoJSON(data.layers.buffers);     // 22 círculos reconstruidos de 400 metros.
```

La interfaz de `../index.html` utiliza este contrato. Agrupa los locales en una
cuadrícula hasta el nivel de zoom 15 y muestra emojis individuales a partir del
nivel 16. Permite filtrar por escuela, muestra y sector. Los cuatro registros con geometría nula se
pueden listar en el panel, pero no deben situarse en una coordenada ficticia.

## Identificadores y relaciones

| Dataset | Clave | Relación |
|---|---|---|
| `stores` | `store_id`, entero único | `school_id` enlaza con la escuela asignada en el estudio |
| `schools` | `school_id`, código municipal EG | `official_school_code` enlaza con el directorio de la Generalitat |
| `neighborhood_indicators` | `neighborhood_id`, entero 1–73 | Enlace con GeoJSON de barrios |
| `nutrition_observations` | `store_id` | Subconjunto de 153 locales |
| `promotion_observations` | `store_id` | Subconjunto de 306 locales |
| `school_store_links` | `store_id` | Una asignación original por establecimiento |

Los círculos de diferentes escuelas pueden solaparse. La relación publicada en
la base es una asignación por establecimiento. Dibujar círculos no autoriza
a duplicar automáticamente los registros en los indicadores de varias escuelas.

## Unidades y valores ausentes

- Porcentajes: escala de 0 a 100, no fracciones de 0 a 1.
- RFD: índice relativo histórico, Barcelona=100; no euros por habitante.
- Densidad: habitantes por km².
- Distancias: metros; tiempo caminable: minutos.
- NEMS/IDAS: 0–49; mayor puntuación indica mayor disponibilidad/asequibilidad.
- PEADC: 0–40; mayor puntuación indica más promoción.
- `null`: no disponible o no aplicable. Nunca convertirlo en cero.

`store_rfd_index` describe el barrio del comercio; `school_rfd_index`, el barrio
de la escuela. Son variables distintas y pueden diferir para un mismo registro.

## Selección y cobertura

El modo «todos» utiliza 3.644 registros históricos asignados a las escuelas.
El modo «observados» utiliza `surveyed_2022=true`, con 306 registros. El modo
IDAS utiliza `nems_score !== null`, con 153 registros. No debe usarse la
presencia de coordenadas ni `sample_excel_2021` como criterio de muestra actual.

`retail_type` tiene cobertura parcial en la fuente. Cuando sea nulo se mantiene
la actividad general `activity_name`; no se infiere supermercado o tienda de
conveniencia a partir de palabras del nombre.

La capa de barrios incluye los 73 polígonos, pero solo 40 tienen contexto
histórico. `has_study_context=false` debe representarse como «sin datos del
estudio», no como renta cero ni como ausencia de comercios reales.

## Clasificaciones y porcentajes

La clasificación por defecto es `nems_published_class`, que reproduce 146 de
153 tiendas no saludables. `nems_documented_rule_class` aplica literalmente el
umbral ≤36 y clasifica 147. `nems_threshold_conflict` identifica el caso que
requiere aclaración. La interfaz debe indicar qué clasificación utiliza.

`unhealthy_observed_pct` divide por `nems_observations_count`.
`positive_peadc_pct` divide por `promotion_observations_count`.
`mean_peadc_score` incluye los ceros. `mean_positive_peadc_score` utiliza solo
los positivos y no debe sustituirse por la media principal.

`assigned_stores_per_nominal_buffer_km2` divide el recuento asignado entre
π×0,4². Es un indicador del universo asignado a la escuela, no una medición de
todas las intersecciones con el círculo reconstruido.

## Peso escolar y procedencia

`obesity_prevalence_pct` procede de Stata y describe obesidad escolar.
`excess_weight_prevalence_pct` procede de la tabla 9 e incluye sobrepeso y
obesidad. El enlace de esa tabla con nombres de escuelas está reconstruido:

- `excess_weight_source`: página y tabla de origen.
- `excess_weight_link_method`: distrito y media PEADC, coincidencia única.
- `excess_weight_link_reconstructed`: verdadero para las 22 escuelas.
- `table9_row`: fila original de la tabla publicada.
- `table9_school_type_conflict`: verdadero en dos escuelas.

No hay registros individuales ni tamaños de cohorte. No calcular una prevalencia
global de alumnado ponderando por número de comercios, observaciones o barrios.

## Geometría de influencia

`buffers.geojson` marca `is_original_thesis_buffer=false`. Son círculos
reconstruidos desde puntos oficiales del curso 2019–2020. No reemplazan la
asignación original ni las distancias de Stata. El informe identifica 64
establecimientos asignados fuera del círculo reconstruido.

`route_distance_m` es caminable y puede superar 400 m. `straight_distance_source_m`
es euclidiana y procede de la muestra original. `straight_distance_rebuilt_m`
se recalcula desde las coordenadas recuperadas; debe etiquetarse como tal.

## Auditoría y regeneración

- `clean/data_dictionary.json`: campos, claves, unidades y reglas.
- `clean/metadata.json`: periodos, procedencia y hashes de entrada.
- `clean/quality_report.json`: recuentos, discrepancias y decisiones.
- `raw/sources.json`: descarga y conservación de las fuentes externas.
- `../scripts/build_data.py`: regeneración sin red.

El proceso verifica los hashes de los snapshots externos, las claves únicas,
la cobertura de las muestras y el enlace unívoco de la tabla 9. Las pruebas
comprueban los porcentajes, las geometrías, los radios, los ceros y ausencias,
los precios codificados y la reproducibilidad de los archivos.
