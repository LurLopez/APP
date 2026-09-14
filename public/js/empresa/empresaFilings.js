/**
 * @file empresaFilings.js
 * @description Gestión, renderizado y previsualización de informes trimestrales y anuales (10-Q/10-K) de la SEC.
 */

(function (window) {
  'use strict';

  let screenerFilings = null;
  let screenerFilingsLoading = false;
  const filingsVersionsCache = new Map();
  let filingsVersionPopover = null;
  let filingsVersionRequestId = 0;
  let previewLoadTimeout = null;
  let filingsPresentationsController = null;

  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatFilingDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('es-ES');
  }

  function getActiveTicker() {
    return window.companyTicker || '';
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
    } else {
      console.warn(msg);
    }
  }

  function navigateToAnalisis() {
    document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
      item.classList.toggle('active', item.dataset.section === 'analisis');
    });
    if (typeof window.showSection === 'function') {
      window.showSection('analisis');
    }
    history.pushState(null, '', '/analisis');
  }

  /* ── Menú de versiones por informe (popover hamburguesa) ─────── */

  function getFilingsVersionPopover() {
    if (!filingsVersionPopover) {
      filingsVersionPopover = document.createElement('div');
      filingsVersionPopover.className = 'filing-version-popover';
      filingsVersionPopover.hidden = true;
      document.body.appendChild(filingsVersionPopover);
      document.addEventListener('click', (event) => {
        if (filingsVersionPopover.hidden) return;
        const actionEl = event.target.closest('[data-popup-action]');
        if (actionEl && filingsVersionPopover.contains(actionEl)) {
          event.preventDefault();
          if (actionEl.dataset.popupAction === 'upgrade') {
            startFilingUpgradeFromPopover();
          } else if (actionEl.dataset.popupAction === 'view') {
            viewFilingAnalysisVersion(actionEl.dataset.analysisId);
          }
          return;
        }
        if (!event.target.closest('.filing-analyze-group') && !filingsVersionPopover.contains(event.target)) {
          closeFilingsVersionMenu();
        }
      });
      window.addEventListener('scroll', () => closeFilingsVersionMenu(), true);
      window.addEventListener('resize', () => closeFilingsVersionMenu());
    }
    return filingsVersionPopover;
  }

  function closeFilingsVersionMenu() {
    if (!filingsVersionPopover) return;
    filingsVersionRequestId += 1;
    filingsVersionPopover.hidden = true;
    document.querySelectorAll('button[data-action="versions-menu"][aria-expanded="true"]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function positionFilingsVersionPopover(button) {
    const popover = getFilingsVersionPopover();
    const rect = button.getBoundingClientRect();
    const width = popover.offsetWidth || 330;
    const height = popover.offsetHeight || 220;
    const left = Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8));
    const top = (window.innerHeight - rect.bottom < height + 12 && rect.top > height + 24)
      ? rect.top - height - 6
      : rect.bottom + 6;
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8))}px`;
  }

  function renderFilingVersionRow(entry) {
    const versionLabel = entry.version ? `v${escapeHtml(entry.version)}` : 'Sin versión';
    const dateLabel = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('es-ES') : '';
    const base = entry.downloadBase ? String(entry.downloadBase) : '';
    const isReviewed = Boolean(entry.isReviewed ?? entry.is_reviewed);
    const reviewedBadge = isReviewed
      ? `<span class="analysis-reviewed-mini-badge" title="Este análisis ha sido revisado por un humano" aria-label="Este análisis ha sido revisado por un humano"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> Revisado</span>`
      : '';
    return `<div class="filing-version-row">
      <div class="filing-version-row-info">
        <strong>${versionLabel} ${reviewedBadge}</strong>
        <span>${escapeHtml(dateLabel)}${entry.modelUsed ? ` · ${escapeHtml(entry.modelUsed)}` : ''}</span>
      </div>
      <div class="filing-version-row-actions">
        <button type="button" class="row-action" data-popup-action="view" data-analysis-id="${escapeHtml(entry.id)}" title="Ver esta versión">Ver</button>
        ${base ? `<a class="row-action" href="${escapeHtml(base)}.pdf?download=1" download title="Descargar PDF">PDF</a><a class="row-action" href="${escapeHtml(base)}.docx?download=1" download title="Descargar Word">DOCX</a><a class="row-action" href="${escapeHtml(base)}.odt?download=1" download title="Descargar ODT">ODT</a>` : ''}
      </div>
    </div>`;
  }

  function renderFilingsVersionPopover(data) {
    const popover = getFilingsVersionPopover();
    const versions = Array.isArray(data?.versions) ? data.versions : [];
    const current = versions[0] ?? null;
    const previous = versions.slice(1);
    const currentLabel = current?.version ? `v${escapeHtml(current.version)}` : 'Sin versión';
    const isReviewed = Boolean(current?.isReviewed ?? current?.is_reviewed ?? data?.isReviewed);
    const reviewedBadge = isReviewed
      ? `<span class="analysis-reviewed-mini-badge" title="Este análisis ha sido revisado por un humano" aria-label="Este análisis ha sido revisado por un humano"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> Revisado</span>`
      : '';
    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || window.currentUser?.isAdmin);

    let html = `<div class="filing-version-popover-head"><span>Versión actual</span><strong>${currentLabel} ${reviewedBadge}</strong></div>`;
    if (data?.versionOutdated) {
      if (!isReviewed || isAdmin) {
        const target = data.currentVersion ? `v${escapeHtml(data.currentVersion)}` : 'la versión vigente';
        html += `<button type="button" class="filing-version-upgrade" data-popup-action="upgrade">Actualizar a ${target} ✨<small>Regenera con las reglas vigentes y conserva las versiones anteriores</small></button>`;
      } else {
        html += '<div class="filing-version-reviewed-notice">🛡️ Este análisis ha sido revisado por un humano. Solo un administrador puede regenerarlo.</div>';
      }
    } else {
      html += '<div class="filing-version-uptodate">✓ Análisis en la versión vigente</div>';
    }
    if (previous.length) {
      html += `<div class="filing-version-popover-sub">Versiones anteriores (${previous.length})</div><div class="filing-version-list">${previous.map(renderFilingVersionRow).join('')}</div>`;
    } else {
      html += '<div class="filing-version-popover-sub">Versiones anteriores</div><div class="filing-version-empty">Todavía no hay versiones anteriores.</div>';
    }
    popover.innerHTML = html;
  }

  async function openFilingsVersionMenu(button) {
    const ticker = button.dataset.ticker;
    const accession = button.dataset.accession;
    const fallbackVersion = button.dataset.currentVersion || '';
    const fallbackOutdated = button.dataset.outdated === '1';
    const fallbackReviewed = button.dataset.reviewed === '1';
    const popover = getFilingsVersionPopover();
    closeFilingsVersionMenu();
    const requestId = filingsVersionRequestId;
    popover.dataset.ticker = ticker;
    popover.dataset.accession = accession;
    popover.dataset.currentVersion = fallbackVersion;
    popover.dataset.reviewed = fallbackReviewed ? '1' : '0';
    button.setAttribute('aria-expanded', 'true');
    popover.innerHTML = '<div class="filing-version-loading"><span class="loading-spinner-sm"></span> Cargando versiones…</div>';
    popover.hidden = false;
    positionFilingsVersionPopover(button);

    const key = `${ticker}|${accession}`;
    let data = filingsVersionsCache.get(key);
    if (!data) {
      try {
        const response = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/versions`);
        const payload = await response.json().catch(() => ({}));
        data = response.ok && payload.ok
          ? payload
          : { ok: false, versions: [], currentVersion: fallbackVersion, versionOutdated: fallbackOutdated, isReviewed: fallbackReviewed };
      } catch {
        data = { ok: false, versions: [], currentVersion: fallbackVersion, versionOutdated: fallbackOutdated, isReviewed: fallbackReviewed };
      }
      if (data.ok !== false) filingsVersionsCache.set(key, data);
    }
    if (requestId !== filingsVersionRequestId || popover.hidden) return;
    if (data.ok === false) {
      popover.innerHTML = '<div class="filing-version-empty">No se pudieron cargar las versiones. Inténtalo de nuevo.</div>';
      return;
    }
    const isReviewed = Boolean(data.versions?.[0]?.isReviewed ?? data.versions?.[0]?.is_reviewed ?? data.isReviewed ?? fallbackReviewed);
    popover.dataset.reviewed = isReviewed ? '1' : '0';
    renderFilingsVersionPopover(data);
    positionFilingsVersionPopover(button);
  }

  function startFilingUpgradeFromPopover() {
    const popover = getFilingsVersionPopover();
    const ticker = popover.dataset.ticker;
    const accession = popover.dataset.accession;
    const currentVersion = popover.dataset.currentVersion || '';
    const isReviewed = popover.dataset.reviewed === '1';
    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || window.currentUser?.isAdmin);
    closeFilingsVersionMenu();
    if (!ticker || !accession) return;
    if (isReviewed && !isAdmin) {
      toast('Este análisis ha sido revisado por un humano. Solo un administrador puede regenerarlo.');
      return;
    }
    if (!confirm(`¿Regenerar el análisis de ${ticker} con la versión más reciente${currentVersion ? ` (v${currentVersion})` : ''} con IA?\n\nConsume cupo diario y la versión anterior se conserva en el historial de versiones.`)) {
      return;
    }
    navigateToAnalisis();
    if (window.AnalysisModule) {
      window.AnalysisModule.runFilingAnalysis(ticker, accession, { upgrade: true });
    }
  }

  async function viewFilingAnalysisVersion(analysisId) {
    if (!analysisId) return;
    closeFilingsVersionMenu();
    navigateToAnalisis();
    try {
      const response = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis?.report || !window.AnalysisModule?.loadReportData) {
        toast('No se pudo cargar esa versión del análisis.');
        return;
      }
      window.AnalysisModule.loadReportData(data.analysis, { updateHistory: true });
      document.querySelector('#result-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      toast('No se pudo conectar con el servidor.');
    }
  }

  /* ── Renderizado de tabla de informes ───────────────────────── */

  function renderFilingsTable() {
    const table = document.querySelector('#filings-table');
    if (!table) return;
    const ticker = getActiveTicker();
    const filings = screenerFilings?.filings ?? [];
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
    if (filingsPresentationsController) {
      filingsPresentationsController.abort();
    }
    filingsPresentationsController = new AbortController();
    const { signal } = filingsPresentationsController;

    try {
      const response = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}/filings/presentations`, { signal });
      if (!response.ok) return;
      const data = await response.json();
      if (getActiveTicker() !== ticker || !screenerFilings?.filings) return;

      const map = data.presentationsByAccession || {};
      screenerFilings.filings.forEach((filing) => {
        if (map[filing.accession]) {
          filing.presentations = map[filing.accession];
        }
        filing.presentationsLoading = false;
        filing.presentationsLoaded = true;
      });
      renderFilingsTable();
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (getActiveTicker() === ticker && screenerFilings?.filings) {
        screenerFilings.filings.forEach((f) => { f.presentationsLoading = false; });
        renderFilingsTable();
      }
    } finally {
      if (getActiveTicker() === ticker) {
        updatePresentationsStatus(false);
      }
      filingsPresentationsController = null;
    }
  }

  async function loadFilings(ticker) {
    const currentTicker = ticker || getActiveTicker();
    if (screenerFilingsLoading || !currentTicker) return;
    screenerFilingsLoading = true;
    closeFilingsVersionMenu();

    const countEl = document.querySelector('#filings-count');
    const table = document.querySelector('#filings-table');
    if (countEl && (!screenerFilings || !screenerFilings.filings?.length)) {
      countEl.textContent = 'Cargando informes…';
    }
    if (table && (!screenerFilings || !screenerFilings.filings?.length)) {
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
      screenerFilings = data;
      window.screenerFilings = data;
      filingsVersionsCache.clear();
      const pendingPresentations = Boolean(data.presentationsPending);
      if (pendingPresentations && Array.isArray(screenerFilings.filings)) {
        screenerFilings.filings.forEach((filing, idx) => {
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
      screenerFilingsLoading = false;
    }
  }

  /* ── Previsualización modal de páginas ──────────────────────── */

  function openFilingsPreview(url, name) {
    const title = document.querySelector('#filings-preview-title');
    const loading = document.querySelector('#filings-preview-loading');
    const pages = document.querySelector('#filings-preview-pages');
    clearTimeout(previewLoadTimeout);
    title.textContent = `Vista previa · ${name}`;
    document.querySelector('#filings-preview-open').href = url;
    pages.hidden = true;
    pages.innerHTML = '';
    loading.hidden = false;
    loading.textContent = 'Generando páginas del documento…';
    document.querySelector('#filings-preview-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    previewLoadTimeout = setTimeout(() => {
      if (!loading.hidden) loading.textContent = 'La vista previa tarda demasiado. Puedes abrir el documento en una pestaña nueva.';
    }, 30000);
    const previewUrl = url.replace(/\/document$/, '/preview');
    fetch(previewUrl)
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        clearTimeout(previewLoadTimeout);
        if (!data || data.ok !== true || !data.pages) {
          loading.textContent = 'No se pudo generar la vista previa. Abre el documento en una pestaña nueva.';
          return;
        }
        loading.hidden = true;
        const pageWord = data.pages === 1 ? 'página' : 'páginas';
        title.textContent = `Vista previa · ${name} · ${data.pages} ${pageWord}`;
        const base = previewUrl.replace(/\/preview$/, '/preview/pages');
        pages.innerHTML = Array.from({ length: data.pages }, (_, index) => (
          `<img src="${base}/${index + 1}" alt="Página ${index + 1}" loading="lazy">`
        )).join('');
        pages.hidden = false;
      })
      .catch(() => {
        clearTimeout(previewLoadTimeout);
        loading.textContent = 'No se pudo conectar con el servidor. Abre el documento en una pestaña nueva.';
      });
  }

  function closeFilingsPreview() {
    clearTimeout(previewLoadTimeout);
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (backdrop) backdrop.hidden = true;
    const pages = document.querySelector('#filings-preview-pages');
    if (pages) pages.innerHTML = '';
    document.body.style.overflow = '';
  }

  function initFilingsModalListeners() {
    const closeBtn = document.querySelector('#filings-preview-close');
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeFilingsPreview);
    if (backdrop) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeFilingsPreview();
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && backdrop && !backdrop.hidden) closeFilingsPreview();
    });

    window.addEventListener('analysis:finished', (event) => {
      const detail = event.detail || {};
      const currentTicker = getActiveTicker();
      if (!screenerFilings || !detail.ticker || !currentTicker
        || String(detail.ticker).toUpperCase() !== String(currentTicker).toUpperCase()) {
        return;
      }
      filingsVersionsCache.clear();
      screenerFilings = null;
      window.screenerFilings = null;
      loadFilings(currentTicker);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFilingsModalListeners);
  } else {
    initFilingsModalListeners();
  }

  function abortPresentations() {
    if (filingsPresentationsController) {
      try {
        filingsPresentationsController.abort();
      } catch {}
      filingsPresentationsController = null;
    }
  }

  const EmpresaFilings = {
    loadFilings,
    renderFilingsTable,
    openFilingsPreview,
    closeFilingsPreview,
    openFilingsVersionMenu,
    closeFilingsVersionMenu,
    abortPresentations,
    getFilings: () => screenerFilings,
    setFilings: (data) => { screenerFilings = data; window.screenerFilings = data; }
  };

  window.EmpresaFilings = EmpresaFilings;
  window.loadFilings = loadFilings;
  window.renderFilingsTable = renderFilingsTable;
  window.openFilingsPreview = openFilingsPreview;
  window.closeFilingsPreview = closeFilingsPreview;
  window.abortFilingsPresentations = abortPresentations;
})(window);
