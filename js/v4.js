/* Juros Brasil · V4.0 — comparador líquido LCI IPCA+ × Tesouro IPCA+ */
(() => {
  const $ = (id) => document.getElementById(id);
  const cache = new Map();
  const VERSION = 'V4.0 · teste';
  const DEFAULT_CUSTODY = 0.20;

  const finite = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const num = (id) => {
    const v = parseFloat($(id)?.value);
    return Number.isFinite(v) ? v : NaN;
  };
  const money = (v) => Number.isFinite(v)
    ? v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
    : '—';
  const pct = (v,d=2) => Number.isFinite(v)
    ? `${v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})}%`
    : '—';
  const bps = (v) => Number.isFinite(v)
    ? `${v>0?'+':''}${v.toLocaleString('pt-BR',{maximumFractionDigits:1})} bps`
    : '—';
  const dateBr = (iso) => {
    if(!iso) return '—';
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const approxHorizon = (du) => {
    if(!Number.isFinite(du)) return '—';
    const years = du/252;
    if(years < .95) return `${Math.round(years*12)}M`;
    return `${years.toLocaleString('pt-BR',{maximumFractionDigits:1})}A`;
  };

  async function getJson(path){
    if(cache.has(path)) return cache.get(path);
    const p = fetch(path,{cache:'no-store'}).then(r=>{
      if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    cache.set(path,p);
    return p;
  }

  function flatForward(points,targetDu){
    const pts=(points||[])
      .filter(p=>finite(p.du)&&finite(p.rate)&&+p.du>0)
      .map(p=>({du:+p.du,rate:+p.rate}))
      .sort((a,b)=>a.du-b.du);
    const exact=pts.find(p=>p.du===targetDu);
    if(exact) return exact.rate;
    const left=[...pts].reverse().find(p=>p.du<targetDu);
    const right=pts.find(p=>p.du>targetDu);
    if(!left||!right||targetDu<=0) return NaN;
    const t1=left.du/252,t2=right.du/252,t=targetDu/252;
    const ldf1=-t1*Math.log1p(left.rate/100);
    const ldf2=-t2*Math.log1p(right.rate/100);
    const w=(t-t1)/(t2-t1);
    const ldf=ldf1+w*(ldf2-ldf1);
    return Math.expm1(-ldf/t)*100;
  }

  function annualIpcaPlus(ipca,realSpread){
    if(!Number.isFinite(ipca)||!Number.isFinite(realSpread)) return NaN;
    return ((1+ipca/100)*(1+realSpread/100)-1)*100;
  }

  function irRateByCalendarDays(days){
    if(!Number.isFinite(days)) return NaN;
    if(days<=180) return 22.5;
    if(days<=360) return 20;
    if(days<=720) return 17.5;
    return 15;
  }

  function calendarDays(a,b){
    const x=Date.parse(`${a}T00:00:00Z`),y=Date.parse(`${b}T00:00:00Z`);
    return Number.isFinite(x)&&Number.isFinite(y) ? Math.max(0,Math.round((y-x)/86400000)) : NaN;
  }

  function investmentModel({amount,ipca,spread,du,taxed=false,irPct=0,custodyPct=0,agentPct=0}){
    const years=du/252;
    const nominal=annualIpcaPlus(ipca,spread);
    const gross=amount*Math.pow(1+nominal/100,years);
    const grossGain=Math.max(0,gross-amount);
    const tax=taxed ? grossGain*(irPct/100) : 0;
    const feeAnnual=Math.max(0,custodyPct)+Math.max(0,agentPct);
    const afterFeeFactor=feeAnnual>0 ? Math.pow(Math.max(0,1-feeAnnual/100),years) : 1;
    const afterFees=gross*afterFeeFactor;
    const fees=Math.max(0,gross-afterFees);
    const net=afterFees-tax;
    const netAnnual=years>0 ? (Math.pow(net/amount,1/years)-1)*100 : NaN;
    const netReal=Number.isFinite(netAnnual)&&Number.isFinite(ipca)
      ? ((1+netAnnual/100)/(1+ipca/100)-1)*100
      : NaN;
    return {years,nominal,gross,grossGain,tax,fees,net,netAnnual,netReal,feeAnnual};
  }

  function solveTreasurySpread(targetNet,{amount,ipca,du,irPct,custodyPct,agentPct}){
    let lo=-5,hi=35;
    const f=(spread)=>investmentModel({amount,ipca,spread,du,taxed:true,irPct,custodyPct,agentPct}).net-targetNet;
    if(f(lo)>0) return lo;
    if(f(hi)<0) return NaN;
    for(let i=0;i<80;i++){
      const mid=(lo+hi)/2;
      if(f(mid)>=0) hi=mid; else lo=mid;
    }
    return (lo+hi)/2;
  }

  function solveLciSpread(targetNet,{amount,ipca,du}){
    let lo=-5,hi=35;
    const f=(spread)=>investmentModel({amount,ipca,spread,du}).net-targetNet;
    if(f(lo)>0) return lo;
    if(f(hi)<0) return NaN;
    for(let i=0;i<80;i++){
      const mid=(lo+hi)/2;
      if(f(mid)>=0) hi=mid; else lo=mid;
    }
    return (lo+hi)/2;
  }

  function buildModule(){
    const tab=$('tab-decisao');
    const intro=tab?.querySelector('.decisionIntro');
    if(!tab||!intro||$('v4TreasuryCompare')) return;

    const tabs=document.createElement('div');
    tabs.className='v4ScenarioTabs';
    tabs.innerHTML=`
      <button type="button" class="active" data-v4-view="treasury">LCI IPCA+ × Tesouro IPCA+</button>
      <button type="button" data-v4-view="legacy">LCI Pós × Pré × IPCA+</button>`;
    intro.after(tabs);

    const section=document.createElement('section');
    section.id='v4TreasuryCompare';
    section.className='panel v4TreasuryCompare';
    section.innerHTML=`
      <div class="panelHead">
        <div>
          <p class="eyebrow">V4 · COMPARADOR LÍQUIDO</p>
          <h2>LCI IPCA+ × Tesouro IPCA+</h2>
          <p class="sectionSubtitle">Compare as duas estruturas no mesmo horizonte, carregadas até o vencimento. O Tesouro considera IR regressivo e uma aproximação da taxa de custódia B3; a LCI PF é tratada como isenta de IR.</p>
        </div>
        <span class="v4HeroBadge">novo · teste</span>
      </div>

      <div class="v4InputGrid">
        <label>Valor da aplicação
          <div class="v4InputPrefix"><span>R$</span><input id="v4Amount" type="number" min="1000" step="1000" value="100000"></div>
        </label>
        <label>LCI IPCA+
          <div class="v4InputSuffix"><input id="v4LciSpread" type="number" min="0" max="30" step="0.01" value="7.00"><span>% a.a.</span></div>
        </label>
        <label>Tesouro IPCA+ selecionado
          <select id="v4TreasuryTitle"><option>Carregando títulos…</option></select>
        </label>
        <label>Cenário de IPCA
          <select id="v4IpcaMode"><option value="market" selected>Mercado · ANBIMA implícita</option><option value="custom">Personalizado</option></select>
        </label>
        <label>IPCA equivalente
          <div class="v4InputSuffix"><input id="v4Ipca" type="number" min="-5" max="30" step="0.01" value="5.00" readonly><span>% a.a.</span></div>
        </label>
        <label>Custódia B3
          <div class="v4InputSuffix"><input id="v4Custody" type="number" min="0" max="5" step="0.01" value="${DEFAULT_CUSTODY.toFixed(2)}"><span>% a.a.</span></div>
        </label>
        <label>Taxa da instituição
          <div class="v4InputSuffix"><input id="v4AgentFee" type="number" min="0" max="5" step="0.01" value="0.00"><span>% a.a.</span></div>
        </label>
        <label>Taxa Tesouro IPCA+
          <div class="v4InputSuffix"><input id="v4TreasuryRate" type="number" step="0.01" readonly><span>% a.a.</span></div>
        </label>
      </div>

      <div id="v4MarketStrip" class="v4MarketStrip"></div>
      <div id="v4ResultGrid" class="v4ResultGrid"></div>
      <div id="v4BreakGrid" class="v4BreakGrid"></div>
      <div id="v4Reading" class="v4Reading"></div>

      <div class="panelHead" style="margin-top:20px">
        <div><p class="eyebrow">SENSIBILIDADE</p><h2>Quanto o Tesouro precisa pagar para empatar?</h2><p class="sectionSubtitle">A taxa de equilíbrio muda com a inflação porque o IR do Tesouro incide sobre o rendimento nominal total.</p></div>
      </div>
      <div class="v4SensitivityWrap"><table class="v4Sensitivity"><thead><tr><th>IPCA do cenário</th><th>Tesouro IPCA+ de equilíbrio</th><th>Tesouro atual − equilíbrio</th><th>Maior líquido</th></tr></thead><tbody id="v4Sensitivity"></tbody></table></div>

      <details class="v4Method">
        <summary>ⓘ Metodologia desta primeira versão</summary>
        <ul>
          <li>Compara apenas <strong>Tesouro IPCA+ sem juros semestrais</strong>, evitando fluxos intermediários de cupom nesta etapa.</li>
          <li>Assume carregamento até o vencimento e usa o mesmo horizonte, em dias úteis, para modelar a LCI.</li>
          <li>O IR do Tesouro é aplicado ao rendimento nominal modelado pela tabela regressiva; o prazo fiscal é estimado em dias corridos entre a data do snapshot e o vencimento.</li>
          <li>A custódia B3 é modelada como um custo anual sobre o valor acumulado. É uma aproximação educacional da cobrança efetiva provisionada diariamente.</li>
          <li>Não considera IOF, compra fracionária, spread operacional, marcação a mercado em venda antecipada, risco de crédito, FGC, liquidez, reinvestimento, mudanças tributárias ou particularidades contratuais.</li>
        </ul>
      </details>`;
    tabs.after(section);

    // O comparador legado continua na página, mas inicia oculto na V4.
    legacySections(tab,section,tabs).forEach(el=>el.classList.add('v4LegacyDecisionHidden'));

    tabs.addEventListener('click',e=>{
      const btn=e.target.closest('[data-v4-view]');
      if(!btn) return;
      tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
      const treasury=btn.dataset.v4View==='treasury';
      section.classList.toggle('v4LegacyDecisionHidden',!treasury);
      legacySections(tab,section,tabs).forEach(el=>el.classList.toggle('v4LegacyDecisionHidden',treasury));
    });
  }

  function legacySections(tab,section,tabs){
    return [...tab.children].filter(el=>el!==section&&el!==tabs&&!el.classList.contains('decisionIntro')&&!el.classList.contains('v31Question'));
  }

  const V = {
    tesouroIndex:null,
    anbimaIndex:null,
    tesouro:null,
    anbima:null,
    selected:null,
    dataDate:null,
    anbimaDate:null
  };

  function titleLabel(t){
    return `Tesouro IPCA+ ${String(t.maturity||'').slice(0,4)} · ${pct(+t.buy_rate_pct,2)} · ${approxHorizon(+t.business_days)}`;
  }

  async function loadMarketData(){
    [V.tesouroIndex,V.anbimaIndex]=await Promise.all([
      getJson('data/tesouro/index.json'),
      getJson('data/anbima/index.json')
    ]);
    const latest=V.tesouroIndex?.latest || [...(V.tesouroIndex?.entries||[])].sort((a,b)=>b.date.localeCompare(a.date))[0]?.date;
    const te=V.tesouroIndex?.entries?.find(e=>e.date===latest);
    if(!te) throw new Error('Snapshot do Tesouro não encontrado.');
    V.tesouro=await getJson(te.path);
    V.dataDate=V.tesouro.date||latest;

    const anbimaEntries=[...(V.anbimaIndex?.entries||[])].sort((a,b)=>b.date.localeCompare(a.date));
    const ae=anbimaEntries.find(e=>e.date<=V.dataDate) || anbimaEntries[0];
    if(ae){
      V.anbima=await getJson(ae.path);
      V.anbimaDate=V.anbima.date||ae.date;
    }

    const titles=(V.tesouro?.titles||[])
      .filter(t=>t.type==='Tesouro IPCA+'&&finite(t.buy_rate_pct)&&finite(t.business_days)&&+t.business_days>21)
      .sort((a,b)=>+a.business_days-+b.business_days);
    const select=$('v4TreasuryTitle');
    select.innerHTML='';
    titles.forEach((t,i)=>select.add(new Option(titleLabel(t),String(i))));
    if(!titles.length){
      select.add(new Option('Sem Tesouro IPCA+ comparável',''));
      select.disabled=true;
      throw new Error('Sem títulos Tesouro IPCA+ sem cupom no snapshot atual.');
    }
    select._v4Titles=titles;
    select.value='0';
    V.selected=titles[0];
  }

  function marketIpcaFor(du){
    const implied=(V.anbima?.curves||[]).filter(x=>finite(x.implied_pct)).map(x=>({du:+x.du,rate:+x.implied_pct}));
    return flatForward(implied,du);
  }
  function marketRealFor(du){
    const real=(V.anbima?.curves||[]).filter(x=>finite(x.ipca_pct)).map(x=>({du:+x.du,rate:+x.ipca_pct}));
    return flatForward(real,du);
  }

  function syncSelected(){
    const select=$('v4TreasuryTitle');
    const list=select?._v4Titles||[];
    V.selected=list[+select.value]||list[0]||null;
    if(V.selected&&$('v4TreasuryRate')) $('v4TreasuryRate').value=(+V.selected.buy_rate_pct).toFixed(2);
    syncIpcaMode();
  }

  function syncIpcaMode(){
    const mode=$('v4IpcaMode')?.value||'market';
    const input=$('v4Ipca');
    if(!input||!V.selected) return;
    const isMarket=mode==='market';
    input.readOnly=isMarket;
    if(isMarket){
      const m=marketIpcaFor(+V.selected.business_days);
      if(Number.isFinite(m)) input.value=m.toFixed(2);
    }
  }

  function currentInputs(){
    const t=V.selected;
    const amount=num('v4Amount'),lciSpread=num('v4LciSpread'),ipca=num('v4Ipca');
    const custody=num('v4Custody'),agentFee=num('v4AgentFee');
    const treasurySpread=t?+t.buy_rate_pct:NaN,du=t?+t.business_days:NaN;
    const days=t?calendarDays(V.dataDate,t.maturity):NaN;
    const irPct=irRateByCalendarDays(days);
    return {t,amount,lciSpread,ipca,custody,agentFee,treasurySpread,du,days,irPct};
  }

  function render(){
    if(!V.selected) return;
    syncIpcaMode();
    const x=currentInputs();
    if(![x.amount,x.lciSpread,x.ipca,x.custody,x.agentFee,x.treasurySpread,x.du,x.irPct].every(Number.isFinite)) return;

    const lci=investmentModel({amount:x.amount,ipca:x.ipca,spread:x.lciSpread,du:x.du});
    const tes=investmentModel({amount:x.amount,ipca:x.ipca,spread:x.treasurySpread,du:x.du,taxed:true,irPct:x.irPct,custodyPct:x.custody,agentPct:x.agentFee});
    const marketReal=marketRealFor(x.du),marketImp=marketIpcaFor(x.du);
    const currentVsReal=Number.isFinite(marketReal)?(x.treasurySpread-marketReal)*100:NaN;

    $('v4MarketStrip').innerHTML=`
      <article><span>Data Tesouro</span><strong>${dateBr(V.dataDate)}</strong><small>snapshot usado</small></article>
      <article><span>Vencimento</span><strong>${dateBr(x.t.maturity)}</strong><small>${x.du.toLocaleString('pt-BR')} DU · ${approxHorizon(x.du)}</small></article>
      <article><span>Tesouro · compra</span><strong>IPCA + ${pct(x.treasurySpread,2)}</strong><small>título sem cupom</small></article>
      <article><span>ANBIMA · juro real</span><strong>${Number.isFinite(marketReal)?`IPCA + ${pct(marketReal,2)}`:'—'}</strong><small>${V.anbimaDate?dateBr(V.anbimaDate):'sem referência'}</small></article>
      <article><span>Tesouro − ANBIMA</span><strong class="${currentVsReal>1?'v4Positive':currentVsReal<-1?'v4Negative':'v4Neutral'}">${bps(currentVsReal)}</strong><small>mesmo DU · riscos/fluxos diferentes</small></article>`;

    const lciLead=lci.net>=tes.net;
    const diff=Math.abs(lci.net-tes.net);
    $('v4ResultGrid').innerHTML=`
      <article class="v4ResultCard ${lciLead?'v4Leader':''}">
        <div class="v4ResultHead"><span>LCI IPCA+</span>${lciLead?'<em>maior líquido</em>':''}</div>
        <strong class="v4Rate">IPCA + ${pct(x.lciSpread,2)}</strong>
        <div class="v4NetValue">${money(lci.net)}</div>
        <div class="v4MetaList">
          <div><span>Valor bruto</span><b>${money(lci.gross)}</b></div>
          <div><span>IR</span><b>${money(0)} · isenta PF</b></div>
          <div><span>Taxa nominal modelada</span><b>${pct(lci.nominal,2)}</b></div>
          <div><span>Retorno real contratado</span><b>${pct(x.lciSpread,2)}</b></div>
        </div>
        <small>LCI modelada no mesmo horizonte do Tesouro selecionado. Carência, vencimento, emissor e cobertura FGC precisam ser conferidos na emissão real.</small>
      </article>

      <article class="v4ResultCard ${!lciLead?'v4Leader':''}">
        <div class="v4ResultHead"><span>Tesouro IPCA+</span>${!lciLead?'<em>maior líquido</em>':''}</div>
        <strong class="v4Rate">IPCA + ${pct(x.treasurySpread,2)}</strong>
        <div class="v4NetValue">${money(tes.net)}</div>
        <div class="v4MetaList">
          <div><span>Valor bruto</span><b>${money(tes.gross)}</b></div>
          <div><span>IR estimado</span><b>${money(tes.tax)} · ${pct(x.irPct,1)}</b></div>
          <div><span>Custódia/taxas aprox.</span><b>${money(tes.fees)}</b></div>
          <div><span>Retorno líquido a.a.</span><b>${pct(tes.netAnnual,2)}</b></div>
        </div>
        <small>Premissa: levar até o vencimento. Venda antecipada pode gerar resultado diferente por marcação a mercado.</small>
      </article>

      <article class="v4ResultCard v4WinnerCard">
        <div class="v4ResultHead"><span>Diferença líquida</span></div>
        <div class="v4Difference">${money(diff)}</div>
        <div class="v4WinnerName">${lciLead?'LCI IPCA+':'Tesouro IPCA+'}</div>
        <div class="v4WinnerNote">maior montante no cenário de IPCA ${pct(x.ipca,2)} e horizonte ${approxHorizon(x.du)}</div>
      </article>`;

    const treasuryBE=solveTreasurySpread(lci.net,{amount:x.amount,ipca:x.ipca,du:x.du,irPct:x.irPct,custodyPct:x.custody,agentPct:x.agentFee});
    const lciBE=solveLciSpread(tes.net,{amount:x.amount,ipca:x.ipca,du:x.du});
    const edge=Number.isFinite(treasuryBE)?(x.treasurySpread-treasuryBE)*100:NaN;
    $('v4BreakGrid').innerHTML=`
      <article><span>Tesouro empata com a LCI</span><strong>IPCA + ${pct(treasuryBE,2)}</strong><small>taxa real mínima no modelo, já considerando IR e custos informados</small></article>
      <article><span>LCI empata com o Tesouro atual</span><strong>IPCA + ${pct(lciBE,2)}</strong><small>taxa real isenta que produziria o mesmo montante líquido</small></article>
      <article><span>Tesouro atual − equilíbrio</span><strong class="${edge>1?'v4Positive':edge<-1?'v4Negative':'v4Neutral'}">${bps(edge)}</strong><small>${edge>=0?'acima':'abaixo'} da taxa necessária para empatar neste cenário</small></article>`;

    const sentence=lciLead
      ? `Neste cenário, a <strong>LCI IPCA+ entrega ${money(diff)} a mais</strong> no vencimento, apesar de o Tesouro mostrar uma taxa real de tela ${bps((x.treasurySpread-x.lciSpread)*100)} acima da LCI.`
      : `Neste cenário, o <strong>Tesouro IPCA+ entrega ${money(diff)} a mais</strong> no vencimento, mesmo após o IR e os custos modelados.`;
    const ipcaSource=$('v4IpcaMode').value==='market'
      ? `A inflação usada é a implícita da ANBIMA interpolada no mesmo prazo${Number.isFinite(marketImp)?` (${pct(marketImp,2)})`:''}.`
      : `A inflação usada foi informada manualmente (${pct(x.ipca,2)}).`;
    $('v4Reading').innerHTML=`<p><strong>Leitura do cenário.</strong> ${sentence} O Tesouro precisaria estar em aproximadamente <strong>IPCA + ${pct(treasuryBE,2)}</strong> para empatar com a LCI IPCA + ${pct(x.lciSpread,2)} pelas premissas atuais.</p>
      <p>${ipcaSource} O IR considerado é de <strong>${pct(x.irPct,1)}</strong>, com prazo fiscal aproximado de ${Number.isFinite(x.days)?x.days.toLocaleString('pt-BR'):'—'} dias corridos. Custódia B3: ${pct(x.custody,2)} a.a.; taxa da instituição: ${pct(x.agentFee,2)} a.a.</p>
      <p class="v4Caution">Resultado modelado não equivale a recomendação. Liquidez, carência, risco de crédito, concentração, FGC, risco soberano, objetivo do cliente e eventual venda antecipada podem ser mais relevantes que a diferença financeira estimada.</p>`;

    renderSensitivity(x);
  }

  function renderSensitivity(x){
    const values=[3,4,5,6,7,8,x.ipca]
      .filter(Number.isFinite)
      .map(v=>Math.round(v*100)/100)
      .filter((v,i,a)=>a.indexOf(v)===i)
      .sort((a,b)=>a-b);
    $('v4Sensitivity').innerHTML=values.map(ipca=>{
      const lci=investmentModel({amount:x.amount,ipca,spread:x.lciSpread,du:x.du});
      const be=solveTreasurySpread(lci.net,{amount:x.amount,ipca,du:x.du,irPct:x.irPct,custodyPct:x.custody,agentPct:x.agentFee});
      const diff=(x.treasurySpread-be)*100;
      const current=investmentModel({amount:x.amount,ipca,spread:x.treasurySpread,du:x.du,taxed:true,irPct:x.irPct,custodyPct:x.custody,agentPct:x.agentFee});
      const winner=current.net>=lci.net?'Tesouro':'LCI';
      const market=Math.abs(ipca-x.ipca)<.005;
      return `<tr class="${market?'v4MarketRow':''}"><td>${pct(ipca,2)}${market?' · cenário':''}</td><td>IPCA + ${pct(be,2)}</td><td class="${diff>1?'v4Positive':diff<-1?'v4Negative':'v4Neutral'}">${bps(diff)}</td><td class="${winner==='Tesouro'?'v4Positive':'v4Neutral'}">${winner}</td></tr>`;
    }).join('');
  }

  function bind(){
    $('v4TreasuryTitle')?.addEventListener('change',()=>{syncSelected();render();});
    $('v4IpcaMode')?.addEventListener('change',()=>{syncIpcaMode();render();});
    ['v4Amount','v4LciSpread','v4Ipca','v4Custody','v4AgentFee'].forEach(id=>{
      $(id)?.addEventListener('input',()=>{
        if(id==='v4Ipca'&&$('v4IpcaMode')?.value==='market') return;
        render();
      });
      $(id)?.addEventListener('change',render);
    });
  }

  function v4Copy(){
    document.title='Juros Brasil · V4.0 Teste';
    const build=document.querySelector('.v3Build');
    if(build){build.className='v4Build';build.textContent=VERSION;}
    const intro=$('tab-decisao')?.querySelector('.decisionIntro');
    if(intro){
      const h=intro.querySelector('h2');
      const sub=intro.querySelector('.sectionSubtitle');
      if(h) h.textContent='LCI × Tesouro × cenários de renda fixa';
      if(sub) sub.textContent='Compare estruturas no mesmo prazo, em valor líquido, sem perder as referências de curva, histórico, liquidez e risco.';
    }
    const summary=document.querySelector('.v31SummaryCardDecision strong');
    if(summary) summary.textContent='LCI × Tesouro × cenários';
  }

  async function boot(){
    try{
      buildModule();
      v4Copy();
      await loadMarketData();
      syncSelected();
      bind();
      render();
    }catch(err){
      const host=$('v4Reading');
      if(host) host.innerHTML=`<p><strong>Não foi possível iniciar o comparador V4.</strong> ${String(err?.message||err)}</p>`;
      console.error('[V4]',err);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
