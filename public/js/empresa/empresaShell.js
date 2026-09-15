/**
 * @fileoverview Navegación, buscador y dependencias de sesión de la página (extraído de empresa.js).
 */

(function (window) {
  const companyBody = document.querySelector('#company-body');
  const SECTION_PLACEHOLDERS = [];
  const { loadFilings } = window.EmpresaFilings || {};
  const { loadHolders, renderHolders } = window.EmpresaHolders || {};

function showSection(key) {
  restoreQuoteDisplay();
  const companyHeadRow = document.querySelector('.company-head-row');
  const sections = {
    perfil: document.querySelector('#section-perfil'),
    favoritos: document.querySelector('#section-favoritos'),
    cartera: document.querySelector('#section-cartera'),
    calendario: document.querySelector('#section-calendario'),
    analisis: document.querySelector('#section-analisis'),
    novedades: document.querySelector('#section-novedades'),
    guias: document.querySelector('#section-guias'),
    reportes: document.querySelector('#section-reportes'),
    informes: document.querySelector('#section-informes'),
    datos: document.querySelector('#section-datos'),
    accionariado: document.querySelector('#section-accionariado'),
    foros: document.querySelector('#section-foros'),
    alertas: document.querySelector('#section-alertas'),
    placeholder: document.querySelector('#section-placeholder'),
  };

  Object.values(sections).forEach((section) => { if (section) section.hidden = true; });

  const isGlobalSection = ['favoritos', 'alertas', 'cartera', 'calendario', 'analisis', 'novedades', 'guias', 'reportes'].includes(key);
  if (companyHeadRow) {
    companyHeadRow.hidden = isGlobalSection;
  }
  if (isGlobalSection) {
    if (companyLoading) companyLoading.hidden = true;
    if (companyBody) companyBody.hidden = false;
  }

  if (key === 'favoritos') {
    if (sections.favoritos) sections.favoritos.hidden = false;
    Watchlists.mountSection(document.querySelector('#watchlists-section'), {
      countEl: document.querySelector('#favorites-count'),
      onNavigate: goToCompany,
    });
    Watchlists.refresh();
    return;
  }

  if (key === 'alertas') {
    if (sections.alertas) sections.alertas.hidden = false;
    const container = document.querySelector('#price-alerts-section');
    if (container && !container.dataset.mounted) {
      container.dataset.mounted = '1';
      PriceAlerts.mountSection(container, {
        countEl: document.querySelector('#price-alerts-count'),
        onNavigate: goToCompany,
        initialCompany: {
          ticker: companyTicker,
          name: companyData?.company?.name || companyTicker,
          price: companyData?.market?.price || null,
        },
      });
    } else if (container) {
      PriceAlerts.loadAlerts?.();
    }
    return;
  }

  if (key === 'cartera') {
    if (sections.cartera) sections.cartera.hidden = false;
    const root = document.querySelector('#portfolio-section');
    if (root) {
      Portfolio.mountSection(root, {
        onNavigate: goToCompany,
      });
    }
    return;
  }

  if (key === 'calendario') {
    if (sections.calendario) sections.calendario.hidden = false;
    const root = document.querySelector('#calendar-section');
    if (root) {
      Portfolio.mountCalendarSection(root, {
        onNavigate: goToCompany,
      });
    }
    return;
  }

  if (key === 'analisis') {
    if (sections.analisis) sections.analisis.hidden = false;
    window.AnalysisModule?.fetchAnalyses();
    return;
  }

  if (key === 'novedades') {
    if (sections.novedades) sections.novedades.hidden = false;
    window.NovedadesModule?.render();
    return;
  }

  if (key === 'guias') {
    if (sections.guias) sections.guias.hidden = false;
    document.title = 'Cifra | Guías';
    window.GuiasModule?.init();
    return;
  }

  if (key === 'reportes') {
    if (sections.reportes) sections.reportes.hidden = false;
    window.ReportsModule?.render();
    return;
  }

  if (key === 'informes') {
    if (sections.informes) sections.informes.hidden = false;
    if (!screenerFilings && !screenerFilingsLoading) loadFilings(companyTicker);
    return;
  }

  if (key === 'datos') {
    if (sections.datos) sections.datos.hidden = false;
    renderScreenerTables();
    return;
  }

  if (key === 'accionariado') {
    if (sections.accionariado) sections.accionariado.hidden = false;
    if (!companyHoldersData && !companyHoldersLoading) {
      loadHolders(companyTicker);
    } else if (companyHoldersData) {
      renderHolders(companyTicker);
    }
    return;
  }

  if (key === 'foros') {
    if (sections.foros) sections.foros.hidden = false;
    if (window.Forum) {
      window.Forum.load(companyTicker, companyData?.company?.name);
    }
    return;
  }

  if (SECTION_PLACEHOLDERS.includes(key)) {
    const label = document.querySelector(`.nav-link[data-section="${key}"] span`)?.textContent ?? 'Sección';
    document.querySelector('#placeholder-title').textContent = label;
    if (sections.placeholder) sections.placeholder.hidden = false;
    return;
  }

  if (sections.perfil) sections.perfil.hidden = false;
}

function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('visible');
  menuToggle.setAttribute('aria-expanded', 'false');
}

async function searchCompanies(query) {
  const response = await fetch(`/api/screener/search?q=${encodeURIComponent(query.trim())}`);
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return data?.companies ?? [];
}

function renderSearchResults(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      searchResults.hidden = true;
      searchResults.innerHTML = '';
      return;
    }

    const matches = await searchCompanies(query);
    if (!matches.length) {
      searchResults.innerHTML = '<div class="search-empty">Sin resultados en EDGAR para esta búsqueda.</div>';
      searchResults.hidden = false;
      return;
    }

    searchResults.innerHTML = matches.map((company) => {
      const inPortfolio = typeof Portfolio !== 'undefined' && Boolean(Portfolio.hasPosition?.(company.ticker));
      return `
      <button class="search-result" type="button" data-ticker="${escapeHtml(company.ticker)}">
        <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(company.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((company.name || company.ticker || '?').slice(0, 1).toUpperCase())}">
        <span class="search-result-name">${escapeHtml(company.name)}</span>
        ${inPortfolio ? '<span class="search-result-pf-badge" title="En tu cartera">💼 Cartera</span>' : ''}
        <strong>${escapeHtml(company.ticker)}</strong>
      </button>`;
    }).join('');
    searchResults.hidden = false;

    searchResults.querySelectorAll('.search-result').forEach((result) => {
      result.addEventListener('click', () => goToCompany(result.dataset.ticker));
    });
    searchResults.querySelectorAll('.search-result-logo').forEach((logo) => {
      logo.addEventListener('error', () => {
        const letter = document.createElement('span');
        letter.className = 'search-result-logo search-result-logo-fallback';
        letter.textContent = logo.dataset.letter || '?';
        logo.replaceWith(letter);
      });
    });
  }, 250);
}

function syncAuthDependencies(isAuth) {
  companyAuthenticated = isAuth;
  Watchlists?.setAuthenticated?.(companyAuthenticated);
  if (companyAuthenticated) Watchlists?.refresh?.();
  Portfolio?.setAuthenticated?.(companyAuthenticated);
  if (companyData && !document.querySelector('#section-datos')?.hidden) {
    renderScreenerTables();
  }
}

window.showSection = showSection;
window.closeSidebar = closeSidebar;
window.searchCompanies = searchCompanies;
window.renderSearchResults = renderSearchResults;
window.syncAuthDependencies = syncAuthDependencies;
window.companyBody = companyBody;
window.SECTION_PLACEHOLDERS = SECTION_PLACEHOLDERS;

})(window);
