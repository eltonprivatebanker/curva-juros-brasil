(() => {
  const $ = id => document.getElementById(id);
  const DAY_MS = 86400000;
  const PRESETS = [
    {key:"5d",label:"1 semana"},
    {key:"1m",label:"1 mês"},
    {key:"3m",label:"3 meses"},
    {key:"6m",label:"6 meses"},
    {key:"1y",label:"1 ano"},
  ];
  const COLORS = ["#69b7ff","#ffb86b","#7de2d1","#ff7b87","#c4a7ff","#9de266"];
  const TENORS = [
    {du:126,label:"6M"},{du:252,label:"1A"},{du:504,label:"2A"},
    {du:756,label:"3A"},{du:1260,label:"5A"},{du:1764,label:"7A"},
    {du:2520,label:"10A"}
  ];
  const READING_DU = [252,504,756,1260,1764,2520];
  const state = { index:null, active:new Set(["5d","1m","3m","6m"]), cache:new Map(), series:[] };

  const fmtDate = iso => {
    if(!iso)return "—";
    const [y,m,d]=iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const fmtBp = v => Number.isFinite(v)
    ? `${v>0?"+":""}${v.toLocaleString("pt-BR",{maximumFractionDigits:1})} bps`
    : "—";
  const parseISO = iso => {
    const [y,m,d]=iso.split("-").map(Number);
    return new Date(Date.UTC(y,m-1,d));
  };
  const isoUTC = d => d.toISOString().slice(0,10);

  function addMonths(iso,months){
    const d=parseISO(iso),day=d.getUTCDate();
    d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(day,last));return isoUTC(d);
  }
  function addYears(iso,years){
    const d=parseISO(iso);d.setUTCFullYear(d.getUTCFullYear()+years);return isoUTC(d);
  }
  function sortedEntries(){ return [...(state.index?.entries||[])].sort((a,b)=>a.date.localeCompare(b.date)); }
  function closestOnOrBefore(target,before=null){
    const c=sortedEntries().filter(e=>(!before||e.date<before)&&e.date<=target);
    return c.length?c.at(-1).date:null;
  }
  function resolvePreset(key,current){
    const entries=sortedEntries(),pos=entries.findIndex(e=>e.date===current);
    if(pos<=0)return null;
    if(key==="5d")return entries[pos-5]?.date||null;
    let target=null;
    if(key==="1m")target=addMonths(current,-1);
    if(key==="3m")target=addMonths(current,-3);
    if(key==="6m")target=addMonths(current,-6);
    if(key==="1y")target=addYears(current,-1);
    return target?closestOnOrBefore(target,current):null;
  }
  function rootPath(path){ return `../${String(path).replace(/^\/+/,"")}`; }
  async function loadSnapshot(date){
    if(state.cache.has(date))return state.cache.get(date);
    const entry=state.index.entries.find(e=>e.date===date);
    if(!entry)throw new Error(`Snapshot não encontrado: ${date}`);
    const p=fetch(rootPath(entry.path),{cache:"no-store"}).then(r=>{
      if(!r.ok)throw new Error(`Falha ao carregar ${entry.path}`);
      return r.json();
    });
    state.cache.set(date,p);return p;
  }
  function svgEl(name,attrs={}){
    const el=document.createElementNS("http://www.w3.org/2000/svg",name);
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
    return el;
  }
  function niceTicks(min,max,count=5){
    if(min===max)return[min];
    const raw=(max-min)/count,p=10**Math.floor(Math.log10(raw)),n=raw/p;
    const step=(n<1.5?1:n<3?2:n<7?5:10)*p;
    const start=Math.floor(min/step)*step,end=Math.ceil(max/step)*step,out=[];
    for(let v=start;v<=end+step*.1;v+=step)out.push(v);
    return out;
  }
  function interpolate(contracts,target){
    const pts=(contracts||[]).filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct))
      .map(c=>({du:+c.business_days,rate:+c.rate_pct})).sort((a,b)=>a.du-b.du);
    const exact=pts.find(p=>p.du===target);if(exact)return exact.rate;
    let l=null,r=null;
    for(const p of pts){if(p.du<target)l=p;if(p.du>target){r=p;break;}}
    if(!l||!r)return NaN;
    const w=(target-l.du)/(r.du-l.du);
    return l.rate+w*(r.rate-l.rate);
  }
  function normalizeContracts(contracts){
    return TENORS.map(t=>{
      const rate=interpolate(contracts,t.du);
      return Number.isFinite(rate)
        ? {ticker:t.label,maturity:t.label,business_days:t.du,rate_pct:rate}
        : null;
    }).filter(Boolean);
  }
  function normalizedSeries(series){
    return (series||[]).map(s=>({...s,contracts:normalizeContracts(s.contracts)}));
  }

  const avg = xs => { const a=xs.filter(Number.isFinite); return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN; };

  function reading(series){
    series=normalizedSeries(series);
    if(series.length<2)return "Selecione ao menos uma janela histórica.";
    const cur=series[0],ref=series.at(-1);
    const rows=READING_DU.map(du=>{
      const a=interpolate(cur.contracts,du),b=interpolate(ref.contracts,du);
      return {du,diff:Number.isFinite(a)&&Number.isFinite(b)?(a-b)*100:NaN};
    }).filter(x=>Number.isFinite(x.diff));
    if(!rows.length)return `Sem área comum suficiente para comparar com ${ref.label}.`;
    const up=rows.filter(x=>x.diff>5).length,down=rows.filter(x=>x.diff<-5).length;
    const dir=up>=Math.ceil(rows.length*.67)?"acima":down>=Math.ceil(rows.length*.67)?"abaixo":"mista";
    const groups=[
      ["curto prazo",rows.filter(x=>x.du<=252)],
      ["miolo da curva",rows.filter(x=>x.du>252&&x.du<=756)],
      ["ponta longa",rows.filter(x=>x.du>756)]
    ].map(([name,rs])=>({name,mean:avg(rs.map(x=>x.diff))}))
     .filter(x=>Number.isFinite(x.mean)).sort((a,b)=>Math.abs(b.mean)-Math.abs(a.mean));
    const strong=groups[0];
    if(dir==="mista")return `Comparação com ${ref.label} (${fmtDate(ref.date)}): movimento misto entre os prazos.${strong?` Maior distância média no ${strong.name} (${fmtBp(strong.mean)}).`:""}`;
    return `Comparação com ${ref.label} (${fmtDate(ref.date)}): curva atual ${dir} na maior parte dos vértices comparáveis.${strong?` Maior distância média no ${strong.name} (${fmtBp(strong.mean)}).`:""}`;
  }

  async function buildSeries(){
    const current=state.index.latest||sortedEntries().at(-1)?.date;
    const now=await loadSnapshot(current);
    const series=[{label:"Atual",date:current,color:COLORS[0],current:true,contracts:now.contracts}];
    let color=1;
    for(const p of PRESETS){
      const target=resolvePreset(p.key,current);
      const btn=document.querySelector(`[data-period="${p.key}"]`);
      if(btn){
        btn.disabled=!target;
        btn.title=target?`Curva de ${fmtDate(target)}`:"Histórico insuficiente";
      }
      if(!target||!state.active.has(p.key))continue;
      const snap=await loadSnapshot(target);
      series.push({label:p.label,date:target,color:COLORS[color++]||COLORS[0],current:false,contracts:snap.contracts});
    }
    state.series=series;return series;
  }

  function renderLegend(series){
    $("widgetLegend").innerHTML=series.map(s=>`<span><i style="background:${s.color}"></i><strong>${s.label}</strong> ${fmtDate(s.date)}</span>`).join("");
    $("widgetCount").textContent=`${series.length} curva${series.length===1?"":"s"} no gráfico`;
  }

  function renderChart(series){
    const host=$("widgetChart");host.innerHTML="";
    const normalized=normalizedSeries(series);
    const valid=normalized.filter(s=>(s.contracts||[]).length>=2);
    const all=valid.flatMap(s=>s.contracts||[]).filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct));
    if(!all.length){host.innerHTML='<div class="empty">Sem dados suficientes.</div>';return;}

    const width=Math.max(720,host.clientWidth||900),height=365,pad={l:58,r:20,t:16,b:44};
    const xmin=126,xmax=2520;
    const ymin=Math.min(...all.map(c=>c.rate_pct))-.08,ymax=Math.max(...all.map(c=>c.rate_pct))+.08;
    const sx=x=>pad.l+(x-xmin)/(xmax-xmin||1)*(width-pad.l-pad.r);
    const sy=y=>height-pad.b-(y-ymin)/(ymax-ymin||1)*(height-pad.t-pad.b);
    const svg=svgEl("svg",{viewBox:`0 0 ${width} ${height}`,role:"img","aria-label":"Curvas DI normalizadas de 6 meses a 10 anos"});

    niceTicks(ymin,ymax,5).forEach(y=>{
      const yy=sy(y);
      svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:"grid"}));
      const t=svgEl("text",{x:pad.l-9,y:yy+4,"text-anchor":"end",class:"axisText"});t.textContent=`${y.toFixed(2)}%`;svg.append(t);
    });

    TENORS.forEach(tick=>{
      const xx=sx(tick.du);
      svg.append(svgEl("line",{x1:xx,x2:xx,y1:pad.t,y2:height-pad.b,class:"grid"}));
      const t=svgEl("text",{x:xx,y:height-17,"text-anchor":"middle",class:"tenorText"});
      t.textContent=tick.label;
      const tt=svgEl("title");tt.textContent=`${tick.du.toLocaleString("pt-BR")} dias úteis`;t.append(tt);svg.append(t);
    });
    svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:height-pad.b,y2:height-pad.b,class:"axis"}));

    valid.forEach(s=>{
      const pts=s.contracts;
      if(!pts.length)return;
      const path=svgEl("path",{d:pts.map((p,i)=>`${i?"L":"M"} ${sx(p.business_days)} ${sy(p.rate_pct)}`).join(" "),class:"curve"});
      path.setAttribute("stroke",s.color);
      path.setAttribute("stroke-width",s.current?"3.5":"2.1");
      path.setAttribute("opacity",s.current?"1":".78");
      svg.append(path);

      pts.forEach(p=>{
        const c=svgEl("circle",{
          cx:sx(p.business_days),cy:sy(p.rate_pct),
          r:s.current?"4":"3",
          fill:s.color,
          opacity:s.current?"1":".9"
        });
        const tt=svgEl("title");
        tt.textContent=`${s.label} · ${p.ticker} · ${p.business_days.toLocaleString("pt-BR")} DU · ${p.rate_pct.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:3})}%`;
        c.append(tt);
        svg.append(c);
      });
    });
    host.append(svg);
  }

  function notifyHeight(){
    try{
      parent.postMessage({type:"juros-brasil-widget-height",widget:"evolucao-di",height:document.documentElement.scrollHeight},"*");
    }catch(_){}
  }

  async function render(){
    try{
      const series=await buildSeries();
      renderLegend(series);renderChart(series);
      $("widgetReading").textContent=reading(series);
      notifyHeight();
    }catch(err){
      console.error(err);
      $("widgetReading").textContent=err.message;
      $("widgetChart").innerHTML=`<div class="empty">${err.message}</div>`;
    }
  }

  async function boot(){
    const r=await fetch("../data/index.json",{cache:"no-store"});
    if(!r.ok)throw new Error("Não foi possível carregar a base DI.");
    state.index=await r.json();
    $("widgetMode").textContent=state.index.mode==="live"?"B3 · LIVE":"DEMO";
    $("widgetDate").textContent=fmtDate(state.index.latest);
    document.querySelectorAll("[data-period]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const key=btn.dataset.period;
        if(state.active.has(key))state.active.delete(key);else state.active.add(key);
        btn.classList.toggle("active",state.active.has(key));
        render();
      });
    });
    await render();
    new ResizeObserver(notifyHeight).observe($("widget"));
    window.addEventListener("resize",()=>renderChart(state.series));
  }
  window.addEventListener("DOMContentLoaded",()=>boot().catch(err=>{
    console.error(err);$("widgetReading").textContent=err.message;
  }));
})();
