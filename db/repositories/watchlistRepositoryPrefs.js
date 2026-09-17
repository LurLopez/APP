/**
 * @fileoverview Módulo extraído de watchlistRepository.js.
 */

import { query } from '../pool.js';

export async function addCalendarTicker(userId, ticker, companyName) {
  const { rows } = await query(
    `INSERT INTO user_calendar_tickers (user_id, ticker, company_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, ticker) DO UPDATE SET company_name = EXCLUDED.company_name
     RETURNING ticker, company_name AS companyName`,
    [userId, ticker, companyName || ticker],
  );
  return rows[0] ?? null;
}

export async function getEmailAlert(userId, ticker) {
  const { rows } = await query(
    `SELECT ticker, company_name, enabled, notify_earnings, notify_exdiv, notify_payout, created_at, updated_at
     FROM user_email_alerts
     WHERE user_id = $1 AND ticker = $2`,
    [userId, ticker],
  );
  if (!rows[0]) return null;
  return {
    ticker: rows[0].ticker,
    companyName: rows[0].company_name,
    enabled: Boolean(rows[0].enabled),
    notifyEarnings: Boolean(rows[0].notify_earnings),
    notifyExdiv: Boolean(rows[0].notify_exdiv),
    notifyPayout: Boolean(rows[0].notify_payout),
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  };
}

export async function upsertEmailAlert(userId, ticker, { companyName, enabled = true, notifyEarnings = true, notifyExdiv = true, notifyPayout = true }) {
  const { rows } = await query(
    `INSERT INTO user_email_alerts (user_id, ticker, company_name, enabled, notify_earnings, notify_exdiv, notify_payout, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (user_id, ticker) DO UPDATE SET
       company_name = COALESCE(EXCLUDED.company_name, user_email_alerts.company_name),
       enabled = EXCLUDED.enabled,
       notify_earnings = EXCLUDED.notify_earnings,
       notify_exdiv = EXCLUDED.notify_exdiv,
       notify_payout = EXCLUDED.notify_payout,
       updated_at = now()
     RETURNING ticker, company_name, enabled, notify_earnings, notify_exdiv, notify_payout`,
    [userId, ticker, companyName || ticker, enabled, notifyEarnings, notifyExdiv, notifyPayout],
  );
  // PostgreSQL devuelve los alias sin comillas en minúsculas: se construye el
  // objeto explícitamente (el mapeo anterior devolvía campos undefined).
  return rows[0] ? {
    ticker: rows[0].ticker,
    companyName: rows[0].company_name,
    enabled: Boolean(rows[0].enabled),
    notifyEarnings: Boolean(rows[0].notify_earnings),
    notifyExdiv: Boolean(rows[0].notify_exdiv),
    notifyPayout: Boolean(rows[0].notify_payout),
  } : null;
}

export const DEFAULT_USER_PREFERENCES = {
  language: 'es',
  analysisLanguage: 'es',
  theme: 'indigo',
  darkMode: false,
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

const ALLOWED_LANGUAGES = ['es', 'en'];

const ALLOWED_THEMES = ['indigo', 'naranja'];

function normalizeAppearancePrefs(prefs = {}) {
  const p = {};
  if (prefs.language !== undefined) {
    p.language = ALLOWED_LANGUAGES.includes(prefs.language) ? prefs.language : 'es';
  }
  if (prefs.analysisLanguage !== undefined) {
    p.analysisLanguage = ALLOWED_LANGUAGES.includes(prefs.analysisLanguage) ? prefs.analysisLanguage : 'es';
  }
  if (prefs.theme !== undefined) {
    p.theme = ALLOWED_THEMES.includes(prefs.theme) ? prefs.theme : 'indigo';
  }
  if (prefs.darkMode !== undefined) {
    p.darkMode = Boolean(prefs.darkMode);
  }
  return p;
}

export async function getUserPreferences(userId) {
  const { rows } = await query(
    `SELECT language, analysis_language, theme, dark_mode,
            watchlist_auto_calendar, watchlist_auto_notify, watchlist_notify_earnings, watchlist_notify_exdiv, watchlist_notify_payout,
            portfolio_auto_notify, portfolio_notify_earnings, portfolio_notify_exdiv, portfolio_notify_payout
     FROM user_preferences
     WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) return { ...DEFAULT_USER_PREFERENCES };
  const r = rows[0];
  return {
    language: r.language ?? 'es',
    analysisLanguage: r.analysis_language ?? 'es',
    theme: r.theme ?? 'indigo',
    darkMode: Boolean(r.dark_mode),
    watchlistAutoCalendar: Boolean(r.watchlist_auto_calendar),
    watchlistAutoNotify: Boolean(r.watchlist_auto_notify),
    watchlistNotifyEarnings: Boolean(r.watchlist_notify_earnings),
    watchlistNotifyExdiv: Boolean(r.watchlist_notify_exdiv),
    watchlistNotifyPayout: Boolean(r.watchlist_notify_payout),
    portfolioAutoNotify: Boolean(r.portfolio_auto_notify),
    portfolioNotifyEarnings: Boolean(r.portfolio_notify_earnings),
    portfolioNotifyExdiv: Boolean(r.portfolio_notify_exdiv),
    portfolioNotifyPayout: Boolean(r.portfolio_notify_payout),
  };
}

export async function updateUserPreferences(userId, prefs = {}) {
  const current = await getUserPreferences(userId);
  const p = { ...current, ...prefs };
  const appearance = normalizeAppearancePrefs(p);
  const { rows } = await query(
    `INSERT INTO user_preferences (
       user_id,
       language, analysis_language, theme, dark_mode,
       watchlist_auto_calendar, watchlist_auto_notify, watchlist_notify_earnings, watchlist_notify_exdiv, watchlist_notify_payout,
       portfolio_auto_notify, portfolio_notify_earnings, portfolio_notify_exdiv, portfolio_notify_payout,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
     ON CONFLICT (user_id) DO UPDATE SET
       language = EXCLUDED.language,
       analysis_language = EXCLUDED.analysis_language,
       theme = EXCLUDED.theme,
       dark_mode = EXCLUDED.dark_mode,
       watchlist_auto_calendar = EXCLUDED.watchlist_auto_calendar,
       watchlist_auto_notify = EXCLUDED.watchlist_auto_notify,
       watchlist_notify_earnings = EXCLUDED.watchlist_notify_earnings,
       watchlist_notify_exdiv = EXCLUDED.watchlist_notify_exdiv,
       watchlist_notify_payout = EXCLUDED.watchlist_notify_payout,
       portfolio_auto_notify = EXCLUDED.portfolio_auto_notify,
       portfolio_notify_earnings = EXCLUDED.portfolio_notify_earnings,
       portfolio_notify_exdiv = EXCLUDED.portfolio_notify_exdiv,
       portfolio_notify_payout = EXCLUDED.portfolio_notify_payout,
       updated_at = now()
     RETURNING language, analysis_language AS "analysisLanguage", theme, dark_mode AS "darkMode",
               watchlist_auto_calendar AS "watchlistAutoCalendar",
               watchlist_auto_notify AS "watchlistAutoNotify",
               watchlist_notify_earnings AS "watchlistNotifyEarnings",
               watchlist_notify_exdiv AS "watchlistNotifyExdiv",
               watchlist_notify_payout AS "watchlistNotifyPayout",
               portfolio_auto_notify AS "portfolioAutoNotify",
               portfolio_notify_earnings AS "portfolioNotifyEarnings",
               portfolio_notify_exdiv AS "portfolioNotifyExdiv",
               portfolio_notify_payout AS "portfolioNotifyPayout"`,
    [
      userId,
      appearance.language ?? 'es',
      appearance.analysisLanguage ?? 'es',
      appearance.theme ?? 'indigo',
      Boolean(appearance.darkMode),
      Boolean(p.watchlistAutoCalendar),
      Boolean(p.watchlistAutoNotify),
      Boolean(p.watchlistNotifyEarnings),
      Boolean(p.watchlistNotifyExdiv),
      Boolean(p.watchlistNotifyPayout),
      Boolean(p.portfolioAutoNotify),
      Boolean(p.portfolioNotifyEarnings),
      Boolean(p.portfolioNotifyExdiv),
      Boolean(p.portfolioNotifyPayout),
    ],
  );
  return rows[0] ?? { ...DEFAULT_USER_PREFERENCES };
}

export async function applyWatchlistAddDefaults(userId, ticker, companyName) {
  const prefs = await getUserPreferences(userId);
  if (prefs.watchlistAutoCalendar) {
    await addCalendarTicker(userId, ticker, companyName);
  }
  if (prefs.watchlistAutoNotify) {
    const existing = await getEmailAlert(userId, ticker);
    const enabled = (existing?.enabled ?? false) || prefs.watchlistAutoNotify;
    const notifyEarnings = (existing?.notifyEarnings ?? false) || (prefs.watchlistAutoNotify && prefs.watchlistNotifyEarnings);
    const notifyExdiv = (existing?.notifyExdiv ?? false) || (prefs.watchlistAutoNotify && prefs.watchlistNotifyExdiv);
    const notifyPayout = (existing?.notifyPayout ?? false) || (prefs.watchlistAutoNotify && prefs.watchlistNotifyPayout);

    await upsertEmailAlert(userId, ticker, {
      companyName,
      enabled,
      notifyEarnings,
      notifyExdiv,
      notifyPayout,
    });
  }
}

export async function applyPortfolioAddDefaults(userId, ticker, companyName) {
  const prefs = await getUserPreferences(userId);
  if (prefs.portfolioAutoNotify) {
    const existing = await getEmailAlert(userId, ticker);
    const enabled = (existing?.enabled ?? false) || prefs.portfolioAutoNotify;
    const notifyEarnings = (existing?.notifyEarnings ?? false) || (prefs.portfolioAutoNotify && prefs.portfolioNotifyEarnings);
    const notifyExdiv = (existing?.notifyExdiv ?? false) || (prefs.portfolioAutoNotify && prefs.portfolioNotifyExdiv);
    const notifyPayout = (existing?.notifyPayout ?? false) || (prefs.portfolioAutoNotify && prefs.portfolioNotifyPayout);

    await upsertEmailAlert(userId, ticker, {
      companyName,
      enabled,
      notifyEarnings,
      notifyExdiv,
      notifyPayout,
    });
  }
}

export async function removeCalendarTicker(userId, ticker) {
  await query(
    `DELETE FROM user_calendar_tickers
     WHERE user_id = $1 AND ticker = $2`,
    [userId, ticker],
  );
}
