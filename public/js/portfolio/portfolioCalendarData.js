/**
 * @fileoverview Datos y visibilidad del calendario de cartera (almacenamiento, preferencias y filtros) (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;
    const CALENDAR_VISIBILITY_STORAGE_KEY = 'cifra_calendar_visibility_v1';
    const CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY = 'cifra_calendar_company_visibility_v2';
    const fmt = () => window.PortfolioFormatting || {};
    const donutsMod = () => window.PortfolioDonuts || {};

  function escapeHtml(value) {
    return fmt().escapeHtml ? fmt().escapeHtml(value) : String(value ?? '');
  }

  function formatNumber(value, options) {
    return fmt().formatNumber ? fmt().formatNumber(value, options) : String(value ?? '');
  }

  function fmtEur(value) {
    return fmt().fmtEur ? fmt().fmtEur(value) : `${value} €`;
  }

  function portfolioLogoHtml(item) {
    return donutsMod().portfolioLogoHtml ? donutsMod().portfolioLogoHtml(item) : '';
  }

  function loadCalendarVisibility() {
    try {
      const raw = localStorage.getItem(CALENDAR_VISIBILITY_STORAGE_KEY);
      if (!raw) {
        return { earnings: true, exdiv: true, payout: true, portfolio: true, watchlist: true };
      }
      const data = JSON.parse(raw);
      return {
        earnings: data.earnings !== false,
        exdiv: data.exdiv !== false,
        payout: data.payout !== false,
        portfolio: data.portfolio !== false,
        watchlist: data.watchlist !== false,
      };
    } catch {
      return { earnings: true, exdiv: true, payout: true, portfolio: true, watchlist: true };
    }
  }

  function saveCalendarVisibility(vis) {
    try {
      localStorage.setItem(CALENDAR_VISIBILITY_STORAGE_KEY, JSON.stringify(vis));
    } catch {
      // Ignorar errores de almacenamiento local
    }
  }

  function loadCalendarCompanyVisibility() {
    try {
      const raw = localStorage.getItem(CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  function saveCalendarCompanyVisibility(map) {
    try {
      localStorage.setItem(CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignorar
    }
  }

  function getUserPreferences(data) {
    if (data?.userPreferences) return data.userPreferences;
    if (typeof window.Settings !== 'undefined' && typeof window.Settings.getPreferences === 'function') {
      return window.Settings.getPreferences();
    }
    return {
      watchlistAutoCalendar: true,
      watchlistAutoNotify: true,
      watchlistNotifyEarnings: true,
      watchlistNotifyExdiv: false,
      watchlistNotifyPayout: false,
      portfolioAutoNotify: true,
      portfolioNotifyEarnings: true,
      portfolioNotifyExdiv: true,
      portfolioNotifyPayout: true,
    };
  }

  function isCompanyInPortfolio(ticker, data) {
    const up = String(ticker || '').toUpperCase();
    const positions = data?.positions || [];
    if (positions.some((p) => p.ticker?.toUpperCase() === up && Number(p.shares) > 0)) return true;
    const comps = getCalendarCompanies(data);
    const c = comps.find((item) => item.ticker.toUpperCase() === up);
    return Boolean(c?.isPortfolio);
  }

  function getCompanyDefaultVisibility(ticker, data) {
    const isPort = isCompanyInPortfolio(ticker, data);
    const prefs = getUserPreferences(data);
    if (isPort) {
      return {
        earnings: prefs.portfolioNotifyEarnings !== false,
        exdiv: prefs.portfolioNotifyExdiv !== false,
        payout: prefs.portfolioNotifyPayout !== false,
      };
    }
    return {
      earnings: prefs.watchlistNotifyEarnings !== false,
      exdiv: Boolean(prefs.watchlistNotifyExdiv),
      payout: Boolean(prefs.watchlistNotifyPayout),
    };
  }

  function getCompanyVisibility(ticker, data) {
    const up = String(ticker || '').toUpperCase();
    const def = getCompanyDefaultVisibility(up, data);
    const custom = CS.calendarCompanyVisibility[up];
    if (!custom) return def;
    return {
      earnings: custom.earnings !== undefined ? Boolean(custom.earnings) : def.earnings,
      exdiv: custom.exdiv !== undefined ? Boolean(custom.exdiv) : def.exdiv,
      payout: custom.payout !== undefined ? Boolean(custom.payout) : def.payout,
    };
  }

  function hasCustomCompanyFilters(ticker, data) {
    const up = String(ticker || '').toUpperCase();
    const custom = CS.calendarCompanyVisibility[up];
    if (!custom) return false;
    const def = getCompanyDefaultVisibility(up, data);
    return (
      (custom.earnings !== undefined && Boolean(custom.earnings) !== def.earnings) ||
      (custom.exdiv !== undefined && Boolean(custom.exdiv) !== def.exdiv) ||
      (custom.payout !== undefined && Boolean(custom.payout) !== def.payout)
    );
  }

  function hasCustomCalendarFilters() {
    const hasAnyCustomCompany = Object.keys(CS.calendarCompanyVisibility).some((t) => hasCustomCompanyFilters(t));
    return (
      !CS.calendarVisibility.earnings ||
      !CS.calendarVisibility.exdiv ||
      !CS.calendarVisibility.payout ||
      !CS.calendarVisibility.portfolio ||
      !CS.calendarVisibility.watchlist ||
      hasAnyCustomCompany
    );
  }

window.escapeHtml = escapeHtml;
window.formatNumber = formatNumber;
window.fmtEur = fmtEur;
window.portfolioLogoHtml = portfolioLogoHtml;
window.loadCalendarVisibility = loadCalendarVisibility;
window.saveCalendarVisibility = saveCalendarVisibility;
window.loadCalendarCompanyVisibility = loadCalendarCompanyVisibility;
window.saveCalendarCompanyVisibility = saveCalendarCompanyVisibility;
window.getUserPreferences = getUserPreferences;
window.isCompanyInPortfolio = isCompanyInPortfolio;
window.getCompanyDefaultVisibility = getCompanyDefaultVisibility;
window.getCompanyVisibility = getCompanyVisibility;
window.hasCustomCompanyFilters = hasCustomCompanyFilters;
window.hasCustomCalendarFilters = hasCustomCalendarFilters;
window.CALENDAR_VISIBILITY_STORAGE_KEY = CALENDAR_VISIBILITY_STORAGE_KEY;
window.CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY = CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY;
window.fmt = fmt;
window.donutsMod = donutsMod;

})(window);
