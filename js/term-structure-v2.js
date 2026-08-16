(() => {
  const TERM_TENORS = [
    {du:126,label:"6M"},
    {du:252,label:"1A"},
    {du:504,label:"2A"},
    {du:756,label:"3A"},
    {du:1260,label:"5A"},
    {du:1764,label:"7A"},
    {du:2520,label:"10A"},
  ];
  let termViewMode = "contracts";

  function termFlatForward(contracts,targetDu) {
    const pts=(contracts||[])
      .filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct)&&c.business_days>0)
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

  function termNormalize(contracts) {
    return TERM_TENORS.map(t=>{
      const rate=termFlatForward(contracts,t.du);
      return Number.isFinite(rate)
        ? {ticker:t.label,maturity:t.label,business_days:t.du,rate_pct:rate}
        : null;
    }).filter(Boolean);
  }

  function termRows(current,compare) {
    return TERM_TENORS.map(t=>{
      const cur=termFlatForward(current?.contracts,t.du);
      const prev=termFlatForward(compare?.contracts,t.du);
      return {
        ...t,
        current:cur,
        compare:prev,
        bps:Number.isFinite(cur)&&Number.isFinite(prev)?(cur-prev)*100:NaN
      };
    });
  }

  function termFmtYears(du) {
    const y=du/252;
    return `${y.toLocaleString("pt-BR",{maximumFractionDigits:1})}A`;
  }

  function termScales(seriesList,host,fixed=false) {
    const pad={l:58,r:22,t:22,b:46};
    const width=Math.max(720,host.clientWidth||1000);
    const height=390;
    const all=seriesList.flatMap(s=>s.contracts||[])
      .filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct));
    if(!all.length)return null;

    const xMin=fixed?126:Math.min(...all.map(c=>c.business_days));
    const xMax=fixed?2520:Math.max(...all.map(c=>c.business_days));
    const yMin=Math.min(...all.map(c=>c.rate_pct))-.08;
    const yMax=Math.max(...all.map(c=>c.rate_pct))+.08;
    const sx=x=>pad.l+(x-xMin)/(xMax-xMin||1)*(width-pad.l-pad.r);
    const sy=y=>height-pad.b-(y-yMin)/(yMax-yMin||1)*(height-pad.t-pad.b);
    return{width,height,pad,xMin,xMax,yMin,yMax,sx,sy};
  }

  function termAxes(svg,scales,mode) {
    const {width,height,pad,xMin,xMax,yMin,yMax,sx,sy}=scales;

    niceTicks(yMin,yMax,5).forEach(y=>{
      const yy=sy(y);
      svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:"grid"}));
      const t=svgEl("text",{x:pad.l-10,y:yy+4,"text-anchor":"end",class:"termAxisLabel"});
      t.textContent=`${y.toFixed(2)}%`;
      svg.append(t);
    });

    const ticks=[];
    if(mode==="contracts"&&xMin<126){
      ticks.push({du:xMin,label:`${Math.round(xMin)} DU`,edge:true});
    }
    TERM_TENORS.forEach(t=>{
      if(t.du>=xMin&&t.du<=xMax)ticks.push(t);
    });
    if(mode==="contracts"&&xMax>2520){
      const last=ticks.at(-1);
      if(!last||Math.abs(xMax-last.du)>80)ticks.push({du:xMax,label:termFmtYears(xMax),edge:true});
    }

    ticks.forEach((tick,i)=>{
      const xx=sx(tick.du);
      svg.append(svgEl("line",{x1:xx,x2:xx,y1:pad.t,y2:height-pad.b,class:"grid"}));
      const anchor=i===0&&tick.edge?"start":i===ticks.length-1&&tick.edge?"end":"middle";
      const tx=anchor==="start"?xx+2:anchor==="end"?xx-2:xx;
      const t=svgEl("text",{x:tx,y:height-18,"text-anchor":anchor,class:"termTenorLabel"});
      t.textContent=tick.label;
      const tt=svgEl("title");
      tt.textContent=`${Math.round(tick.du).toLocaleString("pt-BR")} dias úteis`;
      t.append(tt);
      svg.append(t);
    });

    svg.append(svgEl("line",{
      x1:pad.l,x2:width-pad.r,
      y1:height-pad.b,y2:height-pad.b,
      class:"axis"
    }));
  }

  function termRenderBps(rows) {
    const host=document.getElementById("termBpsGrid");
    if(!host)return;
    host.innerHTML=rows.map(r=>{
      const cls=!Number.isFinite(r.bps)?"deltaFlat":r.bps>1?"deltaUp":r.bps<-1?"deltaDown":"deltaFlat";
      const action=!Number.isFinite(r.bps)?"sem dado":r.bps>1?"abertura":r.bps<-1?"fechamento":"estável";
      return `<article>
        <span>${r.label}</span>
        <strong class="${cls}">${fmtBp(r.bps)}</strong>
        <small>${action}</small>
      </article>`;
    }).join("");
  }

  function termRenderReading(rows,current,compare) {
    const host=document.getElementById("termReading");
    const sub=document.getElementById("termSubtitle");
    if(sub)sub.textContent=`${fmtDate(compare.date)} → ${fmtDate(current.date)} · comparação no mesmo horizonte de prazo.`;
    if(!host)return;

    const valid=rows.filter(r=>Number.isFinite(r.bps));
    if(!valid.length){
      host.textContent="Não há vértices normalizados suficientes para resumir a comparação.";
      return;
    }

    const opened=valid.filter(r=>r.bps>1);
    const closed=valid.filter(r=>r.bps<-1);
    const strongest=[...valid].sort((a,b)=>Math.abs(b.bps)-Math.abs(a.bps))[0];

    let lead;
    if(opened.length===valid.length)lead="Abertura generalizada";
    else if(closed.length===valid.length)lead="Fechamento generalizado";
    else if(opened.length>=Math.ceil(valid.length*.67))lead="Predomínio de abertura";
    else if(closed.length>=Math.ceil(valid.length*.67))lead="Predomínio de fechamento";
    else lead="Movimento misto";

    const detail=lead.includes("abertura")
      ? `${opened.length} de ${valid.length} prazos normalizados estão acima da curva de comparação`
      : lead.includes("fechamento")
        ? `${closed.length} de ${valid.length} prazos normalizados estão abaixo da curva de comparação`
        : `${opened.length} prazos abriram e ${closed.length} fecharam`;

    host.textContent=`${lead}: ${detail}. Maior movimento em ${strongest.label}: ${fmtBp(strongest.bps)}.`;
  }

  function termPlotNormalized(svg,contracts,scales,options={}) {
    const pts=(contracts||[]).filter(p=>Number.isFinite(p.business_days)&&Number.isFinite(p.rate_pct))
      .sort((a,b)=>a.business_days-b.business_days);
    if(!pts.length)return;
    const d=pts.map((p,i)=>`${i?"L":"M"} ${scales.sx(p.business_days)} ${scales.sy(p.rate_pct)}`).join(" ");
    const path=svgEl("path",{d,class:options.className||"seriesLine"});
    path.setAttribute("stroke",options.stroke||"#69b7ff");
    path.setAttribute("stroke-width",options.strokeWidth||2.5);
    path.setAttribute("fill","none");
    if(options.dasharray)path.setAttribute("stroke-dasharray",options.dasharray);
    if(options.opacity)path.setAttribute("opacity",options.opacity);
    svg.append(path);

    pts.forEach(p=>{
      const c=svgEl("circle",{
        cx:scales.sx(p.business_days),
        cy:scales.sy(p.rate_pct),
        r:options.pointRadius||4,
        fill:options.stroke||"#69b7ff",
        opacity:options.opacity||1
      });
      const tt=svgEl("title");
      tt.textContent=`${p.ticker} · ${p.business_days.toLocaleString("pt-BR")} DU · ${p.rate_pct.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:4})}%`;
      c.append(tt);
      svg.append(c);
    });
  }

  function termUpdateModeUi() {
    document.querySelectorAll("[data-term-mode]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.termMode===termViewMode);
    });
    const hint=document.getElementById("termModeHint");
    if(hint){
      hint.textContent=termViewMode==="contracts"
        ?"Contratos negociados posicionados pelo prazo remanescente real."
        :"Mesmos vértices em todas as datas: 6M, 1A, 2A, 3A, 5A, 7A e 10A.";
    }
  }

  // Override da renderização original do app.js, sem alterar a lógica de dados.
  renderChart = function(current,compare) {
    const host=document.getElementById("chart");
    if(!host)return;
    host.innerHTML="";

    const rows=termRows(current,compare);
    termRenderBps(rows);
    termRenderReading(rows,current,compare);
    termUpdateModeUi();

    if(termViewMode==="normalized"){
      const cur=termNormalize(current.contracts);
      const prev=termNormalize(compare.contracts);
      const scales=termScales([{contracts:cur},{contracts:prev}],host,true);
      if(!scales){
        host.innerHTML='<div class="error">Sem dados suficientes para a curva normalizada.</div>';
        return;
      }
      const svg=svgEl("svg",{viewBox:`0 0 ${scales.width} ${scales.height}`,role:"img","aria-label":"Curva DI normalizada por prazo"});
      termAxes(svg,scales,"normalized");
      termPlotNormalized(svg,prev,scales,{stroke:"#7a8798",strokeWidth:2,dasharray:"5 6",opacity:.85,pointRadius:3.1});
      termPlotNormalized(svg,cur,scales,{stroke:"#69b7ff",strokeWidth:3.2,opacity:1,pointRadius:4.2});
      host.append(svg);
      return;
    }

    const scales=termScales([{contracts:current.contracts},{contracts:compare.contracts}],host,false);
    if(!scales){
      host.innerHTML='<div class="error">Sem dados suficientes para o gráfico.</div>';
      return;
    }
    const svg=svgEl("svg",{viewBox:`0 0 ${scales.width} ${scales.height}`,role:"img","aria-label":"Contratos DI1 por prazo remanescente"});
    termAxes(svg,scales,"contracts");
    plotSeries(svg,compare.contracts,scales,{
      className:"prevLine",
      stroke:"#7a8798",
      strokeWidth:2,
      dasharray:"5 6",
      opacity:.82,
      showPoints:false
    });
    plotSeries(svg,current.contracts,scales,{
      className:"currentLine",
      stroke:"#69b7ff",
      strokeWidth:3,
      showPoints:true,
      pointClass:"currentPoint",
      pointRadius:3.6
    });
    host.append(svg);
  };

  document.querySelectorAll("[data-term-mode]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      termViewMode=btn.dataset.termMode;
      termUpdateModeUi();
      if(state?.current&&state?.compare)renderChart(state.current,state.compare);
    });
  });
  termUpdateModeUi();
})();
