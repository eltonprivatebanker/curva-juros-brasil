(() => {
  const STANDARD = [
    {du:126,label:"6M",title:"6 MESES"},
    {du:252,label:"1A",title:"1 ANO"},
    {du:504,label:"2A",title:"2 ANOS"},
    {du:756,label:"3A",title:"3 ANOS"},
    {du:1260,label:"5A",title:"5 ANOS"},
    {du:1764,label:"7A",title:"7 ANOS"},
    {du:2520,label:"10A",title:"10 ANOS"},
  ];
  const LONG_TICKS = [
    {du:2520,label:"10A"},
    {du:3780,label:"15A"},
    {du:5040,label:"20A"},
    {du:6300,label:"25A"},
    {du:7560,label:"30A"},
    {du:8442,label:"33,5A"},
  ];

  const state = {
    index:null,
    data:null,
    mode:"compare",
    tableExpanded:false,
    cache:new Map(),
    refreshing:false,
    lastDate:null,
  };

  const q=id=>document.getElementById(id);
  const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
  const fp=(v,d=4)=>finite(v)
    ? `${Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:d})}%`
    : "—";
  const fd=s=>{
    if(!s)return"—";
    const [y,m,d]=s.split("-");
    return `${d}/${m}/${y}`;
  };
  const approx=du=>{
    const known={126:"6M",252:"1A",378:"1,5A",504:"2A",630:"2,5A",756:"3A",882:"3,5A",1008:"4A",1134:"4,5A",1260:"5A",1386:"5,5A",1512:"6A",1638:"6,5A",1764:"7A",1890:"7,5A",2016:"8A",2142:"8,5A",2268:"9A",2394:"9,5A",2520:"10A"};
    return known[du]||`${(du/252).toLocaleString("pt-BR",{maximumFractionDigits:1})}A`;
  };

  async function getJson(path){
    if(state.cache.has(path))return state.cache.get(path);
    const p=fetch(path,{cache:"no-store"}).then(r=>{
      if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    state.cache.set(path,p);
    return p;
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

  function rowAt(du){
    return (state.data?.curves||[]).find(r=>+r.du===+du)||null;
  }

  function maxRow(field,limit=Infinity,minDu=0){
    return (state.data?.curves||[])
      .filter(r=>+r.du>=minDu&&+r.du<=limit&&finite(r[field]))
      .sort((a,b)=>+b[field]-+a[field])[0]||null;
  }

  function renderCards(){
    const host=q("anbimaCards");
    if(!host||!state.data)return;
    host.innerHTML=STANDARD.map(t=>{
      const r=rowAt(t.du)||{};
      return `<article class="marketCard">
        <small>${t.title}</small>
        <strong>Pré ${fp(r.pre_pct,2)}</strong>
        <div class="subline">Real <strong>${fp(r.ipca_pct,2)}</strong><br>Inflação implícita <strong>${fp(r.implied_pct,2)}</strong></div>
        <span class="anbimaDu">${t.du.toLocaleString("pt-BR")} DU</span>
      </article>`;
    }).join("");
  }

  function renderReading(){
    const host=q("anbimaReading");
    if(!host||!state.data)return;
    const prePeak=maxRow("pre_pct",2520);
    const realPeak=maxRow("ipca_pct");
    const r6=rowAt(126),r10=rowAt(2520);

    const parts=[];
    if(r6&&prePeak&&r10){
      parts.push(`A curva prefixada parte de ${fp(r6.pre_pct,2)} em 6M, alcança seu pico próximo de ${approx(+prePeak.du)} em ${fp(prePeak.pre_pct,2)} e chega a 10A em ${fp(r10.pre_pct,2)}.`);
    }
    if(realPeak&&r10){
      parts.push(`O juro real atinge ${fp(realPeak.ipca_pct,2)} perto de ${approx(+realPeak.du)} e recua para ${fp(r10.ipca_pct,2)} em 10A.`);
    }
    if(r6&&r10&&finite(r6.implied_pct)&&finite(r10.implied_pct)){
      const dir=+r10.implied_pct>+r6.implied_pct?"sobe":"cai";
      parts.push(`A inflação implícita ${dir} de ${fp(r6.implied_pct,2)} em 6M para ${fp(r10.implied_pct,2)} em 10A.`);
    }
    host.textContent=parts.join(" ");
  }

  function renderKeyPoints(){
    const host=q("anbimaKeyPoints");
    if(!host||!state.data)return;
    const prePeak=maxRow("pre_pct",2520);
    const realPeak=maxRow("ipca_pct");
    const r5=rowAt(1260),r10=rowAt(2520);

    const items=[
      {
        label:"Pico da curva Pré",
        value:prePeak?fp(prePeak.pre_pct,2):"—",
        note:prePeak?`${approx(+prePeak.du)} · ${(+prePeak.du).toLocaleString("pt-BR")} DU`:"—"
      },
      {
        label:"Pico do juro real",
        value:realPeak?fp(realPeak.ipca_pct,2):"—",
        note:realPeak?`${approx(+realPeak.du)} · ${(+realPeak.du).toLocaleString("pt-BR")} DU`:"—"
      },
      {
        label:"Inflação implícita · 5A",
        value:r5?fp(r5.implied_pct,2):"—",
        note:"nominal × real · Fisher"
      },
      {
        label:"Inflação implícita · 10A",
        value:r10?fp(r10.implied_pct,2):"—",
        note:"nominal × real · Fisher"
      },
    ];
    host.innerHTML=items.map(x=>`<article><span>${x.label}</span><strong>${x.value}</strong><small>${x.note}</small></article>`).join("");
  }

  function renderTable(){
    const host=q("anbimaTable");
    if(!host||!state.data)return;
    const all=[...(state.data.curves||[])];
    const rows=state.tableExpanded
      ? all
      : STANDARD.map(t=>all.find(r=>+r.du===t.du)).filter(Boolean);

    host.innerHTML=rows.map(r=>`<tr>
      <td><strong>${approx(+r.du)}</strong></td>
      <td>${(+r.du).toLocaleString("pt-BR")}</td>
      <td>${fp(r.pre_pct)}</td>
      <td>${fp(r.ipca_pct)}</td>
      <td>${fp(r.implied_pct)}</td>
    </tr>`).join("");

    const count=q("anbimaTableCount");
    if(count)count.textContent=state.tableExpanded
      ? `${rows.length} vértices`
      : `${rows.length} vértices principais`;

    const note=q("anbimaTableNote");
    if(note)note.textContent=state.tableExpanded
      ?"Exibindo todos os vértices disponíveis no snapshot."
      :"Exibindo os sete horizontes principais.";

    const btn=q("anbimaTableToggle");
    if(btn)btn.textContent=state.tableExpanded?"Mostrar apenas principais":"Ver estrutura completa";
  }

  function renderParams(){
    if(!state.data)return;
    const body=q("anbimaParams");
    if(body){
      body.innerHTML=(state.data.parameters||[]).map(p=>`<tr>
        <td><strong>${p.group}</strong></td>
        <td>${p.b1}</td><td>${p.b2}</td><td>${p.b3}</td><td>${p.b4}</td><td>${p.l1}</td><td>${p.l2}</td>
      </tr>`).join("");
    }
    const note=q("anbimaPrecision");
    if(note)note.textContent=state.data.precision_note||"";
  }

  function plotChart(series,ticks,xMin,xMax){
    const host=q("anbimaChart");
    if(!host)return;
    host.innerHTML="";

    const points=series.flatMap(s=>s.points).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(!points.length){
      host.innerHTML='<div class="emptyState">Sem dados para o gráfico.</div>';
      return;
    }

    const width=Math.max(720,host.clientWidth||900),height=390,pad={l:58,r:22,t:22,b:46};
    const ymin0=Math.min(...points.map(p=>p.y)),ymax0=Math.max(...points.map(p=>p.y));
    const margin=(ymax0-ymin0||1)*.06;
    const yMin=ymin0-margin,yMax=ymax0+margin;
    const sx=x=>pad.l+(x-xMin)/(xMax-xMin||1)*(width-pad.l-pad.r);
    const sy=y=>height-pad.b-(y-yMin)/(yMax-yMin||1)*(height-pad.t-pad.b);
    const svg=svgEl("svg",{viewBox:`0 0 ${width} ${height}`,role:"img"});

    niceTicks(yMin,yMax,5).forEach(y=>{
      const yy=sy(y);
      svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:"grid"}));
      const t=svgEl("text",{x:pad.l-10,y:yy+4,"text-anchor":"end",class:"anbimaAxisLabel"});
      t.textContent=`${y.toFixed(2)}%`;
      svg.append(t);
    });

    ticks.filter(t=>t.du>=xMin&&t.du<=xMax).forEach((tick,i,arr)=>{
      const xx=sx(tick.du);
      svg.append(svgEl("line",{x1:xx,x2:xx,y1:pad.t,y2:height-pad.b,class:"grid"}));
      const anchor=i===0?"start":i===arr.length-1?"end":"middle";
      const tx=i===0?xx+2:i===arr.length-1?xx-2:xx;
      const t=svgEl("text",{x:tx,y:height-18,"text-anchor":anchor,class:"anbimaTenorLabel"});
      t.textContent=tick.label;
      const tt=svgEl("title");tt.textContent=`${tick.du.toLocaleString("pt-BR")} dias úteis`;t.append(tt);
      svg.append(t);
    });

    svg.append(svgEl("line",{x1:pad.l,x2:width-pad.r,y1:height-pad.b,y2:height-pad.b,class:"axis"}));

    series.forEach(s=>{
      const pts=s.points.filter(p=>p.x>=xMin&&p.x<=xMax).sort((a,b)=>a.x-b.x);
      if(!pts.length)return;
      const path=svgEl("path",{
        d:pts.map((p,i)=>`${i?"L":"M"} ${sx(p.x)} ${sy(p.y)}`).join(" "),
        class:"marketLine",
        stroke:s.color
      });
      path.setAttribute("fill","none");
      svg.append(path);

      // Fewer points in the long real curve to keep the chart clean.
      const stride=state.mode==="real-long"?Math.max(1,Math.ceil(pts.length/28)):1;
      pts.forEach((p,i)=>{
        if(i%stride!==0&&i!==pts.length-1)return;
        const c=svgEl("circle",{cx:sx(p.x),cy:sy(p.y),r:3.2,fill:s.color,class:"marketPoint"});
        const tt=svgEl("title");tt.textContent=`${s.label} · ${approx(p.x)} · ${p.x.toLocaleString("pt-BR")} DU · ${fp(p.y)}`;
        c.append(tt);svg.append(c);
      });
    });

    host.append(svg);
  }

  function renderChart(){
    if(!state.data)return;
    const curves=state.data.curves||[];
    const title=q("anbimaChartTitle"),sub=q("anbimaChartSubtitle"),hint=q("anbimaModeHint"),legend=q("anbimaLegend");

    document.querySelectorAll("[data-anbima-mode]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.anbimaMode===state.mode);
    });

    if(state.mode==="real-long"){
      if(title)title.textContent="Juro real · ponta longa";
      if(sub)sub.textContent="A curva real continua além de 10 anos; Pré e inflação implícita não são estendidas onde não há dados.";
      if(hint)hint.textContent="Somente a curva de juro real é exibida de 10A até o último vértice disponível.";
      if(legend)legend.innerHTML='<span><i style="background:#38d39f"></i>Juro real ANBIMA</span>';
      const real=curves.filter(r=>+r.du>=2520&&finite(r.ipca_pct)).map(r=>({x:+r.du,y:+r.ipca_pct}));
      const maxDu=real.length?Math.max(...real.map(p=>p.x)):8442;
      plotChart([{label:"Juro real",color:"#38d39f",points:real}],LONG_TICKS,2520,maxDu);
    }else{
      if(title)title.textContent="Comparável até 10A";
      if(sub)sub.textContent="Pré, juro real e inflação implícita no trecho em que as três séries coexistem.";
      if(hint)hint.textContent="As três séries são comparadas somente até 10 anos.";
      if(legend)legend.innerHTML='<span><i style="background:#69b7ff"></i>ETTJ Pré</span><span><i style="background:#38d39f"></i>Juro real</span><span><i style="background:#ffc96b"></i>Inflação implícita</span>';
      const within=curves.filter(r=>+r.du<=2520);
      plotChart([
        {label:"ETTJ Pré",color:"#69b7ff",points:within.filter(r=>finite(r.pre_pct)).map(r=>({x:+r.du,y:+r.pre_pct}))},
        {label:"Juro real",color:"#38d39f",points:within.filter(r=>finite(r.ipca_pct)).map(r=>({x:+r.du,y:+r.ipca_pct}))},
        {label:"Inflação implícita",color:"#ffc96b",points:within.filter(r=>finite(r.implied_pct)).map(r=>({x:+r.du,y:+r.implied_pct}))},
      ],STANDARD.map(t=>({du:t.du,label:t.label})),126,2520);
    }
  }

  function renderAll(){
    if(!state.data)return;
    renderReading();
    renderCards();
    renderChart();
    renderKeyPoints();
    renderTable();
    renderParams();
  }

  async function ensureIndex(){
    if(!state.index)state.index=await getJson("data/anbima/index.json");
    return state.index;
  }

  async function refresh(force=false){
    if(state.refreshing)return;
    state.refreshing=true;
    try{
      const index=await ensureIndex();
      const sel=q("anbimaDate");
      const date=(sel&&sel.value)||index.latest;
      if(!force&&state.lastDate===date&&state.data){
        renderAll();
        return;
      }
      const entry=(index.entries||[]).find(e=>e.date===date)||(index.entries||[])[0];
      if(!entry)return;
      state.data=await getJson(entry.path);
      state.lastDate=date;
      renderAll();
    }catch(err){
      console.error("ANBIMA V2:",err);
      const host=q("anbimaReading");
      if(host)host.textContent=`Não foi possível atualizar a apresentação da ANBIMA: ${err.message}`;
    }finally{
      state.refreshing=false;
    }
  }

  function setup(){
    const toggle=q("anbimaTableToggle");
    toggle?.addEventListener("click",()=>{
      state.tableExpanded=!state.tableExpanded;
      renderTable();
    });

    document.querySelectorAll("[data-anbima-mode]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.mode=btn.dataset.anbimaMode;
        renderChart();
      });
    });

    q("anbimaDate")?.addEventListener("change",()=>setTimeout(()=>refresh(true),0));

    document.querySelector('[data-tab="anbima"]')?.addEventListener("click",()=>setTimeout(()=>refresh(true),0));

    // Existing market.js updates this status after fetching the snapshot.
    // Re-render immediately afterward to keep this presentation layer on top.
    const status=q("anbimaStatus");
    if(status){
      const observer=new MutationObserver(()=>setTimeout(()=>refresh(true),0));
      observer.observe(status,{childList:true,subtree:true,characterData:true});
    }

    // Wait briefly for market.js to populate the date selector during boot.
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      const sel=q("anbimaDate");
      if(sel?.options?.length||tries>30){
        clearInterval(timer);
        refresh(true);
      }
    },150);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",setup);
  }else{
    setup();
  }

  window.addEventListener("resize",()=>{
    if(q("tab-anbima")?.classList.contains("active")&&state.data)renderChart();
  });
})();
