(() => {
  const TENORS=[{du:126,label:"6M"},{du:252,label:"1A"},{du:504,label:"2A"},{du:756,label:"3A"},{du:1260,label:"5A"},{du:1764,label:"7A"},{du:2520,label:"10A"}];
  const DEMO_CUR={"date": "2026-08-14", "tenors": [{"du": 126, "label": "6M", "rate": 13.8042}, {"du": 252, "label": "1A", "rate": 13.9527}, {"du": 504, "label": "2A", "rate": 14.2714}, {"du": 756, "label": "3A", "rate": 14.5279}, {"du": 1260, "label": "5A", "rate": 14.6946}, {"du": 1764, "label": "7A", "rate": 14.7533}, {"du": 2520, "label": "10A", "rate": 14.7298}]};
  const DEMO_PREV={"date": "2026-08-13", "tenors": [{"du": 126, "label": "6M", "rate": 13.7612}, {"du": 252, "label": "1A", "rate": 13.8717}, {"du": 504, "label": "2A", "rate": 14.1474}, {"du": 756, "label": "3A", "rate": 14.3859}, {"du": 1260, "label": "5A", "rate": 14.5526}, {"du": 1764, "label": "7A", "rate": 14.6243}, {"du": 2520, "label": "10A", "rate": 14.6128}]};
  const $=id=>document.getElementById(id);
  const fmtDate=iso=>{if(!iso)return"—";const[y,m,d]=iso.split("-");return `${d}/${m}/${y}`};
  const fmtBp=v=>Number.isFinite(v)?`${v>0?"+":""}${v.toLocaleString("pt-BR",{maximumFractionDigits:1})} bps`:"—";
  const fmtPct=v=>Number.isFinite(v)?`${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`:"—";
  const svgEl=(n,a={})=>{const e=document.createElementNS("http://www.w3.org/2000/svg",n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e};
  function niceTicks(min,max,count=5){if(min===max)return[min];const raw=(max-min)/count,p=10**Math.floor(Math.log10(raw)),n=raw/p,step=(n<1.5?1:n<3?2:n<7?5:10)*p,start=Math.floor(min/step)*step,end=Math.ceil(max/step)*step,out=[];for(let v=start;v<=end+step*.1;v+=step)out.push(v);return out}
  function flatForward(contracts,targetDu){
    const pts=(contracts||[]).filter(c=>Number.isFinite(c.business_days)&&Number.isFinite(c.rate_pct)&&+c.business_days>0).map(c=>({du:+c.business_days,rate:+c.rate_pct})).sort((a,b)=>a.du-b.du);
    const exact=pts.find(p=>p.du===targetDu);if(exact)return exact.rate;
    const left=[...pts].reverse().find(p=>p.du<targetDu),right=pts.find(p=>p.du>targetDu);if(!left||!right)return NaN;
    const t1=left.du/252,t2=right.du/252,t=targetDu/252,ldf1=-t1*Math.log1p(left.rate/100),ldf2=-t2*Math.log1p(right.rate/100),w=(t-t1)/(t2-t1),ldf=ldf1+w*(ldf2-ldf1);
    return Math.expm1(-ldf/t)*100;
  }
  function normalize(snap){return TENORS.map(t=>({...t,rate:flatForward(snap.contracts,t.du)})).filter(x=>Number.isFinite(x.rate))}
  function rootData(path){return `../${String(path).replace(/^\/+/, "")}`}
  async function fetchJson(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
  async function liveData(){
    const idx=await fetchJson("../data/index.json");
    const entries=[...(idx.entries||[])].sort((a,b)=>a.date.localeCompare(b.date));
    const curE=entries.find(e=>e.date===idx.latest)||entries.at(-1),prevE=entries[entries.findIndex(e=>e.date===curE.date)-1];
    const [cur,prev]=await Promise.all([fetchJson(rootData(curE.path)),fetchJson(rootData(prevE.path))]);
    return {mode:idx.mode==="live"?"B3 · LIVE":"DEMO",current:{date:curE.date,rows:normalize(cur)},previous:{date:prevE.date,rows:normalize(prev)}};
  }
  function demoData(){return {mode:"PRÉVIA",current:DEMO_CUR,previous:DEMO_PREV}}
  function rows(data){return TENORS.map(t=>{const a=data.current.rows?data.current.rows.find(x=>x.du===t.du):data.current.tenors.find(x=>x.du===t.du),b=data.previous.rows?data.previous.rows.find(x=>x.du===t.du):data.previous.tenors.find(x=>x.du===t.du);return {...t,current:a?.rate,previous:b?.rate,bps:Number.isFinite(a?.rate)&&Number.isFinite(b?.rate)?(a.rate-b.rate)*100:NaN}})}
  function direction(rows){
    const valid=rows.filter(r=>Number.isFinite(r.bps)),up=valid.filter(r=>r.bps>1),down=valid.filter(r=>r.bps<-1),strong=[...valid].sort((a,b)=>Math.abs(b.bps)-Math.abs(a.bps))[0];
    let kind="flat",label="MISTO",text=`Movimento misto: ${up.length} prazos abriram e ${down.length} fecharam.`;
    if(up.length===valid.length){kind="open";label="ABERTURA";text=`Abertura generalizada: as taxas subiram nos ${valid.length} prazos.`}
    else if(down.length===valid.length){kind="close";label="FECHAMENTO";text=`Fechamento generalizado: as taxas caíram nos ${valid.length} prazos.`}
    else if(up.length>=Math.ceil(valid.length*.67)){kind="open";label="ABERTURA";text=`Predomínio de abertura: ${up.length} de ${valid.length} prazos subiram.`}
    else if(down.length>=Math.ceil(valid.length*.67)){kind="close";label="FECHAMENTO";text=`Predomínio de fechamento: ${down.length} de ${valid.length} prazos caíram.`}
    if(strong)text+=` Maior movimento em ${strong.label}: ${fmtBp(strong.bps)}.`;
    return {kind,label,text};
  }
  function plot(data,rr){
    const host=$("chart");host.innerHTML="";
    const all=[...data.current.rows,...data.previous.rows].map(x=>x.rate).filter(Number.isFinite),w=Math.max(720,host.clientWidth||900),h=330,p={l:54,r:18,t:14,b:40},xmin=126,xmax=2520,ymin=Math.min(...all)-.07,ymax=Math.max(...all)+.07,sx=x=>p.l+(x-xmin)/(xmax-xmin)*(w-p.l-p.r),sy=y=>h-p.b-(y-ymin)/(ymax-ymin)*(h-p.t-p.b),svg=svgEl("svg",{viewBox:`0 0 ${w} ${h}`,role:"img"});
    niceTicks(ymin,ymax,5).forEach(y=>{const yy=sy(y);svg.append(svgEl("line",{x1:p.l,x2:w-p.r,y1:yy,y2:yy,class:"grid"}));const t=svgEl("text",{x:p.l-8,y:yy+4,"text-anchor":"end",class:"axisText"});t.textContent=`${y.toFixed(2)}%`;svg.append(t)});
    TENORS.forEach(tk=>{const xx=sx(tk.du);svg.append(svgEl("line",{x1:xx,x2:xx,y1:p.t,y2:h-p.b,class:"grid"}));const t=svgEl("text",{x:xx,y:h-15,"text-anchor":"middle",class:"tenorText"});t.textContent=tk.label;svg.append(t)});
    svg.append(svgEl("line",{x1:p.l,x2:w-p.r,y1:h-p.b,y2:h-p.b,class:"axis"}));
    [{s:data.previous,color:"#7f8fa1",width:2,dash:"5 6",points:false},{s:data.current,color:"#69b7ff",width:3.3,points:true}].forEach(o=>{const pts=o.s.rows;const path=svgEl("path",{d:pts.map((x,i)=>`${i?"L":"M"} ${sx(x.du)} ${sy(x.rate)}`).join(" "),class:"curve",stroke:o.color,"stroke-width":o.width,fill:"none"});if(o.dash)path.setAttribute("stroke-dasharray",o.dash);svg.append(path);if(o.points)pts.forEach(x=>{const c=svgEl("circle",{cx:sx(x.du),cy:sy(x.rate),r:3.7,fill:o.color}),tt=svgEl("title");tt.textContent=`${x.label} · ${fmtPct(x.rate)}`;c.append(tt);svg.append(c)})});host.append(svg);
    $("legend").innerHTML=`<span><i style="background:#69b7ff"></i><strong>Atual</strong> ${fmtDate(data.current.date)}</span><span><i style="background:#7f8fa1"></i><strong>Anterior</strong> ${fmtDate(data.previous.date)}</span>`;
    $("moves").innerHTML=rr.map(r=>`<article class="move"><span>${r.label}</span><strong>${fmtPct(r.current)}</strong><small class="${r.bps>1?"open":r.bps<-1?"close":"flat"}">${fmtBp(r.bps)} · ${r.bps>1?"abertura":r.bps<-1?"fechamento":"estável"}</small></article>`).join("");
  }
  function postHeight(){try{parent.postMessage({type:"juros-brasil-widget-height",widget:"curva-di-fundos",height:document.documentElement.scrollHeight},"*")}catch(_){}}
  async function boot(){
    let d;try{d=await liveData()}catch(e){console.warn("Usando prévia local:",e);d=demoData();d.current.rows=d.current.tenors;d.previous.rows=d.previous.tenors}
    const rr=rows(d),dir=direction(rr);$("mode").textContent=d.mode;$("date").textContent=fmtDate(d.current.date);$("reading").textContent=dir.text;$("direction").textContent=dir.label;$("direction").className=`direction ${dir.kind}`;plot(d,rr);postHeight();window.addEventListener("resize",()=>{plot(d,rr);postHeight()})
  }
  window.addEventListener("DOMContentLoaded",()=>boot());
})();
