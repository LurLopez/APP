/**
 * @fileoverview Fachada central de renderizado para el Centro de Control de Reportes.
 * @module ReportsRender
 */

(function (window) {
  'use strict';

  window.ReportsRender = {
    escapeHtml: window.escapeHtml,
    formatDate: window.formatDate,
    formatShortDate: window.formatShortDate,
    formatRelativeDate: window.formatRelativeDate,
    getCategoryLabel: window.getCategoryLabel,
    getCategoryTagHtml: window.getCategoryTagHtml,
    getStatusBadge: window.getStatusBadge,
    renderHeader: window.renderHeader,
    renderStatsCards: window.renderStatsCards,
    renderPagination: window.renderPagination,
    renderBulkActionBar: window.renderBulkActionBar,
    renderDrawer: window.renderDrawer,
    renderLightbox: window.renderLightbox,
    renderResultItem: window.renderResultItem,
    renderAiTab: window.renderAiTab,
    renderGeneralTab: window.renderGeneralTab,
  };
})(window);
