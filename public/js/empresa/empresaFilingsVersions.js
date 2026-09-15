/**
 * @fileoverview Versiones y menús de filings de empresa.
 */

(function (window) {
  const FS = window.EmpresaFilingsState;
    const filingsVersionsCache = new Map();

  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
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

  function getFilingsVersionPopover() {
    if (!FS.filingsVersionPopover) {
      FS.filingsVersionPopover = document.createElement('div');
      FS.filingsVersionPopover.className = 'filing-version-popover';
      FS.filingsVersionPopover.hidden = true;
      document.body.appendChild(FS.filingsVersionPopover);
      document.addEventListener('click', (event) => {
        if (FS.filingsVersionPopover.hidden) return;
        const actionEl = event.target.closest('[data-popup-action]');
        if (actionEl && FS.filingsVersionPopover.contains(actionEl)) {
          event.preventDefault();
          if (actionEl.dataset.popupAction === 'upgrade') {
            startFilingUpgradeFromPopover();
          } else if (actionEl.dataset.popupAction === 'view') {
            viewFilingAnalysisVersion(actionEl.dataset.analysisId);
          }
          return;
        }
        if (!event.target.closest('.filing-analyze-group') && !FS.filingsVersionPopover.contains(event.target)) {
          closeFilingsVersionMenu();
        }
      });
      window.addEventListener('scroll', () => closeFilingsVersionMenu(), true);
      window.addEventListener('resize', () => closeFilingsVersionMenu());
    }
    return FS.filingsVersionPopover;
  }

  function closeFilingsVersionMenu() {
    if (!FS.filingsVersionPopover) return;
    FS.filingsVersionRequestId += 1;
    FS.filingsVersionPopover.hidden = true;
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
    const requestId = FS.filingsVersionRequestId;
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
    if (requestId !== FS.filingsVersionRequestId || popover.hidden) return;
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

window.escapeHtml = escapeHtml;
window.formatFilingDate = formatFilingDate;
window.getActiveTicker = getActiveTicker;
window.toast = toast;
window.navigateToAnalisis = navigateToAnalisis;
window.getFilingsVersionPopover = getFilingsVersionPopover;
window.closeFilingsVersionMenu = closeFilingsVersionMenu;
window.positionFilingsVersionPopover = positionFilingsVersionPopover;
window.renderFilingVersionRow = renderFilingVersionRow;
window.renderFilingsVersionPopover = renderFilingsVersionPopover;
window.openFilingsVersionMenu = openFilingsVersionMenu;
window.startFilingUpgradeFromPopover = startFilingUpgradeFromPopover;
window.viewFilingAnalysisVersion = viewFilingAnalysisVersion;
window.filingsVersionsCache = filingsVersionsCache;

})(window);
