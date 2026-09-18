/**
 * @fileoverview Renderizado HTML SSR para informes de análisis (tablas, horizontes, notas, conclusiones).
 * @module services/seo/reportSsrHtml
 */

import { escapeHtml } from './seoConstants.js';
import { getExecutiveChanges, getExecutiveFieldLabels } from '../reportExport/executiveChanges.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';
import { visibleCapitalRows } from '../../utils/capitalRows.js';

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
  const boldColumns = Array.isArray(options.boldColumns) ? options.boldColumns : [];
  const percentColumns = Array.isArray(options.percentColumns) ? options.percentColumns : [];
  const thead = headers.map((header, colIdx) => {
    const isBoldCol = boldColumns.includes(colIdx);
    let content = escapeHtml(header);
    const noteMatch = String(header).match(/\*(\d+)/);
    if (noteMatch) {
      const noteNum = parseInt(noteMatch[1], 10);
      content = `<mark class="highlight-adjust ${getHighlightClassSsr(noteNum)}">${content}</mark>`;
    }
    return `<th${isBoldCol ? ' class="cell-bold"' : ''}>${content}</th>`;
  }).join('');

  const isSalesTable = options.isSales === true;
  const isCashFlowTable = options.isCashFlow === true;
  const isCapitalTable = options.isCapital === true;

  const tbody = rows.map((row, rowIdx) => {
    const meta = metaRows[rowIdx] || {};
    const isRowAdjusted = isSalesTable && meta.isAdjusted === true;
    let noteNum = 1;
    const noteMatch = String(meta.adjustedNote || '').match(/\*?(\d+)/);
    if (noteMatch) noteNum = parseInt(noteMatch[1], 10);
    const colorCls = getHighlightClassSsr(noteNum);

    const cells = row.map((cell, colIdx) => {
      const isBoldCol = boldColumns.includes(colIdx);
      const isPctCol = percentColumns.includes(colIdx);
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
export function renderHorizonSsr(horizon, language = 'es') {
  const lang = normalizeLanguage(language);
  const label = escapeHtml(horizon?.label ?? t('Periodo', null, lang));
  let html = `<div class="report-block"><h5>${label}</h5>`;

  const sales = horizon?.sales ?? {};
  if (Array.isArray(sales.rows) && sales.rows.length) {
    html += `<p class="report-extras">${escapeHtml(t('1. VENTAS', null, lang))}</p>`;
    html += renderTableSsr(
      [t('Métrica', null, lang), t('Ajustado', null, lang), t('Anterior Aj.', null, lang), t('% Aj.', null, lang), t('Normal', null, lang), t('Anterior N.', null, lang), t('% N.', null, lang)],
      sales.rows.map((row) => [row.name, row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal]),
      sales.rows,
      { isSales: true, boldColumns: [1, 4], percentColumns: [3, 6] },
    );
    const extras = [];
    if (sales.shares) extras.push(`${t('ACCIONES', null, lang)}: ${escapeHtml(sales.shares)}`);
    if (sales.eps) extras.push(`${t('BPA', null, lang)}: ${escapeHtml(sales.eps)}`);
    if (extras.length) html += `<p class="report-extras">${extras.join(' · ')}</p>`;
    html += renderNotesSsr(sales.notes);
  }

  const cashFlow = horizon?.cashFlow ?? {};
  if (Array.isArray(cashFlow.rows) && cashFlow.rows.length) {
    html += `<p class="report-extras">${escapeHtml(t('2. CASH FLOW', null, lang))}</p>`;
    let scenarios = Array.isArray(cashFlow.scenarios) && cashFlow.scenarios.length ? [...cashFlow.scenarios] : [t('Normal', null, lang), t('Ajustado', null, lang)];
    if (scenarios.length === 1) scenarios = [scenarios[0], t('Ajustado', null, lang)];
    html += renderTableSsr(
      [t('Métrica', null, lang), ...scenarios],
      cashFlow.rows.map((row) => {
        let vals = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
        if (vals.length === 1 && scenarios.length === 2) vals.push(vals[0]);
        return [row.name, ...vals];
      }),
      cashFlow.rows,
      { isCashFlow: true, boldColumns: [1, 2] },
    );
    const cfNotes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
      const lower = String(n || '').toLowerCase();
      return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
    });
    html += renderNotesSsr(cfNotes);
  }

  const capital = horizon?.capital ?? {};
  if (Array.isArray(capital.rows) && capital.rows.length) {
    html += `<p class="report-extras">${escapeHtml(t('3. ASIGNACIÓN DE CAPITAL', null, lang))}</p>`;
    html += renderTableSsr(
      [t('Métrica', null, lang), t('Valor', null, lang)],
      visibleCapitalRows(capital.rows).map((row) => [row.name, row.value]),
      [],
      { isCapital: true, boldColumns: [1] },
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
export function renderConclusionSsr(conclusion, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!conclusion || typeof conclusion !== 'object') return '';
  let html = `<div class="report-block"><h5>${escapeHtml(t('CONCLUSIONES Y OUTLOOK', null, lang))}</h5>`;
  const sectionTitles = {
    debt: t('Deuda y vencimientos', null, lang),
    outlook: t('Perspectivas (Outlook)', null, lang),
    repurchases: t('Recompras de acciones', null, lang),
    acquisitions: t('Operaciones corporativas', null, lang),
  };
  for (const [key, title] of Object.entries(sectionTitles)) {
    const item = conclusion[key];
    if (item?.text) {
      html += `<p class="report-extras">${escapeHtml(title)}</p><p style="font-size:12px;line-height:1.5;color:var(--ink-secondary);">${escapeHtml(item.text)}</p>`;
    }
  }

  const executiveChanges = getExecutiveChanges(conclusion, lang);
  if (executiveChanges) {
    html += `<p class="report-extras">${escapeHtml(executiveChanges.title || t('Cambios en la dirección', null, lang))}</p>`;
    const personHtml = (label, person) => {
      if (!person) return '';
      const fields = getExecutiveFieldLabels(lang)
        .map(([fieldLabel, keyName]) => [fieldLabel, person[keyName]])
        .filter(([, value]) => value);
      if (!person.name && !fields.length) return '';
      return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(person.name || '')}${person.role ? ` (${escapeHtml(person.role)})` : ''}`
        + fields.map(([fieldLabel, value]) => `<br><strong>${escapeHtml(fieldLabel)}:</strong> ${escapeHtml(String(value))}`).join('')
        + '</li>';
    };
    executiveChanges.changes.forEach((change) => {
      const role = change.role || t('Directivo', null, lang);
      if (change.text) {
        html += `<p style="font-size:12px;line-height:1.5;color:var(--ink-secondary);">${escapeHtml(change.text)}</p>`;
      }
      const meta = [
        change.announcementDate ? `${t('Anuncio', null, lang)}: ${change.announcementDate}` : null,
        change.effectiveDate ? `${t('Efectivo', null, lang)}: ${change.effectiveDate}` : null,
        change.reason ? `${t('Motivo', null, lang)}: ${change.reason}` : null,
      ].filter(Boolean);
      if (meta.length) html += `<p style="font-size:11px;color:var(--muted);">${escapeHtml(`${role} · ${meta.join(' · ')}`)}</p>`;
      const people = [
        personHtml(t('Antiguo {role}', { role }, lang), change.oldExecutive),
        personHtml(t('Nuevo {role}', { role }, lang), change.newExecutive),
      ].filter(Boolean);
      if (people.length) html += `<ul class="report-notes">${people.join('')}</ul>`;
    });
    if (executiveChanges.disclaimer) {
      html += `<p style="font-size:10px;font-style:italic;color:var(--muted);">${escapeHtml(executiveChanges.disclaimer)}</p>`;
    }
  }
  if (conclusion.watchlist?.items?.length) {
    html += `<p class="report-extras">${escapeHtml(t('Puntos clave en seguimiento', null, lang))}</p><ul class="report-notes">`;
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
  const lang = normalizeLanguage(report?.language);
  const horizons = Array.isArray(report?.horizons) ? report.horizons : [];
  let html = horizons.map((horizon) => renderHorizonSsr(horizon, lang)).join('');
  if (report?.conclusion) html += renderConclusionSsr(report.conclusion, lang);
  if (report?.rating?.label) {
    html += `<div class="report-block"><h5>${escapeHtml(t('VALORACIÓN GENERAL', null, lang))}</h5><p><strong>${escapeHtml(report.rating.label)}</strong>${report.rating.rationale ? ` — ${escapeHtml(report.rating.rationale)}` : ''}</p></div>`;
  }
  const hintText = report?.conclusion
    ? t('El informe anual 10-K incluye resumen de cuentas a 12 meses, indagación a fondo con extractos SEC, watchlist y nota de resultados.', null, lang)
    : t('El informe descargable incluye los bloques completos en los dos horizontes.', null, lang);
  html += `<p class="report-hint">${escapeHtml(hintText)} ${escapeHtml(t('Disponible en PDF, Word (.docx), ODT (.odt) y web (.html).', null, lang))}</p>`;
  return html;
}
