/**
 * @file portfolioCalendar.js
 * @description Calendario de eventos financieros de la cartera y seguimiento (resultados SEC, dividendos y cortes ex-div).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;
  CS.calendarVisibility = loadCalendarVisibility();
  CS.calendarCompanyVisibility = loadCalendarCompanyVisibility();
  CS.calendarCompaniesHidden = loadCalendarCompaniesHidden();
  'use strict';

  const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const WEEKDAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const WEEKDAYS_SHORT_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const PortfolioCalendar = {
    MONTH_NAMES_ES,
    WEEKDAYS_ES,
    WEEKDAYS_SHORT_ES,
    getPortfolioCalendarEvents,
    getCalendarCompanies,
    calendarCompaniesPanelHtml,
    calendarPanelHtml,
    calendarGridViewHtml,
    calendarListViewHtml,
    calendarModalHtml,
    calendarConfigModalHtml,
    calendarCompanyEditModalHtml,
    openCalendarFilingPreview,
    closeCalendarFilingPreview,
    wireCalendarDashboard,
    get year() { return CS.calendarYear; },
    set year(v) { CS.calendarYear = v; },
    get month() { return CS.calendarMonth; },
    set month(v) { CS.calendarMonth = v; },
    get viewMode() { return CS.calendarViewMode; },
    set viewMode(v) { CS.calendarViewMode = v; }
  };

  window.PortfolioCalendar = PortfolioCalendar;
  window.MONTH_NAMES_ES = MONTH_NAMES_ES;
  window.WEEKDAYS_ES = WEEKDAYS_ES;
  window.WEEKDAYS_SHORT_ES = WEEKDAYS_SHORT_ES;
})(window);
