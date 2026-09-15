/**
 * @fileoverview Estado compartido del módulo ReportsState.
 */

(function (window) {

window.ReportsState = {
  generalModal: null,
  activeTab: 'ai',
  aiData: null,
  generalData: null,
  statsData: null,
  aiSearchQuery: '',
  aiFilterMode: 'all',
  generalStatusFilter: 'all',
  generalCategoryFilter: 'all',
  generalSearchQuery: '',
  isGenerating: false,
  generalAttachmentMgr: null,
};

})(window);
