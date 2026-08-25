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
