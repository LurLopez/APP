/**
 * @fileoverview Estado compartido del módulo PortfolioCalendarState.
 */

(function (window) {

const today = new Date();

window.PortfolioCalendarState = {
  calendarYear: today.getFullYear(),
  calendarMonth: today.getMonth(),
  calendarVisibility: undefined,
  calendarCompanyVisibility: undefined,
  calendarEditingCompanyTicker: null,
  calendarConfigModalOpen: false,
  calendarCompaniesHidden: false,
  calendarViewMode: 'grid',
  calendarActiveModalEvent: null,
  calendarAiLoading: false,
  calendarAiResult: null,
  calendarAiError: null,
  calPreviewLoadTimeout: null,
};

})(window);
