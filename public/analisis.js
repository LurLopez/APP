/* ── Módulo de Análisis Fundamental (Cifra Terminal) ─────────────────────── */

(function () {
  'use strict';

  let selectedFile = null;
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
    return String(text ?? '').replace(/([~±\-+]\s*)?\d[\d.,]*\s*(?:M|%|\$)?/g, (m) => `<strong>${m}</strong>`);
  }

  function renderSharesChart(sharesHistory) {
    if (!Array.isArray(sharesHistory) || !sharesHistory.length) return '';
    const points = sharesHistory
      .map((h) => ({ year: String(h?.year ?? ''), shares: Number(h?.shares) }))
      .filter((p) => p.year && Number.isFinite(p.shares) && p.shares > 0);
    if (points.length < 2) return '';
    const max = Math.max(...points.map((p) => p.shares));
    const last = points[points.length - 1];
    const n = points.length;
    const cagrPct = (1 - Math.pow(points[n - 1].shares / points[0].shares, 1 / (n - 1))) * 100;
    const bpaCagr = cagrPct / (100 - cagrPct) * 100;
    const lastPct = (1 - points[n - 1].shares / points[n - 2].shares) * 100;
    const bpaLast = lastPct / (100 - lastPct) * 100;
    const fmtPct = (p) => `${p < 0 ? '' : '-'}${p.toFixed(1).replace('.', ',')} %`;
    const fmtBpa = (p) => `+${p.toFixed(1).replace('.', ',')} %`;
    const chartTitle = points.length >= 5
      ? 'EVOLUCIÓN DEL NÚMERO DE ACCIONES (ÚLTIMOS 5 AÑOS)'
      : 'EVOLUCIÓN DEL NÚMERO DE ACCIONES (AÑOS DISPONIBLES)';
    const bars = points.map((p) => {
      const widthPct = Math.max(4, Math.round((p.shares / max) * 100));
      const isCurrent = p === last;
      return `<div class="sc-row"><span class="sc-year">${escapeHtml(p.year)}</span><div class="sc-track"><div class="sc-fill${isCurrent ? ' sc-fill-current' : ''}" style="width:${widthPct}%;"></div></div><span class="sc-value">${escapeHtml(String(p.shares).replace('.', ','))}M</span></div>`;
    }).join('');
    const metrics = `
      <div class="sc-metrics">
        <div class="sc-metric"><span class="sc-metric-label">Reducción media anual (CAGR, ${n - 1} años):</span> <strong class="sc-metric-value">${fmtPct(cagrPct)}</strong> <span class="sc-metric-bpa">(impacto en BPA ${fmtBpa(bpaCagr)})</span></div>
        <div class="sc-metric"><span class="sc-metric-label">Último año:</span> <strong class="sc-metric-value">${fmtPct(lastPct)}</strong> <span class="sc-metric-bpa">(impacto en BPA ${fmtBpa(bpaLast)})</span></div>
      </div>`;
    return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chartTitle)}</div>${bars}${metrics}</div>`;
  }

  function renderSecSnippet(snippet) {
    if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return '';
    const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
    const thead = headers.length
      ? `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
      : '';
    const tbody = snippet.rows.map((row) => {
      const isArr = Array.isArray(row);
      const cells = isArr ? row : [row.metric ?? row.name, row.value];
      const rowText = cells.join(' ').toLowerCase();
      const isBuybackRow = rowText.includes('repurchased') || rowText.includes('recomprad') || rowText.includes('2026');
      const isCostRow = rowText.includes('cost') || rowText.includes('coste') || rowText.includes('aggregate');

      const cellsHtml = cells.map((c, colIdx) => {
        let cls = '';
        if (colIdx > 0 && isBuybackRow) cls = ' class="sec-highlight-yellow"';
        else if (colIdx > 0 && isCostRow) cls = ' class="sec-highlight-orange"';
        return `<td${cls}>${escapeHtml(c)}</td>`;
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

  function renderAnnualConclusion(conclusion) {
    if (!conclusion) return '';
    let html = `<div class="annual-conclusion-section">
      <div class="annual-conclusion-header">
        <h4>PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN</h4>
        <p class="annual-conclusion-subtitle">Análisis detallado de recompras, outlook oficial, deuda y asignación de capital</p>
      </div>`;

    // 1: Recompras
    const rep = conclusion.repurchases;
    if (rep) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(rep.title || '1: Recompras')}</h5>
          ${rep.text ? `<p class="annual-card-text">${boldNumbers(escapeHtml(rep.text)).replaceAll('\n', '<br>')}</p>` : ''}
          <div class="annual-metric-badges">
            ${(rep.authorizationRemaining || rep.programRemaining) ? `<div class="annual-badge"><strong>Autorización restante:</strong> ${boldNumbers(escapeHtml(rep.authorizationRemaining || rep.programRemaining))}</div>` : ''}
            ${rep.authorizationExpiry ? `<div class="annual-badge"><strong>Vigencia:</strong> ${boldNumbers(escapeHtml(rep.authorizationExpiry))}</div>` : ''}
            ${rep.shareCountEvolution ? `<div class="annual-badge"><strong>Evolución de acciones:</strong> ${boldNumbers(escapeHtml(rep.shareCountEvolution))}</div>` : ''}
            ${rep.bpaImpact ? `<div class="annual-badge badge-accent"><strong>Impacto BPA:</strong> ${boldNumbers(escapeHtml(rep.bpaImpact))}</div>` : ''}
            ${rep.futureProjection ? `<div class="annual-badge"><strong>Proyección 5 años:</strong> ${boldNumbers(escapeHtml(rep.futureProjection))}</div>` : ''}
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
          ${out.text ? `<p class="annual-card-text">${escapeHtml(out.text).replaceAll('\n', '<br>')}</p>` : ''}
          ${out.fcfAnalysis ? `<p class="annual-card-text"><strong>Análisis FCF:</strong> ${escapeHtml(out.fcfAnalysis)}</p>` : ''}
          ${out.riskFactors ? `<p class="annual-card-text"><strong>Riesgos y Sensibilidad:</strong> ${escapeHtml(out.riskFactors)}</p>` : ''}
          ${out.efficiencyPlans ? `<p class="annual-card-text"><strong>Programas de eficiencia:</strong> ${escapeHtml(out.efficiencyPlans)}</p>` : ''}
          ${renderSecSnippet(out.secSnippet)}
        </div>
      `;
    }

    // 3: Deuda
    const debt = conclusion.debt;
    if (debt) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(debt.title || '3: Deuda')}</h5>
          ${debt.text ? `<p class="annual-card-text">${escapeHtml(debt.text).replaceAll('\n', '<br>')}</p>` : ''}
          ${(debt.refinancingAnalysis || debt.refinancingImpact) ? `
            <div class="annual-calc-box">
              <strong>Refinanciación de deuda a corto plazo:</strong>
              ${debt.refinancingAnalysis ? `<p>${escapeHtml(debt.refinancingAnalysis)}</p>` : ''}
              ${debt.refinancingImpact ? `<p class="calc-impact"><strong>Impacto en intereses:</strong> ${escapeHtml(debt.refinancingImpact)}</p>` : ''}
            </div>
          ` : ''}
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
          <p class="annual-card-text">${escapeHtml(acq.text || 'No se realizaron adquisiciones materiales durante el ejercicio.').replaceAll('\n', '<br>')}</p>
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
            ${watch.items.map((item) => `<li><span class="watchlist-check">✓</span> <span>${escapeHtml(item)}</span></li>`).join('')}
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
        <p class="annual-rating-rationale">${escapeHtml(rating.rationale || '')}</p>
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
        html += renderAnnualConclusion(report.conclusion);
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
