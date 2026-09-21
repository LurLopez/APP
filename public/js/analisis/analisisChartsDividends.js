/**
 * @fileoverview Gráficos de dividendos y refinanciación del análisis (extraído de ChartsDividends.js).
 */

(function (window) {


  function renderDebtHistoryChart(debt, report) {
    const parseNum = (val) => {
      if (val == null) return NaN;
      let s = String(val).replace(/[$€£\s]/g, '').trim();
      if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
      else if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
      return parseFloat(s);
    };

    const sources = [];
    if (Array.isArray(report?.edgarDebtHistory) && report.edgarDebtHistory.length) sources.push(report.edgarDebtHistory);
    if (Array.isArray(debt?.debtHistory) && debt.debtHistory.length) sources.push(debt.debtHistory);
    if (!sources.length) return '';

    const byYear = new Map();
    sources.forEach((list) => {
      list.forEach((p) => {
        const year = Number(p?.year || (p?.periodEnd ? parseInt(String(p.periodEnd).slice(0, 4), 10) : null));
        const totalDebt = parseNum(p?.totalDebt);
        const netDebt = parseNum(p?.netDebt);
        if (!Number.isFinite(year) || !Number.isFinite(totalDebt)) return;
        if (!byYear.has(year)) byYear.set(year, { year, totalDebt, netDebt: Number.isFinite(netDebt) ? netDebt : null });
      });
    });

    const points = [...byYear.values()].sort((a, b) => a.year - b.year).slice(-10);
    if (points.length < 2) return '';

    const max = Math.max(...points.flatMap((p) => [p.totalDebt, Number.isFinite(p.netDebt) ? p.netDebt : 0])) || 1;
    const min = Math.min(0, ...points.flatMap((p) => [p.totalDebt, Number.isFinite(p.netDebt) ? p.netDebt : 0]));
    const W = 640, H = 260, padL = 52, padR = 14, padT = 32, padB = 44;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
    const niceMax = Math.ceil(max / step) * step || max;
    const niceMin = min < 0 ? -Math.ceil(Math.abs(min) / step) * step : 0;
    const range = niceMax - niceMin || niceMax;
    const yFor = (v) => padT + plotH * (niceMax - v) / range;
    const baseY = yFor(0);
    const hasNegative = niceMin < 0;
    const slotW = plotW / points.length;
    const groupW = Math.min(48, slotW * 0.76);
    const barW = (groupW - 4) / 2;
    const parts = [];

    parts.push('<rect x="170" y="10" width="10" height="10" rx="2" fill="#1e40af"/>');
    parts.push('<text x="185" y="18" font-size="8.5" font-weight="700" fill="#334155">Deuda Normal / Total</text>');
    parts.push('<rect x="330" y="10" width="10" height="10" rx="2" fill="#d97706"/>');
    parts.push('<text x="345" y="18" font-size="8.5" font-weight="700" fill="#334155">Deuda Neta</text>');

    for (let g = 0; g <= 4; g += 1) {
      const v = niceMax - (range * g) / 4;
      const gy = yFor(v);
      const isBottom = g === 4 && !hasNegative;
      parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${isBottom ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${isBottom ? ' stroke-dasharray="4 3"' : ''}/>`);
      parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">${v < 0 ? '-' : ''}$${Math.round(Math.abs(v))}M</text>`);
    }
    if (hasNegative) {
      parts.push(`<line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="#94a3b8" stroke-width="1.2"/>`);
    }

    points.forEach((p, i) => {
      const cx = padL + slotW * (i + 0.5);
      const top1 = yFor(p.totalDebt);
      const xTotal = cx - groupW / 2;
      const xNet = cx - groupW / 2 + barW + 4;

      parts.push(`<rect x="${xTotal.toFixed(1)}" y="${Math.min(top1, baseY).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.abs(baseY - top1).toFixed(1)}" rx="2" fill="#1e40af"/>`);
      parts.push(`<text x="${(xTotal + barW / 2).toFixed(1)}" y="${(top1 - 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#1e40af">${Math.round(p.totalDebt)}M</text>`);

      if (Number.isFinite(p.netDebt)) {
        const yNet = yFor(p.netDebt);
        if (p.netDebt >= 0) {
          parts.push(`<rect x="${xNet.toFixed(1)}" y="${Math.min(yNet, baseY).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.abs(baseY - yNet).toFixed(1)}" rx="2" fill="#d97706"/>`);
          parts.push(`<text x="${(xNet + barW / 2).toFixed(1)}" y="${(yNet - 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#d97706">${Math.round(p.netDebt)}M</text>`);
        } else {
          parts.push(`<rect x="${xNet.toFixed(1)}" y="${baseY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.abs(yNet - baseY).toFixed(1)}" rx="2" fill="#d97706"/>`);
          parts.push(`<text x="${(xNet + barW / 2).toFixed(1)}" y="${(yNet + 9).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#d97706">${Math.round(p.netDebt)}M</text>`);
        }
      }
      const yearY = padT + plotH + (hasNegative ? 24 : 13);
      parts.push(`<text x="${cx.toFixed(1)}" y="${yearY.toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#334155">${p.year}</text>`);
    });

    const title = `EVOLUCIÓN DE LA DEUDA: NORMAL VS NETA (${points[0].year}–${points[points.length - 1].year})`;
    return `<div class="shares-chart"><div class="sc-title">${escapeHtml(title)}</div><svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg></div>`;
  }

  function renderDividendChart(div, report) {
    const parseNum = (val) => {
      if (val == null) return NaN;
      let s = String(val).replace(/[$€£\s]/g, '').trim();
      if (!s) return NaN;
      if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(/,/g, '.') : s.replace(/,/g, '');
      else if (s.includes(',')) s = s.replace(',', '.');
      return parseFloat(s);
    };

    const rawHistory = (Array.isArray(div?.history) && div.history.length)
      ? div.history
      : (Array.isArray(report?.edgarDividendHistory) ? report.edgarDividendHistory : []);
    const points = rawHistory
      .map((p) => ({ year: Number(p?.year), dps: parseNum(p?.dps), total: parseNum(p?.total), adjustedEps: parseNum(p?.adjustedEps), eps: parseNum(p?.eps) }))
      .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.dps) && p.dps > 0)
      .sort((a, b) => a.year - b.year)
      .slice(-5);
    if (points.length < 2) return '';

    points.forEach((p) => {
      const eps = Number.isFinite(p.adjustedEps) && p.adjustedEps > 0 ? p.adjustedEps : (Number.isFinite(p.eps) && p.eps > 0 ? p.eps : null);
      p.payoutPct = eps ? Math.round((p.dps / eps) * 1000) / 10 : null;
    });

    const W = 640, H = 250, padL = 54, padR = 54, padT = 34, padB = 40;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxDps = Math.max(...points.map((p) => p.dps), 0.5);
    const dpsStep = maxDps > 5 ? 2 : (maxDps > 2 ? 1 : 0.5);
    const niceDps = Math.ceil(maxDps / dpsStep) * dpsStep || maxDps;
    const maxPayout = Math.max(...points.map((p) => p.payoutPct || 0), 25);
    const nicePayout = Math.ceil(maxPayout / 25) * 25 || 25;
    const slotW = plotW / points.length;
    const barW = Math.min(46, slotW * 0.5);
    const yDps = (v) => padT + plotH * (1 - Math.max(0, v) / niceDps);
    const yPayout = (v) => padT + plotH * (1 - Math.max(0, v) / nicePayout);
    const parts = [];

    for (let g = 0; g <= 3; g += 1) {
      const v = (niceDps * (3 - g)) / 3;
      const gy = yDps(v);
      parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
      parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${v.toFixed(1).replace('.', ',')}</text>`);
      parts.push(`<text x="${W - padR + 6}" y="${(gy + 3).toFixed(1)}" text-anchor="start" font-size="9" fill="#0f766e">${Math.round((nicePayout * (3 - g)) / 3)}%</text>`);
    }

    const linePoints = [];
    points.forEach((p, i) => {
      const cx = padL + slotW * (i + 0.5);
      const top = yDps(p.dps);
      parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top).toFixed(1)}" rx="2" fill="#f59e0b"/>`);
      parts.push(`<text x="${cx.toFixed(1)}" y="${(top - 4).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#b45309">${Number(p.dps).toFixed(2).replace('.', ',')} $</text>`);
      parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${p.year}</text>`);
      if (Number.isFinite(p.payoutPct)) linePoints.push({ x: cx, y: yPayout(p.payoutPct), pct: p.payoutPct });
    });

    if (linePoints.length >= 2) {
      parts.push(`<polyline points="${linePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#0f766e" stroke-width="2.5"/>`);
    }
    linePoints.forEach((p) => {
      parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="#0f766e"/>`);
      parts.push(`<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0f766e">${p.pct.toFixed(1).replace('.', ',')}%</text>`);
    });

    const title = `EVOLUCIÓN DEL DIVIDENDO Y PAYOUT (${points[0].year}–${points[points.length - 1].year})`;
    return `<div class="shares-chart"><div class="sc-title">${escapeHtml(title)}</div><svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg></div>`;
  }

  function renderDebtRefinancingCard(debt, report) {
    if (!debt || debt.refinancing?.occurred !== true) return '';
    const oldRate = debt.refinancing?.oldDebtRate ?? null;
    const newRate = debt.refinancing?.newDebtRate ?? null;
    const amount = debt.refinancing?.amountRefinanced ?? null;

    if (!Number.isFinite(oldRate) && !Number.isFinite(newRate) && !Number.isFinite(amount) && !debt.refinancingAnalysis && !debt.refinancingImpact) {
      return '';
    }

    const epsImpact = Number(debt.refinancing?.epsImpact);
    const epsBadge = Number.isFinite(epsImpact)
      ? `<div class="annual-badge"><strong>Impacto en BPA:</strong> ${epsImpact >= 0 ? '+' : ''}${epsImpact.toFixed(2).replace('.', ',')} $/acc</div>`
      : '';

    return `
      <div class="annual-calc-box" style="border-left-color:#ea580c;background:#fff7ed;">
        <strong style="color:#9a3412;">Refinanciación de deuda e impacto en BPA:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;">
          <div class="annual-badge"><strong>Tipo deuda anterior:</strong> ${oldRate != null ? `${oldRate.toFixed(2).replace('.', ',')} %` : '—'}</div>
          <div class="annual-badge"><strong>Tipo nueva emisión:</strong> ${newRate != null ? `${newRate.toFixed(2).replace('.', ',')} %` : '—'}</div>
          <div class="annual-badge"><strong>Volumen refinanciado:</strong> ${amount != null ? `$${Math.round(amount)}M` : '—'}</div>
          ${epsBadge}
        </div>
        ${debt.refinancingAnalysis ? `<p>${formatAnnualRichText(debt.refinancingAnalysis)}</p>` : ''}
        ${debt.refinancingImpact ? `<p class="calc-impact" style="color:#9a3412;"><strong>Impacto en costes e intereses:</strong> ${formatAnnualRichText(debt.refinancingImpact)}</p>` : ''}
      </div>
    `;
  }

window.renderDebtHistoryChart = renderDebtHistoryChart;
window.renderDividendChart = renderDividendChart;
window.renderDebtRefinancingCard = renderDebtRefinancingCard;

})(window);
