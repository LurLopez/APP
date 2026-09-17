/**
 * @fileoverview Carga de la empresa y resolución de la sección inicial (extraído de empresa.js).
 */

(function (window) {
  const { abortPresentations } = window.EmpresaFilings || {};

async function loadCompany() {
  screenerFilings = null;
  screenerFilingsLoading = false;
  window.EmpresaFilings?.abortPresentations?.();
  const currentActiveSection = resolveInitialSection();
  const isGlobal = ['favoritos', 'alertas', 'cartera', 'calendario', 'analisis', 'novedades', 'guias', 'reportes'].includes(currentActiveSection);
  if (!isGlobal) {
    companyLoading.hidden = false;
    companyBody.hidden = true;
  }
  companyError.hidden = true;

  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      companyError.textContent = data.error || 'No se pudo consultar la empresa.';
      companyError.hidden = false;
      return;
    }
    renderCompany(data);
    try {
      await window.EmpresaFavoriteMetrics?.loadFavorites?.();
    } catch {}
    companyBody.hidden = false;
    renderCompanyWatchState();
    renderPriceChart();
    loadChart(chartRange);
    window.loadStatementsPriceHistory?.();
    const portfolioRoot = document.querySelector('#portfolio-company-section');
    if (portfolioRoot?.dataset.ticker) {
      portfolioRoot.dataset.name = data.company?.name ?? companyTicker;
      Portfolio.registerCompanyPanel(portfolioRoot);
    }
    if (window.Forum) {
      window.Forum.updateCompany(companyTicker, data.company?.name);
    }
    if (data.company?.ticker) {
      companyTicker = data.company.ticker.toUpperCase();
      window.companyTicker = companyTicker;
      localStorage.setItem(SAVED_TICKER_KEY, companyTicker);
    }
    const currentActiveSection = resolveInitialSection();
    if (currentActiveSection && currentActiveSection !== 'perfil') {
      document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === currentActiveSection));
      showSection(currentActiveSection);
    }
    const searchParams = new URLSearchParams(window.location.search);
    const initialVmetric = searchParams.get('vmetric');
    if (initialVmetric) {
      valChartMetric = initialVmetric;
      document.querySelectorAll('.val-chart-metrics button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.vmetric === initialVmetric);
      });
      if (typeof renderValuationChart === 'function') renderValuationChart();
    }
  } catch (err) {
    console.error('[loadCompany error]:', err);
    companyError.textContent = 'No se pudo conectar con el servidor o cargar los datos de la empresa.';
    companyError.hidden = false;
  } finally {
    companyLoading.hidden = true;
  }
}

function resolveInitialSection() {
  const path = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);

  if (path.startsWith('/cartera') || searchParams.get('cartera') === '1') {
    return 'cartera';
  }
  if (path.startsWith('/calendario') || searchParams.get('calendario') === '1') {
    return 'calendario';
  }
  if (path.startsWith('/seguimiento') || path.startsWith('/favoritos')) {
    return 'favoritos';
  }
  if (path.startsWith('/alerta')) {
    return 'alertas';
  }
  if (path.startsWith('/analisi') || path.startsWith('/informe') || searchParams.get('analizar')) {
    return 'analisis';
  }
  if (path.startsWith('/novedad')) {
    return 'novedades';
  }
  if (path.startsWith('/guia')) {
    return 'guias';
  }
  if (path.startsWith('/reporte') || path.startsWith('/admin')) {
    return 'reportes';
  }
  const urlSec = searchParams.get('seccion') || searchParams.get('section') || window.location.hash.replace('#', '');
  if (urlSec && ['perfil', 'favoritos', 'alertas', 'cartera', 'calendario', 'analisis', 'novedades', 'guias', 'reportes', 'informes', 'datos', 'accionariado', 'foros'].includes(urlSec)) {
    return urlSec;
  }
  return 'perfil';
}

window.loadCompany = loadCompany;
window.resolveInitialSection = resolveInitialSection;

})(window);
