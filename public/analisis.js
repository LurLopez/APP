/* ── Módulo de Análisis Fundamental (Cifra Terminal) ─────────────────────── */

(function () {
  'use strict';

  let selectedFile = null;
  let selectedPresentation = null;
  let analysisTimer = null;
  let processingHintTimer = null;
  let lastAnalysisFailed = true;
  let currentPdfUrl = null;
  let currentDownloadBase = null;
  let currentDownloadName = 'analisis-cifra';
  let pendingFiling = null;
  let currentUser = false;
  let historyDebounceTimer = null;
  let historyAnalyses = [];
  let historySort = { key: 'created_at', dir: 'desc' };
  let initialized = false;
  let historyCompanies = [];
  let historySuggest = null;
  let historySuggestIndex = -1;
  let currentAnalysisId = null;
  let currentAnalysisTicker = null;
  let currentAnalysisAccession = null;
  let currentUserRating = 0;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function formatElapsed(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatHistoryDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3200);
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
    const thead = headers.map((header) => {
      const isBoldCol = header === 'Ajustado' || header === 'Normal' || header.startsWith('Ajustado') || header.startsWith('Normal');
      let content = escapeHtml(header);
      const noteMatch = String(header).match(/\*(\d+)/);
      if (noteMatch) {
        const noteNum = parseInt(noteMatch[1], 10);
        const colorCls = getHighlightClass(noteNum);
        content = `<mark class="highlight-adjust ${colorCls}">${content}</mark>`;
      }
      const cls = isBoldCol ? ' class="cell-bold"' : '';
      return `<th${cls}>${content}</th>`;
    }).join('');

    const isSalesTable = headers.length === 7 && headers[1] === 'Ajustado' && headers[4] === 'Normal';
    const isCashFlowTable = headers.length === 3 && headers[0] === 'Métrica';
    const isCapitalTable = options.isCapital || (headers.length === 2 && headers[0] === 'Métrica' && headers[1] === 'Valor');

    const tbody = rows
      .map((row, rowIdx) => {
        const meta = metaRows[rowIdx] || {};
        const isRowAdjusted = isSalesTable && meta.isAdjusted === true;

        let noteNum = 1;
        const noteMatch = String(meta.adjustedNote || '').match(/\*?(\d+)/);
        if (noteMatch) {
          noteNum = parseInt(noteMatch[1], 10);
        }
        const colorCls = getHighlightClass(noteNum);

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
            if (str.startsWith('-')) {
              classes.push('pct-negative');
            } else if (str.startsWith('+') || /^[0-9]/.test(str)) {
              classes.push('pct-positive');
            }
          } else if (isCapitalValCell && cell) {
            const str = String(cell).trim();
            if (str.startsWith('-')) {
              classes.push('pct-negative', 'cell-bold');
            } else if (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0' && str !== '0,0' && str !== '0.0' && str !== '—')) {
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
              const cellNoteNum = parseInt(cellNoteMatch[1], 10);
              const cellColorCls = getHighlightClass(cellNoteNum);
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

  function renderHorizon(horizon) {
    const label = escapeHtml(horizon.label ?? 'Periodo');
    let html = `<div class="report-block"><h5>${label}</h5>`;

    const sales = horizon.sales ?? {};
    if (Array.isArray(sales.rows) && sales.rows.length) {
      html += `<p class="report-extras">1. VENTAS</p>`;
      html += renderTable(
        ['Métrica', 'Ajustado', 'Anterior Aj.', '% Aj.', 'Normal', 'Anterior N.', '% N.'],
        sales.rows.map((row) => [row.name, row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal]),
        sales.rows
      );
      const extras = [];
      if (sales.shares) extras.push(`ACCIONES: ${escapeHtml(sales.shares)}`);
      if (sales.eps) extras.push(`BPA: ${escapeHtml(sales.eps)}`);
      if (extras.length) html += `<p class="report-extras">${extras.join(' · ')}</p>`;
      html += renderNotes(sales.notes);
    }

    const cashFlow = horizon.cashFlow ?? {};
    if (Array.isArray(cashFlow.rows) && cashFlow.rows.length) {
      html += `<p class="report-extras">2. CASH FLOW</p>`;
      let scenarios = Array.isArray(cashFlow.scenarios) && cashFlow.scenarios.length ? [...cashFlow.scenarios] : ['Normal', 'Ajustado'];
      if (scenarios.length === 1) {
        scenarios = [scenarios[0], 'Ajustado'];
      }
      html += renderTable(
        ['Métrica', ...scenarios],
         cashFlow.rows.map((row) => {
          let vals = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
          if (vals.length === 1 && scenarios.length === 2) {
            vals.push(vals[0]);
          }
          return [row.name, ...vals];
         }),
         cashFlow.rows
       );
      const cfNotes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
        const lower = String(n || '').toLowerCase();
        return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
      });
      html += renderNotes(cfNotes);
    }

    const capital = horizon.capital ?? {};
    if (Array.isArray(capital.rows) && capital.rows.length) {
      html += `<p class="report-extras">3. ASIGNACIÓN DE CAPITAL</p>`;
      html += renderTable(
        ['Métrica', 'Valor'],
        capital.rows.map((row) => [row.name, row.value]),
        [],
        { isCapital: true }
      );
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
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && !hasDot) s = s.replace(',', '.');
    else if (!hasComma && hasDot && s.split('.').length > 2) s = s.split('.').join('');
    else if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
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

    // Flat +/- X %
    s = s.replace(/\b(flat\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%?)\b/gi, '<strong>$1</strong>');

    // Number ranges: -15 % al -18 %, 22 % al 24 %, -11% to -15%
    s = s.replace(/\b([~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%)?\s*(?:al?|to|-)\s*[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%|\$|€)?)\b/gi, '<strong>$1</strong>');

    // Standalone financial numbers, percentages, tolerances: 1.100M +/- 10%, 650M +/- 5%, $1.1B, 376M, 450M, 28,7M, ~5 % anual
    s = s.replace(/([~±+\-]?\s*\$?\d+(?:[\.,]\d+)*\s*(?:M|B|k|%|\$|€)(?:\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%)?)/gi, '<strong>$1</strong>');

    // Multi-year ranges: 2026-2028
    s = s.replace(/\b(20\d\d\s*-\s*20\d\d)\b/g, '<strong>$1</strong>');

    // Restore markdown bolds
    s = s.replace(/___MD_BOLD_(\d+)___/g, (_, idx) => `<strong>${bolds[Number(idx)]}</strong>`);

    while (s.includes('<strong><strong>')) {
      s = s.replace(/<strong><strong>(.*?)<\/strong><\/strong>/g, '<strong>$1</strong>');
    }
    s = s.replace(/<strong>([^<]*)<strong>/g, '<strong>$1');
    s = s.replace(/<\/strong>([^<]*)<\/strong>/g, '$1</strong>');

    return s.replaceAll('\n', '<br>');
  }

  function withOutlookComparison(snippet, report) {
    if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
    const rawHeaders = Array.isArray(snippet.headers) ? snippet.headers : [];
    if (rawHeaders.length >= 4) return snippet;

    let nextYear = 2026;
    const titleMatch = (snippet.title || '').match(/20\d\d/);
    if (titleMatch) nextYear = parseInt(titleMatch[0], 10);
    else if (rawHeaders[1] && rawHeaders[1].match(/20\d\d/)) nextYear = parseInt(rawHeaders[1].match(/20\d\d/)[0], 10);
    else if (report?.fiscalYear) nextYear = report.fiscalYear + 1;
    const prevYear = nextYear - 1;

    const h0 = report?.horizons?.[0];
    const salesRows = h0?.sales?.rows || [];
    const cfRows = h0?.cashFlow?.rows || [];

    const parseNum = (val) => {
      if (val == null) return null;
      let s = String(val).replace(/[^0-9.,\-]/g, '');
      if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
      else if (s.includes(',')) s = s.replace(',', '.');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };

    const fmtMoney = (n) => {
      if (n == null || !Number.isFinite(n)) return '—';
      return '$' + Math.round(n).toLocaleString('en-US') + 'M';
    };

    const fmtEps = (n) => {
      if (n == null || !Number.isFinite(n)) return '—';
      return '$' + n.toFixed(2);
    };

    const getSalesRow = (name) => salesRows.find((r) => (r.name || '').toLowerCase().includes(name.toLowerCase()));
    const getCfRow = (name) => cfRows.find((r) => (r.name || '').toLowerCase().includes(name.toLowerCase()));

    const prevSalesRow = getSalesRow('Ventas');
    const prevSalesVal = parseNum(prevSalesRow?.adjusted || prevSalesRow?.normal);

    const prevEbtRow = getSalesRow('EBT');
    const prevEbtVal = parseNum(prevEbtRow?.adjusted || prevEbtRow?.normal);

    const prevFcfRow = getCfRow('FCF');
    const prevFcfVal = parseNum(prevFcfRow?.values?.[0]);
    const prevFcfAdjVal = parseNum(prevFcfRow?.values?.[1]);

    const prevCapexRow = getCfRow('CAPEX');
    const prevCapexVal = parseNum(prevCapexRow?.values?.[0]);

    const prevEpsVal = parseNum(h0?.sales?.eps) || (prevEbtVal ? prevEbtVal / (parseNum(h0?.sales?.shares) || 200) : null);

    const newHeaders = [
      rawHeaders[0] || 'Métrica',
      `${prevYear} (Año anterior)`,
      rawHeaders[1] || `Guidance ${nextYear}E*`,
      `Cifra Proyectada ${nextYear}E`,
    ];

    const newRows = snippet.rows.map((row) => {
      const metric = Array.isArray(row) ? row[0] : (row.metric ?? row.name);
      const guidance = Array.isArray(row) ? row[1] : row.value;
      if (Array.isArray(row) && row.length >= 4) return row;

      const m = String(metric).toLowerCase();
      const g = String(guidance ?? '');

      let prevStr = '—';
      let projStr = '—';

      // 1. Net Sales / Ventas
      if (/sales|ventas|revenue/i.test(m)) {
        if (prevSalesVal) prevStr = fmtMoney(prevSalesVal);
        if (/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i.test(g)) {
          const pct = parseFloat(g.match(/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i)[1].replace(',', '.')) / 100;
          if (prevSalesVal) {
            const low = prevSalesVal * (1 - pct);
            const high = prevSalesVal * (1 + pct);
            projStr = `~${fmtMoney(low)} – ${fmtMoney(high)}`;
          } else {
            projStr = `En línea con ${prevYear}`;
          }
        } else if (/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i.test(g)) {
          const match = g.match(/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i);
          let p1 = parseFloat(match[1].replace(',', '.')) / 100;
          let p2 = parseFloat(match[2].replace(',', '.')) / 100;
          if (/decline|caída|descenso/i.test(g) || g.includes('(')) {
            p1 = -Math.abs(p1);
            p2 = -Math.abs(p2);
          }
          const minP = Math.min(p1, p2), maxP = Math.max(p1, p2);
          if (prevSalesVal) {
            projStr = `~${fmtMoney(prevSalesVal * (1 + minP))} – ${fmtMoney(prevSalesVal * (1 + maxP))}`;
          }
        }
      }
      // 2. EBT / Income Before Taxes / Operating Income
      else if (/income before|ebt|operating income|beneficio/i.test(m)) {
        if (prevEbtVal) prevStr = `${fmtMoney(prevEbtVal)} (adj)`;
        if (/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i.test(g)) {
          const match = g.match(/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i);
          let p1 = parseFloat(match[1].replace(',', '.')) / 100;
          let p2 = parseFloat(match[2].replace(',', '.')) / 100;
          if (/decline|caída|descenso/i.test(g) || g.includes('(')) {
            p1 = -Math.abs(p1);
            p2 = -Math.abs(p2);
          }
          const minP = Math.min(p1, p2), maxP = Math.max(p1, p2);
          if (prevEbtVal) {
            projStr = `~${fmtMoney(prevEbtVal * (1 + minP))} – ${fmtMoney(prevEbtVal * (1 + maxP))}`;
          }
        }
      }
      // 3. EPS / BPA
      else if (/eps|earnings per share|bpa/i.test(m)) {
        if (prevEpsVal) prevStr = fmtEps(prevEpsVal);
        if (/\$?([0-9.,]+)\s*(?:to|a|-)\s*\$?([0-9.,]+)/i.test(g) && !g.includes('%')) {
          const match = g.match(/\$?([0-9.,]+)\s*(?:to|a|-)\s*\$?([0-9.,]+)/i);
          projStr = `$${parseFloat(match[1].replace(',', '.'))} – $${parseFloat(match[2].replace(',', '.'))}`;
        } else if (/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i.test(g)) {
          const match = g.match(/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i);
          let p1 = parseFloat(match[1].replace(',', '.')) / 100;
          let p2 = parseFloat(match[2].replace(',', '.')) / 100;
          if (/decline|caída|descenso/i.test(g) || g.includes('(')) {
            p1 = -Math.abs(p1);
            p2 = -Math.abs(p2);
          }
          const minP = Math.min(p1, p2), maxP = Math.max(p1, p2);
          if (prevEpsVal) {
            projStr = `~${fmtEps(prevEpsVal * (1 + minP))} – ${fmtEps(prevEpsVal * (1 + maxP))}`;
          }
        }
      }
      // 4. Free Cash Flow
      else if (/free cash flow|fcf/i.test(m)) {
        prevStr = prevFcfVal ? (prevFcfAdjVal ? `${fmtMoney(prevFcfVal)} / ${fmtMoney(prevFcfAdjVal)} (adj)` : fmtMoney(prevFcfVal)) : '—';
        if (/\$([0-9.,]+)\s*B\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
          const match = g.match(/\$([0-9.,]+)\s*B\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
          const base = parseFloat(match[1].replace(',', '.')) * 1000;
          const pct = parseFloat(match[2].replace(',', '.')) / 100;
          projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
        } else if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
          const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
          const base = parseFloat(match[1].replace(',', '.'));
          const pct = parseFloat(match[2].replace(',', '.')) / 100;
          projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
        } else if (/100\s*%/i.test(g)) {
          projStr = prevEbtVal ? `~${fmtMoney(prevEbtVal * 0.75)} (conversión ~100 %)` : '~100 % conversión';
        }
      }
      // 5. Depreciation & Amortization
      else if (/depreciation|amorti/i.test(m)) {
        prevStr = '$705M';
        if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
          const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
          const base = parseFloat(match[1].replace(',', '.'));
          const pct = parseFloat(match[2].replace(',', '.')) / 100;
          projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
        }
      }
      // 6. Net Interest Expense
      else if (/interest/i.test(m)) {
        prevStr = '$230M';
        if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
          const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
          const base = parseFloat(match[1].replace(',', '.'));
          const pct = parseFloat(match[2].replace(',', '.')) / 100;
          projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
        } else if (/\$?([0-9.,]+)\s*M/i.test(g)) {
          projStr = g;
        }
      }
      // 7. Effective Tax Rate
      else if (/tax rate|impuesto|tasa/i.test(m)) {
        prevStr = '21.5 %';
        projStr = g;
      }
      // 8. Capital Expenditures / CAPEX
      else if (/capex|capital expend/i.test(m)) {
        prevStr = prevCapexVal ? fmtMoney(prevCapexVal) : '$717M';
        if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
          const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
          const base = parseFloat(match[1].replace(',', '.'));
          const pct = parseFloat(match[2].replace(',', '.')) / 100;
          projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
        }
      } else {
        projStr = g;
      }

      return [metric, prevStr, guidance, projStr];
    });

    return {
      ...snippet,
      headers: newHeaders,
      rows: newRows,
    };
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
    const bpaCagr = cagrPct / (100 - cagrPct) * 100;
    const lastPct = (1 - points[n - 1].shares / points[n - 2].shares) * 100;
    const bpaLast = lastPct / (100 - lastPct) * 100;
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

    const xPrev = xFor(n - 2), yPrev = yFor(points[n - 2].shares);
    parts.push(`<line x1="${xPrev.toFixed(1)}" y1="${yPrev.toFixed(1)}" x2="${xFor(n - 1).toFixed(1)}" y2="${yN.toFixed(1)}" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="6 4"/>`);
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
      if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
      else if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
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
      });
    };

    if (Array.isArray(debt.maturitySchedule)) {
      debt.maturitySchedule.forEach((entry) => {
        if (Array.isArray(entry?.items) && entry.items.length) entry.items.forEach((it) => pushItem(it, entry.year));
        else pushItem(entry, entry?.year);
      });
    } else if (debt.maturitySchedule && Array.isArray(debt.maturitySchedule.years)) {
      debt.maturitySchedule.years.forEach((entry) => {
        if (Array.isArray(entry?.items) && entry.items.length) entry.items.forEach((it) => pushItem(it, entry.year));
        else pushItem(entry, entry?.year);
      });
    }

    // Calendario XBRL de la SEC
    if (rawItems.length === 0 && Array.isArray(debt.maturityCalendar?.years)) {
      debt.maturityCalendar.years.forEach((entry) => pushItem({ ...entry, type: 'Deuda total' }));
    }

    if (rawItems.length === 0) {
      const snippetRows = debt.secSnippet?.rows || debt.secTable?.rows;
      if (Array.isArray(snippetRows) && snippetRows.length) {
        snippetRows.forEach((r) => {
          const rowArr = Array.isArray(r) ? r : [r.metric ?? r.name, r.value];
          const rowText = rowArr.join(' ');
          const name = String(rowArr[0] || '').trim();

          let yr = null;
          rowArr.slice(1).forEach((cellValue) => {
            if (yr != null) return;
            const yearMatch = String(cellValue ?? '').match(/\b(20\d\d)\b/);
            if (yearMatch) yr = parseInt(yearMatch[1], 10);
          });
          if (!Number.isFinite(yr)) return;

          let amount = NaN;
          rowArr.slice(1).forEach((cellValue) => {
            if (Number.isFinite(amount)) return;
            const text = String(cellValue ?? '');
            if (!/(\$|€|£|million|billion|\d[.,]\d)/i.test(text)) return;
            const parsed = parseAmount(cellValue);
            if (Number.isFinite(parsed) && parsed > 0) amount = parsed;
          });
          if (!Number.isFinite(amount) || amount <= 0) return;

          const rateMatch = rowText.match(/(\d+(?:[\.,]\d+)?)\s*%/);
          pushItem({
            year: yr,
            name,
            type: (name || 'Deuda total').replace(/^(\$|CAD|EUR|GBP)?\s*[\d.,]+\s*(?:billion|million|B|M)?\s*/i, '').replace(/\s+senior\s+notes/i, ' Notes').trim() || 'Deuda total',
            amount,
            interestRate: rateMatch ? parseFloat(rateMatch[1].replace(',', '.')) : null,
          });
        });
      }
    }

    // Regla estricta: el gráfico solo muestra los próximos 5 años
    const futureItems = rawItems.filter((it) => Number.isFinite(it.year) && it.year > maxYear && Number.isFinite(it.amount));
    const filtered = rawItems.filter((it) => Number.isFinite(it.year) && it.year >= minYear && it.year <= maxYear && Number.isFinite(it.amount) && it.amount > 0);
    if (filtered.length === 0) return '';

    const palette = ['#0284c7', '#d97706', '#7c3aed', '#059669', '#e11d48', '#0891b2', '#4f46e5', '#ea580c', '#475569'];
    const distinctTypes = [...new Set(filtered.map((it) => it.type || it.name))];
    const typeColorMap = new Map();
    if (distinctTypes.length <= 1) typeColorMap.set(distinctTypes[0] ?? 'Deuda total', '#f59e0b');
    else distinctTypes.forEach((t, i) => typeColorMap.set(t, palette[i % palette.length]));

    filtered.forEach((it) => {
      it.color = typeColorMap.get(it.type || it.name) || '#f59e0b';
    });

    const yearsMap = new Map();
    filtered.forEach((it) => {
      if (!yearsMap.has(it.year)) yearsMap.set(it.year, []);
      yearsMap.get(it.year).push(it);
    });

    const groupedYears = [];
    for (let yr = minYear; yr <= maxYear; yr += 1) {
      const items = yearsMap.get(yr) ?? [];
      const totalAmount = items.reduce((s, it) => s + it.amount, 0);
      const ratedItems = items.filter((it) => it.interestRate != null);
      const ratedAmount = ratedItems.reduce((s, it) => s + it.amount, 0);
      const averageRate = ratedAmount > 0 ? ratedItems.reduce((s, it) => s + it.amount * it.interestRate, 0) / ratedAmount : null;
      groupedYears.push({ year: yr, totalAmount, averageRate, items });
    }

    const allAmount = filtered.reduce((s, it) => s + it.amount, 0);
    const ratedItems = filtered.filter((it) => it.interestRate != null);
    const ratedAmount = ratedItems.reduce((s, it) => s + it.amount, 0);
    const totalAverageRate = ratedAmount > 0 ? ratedItems.reduce((s, it) => s + it.amount * it.interestRate, 0) / ratedAmount : null;
    let afterYearFive = parseAmount(debt.maturityAfterFive);
    if (!Number.isFinite(afterYearFive) && futureItems.length) afterYearFive = futureItems.reduce((s, it) => s + it.amount, 0);
    if (!Number.isFinite(afterYearFive)) afterYearFive = null;
    const max = Math.max(...groupedYears.map((y) => y.totalAmount), 1);

    const W = 640, H = 265, padL = 52, padR = 14, padT = 32, padB = 52;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
    const niceMax = Math.ceil(max / step) * step || max;
    const n = groupedYears.length;
    const slotW = plotW / n;
    const barW = Math.min(50, slotW * 0.65);
    const parts = [];

    // Leyenda
    let legX = padL;
    if (distinctTypes.length > 1) {
      distinctTypes.forEach((t) => {
        parts.push(`<rect x="${legX}" y="10" width="10" height="10" rx="2" fill="${typeColorMap.get(t)}"/>`);
        parts.push(`<text x="${legX + 13}" y="18" font-size="8.5" font-weight="700" fill="#334155">${escapeHtml(t)}</text>`);
        legX += (t.length * 5.2) + 26;
      });
    }

    // Líneas horizontales de cuadrícula
    for (let g = 0; g <= 3; g += 1) {
      const v = (niceMax * (3 - g)) / 3;
      const gy = padT + plotH * (1 - v / niceMax);
      parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
      parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
    }

    groupedYears.forEach((yr, i) => {
      const cx = padL + slotW * (i + 0.5);
      let curBaseline = padT + plotH;

      yr.items.forEach((it) => {
        const blockH = Math.max(3, (it.amount / niceMax) * plotH);
        const topY = curBaseline - blockH;
        parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${barW.toFixed(1)}" height="${blockH.toFixed(1)}" rx="2" fill="${it.color || '#f59e0b'}"/>`);
        if (blockH >= 12 && it.interestRate != null) {
          parts.push(`<text x="${cx.toFixed(1)}" y="${(topY + blockH / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#ffffff">${it.interestRate.toFixed(1).replace('.', ',')}%</text>`);
        }
        curBaseline = topY;
      });

      if (yr.totalAmount > 0) {
        parts.push(`<text x="${cx.toFixed(1)}" y="${(curBaseline - 12).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">$${yr.totalAmount.toFixed(1).replace('.', ',')}M</text>`);
        if (yr.averageRate != null) {
          parts.push(`<text x="${cx.toFixed(1)}" y="${(curBaseline - 2).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#c2410c">Media: ${yr.averageRate.toFixed(2).replace('.', ',')}%</text>`);
        }
      } else {
        parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#94a3b8">—</text>`);
      }
      parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${yr.year}</text>`);
    });

    const bannerY = H - 28;
    parts.push(`<rect x="${padL}" y="${bannerY}" width="${plotW}" height="22" rx="4" fill="#1e293b"/>`);
    const afterText = afterYearFive != null ? `  ·  Después del año 5: $${afterYearFive.toFixed(1).replace('.', ',')}M` : '';
    const bannerText = totalAverageRate != null
      ? `Tipo de interés medio total (próximos 5 años): ${totalAverageRate.toFixed(2).replace('.', ',')} %  ·  Deuda a amortizar: $${allAmount.toFixed(1).replace('.', ',')}M${afterText}`
      : `Deuda a amortizar en los próximos 5 años: $${allAmount.toFixed(1).replace('.', ',')}M${afterText}`;
    parts.push(`<text x="${(padL + plotW / 2).toFixed(1)}" y="${bannerY + 14.5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">${escapeHtml(bannerText)}</text>`);

    const title = `CALENDARIO DE VENCIMIENTOS DE DEUDA (PRÓXIMOS 5 AÑOS: ${minYear}–${maxYear})`;
    return `<div class="shares-chart"><div class="sc-title">${escapeHtml(title)}</div><svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg></div>`;
  }

  function renderDebtHistoryChart(debt, report) {
    const rawList = debt?.debtHistory || report?.edgarDebtHistory || report?.annualDebtHistory || null;
    if (!Array.isArray(rawList) || rawList.length < 2) return '';

    const parseNum = (val) => {
      if (val == null) return NaN;
      let s = String(val).replace(/[$€£\s]/g, '').trim();
      if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
      else if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
      return parseFloat(s);
    };

    const points = rawList
      .map((p) => ({
        year: Number(p?.year || (p?.periodEnd ? parseInt(String(p.periodEnd).slice(0, 4), 10) : null)),
        totalDebt: parseNum(p?.totalDebt),
        netDebt: parseNum(p?.netDebt),
      }))
      .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.totalDebt))
      .sort((a, b) => a.year - b.year)
      .slice(-10);

    if (points.length < 2) return '';

    points.forEach((p, i) => {
      if (i > 0) {
        const prev = points[i - 1];
        p.deltaTotalDebt = Number.isFinite(prev.totalDebt) ? Math.round((p.totalDebt - prev.totalDebt) * 10) / 10 : null;
        p.deltaNetDebt = (Number.isFinite(p.netDebt) && Number.isFinite(prev.netDebt)) ? Math.round((p.netDebt - prev.netDebt) * 10) / 10 : null;
      } else {
        p.deltaTotalDebt = null;
        p.deltaNetDebt = null;
      }
    });

    const allVals = points.flatMap((p) => [p.totalDebt, Number.isFinite(p.netDebt) ? p.netDebt : p.totalDebt]);
    const max = Math.max(...allVals) || 1;
    const W = 640, H = 260, padL = 52, padR = 14, padT = 32, padB = 44;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
    const niceMax = Math.ceil(max / step) * step || max;
    const n = points.length;
    const slotW = plotW / n;
    const groupW = Math.min(48, slotW * 0.76);
    const barW = (groupW - 4) / 2;
    const parts = [];

    parts.push(`<rect x="170" y="10" width="10" height="10" rx="2" fill="#1e40af"/>`);
    parts.push(`<text x="185" y="18" font-size="8.5" font-weight="700" fill="#334155">Deuda Normal / Total</text>`);
    parts.push(`<rect x="330" y="10" width="10" height="10" rx="2" fill="#d97706"/>`);
    parts.push(`<text x="345" y="18" font-size="8.5" font-weight="700" fill="#334155">Deuda Neta</text>`);

    for (let g = 0; g <= 3; g += 1) {
      const v = (niceMax * (3 - g)) / 3;
      const gy = padT + plotH * (1 - v / niceMax);
      parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
      parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
    }

    points.forEach((p, i) => {
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
        const dColor = p.deltaTotalDebt < 0 ? '#16a34a' : '#dc2626';
        const dSign = p.deltaTotalDebt > 0 ? '+' : '';
        parts.push(`<text x="${(cx - groupW / 2 + barW / 2).toFixed(1)}" y="${deltaY.toFixed(1)}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${dColor}">${dSign}${Math.round(p.deltaTotalDebt)}M</text>`);
      }
      if (p.deltaNetDebt != null) {
        const dColor = p.deltaNetDebt < 0 ? '#16a34a' : '#dc2626';
        const dSign = p.deltaNetDebt > 0 ? '+' : '';
        parts.push(`<text x="${(cx - groupW / 2 + barW + 4 + barW / 2).toFixed(1)}" y="${deltaY.toFixed(1)}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${dColor}">${dSign}${Math.round(p.deltaNetDebt)}M</text>`);
      }
    });

    const title = `EVOLUCIÓN DE LA DEUDA: NORMAL VS NETA (${points[0].year}–${points[points.length - 1].year})`;
    return `<div class="shares-chart"><div class="sc-title">${escapeHtml(title)}</div><svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg></div>`;
  }

  function renderDebtRefinancingCard(debt, report) {
    if (!debt) return '';
    let oldDebtRate = debt.refinancing?.oldDebtRate ?? null;
    let newDebtRate = debt.refinancing?.newDebtRate ?? debt.refinancing?.estimatedRefinancingRate ?? null;
    let amount = debt.refinancing?.amountRefinanced ?? debt.refinancing?.nearTermMaturities ?? null;

    const narrative = `${debt.refinancingAnalysis || ''} ${debt.refinancingImpact || ''} ${debt.text || ''}`;
    const parseLocaleNumber = (raw) => {
      let s = String(raw ?? '').trim();
      if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
      else if (s.includes(',')) s = s.replace(',', '.');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };
    if (oldDebtRate == null) {
      const patterns = [
        /(?:tipo anterior|antigua|vencida|vendida|retirada|emisi[oó]n original|original(?:es)?|devengaba|pagaba)[^.%]{0,60}?(\d+(?:[.,]\d+)?)\s*%/i,
        /(?:alrededor del|al)\s*(\d+(?:[.,]\d+)?)\s*%/i,
      ];
      for (const re of patterns) {
        const m = narrative.match(re);
        if (m) { oldDebtRate = parseLocaleNumber(m[1]); break; }
      }
    }
    if (newDebtRate == null) {
      const patterns = [
        /(?:nueva deuda|nueva emisi[oó]n|nuevo tipo|coste estimado|refinanciaci[oó]n)[^.%]{0,80}?(\d+(?:[.,]\d+)?)\s*%/i,
        /(?:mercado actual|nuevo coste|estima(?:mos|do)?)[^.%]{0,60}?(\d+(?:[.,]\d+)?)\s*%/i,
      ];
      for (const re of patterns) {
        const m = narrative.match(re);
        if (m) { newDebtRate = parseLocaleNumber(m[1]); break; }
      }
    }
    if (amount == null) {
      const m = narrative.match(/(?:vencen unos|vencen|nominal de|importe de|asciende a|deuda que vence[^.]{0,50}?)(?:~?\$?)([\d.,]+)\s*(?:M|mil millones|B)\b/i);
      if (m) {
        const parsed = parseLocaleNumber(m[1]);
        amount = /mil millones|B\b/i.test(m[0]) ? parsed * 1000 : parsed;
      }
    }

    let shares = null;
    const sharesRow = report?.horizons?.[0]?.sales?.shares;
    if (sharesRow) {
      const sMatch = String(sharesRow).match(/([\d\.,]+)\s*M/i);
      if (sMatch) shares = parseLocaleNumber(sMatch[1]);
    }
    if (!shares && report?.shares) shares = Number(report.shares);
    if (!shares && Array.isArray(report?.conclusion?.repurchases?.sharesHistory)) {
      const lastP = report.conclusion.repurchases.sharesHistory.slice(-1)[0];
      if (lastP?.shares) shares = Number(lastP.shares);
    }

    let interestDelta = null, netInterestDelta = null, epsImpact = null, epsText = null;
    if (Number.isFinite(oldDebtRate) && Number.isFinite(newDebtRate) && Number.isFinite(amount)) {
      const rateDiff = newDebtRate - oldDebtRate;
      interestDelta = Math.round((amount * (rateDiff / 100)) * 10) / 10;
      netInterestDelta = Math.round((interestDelta * (1 - 0.23)) * 10) / 10;
      if (shares && shares > 0) {
        epsImpact = Math.round((-netInterestDelta / shares) * 100) / 100;
      }
    }

    if (epsImpact != null) {
      const absEps = Math.abs(epsImpact).toFixed(2).replace('.', ',');
      if (epsImpact < 0) {
        epsText = `los nuevos costes suben reduciendo en torno a <strong>${absEps} $/acción</strong> el BPA (impacto: <strong>-${absEps} $/acc</strong>)`;
      } else {
        epsText = `los nuevos costes bajan en torno a <strong>${absEps} $/acción</strong> (impacto favorable en el BPA de <strong>+${absEps} $/acc</strong>)`;
      }
    }

    const hasRef = Number.isFinite(oldDebtRate) || Number.isFinite(newDebtRate) || debt.refinancingAnalysis || debt.refinancingImpact;
    if (!hasRef) return '';

    return `
      <div class="annual-calc-box" style="border-left-color:#ea580c;background:#fff7ed;">
        <strong style="color:#9a3412;">Refinanciación de deuda e impacto en BPA:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;">
          <div class="annual-badge"><strong>Tipo anterior:</strong> ${oldDebtRate != null ? `${oldDebtRate.toFixed(2).replace('.', ',')} %` : '—'}</div>
          <div class="annual-badge"><strong>Tipo nueva emisión:</strong> ${newDebtRate != null ? `${newDebtRate.toFixed(2).replace('.', ',')} %` : '—'}</div>
          <div class="annual-badge"><strong>Volumen:</strong> ${amount != null ? `$${Math.round(amount)}M` : '—'}</div>
          ${epsImpact != null ? `<div class="annual-badge badge-accent" style="background:#fed7aa;border-color:#fdba74;color:#7c2d12;"><strong>Impacto BPA:</strong> ${epsImpact >= 0 ? '+' : ''}${epsImpact.toFixed(2).replace('.', ',')} $/acc</div>` : ''}
        </div>
        ${debt.refinancingAnalysis ? `<p>${formatAnnualRichText(debt.refinancingAnalysis)}</p>` : ''}
        ${debt.refinancingImpact ? `<p class="calc-impact" style="color:#9a3412;"><strong>Impacto en costes e intereses:</strong> ${formatAnnualRichText(debt.refinancingImpact)}</p>` : ''}
        ${epsText ? `<p style="font-weight:600;color:#9a3412;margin-top:4px;">${epsText}</p>` : ''}
      </div>
    `;
  }

  function renderSecSnippet(snippet) {
    if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return '';
    const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
    const isOutlook = headers.some((h) => /guidance|outlook|proyectad/i.test(h)) || /guidance|outlook/i.test(snippet.title || '');

    const thead = headers.length
      ? `<thead><tr>${headers.map((h, i) => {
          const alignClass = i > 0 ? ' class="sec-th-num"' : '';
          return `<th${alignClass}>${escapeHtml(h)}</th>`;
        }).join('')}</tr></thead>`
      : '';
    const tbody = snippet.rows.map((row) => {
      const isArr = Array.isArray(row);
      const cells = isArr ? row : [row.metric ?? row.name, row.value];
      const rowText = cells.join(' ').toLowerCase();
      const isBuybackRow = rowText.includes('repurchased') || rowText.includes('recomprad');
      const isCostRow = rowText.includes('cost') || rowText.includes('coste') || rowText.includes('aggregate');

      const cellsHtml = cells.map((c, colIdx) => {
        let cls = '';
        if (isOutlook && cells.length >= 4) {
          if (colIdx === 0) cls = ' class="sec-col-metric"';
          else if (colIdx === 1) cls = ' class="sec-col-prev"';
          else if (colIdx === 2) cls = ' class="sec-col-guidance"';
          else if (colIdx === 3) cls = ' class="sec-col-proj"';
        } else {
          if (colIdx > 0 && isBuybackRow) cls = ' class="sec-highlight-yellow"';
          else if (colIdx > 0 && isCostRow) cls = ' class="sec-highlight-orange"';
          else if (colIdx > 0) cls = ' class="sec-col-num"';
        }
        const valStr = String(c ?? '');
        const formatted = colIdx > 0 ? boldNumbers(escapeHtml(valStr)) : escapeHtml(valStr);
        return `<td${cls}>${formatted}</td>`;
      }).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');

    return `
      <div class="sec-extract-card">
        <div class="sec-extract-head">
          <span class="sec-extract-tag">EXTRACTO OFICIAL SEC (FORM 10-K)</span>
          <strong class="sec-extract-title">${escapeHtml(snippet.title || 'Información Oficial SEC')}</strong>
          ${snippet.summary ? `<span class="sec-extract-summary">${escapeHtml(snippet.summary)}</span>` : ''}
        </div>
        <div class="sec-table-wrap">
          <table class="sec-table">
            ${thead}
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAnnualConclusion(conclusion, report) {
    if (!conclusion) return '';
    let html = `<div class="annual-conclusion-section">
      <div class="annual-conclusion-header">
        <h4>PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN</h4>
        <p class="annual-conclusion-subtitle">Análisis detallado de recompras, outlook oficial, deuda y asignación de capital</p>
      </div>`;

    // 1: Recompras
    const rep = conclusion.repurchases;
    if (rep) {
      const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
        ? rep.authorizationExpiry
        : null;
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(rep.title || '1: Recompras')}</h5>
          ${rep.text ? `<p class="annual-card-text">${formatAnnualRichText(rep.text)}</p>` : ''}
          <div class="annual-metric-badges">
            ${(rep.authorizationRemaining || rep.programRemaining) ? `<div class="annual-badge"><strong>Autorización restante:</strong> ${formatAnnualRichText(rep.authorizationRemaining || rep.programRemaining)}</div>` : ''}
            ${repExpiry ? `<div class="annual-badge"><strong>Vigencia:</strong> ${formatAnnualRichText(repExpiry)}</div>` : ''}
            ${rep.shareCountEvolution ? `<div class="annual-badge"><strong>Evolución de acciones:</strong> ${formatAnnualRichText(rep.shareCountEvolution)}</div>` : ''}
            ${rep.bpaImpact ? `<div class="annual-badge badge-accent"><strong>Impacto BPA:</strong> ${formatAnnualRichText(rep.bpaImpact)}</div>` : ''}
            ${rep.futureProjection ? `<div class="annual-badge"><strong>Proyección 5 años:</strong> ${formatAnnualRichText(rep.futureProjection)}</div>` : ''}
          </div>
          ${renderSharesChart(rep.sharesHistory)}
          ${renderSecSnippet(withAveragePrice(rep.secSnippet))}
        </div>
      `;
    }

    // 2: Outlook
    const out = conclusion.outlook;
    if (out) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(out.title || '2: Outlook')}</h5>
          ${out.text ? `<p class="annual-card-text">${formatAnnualRichText(out.text)}</p>` : ''}
          ${out.fcfAnalysis ? `<p class="annual-card-text"><strong>Análisis FCF:</strong> ${formatAnnualRichText(out.fcfAnalysis)}</p>` : ''}
          ${out.riskFactors ? `<p class="annual-card-text"><strong>Riesgos y Sensibilidad:</strong> ${formatAnnualRichText(out.riskFactors)}</p>` : ''}
          ${out.efficiencyPlans ? `<p class="annual-card-text"><strong>Programas de eficiencia:</strong> ${formatAnnualRichText(out.efficiencyPlans)}</p>` : ''}
          ${renderSecSnippet(withOutlookComparison(out.secSnippet, report))}
        </div>
      `;
    }

    // 3: Deuda
    const debt = conclusion.debt;
    if (debt) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(debt.title || '3: Deuda')}</h5>
          ${debt.text ? `<p class="annual-card-text">${formatAnnualRichText(debt.text)}</p>` : ''}
          ${renderDebtMaturityChart(debt, report?.fiscalYear)}
          ${renderDebtHistoryChart(debt, report)}
          ${renderDebtRefinancingCard(debt, report)}
          ${renderSecSnippet(debt.secSnippet)}
        </div>
      `;
    }

    // 4: Adquisiciones
    const acq = conclusion.acquisitions;
    if (acq) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(acq.title || '4: Adquisiciones')}</h5>
          <p class="annual-card-text">${formatAnnualRichText(acq.text || 'No se realizaron adquisiciones materiales durante el ejercicio.')}</p>
        </div>
      `;
    }

    // 5: Watchlist
    const watch = conclusion.watchlist;
    if (watch && Array.isArray(watch.items) && watch.items.length) {
      html += `
        <div class="annual-deepdive-card watchlist-card">
          <h5 class="annual-card-title">${escapeHtml(watch.title || 'Cosas a tener en cuenta')}</h5>
          <ul class="watchlist-list">
            ${watch.items.map((item) => `<li><span class="watchlist-check">✓</span> <span>${formatAnnualRichText(item)}</span></li>`).join('')}
          </ul>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  function renderAnnualRating(rating) {
    if (!rating || rating.score == null) return '';
    const score = Number(rating.score);
    const scoreColorClass = score >= 7 ? 'score-high' : (score >= 4 ? 'score-mid' : 'score-low');
    return `
      <div class="annual-rating-card ${scoreColorClass}">
        <div class="annual-rating-head">
          <span class="annual-rating-badge">${escapeHtml(rating.label || `NOTA DE RESULTADOS: ${score}`)}</span>
          <span class="annual-rating-score">${score} <small>/ 10</small></span>
        </div>
        <p class="annual-rating-rationale">${formatAnnualRichText(rating.rationale || '')}</p>
        <p class="annual-rating-disclaimer">Nota puramente financiera basada exclusivamente en las cuentas anuales, el outlook oficial y la asignación de capital ejecutada. Sin especulación sobre el cumplimiento futuro de expectativas.</p>
      </div>
    `;
  }

  function renderReport(report) {
    const horizons = Array.isArray(report.horizons) ? report.horizons : [];
    const titleParts = [report.ticker, report.periodTitle].filter(Boolean);
    const resultTitle = document.querySelector('#result-title');
    const reportBody = document.querySelector('#report-body');
    if (resultTitle) resultTitle.textContent = titleParts.length ? titleParts.join(' — ') : 'Informe generado';
    if (reportBody) {
      let html = horizons.map(renderHorizon).join('');
      if (report.conclusion) {
        html += renderAnnualConclusion(report.conclusion, report);
      }
      if (report.rating) {
        html += renderAnnualRating(report.rating);
      }
      const hintText = report.conclusion
        ? 'El informe anual 10-K incluye resumen de cuentas a 12 meses, indagación a fondo con extractos SEC, watchlist y nota de resultados.'
        : 'El informe descargable incluye los bloques completos en los dos horizontes.';
      html += `<p class="report-hint">${hintText} Disponible en PDF, Word (.docx) y ODT (.odt).</p>`;
      reportBody.innerHTML = html;
    }
  }

  function setFile(file) {
    if (!file) return;
    const dropzone = document.querySelector('#dropzone');
    const filePreview = document.querySelector('#file-preview');
    const fileName = document.querySelector('#file-name');
    const fileSize = document.querySelector('#file-size');
    const analyzeButton = document.querySelector('#analyze-button');

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      showToast('Selecciona un archivo PDF para continuar.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast('El archivo supera el límite de 25 MB.');
      return;
    }

    selectedFile = file;
    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatFileSize(file.size);
    if (dropzone) dropzone.hidden = true;
    if (filePreview) filePreview.hidden = false;
    if (analyzeButton) analyzeButton.disabled = false;
  }

  function clearFile() {
    selectedFile = null;
    const fileInput = document.querySelector('#file-input');
    const dropzone = document.querySelector('#dropzone');
    const filePreview = document.querySelector('#file-preview');
    const analyzeButton = document.querySelector('#analyze-button');

    if (fileInput) fileInput.value = '';
    if (dropzone) dropzone.hidden = false;
    if (filePreview) filePreview.hidden = true;
    if (analyzeButton) analyzeButton.disabled = true;
    clearPresentationFile();
  }

  function setPresentationFile(file) {
    if (!file) return;
    const presentationInput = document.querySelector('#presentation-input');
    const presentationPreview = document.querySelector('#presentation-preview');
    const presentationName = document.querySelector('#presentation-name');
    const presentationSize = document.querySelector('#presentation-size');
    const selectPresentation = document.querySelector('#select-presentation');

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      showToast('La presentación debe ser un archivo PDF.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast('La presentación supera el límite de 25 MB.');
      return;
    }

    selectedPresentation = file;
    if (presentationName) presentationName.textContent = file.name;
    if (presentationSize) presentationSize.textContent = formatFileSize(file.size);
    if (presentationPreview) presentationPreview.hidden = false;
    if (selectPresentation) selectPresentation.hidden = true;
    if (presentationInput) presentationInput.value = '';
  }

  function clearPresentationFile() {
    selectedPresentation = null;
    const presentationInput = document.querySelector('#presentation-input');
    const presentationPreview = document.querySelector('#presentation-preview');
    const selectPresentation = document.querySelector('#select-presentation');
    if (presentationInput) presentationInput.value = '';
    if (presentationPreview) presentationPreview.hidden = true;
    if (selectPresentation) selectPresentation.hidden = false;
  }

  function setAgentState(agent, state) {
    const row = document.querySelector(`[data-agent="${agent}"]`);
    if (!row) return;

    row.classList.remove('active', 'done', 'error');
    const stateLabel = row.querySelector('.agent-state');
    if (state === 'active') {
      row.classList.add('active');
      if (stateLabel) stateLabel.textContent = 'Procesando';
    }
    if (state === 'done') {
      row.classList.add('done');
      if (stateLabel) stateLabel.textContent = 'Completado';
    }
    if (state === 'error') {
      row.classList.add('error');
      if (stateLabel) stateLabel.textContent = 'Error';
    }
  }

  function resetAgentStates() {
    ['origin', 'sector', 'analyst'].forEach((agent) => {
      const row = document.querySelector(`[data-agent="${agent}"]`);
      if (!row) return;
      row.classList.remove('active', 'done', 'error');
      const stateLabel = row.querySelector('.agent-state');
      if (stateLabel) stateLabel.textContent = 'En espera';
    });
  }

  function startProcessingHints() {
    clearTimeout(processingHintTimer);
    const hints = [
      [45000, 'El análisis sigue en curso. Suele tardar entre 1 y 4 minutos.'],
      [240000, 'Esto está tardando más de lo habitual. Si no responde pronto, verás un mensaje de error claro para reintentar.'],
    ];
    hints.forEach(([delay, message]) => {
      processingHintTimer = setTimeout(() => {
        const processingPanel = document.querySelector('#processing-panel');
        const analysisError = document.querySelector('#analysis-error');
        const processingNote = document.querySelector('#processing-note');
        if (processingPanel?.hidden) return;
        if (analysisError && !analysisError.hidden) return;
        if (processingNote) processingNote.textContent = message;
      }, delay);
    });
  }

  function showAnalysisError(message, failedAgent = 'origin') {
    lastAnalysisFailed = true;
    clearTimeout(processingHintTimer);
    if (failedAgent === 'sector') setAgentState('origin', 'done');
    if (failedAgent === 'analyst') {
      setAgentState('origin', 'done');
      setAgentState('sector', 'done');
    }
    setAgentState(failedAgent, 'error');

    const errorBox = document.querySelector('#analysis-error');
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }
    const retryButton = document.querySelector('#retry-analysis');
    if (retryButton) {
      retryButton.textContent = 'Reintentar';
      retryButton.hidden = false;
    }
    const processingNote = document.querySelector('#processing-note');
    if (processingNote) processingNote.hidden = true;

    const processingTitle = document.querySelector('#processing-title');
    if (processingTitle) {
      processingTitle.textContent = failedAgent === 'sector'
        ? 'La empresa no es de consumo defensivo'
        : failedAgent === 'analyst'
          ? 'No se pudo generar el análisis'
          : 'No se pudo verificar el documento';
    }
    const progressBar = document.querySelector('#progress-bar');
    if (progressBar) progressBar.style.width = '100%';
    clearInterval(analysisTimer);
  }

  function startAnalysisUi(title) {
    clearInterval(analysisTimer);
    clearTimeout(processingHintTimer);
    let seconds = 1;

    const processingPanel = document.querySelector('#processing-panel');
    const resultPreview = document.querySelector('#result-preview');
    const uploadForm = document.querySelector('#upload-form');
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    const analysisError = document.querySelector('#analysis-error');
    const retryButton = document.querySelector('#retry-analysis');
    const processingNote = document.querySelector('#processing-note');
    const progressBar = document.querySelector('#progress-bar');
    const processingTitle = document.querySelector('#processing-title');
    const processingTime = document.querySelector('#processing-time');

    if (processingPanel) processingPanel.hidden = false;
    if (resultPreview) resultPreview.hidden = true;
    if (uploadForm) uploadForm.hidden = true;
    if (secAnalysisEntry) secAnalysisEntry.hidden = true;
    currentAnalysisId = null;
    loadAnalysisFeedback(null);
    resetAgentStates();
    if (analysisError) analysisError.hidden = true;
    if (retryButton) retryButton.hidden = true;
    if (processingNote) {
      processingNote.hidden = false;
      processingNote.textContent = 'El documento se verifica automáticamente antes de continuar.';
    }
    if (progressBar) progressBar.style.width = '20%';
    if (processingTitle) processingTitle.textContent = title;
    if (processingTime) processingTime.textContent = '00:01';
    setAgentState('origin', 'active');

    analysisTimer = setInterval(() => {
      seconds += 1;
      if (processingTime) processingTime.textContent = formatElapsed(seconds);
    }, 1000);
  }

  function failAnalysis(data) {
    const failedAgent = data.code === 'NOT_DEFENSIVE_CONSUMER' ? 'sector'
      : data.code === 'INVALID_MODEL_RESPONSE' || data.code === 'INVALID_REPORT_STRUCTURE' ? 'analyst'
        : 'origin';
    const message = data.error || 'No se pudo analizar el documento. Inténtalo de nuevo.';
    showAnalysisError(message, failedAgent);
    showToast(message);
  }

  function finishAnalysis(data) {
    clearTimeout(processingHintTimer);
    setAgentState('origin', 'done');
    setAgentState('sector', 'done');
    setAgentState('analyst', 'done');
    lastAnalysisFailed = false;

    const progressBar = document.querySelector('#progress-bar');
    if (progressBar) progressBar.style.width = '100%';
    const processingTitle = document.querySelector('#processing-title');
    if (processingTitle) processingTitle.textContent = 'Análisis completado: informe generado';
    clearInterval(analysisTimer);

    const retryButton = document.querySelector('#retry-analysis');
    if (retryButton) {
      retryButton.textContent = 'Analizar otro informe';
      retryButton.hidden = false;
    }

    currentPdfUrl = data.pdfUrl ?? null;
    currentDownloadBase = currentPdfUrl ? currentPdfUrl.replace(/\.pdf$/, '') : null;
    // Nombre del servidor: TIKR-AÑO-QX (10-Q) o TIKR-AÑO-K (10-K)
    currentDownloadName = data.downloadBase ?? 'analisis-cifra';
    renderReport(data.report ?? {});

    const resultPreview = document.querySelector('#result-preview');
    if (resultPreview) resultPreview.hidden = false;

    currentAnalysisId = data.analysisId ?? null;
    currentAnalysisTicker = data.report?.ticker || pendingFiling?.ticker || null;
    currentAnalysisAccession = pendingFiling?.accession || null;
    loadAnalysisFeedback(currentAnalysisId);

    const adminRegenBtn = document.querySelector('#admin-regenerate-report');
    if (adminRegenBtn) {
      const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || currentUser?.isAdmin);
      adminRegenBtn.hidden = !isAdmin;
    }

    const saved = data.saved && currentUser;
    showToast(`${saved ? 'Análisis guardado en tu histórico. ' : ''}${data.formType || 'Informe'} analizado con éxito.`);
    if (saved) {
      fetchAnalyses();
      fetchHistoryCompanies();
    }
  }

  /* ── Valoración de análisis y reporte de incidencias ────────── */
  function renderRatingState(userRating, ratingSummary) {
    currentUserRating = Number(userRating) || 0;
    const starBtns = document.querySelectorAll('#rating-stars .star-btn');
    starBtns.forEach((btn) => {
      const val = Number(btn.dataset.value);
      btn.classList.toggle('active', val <= currentUserRating);
      btn.classList.remove('hovered');
    });

    const summaryEl = document.querySelector('#rating-summary-text');
    if (!summaryEl) return;

    const count = Number(ratingSummary?.count) || 0;
    const avg = Number(ratingSummary?.average) || 0;

    if (count > 0) {
      const avgStr = avg.toFixed(1);
      const countStr = `${count} ${count === 1 ? 'valoración' : 'valoraciones'}`;
      if (currentUserRating > 0) {
        summaryEl.textContent = `${avgStr} ★ (${countStr}) · Tu nota: ${currentUserRating} ★`;
      } else {
        summaryEl.textContent = `${avgStr} ★ (${countStr})`;
      }
    } else if (currentUserRating > 0) {
      summaryEl.textContent = `Tu nota: ${currentUserRating} ★`;
    } else {
      summaryEl.textContent = 'Sé el primero en valorar este análisis';
    }
  }

  function highlightStars(val) {
    const starBtns = document.querySelectorAll('#rating-stars .star-btn');
    starBtns.forEach((btn) => {
      const v = Number(btn.dataset.value);
      btn.classList.toggle('hovered', v <= val);
    });
  }

  function clearStarHighlights() {
    const starBtns = document.querySelectorAll('#rating-stars .star-btn');
    starBtns.forEach((btn) => btn.classList.remove('hovered'));
  }

  async function loadAnalysisFeedback(analysisId) {
    const feedbackBar = document.querySelector('#analysis-feedback-bar');
    if (!feedbackBar) return;
    if (!analysisId) {
      feedbackBar.hidden = true;
      return;
    }
    feedbackBar.hidden = false;
    renderRatingState(0, null);
    const summaryEl = document.querySelector('#rating-summary-text');
    if (summaryEl) summaryEl.textContent = 'Cargando valoraciones...';

    try {
      const response = await fetch(`/api/analyses/${analysisId}/rating`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        renderRatingState(data.userRating, data.ratingSummary);
      } else {
        if (summaryEl) summaryEl.textContent = '';
      }
    } catch {
      if (summaryEl) summaryEl.textContent = '';
    }
  }

  async function submitRating(rating) {
    if (!currentAnalysisId) return;
    try {
      const response = await fetch(`/api/analyses/${currentAnalysisId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        renderRatingState(data.userRating ?? rating, data.ratingSummary);
        showToast(`¡Gracias! Has valorado este análisis con ${rating} ${rating === 1 ? 'estrella' : 'estrellas'}.`);
      } else {
        showToast(data.error || 'No se pudo registrar la valoración.');
      }
    } catch {
      showToast('Error al registrar la valoración.');
    }
  }

  let analysisAttachmentMgr = null;

  function openErrorReportModal() {
    const modal = document.querySelector('#error-report-modal-backdrop');
    if (!modal) return;
    modal.hidden = false;
    const desc = document.querySelector('#error-report-desc');
    if (desc) {
      desc.value = '';
      setTimeout(() => desc.focus(), 60);
    }
    analysisAttachmentMgr?.clear();
  }

  function closeErrorReportModal() {
    const modal = document.querySelector('#error-report-modal-backdrop');
    if (modal) modal.hidden = true;
  }

  async function submitErrorReport(event) {
    event.preventDefault();
    if (!currentAnalysisId) {
      showToast('No hay ningún análisis seleccionado para reportar.');
      return;
    }
    const category = document.querySelector('#error-report-category')?.value || 'other';
    const descInput = document.querySelector('#error-report-desc');
    const description = descInput?.value?.trim() || '';
    const images = analysisAttachmentMgr?.getImages() || [];

    if (!description) {
      showToast('Por favor, describe detalladamente la incidencia detectada.');
      descInput?.focus();
      return;
    }
    const submitBtn = document.querySelector('#error-report-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }
    try {
      const response = await fetch(`/api/analyses/${currentAnalysisId}/report-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description, images }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        closeErrorReportModal();
        showToast('Incidencia reportada con éxito. ¡Gracias por tu colaboración!');
      } else {
        showToast(data.error || 'No se pudo enviar el reporte.');
      }
    } catch {
      showToast('Error de red al enviar el reporte.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar reporte';
      }
    }
  }

  async function runRealAnalysis() {
    const fileInput = document.querySelector('#file-input');
    if (!selectedFile) {
      if (fileInput?.files && fileInput.files[0]) {
        setFile(fileInput.files[0]);
      } else {
        showToast('Selecciona un archivo PDF antes de iniciar el análisis.');
        return;
      }
    }

    pendingFiling = null;
    startAnalysisUi('Verificando el documento...');
    startProcessingHints();

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (selectedPresentation) formData.append('presentation', selectedPresentation);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        failAnalysis(data);
        return;
      }

      finishAnalysis(data);
    } catch {
      showAnalysisError('No se pudo conectar con el servidor. Comprueba que esté en marcha.');
    }
  }

  async function runFilingAnalysis(ticker, accession, options = {}) {
    const isForce = Boolean(options.force);
    pendingFiling = { ticker, accession };
    currentAnalysisTicker = ticker;
    currentAnalysisAccession = accession;
    startAnalysisUi(isForce ? `Regenerando informe de ${ticker} con IA…` : `Analizando el informe de ${ticker}…`);
    const processingNote = document.querySelector('#processing-note');
    if (processingNote) {
      processingNote.textContent = isForce
        ? 'Eliminando el informe anterior y volviendo a analizar desde SEC EDGAR con IA.'
        : 'Informe de SEC EDGAR. Verificación y extracción de señales financieras con IA.';
    }
    startProcessingHints();

    try {
      const endpoint = isForce
        ? `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/regenerate`
        : `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/analyze`;

      const response = await fetch(endpoint, { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        failAnalysis(data);
        return;
      }

      finishAnalysis(data);
      if (isForce) {
        showToast('Informe regenerado con éxito. Se ha eliminado el informe anterior.');
      }
    } catch {
      showAnalysisError('No se pudo conectar con el servidor. Comprueba que esté en marcha.');
    }
  }

  function downloadReport(format, baseUrl = currentDownloadBase, name = currentDownloadName) {
    if (!baseUrl || !['pdf', 'docx', 'odt'].includes(format)) return;
    const link = document.createElement('a');
    const safeName = encodeURIComponent(name || 'analisis-cifra');
    link.href = `${baseUrl}.${format}?download=1&name=${safeName}`;
    link.download = `${name}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function viewHistoryAnalysis(row) {
    const id = row?.dataset?.id;
    const url = row?.dataset?.pdfUrl;
    if (!id || !url) return;
    try {
      const response = await fetch(`/api/analyses/${id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis?.report) {
        showToast('No se pudo cargar el análisis guardado.');
        return;
      }
      const analysis = data.analysis;
      currentPdfUrl = analysis.pdf_url ?? url;
      currentDownloadBase = currentPdfUrl ? currentPdfUrl.replace(/\.pdf$/, '') : null;
      currentDownloadName = analysis.downloadBase ?? 'analisis-cifra';
      const titleParts = [analysis.company_name || analysis.ticker, analysis.periodTitle].filter(Boolean);
      const resultTitle = document.querySelector('#result-title');
      if (resultTitle) resultTitle.textContent = titleParts.length ? titleParts.join(' — ') : 'Informe guardado';
      renderReport(analysis.report ?? {});

      currentAnalysisId = analysis.id ? Number(analysis.id) : (Number(id) || null);
      currentAnalysisTicker = analysis.ticker || analysis.report?.ticker || null;
      currentAnalysisAccession = analysis.accession || null;
      loadAnalysisFeedback(currentAnalysisId);

      const adminRegenBtn = document.querySelector('#admin-regenerate-report');
      if (adminRegenBtn) {
        const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || currentUser?.isAdmin);
        adminRegenBtn.hidden = !isAdmin;
      }

      const processingPanel = document.querySelector('#processing-panel');
      if (processingPanel) processingPanel.hidden = true;
      const retryButton = document.querySelector('#retry-analysis');
      if (retryButton) retryButton.hidden = true;
      const uploadForm = document.querySelector('#upload-form');
      if (uploadForm) uploadForm.hidden = true;
      const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
      if (secAnalysisEntry) secAnalysisEntry.hidden = true;
      const resultPreview = document.querySelector('#result-preview');
      if (resultPreview) resultPreview.hidden = false;
      resultPreview?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      showToast('No se pudo conectar con el servidor.');
    }
  }

  function historyQuery() {
    const historyCompanyInput = document.querySelector('#history-company');
    const historyFromInput = document.querySelector('#history-from');
    const historyToInput = document.querySelector('#history-to');
    const dateType = document.querySelector('input[name="history-date-type"]:checked')?.value ?? 'period';
    const params = new URLSearchParams();
    const ticker = historyCompanyInput?.value?.trim();
    if (ticker) params.set('ticker', ticker);
    if (historyFromInput?.value) params.set(dateType === 'period' ? 'periodFrom' : 'createdFrom', historyFromInput.value);
    if (historyToInput?.value) params.set(dateType === 'period' ? 'periodTo' : 'createdTo', historyToInput.value);
    return params;
  }

  function historySortValue(analysis, key) {
    switch (key) {
      case 'document': return String(analysis.downloadBase || analysis.pdf_url || '').toLowerCase();
      case 'company': return String(analysis.companyName || analysis.ticker || '').toLowerCase();
      case 'period': return String(analysis.periodTitle || '').toLowerCase();
      case 'period_end': return analysis.period_end ?? '';
      case 'created_at': return analysis.created_at ?? '';
      default: return '';
    }
  }

  function sortHistoryList(list) {
    const { key, dir } = historySort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = historySortValue(a, key);
      const vb = historySortValue(b, key);
      if (va === '' && vb !== '') return 1;
      if (vb === '' && va !== '') return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }

  function updateHistorySortHeaders() {
    document.querySelectorAll('#history-table th[data-sort]').forEach((th) => {
      th.classList.toggle('sorted-asc', th.dataset.sort === historySort.key && historySort.dir === 'asc');
      th.classList.toggle('sorted-desc', th.dataset.sort === historySort.key && historySort.dir === 'desc');
    });
  }

  function renderHistory(analyses) {
    historyAnalyses = Array.isArray(analyses) ? analyses : [];
    const historyBody = document.querySelector('#history-body');
    const historyFilters = document.querySelector('#history-filters');
    const historyEmpty = document.querySelector('#history-empty');
    const historyEmptyText = document.querySelector('#history-empty-text');
    const historyLoginButton = document.querySelector('#history-login');
    const historyCompanyInput = document.querySelector('#history-company');
    const historyFromInput = document.querySelector('#history-from');
    const historyToInput = document.querySelector('#history-to');

    if (!historyBody) return;

    if (!currentUser) {
      if (historyFilters) historyFilters.hidden = true;
      historyBody.innerHTML = '';
      if (historyEmpty) historyEmpty.hidden = false;
      if (historyEmptyText) historyEmptyText.textContent = 'Inicia sesión para guardar tus análisis y consultarlos aquí.';
      if (historyLoginButton) historyLoginButton.hidden = false;
      return;
    }

    if (historyLoginButton) historyLoginButton.hidden = true;
    if (historyFilters) historyFilters.hidden = false;

    if (!historyAnalyses.length) {
      historyBody.innerHTML = '';
      if (historyEmpty) historyEmpty.hidden = false;
      if (historyEmptyText) {
        historyEmptyText.textContent = (historyCompanyInput?.value || historyFromInput?.value || historyToInput?.value)
          ? 'No hay análisis que coincidan con los filtros.'
          : 'Aún no tienes análisis guardados. Sube un 10-Q o 10-K y aparecerá aquí.';
      }
      return;
    }

    if (historyEmpty) historyEmpty.hidden = true;
    updateHistorySortHeaders();
    historyBody.innerHTML = sortHistoryList(historyAnalyses).map((analysis) => {
      const ticker = String(analysis.ticker ?? '').toUpperCase();
      const company = analysis.companyName || ticker || '—';
      const periodTitle = analysis.periodTitle || '—';
      const docName = analysis.downloadBase ? `${analysis.downloadBase}.pdf` : (analysis.filename ?? 'informe.pdf');
      const tickerInitial = (ticker || company || '?').slice(0, 1).toUpperCase();
      const status = analysis.status === 'done'
        ? '<span class="table-status done"><i></i> Completado</span>'
        : `<span class="table-status warning"><i></i> ${escapeHtml(analysis.status === 'processing' ? 'Procesando' : 'Error')}</span>`;
      const fileBaseUrl = analysis.pdf_url ? String(analysis.pdf_url).replace(/\.pdf$/, '') : '';
      const downloadName = analysis.downloadBase || 'analisis-cifra';
      return `
        <tr data-id="${escapeHtml(analysis.id)}" data-pdf-url="${escapeHtml(analysis.pdf_url ?? '')}" data-download-base="${escapeHtml(fileBaseUrl)}" data-download-name="${escapeHtml(downloadName)}" tabindex="0" title="${escapeHtml(analysis.filename ?? '')}">
          <td><span class="table-file" data-letter="${escapeHtml(tickerInitial)}">${ticker ? `<img class="table-file-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(ticker)}.webp" alt="" loading="lazy">` : ''}</span><strong>${escapeHtml(docName)}</strong></td>
          <td><strong>${escapeHtml(company)}</strong> ${ticker ? `<span class="td-ticker">${escapeHtml(ticker)}</span>` : ''}</td>
          <td>${escapeHtml(periodTitle)}</td>
          <td>${formatHistoryDate(analysis.period_end)}</td>
          <td>${formatHistoryDate(analysis.created_at)}</td>
          <td>${status}</td>
          <td>
            <div class="history-actions">
              ${ticker ? `<a class="row-action" href="/api/analyses/${encodeURIComponent(analysis.id)}/source" target="_blank" rel="noopener" title="Ver el informe original en SEC EDGAR" aria-label="Ver informe original en la SEC">SEC</a>` : ''}
              ${analysis.pdf_url ? `<button class="row-action" type="button" data-action="view" title="Ver el análisis en la web" aria-label="Ver análisis">Ver</button>` : ''}
              ${analysis.pdf_url ? `<button class="row-action" type="button" data-action="pdf" title="Descargar PDF" aria-label="Descargar PDF">PDF</button>` : ''}
              ${analysis.pdf_url ? `<button class="row-action" type="button" data-action="docx" title="Descargar Word (.docx)" aria-label="Descargar Word">DOCX</button>` : ''}
              ${analysis.pdf_url ? `<button class="row-action" type="button" data-action="odt" title="Descargar ODT" aria-label="Descargar ODT">ODT</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    historyBody.querySelectorAll('.table-file-logo').forEach((img) => {
      img.addEventListener('error', () => {
        const span = img.closest('.table-file');
        if (span) span.textContent = span.dataset.letter || '?';
      });
    });

    historyBody.querySelectorAll('tr[data-pdf-url]').forEach((row) => {
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.target.closest('button') && !event.target.closest('a')) viewHistoryAnalysis(row);
      });
    });
  }

  async function fetchHistoryCompanies() {
    if (!currentUser) {
      historyCompanies = [];
      closeHistorySuggestions();
      return;
    }
    try {
      const response = await fetch('/api/analyses/companies');
      const data = await response.json().catch(() => ({}));
      if (response.ok) historyCompanies = Array.isArray(data.companies) ? data.companies : [];
    } catch (error) {
      console.error('[history-suggest]', error?.message ?? error);
    }
  }

  function closeHistorySuggestions() {
    if (historySuggest) {
      historySuggest.hidden = true;
      historySuggest.innerHTML = '';
    }
    historySuggestIndex = -1;
  }

  function selectHistorySuggestion(ticker) {
    const historyCompanyInput = document.querySelector('#history-company');
    if (historyCompanyInput) historyCompanyInput.value = ticker;
    closeHistorySuggestions();
    historyCompanyInput?.focus();
    clearTimeout(historyDebounceTimer);
    fetchAnalyses();
  }

  function moveHistorySuggestion(delta) {
    if (!historySuggest || historySuggest.hidden) return;
    const options = historySuggest.querySelectorAll('.history-suggest-option');
    if (!options.length) return;
    historySuggestIndex = (historySuggestIndex + delta + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle('active', index === historySuggestIndex));
    options[historySuggestIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function renderHistorySuggestions() {
    const historyCompanyInput = document.querySelector('#history-company');
    if (!historySuggest || !historyCompanyInput) return;

    const query = historyCompanyInput.value.trim().toLowerCase();
    if (!historyCompanies.length) {
      closeHistorySuggestions();
      return;
    }

    const matches = (query
      ? historyCompanies.filter((company) =>
        (company.ticker ?? '').toLowerCase().includes(query)
        || (company.companyName ?? '').toLowerCase().includes(query))
      : historyCompanies)
      .slice(0, 12);

    if (!matches.length) {
      historySuggest.innerHTML = '<div class="history-suggest-empty">Sin coincidencias en tus análisis</div>';
      historySuggest.hidden = false;
      historySuggestIndex = -1;
      return;
    }

    historySuggest.innerHTML = matches.map((company) => {
      const ticker = String(company.ticker ?? '').toUpperCase();
      const name = company.companyName || ticker;
      const letter = (ticker || name || '?').slice(0, 1).toUpperCase();
      return `
        <button class="history-suggest-option" type="button" data-ticker="${escapeHtml(ticker)}">
          <span class="table-file" data-letter="${escapeHtml(letter)}">${ticker ? `<img class="table-file-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(ticker)}.webp" alt="" loading="lazy">` : ''}</span>
          <span class="history-suggest-name">${escapeHtml(name)}</span>
          ${ticker ? `<strong class="history-suggest-ticker">${escapeHtml(ticker)}</strong>` : ''}
          <span class="history-suggest-count" title="Análisis guardados de esta empresa">${company.total ?? 1}</span>
        </button>
      `;
    }).join('');

    historySuggest.querySelectorAll('.table-file-logo').forEach((img) => {
      img.addEventListener('error', () => {
        const span = img.closest('.table-file');
        if (span) span.textContent = span.dataset.letter || '?';
      });
    });

    historySuggest.querySelectorAll('.history-suggest-option').forEach((option) => {
      option.addEventListener('click', () => selectHistorySuggestion(option.dataset.ticker));
      option.addEventListener('mousemove', () => {
        historySuggest.querySelectorAll('.history-suggest-option').forEach((item) => item.classList.remove('active'));
        option.classList.add('active');
        historySuggestIndex = Array.from(historySuggest.querySelectorAll('.history-suggest-option')).indexOf(option);
      });
    });

    historySuggest.hidden = false;
    historySuggestIndex = -1;
  }

  async function fetchAnalyses() {
    if (!currentUser) {
      renderHistory([]);
      return;
    }
    try {
      const response = await fetch(`/api/analyses?${historyQuery().toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) renderHistory(data.analyses ?? []);
    } catch {
      renderHistory([]);
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    const historyCompanyLabel = document.querySelector('.history-company');
    if (historyCompanyLabel && !document.querySelector('#history-suggest')) {
      historySuggest = document.createElement('div');
      historySuggest.className = 'history-suggest';
      historySuggest.id = 'history-suggest';
      historySuggest.hidden = true;
      historyCompanyLabel.appendChild(historySuggest);
    }

    const fileInput = document.querySelector('#file-input');
    const dropzone = document.querySelector('#dropzone');
    const selectFileButton = document.querySelector('#select-file');
    const removeFileButton = document.querySelector('#remove-file');
    const uploadForm = document.querySelector('#upload-form');
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    const retryAnalysis = document.querySelector('#retry-analysis');
    const reportDownload = document.querySelector('#report-download');
    const newAnalysis = document.querySelector('#new-analysis');
    const historyRefresh = document.querySelector('#history-refresh');
    const historyCompanyInput = document.querySelector('#history-company');
    const historyFromInput = document.querySelector('#history-from');
    const historyToInput = document.querySelector('#history-to');
    const historyClear = document.querySelector('#history-clear');
    const historyLoginButton = document.querySelector('#history-login');

    selectFileButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      fileInput?.click();
    });

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput?.click();
      }
    });

    fileInput?.addEventListener('change', (event) => {
      if (event.target.files && event.target.files[0]) {
        setFile(event.target.files[0]);
      }
    });

    document.querySelector('#select-presentation')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.querySelector('#presentation-input')?.click();
    });

    document.querySelector('#presentation-input')?.addEventListener('change', (event) => {
      if (event.target.files && event.target.files[0]) {
        setPresentationFile(event.target.files[0]);
      }
    });

    document.querySelector('#remove-presentation')?.addEventListener('click', (event) => {
      event.stopPropagation();
      clearPresentationFile();
    });

    removeFileButton?.addEventListener('click', clearFile);

    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.add('dragging');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.remove('dragging');
        });
      });

      dropzone.addEventListener('drop', (event) => {
        if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
          setFile(event.dataTransfer.files[0]);
        }
      });
    }

    uploadForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      runRealAnalysis();
    });

    retryAnalysis?.addEventListener('click', () => {
      const processingPanel = document.querySelector('#processing-panel');
      if (processingPanel) processingPanel.hidden = true;
      if (uploadForm) uploadForm.hidden = true;
      if (secAnalysisEntry) secAnalysisEntry.hidden = !pendingFiling;
      if (pendingFiling) {
        runFilingAnalysis(pendingFiling.ticker, pendingFiling.accession);
        return;
      }
      if (!lastAnalysisFailed) clearFile();
    });

    document.querySelectorAll('.result-actions [data-format]').forEach((button) => {
      button.addEventListener('click', () => downloadReport(button.dataset.format));
    });

    newAnalysis?.addEventListener('click', () => {
      const resultPreview = document.querySelector('#result-preview');
      if (resultPreview) resultPreview.hidden = true;
      if (uploadForm) uploadForm.hidden = true;
      if (secAnalysisEntry) secAnalysisEntry.hidden = false;
      pendingFiling = null;
      currentAnalysisId = null;
      loadAnalysisFeedback(null);
      clearFile();
      document.querySelector('#nuevo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    historyRefresh?.addEventListener('click', fetchAnalyses);

    document.querySelectorAll('#history-table th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        historySort = key === historySort.key
          ? { key, dir: historySort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: key === 'created_at' || key === 'period_end' ? 'desc' : 'asc' };
        updateHistorySortHeaders();
        renderHistory(historyAnalyses);
      });
    });

    historyCompanyInput?.addEventListener('input', () => {
      renderHistorySuggestions();
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = setTimeout(fetchAnalyses, 300);
    });

    historyCompanyInput?.addEventListener('focus', renderHistorySuggestions);

    historyCompanyInput?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveHistorySuggestion(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveHistorySuggestion(-1);
      } else if (event.key === 'Enter') {
        const options = historySuggest && !historySuggest.hidden
          ? historySuggest.querySelectorAll('.history-suggest-option')
          : [];
        if (options.length) {
          event.preventDefault();
          const selected = options[Math.max(historySuggestIndex, 0)];
          selectHistorySuggestion(selected.dataset.ticker);
        }
      } else if (event.key === 'Escape') {
        closeHistorySuggestions();
      }
    });

    document.addEventListener('click', (event) => {
      if (historySuggest && !historySuggest.contains(event.target) && event.target !== historyCompanyInput) {
        closeHistorySuggestions();
      }
    });

    [historyFromInput, historyToInput].forEach((input) => {
      input?.addEventListener('change', fetchAnalyses);
    });

    document.querySelectorAll('input[name="history-date-type"]').forEach((radio) => {
      radio.addEventListener('change', fetchAnalyses);
    });

    historyClear?.addEventListener('click', () => {
      if (historyCompanyInput) historyCompanyInput.value = '';
      if (historyFromInput) historyFromInput.value = '';
      if (historyToInput) historyToInput.value = '';
      const radio = document.querySelector('input[name="history-date-type"][value="period"]');
      if (radio) radio.checked = true;
      closeHistorySuggestions();
      fetchAnalyses();
    });

    historyLoginButton?.addEventListener('click', () => {
      document.querySelector('#auth-login')?.click();
    });

    document.addEventListener('click', (event) => {
      const actionButton = event.target.closest('#history-body tr[data-pdf-url] [data-action]');
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const row = actionButton.closest('tr');
        const action = actionButton.dataset.action;
        if (action === 'view') {
          viewHistoryAnalysis(row);
        } else {
          downloadReport(action, row.dataset.downloadBase, row.dataset.downloadName);
        }
        return;
      }
      const row = event.target.closest('#history-body tr[data-pdf-url]');
      if (row && !event.target.closest('button') && !event.target.closest('a')) {
        viewHistoryAnalysis(row);
      }
    });

    // Configuración de estrellas de valoración
    const ratingStarsWrap = document.querySelector('#rating-stars');
    if (ratingStarsWrap) {
      ratingStarsWrap.querySelectorAll('.star-btn').forEach((btn) => {
        btn.addEventListener('mouseenter', () => highlightStars(Number(btn.dataset.value)));
        btn.addEventListener('click', () => submitRating(Number(btn.dataset.value)));
      });
      ratingStarsWrap.addEventListener('mouseleave', clearStarHighlights);
    }

    // Botón de regeneración para administradores
    const adminRegenerateBtn = document.querySelector('#admin-regenerate-report');
    adminRegenerateBtn?.addEventListener('click', async () => {
      const ticker = currentAnalysisTicker || pendingFiling?.ticker;
      const accession = currentAnalysisAccession || pendingFiling?.accession;
      if (!ticker || !accession) {
        if (currentAnalysisId) {
          if (!confirm('¿Deseas volver a generar este informe con IA?\n\n⚠️ Se eliminará el informe actual y se volverá a analizar desde SEC EDGAR.')) {
            return;
          }
          startAnalysisUi('Regenerando informe con IA…');
          try {
            const res = await fetch(`/api/admin/reports/ai-analysis/${currentAnalysisId}/regenerate`, { method: 'POST' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              showToast(json.error || 'No se pudo regenerar el informe.');
              return;
            }
            finishAnalysis(json);
            showToast('Informe regenerado con éxito.');
          } catch {
            showToast('Error al conectar con el servidor.');
          }
          return;
        }
        showToast('No se dispone de los datos de este informe para regenerarlo.');
        return;
      }

      if (!confirm(`¿Deseas volver a generar el informe de ${ticker} (${accession}) con IA?\n\n⚠️ Se eliminará el informe anterior y se generará uno nuevo desde SEC EDGAR.`)) {
        return;
      }
      runFilingAnalysis(ticker, accession, { force: true });
    });

    // Configuración de reporte de incidencias
    const reportErrorTrigger = document.querySelector('#report-error-trigger');
    reportErrorTrigger?.addEventListener('click', () => {
      if (!currentAnalysisId) {
        showToast('No hay ningún análisis seleccionado para reportar.');
        return;
      }
      openErrorReportModal();
    });

    const reportClose = document.querySelector('#error-report-modal-close');
    reportClose?.addEventListener('click', closeErrorReportModal);
    const reportCancel = document.querySelector('#error-report-cancel-btn');
    reportCancel?.addEventListener('click', closeErrorReportModal);
    const reportBackdrop = document.querySelector('#error-report-modal-backdrop');
    reportBackdrop?.addEventListener('click', (event) => {
      if (event.target === reportBackdrop) closeErrorReportModal();
    });

    const reportForm = document.querySelector('#error-report-form');
    reportForm?.addEventListener('submit', submitErrorReport);

    if (window.ReportsModule) {
      analysisAttachmentMgr = window.ReportsModule.createImageAttachmentManager({
        dropzoneEl: document.querySelector('#analysis-report-dropzone'),
        inputEl: document.querySelector('#analysis-report-file-input'),
        previewEl: document.querySelector('#analysis-report-previews'),
        maxImages: 5,
      });
    }

    window.addEventListener('paste', (event) => {
      const modal = document.querySelector('#error-report-modal-backdrop');
      if (modal && !modal.hidden && analysisAttachmentMgr) {
        const handled = analysisAttachmentMgr.handlePasteEvent(event);
        if (handled) showToast('Captura de pantalla pegada.');
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const modal = document.querySelector('#error-report-modal-backdrop');
        if (modal && !modal.hidden) closeErrorReportModal();
      }
    });
  }

  function setAuthenticated(isLogged) {
    currentUser = Boolean(isLogged);
    fetchHistoryCompanies();
    fetchAnalyses();
  }

  window.addEventListener('auth:change', (event) => {
    setAuthenticated(Boolean(event.detail?.user));
  });

  window.AnalysisModule = {
    init,
    runFilingAnalysis,
    fetchAnalyses,
    setAuthenticated,
  };
})();
