/**
 * @fileoverview Estado compartido del módulo PortfolioState.
 */

(function (window) {

window.PortfolioState = {
  userLogged: Boolean(window.AuthModule?.getUser?.() || window.currentUser),
  data: null,
  sectionRoot: null,
  sectionOptions: {},
  calendarSectionRoot: null,
  calendarSectionOptions: {},
  formExpanded: false,
  formBusy: false,
  searchDebounceTimer: undefined,
  portfolioTab: 'cartera',
  allocationGroup: 'company',
  allocationBasis: 'value',
  positionsView: 'current',
  sortKey: null,
  sortDir: 'desc',
  displayMode: {},
  groupsView: 'current',
  groupsSortKey: 'valor',
  groupsSortDir: 'asc',
  groupsDisplayMode: {},
  activeTab: { type: 'predefined', key: 'sector' },
  activeGroup: null,
  expandedGroups: new Set(),
  tabFormOpen: false,
  groupFormOpen: false,
  editingGroupId: null,
  editingTabId: null,
  groupPopover: null,
  groupPopoverContext: null,
  chartMetric: 'gainPct',
  chartIncludeDividends: false,
  chartRange: '1y',
  chartSelectedIds: [],
  chartRequestId: 0,
  chartOpen: true,
  chartSliceStart: 0,
  chartSliceEnd: null,
  chartCachedData: null,
  chartRedrawRaf: null,
};

})(window);
