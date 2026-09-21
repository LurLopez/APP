/**
 * @fileoverview Construcción de secciones tabulares (Ventas, Cash Flow, Asignación de Capital, Extractos SEC).
 * @module services/reportExport/reportSections
 */

import { cell, headerCell, getHighlight, noteNumberOf, sanitize, COLORS } from './exportColors.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';
import { visibleCapitalRows } from '../../utils/capitalRows.js';

export function isPctHeader(header) {
  return ['% Aj.', '% N.', '% Ajustado', '% Normal', '%', '% Adj.', '% N.', '% Adjusted', '% Normal'].includes(String(header).trim());
}

export function pctColor(value) {
  const str = String(value ?? '').trim();
  if (!str || str === '—') return null;
  if (str.startsWith('-')) return COLORS.negative;
  if (str.startsWith('+') || /^[0-9]/.test(str)) return COLORS.positive;
  return null;
}

export function buildNotes(notes, options = {}) {
  return (Array.isArray(notes) ? notes : []).filter(Boolean).map((note) => {
    const raw = sanitize(note);
    const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
    if (match) {
      const num = match[1];
      const colorNum = (options.isCashFlow && (num === '3' || num === 3)) ? '2' : num;
      const scheme = getHighlight(colorNum);
      return { marker: `*${num}:`, text: match[2], bg: scheme.bg, color: scheme.text, italic: false };
    }
    return { marker: null, text: raw, italic: true, color: COLORS.muted };
  });
}

export function buildSalesSection(sales, language = 'es') {
  const lang = normalizeLanguage(language);
  const columns = [t('Métrica', null, lang), t('Ajustado', null, lang), t('Anterior Aj.', null, lang), t('% Ajustado', null, lang), t('Normal', null, lang), t('Anterior N.', null, lang), t('% Normal', null, lang)];
  const widths = [140, 62, 62, 63, 62, 62, 63];
  const headers = columns.map(headerCell);
  const boldColumns = [1, 4];
  const pctColumns = [3, 6];
  const rows = (sales.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const isRowAdjusted = row.isAdjusted === true;
    const scheme = getHighlight(noteNumberOf(row.adjustedNote));
    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    const values = [row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal];
    const valueCells = values.map((value, i) => {
      const base = { bold: boldColumns.includes(i + 1), color: COLORS.ink, bg: stripeBg };
      if (i === 0 && isRowAdjusted) {
        return cell(value, { bold: true, color: scheme.text, bg: scheme.bg });
      }
      if (pctColumns.includes(i + 1)) {
        const color = pctColor(value);
        if (color) return cell(value, { ...base, color, bold: false });
      }
      return cell(value, base);
    });
    return [nameCell, ...valueCells];
  });

  return {
    title: t('1. VENTAS', null, lang),
    table: { columns, widths, headers, rows },
    extras: [
      sales.shares ? `${t('ACCIONES', null, lang)}: ${sanitize(sales.shares)}` : null,
      sales.eps ? `${t('BPA', null, lang)}: ${sanitize(sales.eps)}` : null,
    ].filter(Boolean),
    notes: buildNotes(sales.notes),
  };
}

export function buildCashFlowSection(cashFlow, language = 'es') {
  const lang = normalizeLanguage(language);
  let scenarios = Array.isArray(cashFlow.scenarios) ? [...cashFlow.scenarios] : [];
  if (scenarios.length === 0) scenarios = [t('Normal', null, lang), t('Ajustado', null, lang)];
  else if (scenarios.length === 1) scenarios = [scenarios[0], t('Ajustado', null, lang)];

  const columns = [t('Métrica', null, lang), ...scenarios];
  const widths = [150, ...Array(scenarios.length).fill((515 - 150) / scenarios.length)];
  const headers = columns.map(headerCell);
  const rows = (cashFlow.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    let values = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
    if (values.length === 1 && scenarios.length === 2) values.push(values[0]);

    const valueCells = values.map((value, i) => {
      const base = { bold: true, color: COLORS.ink, bg: stripeBg };
      if (i === 1 && row.cashFlowAdjustedNote) {
        const scheme = getHighlight(String(row.cashFlowAdjustedNote).replace(/\D/g, '') || '2');
        return cell(value, { bold: true, color: scheme.text, bg: scheme.bg });
      }
      return cell(value, base);
    });
    return [nameCell, ...valueCells];
  });

  const notes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
    const lower = String(n || '').toLowerCase();
    return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
  });

  return { title: t('2. CASH FLOW', null, lang), table: { columns, widths, headers, rows }, notes: buildNotes(notes, { isCashFlow: true }) };
}

export function buildCapitalSection(capital, language = 'es') {
  const lang = normalizeLanguage(language);
  const columns = [t('Métrica', null, lang), t('Valor', null, lang)];
  const widths = [150, 365];
  const headers = columns.map(headerCell);
  const rows = visibleCapitalRows(capital.rows).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    const str = String(row.value ?? '').trim();
    const color = str.startsWith('-') ? COLORS.negative
      : (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0')) ? COLORS.positive
        : COLORS.ink;
    return [nameCell, cell(row.value, { color, bg: stripeBg })];
  });

  return {
    title: t('3. ASIGNACIÓN DE CAPITAL', null, lang),
    table: { columns, widths, headers, rows },
    verification: capital.verification ? sanitize(capital.verification) : null,
    notes: buildNotes(capital.notes),
  };
}

export function buildSecSnippetTable(snippet) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return null;
  const rawHeaders = Array.isArray(snippet.headers) ? snippet.headers : [];
  const rawRows = snippet.rows.map((r) => (Array.isArray(r) ? r : [r.metric ?? r.name, r.value]));
  const numCols = rawHeaders.length || (rawRows[0] ? rawRows[0].length : 2);
  let widths;
  if (numCols === 4) {
    widths = [165, 85, 110, 155];
  } else {
    const firstColWidth = numCols === 2 ? 220 : 160;
    widths = [firstColWidth, ...Array(numCols - 1).fill((515 - firstColWidth) / Math.max(1, numCols - 1))];
  }

  const columns = rawHeaders.length ? rawHeaders : Array(numCols).fill('');
  const headers = columns.map(headerCell);
  const isRepurchase = /repurchase|recompra/i.test(String(snippet.title || ''))
    || rawRows.some((r) => /shares repurchased|aggregate cost|average price paid|recompras bajo|coste agregado/i.test(String(r?.[0] ?? '')));
  const latestYearIdx = (() => {
    let index = 1;
    let bestYear = -Infinity;
    columns.forEach((header, i) => {
      if (i === 0) return;
      const match = String(header).match(/(20\d\d)/);
      if (match && Number(match[1]) > bestYear) {
        bestYear = Number(match[1]);
        index = i;
      }
    });
    return index;
  })();

  const rows = rawRows.map((r, rIdx) => {
    const stripeBg = rIdx % 2 === 1 ? COLORS.stripe : null;
    const rowText = r.join(' ').toLowerCase();
    const isYellow = rowText.includes('repurchased') || rowText.includes('recomprad');
    const isOrange = rowText.includes('aggregate') || rowText.includes('cost');

    return r.map((c, cIdx) => {
      let bg = stripeBg;
      let color = COLORS.ink;
      let bold = cIdx === 0;
      if (isRepurchase) {
        if (cIdx === latestYearIdx) {
          bg = '#f0fdfa';
          color = '#0d9488';
          bold = true;
        } else if (cIdx > 0) bold = true;
      } else if (numCols === 4) {
        if (cIdx === 1) { bg = '#f8fafc'; color = '#475569'; bold = true; }
        else if (cIdx === 2) { bold = true; }
        else if (cIdx === 3) { bg = '#f0fdfa'; color = '#0d9488'; bold = true; }
      } else if (cIdx > 0 && isYellow) {
        bg = '#fef08a'; color = '#854d0e'; bold = true;
      } else if (cIdx > 0 && isOrange) {
        bg = '#fed7aa'; color = '#c2410c'; bold = true;
      } else if (cIdx > 0) bold = true;
      return cell(c, { bg, color, bold });
    });
  });

  return { title: snippet.title || 'EXTRACTO OFICIAL SEC (FORM 10-K)', summary: snippet.summary || null, headers, widths, rows };
}
