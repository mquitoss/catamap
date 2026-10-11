# Catamap

Base de datos geográfica para explorar el entorno alimentario de 22 escuelas de
Barcelona estudiado en la tesis de Catalina Londoño Cañola. El trabajo de campo
corresponde a 2019–2020. Los datasets preparados reproducen las muestras y los
recuentos publicados y conservan las discrepancias de las fuentes para que puedan
consultarse en el mapa interactivo.

Mapa estático con filtros, fichas, comparación de escuelas y descarga CSV,
preparado para desplegar en Cloudflare Workers Static Assets.

## Abrir el mapa

```bash
npm ci
npm run dev
```

Abre la dirección local que aparece al iniciar la aplicación (normalmente
http://localhost:8787). Los controles funcionan en ordenador y móvil.

- **📣 Promoción:** 306 locales observados, coloreados por PEADC (0–40).
- **🥬 Oferta:** 153 comercios evaluados por IDAS/NEMS (0–49), con la clasificación publicada.
- **🏫 Escuelas:** prevalencia de obesidad por escuela, sin calcular una prevalencia global.
- **🏪 Todos los locales:** universo histórico; cuatro registros no tienen ubicación y solo aparecen en la descarga.

Filtra por escuela, distrito de la escuela, sector o resultado observado.
Selecciona una escuela para abrir su ficha y el círculo reconstruido de 400 m.
Los grupos de locales se abren al ampliar el mapa. Desde el nivel 16 se muestran
emojis individuales según la actividad registrada, sin inferir categorías por nombre.

La renta y la densidad histórica se activan como fondo por barrios. Las fichas y
la lista de escuelas muestran sus entornos completos; los filtros de locales
solo afectan a los puntos, las tarjetas de recuento y la descarga. La comparación
muestra las 22 escuelas y permite abrir sus fichas.

## Desplegar en Cloudflare

Se utiliza **Workers Static Assets + Workers Builds**, conectado directamente
con GitHub, igual que en `valhalla-committee`. `main` publica producción y las
otras ramas generan previews independientes. Wrangler sigue fijado a `4.149.0`.

### Conectar GitHub a Workers Builds

En Cloudflare, importa `mquitoss/catamap` y configura:

| Ajuste | Valor |
|---|---|
| Nombre del Worker | `catamap` |
| Directorio raíz | Raíz del repositorio (`/`) |
| Rama de producción | `main` |
| Build command | `npm test && npm run check:deploy` |
| Deploy command | `npm run deploy` |
| Preview command | `npm run preview:deploy` |
| Preview Builds | Activadas para las demás ramas |

`.node-version` fija Node.js `22.23.2`; Cloudflare instala las dependencias del
lockfile automáticamente. El build comprueba los tests, genera `dist/` y valida
el paquete antes de publicar. Los comandos de producción y preview ejecutan
Wrangler sobre el resultado ya construido.

La cuenta y la conexión de la aplicación oficial de GitHub se seleccionan en
Cloudflare. Usa el token administrado por Workers Builds; este método no exige
un secreto de despliegue en GitHub Actions. El workflow alternativo de Actions
se ha retirado para que haya un único sistema de publicación.

Los pasos completos, las referencias oficiales y la comprobación del primer
build están en [`docs/cloudflare.md`](docs/cloudflare.md). El repositorio ya está
conectado a Workers Builds y el primer despliegue ha finalizado correctamente.
La URL de producción es <https://catamap.marc-freixas.workers.dev/>.

[`wrangler.jsonc`](wrangler.jsonc) apunta exclusivamente a `dist/`. La construcción
copia una lista explícita de archivos: aplicación, bundle limpio y documentación
de fuentes. No incluye PDF, Stata, Excel ni snapshots originales. No requiere
backend, base de datos, bindings ni código de servidor. `previews: {}` habilita
la configuración de previews sin recursos ni credenciales de producción.

### Despliegue desde tu equipo

```bash
npm run check:deploy
npm run deploy:local
```

La primera instrucción construye y comprueba el paquete sin publicar. La
segunda vuelve a construir y publica el Worker **catamap** en la cuenta que
Wrangler autentique. Para iniciar sesión, utiliza `npx wrangler login` si es
necesario. No introduzcas credenciales en los archivos del proyecto.

`npm run deploy` y `npm run preview:deploy` esperan que `dist/` ya esté construido,
como en Valhalla y en Workers Builds. El dominio personalizado se configura en
el Worker tras publicarlo.

### Fondo cartográfico

Se conserva Leaflet y la presentación oscura de los ejemplos. El fondo
predeterminado utiliza OpenStreetMap con un filtro visual oscuro, sin clave.
CARTO ahora [requiere una clave para sus fondos](https://www.carto.com/basemaps/apikey/index.html).
Para usar exactamente **CARTO Dark Matter**, establece una clave de Basemaps en
`src/config.js` o en la variable de construcción `CARTO_BASEMAP_KEY`.
La clave se incorpora al navegador; debe restringirse a tus dominios desde CARTO.
No uses una credencial privada de la plataforma CARTO.

El fondo OSM carga únicamente las teselas de la vista actual y respeta la caché
del navegador. Para un tráfico elevado configura CARTO u otro proveedor con
capacidad apropiada; revisa la [política de teselas de OSM](https://operations.osmfoundation.org/policies/tiles/).
El mapa requiere conexión para Leaflet, fuentes y teselas. Abrir `index.html`
directamente puede servir para inspeccionar la aplicación, pero se recomienda
el servidor local para que las peticiones de teselas lleven su origen.

## Stack de los proyectos de referencia

`invest-map` y `quirat-barcelona` utilizan HTML, CSS y JavaScript nativos,
Leaflet 1.9.4 desde CDN, fondo CARTO Dark Matter y atribución a OpenStreetMap,
GeoJSON para geometrías y JSON para indicadores. Un archivo `bundle.js` cargado
con una etiqueta `script` permite leer los datos al abrir el HTML directamente.
No necesitan backend ni compilación de la aplicación.

Ambos preparan los datos con Python y gestionan sus dependencias con `uv`.
Utilizan pytest para el proceso de datos y Vitest para los helpers de JavaScript.
Catamap sigue esa arquitectura. Las dependencias adicionales de Python permiten
leer Stata y Excel y trabajar con geometrías y proyecciones.

La carga de datos locales puede funcionar sin servidor. Las librerías del CDN,
las fuentes de Google Fonts y las teselas del fondo requieren conexión si no
están almacenadas localmente. El bundle por sí solo no hace que todo el mapa
funcione sin conexión.

## Datos preparados

Los archivos de consumo están en [`data/clean`](data/clean/).

| Dataset | Registros | Uso |
|---|---:|---|
| `schools.geojson` y `schools.json` | 22 | Escuelas, contexto de su barrio, obesidad, exceso de peso y resumen del entorno |
| `stores.geojson` y `stores.json` | 3.644 | Comercios y restauración; 3.640 con ubicación y cuatro con geometría nula |
| `nutrition_observations.json` | 153 | Índice NEMS/IDAS, clasificación y disponibilidad de alimentos |
| `promotion_observations.json` | 306 | PEADC y exposición exterior, interior y mobiliario promocional |
| `neighborhoods.geojson` e `neighborhood_indicators.json` | 73 | Fondo por barrios; 40 con contexto histórico disponible en la tesis |
| `buffers.geojson` | 22 | Círculos de 400 m reconstruidos con coordenadas oficiales de 2019–2020 |
| `school_store_links.json` | 3.644 | Asignación de cada establecimiento a su escuela y distancias |
| `thesis_table9_school_links.json` | 22 | Procedencia y comprobaciones del enlace reconstruido de exceso de peso |

Las tablas principales tienen además una versión CSV. `bundle.js` expone
`window.CATAMAP`, con `geo`, `indicators`, `layers`, `nutrition`, `promotion` y
`meta`, para seguir el patrón de los dos proyectos de referencia. Los GeoJSON
utilizan EPSG:4326 y coordenadas en orden longitud, latitud.

Consulta [`docs/analysis.md`](docs/analysis.md) para las hipótesis y las capas
propuestas, [`DATA_SOURCES.md`](DATA_SOURCES.md) para la procedencia y
[`data/README.md`](data/README.md) para el contrato de consumo.

## Regeneración y validación

```bash
uv sync
uv run python scripts/build_data.py
uv run pytest -q
uv run ruff check scripts tests
npm test
npm run check:deploy
```

La regeneración usa únicamente los originales de `docs/datasets-raw` y los
snapshots de `data/raw`. No necesita red ni los proyectos de referencia.
`--output <carpeta>` permite escribir una copia alternativa para comparar
resultados. Las fuentes originales no se modifican.

## Discrepancias que afectan a la interpretación

- Cuatro establecimientos incorporados manualmente a la tesis carecen de
  coordenadas verificadas. Se conservan como registros sin geometría.
- La muestra del Excel contiene `59407`; la base de 2022 utiliza `59752`.
  Las observaciones siguen la base de 2022. Ambos tienen coordenadas verificadas.
- Una puntuación NEMS de 36 está clasificada como saludable, aunque la regla
  escrita utiliza ≤36 para la categoría no saludable. Se conservan ambas
  clasificaciones: 146 casos publicados y 147 al aplicar literalmente la regla.
- La tabla 9 no identifica las escuelas por nombre. Sus valores de exceso de
  peso se enlazan por distrito y media PEADC, con coincidencia única para las 22
  escuelas. Dos filas discrepan en la titularidad. El enlace y la discrepancia
  quedan marcados expresamente.
- Los círculos reconstruidos no son la geometría original del estudio. Hay 64
  establecimientos asignados en las fuentes que quedan fuera del círculo
  reconstruido; no se eliminan ni se reasignan automáticamente.
- Los precios de detalle se decodifican, pero mantienen unidades de origen y
  posibles valores anómalos. El mapa puede utilizar los índices verificados;
  comparar precios por producto requiere revisar unidades y formatos.

El detalle está en [`data/clean/quality_report.json`](data/clean/quality_report.json).
Los datos permiten explorar asociaciones históricas. El diseño transversal y la
selección de escuelas por conveniencia no permiten demostrar causalidad ni
generalizar los resultados a todas las escuelas de Barcelona.
