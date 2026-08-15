const $ = (id) => document.getElementById(id);
const state = { index: null, current: null, compare: null };

const fmtPct = (v) => `${Number(v).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}%`;
const fmtBp = (v) => `${v > 0 ? '+' : ''}${Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 1})} bp${Math.abs(v) === 1 ? '' : 's'}`;
const mean = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0;

function entryFor(date) { return state.index.entries.find(e => e.date === date); }
async function loadSnapshot(date) {
  const entry = entryFor(date);
  if (!entry) throw new Error(`Snapshot não encontrado: ${date}`);
  const r = await fetch(entry.path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Falha ao abrir ${entry.path}`);
  return r.json();
}

function setupDates() {
  const entries = [...state.index.entries].sort((a,b)=>a.date.localeCompare(b.date));
  const current = $('currentDate');
  const compare = $('compareDate');
  for (const e of [...entries].reverse()) {
    current.add(new Option(e.date, e.date));
    compare.add(new Option(e.date, e.date));
  }
  current.value = state.index.latest || entries.at(-1).date;
  const pos = entries.findIndex(e => e.date === current.value);
  compare.value = entries[Math.max(0, pos - 1)].date;
  current.addEventListener('change', render);
  compare.addEventListener('change', render);
}

function pairCurves(current, compare) {
  const previous = new Map(compare.contracts.map(c => [c.ticker, c]));
  return current.contracts
    .filter(c => previous.has(c.ticker))
    .map(c => ({ current: c, previous: previous.get(c.ticker), delta: (c.rate - previous.get(c.ticker).rate) * 10000 }))
    .sort((a,b)=>(a.current.business_days ?? 1e9)-(b.current.business_days ?? 1e9));
}

function buckets(pairs) {
  if (!pairs.length) return {short:[], mid:[], long:[]};
  const n = pairs.length;
  const a = Math.ceil(n/3), b = Math.ceil(2*n/3);
  return { short: pairs.slice(0,a), mid: pairs.slice(a,b), long: pairs.slice(b) };
}

function movementSummary(pairs) {
  const all = pairs.map(p=>p.delta);
  const avg = mean(all);
  const bs = buckets(pairs);
  const largest = [...pairs].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0];
  const threshold = 1;
  let kind = 'neutral', title = 'Curva praticamente estável', pill = 'ESTÁVEL';
  if (avg < -threshold) { kind='close'; title='Fechamento de curva'; pill='↓ FECHAMENTO'; }
  if (avg > threshold) { kind='open'; title='Abertura de curva'; pill='↑ ABERTURA'; }
  return {
    avg, kind, title, pill, largest,
    short: mean(bs.short.map(x=>x.delta)),
    mid: mean(bs.mid.map(x=>x.delta)),
    long: mean(bs.long.map(x=>x.delta)),
  };
}

function describe(m, currentDate, compareDate) {
  if (!m.largest) return 'Não há contratos em comum suficientes para comparar as duas curvas.';
  const region = [
    ['curto prazo', Math.abs(m.short)], ['miolo', Math.abs(m.mid)], ['ponta longa', Math.abs(m.long)]
  ].sort((a,b)=>b[1]-a[1])[0][0];
  const verb = m.avg < -1 ? 'recuaram' : m.avg > 1 ? 'subiram' : 'ficaram próximas da estabilidade';
  const extra = m.largest.delta < 0 ? 'fechamento' : m.largest.delta > 0 ? 'abertura' : 'estabilidade';
  return `De ${compareDate} para ${currentDate}, as taxas dos contratos em comum ${verb}, em média ${fmtBp(m.avg)}. O movimento absoluto mais forte ficou no ${region}; ${m.largest.current.ticker} registrou ${fmtBp(m.largest.delta)}, indicando ${extra} nesse vértice.`;
}

function setMetric(id, value) {
  const el = $(id); el.textContent = fmtBp(value);
  el.className = value < -1 ? 'delta neg' : value > 1 ? 'delta pos' : 'delta flat';
}

function renderReading(pairs, currentDate, compareDate) {
  const m = movementSummary(pairs);
  $('movementTitle').textContent = m.title;
  const pill = $('movementPill'); pill.textContent = m.pill; pill.className = `movementPill ${m.kind}`;
  $('movementText').textContent = describe(m, currentDate, compareDate);
  setMetric('shortMove', m.short); setMetric('midMove', m.mid); setMetric('longMove', m.long);
  $('largestMove').textContent = m.largest ? `${m.largest.current.ticker} ${fmtBp(m.largest.delta)}` : '—';
  $('largestMove').className = m.largest ? (m.largest.delta < -1 ? 'delta neg' : m.largest.delta > 1 ? 'delta pos' : 'delta flat') : '';
}

function renderTable(pairs) {
  $('commonCount').textContent = `${pairs.length} contratos em comum`;
  $('curveTable').innerHTML = pairs.map(p => {
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

function svgEl(name, attrs={}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
  return el;
}
function niceTicks(min, max, count=5) {
  if (min === max) return [min];
  const raw = (max-min)/count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw/p;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  const start = Math.floor(min/step)*step, end = Math.ceil(max/step)*step;
  const out=[]; for(let v=start; v<=end+step*.1; v+=step) out.push(v); return out;
}

function renderChart(current, compare) {
  const host = $('chart'); host.innerHTML='';
  const width = Math.max(720, host.clientWidth || 1000), height = 390;
  const pad = {l:58,r:22,t:22,b:46};
  const all = [...current.contracts, ...compare.contracts].filter(c=>Number.isFinite(c.business_days) && Number.isFinite(c.rate_pct));
  if (!all.length) { host.innerHTML='<div class="error">Sem dados suficientes para o gráfico.</div>'; return; }
  const xMin=Math.min(...all.map(c=>c.business_days)), xMax=Math.max(...all.map(c=>c.business_days));
  const yMin=Math.min(...all.map(c=>c.rate_pct))-.08, yMax=Math.max(...all.map(c=>c.rate_pct))+.08;
  const sx=x=>pad.l+(x-xMin)/(xMax-xMin||1)*(width-pad.l-pad.r);
  const sy=y=>height-pad.b-(y-yMin)/(yMax-yMin||1)*(height-pad.t-pad.b);
  const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,role:'img'});

  for (const y of niceTicks(yMin,yMax,5)) {
    const yy=sy(y); svg.append(svgEl('line',{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:'grid'}));
    const t=svgEl('text',{x:pad.l-10,y:yy+4,'text-anchor':'end'}); t.textContent=`${y.toFixed(2)}%`; svg.append(t);
  }
  const xTicks=5; for(let i=0;i<=xTicks;i++) {
    const x=xMin+(xMax-xMin)*i/xTicks, xx=sx(x);
    svg.append(svgEl('line',{x1:xx,x2:xx,y1:pad.t,y2:height-pad.b,class:'grid'}));
    const t=svgEl('text',{x:xx,y:height-18,'text-anchor':'middle'}); t.textContent=`${Math.round(x)} DU`; svg.append(t);
  }
  svg.append(svgEl('line',{x1:pad.l,x2:width-pad.r,y1:height-pad.b,y2:height-pad.b,class:'axis'}));

  const plot=(contracts,lineClass,pointClass)=>{
    const pts=contracts.filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct)).sort((a,b)=>a.business_days-b.business_days);
    if(!pts.length) return;
    const d=pts.map((p,i)=>`${i?'L':'M'} ${sx(p.business_days)} ${sy(p.rate_pct)}`).join(' ');
    svg.append(svgEl('path',{d,class:lineClass}));
    for(const p of pts){
      const c=svgEl('circle',{cx:sx(p.business_days),cy:sy(p.rate_pct),r:4.5,class:pointClass});
      const title=svgEl('title'); title.textContent=`${p.ticker}: ${fmtPct(p.rate_pct)} · ${p.business_days} DU`; c.append(title); svg.append(c);
    }
  };
  plot(compare.contracts,'prevLine','prevPoint'); plot(current.contracts,'currentLine','currentPoint');
  host.append(svg);
}

async function render() {
  try {
    const currentDate=$('currentDate').value, compareDate=$('compareDate').value;
    const [current, compare]=await Promise.all([loadSnapshot(currentDate),loadSnapshot(compareDate)]);
    state.current=current; state.compare=compare;
    const pairs=pairCurves(current,compare);
    renderReading(pairs,currentDate,compareDate); renderTable(pairs); renderChart(current,compare);
    $('legend').innerHTML=`<span><i></i>${currentDate}</span><span class="prev"><i></i>${compareDate}</span>`;
  } catch (err) {
    console.error(err); $('chart').innerHTML=`<div class="error">${err.message}</div>`;
  }
}

async function boot() {
  try {
    const r=await fetch('data/index.json',{cache:'no-store'}); if(!r.ok) throw new Error('Não foi possível carregar data/index.json');
    state.index=await r.json();
    const badge=$('modeBadge'); badge.textContent=state.index.mode==='live'?'B3 · LIVE':'DEMO'; badge.className=`badge ${state.index.mode==='live'?'live':'demo'}`;
    $('sourceText').textContent=state.index.source;
    setupDates(); await render();
  } catch(err) {
    document.querySelector('main').insertAdjacentHTML('afterbegin',`<div class="panel error">${err.message}</div>`);
  }
}

window.addEventListener('resize',()=>{ if(state.current&&state.compare) renderChart(state.current,state.compare); });
boot();
