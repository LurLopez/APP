/**
 * @fileoverview Utilidades y tablas base del análisis (formateo, notas, tablas y horizontes) (extraído de analisisTables.js).
 */

(function (window) {


  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function getHighlightClass(noteNumber) {
    const num = parseInt(noteNumber, 10);
    if (isNaN(num)) return 'highlight-c1';
    const palette = ['highlight-c1', 'highlight-c2', 'highlight-c3', 'highlight-c4', 'highlight-c5', 'highlight-c6'];
    return palette[(num - 1) % palette.length];
  }

  function renderNotes(notes) {
    const list = (Array.isArray(notes) ? notes : []).filter(Boolean);
    if (!list.length) return '';
    return `<ul class="report-notes">${list.map((note) => {
      const raw = String(note ?? '');
      const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
      if (match) {
        const num = match[1];
        const cls = getHighlightClass(num);
        return `<li><mark class="highlight-note ${cls}">*${escapeHtml(num)}:</mark> ${escapeHtml(match[2]).replaceAll('\n', '<br>')}</li>`;
      }
      return `<li>${escapeHtml(raw)}</li>`;
    }).join('')}</ul>`;
  }

  function renderTable(headers, rows, metaRows = [], options = {}) {
    const boldColumns = Array.isArray(options.boldColumns) ? options.boldColumns : [];
    const percentColumns = Array.isArray(options.percentColumns) ? options.percentColumns : [];
    const valueColumn = Number.isInteger(options.valueColumn) ? options.valueColumn : null;
    const isSalesTable = options.isSales === true;
    const isCashFlowTable = options.isCashFlow === true;
    const isCapitalTable = options.isCapital === true;

    const thead = headers.map((header, colIdx) => {
      const isBoldCol = boldColumns.includes(colIdx);
      let content = escapeHtml(header);
      const noteMatch = String(header).match(/\*(\d+)/);
      if (noteMatch) {
        const noteNum = parseInt(noteMatch[1], 10);
        content = `<mark class="highlight-adjust ${getHighlightClass(noteNum)}">${content}</mark>`;
      }
      const cls = isBoldCol ? ' class="cell-bold"' : '';
      return `<th${cls}>${content}</th>`;
    }).join('');

    const tbody = rows
      .map((row, rowIdx) => {
        const meta = metaRows[rowIdx] || {};
        const isRowAdjusted = isSalesTable && meta.isAdjusted === true;
        let noteNum = 1;
        const noteMatch = String(meta.adjustedNote || '').match(/\*?(\d+)/);
        if (noteMatch) noteNum = parseInt(noteMatch[1], 10);
        const colorCls = getHighlightClass(noteNum);

        const cells = row.map((cell, colIdx) => {
          const isBoldCol = boldColumns.includes(colIdx);
          const isPctCol = percentColumns.includes(colIdx);
          const isAdjustedCell = isSalesTable && colIdx === 1 && isRowAdjusted;
          const isTaxAdjustedCell = isCashFlowTable && colIdx === 2 && meta.cashFlowAdjustedNote;
          const isCapitalValCell = isCapitalTable && valueColumn != null && colIdx === valueColumn;

          const classes = [];
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
            content = `<mark class="highlight-adjust ${getHighlightClass(taxNoteNum)}">${content}</mark>`;
          } else if (colIdx === 0 && cell) {
            const cellNoteMatch = String(cell).match(/\*(\d+)/);
            if (cellNoteMatch) {
              const cellColorCls = getHighlightClass(parseInt(cellNoteMatch[1], 10));
              content = `<mark class="highlight-adjust ${cellColorCls}">${content}</mark>`;
            }
          }

          const clsAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
          return `<td${clsAttr}>${content}</td>`;
        }).join('');

        return `<tr>${cells}</tr>`;
      })
      .join('');
    return `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  }

  function tr(text, params) {
    const i18n = window.I18n;
    if (!i18n) return text;
    const reportLanguage = window.AnalisisState?.currentReportLanguage;
    if (i18n.tIn) return i18n.tIn(text, params, reportLanguage);
    return i18n.t ? i18n.t(text, params) : text;
  }

  function isVisibleCapitalRow(row) {
    const name = String(row?.name ?? '').replace(/\*\d+/g, '').trim().toLowerCase();
    if (/^(libre|free)\b/.test(name) || name.includes('total')) return true;
    const raw = String(row?.value ?? '').trim().replace(/[$€£\s+]/g, '');
    if (!raw || raw === '—') return true;
    return !/^-?0+(?:[.,]0+)?$/.test(raw);
  }

  function renderHorizon(horizon) {
    const label = escapeHtml(horizon.label ?? tr('Periodo'));
    let html = `<div class="report-block"><h5>${label}</h5>`;

    const sales = horizon.sales ?? {};
    if (Array.isArray(sales.rows) && sales.rows.length) {
      html += `<p class="report-extras">${tr('1. VENTAS')}</p>`;
      html += renderTable(
        [tr('Métrica'), tr('Ajustado'), tr('Anterior Aj.'), tr('% Aj.'), tr('Normal'), tr('Anterior N.'), tr('% N.')],
        sales.rows.map((row) => [row.name, row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal]),
        sales.rows,
        { isSales: true, boldColumns: [1, 4], percentColumns: [3, 6] }
      );
      const extras = [];
      if (sales.shares) extras.push(`${tr('ACCIONES')}: ${escapeHtml(sales.shares)}`);
      if (sales.eps) extras.push(`${tr('BPA')}: ${escapeHtml(sales.eps)}`);
      if (extras.length) html += `<p class="report-extras">${extras.join(' · ')}</p>`;
      html += renderNotes(sales.notes);
    }

    const cashFlow = horizon.cashFlow ?? {};
    if (Array.isArray(cashFlow.rows) && cashFlow.rows.length) {
      html += `<p class="report-extras">${tr('2. CASH FLOW')}</p>`;
      let scenarios = Array.isArray(cashFlow.scenarios) && cashFlow.scenarios.length ? [...cashFlow.scenarios] : [tr('Normal'), tr('Ajustado')];
      if (scenarios.length === 1) scenarios = [scenarios[0], tr('Ajustado')];
      html += renderTable(
        [tr('Métrica'), ...scenarios],
        cashFlow.rows.map((row) => {
          let vals = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
          if (vals.length === 1 && scenarios.length === 2) vals.push(vals[0]);
          return [row.name, ...vals];
        }),
        cashFlow.rows,
        { isCashFlow: true, boldColumns: [1, 2] }
      );
      const cfNotes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
        const lower = String(n || '').toLowerCase();
        return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
      });
      html += renderNotes(cfNotes);
    }

    const capital = horizon.capital ?? {};
    const capitalRows = Array.isArray(capital.rows) ? capital.rows.filter(isVisibleCapitalRow) : [];
    if (capitalRows.length) {
      html += `<p class="report-extras">${tr('3. ASIGNACIÓN DE CAPITAL')}</p>`;
      html += renderTable([tr('Métrica'), tr('Valor')], capitalRows.map((r) => [r.name, r.value]), [], { isCapital: true, valueColumn: 1 });
      if (capital.verification) html += `<p class="report-extras">${escapeHtml(capital.verification)}</p>`;
      html += renderNotes(capital.notes);
    }

    html += '</div>';
    return html;
  }

  function parseSecNum(str) {
    if (str == null) return NaN;
    let s = String(str).replace(/[$€£\s]/g, '').trim();
    if (!s) return NaN;
    if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
    else if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function withAveragePrice(snippet) {
    if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
    if (snippet.rows.some((r) => /average price/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))))) return snippet;
    const sharesRow = snippet.rows.find((r) => /shares repurchased/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))));
    const costRow = snippet.rows.find((r) => /aggregate cost/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))));
    if (!sharesRow || !costRow) return snippet;
    const width = Math.max(Array.isArray(sharesRow) ? sharesRow.length : 2, Array.isArray(costRow) ? costRow.length : 2);
    const prices = [];
    for (let i = 1; i < width; i += 1) {
      const shares = parseSecNum(Array.isArray(sharesRow) ? sharesRow[i] : sharesRow.value);
      const cost = parseSecNum(Array.isArray(costRow) ? costRow[i] : costRow.value);
      prices.push(Number.isFinite(shares) && Number.isFinite(cost) && shares > 0 ? `$${((cost * 1e6) / shares).toFixed(1).replace('.', ',')}` : '—');
    }
    if (prices.every((p) => p === '—')) return snippet;
    return { ...snippet, rows: [...snippet.rows, ['Average price paid (in $)', ...prices]] };
  }

  function boldNumbers(text) {
    return String(text ?? '').replace(/([~±\-+]?\s*\$?\d[\d.,]*\s*(?:M|B|k|%|\$|€)?(?:\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%)?)/g, (m) => `<strong>${m}</strong>`);
  }

  function formatAnnualRichText(text) {
    if (!text) return '';
    let s = String(text);
    const bolds = [];
    s = s.replace(/\*\*(.*?)\*\*/g, (_, p1) => {
      bolds.push(p1);
      return `___MD_BOLD_${bolds.length - 1}___`;
    });

    s = escapeHtml(s);
    s = s.replace(/\b(flat\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%?)\b/gi, '<strong>$1</strong>');
    s = s.replace(/\b([~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%)?\s*(?:al?|to|-)\s*[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%|\$|€)?)\b/gi, '<strong>$1</strong>');
    s = s.replace(/([~±+\-]?\s*\$?\d+(?:[\.,]\d+)*\s*(?:M|B|k|%|\$|€)(?:\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%)?)/gi, '<strong>$1</strong>');
    s = s.replace(/\b(20\d\d\s*-\s*20\d\d)\b/g, '<strong>$1</strong>');
    s = s.replace(/___MD_BOLD_(\d+)___/g, (_, idx) => `<strong>${bolds[Number(idx)]}</strong>`);

    let strongGuard = 0;
    while (s.includes('<strong><strong>') && strongGuard < 20) {
      strongGuard += 1;
      const next = s.replace(/<strong><strong>([\s\S]*?)<\/strong><\/strong>/g, '<strong>$1</strong>');
      if (next === s) { s = s.replaceAll('<strong><strong>', '<strong>'); break; }
      s = next;
    }
    s = s.replace(/<strong>([^<]*)<strong>/g, '<strong>$1');
    s = s.replace(/<\/strong>([^<]*)<\/strong>/g, '$1</strong>');
    return s.replaceAll('\n', '<br>');
  }

  function withOutlookComparison(snippet, report) {
    if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
    return snippet;
  }

window.escapeHtml = escapeHtml;
window.getHighlightClass = getHighlightClass;
window.renderNotes = renderNotes;
window.renderTable = renderTable;
window.renderHorizon = renderHorizon;
window.parseSecNum = parseSecNum;
window.withAveragePrice = withAveragePrice;
window.boldNumbers = boldNumbers;
window.formatAnnualRichText = formatAnnualRichText;
window.withOutlookComparison = withOutlookComparison;

})(window);
