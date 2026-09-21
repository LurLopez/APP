/**
 * @fileoverview Acciones de filings: vista previa y análisis desde el calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function openCalendarFilingPreview(url, name) {
    if (!url) return;
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (!backdrop) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    const title = document.querySelector('#filings-preview-title');
    const loading = document.querySelector('#filings-preview-loading');
    const pages = document.querySelector('#filings-preview-pages');
    const openLink = document.querySelector('#filings-preview-open');

    clearTimeout(CS.calPreviewLoadTimeout);
    if (title) title.textContent = `Vista previa · ${name || 'Informe'}`;
    if (openLink) openLink.href = url;
    if (pages) {
      pages.hidden = true;
      pages.innerHTML = '';
    }
    if (loading) {
      loading.hidden = false;
      loading.textContent = 'Generando páginas del documento…';
    }
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    CS.calPreviewLoadTimeout = setTimeout(() => {
      if (loading && !loading.hidden) {
        loading.textContent = 'La vista previa tarda demasiado. Puedes abrir el documento en una pestaña nueva.';
      }
    }, 30000);

    const previewUrl = url.replace(/\/document$/, '/preview');
    fetch(previewUrl)
      .then((response) => response.json().catch(() => ({})))
      .then((resData) => {
        clearTimeout(CS.calPreviewLoadTimeout);
        if (!resData || resData.ok !== true || !resData.pages) {
          if (loading) loading.textContent = resData?.error || 'No se pudo generar la vista previa. Abre el documento en una pestaña nueva.';
          return;
        }
        if (loading) loading.hidden = true;
        const pageWord = resData.pages === 1 ? 'página' : 'páginas';
        if (title) title.textContent = `Vista previa · ${name || 'Informe'} · ${resData.pages} ${pageWord}`;
        const base = previewUrl.replace(/\/preview$/, '/preview/pages');
        if (pages) {
          pages.innerHTML = Array.from({ length: resData.pages }, (_, index) => (
            `<img src="${base}/${index + 1}" alt="Página ${index + 1}" loading="lazy">`
          )).join('');
          pages.hidden = false;
        }
      })
      .catch(() => {
        clearTimeout(CS.calPreviewLoadTimeout);
        if (loading) loading.textContent = 'No se pudo conectar con el servidor. Abre el documento en una pestaña nueva.';
      });
  }

  function closeCalendarFilingPreview() {
    clearTimeout(CS.calPreviewLoadTimeout);
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (backdrop) backdrop.hidden = true;
    const pages = document.querySelector('#filings-preview-pages');
    if (pages) pages.innerHTML = '';
    document.body.style.overflow = '';
  }

  async function runCalendarFilingAnalysis(ticker, accession, renderFn) {
    CS.calendarAiLoading = true;
    CS.calendarAiError = null;
    CS.calendarAiResult = null;
    if (typeof renderFn === 'function') renderFn();

    try {
      let targetAccession = accession;
      if (!targetAccession) {
        const fRes = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}/filings`);
        const fData = await fRes.json().catch(() => ({}));
        if (fData?.filings?.length > 0) {
          targetAccession = fData.filings[0].accession;
        }
      }

      if (!targetAccession) {
        throw new Error('No se encontró el identificador oficial (accession) del informe en SEC EDGAR.');
      }

      const response = await fetch(
        `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(targetAccession)}/analyze`,
        { method: 'POST' }
      );
      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (resData.code === 'AUTH_REQUIRED' || resData.code === 'DAILY_LIMIT_REACHED') {
          CS.calendarAiLoading = false;
          CS.calendarAiError = resData.error || 'No se pudo completar el análisis de IA del informe.';
          if (typeof renderFn === 'function') renderFn();
          if (resData.code === 'AUTH_REQUIRED') {
            window.showToast?.('Crea una cuenta gratis para analizar informes nuevos con IA.');
            window.AuthModule?.openModal?.('register');
          }
          return;
        }
        throw new Error(resData.error || 'No se pudo completar el análisis de IA del informe.');
      }

      CS.calendarAiResult = resData;
      CS.calendarAiLoading = false;
      if (typeof renderFn === 'function') renderFn();
    } catch (err) {
      CS.calendarAiError = err.message || 'Error al conectar con el servidor de análisis.';
      CS.calendarAiLoading = false;
      if (typeof renderFn === 'function') renderFn();
    }
  }

window.openCalendarFilingPreview = openCalendarFilingPreview;
window.closeCalendarFilingPreview = closeCalendarFilingPreview;
window.runCalendarFilingAnalysis = runCalendarFilingAnalysis;

})(window);
