import { query } from '../pool.js';

const FAVORITE_COLUMNS = 'id, user_id, ticker, company_name, created_at';

export async function listFavorites(userId) {
  const { rows } = await query(
    `SELECT ${FAVORITE_COLUMNS}
     FROM favorites
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows;
}

export async function addFavorite({ userId, ticker, companyName }) {
  const { rows } = await query(
    `INSERT INTO favorites (user_id, ticker, company_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, ticker) DO UPDATE SET company_name = EXCLUDED.company_name
     RETURNING ${FAVORITE_COLUMNS}`,
    [userId, ticker, companyName],
  );
  return rows[0];
}

export async function removeFavorite(userId, ticker) {
  await query(
    `DELETE FROM favorites WHERE user_id = $1 AND ticker = $2`,
    [userId, ticker],
  );
}

export async function findFavorite(userId, ticker) {
  const { rows } = await query(
    `SELECT ${FAVORITE_COLUMNS} FROM favorites WHERE user_id = $1 AND ticker = $2`,
    [userId, ticker],
  );
  return rows[0] ?? null;
}
