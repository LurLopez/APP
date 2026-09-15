/**
 * @fileoverview Estado compartido del módulo PortfolioCalendarState.
 */

(function (window) {

window.PortfolioCalendarState = {
  calendarYear: 2026,
  calendarMonth: 7,
  calendarVisibility: undefined,
  calendarCompanyVisibility: undefined,
  calendarEditingCompanyTicker: null,
  calendarConfigModalOpen: false,
  calendarViewMode: 'grid',
  calendarActiveModalEvent: null,
  calendarAiLoading: false,
  calendarAiResult: null,
  calendarAiError: null,
  calPreviewLoadTimeout: null,
};

})(window);
