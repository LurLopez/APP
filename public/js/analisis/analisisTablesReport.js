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
          <span class="sec-extract-tag">${tr('EXTRACTO OFICIAL SEC')}</span>
          <strong class="sec-extract-title">${escapeHtml(snippet.title || tr('Información Oficial SEC'))}</strong>
        </div>
        <div class="sec-table-wrap"><table class="sec-table">${thead}<tbody>${tbody}</tbody></table></div>
      </div>
    `;
  }

  const NO_INFO_RE = /^(?:no\s+(?:public(?:ly)?\s+)?information(?:\s+(?:is|was))?\s+available|no\s+information(?:\s+(?:is|was))?\s+available|no\s+se\s+(?:dispone|dispuso|encontro|encontraron|encuentra|ha\s+(?:encontrado|publicado|facilitado|indicado|especificado|detallado|mencionado|reportado|revelado|proporcionado)|han\s+(?:encontrado|publicado|facilitado|indicado|especificado|detallado|mencionado|reportado|revelado|proporcionado)|publico|publicaron|facilito|facilitaron|indico|indicaron|especifico|especificaron|detallo|detallaron|menciona|mencionaron|reporto|reportaron|revelo|revelaron|proporciono|proporcionaron|conoce|identifico|identificaron)[^.]*|no\s+(?:consta|figura|existe|hay|aplica|disponible|especificad[oa]|indicad[oa]|revelad[oa]|proporcionad[oa]|detallad[oa])[^.]*|sin\s+(?:informacion|datos|detalle)[^.]*|(?:informacion|datos)\s+no\s+disponible[^.]*|no\s+info(?:rmacion)?|not\s+(?:available|disclosed|stated|provided|specified|applicable|found|known|reported|mentioned)[^.]*|unknown|desconocid[oa]|none|null|undefined|n\/?a|no\s+data|[-—])$/i;

  function isNoInfoValue(value) {
    if (value == null) return true;
    if (typeof value === 'object') return false;
    let text = String(value).trim();
    if (!text) return true;
    text = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.\s]+$/, '');
    if (NO_INFO_RE.test(text)) return true;
    const firstSentence = text.split(/[.!?]/)[0].trim();
    return firstSentence !== text && NO_INFO_RE.test(firstSentence);
  }

  function renderCeoFieldLine(label, value) {
    if (isNoInfoValue(value)) return '';
    const text = String(value).trim();
    return `<div class="ceo-field"><span class="ceo-field-label">${escapeHtml(tr(label))}:</span> <span class="ceo-field-text">${formatAnnualRichText(text)}</span></div>`;
  }

  function renderCeoPersonBlock(label, person) {
    if (!person || typeof person !== 'object') return '';
    const name = isNoInfoValue(person.name) ? '' : String(person.name).trim();
    const personRole = isNoInfoValue(person.role) ? '' : String(person.role).trim();
    const heading = name
      ? `<div class="ceo-person-name">${escapeHtml(name)}${personRole ? ` <span class="ceo-person-role">${escapeHtml(personRole)}</span>` : ''}</div>`
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

  const EXEC_PERSON_FIELDS = ['name', 'role', 'tenureStart', 'salesDuringTenure', 'whereTheyGo', 'policies', 'origin', 'trackRecord', 'commitments'];

  function personHasInfo(person) {
    if (!person || typeof person !== 'object') return false;
    return EXEC_PERSON_FIELDS.some((key) => !isNoInfoValue(person[key]));
  }

  function changeHasInfo(change) {
    if (!change || typeof change !== 'object') return false;
    return personHasInfo(change.oldExecutive)
      || personHasInfo(change.newExecutive)
      || !isNoInfoValue(change.text)
      || !isNoInfoValue(change.reason)
      || !isNoInfoValue(change.announcementDate)
      || !isNoInfoValue(change.effectiveDate);
  }

  function getExecutiveChanges(conclusion) {
    const modern = conclusion?.executiveChanges;
    if (modern && Array.isArray(modern.changes) && modern.changes.length) {
      const changes = modern.changes.filter(changeHasInfo);
      if (!changes.length) return null;
      return { title: modern.title, changes, disclaimer: modern.disclaimer || null };
    }
    const legacy = conclusion?.ceoChange;
    if (legacy && typeof legacy === 'object') {
      const change = {
        role: 'CEO',
        text: legacy.text,
        announcementDate: legacy.announcementDate,
        effectiveDate: legacy.effectiveDate,
        reason: legacy.reason,
        oldExecutive: legacy.oldCeo,
        newExecutive: legacy.newCeo,
      };
      if (!changeHasInfo(change)) return null;
      return {
        title: legacy.title || tr('Cambios en la dirección'),
        changes: [change],
        disclaimer: legacy.disclaimer || null,
      };
    }
    return null;
  }

  function tr(text, params) {
    const i18n = window.I18n;
    if (!i18n) return text;
    const reportLanguage = window.AnalisisState?.currentReportLanguage;
    if (i18n.tIn) return i18n.tIn(text, params, reportLanguage);
    return i18n.t ? i18n.t(text, params) : text;
  }

  function renderExecutiveChangeBody(change) {
    const roleLabel = isNoInfoValue(change.role) ? tr('Directivo').toUpperCase() : String(change.role).toUpperCase();
    const blocks = [
      renderCeoPersonBlock(tr('ANTIGUO {role}', { role: roleLabel }), change.oldExecutive),
      renderCeoPersonBlock(tr('NUEVO {role}', { role: roleLabel }), change.newExecutive),
    ].filter(Boolean).join('');
    const hasMeta = !isNoInfoValue(change.announcementDate) || !isNoInfoValue(change.effectiveDate) || !isNoInfoValue(change.reason);

    return `
      ${!isNoInfoValue(change.text) ? `<p class="annual-card-text">${formatAnnualRichText(String(change.text).trim())}</p>` : ''}
      ${hasMeta ? `<div class="ceo-meta">${[
        !isNoInfoValue(change.announcementDate) ? `<span class="annual-badge">${tr('Anuncio:')} <strong>${escapeHtml(String(change.announcementDate))}</strong></span>` : '',
        !isNoInfoValue(change.effectiveDate) ? `<span class="annual-badge">${tr('Efectivo:')} <strong>${escapeHtml(String(change.effectiveDate))}</strong></span>` : '',
        !isNoInfoValue(change.reason) ? `<span class="annual-badge">${tr('Motivo:')} <strong>${escapeHtml(String(change.reason))}</strong></span>` : '',
      ].filter(Boolean).join('')}</div>` : ''}
      ${blocks ? `<div class="ceo-grid">${blocks}</div>` : ''}
    `;
  }

  function renderExecutiveChangesBody(section) {
    const changes = Array.isArray(section?.changes) ? section.changes : [];
    const body = changes.map((change, index) => `
      ${index > 0 ? '<div class="ceo-change-separator"></div>' : ''}
      ${changes.length > 1 && !isNoInfoValue(change.role) ? `<div class="ceo-block-label">${escapeHtml(String(change.role))}</div>` : ''}
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
    const section = conclusion?.acquisitions;
    const text = String(section?.text ?? '');
    const saysNone = /no se realizaron|no hubo|no material|sin adquisiciones|no acquisitions|no se produjeron|el ejercicio no registró|none/i.test(text);
    const hasOtherCorporateEvents = section?.hasDivestitures === true || section?.hasSpinOffs === true || section?.hasRestructurings === true;
    return (Number.isFinite(acquisitions) && Math.abs(acquisitions) >= 50)
      || (Number.isFinite(divestitures) && Math.abs(divestitures) >= 50)
      || hasOtherCorporateEvents
      || (text.trim().length > 0 && !saysNone);
  }

  function renderAnnualConclusion(conclusion, report) {
    if (!conclusion) return '';
    let html = `<div class="annual-conclusion-section"><div class="annual-conclusion-header"><h4>${tr('PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN')}</h4></div>`;

    const rep = conclusion.repurchases;
    if (rep) {
      const buybackValue = rep.buybackPctOfShares != null
        ? (window.AnalisisState?.currentReportLanguage === 'en'
          ? String(rep.buybackPctOfShares)
          : String(rep.buybackPctOfShares).replace('.', ','))
        : null;
      const repBadges = [
        rep.programChanges ? tr('Programa: {value}', { value: rep.programChanges }) : null,
        buybackValue != null ? tr('Peso en el capital: {prefix}{value} % de las acciones en el año', { prefix: rep.buybackPctOfSharesEstimated ? '≈' : '', value: buybackValue }) : null,
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
          <h5 class="annual-card-title">${escapeHtml(exec.title || tr('2: Cambios en la dirección'))}</h5>
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
          ${window.AnalisisCharts.renderDebtMaturityChart(debt, report?.fiscalYear, report?.reportingPeriod)}
          ${window.AnalisisCharts.renderDebtHistoryChart(debt, report)}
          ${window.AnalisisCharts.renderDebtRefinancingCard(debt, report)}
        </div>
      `;
    }

    const acq = conclusion.acquisitions;
    if (acq && hasMaterialAcquisitions(report, conclusion)) {
      html += `
        <div class="annual-deepdive-card">
          <h5 class="annual-card-title">${escapeHtml(acq.title || 'Operaciones corporativas')}</h5>
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

  function cleanPeriodLabel(periodTitle, ticker) {
    const text = String(periodTitle || '').trim();
    const code = String(ticker || '').trim();
    if (!text || !code) return text;
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`, 'i'), '').trim() || text;
  }

  function renderReport(report) {
    const horizons = Array.isArray(report.horizons) ? report.horizons : [];
    const titleParts = [report.ticker, cleanPeriodLabel(report.periodTitle, report.ticker)].filter(Boolean);
    const reportLanguage = report.language
      ? (window.I18n?.normalizeLanguage?.(report.language) || 'es')
      : 'es';
    if (window.AnalisisState) window.AnalisisState.currentReportLanguage = reportLanguage;
    const resultTitle = document.querySelector('#result-title');
    const reportBody = document.querySelector('#report-body');
    if (resultTitle) resultTitle.textContent = titleParts.length ? titleParts.join(' — ') : tr('Informe generado');
    if (reportBody) {
      reportBody.setAttribute('data-report-language', reportLanguage);
      let html = horizons.map(renderHorizon).join('');
      if (report.conclusion) html += renderAnnualConclusion(report.conclusion, report);
      if (report.rating) html += renderAnnualRating(report.rating);
      reportBody.innerHTML = html;
      if (!window.I18n?.hasLanguage?.(reportLanguage)) {
        window.I18n?.ensureLanguage?.(reportLanguage).then(() => window.I18n?.apply?.(reportBody));
      }
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
