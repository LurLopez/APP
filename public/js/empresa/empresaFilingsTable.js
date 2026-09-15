/**
 * @fileoverview Tabla de filings, presentaciones y carga.
 */

(function (window) {
  const FS = window.EmpresaFilingsState;


  function renderFilingsTable() {
    const table = document.querySelector('#filings-table');
    if (!table) return;
    const ticker = getActiveTicker();
    const filings = FS.screenerFilings?.filings ?? [];
    const countEl = document.querySelector('#filings-count');
    if (countEl) {
      countEl.textContent = filings.length
        ? `${filings.length} informes · ordenados por fecha de presentación`
        : 'Sin informes 10-Q ni 10-K disponibles';
    }
    table.querySelector('thead').innerHTML = '<tr><th>Formulario</th><th>Periodo</th><th>Periodo que cubre</th><th>Fecha de presentación</th><th>Acciones</th></tr>';
    table.querySelector('tbody').innerHTML = filings.map((filing) => {
      const is10K = filing.formType === '10-K';
      const hasAnalysis = Boolean(filing.hasAnalysis);
      const isReviewed = Boolean(filing.isReviewed);
      const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || window.currentUser?.isAdmin);
      const canUpgrade = filing.versionOutdated && (!isReviewed || isAdmin);
      const badgeClass = is10K ? 'filing-badge-10k' : 'filing-badge-10q';
      const documentUrl = `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(filing.accession)}/document`;
      const analyzeButtonLabel = hasAnalysis ? 'Ver análisis con IA ✨' : 'Analizar con IA';
      const reviewedInlineIcon = (hasAnalysis && isReviewed)
        ? `<span class="analysis-reviewed-icon-inline" title="Este análisis ha sido revisado por un humano" aria-label="Este análisis ha sido revisado por un humano"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></span>`
        : '';
      const analyzeControl = hasAnalysis
        ? `<div class="filing-analyze-group${canUpgrade ? ' has-update' : ''}">
            <button type="button" class="filing-action filing-action-analyze filing-action-ready" data-action="analyze" data-form-type="${escapeHtml(filing.formType)}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(filing.accession)}">${analyzeButtonLabel}</button>
            <button type="button" class="filing-analyze-menu" data-action="versions-menu" data-form-type="${escapeHtml(filing.formType)}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(filing.accession)}" data-current-version="${escapeHtml(filing.currentVersion ?? '')}" data-outdated="${filing.versionOutdated ? '1' : '0'}" data-reviewed="${isReviewed ? '1' : '0'}" aria-haspopup="true" aria-expanded="false" title="Versión actual, actualización y versiones anteriores">☰</button>
          </div>`
        : `<button type="button" class="filing-action filing-action-analyze" data-action="analyze" data-form-type="${escapeHtml(filing.formType)}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(filing.accession)}">${analyzeButtonLabel}</button>`;

      let ratingBadge = '';
      if (hasAnalysis) {
        const avg = filing.ratingAverage != null ? Number(filing.ratingAverage) : 0;
        const count = Number(filing.ratingCount) || 0;
        if (count > 0) {
          const avgText = avg.toFixed(1);
          const countText = count === 1 ? '1 valoración' : `${count} valoraciones`;
          ratingBadge = `<button type="button" class="filing-rating-pill" title="Nota media: ${avgText} de 5 (${countText}) · Clic para ver el análisis" data-action="analyze" data-form-type="${escapeHtml(filing.formType)}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(filing.accession)}"><span class="filing-rating-star">★</span> ${avgText}</button>`;
        } else {
          ratingBadge = `<button type="button" class="filing-rating-pill filing-rating-pill-empty" title="Análisis disponible (sin valoraciones aún) · Clic para ver y ser el primero en valorarlo" data-action="analyze" data-form-type="${escapeHtml(filing.formType)}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(filing.accession)}"><span class="filing-rating-star">★</span> —</button>`;
        }
      }

      const adminRegenBtn = (hasAnalysis && isAdmin)
        ? `<button type="button" class="filing-action filing-action-regenerate admin-only" data-action="regenerate" data-form-type="${escapeHtml(filing.formType)}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(filing.accession)}" title="Volver a generar este informe con IA (crea una versión nueva y conserva las anteriores)">🔄 Regenerar</button>`
        : '';

      const presentations = Array.isArray(filing.presentations) ? filing.presentations : [];
      const deckItem = presentations.find((item) => item.docType === 'presentation') ?? null;
      const releaseItem = presentations.find((item) => item.docType === 'release') ?? null;

      const presentationBtn = deckItem
        ? `<a class="filing-action filing-action-presentation" href="${escapeHtml(deckItem.documentUrl)}" target="_blank" rel="noopener" title="${escapeHtml(deckItem.documentName || deckItem.name || 'Presentación de resultados (PDF)')}">Presentación</a>`
        : '';

      const releaseBtn = (releaseItem && releaseItem.documentUrl !== deckItem?.documentUrl)
        ? `<a class="filing-action filing-action-release" href="${escapeHtml(releaseItem.documentUrl)}" target="_blank" rel="noopener" title="${escapeHtml(releaseItem.documentName || releaseItem.name || 'Comunicado de resultados (8-K)')}">Comunicado</a>`
        : '';

      const loadingPresBtn = (!presentationBtn && !releaseBtn && filing.presentationsLoading)
        ? `<span class="filing-action filing-action-loading" title="Buscando presentación y comunicado de resultados..."><span class="loading-spinner-sm"></span> Cargando…</span>`
        : '';

      return `<tr>
        <td><span class="filing-badge ${badgeClass}">${escapeHtml(filing.formType)}</span></td>
        <td class="filing-period">${escapeHtml(filing.periodLabel ?? '—')}</td>
        <td class="filing-date">${escapeHtml(filing.period ?? '—')}</td>
        <td class="filing-date">${escapeHtml(formatFilingDate(filing.filedAt))}</td>
        <td class="filing-actions">
          <button type="button" class="filing-action" data-action="preview" data-doc="${escapeHtml(documentUrl)}" data-name="${escapeHtml(filing.documentName)}">Vista previa</button>
          <a class="filing-action filing-action-download" href="${escapeHtml(documentUrl)}?download=1" download>Descargar</a>
          ${analyzeControl}
          ${reviewedInlineIcon}
          ${presentationBtn}
          ${releaseBtn}
          ${loadingPresBtn}
          ${adminRegenBtn}
          ${ratingBadge}
        </td>
      </tr>`;
    }).join('');

    table.querySelectorAll('button[data-action="preview"]').forEach((button) => {
      button.addEventListener('click', () => openFilingsPreview(button.dataset.doc, button.dataset.name));
    });
    table.querySelectorAll('button[data-action="analyze"]').forEach((button) => {
      button.addEventListener('click', () => {
        const t = button.dataset.ticker;
        const acc = button.dataset.accession;
        navigateToAnalisis();
        if (window.AnalysisModule) {
          window.AnalysisModule.runFilingAnalysis(t, acc);
        }
      });
    });
    table.querySelectorAll('button[data-action="versions-menu"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (button.getAttribute('aria-expanded') === 'true') {
          closeFilingsVersionMenu();
          return;
        }
        openFilingsVersionMenu(button);
      });
    });
    table.querySelectorAll('button[data-action="regenerate"]').forEach((button) => {
      button.addEventListener('click', () => {
        const t = button.dataset.ticker;
        const acc = button.dataset.accession;
        const formType = button.dataset.formType || '10-Q';
        if (!confirm(`¿Deseas volver a generar el informe de ${t} (${formType}) con IA?\n\nSe creará una versión nueva y se conservarán las anteriores.`)) {
          return;
        }
        navigateToAnalisis();
        if (window.AnalysisModule) {
          window.AnalysisModule.runFilingAnalysis(t, acc, { force: true });
        }
      });
    });
  }

  function updatePresentationsStatus(isLoading) {
    const statusEl = document.querySelector('#filings-presentations-status');
    if (statusEl) {
      statusEl.hidden = !isLoading;
    }
  }

  async function loadFilingsPresentations(ticker) {
    if (FS.filingsPresentationsController) {
      FS.filingsPresentationsController.abort();
    }
    FS.filingsPresentationsController = new AbortController();
    const { signal } = FS.filingsPresentationsController;

    try {
      const response = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}/filings/presentations`, { signal });
      if (!response.ok) return;
      const data = await response.json();
      if (getActiveTicker() !== ticker || !FS.screenerFilings?.filings) return;

      const map = data.presentationsByAccession || {};
      FS.screenerFilings.filings.forEach((filing) => {
        if (map[filing.accession]) {
          filing.presentations = map[filing.accession];
        }
        filing.presentationsLoading = false;
        filing.presentationsLoaded = true;
      });
      renderFilingsTable();
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (getActiveTicker() === ticker && FS.screenerFilings?.filings) {
        FS.screenerFilings.filings.forEach((f) => { f.presentationsLoading = false; });
        renderFilingsTable();
      }
    } finally {
      if (getActiveTicker() === ticker) {
        updatePresentationsStatus(false);
      }
      FS.filingsPresentationsController = null;
    }
  }

  async function loadFilings(ticker) {
    const currentTicker = ticker || getActiveTicker();
    if (FS.screenerFilingsLoading || !currentTicker) return;
    FS.screenerFilingsLoading = true;
    closeFilingsVersionMenu();

    const countEl = document.querySelector('#filings-count');
    const table = document.querySelector('#filings-table');
    if (countEl && (!FS.screenerFilings || !FS.screenerFilings.filings?.length)) {
      countEl.textContent = 'Cargando informes…';
    }
    if (table && (!FS.screenerFilings || !FS.screenerFilings.filings?.length)) {
      table.querySelector('thead').innerHTML = '<tr><th>Formulario</th><th>Periodo</th><th>Periodo que cubre</th><th>Fecha de presentación</th><th>Acciones</th></tr>';
      table.querySelector('tbody').innerHTML = '<tr><td colspan="5" class="filing-table-loading-cell"><span class="loading-spinner"></span> Cargando informes trimestrales de SEC EDGAR…</td></tr>';
    }

    try {
      const response = await fetch(`/api/screener/company/${encodeURIComponent(currentTicker)}/filings`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(data.error || 'No se pudieron cargar los informes.');
        if (countEl) countEl.textContent = 'Error al cargar informes';
        return;
      }
      FS.screenerFilings = data;
      window.screenerFilings = data;
      filingsVersionsCache.clear();
      const pendingPresentations = Boolean(data.presentationsPending);
      if (pendingPresentations && Array.isArray(FS.screenerFilings.filings)) {
        FS.screenerFilings.filings.forEach((filing, idx) => {
          if (!filing.presentationsLoaded && idx < 16) {
            filing.presentationsLoading = true;
          }
        });
      }
      renderFilingsTable();
      updatePresentationsStatus(pendingPresentations);

      if (pendingPresentations) {
        loadFilingsPresentations(currentTicker);
      }
    } catch {
      toast('No se pudieron cargar los informes. Comprueba la conexión.');
      if (countEl) countEl.textContent = 'Error de conexión';
    } finally {
      FS.screenerFilingsLoading = false;
    }
  }

window.renderFilingsTable = renderFilingsTable;
window.updatePresentationsStatus = updatePresentationsStatus;
window.loadFilingsPresentations = loadFilingsPresentations;
window.loadFilings = loadFilings;

})(window);
