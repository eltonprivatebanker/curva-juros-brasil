const $ = (id) => document.getElementById(id);

const state = {
  index: null,
  current: null,
  compare: null,
  pairs: [],
  showAllContracts: false,
  activePreset: '1d',
};

const DAY_MS = 86400000;

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
  const entry = entryFor(date);
  if (!entry) throw new Error(`Snapshot não encontrado: ${date}`);
  const r = await fetch(entry.path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Falha ao abrir ${entry.path}`);
  return r.json();
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

  current.addEventListener('change', () => {
    updateCompareOptions();
    applyPreset('1d', false);
    state.showAllContracts = false;
    updatePresetAvailability();
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

  $('toggleTable').addEventListener('click', () => {
    state.showAllContracts = !state.showAllContracts;
    renderTable(state.pairs);
  });

  updatePresetAvailability();
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
  return { short: 'curto prazo', mid: 'miolo da curva', long: 'ponta longa' }[key] || key;
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
    counts: {
      short: bs.short.length,
      mid: bs.mid.length,
      long: bs.long.length,
    },
  };
}

function describe(m, currentDate, compareDate) {
  if (!m.largest) return 'Não há contratos em comum suficientes para comparar as duas curvas.';

  const overall = direction(m.avg);
  const regions = [
    ['short', m.short],
    ['mid', m.mid],
    ['long', m.long],
  ].filter(([, v]) => Number.isFinite(v));

  const regionText = regions
    .map(([key, value]) => `${regionLabel(key)} ${direction(value)} ${fmtBp(value)}`)
    .join('; ');

  const absValues = regions.map(([, v]) => Math.abs(v));
  const spread = absValues.length ? Math.max(...absValues) - Math.min(...absValues) : 0;
  const concentration = spread >= 5 && m.strongestRegion
    ? ` O movimento ficou mais concentrado no ${regionLabel(m.strongestRegion)}.`
    : '';

  const largestDirection = direction(m.largest.delta);
  const prefix = overall === 'abertura'
    ? 'As taxas subiram'
    : overall === 'fechamento'
      ? 'As taxas recuaram'
      : 'A curva ficou próxima da estabilidade';

  return `De ${fmtDate(compareDate)} para ${fmtDate(currentDate)}, ${prefix}, em média ${fmtBp(m.avg)}. Por faixa: ${regionText}.${concentration} O maior movimento individual foi ${m.largest.current.ticker}, com ${fmtBp(m.largest.delta)} (${largestDirection}).`;
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

function renderChart(current, compare) {
  const host = $('chart');
  host.innerHTML = '';
  const width = Math.max(720, host.clientWidth || 1000);
  const height = 390;
  const pad = { l: 58, r: 22, t: 22, b: 46 };

  const all = [...current.contracts, ...compare.contracts]
    .filter((c) => Number.isFinite(c.business_days) && Number.isFinite(c.rate_pct));

  if (!all.length) {
    host.innerHTML = '<div class="error">Sem dados suficientes para o gráfico.</div>';
    return;
  }

  const xMin = Math.min(...all.map((c) => c.business_days));
  const xMax = Math.max(...all.map((c) => c.business_days));
  const yMin = Math.min(...all.map((c) => c.rate_pct)) - .08;
  const yMax = Math.max(...all.map((c) => c.rate_pct)) + .08;

  const sx = (x) => pad.l + (x - xMin) / (xMax - xMin || 1) * (width - pad.l - pad.r);
  const sy = (y) => height - pad.b - (y - yMin) / (yMax - yMin || 1) * (height - pad.t - pad.b);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' });

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

  const plot = (contracts, lineClass, pointClass) => {
    const pts = contracts
      .filter((c) => Number.isFinite(c.business_days) && Number.isFinite(c.rate_pct))
      .sort((a, b) => a.business_days - b.business_days);

    if (!pts.length) return;

    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.business_days)} ${sy(p.rate_pct)}`).join(' ');
    svg.append(svgEl('path', { d, class: lineClass }));

    for (const p of pts) {
      const c = svgEl('circle', {
        cx: sx(p.business_days),
        cy: sy(p.rate_pct),
        r: 4.5,
        class: pointClass
      });
      const title = svgEl('title');
      title.textContent = `${p.ticker}: ${fmtPct(p.rate_pct)} · ${p.business_days} DU`;
      c.append(title);
      svg.append(c);
    }
  };

  plot(compare.contracts, 'prevLine', 'prevPoint');
  plot(current.contracts, 'currentLine', 'currentPoint');
  host.append(svg);
}

async function render() {
  try {
    const currentDate = $('currentDate').value;
    const compareDate = $('compareDate').value;

    if (!compareDate || compareDate >= currentDate) {
      throw new Error('Escolha uma data de comparação anterior à curva atual.');
    }

    const [current, compare] = await Promise.all([
      loadSnapshot(currentDate),
      loadSnapshot(compareDate),
    ]);

    state.current = current;
    state.compare = compare;
    const pairs = pairCurves(current, compare);
    state.pairs = pairs;

    renderReading(pairs, currentDate, compareDate);
    renderJanuary(pairs);
    renderTable(pairs);
    renderChart(current, compare);

    $('legend').innerHTML =
      `<span><i></i>${fmtDate(currentDate)}</span><span class="prev"><i></i>${fmtDate(compareDate)}</span>`;

    updatePresetAvailability();
  } catch (err) {
    console.error(err);
    $('chart').innerHTML = `<div class="error">${err.message}</div>`;
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
  if (state.current && state.compare) renderChart(state.current, state.compare);
});

boot();
