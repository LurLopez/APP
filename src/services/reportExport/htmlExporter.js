/**
 * @fileoverview Exportador a formato HTML estructurado para visualización web y almacenamiento primario.
 * @module services/reportExport/htmlExporter
 */

import { escapeHtml, parseRichSegments, COLORS } from './exportColors.js';
import { buildDebtRefinancingBadges } from './debtHistoryRefinancingModel.js';
import { buildReportModel } from './reportModel.js';
import {
  renderHtmlSharesChart,
  renderHtmlDebtMaturityChart,
  renderHtmlDebtHistoryChart,
  renderHtmlDividendChart,
} from './svgRenderers.js';

export function renderRichHtml(text) {
  if (!text) return '';
  return parseRichSegments(text)
    .map((seg) => (seg.bold ? `<strong>${escapeHtml(seg.text)}</strong>` : escapeHtml(seg.text)))
    .join('')
    .replaceAll('\n', '<br>');
}

export function renderHtmlNotes(notes) {
  if (!notes?.length) return '';
  const items = notes.map((note) => {
    if (note.marker) {
      return `<li><mark style="background:${note.bg};color:${note.color};font-weight:700;padding:1px 4px;border-radius:3px;">${escapeHtml(note.marker)}</mark> ${escapeHtml(note.text).replaceAll('\n', '<br>')}</li>`;
    }
    return `<li style="font-style:italic;color:${note.color};">${escapeHtml(note.text).replaceAll('\n', '<br>')}</li>`;
  }).join('');
  return `<ul class="notes">${items}</ul>`;
}

export function renderHtmlTable(table) {
  const thead = table.headers.map((h) => {
    const style = h.bg ? `background:${h.bg};color:${h.color};` : `background:${COLORS.headerBg};color:${COLORS.headerColor};`;
    return `<th style="${style}${h.bold ? 'font-weight:700;' : ''}">${escapeHtml(h.text)}</th>`;
  }).join('');
  const tbody = table.rows.map((row) => `<tr>${row.map((c) => {
    const style = [c.bg ? `background:${c.bg};` : '', c.color ? `color:${c.color};` : '', c.bold ? 'font-weight:700;' : ''].join('');
    return `<td${style ? ` style="${style}"` : ''}>${escapeHtml(c.text)}</td>`;
  }).join('')}</tr>`).join('');
  return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

export function renderHtmlRefinancingBox(refinancing) {
  if (!refinancing) return '';
  const badges = buildDebtRefinancingBadges(refinancing);
  const tiles = badges.map((badge) => `
    <div style="flex:1;min-width:110pt;background:${badge.highlight ? '#fed7aa' : '#ffedd5'};border-radius:4px;padding:5pt 6pt;text-align:center;">
      <div style="font-size:6.5pt;color:${badge.highlight ? '#7c2d12' : '#9a3412'};">${escapeHtml(badge.label)}</div>
      <div style="font-size:8pt;font-weight:800;color:${badge.highlight ? '#7c2d12' : '#431407'};">${escapeHtml(badge.val)}</div>
    </div>`).join('');
  return `
    <div style="margin:10pt 0 10pt;background:#fff7ed;border:1px solid #fed7aa;border-left:3.5pt solid #ea580c;border-radius:4px;padding:8pt 10pt;">
      <p style="margin:0 0 6pt;font-size:9pt;font-weight:800;color:#9a3412;">Refinanciación de deuda e impacto en BPA:</p>
      <div style="display:flex;gap:6pt;flex-wrap:wrap;">${tiles}</div>
      ${refinancing.explanation ? `<p style="font-size:8.5pt;line-height:1.45;margin:8pt 0 0;color:#431407;">${renderRichHtml(refinancing.explanation)}</p>` : ''}
      ${refinancing.impactExplanation ? `<p style="font-size:8.5pt;line-height:1.45;margin:5pt 0 0;color:#c2410c;font-weight:700;">${renderRichHtml(refinancing.impactExplanation)}</p>` : ''}
    </div>`;
}

function renderConclusionHtml(conclusion) {
  if (!conclusion) return '';
  return `
  <section class="conclusion" style="page-break-before:always;margin-top:20pt;">
    <h2 style="font-size:13pt;margin:0 0 4pt;">${escapeHtml(conclusion.title)}</h2>
    <p style="color:${COLORS.muted};font-size:9.5pt;margin:0 0 12pt;">${escapeHtml(conclusion.subtitle)}</p>
    ${conclusion.cards.map((card, cardIndex) => `
    <div style="border:1px solid ${COLORS.rule};border-radius:6px;padding:10pt 12pt;margin-bottom:12pt;background:#fff;${cardIndex > 0 ? 'page-break-before:always;' : ''}">
      <h3 style="margin:0 0 6pt;font-size:11pt;color:${COLORS.ink};">${escapeHtml(card.title)}</h3>
      ${card.text ? `<p style="font-size:9pt;line-height:1.5;margin:4pt 0 8pt;color:#374151;">${renderRichHtml(card.text)}</p>` : ''}
      ${card.badges?.length ? `<ul style="font-size:8.5pt;color:#854d0e;padding-left:14pt;margin:4pt 0 8pt;">${card.badges.map((b) => `<li>${renderRichHtml(b)}</li>`).join('')}</ul>` : ''}
      ${card.chart ? renderHtmlSharesChart(card.chart) : ''}
      ${card.debtMaturityChart ? renderHtmlDebtMaturityChart(card.debtMaturityChart) : ''}
      ${card.debtHistoryChart ? renderHtmlDebtHistoryChart(card.debtHistoryChart) : ''}
      ${card.refinancing ? renderHtmlRefinancingBox(card.refinancing) : ''}
      ${card.dividendChart ? renderHtmlDividendChart(card.dividendChart) : ''}
      ${card.isWatchlist && card.items?.length ? `<ul style="font-size:8.5pt;color:#16a34a;padding-left:14pt;margin:4pt 0 8pt;list-style:none;">${card.items.map((it) => `<li>✓ <span style="color:#374151;">${renderRichHtml(it)}</span></li>`).join('')}</ul>` : ''}
      ${card.table ? `
        <div style="margin-top:8pt;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
          ${card.table.title ? `<div style="padding:3pt 8pt;background:#e2e8f0;font-size:7.5pt;font-weight:800;letter-spacing:0.3pt;color:#334155;">EXTRACTO OFICIAL SEC (FORM 10-K)</div>
          <div style="padding:4pt 8pt;background:#f1f5f9;font-size:8pt;font-weight:700;color:#475569;">${escapeHtml(card.table.title)} ${card.table.summary ? `<span style="font-style:italic;color:#64748b;margin-left:8pt;">${escapeHtml(card.table.summary)}</span>` : ''}</div>` : ''}
          ${renderHtmlTable(card.table)}
        </div>` : ''}
    </div>`).join('')}
  </section>`;
}

export function buildReportHtml(report) {
  const model = buildReportModel(report);
  const body = model.horizons.map((horizon) => `
  <section class="horizon">
    <h2>${escapeHtml(horizon.label)}</h2>
    ${horizon.sections.map((section) => `
    <h3>${escapeHtml(section.title)}</h3>
    ${section.table ? renderHtmlTable(section.table) : ''}
    ${section.extras?.length ? `<p class="extras">${escapeHtml(section.extras.join('  ·  '))}</p>` : ''}
    ${section.verification ? `<p class="extras">${escapeHtml(section.verification)}</p>` : ''}
    ${renderHtmlNotes(section.notes)}
    <hr>
    `).join('')}
  </section>`).join('');

  const ratingHtml = model.rating ? `
  <section style="margin:16pt 0;padding:14pt 18pt;border:2px solid ${model.rating.score >= 7 ? '#16a34a' : (model.rating.score >= 4 ? '#ca8a04' : '#dc2626')};border-radius:6px;background:${model.rating.score >= 7 ? '#f0fdf4' : (model.rating.score >= 4 ? '#fefce8' : '#fef2f2')};">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12pt;font-weight:800;text-transform:uppercase;color:#0f172a;">${escapeHtml(model.rating.label)}</span>
      <span style="font-size:22pt;font-weight:900;color:#0f172a;">${model.rating.score} <small style="font-size:12pt;color:#64748b;">/ 10</small></span>
    </div>
    <p style="font-size:9.5pt;color:#1e293b;margin:6pt 0 4pt;font-weight:500;">${escapeHtml(model.rating.rationale)}</p>
    <p style="font-size:7.5pt;color:#64748b;font-style:italic;margin:4pt 0 0;">${escapeHtml(model.rating.disclaimer)}</p>
  </section>` : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.company)}${model.periodTitle ? ` — ${escapeHtml(model.periodTitle)}` : ''}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: ${COLORS.ink}; margin: 32px auto; max-width: 720pt; padding: 0 16px; }
  h1 { font-size: 18pt; margin: 0; }
  .ticker { font-size: 10pt; color: ${COLORS.ticker}; margin: 4pt 0; }
  .period { font-size: 12pt; font-weight: 700; color: ${COLORS.period}; margin: 4pt 0 8pt; }
  hr { border: 0; border-top: 1px solid ${COLORS.rule}; margin: 10pt 0; }
  .horizon h2 { font-size: 13pt; margin: 0 0 8pt; page-break-before: always; }
  .horizon:first-of-type h2 { page-break-before: avoid; }
  .horizon h3 { font-size: 10pt; margin: 12pt 0 6pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 6pt; }
  th { font-size: 7.5pt; text-align: left; padding: 4pt 4pt; }
  td { font-size: 7.5pt; padding: 4pt 4pt; color: ${COLORS.ink}; }
  td:first-child { font-weight: 700; }
  tbody tr:nth-child(odd) td { background: ${COLORS.stripe}; }
  .extras { font-size: 8pt; font-weight: 700; margin: 4pt 0 0; }
  .notes { font-size: 7.5pt; color: ${COLORS.noteText}; padding-left: 14pt; margin: 4pt 0 0; }
  .notes li { margin: 2pt 0; }
  footer { font-size: 8pt; color: ${COLORS.soft}; margin-top: 16pt; }
  .shares-chart { margin: 8pt 0 10pt; padding: 8pt 10pt; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; page-break-inside: avoid; }
  .sc-title { font-size: 8.5pt; font-weight: 700; color: #475569; margin-bottom: 4pt; }
  .sc-svg { width: 100%; height: auto; display: block; }
  strong { color: inherit; }
</style>
</head>
<body>
<h1>${escapeHtml(model.company)}</h1>
${model.ticker ? `<p class="ticker">${escapeHtml(model.ticker)}</p>` : ''}
${model.periodTitle ? `<p class="period">${escapeHtml(model.periodTitle)}</p>` : ''}
<hr>
${body}
${renderConclusionHtml(model.conclusion)}
${ratingHtml}
<footer>${escapeHtml(model.footer)}</footer>
</body>
</html>`;
}
