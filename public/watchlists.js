/**
 * @fileoverview Orquestador del estado compartido de Listas de Seguimiento y Notificaciones.
 * Gestiona la sincronización de listas con el servidor y la sección de favoritos en el dashboard.
 * @module Watchlists
 */

const Watchlists = (() => {
  const WS = window.WatchlistsState;
  WS.userLogged = Boolean(window.AuthModule?.getUser?.() || window.currentUser);
  WS.byId = new Map();
  WS.membership = new Map();
  WS.calendarTickers = new Set();
  WS.emailAlerts = new Map();

  window.addEventListener('watchlists:change', () => {
    if (WS.sectionRoot) renderSection();
  });

  window.addEventListener('auth:change', (event) => {
    setAuthenticated(Boolean(event.detail?.user));
  });

  if (window.AuthModule?.isReady()) {
    setAuthenticated(Boolean(window.AuthModule.getUser()));
  } else if (window.AuthModule?.whenReady) {
    window.AuthModule.whenReady().then((user) => {
      setAuthenticated(Boolean(user));
    });
  } else if (window.currentUser) {
    setAuthenticated(true);
  }

  const apiObj = {
    refresh,
    reset,
    setAuthenticated,
    open: (...args) => window.WatchlistsPopover.open(...args),
    close: () => window.WatchlistsPopover.close(),
    toggle,
    isInAnyList,
    listsContaining,
    isInCalendar,
    getCalendarTickers: () => [...WS.calendarTickers],
    toggleCalendar,
    getEmailAlert,
    saveEmailAlert,
    toggleEmailMain,
    toggleEmailSub,
    listItems,
    getList,
    getLists: () => WS.lists,
    defaultList,
    mountSection,
    isLogged: () => WS.userLogged,
    handleCreate,
    doDelete,
  };

  window.WatchlistsPopover.init(apiObj);
  return apiObj;
})();
