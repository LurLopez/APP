/**
 * @fileoverview Estado compartido del módulo AnalisisState.
 */

(function (window) {

window.AnalisisState = {
  selectedFile: null,
  selectedPresentation: null,
  analysisTimer: null,
  processingHintTimer: null,
  lastAnalysisFailed: true,
  currentPdfUrl: null,
  currentDownloadBase: null,
  currentDownloadName: 'analisis-cifra',
  pendingFiling: null,
  currentUser: false,
  historyDebounceTimer: null,
  historyAnalyses: [],
  historySort: { key: 'created_at', dir: 'desc' },
  historyPage: 1,
  initialized: false,
  historyCompanies: [],
  historySuggest: null,
  historySuggestIndex: -1,
  currentAnalysisId: null,
  currentAnalysisTicker: null,
  currentAnalysisAccession: null,
  currentAnalysisFormType: null,
  currentAnalysisSlug: null,
  currentAnalysisVersion: null,
  currentAnalysisSubsector: null,
  currentAnalysisCurrentVersion: null,
  currentAnalysisVersionOutdated: false,
  currentAnalysisIsReviewed: false,
  currentAnalysisVersions: [],
  pendingVersionsMenuOpen: false,
  currentUserRating: 0,
  pendingAuthRetry: null,
  analysisAttachmentMgr: null,
};

})(window);
