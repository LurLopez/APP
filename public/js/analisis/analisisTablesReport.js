/**
 * @fileoverview Render del informe: extractos SEC, CEO, conclusión y rating (extraído de analisisTables.js).
 */

(function (window) {


  function renderSecSnippet(snippet) {
    if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return '';
    const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
    const thead = headers.length
      ? `<thead><tr>${headers.map((h, i) => `<th${i > 0 ? ' class="sec-th-num"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
      : '';
    const tbody = snippet.rows.map((row) => {
      const cells = Array.isArray(row) ? row : [row.metric ?? row.name, row.value];
      const cellsHtml = cells.map((c, colIdx) => {
        const valStr = String(c ?? '');
        const formatted = colIdx > 0 ? boldNumbers(escapeHtml(valStr)) : escapeHtml(valStr);
        return `<td${colIdx > 0 ? ' class="sec-col-num"' : ''}>${formatted}</td>`;
      }).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');

    return `
      <div class="sec-extract-card">
        <div class="sec-extract-head">
          <span class="sec-extract-tag">EXTRACTO OFICIAL SEC</span>
          <strong class="sec-extract-title">${escapeHtml(snippet.title || 'Información Oficial SEC')}</strong>
        </div>
        <div class="sec-table-wrap"><table class="sec-table">${thead}<tbody>${tbody}</tbody></table></div>
      </div>
    `;
  }

  function renderCeoFieldLine(label, value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return `<div class="ceo-field"><span class="ceo-field-label">${escapeHtml(label)}:</span> <span class="ceo-field-text">${formatAnnualRichText(text)}</span></div>`;
  }

  function renderCeoPersonBlock(label, person) {
    if (!person || typeof person !== 'object') return '';
    const heading = person.name
      ? `<div class="ceo-person-name">${escapeHtml(String(person.name))}${person.role ? ` <span class="ceo-person-role">${escapeHtml(String(person.role))}</span>` : ''}</div>`
      : '';
    const fields = [
      renderCeoFieldLine('Inicio en el cargo', person.tenureStart),
      renderCeoFieldLine('Ventas durante su mandato', person.salesDuringTenure),
      renderCeoFieldLine('A dónde pasa', person.whereTheyGo),
      renderCeoFieldLine('Políticas de su etapa', person.policies),
      renderCeoFieldLine('De dónde viene', person.origin),
      renderCeoFieldLine('Trayectoria previa', person.trackRecord),
      renderCeoFieldLine('Qué ha anunciado', person.commitments),
    ].join('');
    if (!heading && !fields) return '';
    return `<div class="ceo-person-box"><span class="ceo-block-label">${escapeHtml(label)}</span>${heading}${fields}</div>`;
  }

  function getExecutiveChanges(conclusion) {
    const modern = conclusion?.executiveChanges;
    if (modern && Array.isArray(modern.changes) && modern.changes.length) {
      return { title: modern.title, changes: modern.changes, disclaimer: modern.disclaimer || null };
    }
    const legacy = conclusion?.ceoChange;
    if (legacy && typeof legacy === 'object') {
      return {
        title: legacy.title || 'Cambios en la dirección',
        changes: [{
          role: 'CEO',
          text: legacy.text,
          announcementDate: legacy.announcementDate,
          effectiveDate: legacy.effectiveDate,
          reason: legacy.reason,
          oldExecutive: legacy.oldCeo,
          newExecutive: legacy.newCeo,
        }],
        disclaimer: legacy.disclaimer || null,
      };
    }
    return null;
  }

  function renderExecutiveChangeBody(change) {
    const roleLabel = String(change.role || 'Directivo').toUpperCase();
    const blocks = [
      renderCeoPersonBlock(`ANTIGUO ${roleLabel}`, change.oldExecutive),
      renderCeoPersonBlock(`NUEVO ${roleLabel}`, change.newExecutive),
    ].filter(Boolean).join('');

    return `
      ${change.text ? `<p class="annual-card-text">${formatAnnualRichText(change.text)}</p>` : ''}
      ${(change.announcementDate || change.effectiveDate || change.reason) ? `<div class="ceo-meta">${[
        change.announcementDate ? `<span class="annual-badge">Anuncio: <strong>${escapeHtml(String(change.announcementDate))}</strong></span>` : '',
        change.effectiveDate ? `<span class="annual-badge">Efectivo: <strong>${escapeHtml(String(change.effectiveDate))}</strong></span>` : '',
        change.reason ? `<span class="annual-badge">Motivo: <strong>${escapeHtml(String(change.reason))}</strong></span>` : '',
      ].filter(Boolean).join('')}</div>` : ''}
      ${blocks ? `<div class="ceo-grid">${blocks}</div>` : ''}
    `;
  }

  function renderExecutiveChangesBody(section) {
    const changes = Array.isArray(section?.changes) ? section.changes : [];
    const body = changes.map((change, index) => `
      ${index > 0 ? '<div class="ceo-change-separator"></div>' : ''}
      ${changes.length > 1 ? `<div class="ceo-block-label">${escapeHtml(String(change.role || 'Directivo'))}</div>` : ''}
      ${renderExecutiveChangeBody(change)}
    `).join('');
    return `${body}${section?.disclaimer ? `<p class="ceo-disclaimer">${escapeHtml(section.disclaimer)}</p>` : ''}`;
  }

  function parseCapitalAmount(value) {
    let text = String(value ?? '').replace(/[$€£\s]/g, '').trim();
    if (!text) return NaN;
    if (text.includes(',') && text.includes('.')) {
      text = text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(/,/g, '.')
        : text.replace(/,/g, '');
    } else if (text.includes(',')) {
      const parts = text.split(',');
      text = parts.length > 2 || parts[1]?.length === 3 ? parts.join('') : text.replace(',', '.');
    }
    return parseFloat(text);
  }

  function hasMaterialAcquisitions(report, conclusion) {
    const rows = report?.horizons?.[0]?.capital?.rows ?? [];
    const readValue = (needles) => {
      for (const row of rows) {
        const name = String(row?.name ?? '').toLowerCase();
        if (!needles.some((needle) => name.includes(needle))) continue;
        const raw = Array.isArray(row?.values) ? row.values[0] : row?.value;
        const num = parseCapitalAmount(raw);
        if (Number.isFinite(num)) return num;
      }
      return null;
    };
    const acquisitions = readValue(['adquisic', 'acquisit']);
    const divestitures = readValue(['desinvers', 'divestit']);
    const text = String(conclusion?.acquisitions?.text ?? '');
    const saysNone = /no se realizaron|no hubo|no material|sin adquisiciones|no acquisitions|no se produjeron|none/i.test(text);
    return (Number.isFinite(acquisitions) && Math.abs(acquisitions) >= 50)
      || (Number.isFinite(divestitures) && Math.abs(divestitures) >= 50)
      || (text.trim().length > 0 && !saysNone);
  }

  function renderAnnualConclusion(conclusion, report) {
    if (!conclusion) return '';
    let html = `<div class="annual-conclusion-section"><div class="annual-conclusion-header"><h4>PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN</h4></div>`;

    const rep = conclusion.repurchases;
    if (rep) {
      const repBadges = [
        rep.programChanges ? `Programa: ${rep.programChanges}` : null,
        rep.buybackPctOfShares != null ? `Peso en el capital: ${rep.buybackPctOfSharesEstimated ? '≈' : ''}${String(rep.buybackPctOfShares).replace('.', ',')} % de las acciones en el año` : null,
      ].filter(Boolean);
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(rep.title || '1: Recompras')}</h5>
          ${rep.text ? `<p class="annual-card-text">${formatAnnualRichText(rep.text)}</p>` : ''}
          ${repBadges.length ? `<div class="annual-metric-badges">${repBadges.map((badge) => `<span class="annual-badge badge-accent">${escapeHtml(badge)}</span>`).join('')}</div>` : ''}
          ${window.AnalisisCharts.renderSharesChart(rep.sharesHistory)}
          ${renderSecSnippet(withAveragePrice(rep.secSnippet))}
        </div>
      `;
    }

    const exec = getExecutiveChanges(conclusion);
    if (exec) {
      html += `
        <div class="annual-deepdive-card ceo-change-card">
          <h5 class="annual-card-title">${escapeHtml(exec.title || '2: Cambios en la dirección')}</h5>
          ${renderExecutiveChangesBody(exec)}
        </div>
      `;
    }

    const out = conclusion.outlook;
    if (out) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(out.title || '3: Outlook')}</h5>
          ${out.text ? `<p class="annual-card-text">${formatAnnualRichText(out.text)}</p>` : ''}
          ${renderSecSnippet(withOutlookComparison(out.secSnippet, report))}
        </div>
      `;
    }

    const debt = conclusion.debt;
    if (debt) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(debt.title || '4: Deuda')}</h5>
          ${debt.text ? `<p class="annual-card-text">${formatAnnualRichText(debt.text)}</p>` : ''}
          ${window.AnalisisCharts.renderDebtMaturityChart(debt, report?.fiscalYear)}
          ${window.AnalisisCharts.renderDebtHistoryChart(debt, report)}
          ${window.AnalisisCharts.renderDebtRefinancingCard(debt, report)}
        </div>
      `;
    }

    const acq = conclusion.acquisitions;
    if (acq && hasMaterialAcquisitions(report, conclusion)) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(acq.title || '5: Adquisiciones')}</h5>
          ${acq.text ? `<p class="annual-card-text">${formatAnnualRichText(acq.text)}</p>` : ''}
        </div>
      `;
    }

    const div = conclusion.dividends;
    const divChart = window.AnalisisCharts.renderDividendChart(div, report);
    if (divChart) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(div?.title || '6: Dividendos')}</h5>
          ${div?.text ? `<p class="annual-card-text">${formatAnnualRichText(div.text)}</p>` : ''}
          ${divChart}
        </div>
      `;
    }

    html += '</div>';
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
      if (report.conclusion) html += renderAnnualConclusion(report.conclusion, report);
      if (report.rating) html += renderAnnualRating(report.rating);
      reportBody.innerHTML = html;
    }
  }

window.renderSecSnippet = renderSecSnippet;
window.renderCeoFieldLine = renderCeoFieldLine;
window.renderCeoPersonBlock = renderCeoPersonBlock;
window.getExecutiveChanges = getExecutiveChanges;
window.renderExecutiveChangesBody = renderExecutiveChangesBody;
window.renderAnnualConclusion = renderAnnualConclusion;
window.renderAnnualRating = renderAnnualRating;
window.renderReport = renderReport;

})(window);
