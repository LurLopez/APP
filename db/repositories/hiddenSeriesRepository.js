import { query } from '../pool.js';

/**
 * Lista los identificadores de series ocultas del gráfico de un usuario.
 * @param {number} userId - Identificador del usuario.
 * @returns {Promise<string[]>}
 */
export async function listHiddenSeries(userId) {
  const { rows } = await query(
    `SELECT series_id AS "seriesId"
     FROM user_hidden_chart_series
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map((row) => row.seriesId);
}

/**
 * Reemplaza por completo el conjunto de series ocultas del usuario.
 * @param {number} userId - Identificador del usuario.
 * @param {string[]} seriesIds - Identificadores de series que deben quedar ocultos.
 * @returns {Promise<string[]>} Estado final guardado.
 */
export async function replaceHiddenSeries(userId, seriesIds) {
  if (seriesIds.length) {
    const values = seriesIds.map((_, index) => `($1, $${index + 2})`).join(', ');
    await query(
      `INSERT INTO user_hidden_chart_series (user_id, series_id)
       VALUES ${values}
       ON CONFLICT (user_id, series_id) DO NOTHING`,
      [userId, ...seriesIds],
    );
  }
  await query(
    `DELETE FROM user_hidden_chart_series
     WHERE user_id = $1 AND series_id <> ALL($2::text[])`,
    [userId, seriesIds],
  );
  return listHiddenSeries(userId);
}
