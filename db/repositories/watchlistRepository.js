import { query } from '../pool.js';

export const DEFAULT_WATCHLIST_NAME = 'Favoritos';

const WATCHLIST_COLUMNS = 'id, user_id, name, is_default, created_at';

export async function ensureDefaultWatchlist(userId) {
  await query(
    `INSERT INTO watchlists (user_id, name, is_default)
     VALUES ($1, $2, true)
     ON CONFLICT (user_id, name) DO NOTHING`,
    [userId, DEFAULT_WATCHLIST_NAME],
  );
}

export async function listWatchlists(userId) {
  await ensureDefaultWatchlist(userId);
  const { rows } = await query(
    `SELECT w.id, w.name, w.is_default, w.created_at,
            COALESCE(json_agg(json_build_object(
              'ticker', i.ticker,
              'companyName', i.company_name
            ) ORDER BY i.created_at DESC, i.id DESC)
              FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM watchlists w
     LEFT JOIN watchlist_items i ON i.watchlist_id = w.id
     WHERE w.user_id = $1
     GROUP BY w.id
     ORDER BY w.is_default DESC, w.created_at ASC, w.id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    createdAt: row.created_at,
    items: row.items,
  }));
}

export async function getWatchlist(userId, watchlistId) {
  const { rows } = await query(
    `SELECT ${WATCHLIST_COLUMNS} FROM watchlists WHERE user_id = $1 AND id = $2`,
    [userId, watchlistId],
  );
  return rows[0] ?? null;
}

export async function listWatchlistItems(userId, watchlistId) {
  const { rows } = await query(
    `SELECT i.id, i.ticker, i.company_name, i.created_at
     FROM watchlist_items i
     JOIN watchlists w ON w.id = i.watchlist_id
     WHERE w.user_id = $1 AND w.id = $2
     ORDER BY i.created_at DESC, i.id DESC`,
    [userId, watchlistId],
  );
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    createdAt: row.created_at,
  }));
}

export async function createWatchlist(userId, name) {
  const { rows } = await query(
    `INSERT INTO watchlists (user_id, name)
     VALUES ($1, $2)
     RETURNING ${WATCHLIST_COLUMNS}`,
    [userId, name],
  );
  return rows[0];
}

export async function renameWatchlist(userId, watchlistId, name) {
  const { rows } = await query(
    `UPDATE watchlists SET name = $3
     WHERE user_id = $1 AND id = $2
     RETURNING ${WATCHLIST_COLUMNS}`,
    [userId, watchlistId, name],
  );
  return rows[0] ?? null;
}

export async function deleteWatchlist(userId, watchlistId) {
  const { rows } = await query(
    `DELETE FROM watchlists WHERE user_id = $1 AND id = $2
     RETURNING id`,
    [userId, watchlistId],
  );
  return rows[0]?.id ?? null;
}

export async function addItem(userId, watchlistId, ticker, companyName) {
  const { rows } = await query(
    `INSERT INTO watchlist_items (watchlist_id, ticker, company_name)
     SELECT id, $3, $4 FROM watchlists WHERE user_id = $1 AND id = $2
     ON CONFLICT (watchlist_id, ticker) DO UPDATE SET company_name = EXCLUDED.company_name
     RETURNING id, ticker, company_name AS companyName, created_at AS createdAt`,
    [userId, watchlistId, ticker, companyName],
  );
  return rows[0] ?? null;
}

export async function removeItem(userId, watchlistId, ticker) {
  await query(
    `DELETE FROM watchlist_items i
     USING watchlists w
     WHERE i.watchlist_id = w.id AND w.user_id = $1 AND w.id = $2 AND i.ticker = $3`,
    [userId, watchlistId, ticker],
  );
}

export async function removeItemFromAllLists(userId, ticker) {
  await query(
    `DELETE FROM watchlist_items i
     USING watchlists w
     WHERE i.watchlist_id = w.id AND w.user_id = $1 AND i.ticker = $2`,
    [userId, ticker],
  );
}

export async function listCalendarTickers(userId) {
  const { rows } = await query(
    `SELECT ticker, company_name, created_at
     FROM user_calendar_tickers
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    ticker: row.ticker,
    companyName: row.company_name,
    createdAt: row.created_at,
  }));
}

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

export async function removeCalendarTicker(userId, ticker) {
  await query(
    `DELETE FROM user_calendar_tickers
     WHERE user_id = $1 AND ticker = $2`,
    [userId, ticker],
  );
}

export async function listEmailAlerts(userId) {
  const { rows } = await query(
    `SELECT ticker, company_name, enabled, notify_earnings, notify_exdiv, notify_payout, created_at, updated_at
     FROM user_email_alerts
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    ticker: row.ticker,
    companyName: row.company_name,
    enabled: Boolean(row.enabled),
    notifyEarnings: Boolean(row.notify_earnings),
    notifyExdiv: Boolean(row.notify_exdiv),
    notifyPayout: Boolean(row.notify_payout),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
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
     RETURNING ticker, company_name AS companyName, enabled, notify_earnings AS notifyEarnings, notify_exdiv AS notifyExdiv, notify_payout AS notifyPayout`,
    [userId, ticker, companyName || ticker, enabled, notifyEarnings, notifyExdiv, notifyPayout],
  );
  return rows[0] ? {
    ticker: rows[0].ticker,
    companyName: rows[0].companyname,
    enabled: Boolean(rows[0].enabled),
    notifyEarnings: Boolean(rows[0].notifyearnings),
    notifyExdiv: Boolean(rows[0].notifyexdiv),
    notifyPayout: Boolean(rows[0].notifypayout),
  } : null;
}

export async function autoEnableEmailAlertIfMissing(userId, ticker, companyName) {
  const { rows } = await query(
    `INSERT INTO user_email_alerts (user_id, ticker, company_name, enabled, notify_earnings, notify_exdiv, notify_payout)
     VALUES ($1, $2, $3, true, true, true, true)
     ON CONFLICT (user_id, ticker) DO NOTHING
     RETURNING ticker, company_name AS companyName, enabled, notify_earnings AS notifyEarnings, notify_exdiv AS notifyExdiv, notify_payout AS notifyPayout`,
    [userId, ticker, companyName || ticker],
  );
  return rows[0] ?? null;
}

export async function deleteEmailAlert(userId, ticker) {
  await query(
    `DELETE FROM user_email_alerts
     WHERE user_id = $1 AND ticker = $2`,
    [userId, ticker],
  );
}

export async function getAllActiveAlertSubscriptions() {
  const { rows } = await query(
    `SELECT a.user_id, u.email, u.email_verified, a.ticker, a.company_name,
            a.notify_earnings, a.notify_exdiv, a.notify_payout
     FROM user_email_alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.enabled = true`,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    ticker: row.ticker,
    companyName: row.company_name,
    notifyEarnings: Boolean(row.notify_earnings),
    notifyExdiv: Boolean(row.notify_exdiv),
    notifyPayout: Boolean(row.notify_payout),
  }));
}

export async function hasSentAlert(userId, eventKey) {
  const { rows } = await query(
    `SELECT id FROM sent_email_alerts WHERE user_id = $1 AND event_key = $2 LIMIT 1`,
    [userId, eventKey],
  );
  return rows.length > 0;
}

export async function recordSentAlert(userId, ticker, eventType, eventKey) {
  await query(
    `INSERT INTO sent_email_alerts (user_id, ticker, event_type, event_key, sent_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, event_key) DO NOTHING`,
    [userId, ticker, eventType, eventKey],
  );
}

export const DEFAULT_USER_PREFERENCES = {
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

export async function getUserPreferences(userId) {
  const { rows } = await query(
    `SELECT watchlist_auto_calendar, watchlist_auto_notify, watchlist_notify_earnings, watchlist_notify_exdiv, watchlist_notify_payout,
            portfolio_auto_notify, portfolio_notify_earnings, portfolio_notify_exdiv, portfolio_notify_payout
     FROM user_preferences
     WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) return { ...DEFAULT_USER_PREFERENCES };
  const r = rows[0];
  return {
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
  const { rows } = await query(
    `INSERT INTO user_preferences (
       user_id,
       watchlist_auto_calendar, watchlist_auto_notify, watchlist_notify_earnings, watchlist_notify_exdiv, watchlist_notify_payout,
       portfolio_auto_notify, portfolio_notify_earnings, portfolio_notify_exdiv, portfolio_notify_payout,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (user_id) DO UPDATE SET
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
     RETURNING watchlist_auto_calendar AS "watchlistAutoCalendar",
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



