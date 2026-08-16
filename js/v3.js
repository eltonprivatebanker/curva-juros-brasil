(() => {
  const V3_TENORS = [
    {du:126,label:"6M"},
    {du:252,label:"1A"},
    {du:504,label:"2A"},
    {du:756,label:"3A"},
    {du:1260,label:"5A"},
    {du:1764,label:"7A"},
    {du:2520,label:"10A"},
  ];
  const q=id=>document.getElementById(id);

  function v3Average(xs){
    const a=(xs||[]).filter(Number.isFinite);
    return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
  }

  function v3FlatForward(contracts,targetDu){
    const pts=(contracts||[])
      .filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct)&&+c.business_days>0)
      .map(c=>({du:+c.business_days,rate:+c.rate_pct}))
      .sort((a,b)=>a.du-b.du);

    const exact=pts.find(p=>p.du===targetDu);
    if(exact)return exact.rate;

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

  function v3NormalizedRows(current,compare){
    return V3_TENORS.map(t=>{
      const cur=v3FlatForward(current?.contracts,t.du);
      const prev=v3FlatForward(compare?.contracts,t.du);
      return {...t,current:cur,compare:prev,
        bps:Number.isFinite(cur)&&Number.isFinite(prev)?(cur-prev)*100:NaN};
    });
  }

  function v3SetMetric(id,value){
    const el=q(id);
    if(!el)return;
    el.textContent=fmtBp(value);
    el.className=!Number.isFinite(value)?"delta flat":
      value<-1?"delta neg":value>1?"delta pos":"delta flat";
  }

  /* DI: leitura principal pelos mesmos prazos normalizados do gráfico */
  renderReading=function(_pairs,currentDate,compareDate){
    if(!state?.current||!state?.compare)return;
    const rows=v3NormalizedRows(state.current,state.compare);
    const valid=rows.filter(r=>Number.isFinite(r.bps));
    if(!valid.length)return;

    const opened=valid.filter(r=>r.bps>1);
    const closed=valid.filter(r=>r.bps<-1);
    const stable=valid.length-opened.length-closed.length;
    const strongest=[...valid].sort((a,b)=>Math.abs(b.bps)-Math.abs(a.bps))[0];

    let title="Movimento misto",pillText="↕ MISTO",kind="neutral",lead="";
    if(opened.length===valid.length){
      title="Abertura generalizada"; pillText="↑ ABERTURA"; kind="open";
      lead=`As taxas subiram nos ${valid.length} prazos constantes analisados.`;
    }else if(closed.length===valid.length){
      title="Fechamento generalizado"; pillText="↓ FECHAMENTO"; kind="close";
      lead=`As taxas caíram nos ${valid.length} prazos constantes analisados.`;
    }else if(opened.length>=Math.ceil(valid.length*.67)){
      title="Predomínio de abertura"; pillText="↑ ABERTURA"; kind="open";
      lead=`As taxas subiram em ${opened.length} dos ${valid.length} prazos constantes analisados.`;
    }else if(closed.length>=Math.ceil(valid.length*.67)){
      title="Predomínio de fechamento"; pillText="↓ FECHAMENTO"; kind="close";
      lead=`As taxas caíram em ${closed.length} dos ${valid.length} prazos constantes analisados.`;
    }else{
      lead=`O movimento foi misto: ${opened.length} prazos abriram, ${closed.length} fecharam${stable?` e ${stable} ficaram estáveis`:""}.`;
    }

    const short=v3Average(valid.filter(r=>r.du<=252).map(r=>r.bps));
    const mid=v3Average(valid.filter(r=>r.du>=504&&r.du<=756).map(r=>r.bps));
    const long=v3Average(valid.filter(r=>r.du>=1260).map(r=>r.bps));

    q("movementTitle").textContent=title;
    const pill=q("movementPill");
    pill.textContent=pillText;
    pill.className=`movementPill ${kind}`;

    q("movementText").textContent=
      `De ${fmtDate(compareDate)} para ${fmtDate(currentDate)}, ${lead} `+
      `O maior movimento ocorreu em ${strongest.label}, com ${fmtBp(strongest.bps)}. `+
      `As faixas abaixo usam os mesmos prazos constantes do gráfico.`;

    v3SetMetric("shortMove",short);
    v3SetMetric("midMove",mid);
    v3SetMetric("longMove",long);

    const largest=q("largestMove");
    largest.textContent=`${strongest.label} ${fmtBp(strongest.bps)}`;
    largest.className=strongest.bps<-1?"delta neg":strongest.bps>1?"delta pos":"delta flat";

    const days=Math.abs(calendarDayDiff(currentDate,compareDate));
    q("periodLabel").textContent=
      `${fmtDate(compareDate)} → ${fmtDate(currentDate)} · ${days} dia${days===1?"":"s"} corridos`;
  };

  /* Evolução: mesma interpolação flat-forward e leitura incluindo 6M */
  function v3NormalizeContracts(contracts){
    return V3_TENORS.map(t=>{
      const rate=v3FlatForward(contracts,t.du);
      return Number.isFinite(rate)
        ?{ticker:t.label,maturity:t.label,business_days:t.du,rate_pct:rate}
        :null;
    }).filter(Boolean);
  }

  function v3EvolutionReading(series){
    const host=q("evolutionReading");
    if(!host)return;

    const normalized=(series||[]).map(s=>({...s,contracts:v3NormalizeContracts(s.contracts)}));
    const current=normalized.find(s=>s.current)||normalized[0];
    const reference=normalized.filter(s=>!s.current).at(-1);
    if(!current||!reference){
      host.textContent="Selecione ao menos uma janela histórica para comparar com a curva atual.";
      return;
    }

    const rows=V3_TENORS.map(t=>{
      const a=current.contracts.find(p=>p.business_days===t.du)?.rate_pct;
      const b=reference.contracts.find(p=>p.business_days===t.du)?.rate_pct;
      return {...t,bps:Number.isFinite(a)&&Number.isFinite(b)?(a-b)*100:NaN};
    }).filter(r=>Number.isFinite(r.bps));

    if(!rows.length){
      host.textContent=`Não há área comum suficiente para resumir a comparação com ${reference.label}.`;
      return;
    }

    const up=rows.filter(r=>r.bps>1),down=rows.filter(r=>r.bps<-1);
    const strongest=[...rows].sort((a,b)=>Math.abs(b.bps)-Math.abs(a.bps))[0];

    let text;
    if(up.length===rows.length){
      text=`Na comparação com ${reference.label} (${fmtDate(reference.date)}), a curva atual está acima nos ${rows.length} prazos normalizados.`;
    }else if(down.length===rows.length){
      text=`Na comparação com ${reference.label} (${fmtDate(reference.date)}), a curva atual está abaixo nos ${rows.length} prazos normalizados.`;
    }else if(up.length>=Math.ceil(rows.length*.67)){
      text=`Na comparação com ${reference.label} (${fmtDate(reference.date)}), predomina a abertura: ${up.length} de ${rows.length} prazos estão acima.`;
    }else if(down.length>=Math.ceil(rows.length*.67)){
      text=`Na comparação com ${reference.label} (${fmtDate(reference.date)}), predomina o fechamento: ${down.length} de ${rows.length} prazos estão abaixo.`;
    }else{
      text=`Na comparação com ${reference.label} (${fmtDate(reference.date)}), o movimento é misto: ${up.length} prazos acima e ${down.length} abaixo.`;
    }
    host.textContent=`${text} A maior diferença aparece em ${strongest.label}, com ${fmtBp(strongest.bps)}.`;
  }

  function v3EvolutionAxes(svg,scales){
    const {width,height,pad,yMin,yMax,sx,sy}=scales;
    niceTicks(yMin,yMax,5).forEach(y=>{
      const yy=sy(y);
      svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:"grid"}));
      const t=svgEl("text",{x:pad.l-10,y:yy+4,"text-anchor":"end",class:"evoAxisLabel"});
      t.textContent=`${y.toFixed(2)}%`; svg.append(t);
    });
    V3_TENORS.forEach(tick=>{
      const xx=sx(tick.du);
      svg.append(svgEl("line",{x1:xx,x2:xx,y1:pad.t,y2:height-pad.b,class:"grid"}));
      const t=svgEl("text",{x:xx,y:height-18,"text-anchor":"middle",class:"evoTenorLabel"});
      t.textContent=tick.label;
      const tt=svgEl("title"); tt.textContent=`${tick.du.toLocaleString("pt-BR")} dias úteis`;
      t.append(tt); svg.append(t);
    });
    svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:height-pad.b,y2:height-pad.b,class:"axis"}));
  }

  renderEvolutionChart=function(series){
    const host=q("evolutionChart");
    if(!host)return;
    host.innerHTML="";

    const normalized=(series||[]).map(s=>({...s,contracts:v3NormalizeContracts(s.contracts)}));
    const valid=normalized.filter(s=>(s.contracts||[]).length>=2);
    const scales=buildChartScales(valid,host);

    if(!scales){
      host.innerHTML='<div class="error">Sem dados suficientes para o gráfico histórico.</div>';
      v3EvolutionReading([]);
      return;
    }

    const svg=svgEl("svg",{viewBox:`0 0 ${scales.width} ${scales.height}`,
      role:"img","aria-label":"Evolução histórica da curva DI por prazos constantes"});
    v3EvolutionAxes(svg,scales);

    valid.forEach(item=>{
      plotSeries(svg,item.contracts,scales,{
        className:item.current?"seriesLine current":"seriesLine",
        stroke:item.color,
        strokeWidth:item.current?3.5:2.1,
        opacity:item.current?1:.78,
        showPoints:true,
        pointRadius:item.current?4.2:3.2,
        pointClass:item.current?"seriesPoint current":"seriesPoint"
      });
    });

    host.append(svg);
    if(typeof renderEvolutionLegend==="function")renderEvolutionLegend(series);
    v3EvolutionReading(series);
  };

  function setupDiHelp(){
    const reading=q("movementText")?.closest(".reading");
    if(!reading||reading.querySelector(".v3InlineHelp"))return;
    const details=document.createElement("details");
    details.className="v3InlineHelp";
    details.innerHTML=`
      <summary>ⓘ Como interpretar esta leitura</summary>
      <p><strong>Abertura</strong> = taxa subiu; <strong>fechamento</strong> = taxa caiu. Na V3, curto (6M–1A), médio (2A–3A) e longo (5A–10A) usam vértices normalizados por prazo constante, não médias de contratos diferentes.</p>`;
    reading.append(details);
  }

  let januaryExpanded=false;
  function applyJanuarySummary(){
    const grid=q("januaryGrid");
    if(!grid)return;
    const cards=[...grid.children];
    if(!cards.length)return;

    let keep=new Set(cards.map((_,i)=>i));
    if(!januaryExpanded&&cards.length>7){
      keep=new Set(Array.from({length:7},(_,i)=>Math.round(i*(cards.length-1)/6)));
    }
    cards.forEach((card,i)=>card.classList.toggle("v3JanuaryHidden",!keep.has(i)));

    const count=q("januaryCount");
    if(count)count.textContent=januaryExpanded
      ?`${cards.length} vértices`
      :`${Math.min(7,cards.length)} de ${cards.length} vértices`;

    const btn=q("v3JanuaryToggle");
    if(btn)btn.textContent=januaryExpanded?"Mostrar principais":"Ver todos os contratos de janeiro";
  }

  function setupJanuarySummary(){
    const panel=document.querySelector(".januaryPanel");
    const head=panel?.querySelector(".panelHead");
    const count=q("januaryCount");
    if(!panel||!head||!count)return;

    let actions=head.querySelector(".v3JanuaryActions");
    if(!actions){
      actions=document.createElement("div");
      actions.className="v3JanuaryActions";
      head.append(actions);
      actions.append(count);

      const btn=document.createElement("button");
      btn.type="button";
      btn.id="v3JanuaryToggle";
      btn.className="secondaryButton";
      btn.textContent="Ver todos os contratos de janeiro";
      btn.addEventListener("click",()=>{
        januaryExpanded=!januaryExpanded;
        applyJanuarySummary();
      });
      actions.append(btn);
    }

    const grid=q("januaryGrid");
    if(grid){
      new MutationObserver(applyJanuarySummary).observe(grid,{childList:true});
      applyJanuarySummary();
    }
  }

  function reorderDecision(){
    const tab=q("tab-decisao");
    if(!tab)return;
    const form=tab.querySelector(".decisionFormPanel");
    const result=q("rfProductCards")?.closest("section.panel");
    const refs=q("rfReferenceCards")?.closest("section.panel");
    const history=q("rfHistoryCards")?.closest("section.panel");

    if(form&&result){
      form.after(result);
      result.classList.add("v3PrimaryResult");
    }
    if(result&&refs)result.after(refs);
    if(refs&&history)refs.after(history);
  }

  function replaceTextNodes(root,from,to){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{
      if(n.nodeValue.includes(from))n.nodeValue=n.nodeValue.split(from).join(to);
    });
  }

  function setupDecisionCopy(){
    const host=q("rfProductCards");
    if(!host)return;
    const apply=()=>replaceTextNodes(host,"maior valor no cenário","maior montante modelado");
    new MutationObserver(apply).observe(host,{childList:true,subtree:true,characterData:true});
    apply();
  }

  function setupAnbimaSemantics(){
    const host=q("anbimaCards");
    if(!host)return;
    const apply=()=>replaceTextNodes(host,"Real ","Juro real ");
    new MutationObserver(apply).observe(host,{childList:true,subtree:true,characterData:true});
    apply();
  }

  let tesouroInitialized=false;
  function selectTesouroDefault(){
    if(tesouroInitialized)return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const btn=document.querySelector('#tesouroFilters [data-tfilter="prefixado"]');
      if(btn){
        clearInterval(timer);
        tesouroInitialized=true;
        btn.click();

        const filters=q("tesouroFilters");
        if(filters&&!q("v3TesouroHint")){
          const p=document.createElement("p");
          p.id="v3TesouroHint";
          p.className="v3TesouroHint";
          p.textContent="V3 abre em Prefixados para reduzir ruído. Use os filtros acima para trocar a família de títulos ou exibir Todos.";
          filters.after(p);
        }
      }else if(tries>40){
        clearInterval(timer);
      }
    },100);
  }

  const SOURCE_BY_TAB={
    resumo:["RESUMO","B3 + ANBIMA + Tesouro Nacional + BCB"],
    di:["B3 · DI1","DI Futuro · contratos de juros negociados na B3"],
    anbima:["ANBIMA","ETTJ · curva nominal, real e implícita"],
    tesouro:["TESOURO","Tesouro Nacional · taxas e preços"],
    conexoes:["MULTIFONTE","B3 + ANBIMA + Tesouro Nacional"],
    cenarios:["BCB + B3","CDI realizado + curva DI"],
    aprender:["GUIA","Conteúdo educacional do painel"],
    decisao:["CENÁRIOS","B3 + ANBIMA + BCB"],
  };

  function updateGlobalSource(tab){
    const [badge,source]=SOURCE_BY_TAB[tab]||SOURCE_BY_TAB.di;
    const b=q("modeBadge"),s=q("sourceText");
    if(b)b.textContent=badge;
    if(s)s.textContent=source;
  }

  function setupTabSemantics(){
    document.querySelectorAll("[data-tab]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const tab=btn.dataset.tab;
        setTimeout(()=>updateGlobalSource(tab),0);
        if(tab==="tesouro")setTimeout(selectTesouroDefault,0);
      });
    });
    updateGlobalSource(document.querySelector("[data-tab].active")?.dataset.tab||"di");
  }

  function boot(){
    setupDiHelp();
    setupJanuarySummary();
    reorderDecision();
    setupDecisionCopy();
    setupAnbimaSemantics();
    setupTabSemantics();

    setTimeout(()=>{
      const tab=document.querySelector("[data-tab].active")?.dataset.tab||"di";
      updateGlobalSource(tab);
    },1200);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot);
  }else{
    boot();
  }
})();


/* ==========================================================
   Juros Brasil · V3.1 — compreensão primeiro
   ========================================================== */
(() => {
  const $ = id => document.getElementById(id);
  const TENORS = [
    {du:126,label:"6M"},
    {du:252,label:"1A"},
    {du:504,label:"2A"},
    {du:756,label:"3A"},
    {du:1260,label:"5A"},
    {du:1764,label:"7A"},
    {du:2520,label:"10A"},
  ];
  const cache = new Map();

  async function getJson(path) {
    if (cache.has(path)) return cache.get(path);
    const p = fetch(path,{cache:"no-store"}).then(r=>{
      if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    cache.set(path,p);
    return p;
  }

  function flatForward(contracts,targetDu) {
    const pts=(contracts||[])
      .filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct)&&+c.business_days>0)
      .map(c=>({du:+c.business_days,rate:+c.rate_pct}))
      .sort((a,b)=>a.du-b.du);

    const exact=pts.find(p=>p.du===targetDu);
    if(exact)return exact.rate;

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

  function avg(xs) {
    const a=xs.filter(Number.isFinite);
    return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
  }

  function pct(v,d=2) {
    return Number.isFinite(v)
      ? `${v.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d})}%`
      : "—";
  }

  function bp(v) {
    return Number.isFinite(v)
      ? `${v>0?"+":""}${v.toLocaleString("pt-BR",{maximumFractionDigits:1})} bps`
      : "—";
  }

  function dateBr(iso) {
    if(!iso)return"—";
    const [y,m,d]=iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function goTo(tab) {
    const btn=document.querySelector(`[data-tab="${tab}"]`);
    if(btn)btn.click();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function setupNavigationCards() {
    document.querySelectorAll("[data-v31-goto]").forEach(el=>{
      el.addEventListener("click",e=>{
        if(e.target.closest("a"))return;
        goTo(el.dataset.v31Goto);
      });
    });
  }

  const QUESTIONS={
    di:{
      q:"O que são as taxas DI — e por que elas mudam?",
      h:"Primeiro entenda quem negocia DI1 e como a Curva DI é formada; depois veja se os juros abriram ou fecharam em cada prazo."
    },
    anbima:{
      q:"O que é ETTJ — e quanto o mercado exige em cada prazo?",
      h:"ETTJ significa Estrutura a Termo da Taxa de Juros. Primeiro entenda a curva; depois compare juros nominais, juro real e inflação implícita."
    },
    tesouro:{
      q:"Quais taxas o Tesouro está oferecendo — e como elas mudaram?",
      h:"Os cards mostram a faixa de taxas por família. No modo Técnico, você abre a tabela título a título."
    },
    conexoes:{
      q:"DI, ANBIMA e Tesouro estão contando a mesma história?",
      h:"Observe onde as curvas se afastam ou se cruzam. Diferença de taxa aqui não deve ser tratada automaticamente como spread de crédito."
    },
    cenarios:{
      q:"O nível atual é alto ou baixo comparado ao histórico?",
      h:"Compare o mesmo horizonte: última janela realizada, faixa histórica e curva DI atual. Histórico não é previsão."
    },
    aprender:{
      q:"Como transformar movimentos da curva em leitura de mercado?",
      h:"Esta área explica os conceitos e conecta juros, renda fixa, fundos, Bolsa e IFIX."
    },
    decisao:{
      q:"Como Pós, Pré e IPCA+ se comparam no mesmo horizonte?",
      h:"Primeiro veja o resultado modelado; depois confira cenário, histórico, liquidez, crédito e demais riscos."
    }
  };

  function insertQuestions() {
    Object.entries(QUESTIONS).forEach(([tab,info])=>{
      const pane=$(`tab-${tab}`);
      if(!pane||pane.querySelector(".v31Question"))return;
      const box=document.createElement("section");
      box.className="v31Question";
      box.innerHTML=`<span>ESTA ABA RESPONDE</span><strong>${info.q}</strong><small>${info.h}</small>`;
      pane.prepend(box);
    });
  }

  function markTechnical() {
    const targets=[
      $("curveTable")?.closest("section.panel"),
      $("anbimaTable")?.closest("section.panel"),
      $("anbimaParams")?.closest("section.panel"),
      $("tesouroTable")?.closest("section.panel"),
      $("scenarioForwardTable")?.closest("section.panel"),
      $("scenarioMatrix")?.closest("section.panel"),
    ].filter(Boolean);

    targets.forEach(x=>x.classList.add("v31Technical"));

    const basisWrap=$("basisTable")?.closest(".tableWrap");
    if(basisWrap)basisWrap.classList.add("v31Technical");

    document.querySelectorAll(".methodologyDetails,.anbimaMethodPanel").forEach(x=>x.classList.add("v31Technical"));
  }

  function applyMode(mode) {
    const technical=mode==="technical";
    document.body.classList.toggle("v31-essential",!technical);
    document.body.classList.toggle("v31-technical",technical);
    document.querySelectorAll("[data-v31-mode]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.v31Mode===mode);
    });
    try{localStorage.setItem("jurosBrasilV31Mode",mode);}catch{}
    setTimeout(()=>window.dispatchEvent(new Event("resize")),0);
  }

  function setupMode() {
    let mode="essential";
    try{
      const saved=localStorage.getItem("jurosBrasilV31Mode");
      if(saved==="technical"||saved==="essential")mode=saved;
    }catch{}
    document.querySelectorAll("[data-v31-mode]").forEach(btn=>{
      btn.addEventListener("click",()=>applyMode(btn.dataset.v31Mode));
    });
    applyMode(mode);
  }

  function activeSourceSummary() {
    const badge=$("modeBadge"),source=$("sourceText");
    if(badge)badge.textContent="RESUMO";
    if(source)source.textContent="B3 + ANBIMA + Tesouro Nacional + BCB";
  }

  async function loadSummary() {
    try{
      const diIndex=await getJson("data/index.json");
      const entries=[...(diIndex.entries||[])].sort((a,b)=>a.date.localeCompare(b.date));
      const currentEntry=entries.at(-1);
      const prevEntry=entries.at(-2);

      if(currentEntry&&prevEntry){
        const [cur,prev]=await Promise.all([getJson(currentEntry.path),getJson(prevEntry.path)]);
        const rows=TENORS.map(t=>{
          const a=flatForward(cur.contracts,t.du);
          const b=flatForward(prev.contracts,t.du);
          return {...t,bps:Number.isFinite(a)&&Number.isFinite(b)?(a-b)*100:NaN,current:a};
        }).filter(r=>Number.isFinite(r.bps));

        const up=rows.filter(r=>r.bps>1);
        const down=rows.filter(r=>r.bps<-1);
        let main="Movimento misto";
        if(up.length===rows.length)main="Abertura generalizada";
        else if(down.length===rows.length)main="Fechamento generalizado";
        else if(up.length>=Math.ceil(rows.length*.67))main="Predomínio de abertura";
        else if(down.length>=Math.ceil(rows.length*.67))main="Predomínio de fechamento";

        const strongest=[...rows].sort((a,b)=>Math.abs(b.bps)-Math.abs(a.bps))[0];
        if($("v31MoveMain"))$("v31MoveMain").textContent=main;
        if($("v31MoveMeta"))$("v31MoveMeta").textContent=
          `${up.length} abriram · ${down.length} fecharam${strongest?` · maior movimento: ${strongest.label} ${bp(strongest.bps)}`:""}`;

        const buckets=[
          {name:"Curto · 6M–1A",value:avg(rows.filter(r=>r.du<=252).map(r=>r.bps))},
          {name:"Miolo · 2A–3A",value:avg(rows.filter(r=>r.du>=504&&r.du<=756).map(r=>r.bps))},
          {name:"Longo · 5A–10A",value:avg(rows.filter(r=>r.du>=1260).map(r=>r.bps))}
        ].filter(x=>Number.isFinite(x.value))
         .sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
        const region=buckets[0];
        if(region){
          $("v31WhereMain").textContent=region.name;
          $("v31WhereMeta").textContent=`Maior deslocamento médio entre as três faixas: ${bp(region.value)}.`;
        }

        const di5=rows.find(r=>r.du===1260)?.current;
        if(Number.isFinite(di5)){
          $("v31HistoryMain").textContent=`DI 5A · ${pct(di5)}`;
          $("v31HistoryMeta").textContent="Agora compare esse nível com mediana, P25 e P75 na aba Histórico e cenários.";
        }

        $("v31SummaryDate").textContent=`Curva DI · ${dateBr(currentEntry.date)}`;
      }

      const aIndex=await getJson("data/anbima/index.json");
      const ae=(aIndex.entries||[]).find(e=>e.date===aIndex.latest)||(aIndex.entries||[]).at(-1);
      if(ae){
        const a=await getJson(ae.path);
        const r=(a.curves||[]).find(x=>+x.du===1260)||(a.curves||[]).find(x=>+x.du===1764);
        if(r){
          $("v31SovMain").textContent=`Pré ${pct(+r.pre_pct)}`;
          $("v31SovMeta").textContent=
            `Juro real ${pct(+r.ipca_pct)} · inflação implícita ${pct(+r.implied_pct)} · ${(+r.du/252).toLocaleString("pt-BR",{maximumFractionDigits:1})}A.`;
        }
      }
    }catch(err){
      console.error("Resumo V3.1:",err);
      if($("v31MoveMain"))$("v31MoveMain").textContent="Abra Juros futuros";
      if($("v31MoveMeta"))$("v31MoveMeta").textContent="Não foi possível montar o resumo automático neste carregamento.";
    }
  }

  function tryHistoryEnhancement() {
    const cards=$("scenarioCards");
    if(!cards||!cards.textContent.trim())return;
    const blocks=[...cards.children];
    const med=blocks.find(x=>/Mediana/i.test(x.textContent));
    const di=blocks.find(x=>/Curva DI/i.test(x.textContent));
    if(!med||!di)return;

    const medVal=med.querySelector("strong")?.textContent?.trim();
    const diVal=di.querySelector("strong")?.textContent?.trim();
    const medNum=medVal?parseFloat(medVal.replace(".","").replace(",",".")):NaN;
    const diNum=diVal?parseFloat(diVal.replace(".","").replace(",",".")):NaN;
    if(Number.isFinite(medNum)&&Number.isFinite(diNum)){
      $("v31HistoryMain").textContent=diNum>medNum?"Acima da mediana":"Abaixo da mediana";
      $("v31HistoryMeta").textContent=`DI 5A ${diVal} · mediana histórica ${medVal}. Veja a distribuição completa na aba Histórico e cenários.`;
    }
  }

  function setupTabHooks() {
    document.querySelectorAll("[data-tab]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        setTimeout(()=>{
          markTechnical();
          if(btn.dataset.tab==="resumo"){
            activeSourceSummary();
            tryHistoryEnhancement();
          }
        },80);
      });
    });
  }

  function boot() {
    insertQuestions();
    markTechnical();
    setupMode();
    setupNavigationCards();
    setupTabHooks();
    activeSourceSummary();
    loadSummary();

    setTimeout(activeSourceSummary,1300);
    setTimeout(tryHistoryEnhancement,1800);

    const scenario=$("scenarioCards");
    if(scenario){
      new MutationObserver(()=>tryHistoryEnhancement())
        .observe(scenario,{childList:true,subtree:true,characterData:true});
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot);
  }else{
    boot();
  }
})();


/* ==========================================================
   Juros Brasil · V3.2 — semântica educacional
   ========================================================== */
(() => {
  function replaceExactTextNodes(root, from, to) {
    if(!root)return false;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let changed=false;
    while(walker.nextNode()){
      const n=walker.currentNode;
      const value=(n.nodeValue||"").trim();
      if(value===from){
        n.nodeValue=n.nodeValue.replace(from,to);
        changed=true;
      }
    }
    return changed;
  }

  function applyEducationSemantics() {
    const legend=document.getElementById("anbimaLegend");
    // IMPORTANT: exact-match only. The replacement itself contains "ETTJ Pré",
    // so using includes()/split() inside a MutationObserver creates a self-triggering loop.
    replaceExactTextNodes(legend,"ETTJ Pré","Juros nominais (ETTJ Pré)");
  }

  function bootV32() {
    applyEducationSemantics();

    const legend=document.getElementById("anbimaLegend");
    if(legend){
      new MutationObserver(()=>applyEducationSemantics())
        .observe(legend,{childList:true,subtree:true});
    }

    document.querySelectorAll("[data-tab]").forEach(btn=>{
      btn.addEventListener("click",()=>setTimeout(applyEducationSemantics,80));
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",bootV32);
  }else{
    bootV32();
  }
})();
