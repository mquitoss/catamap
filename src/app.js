(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!window.L || !window.CATAMAP || !window.CatamapHelpers) {
    $('error').hidden = false;
    $('error').textContent = 'No se ha podido cargar el mapa. Comprueba la conexión a Internet y vuelve a cargar la página.';
    return;
  }
  const H = window.CatamapHelpers, data = window.CATAMAP, e = H.escapeHTML;
  const schools = data.layers.schools.features.map(f => f.properties);
  const storeFeatures = data.layers.stores.features;
  const stores = storeFeatures.map(f => f.properties);
  const schoolById = new Map(schools.map(s => [s.school_id, s]));
  const nutritionById = new Map(data.nutrition.map(p => [p.store_id, p]));
  const promotionById = new Map(data.promotion.map(p => [p.store_id, p]));
  const state = { view: 'promotion', school: '', district: '', sector: '', result: '', context: 'none', buffers: false };
  let filtered = [], activeSchools = [], currentDetail = null;
  const fmt = (n, digits = 0) => n == null ? 'Sin dato' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  const pct = n => n == null ? 'Sin dato' : `${fmt(n, n > 0 && n < .1 ? 2 : 1)} %`;
  const metric = () => state.view === 'promotion' ? 'mean_peadc_score' : state.view === 'nutrition' ? 'unhealthy_observed_pct' : state.view === 'schools' ? 'obesity_prevalence_pct' : 'assigned_stores_count';
  const metricLabel = () => state.view === 'promotion' ? 'Media PEADC' : state.view === 'nutrition' ? '% no saludables · IDAS' : state.view === 'schools' ? 'Obesidad escolar' : 'Locales asignados';
  const map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 11, maxZoom: 19 }).setView([41.402, 2.154], 13);
  map.createPane('buffers'); map.getPane('buffers').style.zIndex = '410'; map.getPane('buffers').style.pointerEvents = 'none';
  map.createPane('schools'); map.getPane('schools').style.zIndex = '630';
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const cartoKey = window.CATAMAP_CONFIG?.cartoBasemapKey;
  const tiles = L.tileLayer(cartoKey ? `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}` : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + (cartoKey ? ' &copy; <a href="https://carto.com/attributions">CARTO</a>' : ''),
    className: cartoKey ? '' : 'osm-dark-tiles',
    maxZoom: cartoKey ? 20 : 19
  }).addTo(map);
  let tileSuccess = false, tileFailures = 0;
  tiles.on('tileload', () => { tileSuccess = true; });
  tiles.on('tileerror', () => {
    tileFailures++;
    if (!tileSuccess && tileFailures > 8) $('map-caption').textContent = 'El fondo no está disponible. Los puntos y las fichas siguen accesibles.';
  });
  const neighborhoodLayer = L.geoJSON(data.geo, {
    style: feature => neighborhoodStyle(feature.properties),
    onEachFeature: (feature, layer) => {
      layer.on('click', () => showNeighborhood(feature.properties));
      layer.bindTooltip(e(feature.properties.name), { sticky: true });
    }
  }).addTo(map);
  const bufferLayer = L.geoJSON(null, { pane: 'buffers', interactive: false, style: { color: H.colors.mint, weight: 1.4, dashArray: '5 5', fillColor: H.colors.mint, fillOpacity: .035 } }).addTo(map);
  const storeLayer = L.layerGroup().addTo(map), schoolLayer = L.layerGroup().addTo(map);
  function neighborhoodStyle(p) {
    return { color: '#526267', weight: .7, opacity: .45, fillColor: H.contextColor(p, state.context), fillOpacity: state.context === 'none' ? .06 : p.has_study_context ? .35 : .16 };
  }
  function option(value, label) { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; }
  schools.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(s => $('school').append(option(s.school_id, s.official_name || s.name)));
  Object.entries(H.districts).forEach(([id, label]) => $('district').append(option(id, label)));
  function updateResultOptions() {
    const entries = state.view === 'promotion' ? [['', 'Todos los observados'], ['positive', 'Con promoción · PEADC > 0'], ['zero', 'Sin promoción · PEADC = 0']] : state.view === 'nutrition' ? [['', 'Todos los evaluados'], ['unhealthy', 'No saludable · clasificación publicada'], ['healthy', 'Saludable · clasificación publicada']] : [['', 'No se aplica en esta vista']];
    $('result').replaceChildren(...entries.map(([v, t]) => option(v, t)));
    $('result').disabled = ['all', 'schools'].includes(state.view);
    $('sector').disabled = state.view === 'schools';
  }
  function schoolIcon(p) {
    return L.divIcon({ className: 'emoji-marker', html: `<span class="emoji-pin school-pin" style="--marker-color:${H.obesityColor(p.obesity_prevalence_pct)}" aria-hidden="true">🏫</span>`, iconSize: [33, 33], iconAnchor: [16, 16] });
  }
  function renderSchools() {
    schoolLayer.clearLayers();
    activeSchools.forEach(p => {
      const marker = L.marker([p.latitude, p.longitude], { pane: 'schools', icon: schoolIcon(p), title: `Escuela ${p.official_name}; obesidad ${pct(p.obesity_prevalence_pct)}`, riseOnHover: true });
      marker.bindTooltip(e(`🏫 ${p.official_name}`), { direction: 'top', offset: [0, -18] });
      marker.on('click', () => selectSchool(p.school_id));
      marker.addTo(schoolLayer);
    });
  }
  function renderStores() {
    storeLayer.clearLayers();
    const allowed = new Set(filtered.map(p => p.store_id));
    const features = storeFeatures.filter(f => allowed.has(f.properties.store_id));
    const zoom = map.getZoom();
    const groups = H.groupPoints(features, (lat, lng) => map.project([lat, lng], zoom), zoom < 16 ? 47 : 0);
    groups.forEach(group => {
      const single = group.features.length === 1;
      const p = group.features[0].properties;
      const color = single ? H.storeColor(p, state.view) : H.colors.gray;
      const icon = L.divIcon({ className: single ? 'emoji-marker' : 'cluster-marker', html: single ? `<span class="emoji-pin" style="--marker-color:${color}" aria-hidden="true">${H.storeType(p)[0]}</span>` : `<span class="cluster-pin" style="--marker-color:${color}">${group.features.length}<small>locales</small></span>`, iconSize: single ? [28, 28] : [36, 36], iconAnchor: single ? [14, 14] : [18, 18] });
      const marker = L.marker([group.lat, group.lng], { icon, title: single ? `${H.storeType(p)[1]}: ${p.name || 'Sin nombre'}` : `${group.features.length} locales; ampliar el mapa` });
      marker.bindTooltip(single ? e(`${H.storeType(p)[0]} ${p.name || 'Local sin nombre'}`) : `${group.features.length} locales · pulsa para ampliar`, { direction: 'top', offset: [0, -17] });
      marker.on('click', () => {
        if (single) showStore(p);
        else map.fitBounds(L.latLngBounds(group.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]])), { padding: [70, 70], maxZoom: 17 });
      });
      marker.addTo(storeLayer);
    });
  }
  function renderBuffers() {
    bufferLayer.clearLayers();
    if (state.buffers || state.school) bufferLayer.addData({ type: 'FeatureCollection', features: data.layers.buffers.features.filter(f => activeSchools.some(s => s.school_id === f.properties.school_id)) });
  }
  function stat(value, label) { return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`; }
  function update() {
    activeSchools = H.schoolFilter(schools, state);
    filtered = H.filterStores(stores, schools, state);
    neighborhoodLayer.setStyle(f => neighborhoodStyle(f.properties));
    $('buffers').disabled = Boolean(state.school);
    renderBuffers(); renderSchools(); renderStores();
    let stats, caption, coverage;
    if (state.view === 'promotion') {
      const positive = filtered.filter(p => p.peadc_score > 0).length;
      stats = stat(fmt(filtered.length), 'Locales observados') + stat(pct(H.percentage(positive, filtered.length)), 'Con promoción calórica');
      caption = `Promoción alimentaria · ${filtered.length} locales · PEADC 0–40`;
      coverage = `${positive} de ${filtered.length} locales con promoción. Media PEADC: ${fmt(H.mean(filtered.map(p => p.peadc_score)), 1)}. Los ceros están incluidos.`;
    } else if (state.view === 'nutrition') {
      const count = filtered.filter(p => p.nems_published_class === 'unhealthy').length;
      stats = stat(fmt(filtered.length), 'Comercios evaluados') + stat(pct(H.percentage(count, filtered.length)), 'No saludables · IDAS');
      caption = `Oferta alimentaria · ${filtered.length} comercios · IDAS/NEMS 0–49`;
      coverage = `${count} de ${filtered.length} comercios no saludables según la clasificación publicada. Media IDAS: ${fmt(H.mean(filtered.map(p => p.nems_score)), 1)}.`;
    } else if (state.view === 'schools') {
      stats = stat(fmt(activeSchools.length), 'Escuelas del estudio') + stat('400 m', 'Radio reconstruido');
      caption = 'Escuelas · color por prevalencia de obesidad';
      coverage = 'Porcentajes agregados por escuela. No disponemos de tamaños de cohorte para calcular una prevalencia global del alumnado.';
    } else {
      const count = filtered.filter(p => p.has_geometry).length;
      stats = stat(fmt(filtered.length), 'Locales asignados') + stat(fmt(count), 'Con ubicación verificada');
      caption = `Universo del estudio · ${count} locales con ubicación`;
      coverage = `${filtered.filter(p => p.surveyed_2022).length} locales observados en esta selección. Los demás tienen información censal, sin evaluación nutricional o promocional.`;
    }
    const missing = filtered.filter(p => !p.has_geometry).length;
    if (missing) coverage += ` ${missing} registros sin coordenadas se incluyen en el CSV, pero no se dibujan.`;
    $('stats').innerHTML = stats;
    $('map-caption').textContent = caption;
    $('coverage').textContent = coverage + ' La lista compara el entorno completo de cada escuela.';
    $('school-list-title').textContent = metricLabel();
    $('school-list-count').textContent = `${activeSchools.length} ${activeSchools.length === 1 ? 'escuela' : 'escuelas'}`;
    const ranked = [...activeSchools].sort((a, b) => (b[metric()] ?? -1) - (a[metric()] ?? -1));
    $('school-list').innerHTML = ranked.length ? ranked.map((p, i) => `<button class="school-row" data-school="${e(p.school_id)}"><span class="rank">${String(i + 1).padStart(2, '0')}</span><span class="school-name">${e(p.official_name)}<small>${e(H.districts[p.district_id])} · ${p.school_type === 'public' ? 'Pública' : 'Concertada'}</small></span><span class="value">${['nutrition', 'schools'].includes(state.view) ? pct(p[metric()]) : fmt(p[metric()], state.view === 'promotion' ? 1 : 0)}</span></button>`).join('') : '<p class="empty">No hay escuelas en esta selección. Restablece los filtros para continuar.</p>';
    $('download').disabled = state.view === 'schools' ? !activeSchools.length : !filtered.length;
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    renderLegend();
    if (currentDetail?.type === 'school' && activeSchools.some(s => s.school_id === currentDetail.id)) showSchool(schoolById.get(currentDetail.id));
    else closeDetail();
  }
  function legendItem(color, label) { return `<span class="legend-item"><i class="swatch" style="background:${color}"></i>${label}</span>`; }
  function renderLegend() {
    let title, items, note;
    if (state.view === 'promotion') {
      title = 'Promoción de alimentos calóricos';
      items = legendItem(H.colors.gray, '0') + legendItem(H.colors.mint, '1–9') + legendItem(H.colors.yellow, '10–19') + legendItem(H.colors.coral, '20–40');
      note = 'Color del borde · PEADC. Los grupos se abren al ampliar.';
    } else if (state.view === 'nutrition') {
      title = 'Oferta · clasificación IDAS publicada';
      items = legendItem(H.colors.mint, 'Saludable') + legendItem(H.colors.coral, 'No saludable');
      note = 'Disponibilidad y precio de alimentos, según el índice.';
    } else if (state.view === 'schools') {
      title = 'Obesidad escolar';
      items = legendItem(H.colors.mint, '<10 %') + legendItem(H.colors.yellow, '10–<20 %') + legendItem(H.colors.coral, '≥20 %');
      note = 'Porcentaje de alumnado con obesidad en cada escuela.';
    } else {
      title = 'Actividad de los locales';
      items = legendItem(H.colors.mint, 'Comercio alimentario') + legendItem(H.colors.yellow, 'Restauración');
      note = '🏪 🥐 🥬 🥩 🐟 🛒 🍽️ 🍻 · Acércate para ver los locales.';
    }
    if (state.view !== 'schools') note += ' 🏫 Escuelas: borde por obesidad.';
    const context = state.context === 'none' ? '' : `<div class="context-scale"><span class="legend-item">${state.context === 'rfd' ? 'Renta familiar · Barcelona = 100' : 'Densidad · habitantes/km²'}</span><div class="ramp"></div><div class="ends"><span>${state.context === 'rfd' ? '<60' : '<10.000'}</span><span>${state.context === 'rfd' ? '≥150' : '≥40.000'}</span></div><div class="legend-note">Gris: sin datos históricos · 33 barrios</div></div>`;
    $('legend').innerHTML = `<h3>${title}</h3><div class="legend-items">${items}</div><div class="legend-note">${note}</div>${context}`;
  }
  function fitSelection() {
    const points = activeSchools.map(p => [p.latitude, p.longitude]);
    filtered.forEach(p => { if (p.has_geometry) points.push([p.latitude, p.longitude]); });
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [70, 85], maxZoom: 16, animate: false });
  }
  function selectSchool(id) {
    const p = schoolById.get(id);
    if (!p) return;
    state.school = id; state.district = ''; $('school').value = id; $('district').value = '';
    currentDetail = { type: 'school', id }; update();
    const f = data.layers.buffers.features.find(f => f.properties.school_id === id);
    if (f) {
      const mobile = window.innerWidth <= 760;
      map.fitBounds(L.geoJSON(f).getBounds(), { paddingTopLeft: [40, 85], paddingBottomRight: mobile ? [40, 80] : [340, 65], maxZoom: 16, animate: false });
    }
    $('filters').classList.remove('open'); $('filters-toggle').setAttribute('aria-expanded', 'false');
    setTimeout(() => map.invalidateSize(), 0);
  }
  function detailShell(icon, type, title, address, body) {
    $('detail').innerHTML = `<button class="close" id="detail-close" aria-label="Cerrar ficha">×</button><div class="detail-icon" aria-hidden="true">${icon}</div><div class="eyebrow">${type}</div><h2>${e(title)}</h2><p class="detail-address">${e(address)}</p>${body}`;
    $('detail').hidden = false;
    $('detail-close').addEventListener('click', closeDetail);
  }
  function detailStat(value, label) { return `<div class="detail-stat"><strong>${value}</strong><small>${label}</small></div>`; }
  function row(label, value) { return `<div><dt>${label}</dt><dd>${value}</dd></div>`; }
  function showSchool(p) {
    currentDetail = { type: 'school', id: p.school_id };
    const body = `<div class="detail-stats">${detailStat(pct(p.obesity_prevalence_pct), 'Obesidad escolar')}${detailStat(fmt(p.mean_peadc_score, 1), 'Media PEADC · 0–40')}</div>
      <h3>El entorno completo de la escuela</h3><dl>${row('Locales asignados en el estudio', fmt(p.assigned_stores_count))}${row('Con promoción calórica', `${p.positive_peadc_count} / ${p.promotion_observations_count} · ${pct(p.positive_peadc_pct)}`)}${row('No saludables según IDAS', `${p.unhealthy_observed_count} / ${p.nems_observations_count} · ${pct(p.unhealthy_observed_pct)}`)}${row('Media IDAS · 0–49', fmt(p.mean_nems_score, 1))}${row('Local no saludable más cercano¹', p.nearest_unhealthy_observed_route_m == null ? 'Sin dato' : `${fmt(p.nearest_unhealthy_observed_route_m)} m`)}</dl>
      <h3>Escuela y barrio</h3><dl>${row('Distrito', e(H.districts[p.district_id]))}${row('Titularidad', p.school_type === 'public' ? 'Pública' : 'Concertada')}${row('Renta familiar · BCN = 100', fmt(p.school_rfd_index, 1))}${row('Habitantes/km² · 2016', fmt(p.school_population_density_per_km2))}${row('Exceso de peso²', pct(p.excess_weight_prevalence_pct))}</dl>
      <p class="note">¹ Distancia caminable entre los comercios evaluados; no cubre todo el universo.<br>² Sobrepeso y obesidad. Enlace reconstruido de la tabla 9 por distrito y media PEADC.${p.table9_school_type_conflict ? ' La titularidad de esa fila discrepa de Stata y del directorio oficial.' : ''}</p>
      <p class="note">Círculo de 400 m reconstruido, no delimitación original. Los locales siguen asignados según el estudio. Las prevalencias son agregadas; no hay datos individuales.</p>`;
    detailShell('🏫', 'ESCUELA DEL ESTUDIO', p.official_name, p.address, body);
  }
  function showStore(p) {
    currentDetail = { type: 'store', id: p.store_id };
    const school = schoolById.get(p.school_id), nutrition = nutritionById.get(p.store_id), promotion = promotionById.get(p.store_id);
    let body = `<span class="badge">${e(H.storeType(p)[1])}</span><div class="detail-stats">${detailStat(fmt(p.peadc_score, 0), 'Promoción PEADC · 0–40')}${detailStat(fmt(p.nems_score, 0), 'Oferta IDAS/NEMS · 0–49')}</div>`;
    if (nutrition) {
      body += `<h3>Oferta evaluada</h3><dl>${row('Clasificación publicada', p.nems_published_class === 'healthy' ? 'Saludable' : 'No saludable')}${row('Disponibilidad · 0–37', fmt(nutrition.availability_score))}${row('Precio · 0–12', fmt(nutrition.price_score))}</dl>`;
      if (p.nems_threshold_conflict) body += '<p class="note">Caso discrepante: 36 puntos, clasificado como saludable en la base. Aplicando literalmente el umbral escrito (≤36), sería no saludable.</p>';
    }
    if (promotion) {
      const items = [['promotional_furniture', 'Mobiliario'], ['external_food_display', 'Exposición exterior'], ['internal_food_display', 'Exposición interior'], ['brand_signage', 'Rótulos de marca'], ['discount_advertising', 'Descuentos'], ['other_brand_elements', 'Otros elementos de marca']];
      body += `<h3>Elementos de promoción</h3><div class="detail-items">${items.map(([key, label]) => `<span class="${promotion[key] ? '' : 'absent'}">${promotion[key] ? '✓' : '–'} ${label}</span>`).join('')}</div>`;
    }
    if (!promotion && !nutrition) body += '<p class="note">Local censado del universo del estudio. Sin evaluación PEADC o IDAS disponible; la ausencia de evaluación no equivale a cero.</p>';
    body += `<h3>Ubicación y relación</h3><dl>${row('Barrio del local', e(p.neighborhood_name))}${row('Distancia caminable a la escuela', p.route_distance_m == null ? 'Sin dato' : `${fmt(p.route_distance_m)} m`)}${row('Tiempo caminable', p.walk_time_minutes == null ? 'Sin dato' : `${fmt(p.walk_time_minutes, 1)} min`)}${row('Distancia directa reconstruida', p.straight_distance_rebuilt_m == null ? 'Sin dato' : `${fmt(p.straight_distance_rebuilt_m)} m`)}</dl><h3>Escuela asignada</h3><button class="detail-link" id="detail-school">🏫 ${e(school.official_name)} ↗</button><p class="note">Datos históricos: el nombre, la actividad o la existencia actual del local pueden haber cambiado.</p>`;
    detailShell(H.storeType(p)[0], `LOCAL · ${p.store_id}`, p.name || 'Local sin nombre', p.address || 'Dirección no disponible', body);
    $('detail-school').addEventListener('click', () => selectSchool(p.school_id));
  }
  function showNeighborhood(p) {
    currentDetail = { type: 'neighborhood', id: p.neighborhood_id };
    const body = p.has_study_context ? `<div class="detail-stats">${detailStat(fmt(p.rfd_index, 1), 'Renta · Barcelona = 100')}${detailStat(fmt(p.population_density_per_km2), 'Habitantes/km²')}</div><h3>Cobertura del estudio</h3><dl>${row('Población · 2016', fmt(p.population))}${row('Escuelas estudiadas', fmt(p.study_schools_count))}${row('Locales del estudio en el barrio', fmt(p.study_assigned_stores_count))}${row('Observaciones PEADC', fmt(p.promotion_observations_count))}${row('Evaluaciones IDAS', fmt(p.nems_observations_count))}</dl><p class="note">Contexto histórico de 2016. Los recuentos solo cubren locales asignados a las escuelas estudiadas, no todos los locales del barrio. No cambian con los filtros.</p>` : '<p class="note">Este barrio no tiene indicadores históricos en las fuentes de la tesis. El gris significa «sin datos del estudio»; no renta cero ni ausencia de comercios.</p>';
    detailShell('🗺️', 'BARRIO · CONTEXTO HISTÓRICO', p.name, 'Barcelona', body);
  }
  function closeDetail() { $('detail').hidden = true; currentDetail = null; }
  $('school-list').addEventListener('click', event => { const button = event.target.closest('[data-school]'); if (button) selectSchool(button.dataset.school); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view; state.result = '';
    updateResultOptions(); update();
  }));
  ['district', 'sector', 'result', 'context', 'buffers'].forEach(id => $(id).addEventListener('change', () => {
    state[id] = id === 'buffers' ? $(id).checked : $(id).value;
    if (id === 'district') { state.school = ''; $('school').value = ''; closeDetail(); }
    update(); if (id === 'district') fitSelection();
  }));
  $('school').addEventListener('change', () => {
    if ($('school').value) selectSchool($('school').value);
    else { state.school = ''; closeDetail(); update(); fitSelection(); }
  });
  $('reset').addEventListener('click', () => {
    Object.assign(state, { school: '', district: '', sector: '', result: '', context: 'none', buffers: false });
    ['school', 'district', 'sector'].forEach(id => { $(id).value = ''; });
    $('context').value = 'none'; $('buffers').checked = false;
    closeDetail(); updateResultOptions(); update(); fitSelection();
  });
  $('fit').addEventListener('click', fitSelection);
  map.on('zoomend', renderStores);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); });
  $('filters-toggle').addEventListener('click', () => {
    const open = $('filters').classList.toggle('open'); $('filters-toggle').setAttribute('aria-expanded', String(open));
    setTimeout(() => map.invalidateSize(), 0);
  });
  new ResizeObserver(() => map.invalidateSize()).observe($('map'));
  $('about-button').addEventListener('click', () => $('about-dialog').showModal());
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
  function renderComparison() {
    const x = n => 66 + n / 40 * 580, y = n => 300 - n / 45 * 255;
    let chart = '<svg viewBox="0 0 720 370" role="group" aria-label="Promoción media PEADC y prevalencia de obesidad por escuela">';
    for (let n = 0; n <= 40; n += 10) chart += `<line x1="66" y1="${y(n)}" x2="646" y2="${y(n)}" stroke="#2b373e"/><text x="54" y="${y(n) + 4}" text-anchor="end" class="chart-label">${n} %</text>`;
    for (let n = 0; n <= 40; n += 10) chart += `<text x="${x(n)}" y="322" text-anchor="middle" class="chart-label">${n}</text>`;
    chart += '<text x="66" y="25" class="chart-label">Obesidad escolar (%)</text><text x="356" y="351" text-anchor="middle" class="chart-label">Promoción media · PEADC (0–40)</text>';
    schools.forEach(p => { if (p.mean_peadc_score != null && p.obesity_prevalence_pct != null) chart += `<g class="plot-point" data-chart-school="${e(p.school_id)}" tabindex="0" role="button" aria-label="${e(p.official_name)}, PEADC ${fmt(p.mean_peadc_score, 1)}, obesidad ${pct(p.obesity_prevalence_pct)}"><title>${e(p.official_name)} · PEADC ${fmt(p.mean_peadc_score, 1)} · Obesidad ${pct(p.obesity_prevalence_pct)}</title><circle cx="${x(p.mean_peadc_score)}" cy="${y(p.obesity_prevalence_pct)}" r="10" fill="transparent"/><circle cx="${x(p.mean_peadc_score)}" cy="${y(p.obesity_prevalence_pct)}" r="6" fill="${p.school_type === 'public' ? H.colors.mint : H.colors.yellow}" fill-opacity=".9"/></g>`; });
    chart += '</svg>';
    $('comparison-chart').innerHTML = `<div class="chart-key">${legendItem(H.colors.mint, 'Pública')}${legendItem(H.colors.yellow, 'Concertada')}</div>${chart}<div class="chart-tooltip" id="chart-tooltip" aria-live="polite">Pasa sobre un punto para consultar su escuela.</div>`;
    $('comparison-chart').querySelectorAll('[data-chart-school]').forEach(point => {
      const p = schoolById.get(point.dataset.chartSchool);
      const describe = () => { $('chart-tooltip').textContent = `${p.official_name} · PEADC ${fmt(p.mean_peadc_score, 1)} · Obesidad ${pct(p.obesity_prevalence_pct)}`; };
      const choose = () => { $('compare-dialog').close(); selectSchool(p.school_id); };
      point.addEventListener('mouseenter', describe); point.addEventListener('focus', describe); point.addEventListener('click', choose);
      point.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    });
  }
  $('compare-button').addEventListener('click', () => { renderComparison(); $('compare-dialog').showModal(); });
  $('download').addEventListener('click', () => {
    const isSchool = state.view === 'schools';
    const columns = isSchool ? [['school_id', 'ID escuela'], ['official_name', 'Escuela'], ['obesity_prevalence_pct', 'Obesidad (%)'], ['excess_weight_prevalence_pct', 'Exceso de peso (%) — enlace reconstruido'], ['mean_peadc_score', 'Media PEADC (0–40)'], ['nems_observations_count', 'Comercios evaluados IDAS'], ['promotion_observations_count', 'Locales observados PEADC'], ['school_rfd_index', 'Renta 2016 (Barcelona=100)'], ['latitude', 'Latitud'], ['longitude', 'Longitud']] : [['store_id', 'ID local'], ['name', 'Nombre histórico'], ['address', 'Dirección'], ['school_id', 'ID escuela asignada'], ['sector', 'Sector'], ['nems_score', 'IDAS/NEMS (0–49)'], ['nems_published_class', 'Clasificación IDAS publicada'], ['peadc_score', 'PEADC (0–40)'], ['route_distance_m', 'Distancia caminable (m)'], ['has_geometry', 'Ubicación disponible'], ['latitude', 'Latitud'], ['longitude', 'Longitud']];
    const blob = new Blob([H.csv(isSchool ? activeSchools : filtered, columns.map(([key, label]) => ({ key, label })))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `catamap-${state.view}-seleccion.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  updateResultOptions(); update(); fitSelection();
})();
