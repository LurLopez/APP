/**
 * @fileoverview Vista previa y modales de filings.
 */

(function (window) {
  const FS = window.EmpresaFilingsState;


  function openFilingsPreview(url, name) {
    const title = document.querySelector('#filings-preview-title');
    const loading = document.querySelector('#filings-preview-loading');
    const pages = document.querySelector('#filings-preview-pages');
    clearTimeout(FS.previewLoadTimeout);
    title.textContent = `Vista previa · ${name}`;
    document.querySelector('#filings-preview-open').href = url;
    pages.hidden = true;
    pages.innerHTML = '';
    loading.hidden = false;
    loading.textContent = 'Generando páginas del documento…';
    document.querySelector('#filings-preview-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    FS.previewLoadTimeout = setTimeout(() => {
      if (!loading.hidden) loading.textContent = 'La vista previa tarda demasiado. Puedes abrir el documento en una pestaña nueva.';
    }, 30000);
    const previewUrl = url.replace(/\/document$/, '/preview');
    fetch(previewUrl)
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        clearTimeout(FS.previewLoadTimeout);
        if (!data || data.ok !== true || !data.pages) {
          loading.textContent = data?.error || 'No se pudo generar la vista previa. Abre el documento en una pestaña nueva.';
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
        clearTimeout(FS.previewLoadTimeout);
        loading.textContent = 'No se pudo conectar con el servidor. Abre el documento en una pestaña nueva.';
      });
  }

  function closeFilingsPreview() {
    clearTimeout(FS.previewLoadTimeout);
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
      if (!FS.screenerFilings || !detail.ticker || !currentTicker
        || String(detail.ticker).toUpperCase() !== String(currentTicker).toUpperCase()) {
        return;
      }
      filingsVersionsCache.clear();
      FS.screenerFilings = null;
      window.screenerFilings = null;
      loadFilings(currentTicker);
    });
  }

  function abortPresentations() {
    if (FS.filingsPresentationsController) {
      try {
        FS.filingsPresentationsController.abort();
      } catch {}
      FS.filingsPresentationsController = null;
    }
  }

window.openFilingsPreview = openFilingsPreview;
window.closeFilingsPreview = closeFilingsPreview;
window.initFilingsModalListeners = initFilingsModalListeners;
window.abortPresentations = abortPresentations;

})(window);
