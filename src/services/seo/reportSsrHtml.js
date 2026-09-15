/**
 * @fileoverview Renderizado HTML SSR para informes de análisis (tablas, horizontes, notas, conclusiones).
 * @module services/seo/reportSsrHtml
 */

import { escapeHtml } from './seoConstants.js';

/**
 * Obtiene la clase CSS para resaltar notas numéricas.
 * @param {string|number} noteNumber - Número o índice de la nota.
 * @returns {string} Clase CSS de resaltado.
 */
export function getHighlightClassSsr(noteNumber) {
  const num = parseInt(noteNumber, 10);
  if (isNaN(num)) return 'highlight-c1';
  const palette = ['highlight-c1', 'highlight-c2', 'highlight-c3', 'highlight-c4', 'highlight-c5', 'highlight-c6'];
  return palette[(num - 1) % palette.length];
}

/**
 * Renderiza la lista de notas al pie del informe en HTML.
 * @param {string[]} notes - Lista de notas.
 * @returns {string} HTML renderizado de notas.
 */
export function renderNotesSsr(notes) {
  const list = (Array.isArray(notes) ? notes : []).filter(Boolean);
  if (!list.length) return '';
  return `<ul class="report-notes">${list.map((note) => {
    const raw = String(note ?? '');
    const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
    if (match) {
      const num = match[1];
      const cls = getHighlightClassSsr(num);
      return `<li><mark class="highlight-note ${cls}">*${escapeHtml(num)}:</mark> ${escapeHtml(match[2]).replaceAll('\n', '<br>')}</li>`;
    }
    return `<li>${escapeHtml(raw)}</li>`;
  }).join('')}</ul>`;
}

/**
 * Renderiza una tabla del informe con estilos y notas asociadas.
 * @param {string[]} headers - Encabezados de columna.
 * @param {Array<Array<string|number>>} rows - Filas de datos.
 * @param {object[]} [metaRows=[]] - Metadatos de cada fila.
 * @param {object} [options={}] - Opciones adicionales de renderizado.
 * @returns {string} HTML de la tabla.
 */
export function renderTableSsr(headers, rows, metaRows = [], options = {}) {
  const thead = headers.map((header) => {
    const isBoldCol = header === 'Ajustado' || header === 'Normal' || header.startsWith('Ajustado') || header.startsWith('Normal');
    let content = escapeHtml(header);
    const noteMatch = String(header).match(/\*(\d+)/);
    if (noteMatch) {
      const noteNum = parseInt(noteMatch[1], 10);
      content = `<mark class="highlight-adjust ${getHighlightClassSsr(noteNum)}">${content}</mark>`;
    }
    return `<th${isBoldCol ? ' class="cell-bold"' : ''}>${content}</th>`;
  }).join('');

  const isSalesTable = headers.length === 7 && headers[1] === 'Ajustado' && headers[4] === 'Normal';
  const isCashFlowTable = headers.length === 3 && headers[0] === 'Métrica';
  const isCapitalTable = options.isCapital || (headers.length === 2 && headers[0] === 'Métrica' && headers[1] === 'Valor');

  const tbody = rows.map((row, rowIdx) => {
    const meta = metaRows[rowIdx] || {};
    const isRowAdjusted = isSalesTable && meta.isAdjusted === true;
    let noteNum = 1;
    const noteMatch = String(meta.adjustedNote || '').match(/\*?(\d+)/);
    if (noteMatch) noteNum = parseInt(noteMatch[1], 10);
    const colorCls = getHighlightClassSsr(noteNum);

    const cells = row.map((cell, colIdx) => {
      const header = headers[colIdx];
      const isBoldCol = header === 'Ajustado' || header === 'Normal' || header.startsWith('Ajustado') || header.startsWith('Normal');
      const isPctCol = header === '% Aj.' || header === '% N.' || header === '%';
      const isAdjustedCell = isSalesTable && colIdx === 1 && isRowAdjusted;
      const isTaxAdjustedCell = isCashFlowTable && colIdx === 2 && meta.cashFlowAdjustedNote;
      const isCapitalValCell = isCapitalTable && colIdx === 1;

      let classes = [];
      if (isBoldCol) classes.push('cell-bold');
      if (isPctCol && cell) {
        const str = String(cell).trim();
        if (str.startsWith('-')) classes.push('pct-negative');
        else if (str.startsWith('+') || /^[0-9]/.test(str)) classes.push('pct-positive');
      } else if (isCapitalValCell && cell) {
        const str = String(cell).trim();
        if (str.startsWith('-')) classes.push('pct-negative', 'cell-bold');
        else if (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0' && str !== '0,0' && str !== '0.0' && str !== '—')) {
          classes.push('pct-positive', 'cell-bold');
        }
      }

      let content = escapeHtml(cell ?? '—');
      if (isAdjustedCell) {
        content = `<mark class="highlight-adjust ${colorCls}">${content}</mark>`;
      } else if (isTaxAdjustedCell) {
        const taxNoteNum = String(meta.cashFlowAdjustedNote).replace(/\D/g, '') || '2';
        content = `<mark class="highlight-adjust ${getHighlightClassSsr(taxNoteNum)}">${content}</mark>`;
      } else if (colIdx === 0 && cell) {
        const cellNoteMatch = String(cell).match(/\*(\d+)/);
        if (cellNoteMatch) {
          content = `<mark class="highlight-adjust ${getHighlightClassSsr(parseInt(cellNoteMatch[1], 10))}">${content}</mark>`;
        }
      }

      const clsAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
      return `<td${clsAttr}>${content}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

/**
 * Renderiza el bloque HTML de un horizonte temporal (ventas, flujo de caja, asignación de capital).
 * @param {object} horizon - Datos del horizonte.
 * @returns {string} HTML del horizonte.
 */
export function renderHorizonSsr(horizon) {
  const label = escapeHtml(horizon?.label ?? 'Periodo');
  let html = `<div class="report-block"><h5>${label}</h5>`;

  const sales = horizon?.sales ?? {};
  if (Array.isArray(sales.rows) && sales.rows.length) {
    html += '<p class="report-extras">1. VENTAS</p>';
    html += renderTableSsr(
      ['Métrica', 'Ajustado', 'Anterior Aj.', '% Aj.', 'Normal', 'Anterior N.', '% N.'],
      sales.rows.map((row) => [row.name, row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal]),
      sales.rows,
    );
    const extras = [];
    if (sales.shares) extras.push(`ACCIONES: ${escapeHtml(sales.shares)}`);
    if (sales.eps) extras.push(`BPA: ${escapeHtml(sales.eps)}`);
    if (extras.length) html += `<p class="report-extras">${extras.join(' · ')}</p>`;
    html += renderNotesSsr(sales.notes);
  }

  const cashFlow = horizon?.cashFlow ?? {};
  if (Array.isArray(cashFlow.rows) && cashFlow.rows.length) {
    html += '<p class="report-extras">2. CASH FLOW</p>';
    let scenarios = Array.isArray(cashFlow.scenarios) && cashFlow.scenarios.length ? [...cashFlow.scenarios] : ['Normal', 'Ajustado'];
    if (scenarios.length === 1) scenarios = [scenarios[0], 'Ajustado'];
    html += renderTableSsr(
      ['Métrica', ...scenarios],
      cashFlow.rows.map((row) => {
        let vals = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
        if (vals.length === 1 && scenarios.length === 2) vals.push(vals[0]);
        return [row.name, ...vals];
      }),
      cashFlow.rows,
    );
    const cfNotes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
      const lower = String(n || '').toLowerCase();
      return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
    });
    html += renderNotesSsr(cfNotes);
  }

  const capital = horizon?.capital ?? {};
  if (Array.isArray(capital.rows) && capital.rows.length) {
    html += '<p class="report-extras">3. ASIGNACIÓN DE CAPITAL</p>';
    html += renderTableSsr(
      ['Métrica', 'Valor'],
      capital.rows.map((row) => [row.name, row.value]),
      [],
      { isCapital: true },
    );
    if (capital.verification) html += `<p class="report-extras">${escapeHtml(capital.verification)}</p>`;
    html += renderNotesSsr(capital.notes);
  }
  html += '</div>';
  return html;
}

/**
 * Renderiza el bloque de conclusiones, perspectivas y watchlist.
 * @param {object} conclusion - Datos de conclusiones.
 * @returns {string} HTML de conclusiones.
 */
export function renderConclusionSsr(conclusion) {
  if (!conclusion || typeof conclusion !== 'object') return '';
  let html = '<div class="report-block"><h5>CONCLUSIONES Y OUTLOOK</h5>';
  const sectionTitles = {
    debt: 'Deuda y vencimientos',
    outlook: 'Perspectivas (Outlook)',
    repurchases: 'Recompras de acciones',
    acquisitions: 'Adquisiciones y desinversiones',
  };
  for (const [key, title] of Object.entries(sectionTitles)) {
    const item = conclusion[key];
    if (item?.text) {
      html += `<p class="report-extras">${escapeHtml(title)}</p><p style="font-size:12px;line-height:1.5;color:var(--ink-secondary);">${escapeHtml(item.text)}</p>`;
    }
  }

  const ceo = conclusion.ceoChange;
  if (ceo && typeof ceo === 'object') {
    html += '<p class="report-extras">Cambio de CEO</p>';
    if (ceo.text) {
      html += `<p style="font-size:12px;line-height:1.5;color:var(--ink-secondary);">${escapeHtml(ceo.text)}</p>`;
    }
    const personHtml = (label, person) => {
      if (!person) return '';
      const fields = [
        ['Inicio en el cargo', person.tenureStart],
        ['Ventas durante su mandato', person.salesDuringTenure],
        ['A dónde pasa', person.whereTheyGo],
        ['Políticas de su etapa', person.policies],
        ['De dónde viene', person.origin],
        ['Trayectoria previa', person.trackRecord],
        ['Qué ha anunciado', person.commitments],
      ].filter(([, value]) => value);
      if (!person.name && !fields.length) return '';
      return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(person.name || '')}${person.role ? ` (${escapeHtml(person.role)})` : ''}`
        + fields.map(([fieldLabel, value]) => `<br><strong>${escapeHtml(fieldLabel)}:</strong> ${escapeHtml(String(value))}`).join('')
        + '</li>';
    };
    const people = [personHtml('Antiguo CEO', ceo.oldCeo), personHtml('Nuevo CEO', ceo.newCeo)].filter(Boolean);
    if (people.length) html += `<ul class="report-notes">${people.join('')}</ul>`;
    if (ceo.marketReaction?.summary) {
      const sentiment = ceo.marketReaction.sentiment ? ` (${ceo.marketReaction.sentiment})` : '';
      html += `<p style="font-size:12px;line-height:1.5;color:var(--ink-secondary);"><strong>Reacción del mercado${escapeHtml(sentiment)}:</strong> ${escapeHtml(ceo.marketReaction.summary)}</p>`;
    }
    if (ceo.marketData && Number.isFinite(Number(ceo.marketData.changeFirstSessionPct))) {
      const fmt = (value) => `${Number(value) > 0 ? '+' : ''}${String(value).replace('.', ',')} %`;
      const third = Number.isFinite(Number(ceo.marketData.changeThreeSessionsPct)) ? ` y ${fmt(ceo.marketData.changeThreeSessionsPct)} a 3 sesiones` : '';
      html += `<p style="font-size:11px;color:var(--muted);">Cotización en torno al anuncio (${escapeHtml(String(ceo.marketData.announcementDate || ''))}): ${fmt(ceo.marketData.changeFirstSessionPct)} en la primera sesión${third}.</p>`;
    }
  }
  if (conclusion.watchlist?.items?.length) {
    html += '<p class="report-extras">Puntos clave en seguimiento</p><ul class="report-notes">';
    for (const item of conclusion.watchlist.items) {
      html += `<li>${escapeHtml(String(item).replace(/^\d+:\s*/, ''))}</li>`;
    }
    html += '</ul>';
  }
  html += '</div>';
  return html;
}

/**
 * Renderiza el cuerpo completo del informe SSR con horizontes, conclusiones y valoración.
 * @param {object} report - Objeto del informe.
 * @returns {string} HTML renderizado del informe.
 */
export function renderReportSsrHtml(report) {
  const horizons = Array.isArray(report?.horizons) ? report.horizons : [];
  let html = horizons.map(renderHorizonSsr).join('');
  if (report?.conclusion) html += renderConclusionSsr(report.conclusion);
  if (report?.rating?.label) {
    html += `<div class="report-block"><h5>VALORACIÓN GENERAL</h5><p><strong>${escapeHtml(report.rating.label)}</strong>${report.rating.rationale ? ` — ${escapeHtml(report.rating.rationale)}` : ''}</p></div>`;
  }
  const hintText = report?.conclusion
    ? 'El informe anual 10-K incluye resumen de cuentas a 12 meses, indagación a fondo con extractos SEC, watchlist y nota de resultados.'
    : 'El informe descargable incluye los bloques completos en los dos horizontes.';
  html += `<p class="report-hint">${hintText} Disponible en PDF, Word (.docx), ODT (.odt) y web (.html).</p>`;
  return html;
}
