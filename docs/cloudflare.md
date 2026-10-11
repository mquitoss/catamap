# Cloudflare: el patrón de Valhalla aplicado a Catamap

`valhalla-committee` sirve `dist/` con **Workers Static Assets** y usa
**Workers Builds**, conectado directamente a GitHub mediante la aplicación
oficial **Cloudflare Workers and Pages**. Sus checks de producción y preview
constan como exitosos. Su `wrangler.jsonc` incluye `previews: {}` y separa
los comandos de construcción, producción y preview.

Catamap utiliza ese mismo alojamiento y está conectado a GitHub. La conexión
del repositorio se configura en Cloudflare; escribir `wrangler.jsonc` no crea
por sí solo esa conexión.

## Estado del despliegue

Configurado el 11 de octubre de 2026 en la cuenta que aloja Valhalla:

- Producción: <https://catamap.marc-freixas.workers.dev/>.
- Repositorio conectado: `mquitoss/catamap`, rama `main`.
- Primer build de producción exitoso: `d3d1c212-8b96-48f0-8f6f-8c941fc05edc`.
- Aplicación oficial de GitHub autorizada específicamente para Catamap.
- Token de build existente: `valhalla-committee build token`.
- `workers_dev: true` conserva la URL pública en futuros despliegues.

## Ajustes para Workers Builds

| Ajuste de Cloudflare | Valor para Catamap |
|---|---|
| Repositorio | `mquitoss/catamap` |
| Nombre del Worker | `catamap` |
| Directorio raíz | Raíz del repositorio (`/`) |
| Rama de producción | `main` |
| Build command | `npm test && npm run check:deploy` |
| Deploy command | `npm run deploy` |
| Preview command | `npm run preview:deploy` |
| Enable Preview Builds | Activado para las otras ramas |
| Node.js | `22.23.2`, definido en `.node-version` |
| Instalación de dependencias | Automática, con el `package-lock.json` del repositorio |
| API token | El administrado por Workers Builds, o uno elegido en el dashboard |

`npm run check:deploy` construye `dist/` y comprueba su empaquetado sin
publicarlo. El comando de producción del dashboard invoca el script `deploy`, que ejecuta
Wrangler directamente
para evitar repetir la construcción que ya se ha hecho en el paso anterior.
La preview utiliza el mismo resultado estático y `wrangler preview` para crear
una URL independiente de producción. Las URLs de preview son públicas mientras
no se configure un control de acceso.

La configuración no utiliza Pages, un Worker con lógica de servidor, bindings
ni una base de datos. Conserva la página 404 y las cabeceras de los assets.
Las fuentes originales y los snapshots permanecen fuera de `dist/`.

## Conectar desde Cloudflare

1. Sube a GitHub los cambios de configuración de esta entrega.
2. En **Workers & Pages**, elige **Create application → Import a repository**
   y selecciona `mquitoss/catamap`. Si ya existe el Worker `catamap`, abre
   **Settings → Builds → Connect** dentro de ese Worker.
3. Usa la cuenta que debe alojar Catamap. Autoriza la aplicación oficial de
   GitHub para este repositorio si todavía no tiene acceso.
4. Introduce los valores de la tabla. El nombre debe ser exactamente `catamap`,
   como en `wrangler.jsonc`.
5. Activa las previews en **Branch control**. Guarda y ejecuta el primer build.
6. Comprueba el check **Workers Builds: catamap** en GitHub y abre la URL que
   Cloudflare devuelva. Un nuevo push a `main` actualizará producción.

La autorización de la GitHub App y la selección de cuenta se completan en el
dashboard. No copies tokens al repositorio ni al chat. Con Workers Builds no
es necesario crear un secreto de GitHub Actions para el despliegue.

## Un único sistema de publicación

Se ha retirado el borrador local de
`.github/workflows/deploy-production.yml`. Producción se publica exclusivamente
mediante Workers Builds conectado al repositorio. La variable de GitHub Actions
`CLOUDFLARE_ACCOUNT_ID`, ya existente en GitHub, no participa en este flujo;
no se ha cambiado la configuración de variables del repositorio. Los documentos
anteriores de `.dev-workflow/` conservan la propuesta de GitHub Actions; esta guía
describe la elección actual de Workers Builds.

## Validación local

```bash
npm test
npm run check:deploy
```

Estos checks validan la aplicación y el paquete. La conexión y el primer build
remoto se verifican mediante el dashboard y el check oficial de GitHub.

## Referencias

- [Workers Builds y conexión del repositorio](https://developers.cloudflare.com/workers/ci-cd/builds/).
- [Configuración de comandos y token administrado](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
- [Ramas de producción y previews](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).
- [Configuración de Previews](https://developers.cloudflare.com/workers/previews/configuration/).
- [Versión de Node.js en Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).
