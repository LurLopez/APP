/**
 * @fileoverview Renderizadores de gráficos vectoriales SVG y componentes HTML para informes.
 * @module services/reportExport/svgRenderers
 */

import { escapeHtml } from './exportColors.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

export function renderSharesChartSvg(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const W = 640; const H = 232; const padL = 50; const padR = 10; const padT = 14; const padB = 26;
  const plotW = W - padL - padR; const plotH = H - padT - padB;
  const n = chart.points.length; const max = chart.max;
  const step = max > 500 ? 100 : (max > 100 ? 50 : 10);
  const niceMax = Math.ceil(max / step) * step || max;
  const xFor = (i) => padL + (plotW / n) * (i + 0.5);
  const yFor = (v) => padT + plotH * (1 - v / niceMax);
  const fmtP = (v) => `${v < 0 ? '' : '-'}${v.toFixed(1).replace('.', ',')} %`;
  const fmtB = (v) => `+${v.toFixed(1).replace('.', ',')} %`;
  const parts = [];

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = yFor(v).toFixed(1);
    parts.push(`<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(parseFloat(gy) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">${Math.round(v)}M</text>`);
  }

  const slotW = plotW / n;
  const barW = Math.min(46, slotW * 0.6);
  chart.points.forEach((p, i) => {
    const cx = xFor(i).toFixed(1);
    const top = yFor(p.shares).toFixed(1);
    parts.push(`<rect x="${(parseFloat(cx) - barW / 2).toFixed(1)}" y="${top}" width="${barW.toFixed(1)}" height="${(padT + plotH - parseFloat(top)).toFixed(1)}" rx="2" fill="#f59e0b"/>`);
    parts.push(`<text x="${cx}" y="${(padT + plotH + 14).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${escapeHtml(String(p.year))}</text>`);
  });

  const mets = Array.isArray(chart.metrics) ? chart.metrics : [];
  const y0 = yFor(chart.points[0].shares);
  const yN = yFor(chart.points[n - 1].shares);
  parts.push(`<line x1="${xFor(0).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${xFor(n - 1).toFixed(1)}" y2="${yN.toFixed(1)}" stroke="#1f2937" stroke-width="1.6" stroke-dasharray="6 4"/>`);
  if (mets.length) {
    const midX = (xFor(0) + xFor(n - 1)) / 2;
    const lineMidY = (y0 + yN) / 2;
    const label1 = `CAGR: ${fmtP(mets[0].pct)} · BPA ${fmtB(mets[0].bpa)}`;
    const w1 = label1.length * 5.4 + 12;
    parts.push(`<rect x="${(midX - w1 / 2).toFixed(1)}" y="${(lineMidY - 20).toFixed(1)}" width="${w1.toFixed(1)}" height="15" rx="3" fill="#1f2937"/>`);
    parts.push(`<text x="${midX.toFixed(1)}" y="${(lineMidY - 9).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escapeHtml(label1)}</text>`);
    if (mets[1]) {
      const xPrev = xFor(n - 2);
      const yPrev = yFor(chart.points[n - 2].shares);
      parts.push(`<line x1="${xPrev.toFixed(1)}" y1="${yPrev.toFixed(1)}" x2="${xFor(n - 1).toFixed(1)}" y2="${yN.toFixed(1)}" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="6 4"/>`);
      const label2 = t('Últ. año: {pct} · BPA {bpa}', { pct: fmtP(mets[1].pct), bpa: fmtB(mets[1].bpa) }, normalizeLanguage(chart.language));
      const w2 = label2.length * 5.4 + 12;
      const lx = Math.min(W - padR - w2 / 2, (xPrev + xFor(n - 1)) / 2);
      parts.push(`<rect x="${(lx - w2 / 2).toFixed(1)}" y="${(lineMidY - 40).toFixed(1)}" width="${w2.toFixed(1)}" height="15" rx="3" fill="#dc2626"/>`);
      parts.push(`<text x="${lx.toFixed(1)}" y="${(lineMidY - 29).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escapeHtml(label2)}</text>`);
    }
  }
  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

export function renderHtmlSharesChart(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return '';
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chart.title)}</div>${renderSharesChartSvg(chart)}</div>`;
}

export function renderDebtMaturitySvg(chart) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return '';
  const W = 640; const H = 275; const padL = 52; const padR = 14; const padT = 32; const padB = 62;
  const plotW = W - padL - padR; const plotH = H - padT - padB; const max = chart.maxYearAmount || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const n = chart.years.length; const slotW = plotW / n; const barW = Math.min(50, slotW * 0.65);
  const fmtMillions = (val) => {
    const [int, dec] = Number(val).toFixed(1).split('.');
    return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}M`;
  };
  const parts = [];

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = padT + plotH * (1 - v / niceMax);
    parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
  }

  chart.years.forEach((yr, i) => {
    const cx = padL + slotW * (i + 0.5);
    const items = Array.isArray(yr.items) ? yr.items.filter((it) => Number.isFinite(Number(it?.amount)) && Number(it.amount) > 0) : [];
    let baseline = padT + plotH;
    if (items.length) {
      const multi = items.length > 1;
      items.forEach((it) => {
        const blockH = Math.max(3, (Number(it.amount) / niceMax) * plotH);
        const topY = baseline - blockH;
        parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${barW.toFixed(1)}" height="${blockH.toFixed(1)}" rx="2" fill="${it.color || '#f59e0b'}"/>`);
        const rateText = it.interestRate != null ? `${it.estimated ? '~' : ''}${Number(it.interestRate).toFixed(2).replace('.', ',')}%` : null;
        if (multi && blockH >= 18 && barW >= 28) {
          const textTop = topY + blockH / 2 - 2;
          parts.push(`<text x="${cx.toFixed(1)}" y="${textTop.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${it.textColor || '#ffffff'}">${fmtMillions(it.amount)}</text>`);
          if (rateText) parts.push(`<text x="${cx.toFixed(1)}" y="${(textTop + 9).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="${it.textColor || '#ffffff'}">${rateText}</text>`);
        } else if (rateText && blockH >= 11 && barW >= 26) {
          parts.push(`<text x="${cx.toFixed(1)}" y="${(topY + blockH / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="${it.textColor || '#ffffff'}">${rateText}</text>`);
        }
        baseline = topY;
      });
    } else {
      parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH - 4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#94a3b8">—</text>`);
    }
    if (yr.totalAmount > 0) {
      parts.push(`<text x="${cx.toFixed(1)}" y="${Math.max(padT + 10, baseline - 11).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">${fmtMillions(yr.totalAmount)}</text>`);
    }
    parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${yr.year}</text>`);
  });

  const bannerY = H - 28;
  parts.push(`<rect x="${padL}" y="${bannerY}" width="${plotW}" height="22" rx="4" fill="#1e293b"/>`);
  const svgLang = normalizeLanguage(chart.language);
  const afterText = chart.afterYearFive != null ? `  ·  ${t('Después del año 5: {amount}', { amount: fmtMillions(chart.afterYearFive) }, svgLang)}` : '';
  const rateLabel = chart.totalAverageRateEstimated
    ? t('Tipo de interés medio estimado de la deuda', null, svgLang)
    : t('Tipo de interés medio total de la deuda', null, svgLang);
  const rateValue = chart.totalAverageRateEstimated ? '~' : '';
  const bannerText = chart.totalAverageRate != null
    ? `${rateLabel}: ${rateValue}${chart.totalAverageRate.toFixed(2).replace('.', ',')} %  ·  ${t('Deuda a amortizar: {amount}', { amount: fmtMillions(chart.totalAmount) }, svgLang)}${afterText}`
    : `${t('Deuda a amortizar en los próximos 5 años: {amount}', { amount: fmtMillions(chart.totalAmount) }, svgLang)}${afterText}`;
  parts.push(`<text x="${(padL + plotW / 2).toFixed(1)}" y="${bannerY + 14.5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">${escapeHtml(bannerText)}</text>`);

  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

export function renderHtmlDebtMaturityChart(chart) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return '';
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chart.title)}</div>${renderDebtMaturitySvg(chart)}</div>`;
}

export function renderDebtHistorySvg(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const W = 640; const H = 260; const padL = 52; const padR = 14; const padT = 32; const padB = 44;
  const plotW = W - padL - padR; const plotH = H - padT - padB; const max = chart.maxVal || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const n = chart.points.length; const slotW = plotW / n; const groupW = Math.min(48, slotW * 0.76); const barW = (groupW - 4) / 2;
  const parts = [];

  parts.push('<rect x="170" y="10" width="10" height="10" rx="2" fill="#1e40af"/>');
  parts.push(`<text x="185" y="18" font-size="8.5" font-weight="700" fill="#334155">${escapeHtml(t('Deuda Normal / Total', null, normalizeLanguage(chart.language)))}</text>`);
  parts.push('<rect x="330" y="10" width="10" height="10" rx="2" fill="#d97706"/>');
  parts.push(`<text x="345" y="18" font-size="8.5" font-weight="700" fill="#334155">${escapeHtml(t('Deuda Neta', null, normalizeLanguage(chart.language)))}</text>`);
  const cagrParts = [];
  if (chart.cagrTotalDebt != null) cagrParts.push(`normal ${chart.cagrTotalDebt >= 0 ? '+' : ''}${chart.cagrTotalDebt.toFixed(1).replace('.', ',')} %`);
  if (chart.cagrNetDebt != null) cagrParts.push(`neta ${chart.cagrNetDebt >= 0 ? '+' : ''}${chart.cagrNetDebt.toFixed(1).replace('.', ',')} %`);
  if (cagrParts.length) parts.push(`<text x="${W - padR}" y="18" text-anchor="end" font-size="8.5" font-weight="700" fill="#64748b">CAGR ${chart.points[0].year}–${chart.points[chart.points.length - 1].year}: ${escapeHtml(cagrParts.join(' · '))}</text>`);

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = padT + plotH * (1 - v / niceMax);
    parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
  }

  chart.points.forEach((p, i) => {
    const cx = padL + slotW * (i + 0.5);
    const top1 = padT + plotH * (1 - p.totalDebt / niceMax);
    const top2 = Number.isFinite(p.netDebt) ? padT + plotH * (1 - Math.max(0, p.netDebt) / niceMax) : padT + plotH;
    parts.push(`<rect x="${(cx - groupW / 2).toFixed(1)}" y="${top1.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top1).toFixed(1)}" rx="2" fill="#1e40af"/>`);
    parts.push(`<text x="${(cx - groupW / 2 + barW / 2).toFixed(1)}" y="${(top1 - 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#1e40af">${Math.round(p.totalDebt)}M</text>`);
    if (Number.isFinite(p.netDebt)) {
      parts.push(`<rect x="${(cx - groupW / 2 + barW + 4).toFixed(1)}" y="${top2.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top2).toFixed(1)}" rx="2" fill="#d97706"/>`);
      parts.push(`<text x="${(cx - groupW / 2 + barW + 4 + barW / 2).toFixed(1)}" y="${(top2 - 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#d97706">${Math.round(p.netDebt)}M</text>`);
    }
    parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 13).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#334155">${p.year}</text>`);
    const deltaY = padT + plotH + 24;
    if (p.deltaTotalDebt != null) {
      parts.push(`<text x="${(cx - groupW / 2 + barW / 2).toFixed(1)}" y="${deltaY.toFixed(1)}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${p.deltaTotalDebt < 0 ? '#16a34a' : '#dc2626'}">${p.deltaTotalDebt > 0 ? '+' : ''}${Math.round(p.deltaTotalDebt)}M</text>`);
    }
    if (p.deltaNetDebt != null) {
      parts.push(`<text x="${(cx - groupW / 2 + barW + 4 + barW / 2).toFixed(1)}" y="${deltaY.toFixed(1)}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${p.deltaNetDebt < 0 ? '#16a34a' : '#dc2626'}">${p.deltaNetDebt > 0 ? '+' : ''}${Math.round(p.deltaNetDebt)}M</text>`);
    }
  });

  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

export function renderHtmlDebtHistoryChart(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return '';
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chart.title)}</div>${renderDebtHistorySvg(chart)}</div>`;
}

export function renderDividendSvg(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const W = 640; const H = 250; const padL = 54; const padR = 54; const padT = 34; const padB = 40;
  const plotW = W - padL - padR; const plotH = H - padT - padB;
  const maxDps = Math.max(...chart.points.map((p) => (Number.isFinite(p.dps) ? p.dps : 0)), 0.5);
  const dpsStep = maxDps > 5 ? 2 : (maxDps > 2 ? 1 : (maxDps > 1 ? 0.5 : 0.25));
  const niceDps = Math.ceil(maxDps / dpsStep) * dpsStep || maxDps;
  const maxPayout = Math.max(...chart.points.map((p) => (Number.isFinite(p.payoutPct) ? p.payoutPct : 0)), 25);
  const nicePayout = Math.ceil(maxPayout / 25) * 25 || 25;
  const n = chart.points.length; const slotW = plotW / n; const barW = Math.min(46, slotW * 0.5);
  const yDps = (v) => padT + plotH * (1 - Math.max(0, v) / niceDps);
  const yPayout = (v) => padT + plotH * (1 - Math.max(0, v) / nicePayout);
  const parts = [];

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceDps * (3 - g)) / 3; const gy = yDps(v);
    parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${v.toFixed(1).replace('.', ',')}</text>`);
    parts.push(`<text x="${W - padR + 6}" y="${(gy + 3).toFixed(1)}" text-anchor="start" font-size="9" fill="#0f766e">${Math.round((nicePayout * (3 - g)) / 3)}%</text>`);
  }

  parts.push(`<rect x="${padL}" y="10" width="10" height="10" rx="2" fill="#f59e0b"/>`);
  parts.push(`<text x="${padL + 14}" y="18" font-size="8.5" font-weight="700" fill="#334155">${escapeHtml(t('Dividendo por acción ($)', null, normalizeLanguage(chart.language)))}</text>`);
  parts.push(`<line x1="${padL + 165}" y1="15" x2="${padL + 185}" y2="15" stroke="#0f766e" stroke-width="2.5"/>`);
  parts.push(`<circle cx="${padL + 175}" cy="15" r="3.2" fill="#0f766e"/>`);
  parts.push(`<text x="${padL + 190}" y="18" font-size="8.5" font-weight="700" fill="#0f766e">${escapeHtml(t('Payout s/ BPA ajustado (%)', null, normalizeLanguage(chart.language)))}</text>`);
  if (chart.dpsCagr != null || chart.totalCagr != null) {
    const cagrParts = [];
    if (chart.totalCagr != null) cagrParts.push(`importe ${chart.totalCagr >= 0 ? '+' : ''}${chart.totalCagr.toFixed(1).replace('.', ',')} %`);
    if (chart.dpsCagr != null) cagrParts.push(`por acción ${chart.dpsCagr >= 0 ? '+' : ''}${chart.dpsCagr.toFixed(1).replace('.', ',')} %`);
    parts.push(`<text x="${W - 14}" y="30" text-anchor="end" font-size="8.5" font-weight="700" fill="#64748b">CAGR ${chart.points[0].year}–${chart.points[chart.points.length - 1].year}: ${escapeHtml(cagrParts.join(' · '))}</text>`);
  }

  const linePoints = [];
  chart.points.forEach((point, i) => {
    const cx = padL + slotW * (i + 0.5);
    if (Number.isFinite(point.dps)) {
      const top = yDps(point.dps);
      parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top).toFixed(1)}" rx="2" fill="#f59e0b"/>`);
      parts.push(`<text x="${cx.toFixed(1)}" y="${(top - 4).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#b45309">${Number(point.dps).toFixed(2).replace('.', ',')} $</text>`);
    }
    parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${point.year}</text>`);
    if (Number.isFinite(point.payoutPct)) {
      linePoints.push({ x: cx, y: yPayout(point.payoutPct), pct: point.payoutPct, barTop: Number.isFinite(point.dps) ? yDps(point.dps) : null, barLeft: cx - barW / 2, barRight: cx + barW / 2 });
    }
  });
  if (linePoints.length >= 2) {
    parts.push(`<polyline points="${linePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#0f766e" stroke-width="2.5"/>`);
  }
  linePoints.forEach((p) => {
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="#0f766e"/>`);
    const pctLabel = `${p.pct.toFixed(1).replace('.', ',')}%`;
    const overlaps = p.barTop != null && Math.abs((p.y - 8) - (p.barTop - 4)) < 13;
    if (overlaps) {
      const placeRight = p.barRight + 6 + pctLabel.length * 4.6 <= W - padR;
      parts.push(`<text x="${placeRight ? (p.barRight + 6).toFixed(1) : (p.barLeft - 6).toFixed(1)}" y="${(p.y + 3).toFixed(1)}" text-anchor="${placeRight ? 'start' : 'end'}" font-size="8.5" font-weight="700" fill="#0f766e">${pctLabel}</text>`);
    } else {
      parts.push(`<text x="${p.x.toFixed(1)}" y="${Math.min(Math.max(p.y - 8, padT + 8), padT + plotH + 12).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0f766e">${pctLabel}</text>`);
    }
  });

  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

export function renderHtmlDividendChart(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const divLang = normalizeLanguage(chart.language);
  const note = chart.hasReportedFallback ? ` · ${t('* años con BPA reportado (sin ajustado)', null, divLang)}` : '';
  const chartTitle = t('EVOLUCIÓN DEL DIVIDENDO Y PAYOUT ({from}–{to})', { from: chart.points[0].year, to: chart.points[chart.points.length - 1].year }, divLang);
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chartTitle)}${note ? `<span style="font-weight:400;color:#94a3b8;">${escapeHtml(note)}</span>` : ''}</div>${renderDividendSvg(chart)}</div>`;
}
