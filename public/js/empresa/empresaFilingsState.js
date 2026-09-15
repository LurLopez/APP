/**
 * @fileoverview Estado compartido del módulo EmpresaFilingsState.
 */

(function (window) {

window.EmpresaFilingsState = {
  screenerFilings: null,
  screenerFilingsLoading: false,
  filingsVersionPopover: null,
  filingsVersionRequestId: 0,
  previewLoadTimeout: null,
  filingsPresentationsController: null,
};

})(window);
