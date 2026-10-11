import { describe, it, expect } from 'vitest';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../src/map-helpers.js';
import { buildSite, siteFiles } from '../scripts/build_site.mjs';
const H = globalThis.CatamapHelpers;
const schools = JSON.parse(await readFile(new URL('../data/clean/schools.json', import.meta.url)));
const stores = JSON.parse(await readFile(new URL('../data/clean/stores.json', import.meta.url)));
const features = JSON.parse(await readFile(new URL('../data/clean/stores.geojson', import.meta.url))).features;
const state = { view: 'promotion', school: '', district: '', sector: '', result: '' };

describe('Muestras, filtros y significado de los resultados', () => {
  it('uses the final study samples, not presence of geometry', () => {
    expect(H.filterStores(stores, schools, state)).toHaveLength(306);
    expect(H.filterStores(stores, schools, { ...state, view: 'nutrition' })).toHaveLength(153);
    expect(H.filterStores(stores, schools, { ...state, view: 'all' })).toHaveLength(3644);
  });
  it('keeps zero PEADC apart from missing observations', () => {
    const zero = H.filterStores(stores, schools, { ...state, result: 'zero' });
    expect(zero).toHaveLength(76);
    expect(zero.every(p => p.peadc_score === 0)).toBe(true);
    expect(H.filterStores(stores, schools, { ...state, result: 'positive' })).toHaveLength(230);
    expect(H.mean([0, 10, null])).toBe(5);
    expect(H.mean([null])).toBeNull();
    expect(H.percentage(0, 0)).toBeNull();
    expect(H.percentage(0, 2)).toBe(0);
  });
  it('follows published nutrition classes, including the disputed score of 36', () => {
    const healthy = H.filterStores(stores, schools, { ...state, view: 'nutrition', result: 'healthy' });
    expect(healthy).toHaveLength(7);
    expect(healthy.some(p => p.nems_score === 36 && p.nems_threshold_conflict)).toBe(true);
    expect(H.filterStores(stores, schools, { ...state, view: 'nutrition', result: 'unhealthy' })).toHaveLength(146);
  });
  it('filters by assigned school district, even when a store is across its boundary', () => {
    const rows = H.filterStores(stores, schools, { ...state, view: 'all', district: '1' });
    const ids = new Set(schools.filter(p => p.district_id === 1).map(p => p.school_id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(p => ids.has(p.school_id))).toBe(true);
    expect(rows.some(p => p.district_id !== 1)).toBe(true);
  });
  it('uses original school assignment and intersects sector and sample filters', () => {
    const p = schools[0];
    const rows = H.filterStores(stores, schools, { ...state, school: p.school_id, sector: 'food_retail' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(v => v.school_id === p.school_id && v.sector === 'food_retail' && v.peadc_score != null)).toBe(true);
  });
  it('does not invent a store category from its name', () => {
    expect(H.storeType({ name: 'Supermarket Carrefour', sector: 'food_retail' })).toEqual(['🏪', 'Comercio alimentario']);
    expect(H.storeType({ retail_type: 'Bakeries' })[0]).toBe('🥐');
  });
  it('shows missing historical context separately from low or zero values', () => {
    expect(H.contextColor({ rfd_index: null }, 'rfd')).toBe('#29343a');
    expect(H.contextColor({ rfd_index: 0 }, 'rfd')).not.toBe('#29343a');
    expect(H.obesityColor(0)).toBe(H.colors.mint);
    expect(H.obesityColor(null)).toBe(H.colors.gray);
  });
});
describe('Map grouping and downloadable selections', () => {
  it('preserves every mapped store once and skips the four unknown positions', () => {
    const cells = H.groupPoints(features, (lat, lng) => ({ x: lng * 10000, y: lat * 10000 }), 47);
    const rows = cells.flatMap(c => c.features);
    expect(rows).toHaveLength(3640);
    expect(new Set(rows.map(f => f.properties.store_id)).size).toBe(3640);
    expect(cells.every(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))).toBe(true);
    expect(H.groupPoints(features, (lat, lng) => ({ x: lng, y: lat }), 0)).toHaveLength(3640);
  });
  it('escapes source text and CSV formulas while preserving zero and missing values', () => {
    expect(H.escapeHTML('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    const csv = H.csv([{ name: '=SUM(A1)', value: 0 }, { name: 'Catalina, "Barcelona"', value: null }], [{ key: 'name', label: 'Nombre' }, { key: 'value', label: 'Puntos' }]);
    expect(csv).toContain('"\'=SUM(A1)","0"');
    expect(csv).toContain('"Catalina, ""Barcelona""",""');
  });
  it('builds only the public allowlist and never copies original documents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'catamap-site-'));
    try {
      await buildSite(dir);
      const paths = (await readdir(dir, { recursive: true })).filter(path => path.includes('.') || path === '_headers');
      expect(paths.sort()).toEqual(siteFiles.map(([, target]) => target).sort());
      expect(paths.some(path => /datasets-raw|\.dta$|\.xlsx$|\.pdf$|data\/raw/.test(path))).toBe(false);
      const html = await readFile(join(dir, 'index.html'), 'utf8');
      for (const path of ['src/app.js', 'src/map-helpers.js', 'assets/style.css', 'data/clean/bundle.js']) expect(html).toContain(path);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
