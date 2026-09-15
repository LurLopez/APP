/**
 * @fileoverview Gráficos de acciones y deuda del análisis (extraído de ChartsDebt.js).
 */

(function (window) {


  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function formatAnnualRichText(text) {
    if (typeof window.AnalisisTables?.formatAnnualRichText === 'function') {
      return window.AnalisisTables.formatAnnualRichText(text);
    }
    return escapeHtml(text);
  }

  function renderSharesChart(sharesHistory) {
    if (!Array.isArray(sharesHistory) || !sharesHistory.length) return '';
    const points = sharesHistory
      .map((h) => ({ year: String(h?.year ?? ''), shares: Number(h?.shares) }))
      .filter((p) => p.year && Number.isFinite(p.shares) && p.shares > 0);
    if (points.length < 2) return '';
    const n = points.length;
    const max = Math.max(...points.map((p) => p.shares));
    const chartTitle = points.length >= 5
      ? 'EVOLUCIÓN DEL NÚMERO DE ACCIONES (ÚLTIMOS 5 AÑOS)'
      : 'EVOLUCIÓN DEL NÚMERO DE ACCIONES (AÑOS DISPONIBLES)';

    const W = 640, H = 232, padL = 50, padR = 10, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = max > 500 ? 100 : (max > 100 ? 50 : 10);
    const niceMax = Math.ceil(max / step) * step || max;
    const xFor = (i) => padL + (plotW / n) * (i + 0.5);
    const yFor = (v) => padT + plotH * (1 - v / niceMax);
    const fmtP = (v) => `${v < 0 ? '' : '-'}${v.toFixed(1).replace('.', ',')} %`;
    const fmtB = (v) => `+${v.toFixed(1).replace('.', ',')} %`;
    const cagrPct = (1 - Math.pow(points[n - 1].shares / points[0].shares, 1 / (n - 1))) * 100;
    const bpaCagr = (cagrPct / (100 - cagrPct)) * 100;
    const lastPct = (1 - points[n - 1].shares / points[n - 2].shares) * 100;
    const bpaLast = (lastPct / (100 - lastPct)) * 100;
    const parts = [];

    for (let g = 0; g <= 3; g += 1) {
      const v = (niceMax * (3 - g)) / 3;
      const gy = yFor(v);
      parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
      parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">${Math.round(v)}M</text>`);
    }

    const slotW = plotW / n;
    const barW = Math.min(46, slotW * 0.6);
    points.forEach((p, i) => {
      const cx = xFor(i);
      const top = yFor(p.shares);
      parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top).toFixed(1)}" rx="2" fill="#f59e0b"/>`);
      parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 14).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${escapeHtml(String(p.year))}</text>`);
    });

    const y0 = yFor(points[0].shares), yN = yFor(points[n - 1].shares);
    parts.push(`<line x1="${xFor(0).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${xFor(n - 1).toFixed(1)}" y2="${yN.toFixed(1)}" stroke="#1f2937" stroke-width="1.6" stroke-dasharray="6 4"/>`);
    const midX = (xFor(0) + xFor(n - 1)) / 2;
    const lineMidY = (y0 + yN) / 2;
    const label1 = `CAGR: ${fmtP(cagrPct)} · BPA ${fmtB(bpaCagr)}`;
    const w1 = label1.length * 5.4 + 12;
    parts.push(`<rect x="${(midX - w1 / 2).toFixed(1)}" y="${(lineMidY - 20).toFixed(1)}" width="${w1.toFixed(1)}" height="15" rx="3" fill="#1f2937"/>`);
    parts.push(`<text x="${midX.toFixed(1)}" y="${(lineMidY - 9).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escapeHtml(label1)}</text>`);

    const xPrev = xFor(n - 2);
    parts.push(`<line x1="${xPrev.toFixed(1)}" y1="${yFor(points[n - 2].shares).toFixed(1)}" x2="${xFor(n - 1).toFixed(1)}" y2="${yN.toFixed(1)}" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="6 4"/>`);
    const label2 = `Últ. año: ${fmtP(lastPct)} · BPA ${fmtB(bpaLast)}`;
    const w2 = label2.length * 5.4 + 12;
    const lx = Math.min(W - padR - w2 / 2, (xPrev + xFor(n - 1)) / 2);
    parts.push(`<rect x="${(lx - w2 / 2).toFixed(1)}" y="${(lineMidY - 40).toFixed(1)}" width="${w2.toFixed(1)}" height="15" rx="3" fill="#dc2626"/>`);
    parts.push(`<text x="${lx.toFixed(1)}" y="${(lineMidY - 29).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escapeHtml(label2)}</text>`);

    return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chartTitle)}</div><svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chartTitle)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg></div>`;
  }

  function renderDebtMaturityChart(debt, fiscalYear) {
    if (!debt) return '';
    let baseYear = Number(fiscalYear);
    if (!Number.isFinite(baseYear) || baseYear < 2000) {
      const fromSnippet = String(debt?.secSnippet?.title || debt?.title || '').match(/20\d\d/);
      baseYear = fromSnippet ? parseInt(fromSnippet[0], 10) : 2025;
    }
    const minYear = baseYear + 1;
    const maxYear = baseYear + 5;

    const parseAmount = (val) => {
      if (val == null) return NaN;
      let s = String(val).replace(/[$€£\s]/g, '').trim();
      if (s.includes(',') && s.includes('.')) {
        s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(/,/g, '.') : s.replace(/,/g, '');
      } else if (s.includes(',')) {
        const p = s.split(',');
        s = p.length > 2 || p[1]?.length === 3 ? p.join('') : s.replace(',', '.');
      }
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : NaN;
    };

    const parseRate = (val) => {
      if (val == null) return null;
      const m = String(val).match(/(\d+(?:[\.,]\d+)?)/);
      if (!m) return null;
      const n = parseFloat(m[1].replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    let rawItems = [];
    const pushItem = (entry, fallbackYear) => {
      const yr = Number(entry?.year ?? fallbackYear);
      const amount = parseAmount(entry?.amount ?? entry?.totalAmount ?? entry?.value);
      const rate = parseRate(entry?.interestRate ?? entry?.rate ?? entry?.averageRate);
      const type = String(entry?.type || entry?.name || entry?.label || 'Deuda total').trim();
      if (!Number.isFinite(yr) || !Number.isFinite(amount) || amount <= 0) return;
      rawItems.push({
        year: yr,
        name: String(entry?.name || entry?.label || type).trim(),
        type,
        amount,
        interestRate: rate,
        estimated: entry?.estimated === true,
      });
    };

    if (Array.isArray(debt.maturitySchedule)) {
      debt.maturitySchedule.forEach((e) => (Array.isArray(e?.items) && e.items.length ? e.items.forEach((it) => pushItem(it, e.year)) : pushItem(e, e?.year)));
    } else if (debt.maturitySchedule && Array.isArray(debt.maturitySchedule.years)) {
      debt.maturitySchedule.years.forEach((e) => (Array.isArray(e?.items) && e.items.length ? e.items.forEach((it) => pushItem(it, e.year)) : pushItem(e, e?.year)));
    }

    if (rawItems.length === 0 && Array.isArray(debt.maturityCalendar?.years)) {
      debt.maturityCalendar.years.forEach((e) => pushItem({ ...e, type: 'Deuda total' }));
    }

    const futureItems = rawItems.filter((it) => Number.isFinite(it.year) && it.year > maxYear && Number.isFinite(it.amount));
    const filtered = rawItems.filter((it) => Number.isFinite(it.year) && it.year >= minYear && it.year <= maxYear && Number.isFinite(it.amount) && it.amount > 0);
    if (filtered.length === 0) return '';

    const allAmount = filtered.reduce((s, it) => s + it.amount, 0);
    const allRatedItems = rawItems.filter((it) => it.interestRate != null);
    const allRatedAmount = allRatedItems.reduce((s, it) => s + it.amount, 0);
    const totalAverageRate = allRatedAmount > 0 ? allRatedItems.reduce((s, it) => s + it.amount * it.interestRate, 0) / allRatedAmount : null;

    const yearsMap = new Map();
    filtered.forEach((it) => {
      if (!yearsMap.has(it.year)) yearsMap.set(it.year, []);
      yearsMap.get(it.year).push(it);
    });

    const stackPalette = ['#f59e0b', '#0ea5e9', '#7c3aed', '#10b981', '#ef4444'];
    const groupedYears = [];
    for (let yr = minYear; yr <= maxYear; yr += 1) {
      const items = (yearsMap.get(yr) ?? [])
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .map((it, idx) => ({ ...it, color: stackPalette[idx % stackPalette.length], textColor: '#ffffff' }));
      groupedYears.push({ year: yr, totalAmount: items.reduce((s, it) => s + it.amount, 0), items });
    }

    let afterYearFive = parseAmount(debt.maturityAfterFive);
    if (!Number.isFinite(afterYearFive) && futureItems.length) afterYearFive = futureItems.reduce((s, it) => s + it.amount, 0);
    const max = Math.max(...groupedYears.map((y) => y.totalAmount), 1);

    const W = 640, H = 275, padL = 52, padR = 14, padT = 32, padB = 62;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
    const niceMax = Math.ceil(max / step) * step || max;
    const slotW = plotW / groupedYears.length;
    const barW = Math.min(50, slotW * 0.65);
    const fmtM = (v) => {
      const [int, dec] = Number(v).toFixed(1).split('.');
      return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}M`;
    };
    const parts = [];

    for (let g = 0; g <= 3; g += 1) {
      const v = (niceMax * (3 - g)) / 3;
      const gy = padT + plotH * (1 - v / niceMax);
      parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
      parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
    }

    groupedYears.forEach((yr, i) => {
      const cx = padL + slotW * (i + 0.5);
      let baseline = padT + plotH;
      const multi = yr.items.length > 1;
      yr.items.forEach((it) => {
        const blockH = Math.max(3, (Number(it.amount) / niceMax) * plotH);
        const topY = baseline - blockH;
        parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${barW.toFixed(1)}" height="${blockH.toFixed(1)}" rx="2" fill="${it.color || '#f59e0b'}"/>`);
        const rateText = it.interestRate != null ? `${it.estimated ? '~' : ''}${Number(it.interestRate).toFixed(2).replace('.', ',')}%` : null;
        if (multi && blockH >= 18 && barW >= 28) {
          const textTop = topY + blockH / 2 - 2;
          parts.push(`<text x="${cx.toFixed(1)}" y="${textTop.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${it.textColor || '#ffffff'}">${fmtM(it.amount)}</text>`);
          if (rateText) parts.push(`<text x="${cx.toFixed(1)}" y="${(textTop + 9).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="${it.textColor || '#ffffff'}">${rateText}</text>`);
        } else if (rateText && blockH >= 11 && barW >= 26) {
          parts.push(`<text x="${cx.toFixed(1)}" y="${(topY + blockH / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="${it.textColor || '#ffffff'}">${rateText}</text>`);
        }
        baseline = topY;
      });
      if (yr.totalAmount > 0) {
        parts.push(`<text x="${cx.toFixed(1)}" y="${Math.max(padT + 10, baseline - 11).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">${fmtM(yr.totalAmount)}</text>`);
      }
      parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${yr.year}</text>`);
    });

    const bannerY = H - 28;
    parts.push(`<rect x="${padL}" y="${bannerY}" width="${plotW}" height="22" rx="4" fill="#1e293b"/>`);
    const afterText = Number.isFinite(afterYearFive) ? ` · Después del año 5: ${fmtM(afterYearFive)}` : '';
    const anyEstimated = allRatedItems.some((it) => it.estimated === true);
    const rateLabel = anyEstimated ? 'Tipo de interés medio estimado de la deuda' : 'Tipo de interés medio total de la deuda';
    const ratePrefix = anyEstimated ? '~' : '';
    const bannerText = totalAverageRate != null
      ? `${rateLabel}: ${ratePrefix}${totalAverageRate.toFixed(2).replace('.', ',')} % · Deuda a amortizar: ${fmtM(allAmount)}${afterText}`
      : `Deuda a amortizar (5 años): ${fmtM(allAmount)}${afterText}`;
    parts.push(`<text x="${(padL + plotW / 2).toFixed(1)}" y="${bannerY + 14.5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">${escapeHtml(bannerText)}</text>`);

    const title = `CALENDARIO DE VENCIMIENTOS DE DEUDA (PRÓXIMOS 5 AÑOS: ${minYear}–${maxYear})`;
    return `<div class="shares-chart"><div class="sc-title">${escapeHtml(title)}</div><svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg></div>`;
  }

window.escapeHtml = escapeHtml;
window.formatAnnualRichText = formatAnnualRichText;
window.renderSharesChart = renderSharesChart;
window.renderDebtMaturityChart = renderDebtMaturityChart;

})(window);
