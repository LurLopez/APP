/**
 * @fileoverview Estado compartido del módulo WatchlistsState.
 */

(function (window) {

window.WatchlistsState = {
  userLogged: undefined,
  lists: [],
  byId: undefined,
  membership: undefined,
  calendarTickers: undefined,
  emailAlerts: undefined,
  sectionRoot: null,
  sectionOptions: {},
  selectedListId: null,
  sectionConfirmListId: null,
  sectionConfirmTimer: null,
  sectionCreating: false,
  creating: false,
};

})(window);
