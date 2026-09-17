/**
 * @fileoverview Renderizado de los horizontes temporales (Ventas, Cash Flow, Asignación de Capital) en PDFKit.
 * @module services/report/pdfHorizonsDrawer
 */

import { sanitize, drawSectionTitle, drawNotes, drawHorizontalRule } from './pdfStyles.js';
import { drawTable } from './pdfTableDrawer.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

function drawSales(doc, sales, margin, y, lang) {
  if (!Array.isArray(sales.rows) || !sales.rows.length) return y;
  let curY = drawSectionTitle(doc, t('1. VENTAS', null, lang), y);
  const salesRows = sales.rows.map((row) => [
    row.name,
    row.adjusted,
    row.prevAdjusted,
    row.pctAdjusted,
    row.normal,
    row.prevNormal,
    row.pctNormal,
  ]);
  curY = drawTable(doc, [t('Métrica', null, lang), t('Ajustado', null, lang), t('Anterior Aj.', null, lang), t('% Ajustado', null, lang), t('Normal', null, lang), t('Anterior N.', null, lang), t('% Normal', null, lang)], salesRows, {
    startY: curY,
    colWidths: [140, 62, 62, 63, 62, 62, 63],
    rowHeight: 18,
    metaRows: sales.rows,
    isSales: true,
    boldColumns: [1, 4],
    pctColumns: [3, 6],
  });
  const extras = [];
  if (sales.shares) extras.push(`${t('ACCIONES', null, lang)}: ${sanitize(sales.shares)}`);
  if (sales.eps) extras.push(`${t('BPA', null, lang)}: ${sanitize(sales.eps)}`);
  if (extras.length) {
    const extrasText = extras.join('  ·  ');
    doc.font('Helvetica-Bold').fontSize(8);
    const extrasH = doc.heightOfString(extrasText, { width: doc.page.width - margin * 2 });
    if (curY + extrasH + 8 > doc.page.height - doc.page.margins.bottom - 10 && curY > doc.page.margins.top + 10) {
      doc.addPage();
      curY = doc.page.margins.top;
    }
    doc.fillColor('#111827').text(extrasText, margin, curY, { width: doc.page.width - margin * 2 });
    curY = doc.y + 6;
  }
  curY = drawNotes(doc, sales.notes, curY);
  return drawHorizontalRule(doc, curY);
}

function drawCashFlow(doc, cashFlow, margin, y, lang) {
  if (!Array.isArray(cashFlow.rows) || !cashFlow.rows.length) return y;
  let curY = drawSectionTitle(doc, t('2. CASH FLOW', null, lang), y);
  let scenarios = Array.isArray(cashFlow.scenarios) ? [...cashFlow.scenarios] : [];
  if (scenarios.length === 0) scenarios = [t('Normal', null, lang), t('Ajustado', null, lang)];
  else if (scenarios.length === 1) scenarios = [scenarios[0], t('Ajustado', null, lang)];

  const header = [t('Métrica', null, lang), ...scenarios];
  const valWidth = (doc.page.width - margin * 2 - 150) / scenarios.length;
  const colWidths = [150, ...Array(scenarios.length).fill(valWidth)];
  const cfRows = cashFlow.rows.map((row) => {
    let values = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
    if (values.length === 1 && scenarios.length === 2) values.push(values[0]);
    return [row.name, ...values];
  });
  curY = drawTable(doc, header, cfRows, {
    startY: curY,
    colWidths,
    rowHeight: 18,
    metaRows: cashFlow.rows,
    isCashFlow: true,
    boldColumns: [1, 2],
  });
  const cfNotes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
    const lower = String(n || '').toLowerCase();
    return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
  });
  curY = drawNotes(doc, cfNotes, curY);
  return drawHorizontalRule(doc, curY);
}

function drawCapital(doc, capital, margin, y, lang) {
  if (!Array.isArray(capital.rows) || !capital.rows.length) return y;
  let curY = drawSectionTitle(doc, t('3. ASIGNACIÓN DE CAPITAL', null, lang), y);
  const capitalRows = capital.rows.map((row) => [row.name, row.value]);
  curY = drawTable(doc, [t('Métrica', null, lang), t('Valor', null, lang)], capitalRows, {
    startY: curY,
    colWidths: [150, 365],
    rowHeight: 18,
    isCapital: true,
    boldColumns: [1],
  });
  if (capital.verification) {
    const verifText = sanitize(capital.verification);
    doc.font('Helvetica-Bold').fontSize(8);
    const verifH = doc.heightOfString(verifText, { width: doc.page.width - margin * 2 });
    if (curY + verifH + 8 > doc.page.height - doc.page.margins.bottom - 10 && curY > doc.page.margins.top + 10) {
      doc.addPage();
      curY = doc.page.margins.top;
    }
    doc.fillColor('#111827').text(verifText, margin, curY, { width: doc.page.width - margin * 2 });
    curY = doc.y + 6;
  }
  curY = drawNotes(doc, capital.notes, curY);
  return drawHorizontalRule(doc, curY);
}

/**
 * Dibuja la lista completa de horizontes financieros en el PDF.
 * @param {PDFKit.PDFDocument} doc - Documento PDFKit activo.
 * @param {Array<object>} horizons - Array de horizontes temporales.
 * @param {number} startY - Coordenada vertical Y de inicio.
 * @param {string} [language] - Idioma del informe.
 * @returns {number} Coordenada Y tras procesar todos los horizontes.
 */
export function drawHorizons(doc, horizons, startY, language = 'es') {
  const lang = normalizeLanguage(language);
  const margin = doc.page.margins.left;
  let y = startY;

  (horizons ?? []).forEach((horizon, hIndex) => {
    const label = sanitize(horizon.label ?? (hIndex === 0 ? t('ÚLTIMOS 3 MESES', null, lang) : t('EN TODO EL AÑO', null, lang)));
    if (hIndex > 0) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text(label, margin, y + 4);
    y += 26;

    if (horizon.sales) y = drawSales(doc, horizon.sales, margin, y, lang);
    if (horizon.cashFlow) y = drawCashFlow(doc, horizon.cashFlow, margin, y, lang);
    if (horizon.capital) y = drawCapital(doc, horizon.capital, margin, y, lang);
    y += 6;
  });

  return y;
}
