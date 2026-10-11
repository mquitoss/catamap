import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteFiles = [
  ['index.html', 'index.html'],
  ['assets/style.css', 'assets/style.css'],
  ['assets/favicon.svg', 'assets/favicon.svg'],
  ['assets/404.html', '404.html'],
  ['assets/_headers', '_headers'],
  ['src/config.js', 'src/config.js'],
  ['src/map-helpers.js', 'src/map-helpers.js'],
  ['src/app.js', 'src/app.js'],
  ['data/clean/bundle.js', 'data/clean/bundle.js'],
  ['DATA_SOURCES.md', 'DATA_SOURCES.md']
];
const root = fileURLToPath(new URL('../', import.meta.url));
// Explicit allowlist: original thesis, Stata, Excel and raw snapshots stay outside dist.
export async function buildSite(output = join(root, 'dist')) {
  await rm(output, { recursive: true, force: true });
  for (const [source, target] of siteFiles) {
    const destination = join(output, target);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, source), destination);
  }
  if (process.env.CARTO_BASEMAP_KEY) {
    await writeFile(join(output, 'src/config.js'), `window.CATAMAP_CONFIG = ${JSON.stringify({ cartoBasemapKey: process.env.CARTO_BASEMAP_KEY })};\n`);
  }
  return output;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`Sitio preparado: ${await buildSite()}`);
}
