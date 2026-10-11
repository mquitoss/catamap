/* Classic script: shared by the browser and Vitest, without a runtime bundler. */
(function (root) {
  'use strict';
  const colors = { mint: '#a6e6b6', yellow: '#f0d48b', coral: '#f0a078', gray: '#87989e' };
  const districts = { 1: 'Ciutat Vella', 2: 'Eixample', 3: 'Sants-Montjuïc', 4: 'Les Corts', 5: 'Sarrià-Sant Gervasi', 6: 'Gràcia', 7: 'Horta-Guinardó', 8: 'Nou Barris', 9: 'Sant Andreu', 10: 'Sant Martí' };
  const types = {
    Supermarkets: ['🛒', 'Supermercado'],
    'Convenience store': ['🏪', 'Tienda de conveniencia'],
    'Fruit & vegetables stores': ['🥬', 'Frutas y verduras'],
    Butcheries: ['🥩', 'Carnicería / aves'],
    Fishmongers: ['🐟', 'Pescadería'],
    Bakeries: ['🥐', 'Panadería / pastelería'],
    'Other especialized food stores': ['🏬', 'Comercio especializado']
  };
  function storeType(p) {
    if (types[p.retail_type]) return types[p.retail_type];
    if (p.food_service_type === 'Bar-Tapas') return ['🍻', 'Bar / tapas'];
    if (p.food_service_type === 'Restaurant-carta') return ['🍽️', 'Restaurante'];
    if (p.food_service_type === 'Cadenes') return ['🍔', 'Cadena de restauración'];
    if (p.sector === 'food_service') return ['🍽️', 'Restauración'];
    return ['🏪', p.activity_name || 'Comercio alimentario'];
  }
  function schoolFilter(schools, state) {
    return schools.filter(p => (!state.school || p.school_id === state.school) &&
      (!state.district || String(p.district_id) === String(state.district)));
  }
  function filterStores(stores, schools, state) {
    const allowed = new Set(schoolFilter(schools, state).map(s => s.school_id));
    return stores.filter(p => {
      if (!allowed.has(p.school_id) || (state.sector && p.sector !== state.sector)) return false;
      if (state.view === 'schools') return false;
      if (state.view === 'promotion' && p.peadc_score == null) return false;
      if (state.view === 'nutrition' && p.nems_score == null) return false;
      if (state.result === 'positive' && !(p.peadc_score > 0)) return false;
      if (state.result === 'zero' && p.peadc_score !== 0) return false;
      if (['healthy', 'unhealthy'].includes(state.result) && p.nems_published_class !== state.result) return false;
      return true;
    });
  }
  function mean(values) {
    const known = values.filter(v => typeof v === 'number' && Number.isFinite(v));
    return known.length ? known.reduce((sum, v) => sum + v, 0) / known.length : null;
  }
  function percentage(numerator, denominator) { return denominator ? numerator * 100 / denominator : null; }
  function obesityColor(n) { return n == null ? colors.gray : n < 10 ? colors.mint : n < 20 ? colors.yellow : colors.coral; }
  function storeColor(p, view) {
    if (view === 'promotion') return p.peadc_score == null || p.peadc_score === 0 ? colors.gray : p.peadc_score < 10 ? colors.mint : p.peadc_score < 20 ? colors.yellow : colors.coral;
    if (view === 'nutrition') return p.nems_published_class === 'healthy' ? colors.mint : p.nems_published_class === 'unhealthy' ? colors.coral : colors.gray;
    return p.sector === 'food_retail' ? colors.mint : colors.yellow;
  }
  function contextColor(p, context) {
    const value = context === 'rfd' ? p.rfd_index : p.population_density_per_km2;
    if (context === 'none' || value == null) return '#29343a';
    const cuts = context === 'rfd' ? [60, 85, 100, 150] : [10000, 20000, 30000, 40000];
    const palette = ['#304842', '#42695a', '#598f74', '#7cbb93', '#a6e6b6'];
    const index = cuts.findIndex(c => value < c);
    return palette[index === -1 ? 4 : index];
  }
  // Global projected grid: deterministic groups; only geolocated features participate.
  function groupPoints(features, project, cellSize) {
    const cells = new Map();
    for (const feature of features) {
      if (!feature.geometry) continue;
      const [lng, lat] = feature.geometry.coordinates;
      const point = project(lat, lng);
      const key = cellSize ? `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}` : String(feature.properties.store_id);
      if (!cells.has(key)) cells.set(key, { features: [], lat: 0, lng: 0 });
      const cell = cells.get(key);
      cell.features.push(feature); cell.lat += lat; cell.lng += lng;
    }
    return [...cells.values()].map(cell => ({ ...cell, lat: cell.lat / cell.features.length, lng: cell.lng / cell.features.length }));
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  function csv(rows, columns) {
    function cell(value) {
      let text = value == null ? '' : String(value);
      // Avoid evaluating source names/addresses as formulas when a CSV is opened in Excel.
      if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    }
    return '\ufeff' + [columns.map(c => cell(c.label)).join(','), ...rows.map(row => columns.map(c => cell(row[c.key])).join(','))].join('\r\n');
  }
  root.CatamapHelpers = { colors, districts, storeType, schoolFilter, filterStores, mean, percentage, obesityColor, storeColor, contextColor, groupPoints, escapeHTML, csv };
})(globalThis);
