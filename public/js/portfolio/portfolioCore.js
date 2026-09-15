/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function emitChange() {
    window.dispatchEvent(new CustomEvent('portfolio:change'));
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Error del servidor.');
    return payload;
  }

  function reset() {
    PS.data = null;
    PS.portfolioTab = 'cartera';
    PS.allocationGroup = 'company';
    PS.allocationBasis = 'value';
    PS.positionsView = 'current';
    PS.groupsView = 'current';
    PS.groupsSortKey = 'valor';
    PS.groupsSortDir = 'asc';
    PS.groupsDisplayMode = {};
    PS.formExpanded = false;
    PS.activeTab = { type: 'predefined', key: 'sector' };
    PS.activeGroup = null;
    PS.expandedGroups.clear();
    PS.tabFormOpen = false;
    PS.groupFormOpen = false;
    PS.editingGroupId = null;
    PS.editingTabId = null;
    PS.chartSelectedIds = [];
    PS.chartOpen = true;
    window.PortfolioChart?.reset?.();
    closeGroupPopover();
    emitChange();
    if (PS.sectionRoot) renderSection();
    if (PS.calendarSectionRoot) renderCalendarSection();
    renderCompanyPanels();
  }

  async function refresh() {
    if (!PS.userLogged) {
      reset();
      return;
    }
    try {
      const response = await fetch('/api/portfolio');
      if (!response.ok) throw new Error('No se pudieron cargar los datos de la cartera.');
      const payload = await response.json().catch(() => null);
      PS.data = payload?.portfolio ?? null;
      if (PS.data) {
        const validChartIds = new Set(chartChoices().map((item) => item.id));
        PS.chartSelectedIds = PS.chartSelectedIds.filter((id) => validChartIds.has(id));
        if (window.PortfolioChart) window.PortfolioChart.selectedIds = PS.chartSelectedIds;
      }
    } catch {
      PS.data = null;
    }
    emitChange();
    if (PS.sectionRoot) renderSection();
    if (PS.calendarSectionRoot) renderCalendarSection();
    renderCompanyPanels();
  }

  function setAuthenticated(value) {
    PS.userLogged = Boolean(value);
    if (!PS.userLogged) reset();
    else refresh();
  }

  function getPosition(ticker) {
    return (PS.data?.positions ?? []).find((item) => item.ticker === String(ticker ?? '').toUpperCase()) ?? null;
  }

  function hasPosition(ticker) {
    const pos = getPosition(ticker);
    return Boolean(pos && Number(pos.shares) > 0);
  }

  function openSection() {
    if (!PS.userLogged) {
      showToast?.('Inicia sesión para gestionar tu cartera.');
      window.openModal?.('login');
      return false;
    }
    window.openHomeSection?.('cartera');
    return true;
  }

  function isAuthPending() {
    return Boolean(window.AuthModule && !window.AuthModule.isReady());
  }
window.emitChange = emitChange;
window.api = api;
window.reset = reset;
window.refresh = refresh;
window.setAuthenticated = setAuthenticated;
window.getPosition = getPosition;
window.hasPosition = hasPosition;
window.openSection = openSection;
window.isAuthPending = isAuthPending;

})(window);
