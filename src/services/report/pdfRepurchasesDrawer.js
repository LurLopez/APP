/**
 * @fileoverview Módulo extraído de pdfConclusionDrawer.js.
 */

import { sanitize, drawSectionTitle, drawHorizontalRule, drawHighlightedText } from './pdfStyles.js';
import { drawPdfSecSnippet } from './pdfSnippetDrawer.js';
import { drawSharesChart } from './pdfEquityCharts.js';
import { withAveragePriceRow, buildSharesChartModel } from '../reportExport.service.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

export function drawRepurchases(doc, rep, margin, y, language = 'es') {
  const lang = normalizeLanguage(language);
  let curY = drawSectionTitle(doc, rep.title || t('1: RECOMPRAS', null, lang), y);
  if (rep.text) {
    curY = drawHighlightedText(doc, sanitize(rep.text), margin, curY, { width: doc.page.width - margin * 2, baseSize: 8.5, baseColor: '#374151', boldColor: '#0f172a' }) + 8;
  }
  const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
    ? rep.authorizationExpiry : null;
  const buybackPctLabel = (rep.buybackPctOfShares != null)
    ? t('Peso en el capital: {prefix}{value} % de las acciones en el año', {
      prefix: rep.buybackPctOfSharesEstimated ? '≈' : '',
      value: lang === 'en' ? String(rep.buybackPctOfShares) : String(rep.buybackPctOfShares).replace('.', ','),
    }, lang)
    : null;
  const badges = [
    (rep.authorizationRemaining || rep.programRemaining) ? t('Autorización restante: {value}', { value: rep.authorizationRemaining || rep.programRemaining }, lang) : null,
    repExpiry ? t('Vigencia: {value}', { value: repExpiry }, lang) : null,
    rep.shareCountEvolution ? t('Evolución acciones: {value}', { value: rep.shareCountEvolution }, lang) : null,
    buybackPctLabel,
    rep.bpaImpact ? t('Impacto BPA: {value}', { value: rep.bpaImpact }, lang) : null,
    rep.programChanges ? t('Programa: {value}', { value: rep.programChanges }, lang) : null,
    rep.futureProjection ? t('Proyección 5 años: {value}', { value: rep.futureProjection }, lang) : null,
  ].filter(Boolean);
  if (badges.length) {
    badges.forEach((b) => {
      if (curY > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        curY = doc.page.margins.top;
      }
      curY = drawHighlightedText(doc, `• ${sanitize(b)}`, margin + 6, curY, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#854d0e', boldFont: 'Helvetica-Bold', boldColor: '#7c2d12' }) + 3;
    });
    curY += 5;
  }
  const repChart = buildSharesChartModel(rep.sharesHistory, lang);
  if (repChart) curY = drawSharesChart(doc, repChart, curY) + 4;
  if (rep.secSnippet) curY = drawPdfSecSnippet(doc, withAveragePriceRow(rep.secSnippet), curY);
  return drawHorizontalRule(doc, curY);
}

function drawExecutivePersonBlock(doc, label, person, margin, y, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!person) return y;
  let curY = y;
  const width = doc.page.width - margin * 2 - 20;
  if (curY > doc.page.height - doc.page.margins.bottom - 30) {
    doc.addPage();
    curY = doc.page.margins.top;
  }
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#4f46e5').text(label, margin + 6, curY);
  curY = doc.y + 2;
  const heading = person.name ? `${person.name}${person.role ? ` — ${person.role}` : ''}` : null;
  if (heading) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(sanitize(heading), margin + 12, curY, { width });
    curY = doc.y + 2;
  }
  const fields = [
    [t('Inicio en el cargo', null, lang), person.tenureStart],
    [t('Ventas durante su mandato', null, lang), person.salesDuringTenure],
    [t('A dónde pasa', null, lang), person.whereTheyGo],
    [t('Políticas de su etapa', null, lang), person.policies],
    [t('De dónde viene', null, lang), person.origin],
    [t('Trayectoria previa', null, lang), person.trackRecord],
    [t('Qué ha anunciado', null, lang), person.commitments],
  ].filter(([, value]) => value);
  fields.forEach(([fieldLabel, value]) => {
    if (curY > doc.page.height - doc.page.margins.bottom - 16) {
      doc.addPage();
      curY = doc.page.margins.top;
    }
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text(`${fieldLabel}: `, margin + 12, curY, { continued: true });
    doc.font('Helvetica').fontSize(8).fillColor('#374151').text(sanitize(String(value)), { width });
    curY = doc.y + 2;
  });
  return curY + 4;
}

export function drawExecutiveChanges(doc, section, margin, y, language = 'es') {
  const lang = normalizeLanguage(language);
  const changes = Array.isArray(section?.changes) ? section.changes : [];
  let curY = drawSectionTitle(doc, section?.title || t('2: CAMBIOS EN LA DIRECCIÓN', null, lang), y);

  changes.forEach((change, index) => {
    const roleLabel = sanitize(String(change.role || t('Directivo', null, lang)).toUpperCase());
    if (changes.length > 1) {
      if (curY > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        curY = doc.page.margins.top;
      }
      curY = drawHighlightedText(doc, roleLabel, margin + 6, curY, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#4f46e5', boldFont: 'Helvetica-Bold', boldColor: '#4338ca' }) + 4;
    }
    if (change.text) {
      curY = drawHighlightedText(doc, sanitize(change.text), margin, curY, { width: doc.page.width - margin * 2, baseSize: 8.5, baseColor: '#374151', boldColor: '#0f172a' }) + 8;
    }
    const meta = [
      change.announcementDate ? t('Anuncio: {value}', { value: change.announcementDate }, lang) : null,
      change.effectiveDate ? t('Efectivo: {value}', { value: change.effectiveDate }, lang) : null,
      change.reason ? t('Motivo: {value}', { value: change.reason }, lang) : null,
    ].filter(Boolean);
    if (meta.length) {
      curY = drawHighlightedText(doc, `• ${sanitize(meta.join('  ·  '))}`, margin + 6, curY, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#854d0e', boldFont: 'Helvetica-Bold', boldColor: '#7c2d12' }) + 5;
    }
    curY = drawExecutivePersonBlock(doc, t('ANTIGUO {role}', { role: roleLabel }, lang), change.oldExecutive, margin, curY, lang);
    curY = drawExecutivePersonBlock(doc, t('NUEVO {role}', { role: roleLabel }, lang), change.newExecutive, margin, curY, lang);
    if (index < changes.length - 1) curY += 6;
  });

  if (section?.disclaimer) {
    if (curY > doc.page.height - doc.page.margins.bottom - 14) {
      doc.addPage();
      curY = doc.page.margins.top;
    }
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#94a3b8').text(sanitize(section.disclaimer), margin + 6, curY, { width: doc.page.width - margin * 2 - 12, lineBreak: true });
    curY = doc.y + 4;
  }
  return drawHorizontalRule(doc, curY);
}
