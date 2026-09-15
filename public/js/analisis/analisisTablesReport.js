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

  function formatCeoMarketData(marketData) {
    if (!marketData || !Number.isFinite(Number(marketData.changeFirstSessionPct))) return '';
    const fmt = (value) => `${Number(value) > 0 ? '+' : ''}${String(value).replace('.', ',')} %`;
    const third = Number.isFinite(Number(marketData.changeThreeSessionsPct))
      ? ` y ${fmt(marketData.changeThreeSessionsPct)} a 3 sesiones`
      : '';
    const source = marketData.source ? ` (${escapeHtml(String(marketData.source))})` : '';
    const date = marketData.announcementDate ? ` del ${escapeHtml(String(marketData.announcementDate))}` : '';
    return `Cotización en torno al anuncio${date}: ${fmt(marketData.changeFirstSessionPct)} en la primera sesión${third}${source}.`;
  }

  function renderCeoChangeBody(ceo) {
    const blocks = [
      renderCeoPersonBlock('ANTIGUO CEO', ceo.oldCeo),
      renderCeoPersonBlock('NUEVO CEO', ceo.newCeo),
    ].filter(Boolean).join('');
    const sentiment = String(ceo.marketReaction?.sentiment ?? '').toLowerCase();
    const sentimentClass = sentiment === 'positiva' ? 'ceo-market-positive'
      : (sentiment === 'negativa' ? 'ceo-market-negative' : 'ceo-market-mixed');
    const marketDataLine = formatCeoMarketData(ceo.marketData);
    const reaction = (ceo.marketReaction?.summary || marketDataLine)
      ? `<div class="ceo-market-box ${sentimentClass}">
          <span class="ceo-block-label">Reacción del mercado</span>
          ${ceo.marketReaction?.sentiment ? `<span class="ceo-market-tag">${escapeHtml(sentiment || ceo.marketReaction.sentiment)}</span>` : ''}
          ${ceo.marketReaction?.summary ? `<p class="ceo-market-text">${formatAnnualRichText(ceo.marketReaction.summary)}</p>` : ''}
          ${marketDataLine ? `<p class="ceo-market-data">${marketDataLine}</p>` : ''}
        </div>`
      : '';

    return `
      ${ceo.text ? `<p class="annual-card-text">${formatAnnualRichText(ceo.text)}</p>` : ''}
      ${(ceo.announcementDate || ceo.effectiveDate || ceo.reason) ? `<div class="ceo-meta">${[
        ceo.announcementDate ? `<span class="annual-badge">Anuncio: <strong>${escapeHtml(String(ceo.announcementDate))}</strong></span>` : '',
        ceo.effectiveDate ? `<span class="annual-badge">Efectivo: <strong>${escapeHtml(String(ceo.effectiveDate))}</strong></span>` : '',
        ceo.reason ? `<span class="annual-badge">Motivo: <strong>${escapeHtml(String(ceo.reason))}</strong></span>` : '',
      ].filter(Boolean).join('')}</div>` : ''}
      ${blocks ? `<div class="ceo-grid">${blocks}</div>` : ''}
      ${reaction}
      ${ceo.disclaimer ? `<p class="ceo-disclaimer">${escapeHtml(ceo.disclaimer)}</p>` : ''}
    `;
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

    const ceo = conclusion.ceoChange;
    if (ceo) {
      html += `
        <div class="annual-deepdive-card ceo-change-card">
          <h5 class="annual-card-title">${escapeHtml(ceo.title || '2: Cambio de CEO')}</h5>
          ${renderCeoChangeBody(ceo)}
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
window.formatCeoMarketData = formatCeoMarketData;
window.renderCeoChangeBody = renderCeoChangeBody;
window.renderAnnualConclusion = renderAnnualConclusion;
window.renderAnnualRating = renderAnnualRating;
window.renderReport = renderReport;

})(window);
