(() => {
  // Complemento visual da V1.2: substitui somente a renderização do gráfico
  // de evolução, preservando toda a lógica de coleta/seleção do app.js.
  const TENORS = [
    { du:126, label:"6M" },
    { du:252, label:"1A" },
    { du:504, label:"2A" },
    { du:756, label:"3A" },
    { du:1260, label:"5A" },
    { du:1764, label:"7A" },
    { du:2520, label:"10A" },
    { du:3780, label:"15A" },
  ];
  const READING_DU = [252, 504, 756, 1260, 1764, 2520];

  function average(values) {
    const xs = values.filter(Number.isFinite);
    return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : NaN;
  }

  function interpolateRate(contracts, targetDu) {
    const pts = (contracts || [])
      .filter(c => Number.isFinite(c.business_days) && Number.isFinite(c.rate_pct))
      .map(c => ({du:+c.business_days, rate:+c.rate_pct}))
      .sort((a,b)=>a.du-b.du);

    const exact = pts.find(p => p.du === targetDu);
    if (exact) return exact.rate;

    let left = null, right = null;
    for (const p of pts) {
      if (p.du < targetDu) left = p;
      if (p.du > targetDu) { right = p; break; }
    }
    if (!left || !right) return NaN;
    const w = (targetDu-left.du)/(right.du-left.du);
    return left.rate + w*(right.rate-left.rate);
  }

  function regionName(du) {
    if (du <= 252) return "curto prazo";
    if (du <= 756) return "miolo da curva";
    return "ponta longa";
  }

  function buildEvolutionReading(series) {
    const host = document.getElementById("evolutionReading");
    if (!host) return;
    if (!series?.length || series.length < 2) {
      host.textContent = "Selecione ao menos uma janela histórica para comparar com a curva atual.";
      return;
    }

    const current = series.find(s => s.current) || series[0];
    const reference = [...series].filter(s => !s.current).at(-1);
    if (!current || !reference) return;

    const rows = READING_DU.map(du => {
      const a = interpolateRate(current.contracts, du);
      const b = interpolateRate(reference.contracts, du);
      return { du, diff: Number.isFinite(a) && Number.isFinite(b) ? (a-b)*100 : NaN };
    }).filter(r => Number.isFinite(r.diff));

    if (!rows.length) {
      host.textContent = `Não há área comum suficiente para resumir a comparação com ${reference.label}.`;
      return;
    }

    const threshold = 5;
    const ups = rows.filter(r => r.diff > threshold).length;
    const downs = rows.filter(r => r.diff < -threshold).length;
    let direction;
    if (ups >= Math.ceil(rows.length * .67)) direction = "acima";
    else if (downs >= Math.ceil(rows.length * .67)) direction = "abaixo";
    else direction = "mista";

    const regionGroups = {
      "curto prazo": rows.filter(r => r.du <= 252),
      "miolo da curva": rows.filter(r => r.du > 252 && r.du <= 756),
      "ponta longa": rows.filter(r => r.du > 756),
    };
    const ranked = Object.entries(regionGroups)
      .map(([name, rs]) => ({name, avg: average(rs.map(r=>r.diff))}))
      .filter(x => Number.isFinite(x.avg))
      .sort((a,b) => Math.abs(b.avg)-Math.abs(a.avg));
    const strongest = ranked[0];

    const refText = `${reference.label} (${fmtDate(reference.date)})`;
    if (direction === "mista") {
      host.textContent = `Na comparação com ${refText}, o movimento é misto entre os prazos. ${
        strongest ? `A maior distância média aparece no ${strongest.name} (${fmtBp(strongest.avg)}).` : ""
      }`;
      return;
    }

    const count = direction === "acima" ? ups : downs;
    const qualifier = count === rows.length ? "em todos os vértices comparáveis" : "na maior parte dos vértices comparáveis";
    host.textContent = `Na comparação com ${refText}, a curva atual está ${direction} ${qualifier}. ${
      strongest ? `A maior distância média aparece no ${strongest.name} (${fmtBp(strongest.avg)}).` : ""
    }`;
  }

  function renderEvolutionAxesV2(svg, scales) {
    const { width, height, pad, xMin, xMax, yMin, yMax, sx, sy } = scales;

    for (const y of niceTicks(yMin, yMax, 5)) {
      const yy = sy(y);
      svg.append(svgEl("line", { x1:pad.l, x2:width-pad.r, y1:yy, y2:yy, class:"grid" }));
      const t = svgEl("text", { x:pad.l-10, y:yy+4, "text-anchor":"end", class:"evoAxisLabel" });
      t.textContent = `${y.toFixed(2)}%`;
      svg.append(t);
    }

    const ticks = TENORS.filter(t => t.du >= xMin && t.du <= xMax);
    for (const tick of ticks) {
      const xx = sx(tick.du);
      svg.append(svgEl("line", { x1:xx, x2:xx, y1:pad.t, y2:height-pad.b, class:"grid" }));
      const t = svgEl("text", {
        x:xx, y:height-18, "text-anchor":"middle", class:"evoTenorLabel"
      });
      t.textContent = tick.label;
      const title = svgEl("title");
      title.textContent = `${tick.du.toLocaleString("pt-BR")} dias úteis`;
      t.append(title);
      svg.append(t);
    }

    svg.append(svgEl("line", {
      x1:pad.l, x2:width-pad.r,
      y1:height-pad.b, y2:height-pad.b,
      class:"axis"
    }));
  }

  // Override intencional da função global declarada em app.js.
  renderEvolutionLegend = function(series) {
    const host = document.getElementById("evolutionLegend");
    if (!host) return;
    host.innerHTML = series.map(item => {
      const label = item.current ? "Atual" : item.label;
      return `<span><i class="legendLine" style="background:${item.color}"></i><strong>${label}</strong> ${fmtDate(item.date)}</span>`;
    }).join("");
    const count = document.getElementById("evolutionCount");
    if (count) count.textContent = `${series.length} curva${series.length === 1 ? "" : "s"} no gráfico`;
  };

  renderEvolutionChart = function(series) {
    const host = document.getElementById("evolutionChart");
    if (!host) return;
    host.innerHTML = "";

    const scales = buildChartScales(series, host);
    if (!scales) {
      host.innerHTML = '<div class="error">Sem dados suficientes para o gráfico histórico.</div>';
      buildEvolutionReading([]);
      return;
    }

    const svg = svgEl("svg", {
      viewBox:`0 0 ${scales.width} ${scales.height}`,
      role:"img",
      "aria-label":"Evolução histórica da curva DI por prazo"
    });
    renderEvolutionAxesV2(svg, scales);

    series.forEach(item => {
      plotSeries(svg, item.contracts, scales, {
        className:item.current ? "seriesLine current" : "seriesLine",
        stroke:item.color,
        strokeWidth:item.current ? 3.5 : 2.1,
        opacity:item.current ? 1 : .78,
        showPoints:false
      });
    });

    host.append(svg);
    renderEvolutionLegend(series);
    buildEvolutionReading(series);
  };
})();
