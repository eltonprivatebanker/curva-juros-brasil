(() => {
  const q = (id) => document.getElementById(id);
  const STANDARD_DU = [126, 252, 504, 756, 1260, 2520];
  const CATEGORY_ORDER = ["all","prefixado","ipca","selic","renda","educa","igpm","outros"];
  const CATEGORY_LABEL = {
    all:"Todos", prefixado:"Prefixados", ipca:"IPCA+", selic:"Selic",
    renda:"Renda+", educa:"Educa+", igpm:"IGP-M+", outros:"Outros"
  };
  const S = {
    di:null, a:null, t:null, cache:new Map(),
    lastA:null, lastC:null, lastHistory:null,
    tesouroFilter:"all", tesouroCurrent:null
  };

  const finite = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  const fd = (s) => {
    if (!s) return "—";
    const [y,m,d] = s.split("-");
    return `${d}/${m}/${y}`;
  };
  const fp = (v,d=4) => finite(v)
    ? `${Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:d})}%`
    : "—";
  const fm = (v) => finite(v)
    ? Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})
    : "—";
  const fb = (v) => Number.isFinite(v)
    ? `${v>0?"+":""}${v.toLocaleString("pt-BR",{maximumFractionDigits:1})} bps`
    : "—";
  const fdeltaPct = (v) => Number.isFinite(v)
    ? `${v>0?"+":""}${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`
    : "—";
  const approx = (du) => ({
    21:"1M",42:"2M",63:"3M",126:"6M",252:"1A",378:"1,5A",504:"2A",
    630:"2,5A",756:"3A",882:"3,5A",1008:"4A",1134:"4,5A",1260:"5A",2520:"10A"
  }[du] || `${(du/252).toLocaleString("pt-BR",{maximumFractionDigits:1})}A`);

  async function getJson(path) {
    if (S.cache.has(path)) return S.cache.get(path);
    const p = fetch(path,{cache:"no-store"}).then(r => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    S.cache.set(path,p);
    return p;
  }

  function setupTabs() {
    document.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("active",x===btn));
        document.querySelectorAll(".tabPane").forEach(x => x.classList.remove("active"));
        q(`tab-${btn.dataset.tab}`).classList.add("active");
        window.dispatchEvent(new Event("resize"));
        if (btn.dataset.tab==="anbima" && S.lastA) renderAnbimaChart(S.lastA);
        if (btn.dataset.tab==="conexoes" && S.lastC) renderConnectionChart(S.lastC);
        if (btn.dataset.tab==="tesouro" && S.lastHistory) renderHistoryCharts(S.lastHistory);
        if (btn.dataset.tab==="decisao") renderDecision();
      });
    });
  }

  function fillSelect(select,index,onChange) {
    select.innerHTML = "";
    const entries = [...(index?.entries || [])].sort((a,b)=>b.date.localeCompare(a.date));
    entries.forEach(e => select.add(new Option(fd(e.date),e.date)));
    select.disabled = !entries.length;
    if (entries.length) select.value = index.latest || entries[0].date;
    select.addEventListener("change",onChange);
  }

  function svgEl(name,attrs={}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg",name);
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
    return el;
  }
  function niceTicks(min,max,count=5) {
    if (min===max) return [min];
    const raw=(max-min)/count, p=10**Math.floor(Math.log10(raw)), n=raw/p;
    const step=(n<1.5?1:n<3?2:n<7?5:10)*p;
    const start=Math.floor(min/step)*step, end=Math.ceil(max/step)*step, out=[];
    for (let v=start;v<=end+step*.1;v+=step) out.push(v);
    return out;
  }

  function lineChart(hostId,series) {
    const host=q(hostId); if(!host) return;
    host.innerHTML="";
    const points=series.flatMap(s=>s.points).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(!points.length){host.innerHTML='<div class="emptyState">Sem dados para o gráfico.</div>';return;}
    const width=Math.max(720,host.clientWidth||900), height=390, pad={l:58,r:22,t:22,b:46};
    const xMin=Math.min(...points.map(p=>p.x)), xMax=Math.max(...points.map(p=>p.x));
    const yMin=Math.min(...points.map(p=>p.y))-.08, yMax=Math.max(...points.map(p=>p.y))+.08;
    const sx=x=>pad.l+(x-xMin)/(xMax-xMin||1)*(width-pad.l-pad.r);
    const sy=y=>height-pad.b-(y-yMin)/(yMax-yMin||1)*(height-pad.t-pad.b);
    const svg=svgEl("svg",{viewBox:`0 0 ${width} ${height}`});
    niceTicks(yMin,yMax,5).forEach(y=>{
      const yy=sy(y);svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:"grid"}));
      const t=svgEl("text",{x:pad.l-10,y:yy+4,"text-anchor":"end"});t.textContent=`${y.toFixed(2)}%`;svg.append(t);
    });
    for(let i=0;i<=5;i++){
      const x=xMin+(xMax-xMin)*i/5,xx=sx(x);
      svg.append(svgEl("line",{x1:xx,x2:xx,y1:pad.t,y2:height-pad.b,class:"grid"}));
      const t=svgEl("text",{x:xx,y:height-18,"text-anchor":"middle"});t.textContent=`${Math.round(x)} DU`;svg.append(t);
    }
    series.forEach(s=>{
      const pts=[...s.points].sort((a,b)=>a.x-b.x); if(!pts.length)return;
      svg.append(svgEl("path",{d:pts.map((p,i)=>`${i?"L":"M"} ${sx(p.x)} ${sy(p.y)}`).join(" "),class:"marketLine",stroke:s.color}));
      pts.forEach(p=>{
        const c=svgEl("circle",{cx:sx(p.x),cy:sy(p.y),r:3.5,fill:s.color,class:"marketPoint"});
        const tt=svgEl("title");tt.textContent=`${s.label} · ${p.x} DU · ${fp(p.y)}`;c.append(tt);svg.append(c);
      });
    });
    host.append(svg);
  }

  function timeSeriesChart(hostId,points,unit="pct") {
    const host=q(hostId); if(!host)return;
    host.innerHTML="";
    const pts=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.x-b.x);
    if(pts.length<2){host.innerHTML='<div class="emptyState">O gráfico aparecerá após termos pelo menos dois pregões no histórico.</div>';return;}
    const width=Math.max(500,host.clientWidth||650),height=238,pad={l:84,r:18,t:14,b:38};
    const xmin=pts[0].x,xmax=pts.at(-1).x,y0=Math.min(...pts.map(p=>p.y)),y1=Math.max(...pts.map(p=>p.y));
    const margin=(y1-y0||Math.abs(y0)*.02||1)*.10,ymin=y0-margin,ymax=y1+margin;
    const sx=x=>pad.l+(x-xmin)/(xmax-xmin||1)*(width-pad.l-pad.r);
    const sy=y=>height-pad.b-(y-ymin)/(ymax-ymin||1)*(height-pad.t-pad.b);
    const svg=svgEl("svg",{viewBox:`0 0 ${width} ${height}`,role:"img"});
    niceTicks(ymin,ymax,4).forEach(y=>{
      const yy=sy(y);
      svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:"grid historyGridLine"}));
      const t=svgEl("text",{x:pad.l-12,y:yy+4,"text-anchor":"end",class:"historyAxisLabel"});
      t.textContent=unit==="money"
        ? `R$ ${Math.round(y).toLocaleString("pt-BR")}`
        : `${y.toFixed(2)}%`;
      svg.append(t);
    });
    const tickFractions=[0,.25,.5,.75,1];
    tickFractions.forEach((f,i)=>{
      const x=xmin+(xmax-xmin)*f,xx=sx(x),d=new Date(x);
      const anchor=i===0?"start":i===tickFractions.length-1?"end":"middle";
      const tx=i===0?xx+2:i===tickFractions.length-1?xx-2:xx;
      const t=svgEl("text",{x:tx,y:height-12,"text-anchor":anchor,class:"historyAxisLabel historyXAxisLabel"});
      t.textContent=`${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}`;
      svg.append(t);
    });
    svg.append(svgEl("path",{
      d:pts.map((p,i)=>`${i?"L":"M"} ${sx(p.x)} ${sy(p.y)}`).join(" "),
      class:"historyLine",stroke:"#69b7ff"
    }));
    const stride=Math.max(1,Math.ceil(pts.length/55));
    pts.forEach((p,i)=>{
      if(i%stride!==0 && i!==pts.length-1)return;
      const c=svgEl("circle",{cx:sx(p.x),cy:sy(p.y),r:2.15,fill:"#69b7ff",class:"historyPoint"});
      const tt=svgEl("title");
      tt.textContent=`${fd(p.date)} · ${unit==="money"?fm(p.y):fp(p.y)}`;
      c.append(tt);svg.append(c);
    });
    host.append(svg);
  }

  // Flat-forward: interpolação linear no log do fator de desconto, convenção 252 DU/ano.
  function flatForward(points,targetDu) {
    const pts=points
      .filter(p=>finite(p.du)&&finite(p.rate)&&+p.du>0)
      .map(p=>({du:+p.du,rate:+p.rate}))
      .sort((a,b)=>a.du-b.du);
    const exact=pts.find(p=>p.du===targetDu); if(exact)return exact.rate;
    const left=[...pts].reverse().find(p=>p.du<targetDu);
    const right=pts.find(p=>p.du>targetDu);
    if(!left||!right||targetDu<=0)return NaN;
    const t1=left.du/252,t2=right.du/252,t=targetDu/252;
    const ldf1=-t1*Math.log1p(left.rate/100);
    const ldf2=-t2*Math.log1p(right.rate/100);
    const w=(t-t1)/(t2-t1);
    const ldf=ldf1+w*(ldf2-ldf1);
    return Math.expm1(-ldf/t)*100;
  }

  function category(title="") {
    const s=title.toLowerCase();
    if(s.includes("prefixado"))return"prefixado";
    if(s.includes("renda+"))return"renda";
    if(s.includes("educa+"))return"educa";
    if(s.includes("selic"))return"selic";
    if(s.includes("igpm")||s.includes("igp-m"))return"igpm";
    if(s.includes("ipca+"))return"ipca";
    return"outros";
  }
  function titleKey(t){return`${t.type}|${t.maturity}`;}
  function calendarDays(a,b){
    const x=new Date(`${a}T00:00:00Z`),y=new Date(`${b}T00:00:00Z`);
    return Math.round((y-x)/86400000);
  }
  function relevantTitle(t,refDate){
    if(finite(t.business_days))return +t.business_days>=21;
    return calendarDays(refDate,t.maturity)>=30;
  }
  function ratePrefix(t){
    const c=category(t.type);
    if(c==="selic")return"Selic + ";
    if(c==="ipca"||c==="renda"||c==="educa")return"IPCA + ";
    if(c==="igpm"||(t.type||"").toLowerCase().includes("igpm"))return"IGP-M + ";
    return"";
  }
  function formattedTitleRate(t,v){
    if(!finite(v))return"—";
    let n=+v;if(Math.abs(n)<.005)n=0;
    const num=`${n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
    return ratePrefix(t)+num+(category(t.type)==="prefixado"?" a.a.":"");
  }
  function rangeRateLabel(cat,min,max){
    if(!Number.isFinite(min)||!Number.isFinite(max))return"—";
    min=Math.abs(min)<.005?0:min; max=Math.abs(max)<.005?0:max;
    const prefix=cat==="selic"?"Selic + ":(["ipca","renda","educa"].includes(cat)?"IPCA + ":(cat==="igpm"?"IGP-M + ":""));
    if(Math.abs(max-min)<.005)return `${prefix}${min.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
    return `${prefix}${min.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}% → ${max.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  }
  function deltaClass(v){
    if(!Number.isFinite(v)||Math.abs(v)<.05)return"deltaFlat";
    return v>0?"deltaUp":"deltaDown";
  }

  async function renderAnbima(){
    if(!S.a?.entries?.length)return;
    const d=q("anbimaDate").value,e=S.a.entries.find(x=>x.date===d),a=await getJson(e.path);
    S.lastA=a;q("anbimaStatus").textContent=`${fd(a.date)} · ${a.source_mode==="manual_page_seed"?"snapshot inicial":"API"}`;
    const m=new Map(a.curves.map(x=>[+x.du,x]));
    q("anbimaCards").innerHTML=STANDARD_DU.map(du=>{
      const r=m.get(du)||{};
      return `<article class="marketCard"><small>${approx(du)} · ${du.toLocaleString("pt-BR")} DU</small>
        <strong>${fp(r.pre_pct)}</strong><div class="subline">Real ${fp(r.ipca_pct)}<br>Implícita ${fp(r.implied_pct)}</div></article>`;
    }).join("");
    q("anbimaTable").innerHTML=a.curves.map(r=>`<tr><td><strong>${(+r.du).toLocaleString("pt-BR")}</strong></td>
      <td>${approx(+r.du)}</td><td>${fp(r.pre_pct)}</td><td>${fp(r.ipca_pct)}</td><td>${fp(r.implied_pct)}</td></tr>`).join("");
    q("anbimaParams").innerHTML=(a.parameters||[]).map(p=>`<tr><td><strong>${p.group}</strong></td><td>${p.b1}</td>
      <td>${p.b2}</td><td>${p.b3}</td><td>${p.b4}</td><td>${p.l1}</td><td>${p.l2}</td></tr>`).join("");
    q("anbimaPrecision").textContent=a.precision_note||"";
    q("anbimaLegend").innerHTML='<span><i style="background:#69b7ff"></i>ETTJ Pré</span><span><i style="background:#38d39f"></i>ETTJ IPCA</span><span><i style="background:#ffc96b"></i>Inflação implícita</span>';
    renderAnbimaChart(a);
  }
  function renderAnbimaChart(a){
    lineChart("anbimaChart",[
      {label:"ETTJ Pré",color:"#69b7ff",points:a.curves.filter(x=>x.pre_pct!=null).map(x=>({x:+x.du,y:+x.pre_pct}))},
      {label:"ETTJ IPCA",color:"#38d39f",points:a.curves.filter(x=>x.ipca_pct!=null).map(x=>({x:+x.du,y:+x.ipca_pct}))},
      {label:"Inflação implícita",color:"#ffc96b",points:a.curves.filter(x=>x.implied_pct!=null).map(x=>({x:+x.du,y:+x.implied_pct}))}
    ]);
  }

  function ensureTesouroEnhancements(){
    const tbody=q("tesouroTable"); if(!tbody)return;
    const panel=tbody.closest("section.panel"),wrap=tbody.closest(".tableWrap");
    if(!q("tesouroFilters")){
      const bar=document.createElement("div");bar.id="tesouroFilters";bar.className="filterBar";
      wrap.before(bar);
    }
    const thead=tbody.closest("table").querySelector("thead");
    thead.innerHTML=`<tr><th>Título</th><th>Vencimento</th><th>DU</th><th>Taxa compra</th><th>Preço compra</th><th>Δ taxa</th><th>Δ preço</th><th>Taxa venda</th><th>Preço venda</th></tr>`;
    if(!q("tesouroTableNote")){
      const note=document.createElement("p");note.id="tesouroTableNote";note.className="tableNote";
      note.textContent="Δ taxa e Δ preço comparam o pregão selecionado ao pregão anterior disponível. Títulos com vencimento muito próximo permanecem na tabela, mas são excluídos dos cards-resumo.";
      wrap.after(note);
    }
    if(!q("tesouroHistoryPanel")){
      const sec=document.createElement("section");sec.id="tesouroHistoryPanel";sec.className="panel historyPanel historyPanelV212";
      sec.innerHTML=`
        <div class="historyTop">
          <div class="historyHeading">
            <p class="eyebrow">HISTÓRICO DO TÍTULO</p>
            <div class="historyTitleRow">
              <h2 id="tesouroHistoryActiveTitle">Taxa × preço</h2>
              <span id="tesouroHistoryStatus" class="historyCountPill">—</span>
            </div>
            <p id="tesouroHistoryPeriod" class="sectionSubtitle">Selecione um título para acompanhar sua trajetória.</p>
          </div>
          <label class="historySelect historySelectCompact">
            <span>Trocar título</span>
            <select id="tesouroHistoryTitle"></select>
          </label>
        </div>

        <div id="tesouroHistoryKpis" class="historyKpis"></div>

        <div class="historyGrid historyGridCompact">
          <div class="historyBox historyBoxCompact">
            <div class="historyBoxHead">
              <div><span>Taxa de compra</span><strong id="tesouroHistoryRateNow">—</strong></div>
              <span id="tesouroHistoryRateDelta" class="historyMiniDelta">—</span>
            </div>
            <div id="tesouroRateHistory" class="historyChart historyChartCompact"></div>
          </div>
          <div class="historyBox historyBoxCompact">
            <div class="historyBoxHead">
              <div><span>Preço de compra</span><strong id="tesouroHistoryPriceNow">—</strong></div>
              <span id="tesouroHistoryPriceDelta" class="historyMiniDelta">—</span>
            </div>
            <div id="tesouroPriceHistory" class="historyChart historyChartCompact"></div>
          </div>
        </div>

        <div class="historyReading">
          <p class="eyebrow">LEITURA DO PERÍODO</p>
          <p id="tesouroHistoryReading">—</p>
        </div>`;
      panel.after(sec);
      q("tesouroHistoryTitle").addEventListener("change",renderTitleHistory);
    }
  }

  function renderTesouroFilters(data){
    const counts={all:data.titles.length};
    data.titles.forEach(t=>{const c=category(t.type);counts[c]=(counts[c]||0)+1;});
    q("tesouroFilters").innerHTML=CATEGORY_ORDER.filter(c=>c==="all"||counts[c]).map(c=>
      `<button class="filterChip ${S.tesouroFilter===c?"active":""}" data-tfilter="${c}">${CATEGORY_LABEL[c]} · ${counts[c]||0}</button>`
    ).join("");
    q("tesouroFilters").querySelectorAll("[data-tfilter]").forEach(btn=>btn.addEventListener("click",()=>{
      S.tesouroFilter=btn.dataset.tfilter;renderTesouroBody();
    }));
  }

  function renderTesouroCards(data){
    const cats=CATEGORY_ORDER.filter(c=>c!=="all");
    q("tesouroCards").innerHTML=cats.map(c=>{
      const all=data.titles.filter(t=>category(t.type)===c);if(!all.length)return"";
      const relevant=all.filter(t=>relevantTitle(t,data.date));
      const base=relevant.length?relevant:all;
      const rates=base.map(t=>+t.buy_rate_pct).filter(Number.isFinite);
      const min=rates.length?Math.min(...rates):NaN,max=rates.length?Math.max(...rates):NaN;
      const active=S.tesouroFilter===c?"active":"";
      return `<article class="marketCard clickable ${active}" data-card-filter="${c}">
        <small>${CATEGORY_LABEL[c]}</small><strong class="rateRange">${rangeRateLabel(c,min,max)}</strong>
        <div class="subline">${base.length} título${base.length===1?"":"s"} relevante${base.length===1?"":"s"}${all.length!==base.length?`<br>${all.length-base.length} vencendo em breve fora do resumo`:""}</div></article>`;
    }).join("");
    q("tesouroCards").querySelectorAll("[data-card-filter]").forEach(card=>card.addEventListener("click",()=>{
      S.tesouroFilter=card.dataset.cardFilter;renderTesouroBody();
    }));
  }

  async function previousTesouroSnapshot(date){
    const entries=[...(S.t?.entries||[])].sort((a,b)=>a.date.localeCompare(b.date));
    const pos=entries.findIndex(e=>e.date===date);
    if(pos<=0)return null;
    return getJson(entries[pos-1].path);
  }

  async function renderTesouro(){
    const entries=S.t?.entries||[];
    if(!entries.length){q("tesouroPending").classList.remove("hidden");q("tesouroContent").classList.add("hidden");return;}
    q("tesouroPending").classList.add("hidden");q("tesouroContent").classList.remove("hidden");
    ensureTesouroEnhancements();
    const date=q("tesouroDate").value,entry=entries.find(e=>e.date===date);
    const [data,prev]=await Promise.all([getJson(entry.path),previousTesouroSnapshot(date)]);
    S.tesouroCurrent={data,prev};
    q("tesouroStatus").textContent=`${fd(data.date)} · ${data.titles.length} títulos`;
    renderTesouroBody();
    populateHistorySelect(data);
    renderTitleHistory();
  }

  function renderTesouroBody(){
    if(!S.tesouroCurrent)return;
    const {data,prev}=S.tesouroCurrent;
    renderTesouroFilters(data);renderTesouroCards(data);
    const prevMap=new Map((prev?.titles||[]).map(t=>[titleKey(t),t]));
    const rows=[...data.titles]
      .filter(t=>S.tesouroFilter==="all"||category(t.type)===S.tesouroFilter)
      .sort((a,b)=>category(a.type).localeCompare(category(b.type))||a.type.localeCompare(b.type)||(a.maturity||"").localeCompare(b.maturity||""));
    q("tesouroTable").innerHTML=rows.map(t=>{
      const p=prevMap.get(titleKey(t));
      const dbp=p&&finite(p.buy_rate_pct)&&finite(t.buy_rate_pct)?(+t.buy_rate_pct-+p.buy_rate_pct)*100:NaN;
      const dprice=p&&finite(p.buy_price)&&finite(t.buy_price)&&+p.buy_price!==0?(+t.buy_price/+p.buy_price-1)*100:NaN;
      const soon=!relevantTitle(t,data.date);
      return `<tr><td><strong>${t.type}</strong><span class="categoryTag">${CATEGORY_LABEL[category(t.type)]}</span></td>
        <td>${fd(t.maturity)}${soon?'<span class="maturitySoon">vencimento próximo</span>':""}</td>
        <td class="duCell">${finite(t.business_days)?(+t.business_days).toLocaleString("pt-BR"):"—"}</td>
        <td class="rateCell">${formattedTitleRate(t,t.buy_rate_pct)}</td><td>${fm(t.buy_price)}</td>
        <td class="${deltaClass(dbp)}">${fb(dbp)}</td><td class="${deltaClass(-dprice)}">${fdeltaPct(dprice)}</td>
        <td class="rateCell">${formattedTitleRate(t,t.sell_rate_pct)}</td><td>${fm(t.sell_price)}</td></tr>`;
    }).join("");
    const enriched=data.titles.some(t=>finite(t.business_days));
    q("tesouroTableNote").textContent=(enriched
      ?"DU usa o calendário brasileiro do PYield. "
      :"DU ainda não está enriquecido neste snapshot; rode novamente “Atualizar Tesouro Direto” após subir a V2.1. ")
      +"Δ taxa e Δ preço comparam com o pregão anterior disponível. Títulos muito próximos do vencimento ficam fora dos cards-resumo.";
  }

  function populateHistorySelect(data){
    const sel=q("tesouroHistoryTitle"),old=sel.value;
    sel.innerHTML="";
    const titles=[...data.titles].sort((a,b)=>category(a.type).localeCompare(category(b.type))||a.type.localeCompare(b.type)||a.maturity.localeCompare(b.maturity));
    titles.forEach(t=>sel.add(new Option(`${t.type} · ${fd(t.maturity)}`,titleKey(t))));
    if(old&&titles.some(t=>titleKey(t)===old))sel.value=old;
    else {
      const preferred=titles.find(t=>t.type==="Tesouro Prefixado"&&t.maturity>="2031-01-01")||titles[0];
      if(preferred)sel.value=titleKey(preferred);
    }
  }

  async function renderTitleHistory(){
    const sel=q("tesouroHistoryTitle");if(!sel||!sel.value)return;
    const key=sel.value,entries=[...(S.t?.entries||[])].sort((a,b)=>a.date.localeCompare(b.date)).slice(-260);
    const selectedNow=(S.tesouroCurrent?.data?.titles||[]).find(t=>titleKey(t)===key);
    const label=selectedNow?`${selectedNow.type} · ${fd(selectedNow.maturity)}`:sel.options[sel.selectedIndex]?.text||"Título";
    q("tesouroHistoryActiveTitle").textContent=label;

    const results=await Promise.allSettled(entries.map(e=>getJson(e.path)));
    const rate=[],price=[];
    results.forEach((res,i)=>{
      if(res.status!=="fulfilled")return;
      const t=(res.value.titles||[]).find(x=>titleKey(x)===key);if(!t)return;
      const x=Date.parse(`${entries[i].date}T00:00:00Z`);
      if(finite(t.buy_rate_pct))rate.push({x,y:+t.buy_rate_pct,date:entries[i].date});
      if(finite(t.buy_price))price.push({x,y:+t.buy_price,date:entries[i].date});
    });

    const firstR=rate[0],lastR=rate.at(-1),firstP=price[0],lastP=price.at(-1);
    const dbp=firstR&&lastR?(lastR.y-firstR.y)*100:NaN;
    const dp=firstP&&lastP&&firstP.y?((lastP.y/firstP.y)-1)*100:NaN;
    const start=firstR?.date||firstP?.date,end=lastR?.date||lastP?.date;
    const observed=Math.max(rate.length,price.length);
    q("tesouroHistoryStatus").textContent=observed===1?"1 pregão":`${observed} pregões`;
    q("tesouroHistoryPeriod").textContent=start&&end
      ? `${fd(start)} → ${fd(end)} · evolução do mesmo título`
      : "Histórico insuficiente.";

    const rateInitial=firstR?formattedTitleRate(selectedNow||{type:""},firstR.y):"—";
    const rateFinal=lastR?formattedTitleRate(selectedNow||{type:""},lastR.y):"—";
    const priceInitial=firstP?fm(firstP.y):"—";
    const priceFinal=lastP?fm(lastP.y):"—";

    q("tesouroHistoryKpis").innerHTML=`
      <div class="historyKpi"><span>Taxa inicial</span><strong>${rateInitial}</strong><small>${firstR?fd(firstR.date):"—"}</small></div>
      <div class="historyKpi"><span>Taxa final</span><strong>${rateFinal}</strong><small>${lastR?fd(lastR.date):"—"}</small></div>
      <div class="historyKpi"><span>Δ taxa</span><strong class="${deltaClass(dbp)}">${fb(dbp)}</strong><small>no período</small></div>
      <div class="historyKpi"><span>Preço inicial</span><strong>${priceInitial}</strong><small>${firstP?fd(firstP.date):"—"}</small></div>
      <div class="historyKpi"><span>Preço final</span><strong>${priceFinal}</strong><small>${lastP?fd(lastP.date):"—"}</small></div>
      <div class="historyKpi"><span>Δ preço</span><strong class="${deltaClass(-dp)}">${fdeltaPct(dp)}</strong><small>no período</small></div>`;

    q("tesouroHistoryRateNow").textContent=rateFinal;
    q("tesouroHistoryRateDelta").textContent=fb(dbp);
    q("tesouroHistoryRateDelta").className=`historyMiniDelta ${deltaClass(dbp)}`;
    q("tesouroHistoryPriceNow").textContent=priceFinal;
    q("tesouroHistoryPriceDelta").textContent=fdeltaPct(dp);
    q("tesouroHistoryPriceDelta").className=`historyMiniDelta ${deltaClass(-dp)}`;

    const c=selectedNow?category(selectedNow.type):"";
    const rateVerb=Number.isFinite(dbp)?(dbp>1?"subiu":dbp<-1?"caiu":"ficou praticamente estável"):"variou";
    const priceVerb=Number.isFinite(dp)?(dp>.05?"subiu":dp<-.05?"caiu":"ficou praticamente estável"):"variou";
    let extra="";
    if(c==="prefixado"){
      if(Number.isFinite(dbp)&&Number.isFinite(dp)&&Math.sign(dbp)===Math.sign(dp)&&Math.abs(dbp)>1&&Math.abs(dp)>.05){
        extra=" Como a janela é longa, o preço final também incorpora carrego e encurtamento do prazo; por isso a comparação entre início e fim não isola apenas a marcação a mercado.";
      }else{
        extra=" Em um prefixado, taxa e preço tendem a se mover em sentidos opostos quando as demais variáveis permanecem constantes; carrego e passagem do tempo também influenciam a trajetória.";
      }
    }else if(["ipca","renda","educa","igpm"].includes(c)){
      extra=" Em títulos indexados, o preço nominal também incorpora atualização do indexador/VNA, carrego e redução do prazo, então a variação do preço não deve ser atribuída apenas à mudança da taxa real.";
    }else if(c==="selic"){
      extra=" No Tesouro Selic, o preço é fortemente influenciado pelo acúmulo da Selic e a taxa exibida representa o ágio/deságio adicional do título.";
    }

    q("tesouroHistoryReading").textContent=
      `${start&&end?`De ${fd(start)} a ${fd(end)}, `:""}a taxa ${rateVerb} ${Number.isFinite(dbp)?`(${fb(dbp)})`:""} e o preço ${priceVerb} ${Number.isFinite(dp)?`(${fdeltaPct(dp)})`:""}.${extra}`;

    S.lastHistory={rate,price};renderHistoryCharts(S.lastHistory);
  }
  function renderHistoryCharts(h){
    timeSeriesChart("tesouroRateHistory",h.rate,"pct");
    timeSeriesChart("tesouroPriceHistory",h.price,"money");
  }

  function ensureTreasuryConnectionPanel(){
    if(q("treasuryConnectionPanel"))return;
    const basisTable=q("basisTable");if(!basisTable)return;
    const anchor=basisTable.closest("section.panel");
    const sec=document.createElement("section");sec.id="treasuryConnectionPanel";sec.className="panel connectionTreasury";
    sec.innerHTML=`<div class="panelHead"><div><p class="eyebrow">TÍTULOS × CURVA SOBERANA</p><h2>Tesouro Direto × ANBIMA</h2>
      <p class="sectionSubtitle">Comparação direta apenas para títulos sem cupom, usando o mesmo prazo em dias úteis.</p></div><div id="treasuryConnectionStatus" class="muted">—</div></div>
      <div class="connectionSplit">
        <div class="connectionBox"><p class="eyebrow">NOMINAL</p><h3>Tesouro Prefixado × ETTJ Pré</h3><div id="prefixConnectionStat" class="connectionStat"></div>
          <div class="tableWrap"><table><thead><tr><th>Venc.</th><th>DU</th><th>Tesouro</th><th>ANBIMA</th><th>Desvio</th></tr></thead><tbody id="prefixConnectionTable"></tbody></table></div></div>
        <div class="connectionBox"><p class="eyebrow">JURO REAL</p><h3>Tesouro IPCA+ × ETTJ IPCA</h3><div id="ipcaConnectionStat" class="connectionStat"></div>
          <div class="tableWrap"><table><thead><tr><th>Venc.</th><th>DU</th><th>Tesouro</th><th>ANBIMA</th><th>Desvio</th></tr></thead><tbody id="ipcaConnectionTable"></tbody></table></div></div>
      </div>
      <div class="modelNote"><strong>Como ler:</strong> desvio = taxa de compra do Tesouro Direto − ETTJ ANBIMA no mesmo DU. Valor positivo significa que o título está sendo ofertado com taxa acima da curva estimada. Títulos com juros semestrais, Renda+ e Educa+ não entram nesta subtração simples porque possuem múltiplos fluxos de caixa.</div>`;
    anchor.after(sec);
  }

  function comparisonRows(tesouro,anbima,titleType,curveField){
    if(!tesouro)return[];
    const curve=(anbima.curves||[]).filter(x=>finite(x[curveField])).map(x=>({du:+x.du,rate:+x[curveField]}));
    return (tesouro.titles||[]).filter(t=>t.type===titleType&&relevantTitle(t,tesouro.date)&&finite(t.business_days)&&finite(t.buy_rate_pct))
      .map(t=>{
        const curveRate=flatForward(curve,+t.business_days);
        return {...t,curveRate,basis:Number.isFinite(curveRate)?(+t.buy_rate_pct-curveRate)*100:NaN};
      }).filter(r=>Number.isFinite(r.curveRate));
  }

  function renderTreasuryConnections(tesouro,anbima){
    ensureTreasuryConnectionPanel();
    if(!tesouro){
      q("treasuryConnectionStatus").textContent="Sem snapshot do Tesouro nesta data";
      q("prefixConnectionTable").innerHTML='<tr><td colspan="5">Sem dados.</td></tr>';
      q("ipcaConnectionTable").innerHTML='<tr><td colspan="5">Sem dados.</td></tr>';
      return;
    }
    q("treasuryConnectionStatus").textContent=fd(tesouro.date);
    const pre=comparisonRows(tesouro,anbima,"Tesouro Prefixado","pre_pct");
    const ipca=comparisonRows(tesouro,anbima,"Tesouro IPCA+","ipca_pct");
    const render=(id,statId,rows,isIpca)=>{
      if(!rows.length){
        q(id).innerHTML='<tr><td colspan="5">Sem títulos comparáveis. Se o campo DU estiver vazio, rode novamente o workflow do Tesouro após atualizar a V2.1.</td></tr>';
        q(statId).textContent="—";return;
      }
      const avg=rows.reduce((s,r)=>s+r.basis,0)/rows.length;
      q(statId).innerHTML=`Desvio médio: <strong>${fb(avg)}</strong>`;
      q(id).innerHTML=rows.map(r=>`<tr><td>${fd(r.maturity)}</td><td>${(+r.business_days).toLocaleString("pt-BR")}</td>
        <td>${isIpca?`IPCA + ${fp(r.buy_rate_pct)}`:fp(r.buy_rate_pct)}</td>
        <td>${isIpca?`IPCA + ${fp(r.curveRate)}`:fp(r.curveRate)}</td>
        <td class="${deltaClass(r.basis)}">${fb(r.basis)}</td></tr>`).join("");
    };
    render("prefixConnectionTable","prefixConnectionStat",pre,false);
    render("ipcaConnectionTable","ipcaConnectionStat",ipca,true);
  }

  async function renderConnections(){
    const d=q("connectionDate").value;if(!d)return;
    const de=S.di.entries.find(x=>x.date===d),ae=S.a.entries.find(x=>x.date===d),te=S.t?.entries?.find(x=>x.date===d);
    const [di,a,t]=await Promise.all([getJson(de.path),getJson(ae.path),te?getJson(te.path):Promise.resolve(null)]);
    const diCurve=di.contracts.filter(x=>finite(x.business_days)&&finite(x.rate_pct)).map(x=>({du:+x.business_days,rate:+x.rate_pct}));
    const aPre=(a.curves||[]).filter(x=>finite(x.pre_pct)).map(x=>({du:+x.du,rate:+x.pre_pct}));
    const rows=STANDARD_DU.map(du=>{
      const dr=flatForward(diCurve,du),pr=flatForward(aPre,du);
      return{du,di:dr,pre:pr,basis:(pr-dr)*100};
    }).filter(r=>Number.isFinite(r.di)&&Number.isFinite(r.pre));
    S.lastC={date:d,rows};
    q("basisStatus").textContent=`${fd(d)} · ${rows.length} vértices · flat forward`;
    const f=rows[0],l=rows.at(-1),cross=rows.slice(1).find((r,i)=>Math.sign(r.basis)!==Math.sign(rows[i].basis));
    q("basisTitle").textContent=cross?"As curvas se cruzam ao longo do prazo":"Basis com mesmo sinal nos vértices";
    q("basisText").textContent=`No curto (${approx(f.du)}), a ANBIMA está ${f.basis<0?"abaixo":"acima"} do DI em ${fb(Math.abs(f.basis)).replace("+","")}. Em ${approx(l.du)}, está ${l.basis<0?"abaixo":"acima"} em ${fb(Math.abs(l.basis)).replace("+","")}.${cross?` A mudança de sinal ocorre entre ${approx(rows[rows.indexOf(cross)-1].du)} e ${approx(cross.du)}.`:""} A interpolação da V2.1 usa flat forward.`;
    q("basisTable").innerHTML=rows.map(r=>`<tr><td><strong>${r.du.toLocaleString("pt-BR")} DU</strong></td><td>${approx(r.du)}</td>
      <td>${fp(r.di)}</td><td>${fp(r.pre)}</td><td class="delta ${r.basis>1?"pos":r.basis<-1?"neg":"flat"}">${fb(r.basis)}</td></tr>`).join("");
    const mx=Math.max(1,...rows.map(r=>Math.abs(r.basis)));
    q("basisBars").innerHTML=rows.map(r=>`<div class="basisBarRow"><span>${approx(r.du)}</span><div class="basisTrack"><i class="basisZero"></i>
      <i class="basisFill ${r.basis>=0?"pos":"neg"}" style="width:${Math.min(50,Math.abs(r.basis)/mx*50)}%"></i></div><strong class="basisValue">${fb(r.basis)}</strong></div>`).join("");
    renderConnectionChart(S.lastC);
    renderTreasuryConnections(t,a);
  }
  function renderConnectionChart(c){
    q("connectionLegend").innerHTML='<span><i style="background:#69b7ff"></i>DI · flat forward</span><span><i style="background:#ffc96b"></i>ANBIMA Pré</span>';
    lineChart("connectionChart",[
      {label:"DI interpolado",color:"#69b7ff",points:c.rows.map(r=>({x:r.du,y:r.di}))},
      {label:"ANBIMA Pré",color:"#ffc96b",points:c.rows.map(r=>({x:r.du,y:r.pre}))}
    ]);
  }

  function setupConnectionDates(){
    const diDates=new Set(S.di?.entries?.map(e=>e.date)||[]);
    const common=(S.a?.entries||[]).filter(e=>diDates.has(e.date)).sort((a,b)=>b.date.localeCompare(a.date));
    const sel=q("connectionDate");sel.innerHTML="";
    common.forEach(e=>sel.add(new Option(fd(e.date),e.date)));
    sel.disabled=!common.length;
    if(common.length){sel.value=common[0].date;sel.addEventListener("change",renderConnections);renderConnections();}
    else q("basisText").textContent="Ainda não há data em comum entre DI e ANBIMA.";
  }


  function annualPctOfCdi(cdiAnnual,pctCdi){
    if(!Number.isFinite(cdiAnnual)||!Number.isFinite(pctCdi))return NaN;
    const daily=Math.pow(1+cdiAnnual/100,1/252)-1;
    return (Math.pow(1+(pctCdi/100)*daily,252)-1)*100;
  }
  function annualIpcaPlus(ipca,spread){
    if(!Number.isFinite(ipca)||!Number.isFinite(spread))return NaN;
    return ((1+ipca/100)*(1+spread/100)-1)*100;
  }
  function finalValue(amount,annualRate,du){
    if(!Number.isFinite(amount)||!Number.isFinite(annualRate)||!Number.isFinite(du))return NaN;
    return amount*Math.pow(1+annualRate/100,du/252);
  }
  function realRate(nominal,ipca){
    if(!Number.isFinite(nominal)||!Number.isFinite(ipca))return NaN;
    return ((1+nominal/100)/(1+ipca/100)-1)*100;
  }
  function cdiBreakevenForAnnualTarget(targetAnnual,pctCdi){
    if(!Number.isFinite(targetAnnual)||!Number.isFinite(pctCdi)||pctCdi<=0)return NaN;
    const targetDaily=Math.pow(1+targetAnnual/100,1/252)-1;
    const cdiDaily=targetDaily/(pctCdi/100);
    return (Math.pow(1+cdiDaily,252)-1)*100;
  }
  function ipcaBreakeven(targetNominal,spread){
    if(!Number.isFinite(targetNominal)||!Number.isFinite(spread))return NaN;
    return ((1+targetNominal/100)/(1+spread/100)-1)*100;
  }
  function pctInput(id){
    const v=parseFloat(q(id)?.value);
    return Number.isFinite(v)?v:NaN;
  }
  function moneyInput(id){
    const v=parseFloat(q(id)?.value);
    return Number.isFinite(v)?v:NaN;
  }
  function marketCurvesForDate(date){
    const de=S.di?.entries?.find(x=>x.date===date),ae=S.a?.entries?.find(x=>x.date===date);
    if(!de||!ae)return Promise.resolve(null);
    return Promise.all([getJson(de.path),getJson(ae.path)]).then(([di,a])=>({di,a}));
  }
  function currentDecisionRefs(bundle,du){
    if(!bundle)return null;
    const diCurve=(bundle.di.contracts||[]).filter(x=>finite(x.business_days)&&finite(x.rate_pct)).map(x=>({du:+x.business_days,rate:+x.rate_pct}));
    const pre=(bundle.a.curves||[]).filter(x=>finite(x.pre_pct)).map(x=>({du:+x.du,rate:+x.pre_pct}));
    const real=(bundle.a.curves||[]).filter(x=>finite(x.ipca_pct)).map(x=>({du:+x.du,rate:+x.ipca_pct}));
    const implied=(bundle.a.curves||[]).filter(x=>finite(x.implied_pct)).map(x=>({du:+x.du,rate:+x.implied_pct}));
    return {di:flatForward(diCurve,du),pre:flatForward(pre,du),real:flatForward(real,du),implied:flatForward(implied,du)};
  }
  function setupDecisionDates(){
    const diDates=new Set(S.di?.entries?.map(e=>e.date)||[]);
    const common=(S.a?.entries||[]).filter(e=>diDates.has(e.date)).sort((a,b)=>b.date.localeCompare(a.date));
    const sel=q("decisionDate"); if(!sel)return;
    sel.innerHTML="";
    common.forEach(e=>sel.add(new Option(fd(e.date),e.date)));
    sel.disabled=!common.length;
    if(common.length)sel.value=common[0].date;
    sel.addEventListener("change",renderDecision);
    ["rfAmount","rfHorizon","rfPctCdi","rfPre","rfIpcaSpread","rfCdiScenario","rfIpcaScenario"].forEach(id=>{
      q(id)?.addEventListener("input",renderDecision);
      q(id)?.addEventListener("change",renderDecision);
    });
    q("useMarketScenario")?.addEventListener("click",async()=>{
      const d=sel.value,du=+q("rfHorizon").value,bundle=await marketCurvesForDate(d),refs=currentDecisionRefs(bundle,du);
      if(refs){
        if(Number.isFinite(refs.di))q("rfCdiScenario").value=refs.di.toFixed(2);
        if(Number.isFinite(refs.implied))q("rfIpcaScenario").value=refs.implied.toFixed(2);
      }
      renderDecision();
    });
  }
  async function renderDecision(){
    if(!q("rfProductCards")||!q("decisionDate"))return;
    const d=q("decisionDate").value;if(!d)return;
    const du=+q("rfHorizon").value;
    const amount=moneyInput("rfAmount"),pctCdi=pctInput("rfPctCdi"),preRate=pctInput("rfPre"),
      ipcaSpread=pctInput("rfIpcaSpread"),cdiScenario=pctInput("rfCdiScenario"),ipcaScenario=pctInput("rfIpcaScenario");
    const bundle=await marketCurvesForDate(d),refs=currentDecisionRefs(bundle,du);
    if(!refs)return;

    q("rfReferenceTitle").textContent=`Mesmo prazo · ${approx(du)} · ${du.toLocaleString("pt-BR")} DU`;
    q("rfReferenceStatus").textContent=fd(d);
    const preVsCurve=Number.isFinite(refs.pre)?(preRate-refs.pre)*100:NaN;
    const realVsCurve=Number.isFinite(refs.real)?(ipcaSpread-refs.real)*100:NaN;
    q("rfReferenceCards").innerHTML=`
      <article><span>DI · referência</span><strong>${fp(refs.di)}</strong><small>flat forward</small></article>
      <article><span>ANBIMA Pré</span><strong>${fp(refs.pre)}</strong><small>mesmo DU</small></article>
      <article><span>ANBIMA juro real</span><strong>${fp(refs.real)}</strong><small>ETTJ IPCA</small></article>
      <article><span>Inflação implícita</span><strong>${fp(refs.implied)}</strong><small>curva nominal × real</small></article>
      <article><span>LCI Pré − ANBIMA</span><strong class="${deltaClass(preVsCurve)}">${fb(preVsCurve)}</strong><small>taxa/prazo; risco diferente</small></article>
      <article><span>LCI IPCA+ − real</span><strong class="${deltaClass(realVsCurve)}">${fb(realVsCurve)}</strong><small>taxa/prazo; risco diferente</small></article>`;

    const postAnnual=annualPctOfCdi(cdiScenario,pctCdi);
    const ipcaNominal=annualIpcaPlus(ipcaScenario,ipcaSpread);
    const postFinal=finalValue(amount,postAnnual,du),preFinal=finalValue(amount,preRate,du),ipcaFinal=finalValue(amount,ipcaNominal,du);
    const products=[
      {name:"LCI Pós",rate:postAnnual,rateLabel:`${pctCdi.toLocaleString("pt-BR",{maximumFractionDigits:2})}% do CDI`,final:postFinal,real:realRate(postAnnual,ipcaScenario),detail:`CDI médio usado: ${fp(cdiScenario,2)}`},
      {name:"LCI Pré",rate:preRate,rateLabel:`${fp(preRate,2)} a.a.`,final:preFinal,real:realRate(preRate,ipcaScenario),detail:"taxa travada no cenário"},
      {name:"LCI IPCA+",rate:ipcaNominal,rateLabel:`IPCA + ${fp(ipcaSpread,2)}`,final:ipcaFinal,real:ipcaSpread,detail:`IPCA médio usado: ${fp(ipcaScenario,2)}`}
    ];
    const validFinals=products.map(p=>p.final).filter(Number.isFinite),maxFinal=validFinals.length?Math.max(...validFinals):NaN;
    q("rfProductCards").innerHTML=products.map(p=>`
      <article class="rfProductCard ${Number.isFinite(maxFinal)&&Math.abs(p.final-maxFinal)<.01?"scenarioLeader":""}">
        <div class="rfProductHead"><span>${p.name}</span>${Number.isFinite(maxFinal)&&Math.abs(p.final-maxFinal)<.01?'<em>maior valor no cenário</em>':""}</div>
        <strong>${p.rateLabel}</strong>
        <div class="rfProductValue">${fm(p.final)}</div>
        <div class="rfProductMeta"><span>taxa nominal modelada <b>${fp(p.rate,2)}</b></span><span>retorno real modelado <b>${fp(p.real,2)}</b></span></div>
        <small>${p.detail}</small>
      </article>`).join("");

    const cdiBE=cdiBreakevenForAnnualTarget(preRate,pctCdi);
    const ipcaPreBE=ipcaBreakeven(preRate,ipcaSpread);
    const ipcaPostBE=ipcaBreakeven(postAnnual,ipcaSpread);
    q("rfBreakevens").innerHTML=`
      <article><span>Pós empata com Pré</span><strong>CDI médio ${fp(cdiBE,2)}</strong><small>com LCI a ${pctCdi.toLocaleString("pt-BR",{maximumFractionDigits:2})}% do CDI</small></article>
      <article><span>IPCA+ empata com Pré</span><strong>IPCA médio ${fp(ipcaPreBE,2)}</strong><small>mantida a taxa real de ${fp(ipcaSpread,2)}</small></article>
      <article><span>IPCA+ empata com Pós</span><strong>IPCA médio ${fp(ipcaPostBE,2)}</strong><small>considerando CDI do cenário</small></article>`;

    const postVsPre=postFinal-preFinal,ipcaVsPre=ipcaFinal-preFinal;
    const sentencePost=postVsPre>0
      ? `Com CDI médio de ${fp(cdiScenario,2)}, a LCI Pós modelada supera a Pré em ${fm(postVsPre)} no horizonte.`
      : `Com CDI médio de ${fp(cdiScenario,2)}, a LCI Pré modelada supera a Pós em ${fm(Math.abs(postVsPre))} no horizonte.`;
    const sentenceIpca=ipcaVsPre>0
      ? `Com IPCA médio de ${fp(ipcaScenario,2)}, a LCI IPCA+ modelada supera a Pré em ${fm(ipcaVsPre)}.`
      : `Com IPCA médio de ${fp(ipcaScenario,2)}, a LCI Pré modelada supera a IPCA+ em ${fm(Math.abs(ipcaVsPre))}.`;
    q("rfScenarioReading").innerHTML=`<p class="eyebrow">LEITURA DO CENÁRIO</p><p>${sentencePost} ${sentenceIpca}</p>
      <p class="rfCaution">Comparação matemática em cenário constante. Liquidez, carência, crédito, concentração, FGC e objetivo do cliente podem pesar mais que a diferença de retorno modelada.</p>`;
  }

  function fixV2Copy(){
    const period=q("periodLabel");
    if(period&&period.textContent.includes("1 dia corridos"))period.textContent=period.textContent.replace("1 dia corridos","1 dia corrido");
    const evo=q("evolutionLegend");
    if(evo){
      evo.querySelectorAll("strong").forEach(el=>{if(el.textContent.trim()==="Hoje")el.textContent="Selecionada";});
      if(!evo.querySelector("strong"))evo.childNodes.forEach(n=>{if(n.nodeType===3&&n.textContent.includes("Hoje"))n.textContent=n.textContent.replace("Hoje","Selecionada");});
    }
  }

  async function boot(){
    setupTabs();
    const [d,a,t]=await Promise.allSettled([getJson("data/index.json"),getJson("data/anbima/index.json"),getJson("data/tesouro/index.json")]);
    if(d.status==="fulfilled")S.di=d.value;if(a.status==="fulfilled")S.a=a.value;if(t.status==="fulfilled")S.t=t.value;
    if(S.a?.entries?.length){fillSelect(q("anbimaDate"),S.a,renderAnbima);await renderAnbima();}
    fillSelect(q("tesouroDate"),S.t,renderTesouro);await renderTesouro();
    if(S.di&&S.a){
      setupConnectionDates();
      setupDecisionDates();
      renderDecision();
    }
    fixV2Copy();
    const root=q("tab-di");if(root)new MutationObserver(fixV2Copy).observe(root,{subtree:true,childList:true,characterData:true});
  }

  window.addEventListener("resize",()=>{
    if(q("tab-anbima")?.classList.contains("active")&&S.lastA)renderAnbimaChart(S.lastA);
    if(q("tab-conexoes")?.classList.contains("active")&&S.lastC)renderConnectionChart(S.lastC);
    if(q("tab-tesouro")?.classList.contains("active")&&S.lastHistory)renderHistoryCharts(S.lastHistory);
  });
  window.addEventListener("DOMContentLoaded",boot);
})();