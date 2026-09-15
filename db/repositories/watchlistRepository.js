import { query } from '../pool.js';
import * as watchlistRepositoryLists from './watchlistRepositoryLists.js';
import * as watchlistRepositoryPrefs from './watchlistRepositoryPrefs.js';
import * as watchlistRepositoryAlerts from './watchlistRepositoryAlerts.js';

export { DEFAULT_WATCHLIST_NAME, ensureDefaultWatchlist, listWatchlists, getWatchlist, createWatchlist, renameWatchlist, listWatchlistItems, deleteWatchlist, addItem, removeItem, removeItemFromAllLists, listCalendarTickers } from './watchlistRepositoryLists.js';
export { addCalendarTicker, getEmailAlert, upsertEmailAlert, DEFAULT_USER_PREFERENCES, getUserPreferences, updateUserPreferences, applyWatchlistAddDefaults, applyPortfolioAddDefaults, removeCalendarTicker } from './watchlistRepositoryPrefs.js';
export { listEmailAlerts, autoEnableEmailAlertIfMissing, deleteEmailAlert, getAllActiveAlertSubscriptions, hasSentAlert, recordSentAlert } from './watchlistRepositoryAlerts.js';

/** Agregado de todas las operaciones del repositorio de listas de seguimiento. */
export const watchlistRepository = {
  ...watchlistRepositoryLists,
  ...watchlistRepositoryPrefs,
  ...watchlistRepositoryAlerts,
};

