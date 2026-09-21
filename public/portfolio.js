/* ── Cartera: estado compartido y sección ───────────────────── */

const Portfolio = (() => {
  const PS = window.PortfolioState;



  const {
    escapeHtml,
    formatNumber,
    maxDecimals,
    fmtMoney,
    fmtSigned,
    fmtPct,
    fmtSignedPct,
    fmtShares,
    fmtPrice,
    fmtDate,
    fmtEur,
    fmtEurInt,
    changeClass,
    cell
  } = window.PortfolioFormatting;








  /* ── Formulario de operación ─────────────────────────────── */



  /* ── Gráficos circulares y visuales ──────────────────────── */

  const {
    describeAnnularSector,
    donutSvg,
    donutBlock,
    ensureChartTooltip,
    positionChartTooltip,
    hideChartTooltip,
    wireDonutTooltips,
    wireAllocationHover,
    portfolioLogoHtml,
    wirePortfolioLogos
  } = window.PortfolioDonuts;







  /* ── Tabla de posiciones (Actual / Vendido / Todo) ────────── */




















  /* ── Pestañas y grupos ───────────────────────────────────── */










  /* ── Popover de asignación de grupos ─────────────────────── */







  document.addEventListener('click', (event) => {
    if (PS.groupPopover && !PS.groupPopover.hidden && !PS.groupPopover.contains(event.target) && !event.target.closest('.pf-g-add')) {
      closeGroupPopover();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && PS.groupPopover && !PS.groupPopover.hidden) closeGroupPopover();
  });

  /* ── Sección de grupos (debajo de la tabla de acciones) ─── */






























  /* ── Historial de operaciones ────────────────────────────── */



  /* ── Resumen ─────────────────────────────────────────────── */




  /* ── Panel de dividendos ─────────────────────────────────── */




  /* ── Panel de calendario ─────────────────────────────────── */

  /* ── Gráfico de evolución interactivo ─────────────────────── */













  /* ── Sección principal ───────────────────────────────────── */






  /* ── Panel de empresa ────────────────────────────────────── */





  window.addEventListener('portfolio:change', () => {
    if (PS.sectionRoot) renderSection();
    if (PS.calendarSectionRoot) renderCalendarSection();
    renderCompanyPanels();
  });

  window.addEventListener('watchlists:change', () => {
    if (PS.calendarSectionRoot) renderCalendarSection();
  });

  window.addEventListener('settings:change', (event) => {
    if (PS.data && event.detail?.preferences) {
      PS.data.userPreferences = event.detail.preferences;
    }
    if (PS.calendarSectionRoot) renderCalendarSection();
  });

  window.addEventListener('auth:change', (event) => {
    setAuthenticated(Boolean(event.detail?.user));
  });

  if (window.AuthModule?.isReady()) {
    setAuthenticated(Boolean(window.AuthModule.getUser()));
  } else if (window.AuthModule?.whenReady) {
    window.AuthModule.whenReady().then((user) => {
      setAuthenticated(Boolean(user));
    });
  } else if (window.currentUser) {
    setAuthenticated(true);
  }

  return {
    refresh,
    reset,
    setAuthenticated,
    getPosition,
    hasPosition,
    openSection,
    mountSection,
    mountCalendarSection,
    registerCompanyPanel,
  };
})();
