/**
 * @fileoverview Renderizado de gráficos de deuda (calendario de vencimientos, evolución histórica y caja de refinanciación) en PDFKit.
 * @module services/report/pdfDebtCharts
 */

import { sanitize, drawPdfFormattedText } from './pdfStyles.js';
import { t, normalizeLanguage, formatFixed } from '../../utils/i18n.js';

export function drawDebtMaturityChart(doc, chart, y) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const padL = 46;
  const padR = 10;
  const plotH = 120;
  const headerH = 20;
  const footerH = 22;
  const boxH = headerH + plotH + footerH + 28;

  if (y + boxH > doc.page.height - doc.page.margins.bottom - 20 && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc.rect(margin, y, pageWidth, boxH).fill('#f8fafc');
  doc.rect(margin, y, pageWidth, boxH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(sanitize(chart.title), margin + 8, y + 6, { width: pageWidth - 16 });

  const plotX = margin + padL;
  const plotW = pageWidth - padL - padR;
  const plotTop = y + headerH + 6;
  const max = chart.maxYearAmount || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const yFor = (v) => plotTop + plotH * (1 - v / niceMax);

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = yFor(v);
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(g === 3 ? '#cbd5e1' : '#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`$${Math.round(v)}M`, margin + 2, gy - 3.5, { width: padL - 8, align: 'right', lineBreak: false });
  }

  const n = chart.years.length;
  const slotW = plotW / n;
  const barW = Math.min(46, slotW * 0.65);
  const creditLang = normalizeLanguage(chart.language);
  const fmtMillions = (value) => `$${formatFixed(value, 1, creditLang)}M`;

  chart.years.forEach((yr, i) => {
    const cx = plotX + slotW * (i + 0.5);
    const items = Array.isArray(yr.items) ? yr.items.filter((it) => Number.isFinite(Number(it?.amount)) && Number(it.amount) > 0) : [];
    let baseline = plotTop + plotH;

    if (items.length) {
      const multiSegment = items.length > 1;
      items.forEach((it) => {
        const blockH = Math.max(2, (Number(it.amount) / niceMax) * plotH);
        const top = baseline - blockH;
        doc.rect(cx - barW / 2, top, barW, blockH).fill(it.color || '#f59e0b');
        const rateText = it.interestRate != null ? `${it.estimated ? '~' : ''}${formatFixed(it.interestRate, 2, creditLang)}%` : null;
        if (multiSegment && blockH >= 16 && barW >= 26) {
          const amountText = fmtMillions(it.amount);
          const textTop = top + (blockH - 14) / 2;
          doc.font('Helvetica-Bold').fontSize(6.5).fillColor(it.textColor || '#ffffff').text(amountText, cx - barW / 2, textTop, { width: barW, align: 'center', lineBreak: false });
          if (rateText) doc.font('Helvetica-Bold').fontSize(5.5).fillColor(it.textColor || '#ffffff').text(rateText, cx - barW / 2, textTop + 7, { width: barW, align: 'center', lineBreak: false });
        } else if (rateText && blockH >= 10 && barW >= 24) {
          doc.font('Helvetica-Bold').fontSize(6).fillColor(it.textColor || '#ffffff').text(rateText, cx - barW / 2, top + (blockH - 7) / 2, { width: barW, align: 'center', lineBreak: false });
        }
        baseline = top;
      });
    } else {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#94a3b8').text('—', cx - slotW / 2, plotTop + plotH - 12, { width: slotW, align: 'center', lineBreak: false });
    }

    if (yr.totalAmount > 0) {
      const totalY = Math.max(y + headerH + 2, baseline - 11);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(fmtMillions(yr.totalAmount), cx - slotW / 2, totalY, { width: slotW, align: 'center', lineBreak: false });
    }
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155').text(String(yr.year), cx - slotW / 2, plotTop + plotH + 5, { width: slotW, align: 'center', lineBreak: false });
  });

  const bannerY = y + boxH - footerH - 4;
  doc.rect(margin + 6, bannerY, pageWidth - 12, footerH).fill('#1e293b');
  const afterText = chart.afterYearFive != null ? `   |   ${t('Después del año 5: {amount}', { amount: fmtMillions(chart.afterYearFive) }, creditLang)}` : '';
  const rateLabel = chart.totalAverageRateEstimated
    ? t('Tipo de interés medio estimado de la deuda', null, creditLang)
    : t('Tipo de interés medio total de la deuda', null, creditLang);
  const ratePrefix = chart.totalAverageRateEstimated ? '~' : '';
  const bannerText = chart.totalAverageRate != null
    ? `${rateLabel}: ${ratePrefix}${formatFixed(chart.totalAverageRate, 2, creditLang)} %   |   ${t('Deuda a amortizar: {amount}', { amount: fmtMillions(chart.totalAmount) }, creditLang)}${afterText}`
    : `${t('Deuda a amortizar en los próximos 5 años: {amount}', { amount: fmtMillions(chart.totalAmount) }, creditLang)}${afterText}`;
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff').text(sanitize(bannerText), margin + 8, bannerY + 7, { width: pageWidth - 16, align: 'center', lineBreak: false });

  return y + boxH + 8;
}

export function drawDebtHistoryChart(doc, chart, y) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const padL = 46;
  const padR = 10;
  const plotH = 120;
  const headerH = 30;
  const boxH = headerH + plotH + 26;

  if (y + boxH > doc.page.height - doc.page.margins.bottom - 20 && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc.rect(margin, y, pageWidth, boxH).fill('#f8fafc');
  doc.rect(margin, y, pageWidth, boxH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(sanitize(chart.title), margin + 8, y + 6, { width: 300 });

  const cagrParts = [];
  const histLang = normalizeLanguage(chart.language);
  const netLabel = histLang === 'en' ? 'net' : 'neta';
  if (chart.cagrTotalDebt != null) cagrParts.push(`normal ${chart.cagrTotalDebt >= 0 ? '+' : ''}${formatFixed(chart.cagrTotalDebt, 1, histLang)} %`);
  if (chart.cagrNetDebt != null) cagrParts.push(`${netLabel} ${chart.cagrNetDebt >= 0 ? '+' : ''}${formatFixed(chart.cagrNetDebt, 1, histLang)} %`);
  if (cagrParts.length) {
    const periodLabel = histLang === 'en' ? 'CAGR for the period' : 'CAGR del periodo';
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#64748b').text(sanitize(`${periodLabel} (${chart.points[0].year}–${chart.points[chart.points.length - 1].year}): ${cagrParts.join(' · ')}`), margin + 8, y + 17, { width: 320 });
  }

  const legX = margin + pageWidth - 190;
  doc.rect(legX, y + 6, 8, 8).fill('#1e40af');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text(t('Deuda Normal', null, histLang), legX + 11, y + 6.5);
  doc.rect(legX + 85, y + 6, 8, 8).fill('#d97706');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text(t('Deuda Neta', null, histLang), legX + 96, y + 6.5);

  const plotX = margin + padL;
  const plotW = pageWidth - padL - padR;
  const plotTop = y + headerH;
  const max = chart.maxVal || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const yFor = (v) => plotTop + plotH * (1 - Math.max(0, v) / niceMax);

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = yFor(v);
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(g === 3 ? '#cbd5e1' : '#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`$${Math.round(v)}M`, margin + 2, gy - 3.5, { width: padL - 8, align: 'right', lineBreak: false });
  }

  const n = chart.points.length;
  const slotW = plotW / n;
  const groupW = Math.min(44, slotW * 0.76);
  const barW = (groupW - 4) / 2;

  chart.points.forEach((p, i) => {
    const cx = plotX + slotW * (i + 0.5);
    const top1 = yFor(p.totalDebt);
    const top2 = Number.isFinite(p.netDebt) ? yFor(p.netDebt) : plotTop + plotH;

    doc.rect(cx - groupW / 2, top1, barW, plotTop + plotH - top1).fill('#1e40af');
    doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#1e40af').text(`${Math.round(p.totalDebt)}M`, cx - groupW / 2 - 2, top1 - 7, { width: barW + 4, align: 'center', lineBreak: false });

    if (Number.isFinite(p.netDebt)) {
      doc.rect(cx - groupW / 2 + barW + 4, top2, barW, plotTop + plotH - top2).fill('#d97706');
      doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#d97706').text(`${Math.round(p.netDebt)}M`, cx - groupW / 2 + barW + 2, top2 - 7, { width: barW + 4, align: 'center', lineBreak: false });
    }
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text(String(p.year), cx - slotW / 2, plotTop + plotH + 4, { width: slotW, align: 'center', lineBreak: false });

    const deltaY = plotTop + plotH + 12;
    if (p.deltaTotalDebt != null) {
      const dColor = p.deltaTotalDebt < 0 ? '#16a34a' : '#dc2626';
      doc.font('Helvetica-Bold').fontSize(5).fillColor(dColor).text(`${p.deltaTotalDebt > 0 ? '+' : ''}${Math.round(p.deltaTotalDebt)}M`, cx - groupW / 2 - 1, deltaY, { width: barW + 4, align: 'center', lineBreak: false });
    }
    if (p.deltaNetDebt != null) {
      const dColor = p.deltaNetDebt < 0 ? '#16a34a' : '#dc2626';
      doc.font('Helvetica-Bold').fontSize(5).fillColor(dColor).text(`${p.deltaNetDebt > 0 ? '+' : ''}${Math.round(p.deltaNetDebt)}M`, cx - groupW / 2 + barW + 3, deltaY, { width: barW + 4, align: 'center', lineBreak: false });
    }
  });

  return y + boxH + 8;
}

export function drawDebtRefinancingBox(doc, refinancing, y) {
  if (!refinancing) return y;
  const margin = doc.page.margins.left;
  const boxWidth = doc.page.width - margin * 2;
  const boxPad = 8;
  const refLang = normalizeLanguage(refinancing.language);
  const boxLabel = t('Refinanciación de deuda e impacto en BPA:', null, refLang);

  doc.font('Helvetica-Bold').fontSize(8.5);
  const labelH = doc.heightOfString(boxLabel, { width: boxWidth - 16 });

  let textH = 0;
  if (refinancing.explanation) {
    doc.font('Helvetica').fontSize(8);
    textH = doc.heightOfString(refinancing.explanation, { width: boxWidth - 16, lineBreak: true });
  }
  let impactH = 0;
  if (refinancing.impactExplanation) {
    doc.font('Helvetica').fontSize(7.5);
    impactH = doc.heightOfString(refinancing.impactExplanation, { width: boxWidth - 16, lineBreak: true });
  }

  const boxHeight = boxPad + labelH + 28 + (textH ? textH + 8 : 0) + (impactH ? impactH + 6 : 0) + boxPad;
  if (y + boxHeight > doc.page.height - doc.page.margins.bottom - 20 && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  const boxStartY = y;
  doc.rect(margin, boxStartY, boxWidth, boxHeight).fill('#fff7ed');
  doc.rect(margin, boxStartY, 3.5, boxHeight).fill('#ea580c');

  let curY = boxStartY + boxPad;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#9a3412').text(boxLabel, margin + 10, curY);
  curY += labelH + 6;

  const badgeW = (boxWidth - 20) / 4;
  const rateFmt = (value) => (refLang === 'en' ? value.toFixed(2) : value.toFixed(2).replace('.', ','));
  const badges = [
    { label: t('Tipo deuda anterior', null, refLang), val: refinancing.oldDebtRate != null ? `${rateFmt(refinancing.oldDebtRate)} %` : '—' },
    { label: t('Tipo nueva emisión', null, refLang), val: refinancing.newDebtRate != null ? `${rateFmt(refinancing.newDebtRate)} %` : '—' },
    { label: t('Volumen refinanciado', null, refLang), val: refinancing.amount != null ? `$${Math.round(refinancing.amount)}M` : '—' },
    { label: t('Impacto en BPA', null, refLang), val: refinancing.epsImpact != null ? `${refinancing.epsImpact >= 0 ? '+' : ''}${rateFmt(refinancing.epsImpact)} $/acc` : '—', highlight: true },
  ];

  badges.forEach((b, idx) => {
    const bx = margin + 10 + idx * badgeW;
    if (b.highlight) {
      doc.roundedRect(bx, curY, badgeW - 6, 22, 3).fill('#fed7aa');
      doc.font('Helvetica').fontSize(6).fillColor('#7c2d12').text(b.label, bx + 2, curY + 2, { width: badgeW - 10, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#7c2d12').text(b.val, bx + 2, curY + 11, { width: badgeW - 10, align: 'center' });
    } else {
      doc.roundedRect(bx, curY, badgeW - 6, 22, 3).fill('#ffedd5');
      doc.font('Helvetica').fontSize(6).fillColor('#9a3412').text(b.label, bx + 2, curY + 2, { width: badgeW - 10, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#431407').text(b.val, bx + 2, curY + 11, { width: badgeW - 10, align: 'center' });
    }
  });

  curY += 28;
  if (refinancing.explanation) {
    drawPdfFormattedText(doc, refinancing.explanation, margin + 10, curY, boxWidth - 20, 'Helvetica', 'Helvetica-Bold', 7.5, '#431407');
    curY = doc.y + 6;
  }
  if (refinancing.impactExplanation) {
    drawPdfFormattedText(doc, refinancing.impactExplanation, margin + 10, curY, boxWidth - 20, 'Helvetica-Bold', 'Helvetica-Bold', 7.5, '#c2410c');
  }

  return boxStartY + boxHeight + 10;
}
