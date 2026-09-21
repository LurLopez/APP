/**
 * @fileoverview Estado compartido y persistente del módulo de Administración de Reportes.
 * Soporta paginación, filtros avanzados, vistas múltiples (tabla, incidencias, empresas),
 * selección masiva y panel lateral de detalle (Slide-Over Drawer).
 */

(function (window) {
  'use strict';

  window.ReportsState = {
    generalModal: null,
    activeTab: 'ai', // 'ai' | 'general'
    aiData: null,
    generalData: null,
    generalTotal: 0,
    statsData: null,

    // Pestaña de Análisis IA:
    aiSubView: 'table', // 'table' | 'errors' | 'companies'
    aiSearchQuery: '',
    aiFilterMode: 'all', // 'all' | 'errors' | 'rated' | 'clean' | '10-k' | '10-q'
    aiSortField: 'created_at',
    aiSortOrder: 'desc', // 'desc' | 'asc'
    aiPage: 1,
    aiPageSize: 25,
    selectedAiItems: new Set(),
    expandedCompanies: new Set(),
    allCompaniesExpanded: false,

    // Pestaña de Reportes Generales:
    generalStatusFilter: 'all', // 'all' | 'pending' | 'reviewed' | 'resolved' | 'dismissed'
    generalCategoryFilter: 'all',
    generalSearchQuery: '',
    generalSortField: 'created_at',
    generalSortOrder: 'desc', // 'desc' | 'asc'
    generalPage: 1,
    generalPageSize: 25,
    selectedGeneralItems: new Set(),

    // Slide-Over Detail Drawer (Panel Lateral de Inspección):
    drawerOpen: false,
    drawerType: null, // 'general' | 'ai-error' | 'ai-analysis'
    drawerItem: null,
    drawerItemParent: null,

    // Lightbox modal para capturas de pantalla a tamaño completo:
    lightboxOpen: false,
    lightboxSrc: null,

    // Banderas de control de interfaz y sincronización:
    isGenerating: false,
    isRefreshing: false,
    lastSyncTime: null,
    generalAttachmentMgr: null,
  };
})(window);
