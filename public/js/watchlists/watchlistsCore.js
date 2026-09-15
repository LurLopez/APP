/**
 * @fileoverview Estado y operaciones de las listas de seguimiento.
 */

(function (window) {
  const WS = window.WatchlistsState;
    const emailAlertDebounceMap = new Map();

  function emitChange() {
    window.dispatchEvent(new CustomEvent('watchlists:change'));
  }

  function rebuildState(data) {
    WS.lists = Array.isArray(data?.watchlists) ? data.watchlists : [];
    WS.byId = new Map(WS.lists.map((list) => [list.id, list]));
    WS.membership = new Map();
    WS.lists.forEach((list) => {
      (list.tickers ?? []).forEach((item) => {
        const ticker = String(item.ticker ?? '').toUpperCase();
        if (!WS.membership.has(ticker)) WS.membership.set(ticker, new Set());
        WS.membership.get(ticker).add(list.id);
      });
    });
    WS.calendarTickers = new Set((data?.calendarTickers ?? []).map((t) => String(t).toUpperCase()));
    WS.emailAlerts = new Map();
    if (data?.emailAlerts && typeof data.emailAlerts === 'object') {
      Object.entries(data.emailAlerts).forEach(([t, alert]) => {
        WS.emailAlerts.set(t.toUpperCase(), {
          enabled: Boolean(alert.enabled),
          notifyEarnings: Boolean(alert.notifyEarnings),
          notifyExdiv: Boolean(alert.notifyExdiv),
          notifyPayout: Boolean(alert.notifyPayout),
        });
      });
    }
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error del servidor.');
    return data;
  }

  function reset() {
    WS.lists = [];
    WS.byId = new Map();
    WS.membership = new Map();
    WS.calendarTickers = new Set();
    WS.emailAlerts = new Map();
    window.WatchlistsPopover.close();
    emitChange();
  }

  async function refresh() {
    if (!WS.userLogged) return reset();
    try {
      const response = await fetch('/api/watchlists');
      if (!response.ok) throw new Error('No se pudieron cargar las listas.');
      const data = await response.json().catch(() => null);
      rebuildState(data);
      emitChange();
      if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();
    } catch {
      reset();
    }
  }

  function setAuthenticated(value) {
    WS.userLogged = Boolean(value);
    if (!WS.userLogged) reset();
    else refresh();
  }

  function isInAnyList(ticker) {
    const ids = WS.membership.get(String(ticker ?? '').toUpperCase());
    return Boolean(ids && ids.size);
  }

  function listsContaining(ticker) {
    return WS.membership.get(String(ticker ?? '').toUpperCase()) ?? new Set();
  }

  function isInCalendar(ticker) {
    return WS.calendarTickers.has(String(ticker ?? '').toUpperCase());
  }

  function getEmailAlert(ticker) {
    const t = String(ticker ?? '').toUpperCase();
    return WS.emailAlerts.get(t) || {
      enabled: false,
      notifyEarnings: true,
      notifyExdiv: true,
      notifyPayout: true,
    };
  }

  function getList(listId) {
    return WS.byId.get(Number(listId));
  }

  function defaultList() {
    return WS.lists.find((list) => list.isDefault) ?? null;
  }

  function listItems(listId) {
    const list = getList(listId);
    if (!list) return new Set();
    return new Set(list.tickers.map((item) => String(item.ticker).toUpperCase()));
  }

  async function toggleCalendar(ticker, companyName) {
    if (!WS.userLogged) {
      window.showToast?.('Inicia sesión para gestionar el calendario.');
      return window.openModal?.('login');
    }
    ticker = String(ticker).toUpperCase();
    if (typeof Portfolio !== 'undefined' && Portfolio.hasPosition?.(ticker)) {
      return window.showToast?.(`${ticker} está en tu cartera y siempre aparece en el calendario.`);
    }
    const adding = !WS.calendarTickers.has(ticker);
    if (adding) WS.calendarTickers.add(ticker);
    else WS.calendarTickers.delete(ticker);

    emitChange();
    if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();
    window.dispatchEvent(new CustomEvent('portfolio:change'));

    try {
      if (adding) {
        await api('/api/watchlists/calendar/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, companyName }),
        });
        window.showToast?.(`${ticker} añadida al calendario.`);
      } else {
        await api(`/api/watchlists/calendar/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
        window.showToast?.(`${ticker} quitada del calendario.`);
      }
      await refresh();
      window.dispatchEvent(new CustomEvent('portfolio:change'));
    } catch (error) {
      await refresh();
      window.showToast?.(error.message);
    }
  }

  function saveEmailAlert(ticker, companyName, newAlert) {
    if (!WS.userLogged) {
      window.showToast?.('Inicia sesión para configurar alertas por email.');
      return window.openModal?.('login');
    }
    const t = String(ticker).toUpperCase();
    WS.emailAlerts.set(t, newAlert);
    emitChange();
    if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();

    if (emailAlertDebounceMap.has(t)) clearTimeout(emailAlertDebounceMap.get(t));
    const timer = setTimeout(async () => {
      emailAlertDebounceMap.delete(t);
      try {
        await api('/api/watchlists/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: t,
            companyName,
            enabled: newAlert.enabled,
            notifyEarnings: newAlert.notifyEarnings,
            notifyExdiv: newAlert.notifyExdiv,
            notifyPayout: newAlert.notifyPayout,
          }),
        });
      } catch (error) {
        console.error('Error al guardar alertas:', error);
      }
    }, 250);
    emailAlertDebounceMap.set(t, timer);
  }

  async function toggleEmailMain(ticker, companyName) {
    const current = getEmailAlert(ticker);
    const newEnabled = !current.enabled;
    const allSubsOff = !current.notifyEarnings && !current.notifyExdiv && !current.notifyPayout;
    saveEmailAlert(ticker, companyName, {
      enabled: newEnabled,
      notifyEarnings: newEnabled ? (allSubsOff ? true : current.notifyEarnings) : current.notifyEarnings,
      notifyExdiv: newEnabled ? (allSubsOff ? true : current.notifyExdiv) : current.notifyExdiv,
      notifyPayout: newEnabled ? (allSubsOff ? true : current.notifyPayout) : current.notifyPayout,
    });
  }

  async function toggleEmailSub(ticker, companyName, subType) {
    const current = getEmailAlert(ticker);
    const newAlert = { ...current };
    if (subType === 'earnings') newAlert.notifyEarnings = !newAlert.notifyEarnings;
    if (subType === 'exdiv') newAlert.notifyExdiv = !newAlert.notifyExdiv;
    if (subType === 'payout') newAlert.notifyPayout = !newAlert.notifyPayout;
    newAlert.enabled = Boolean(newAlert.notifyEarnings || newAlert.notifyExdiv || newAlert.notifyPayout);
    saveEmailAlert(ticker, companyName, newAlert);
  }

  async function toggle(listId, ticker, companyName) {
    if (!WS.userLogged) {
      window.showToast?.('Inicia sesión para guardar acciones en listas de seguimiento.');
      return window.openModal?.('login');
    }
    ticker = String(ticker).toUpperCase();
    listId = Number(listId);
    const ids = listsContaining(ticker);
    const adding = !ids.has(listId);

    if (adding) {
      ids.add(listId);
      if (!WS.calendarTickers.has(ticker)) WS.calendarTickers.add(ticker);
      if (!WS.emailAlerts.has(ticker)) {
        WS.emailAlerts.set(ticker, { enabled: true, notifyEarnings: true, notifyExdiv: true, notifyPayout: true });
      }
    } else {
      ids.delete(listId);
    }
    emitChange();
    if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();

    try {
      if (adding) {
        await api(`/api/watchlists/${listId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, companyName }),
        });
      } else {
        await api(`/api/watchlists/${listId}/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
      }
      await refresh();
      window.dispatchEvent(new CustomEvent('portfolio:change'));
    } catch (error) {
      await refresh();
      window.showToast?.(error.message);
    }
  }

window.emitChange = emitChange;
window.rebuildState = rebuildState;
window.api = api;
window.reset = reset;
window.refresh = refresh;
window.setAuthenticated = setAuthenticated;
window.isInAnyList = isInAnyList;
window.listsContaining = listsContaining;
window.isInCalendar = isInCalendar;
window.getEmailAlert = getEmailAlert;
window.getList = getList;
window.defaultList = defaultList;
window.listItems = listItems;
window.toggleCalendar = toggleCalendar;
window.saveEmailAlert = saveEmailAlert;
window.toggleEmailMain = toggleEmailMain;
window.toggleEmailSub = toggleEmailSub;
window.toggle = toggle;
window.emailAlertDebounceMap = emailAlertDebounceMap;

})(window);
