const $ = (id) => document.getElementById(id);

const state = {
  index: null,
  current: null,
  compare: null,
  pairs: [],
  showAllContracts: false,
  activePreset: '1d',
  evolutionActive: new Set(),
  snapshotCache: {},
};

const DAY_MS = 86400000;
const EVOLUTION_PRESETS = [
  { key: '5d', label: '1 semana' },
  { key: '1m', label: '1 mês' },
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '1y', label: '1 ano' },
];
const EVOLUTION_DEFAULTS = ['5d', '1m', '3m', '6m'];
const EVOLUTION_COLORS = ['#69b7ff', '#ffb86b', '#7de2d1', '#ff7b87', '#c4a7ff', '#9de266'];

const fmtPct = (v) =>
  `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;

const fmtBp = (v) => {
  if (!Number.isFinite(v)) return '—';
  const rounded = Math.abs(v) < 0.05 ? 0 : v;
  return `${rounded > 0 ? '+' : ''}${Number(rounded).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bp${Math.abs(rounded) === 1 ? '' : 's'}`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoUTC(date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  const d = parseISO(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return isoUTC(d);
}

function addYears(iso, years) {
  const d = parseISO(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return isoUTC(d);
}

function calendarDayDiff(a, b) {
  return Math.round((parseISO(a) - parseISO(b)) / DAY_MS);
}

function entryFor(date) {
  return state.index.entries.find((e) => e.date === date);
}

function sortedEntries() {
  return [...state.index.entries].sort((a, b) => a.date.localeCompare(b.date));
}

async function loadSnapshot(date) {
  if (state.snapshotCache[date]) return state.snapshotCache[date];
  const entry = entryFor(date);
  if (!entry) throw new Error(`Snapshot não encontrado: ${date}`);

  const promise = fetch(entry.path, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`Falha ao abrir ${entry.path}`);
    return r.json();
  });

  state.snapshotCache[date] = promise;
  return promise;
}

function closestOnOrBefore(target, beforeDate = null) {
  const entries = sortedEntries().filter((e) => !beforeDate || e.date < beforeDate);
  const candidates = entries.filter((e) => e.date <= target);
  return candidates.length ? candidates.at(-1).date : null;
}

function resolvePreset(preset, currentDate) {
  const entries = sortedEntries();
  const pos = entries.findIndex((e) => e.date === currentDate);
  if (pos <= 0) return null;

  if (preset === '1d') return entries[pos - 1]?.date ?? null;
  if (preset === '5d') return entries[pos - 5]?.date ?? null;

  let target = null;
  if (preset === '1m') target = addMonths(currentDate, -1);
  if (preset === '3m') target = addMonths(currentDate, -3);
  if (preset === '6m') target = addMonths(currentDate, -6);
  if (preset === '1y') target = addYears(currentDate, -1);

  return target ? closestOnOrBefore(target, currentDate) : null;
}

function updatePresetAvailability() {
  const currentDate = $('currentDate').value;
  document.querySelectorAll('[data-preset]').forEach((button) => {
    const target = resolvePreset(button.dataset.preset, currentDate);
    button.disabled = !target;
    button.title = target ? `Comparar com ${fmtDate(target)}` : 'Histórico ainda insuficiente para este atalho';
    button.classList.toggle('active', !!target && $('compareDate').value === target);
  });
}

function syncEvolutionSelection(currentDate) {
  const available = new Set(
    EVOLUTION_PRESETS
      .map((item) => [item.key, resolvePreset(item.key, currentDate)])
      .filter(([, date]) => !!date)
      .map(([key]) => key)
  );

  for (const key of [...state.evolutionActive]) {
    if (!available.has(key)) state.evolutionActive.delete(key);
  }

  if (!state.evolutionActive.size) {
    for (const key of EVOLUTION_DEFAULTS) {
      if (available.has(key)) state.evolutionActive.add(key);
    }
  }
}

function updateEvolutionAvailability() {
  const currentDate = $('currentDate').value;
  syncEvolutionSelection(currentDate);

  document.querySelectorAll('[data-evo]').forEach((button) => {
    const key = button.dataset.evo;
    const target = resolvePreset(key, currentDate);
    button.disabled = !target;
    button.title = target ? `Mostrar curva de ${fmtDate(target)}` : 'Histórico ainda insuficiente para esta janela';
    button.classList.toggle('active', state.evolutionActive.has(key));
  });
}

function updateCompareOptions() {
  const currentDate = $('currentDate').value;
  [...$('compareDate').options].forEach((option) => {
    option.disabled = option.value >= currentDate;
  });
}

function applyPreset(preset, shouldRender = true) {
  const currentDate = $('currentDate').value;
  const target = resolvePreset(preset, currentDate);
  if (!target) return false;

  $('compareDate').value = target;
  state.activePreset = preset;
  updatePresetAvailability();
  if (shouldRender) render();
  return true;
}

function setupDates() {
  const entries = sortedEntries();
  const current = $('currentDate');
  const compare = $('compareDate');

  for (const e of [...entries].reverse()) {
    const label = fmtDate(e.date);
    current.add(new Option(label, e.date));
    compare.add(new Option(label, e.date));
  }

  current.value = state.index.latest || entries.at(-1).date;
  updateCompareOptions();

  if (!applyPreset('1d', false)) {
    const pos = entries.findIndex((e) => e.date === current.value);
    compare.value = entries[Math.max(0, pos - 1)].date;
  }

  syncEvolutionSelection(current.value);

  current.addEventListener('change', () => {
    updateCompareOptions();
    applyPreset('1d', false);
    state.showAllContracts = false;
    updatePresetAvailability();
    updateEvolutionAvailability();
    render();
  });

  compare.addEventListener('change', () => {
    state.activePreset = null;
    updatePresetAvailability();
    render();
  });

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset));
  });

  document.querySelectorAll('[data-evo]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.evo;
      if (button.disabled) return;
      if (state.evolutionActive.has(key)) {
        state.evolutionActive.delete(key);
      } else {
        state.evolutionActive.add(key);
      }
      updateEvolutionAvailability();
      render();
    });
  });

  $('toggleTable').addEventListener('click', () => {
    state.showAllContracts = !state.showAllContracts;
    renderTable(state.pairs);
  });

  updatePresetAvailability();
  updateEvolutionAvailability();
}

function pairCurves(current, compare) {
  const previous = new Map(compare.contracts.map((c) => [c.ticker, c]));
  return current.contracts
    .filter((c) => previous.has(c.ticker))
    .map((c) => ({
      current: c,
      previous: previous.get(c.ticker),
      delta: (c.rate - previous.get(c.ticker).rate) * 10000,
    }))
    .sort((a, b) =>
      (a.current.business_days ?? 1e9) - (b.current.business_days ?? 1e9)
    );
}

function bucketName(du) {
  if (!Number.isFinite(du)) return null;
  if (du <= 252) return 'short';
  if (du <= 756) return 'mid';
  return 'long';
}

function buckets(pairs) {
  const out = { short: [], mid: [], long: [] };
  for (const pair of pairs) {
    const key = bucketName(pair.current.business_days);
    if (key) out[key].push(pair);
  }
  return out;
}

function regionLabel(key) {
  return { short: 'curto', mid: 'miolo da curva', long: 'ponta longa' }[key] || key;
}

function direction(value, threshold = 1) {
  if (!Number.isFinite(value)) return 'sem dados';
  if (value > threshold) return 'abertura';
  if (value < -threshold) return 'fechamento';
  return 'estabilidade';
}

function movementSummary(pairs) {
  const all = pairs.map((p) => p.delta);
  const avg = mean(all);
  const bs = buckets(pairs);
  const largest = [...pairs].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

  const short = mean(bs.short.map((x) => x.delta));
  const mid = mean(bs.mid.map((x) => x.delta));
  const long = mean(bs.long.map((x) => x.delta));

  const regionValues = [
    ['short', short],
    ['mid', mid],
    ['long', long],
  ].filter(([, v]) => Number.isFinite(v));

  const strongestRegion = regionValues
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] || [null, NaN];

  const threshold = 1;
  let kind = 'neutral';
  let title = 'Curva praticamente estável';
  let pill = 'ESTÁVEL';

  if (avg < -threshold) {
    kind = 'close';
    title = 'Fechamento de curva';
    pill = '↓ FECHAMENTO';
  }
  if (avg > threshold) {
    kind = 'open';
    title = 'Abertura de curva';
    pill = '↑ ABERTURA';
  }

  return {
    avg, kind, title, pill, largest,
    short, mid, long,
    strongestRegion: strongestRegion[0],
    strongestValue: strongestRegion[1],
  };
}

function movementPhrase(value) {
  if (!Number.isFinite(value)) return 'sem dados';
  const abs = Math.abs(value);
  if (value > 1) return `abriu ${fmtBp(abs).replace('+', '')}`;
  if (value < -1) return `fechou ${fmtBp(abs).replace('+', '')}`;
  return `ficou praticamente estável (${fmtBp(value)})`;
}

function describe(m, currentDate, compareDate) {
  if (!m.largest) return 'Não há contratos em comum suficientes para comparar as duas curvas.';

  const overall =
    m.avg > 1
      ? `as taxas subiram, em média, ${fmtBp(m.avg)}`
      : m.avg < -1
        ? `as taxas recuaram, em média, ${fmtBp(Math.abs(m.avg)).replace('+', '')}`
        : `as taxas ficaram próximas da estabilidade, com movimento médio de ${fmtBp(m.avg)}`;

  const parts = [
    Number.isFinite(m.short) ? `o curto ${movementPhrase(m.short)}` : null,
    Number.isFinite(m.mid) ? `o miolo ${movementPhrase(m.mid)}` : null,
    Number.isFinite(m.long) ? `a ponta longa ${movementPhrase(m.long)}` : null,
  ].filter(Boolean);

  const regionSentence = parts.length ? ` Por faixa, ${parts.join('; ')}.` : '';
  const concentration = m.strongestRegion
    ? ` O movimento foi mais intenso ${m.strongestRegion === 'long' ? 'na' : 'no'} ${regionLabel(m.strongestRegion)}.`
    : '';

  const largestDirection =
    m.largest.delta > 1
      ? `abertura de ${fmtBp(Math.abs(m.largest.delta)).replace('+', '')}`
      : m.largest.delta < -1
        ? `fechamento de ${fmtBp(Math.abs(m.largest.delta)).replace('+', '')}`
        : `movimento de ${fmtBp(m.largest.delta)}`;

  return `De ${fmtDate(compareDate)} para ${fmtDate(currentDate)}, ${overall}.${regionSentence}${concentration} O maior movimento individual foi no ${m.largest.current.ticker}, com ${largestDirection}.`;
}

function setMetric(id, value) {
  const el = $(id);
  el.textContent = fmtBp(value);
  el.className = !Number.isFinite(value)
    ? 'delta flat'
    : value < -1
      ? 'delta neg'
      : value > 1
        ? 'delta pos'
        : 'delta flat';
}

function renderReading(pairs, currentDate, compareDate) {
  const m = movementSummary(pairs);
  $('movementTitle').textContent = m.title;
  const pill = $('movementPill');
  pill.textContent = m.pill;
  pill.className = `movementPill ${m.kind}`;
  $('movementText').textContent = describe(m, currentDate, compareDate);

  setMetric('shortMove', m.short);
  setMetric('midMove', m.mid);
  setMetric('longMove', m.long);

  $('largestMove').textContent = m.largest
    ? `${m.largest.current.ticker} ${fmtBp(m.largest.delta)}`
    : '—';
  $('largestMove').className = m.largest
    ? (m.largest.delta < -1 ? 'delta neg' : m.largest.delta > 1 ? 'delta pos' : 'delta flat')
    : '';

  const days = Math.abs(calendarDayDiff(currentDate, compareDate));
  $('periodLabel').textContent = `${fmtDate(compareDate)} → ${fmtDate(currentDate)} · ${days} dia${days === 1 ? '' : 's'} corridos`;
}

function isJanuaryContract(pair) {
  const ticker = pair.current.ticker || '';
  const maturity = pair.current.maturity || '';
  return /^DI1F\d{2}$/.test(ticker) || maturity.slice(5, 7) === '01';
}

function januaryPairs(pairs) {
  return pairs.filter(isJanuaryContract);
}

function renderJanuary(pairs) {
  const jan = januaryPairs(pairs);
  $('januaryCount').textContent = `${jan.length} vértices`;
  $('januaryGrid').innerHTML = jan.map((p) => {
    const cls = p.delta < -1 ? 'neg' : p.delta > 1 ? 'pos' : 'flat';
    const year = p.current.maturity?.slice(0, 4) || p.current.ticker;
    return `<article class="vertexCard">
      <div class="vertexTop">
        <span>${year}</span>
        <small>${p.current.ticker}</small>
      </div>
      <strong>${fmtPct(p.current.rate_pct)}</strong>
      <div class="vertexBottom">
        <span>${p.current.business_days ?? '—'} DU</span>
        <span class="delta ${cls}">${fmtBp(p.delta)}</span>
      </div>
    </article>`;
  }).join('');
}

function renderTable(pairs) {
  const jan = januaryPairs(pairs);
  const displayPairs = state.showAllContracts ? pairs : jan;
  $('commonCount').textContent = state.showAllContracts
    ? `${pairs.length} contratos em comum`
    : `${jan.length} contratos de janeiro`;

  $('toggleTable').textContent = state.showAllContracts
    ? 'Mostrar apenas janeiro'
    : `Ver todos os ${pairs.length} contratos`;

  $('tableModeText').textContent = state.showAllContracts
    ? 'Exibindo todos os contratos em comum nas duas datas.'
    : 'Exibindo inicialmente os contratos de janeiro.';

  $('curveTable').innerHTML = displayPairs.map((p) => {
    const d = p.delta < -1 ? 'neg' : p.delta > 1 ? 'pos' : 'flat';
    return `<tr>
      <td><strong>${p.current.ticker}</strong></td>
      <td>${p.current.maturity}</td>
      <td>${p.current.business_days ?? '—'}</td>
      <td>${fmtPct(p.current.rate_pct)}</td>
      <td>${fmtPct(p.previous.rate_pct)}</td>
      <td class="delta ${d}">${fmtBp(p.delta)}</td>
    </tr>`;
  }).join('');
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function niceTicks(min, max, count = 5) {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out = [];
  for (let v = start; v <= end + step * .1; v += step) out.push(v);
  return out;
}

function buildChartScales(seriesList, host, height = 390) {
  const pad = { l: 58, r: 22, t: 22, b: 46 };
  const width = Math.max(720, host.clientWidth || 1000);
  const all = seriesList.flatMap((s) => s.contracts || [])
    .filter((c) => Number.isFinite(c.business_days) && Number.isFinite(c.rate_pct));

  if (!all.length) return null;

  const xMin = Math.min(...all.map((c) => c.business_days));
  const xMax = Math.max(...all.map((c) => c.business_days));
  const yMin = Math.min(...all.map((c) => c.rate_pct)) - .08;
  const yMax = Math.max(...all.map((c) => c.rate_pct)) + .08;

  const sx = (x) => pad.l + (x - xMin) / (xMax - xMin || 1) * (width - pad.l - pad.r);
  const sy = (y) => height - pad.b - (y - yMin) / (yMax - yMin || 1) * (height - pad.t - pad.b);

  return { width, height, pad, xMin, xMax, yMin, yMax, sx, sy };
}

function renderAxes(svg, scales) {
  const { width, height, pad, xMin, xMax, yMin, yMax, sx, sy } = scales;

  for (const y of niceTicks(yMin, yMax, 5)) {
    const yy = sy(y);
    svg.append(svgEl('line', { x1: pad.l, x2: width - pad.r, y1: yy, y2: yy, class: 'grid' }));
    const t = svgEl('text', { x: pad.l - 10, y: yy + 4, 'text-anchor': 'end' });
    t.textContent = `${y.toFixed(2)}%`;
    svg.append(t);
  }

  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const x = xMin + (xMax - xMin) * i / xTicks;
    const xx = sx(x);
    svg.append(svgEl('line', { x1: xx, x2: xx, y1: pad.t, y2: height - pad.b, class: 'grid' }));
    const t = svgEl('text', { x: xx, y: height - 18, 'text-anchor': 'middle' });
    t.textContent = `${Math.round(x)} DU`;
    svg.append(t);
  }

  svg.append(svgEl('line', {
    x1: pad.l, x2: width - pad.r,
    y1: height - pad.b, y2: height - pad.b,
    class: 'axis'
  }));
}

function plotSeries(svg, contracts, scales, options = {}) {
  const pts = contracts
    .filter((c) => Number.isFinite(c.business_days) && Number.isFinite(c.rate_pct))
    .sort((a, b) => a.business_days - b.business_days);

  if (!pts.length) return;

  const { sx, sy } = scales;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.business_days)} ${sy(p.rate_pct)}`).join(' ');
  const path = svgEl('path', { d, class: options.className || 'seriesLine' });
  if (options.stroke) path.setAttribute('stroke', options.stroke);
  if (options.strokeWidth) path.setAttribute('stroke-width', options.strokeWidth);
  if (options.dasharray) path.setAttribute('stroke-dasharray', options.dasharray);
  if (options.opacity) path.setAttribute('opacity', options.opacity);
  svg.append(path);

  if (options.showPoints) {
    for (const p of pts) {
      const c = svgEl('circle', {
        cx: sx(p.business_days),
        cy: sy(p.rate_pct),
        r: options.pointRadius || 4.5,
        class: options.pointClass || 'seriesPoint'
      });
      if (options.stroke) c.setAttribute('fill', options.stroke);
      const title = svgEl('title');
      title.textContent = `${p.ticker}: ${fmtPct(p.rate_pct)} · ${p.business_days} DU`;
      c.append(title);
      svg.append(c);
    }
  }
}

function renderChart(current, compare) {
  const host = $('chart');
  host.innerHTML = '';
  const scales = buildChartScales([{ contracts: current.contracts }, { contracts: compare.contracts }], host);
  if (!scales) {
    host.innerHTML = '<div class="error">Sem dados suficientes para o gráfico.</div>';
    return;
  }

  const svg = svgEl('svg', { viewBox: `0 0 ${scales.width} ${scales.height}`, role: 'img' });
  renderAxes(svg, scales);
  plotSeries(svg, compare.contracts, scales, {
    className: 'prevLine',
    stroke: '#7a8798',
    strokeWidth: 2,
    dasharray: '5 6',
    showPoints: true,
    pointClass: 'prevPoint',
    pointRadius: 4.5
  });
  plotSeries(svg, current.contracts, scales, {
    className: 'currentLine',
    stroke: '#69b7ff',
    strokeWidth: 3,
    showPoints: true,
    pointClass: 'currentPoint',
    pointRadius: 4.5
  });

  host.append(svg);
}

async function buildEvolutionSeries(currentDate) {
  const currentSnapshot = await loadSnapshot(currentDate);
  const series = [{
    key: 'current',
    label: 'Hoje',
    date: currentDate,
    color: EVOLUTION_COLORS[0],
    current: true,
    contracts: currentSnapshot.contracts
  }];

  const activeConfigs = EVOLUTION_PRESETS.filter((item) => state.evolutionActive.has(item.key));
  const loaded = await Promise.all(activeConfigs.map(async (item, idx) => {
    const date = resolvePreset(item.key, currentDate);
    if (!date) return null;
    const snap = await loadSnapshot(date);
    return {
      key: item.key,
      label: item.label,
      date,
      color: EVOLUTION_COLORS[idx + 1] || EVOLUTION_COLORS[0],
      current: false,
      contracts: snap.contracts
    };
  }));

  return series.concat(loaded.filter(Boolean));
}

function renderEvolutionLegend(series) {
  $('evolutionLegend').innerHTML = series.map((item) =>
    `<span><i class="legendLine" style="background:${item.color}"></i><strong>${item.label}</strong> ${fmtDate(item.date)}</span>`
  ).join('');
  $('evolutionCount').textContent = `${series.length} curva${series.length === 1 ? '' : 's'} no gráfico`;
}

function renderEvolutionChart(series) {
  const host = $('evolutionChart');
  host.innerHTML = '';
  const scales = buildChartScales(series, host);
  if (!scales) {
    host.innerHTML = '<div class="error">Sem dados suficientes para o gráfico histórico.</div>';
    return;
  }

  const svg = svgEl('svg', { viewBox: `0 0 ${scales.width} ${scales.height}`, role: 'img' });
  renderAxes(svg, scales);

  series.forEach((item, idx) => {
    plotSeries(svg, item.contracts, scales, {
      className: item.current ? 'seriesLine current' : 'seriesLine',
      stroke: item.color,
      strokeWidth: item.current ? 3.4 : 2.25,
      opacity: item.current ? 1 : 0.95,
      showPoints: false
    });
  });

  host.append(svg);
  renderEvolutionLegend(series);
}

async function render() {
  try {
    const currentDate = $('currentDate').value;
    const compareDate = $('compareDate').value;

    if (!compareDate || compareDate >= currentDate) {
      throw new Error('Escolha uma data de comparação anterior à curva atual.');
    }

    const [current, compare, evolutionSeries] = await Promise.all([
      loadSnapshot(currentDate),
      loadSnapshot(compareDate),
      buildEvolutionSeries(currentDate)
    ]);

    state.current = current;
    state.compare = compare;
    const pairs = pairCurves(current, compare);
    state.pairs = pairs;

    renderReading(pairs, currentDate, compareDate);
    renderJanuary(pairs);
    renderTable(pairs);
    renderChart(current, compare);
    renderEvolutionChart(evolutionSeries);

    $('legend').innerHTML =
      `<span><i></i>${fmtDate(currentDate)}</span><span class="prev"><i></i>${fmtDate(compareDate)}</span>`;

    updatePresetAvailability();
    updateEvolutionAvailability();
  } catch (err) {
    console.error(err);
    $('chart').innerHTML = `<div class="error">${err.message}</div>`;
    $('evolutionChart').innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function boot() {
  try {
    const r = await fetch('data/index.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Não foi possível carregar data/index.json');

    state.index = await r.json();

    const badge = $('modeBadge');
    badge.textContent = state.index.mode === 'live' ? 'B3 · LIVE' : 'DEMO';
    badge.className = `badge ${state.index.mode === 'live' ? 'live' : 'demo'}`;
    $('sourceText').textContent = state.index.source;

    setupDates();
    await render();
  } catch (err) {
    document.querySelector('main')
      .insertAdjacentHTML('afterbegin', `<div class="panel error">${err.message}</div>`);
  }
}

window.addEventListener('resize', () => {
  if (state.current && state.compare) {
    renderChart(state.current, state.compare);
    buildEvolutionSeries($('currentDate').value).then(renderEvolutionChart).catch(console.error);
  }
});

boot();
