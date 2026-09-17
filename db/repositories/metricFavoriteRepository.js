import { query } from '../pool.js';

/**
 * Métricas favoritas que recibe todo usuario nuevo al registrarse.
 * Las claves se corresponden con las definiciones de `statementDisplay.js`.
 */
export const DEFAULT_METRIC_FAVORITES = [
  { statement: 'income', key: 'revenue', label: 'Ingresos totales' },
  { statement: 'income', key: 'grossProfit', label: 'Beneficio bruto' },
  { statement: 'income', key: 'grossProfitMargin', label: '% Márgenes brutos' },
  { statement: 'income', key: 'operatingIncome', label: 'Beneficio operativo' },
  { statement: 'income', key: 'operatingIncomeMargin', label: '% Márgenes operativos' },
  { statement: 'income', key: 'netIncomeToCommonIncludingUnusual', label: 'Beneficio neto a acciones comunes' },
  { statement: 'income', key: 'netIncomeMargin', label: 'Margen de beneficio neto %' },
  { statement: 'cashflow', key: 'cfo', label: 'Efectivo de Operaciones' },
  { statement: 'cashflow', key: 'capex', label: 'Gastos de capital' },
  { statement: 'cashflow', key: 'dividendsCommon', label: 'Dividendos comunes pagados' },
  { statement: 'cashflow', key: 'buybacks', label: 'Recompra de acciones comunes' },
  { statement: 'cashflow', key: 'acquisitions', label: 'Adquisiciones con efectivo' },
];

/**
 * Inserta las métricas favoritas por defecto para un usuario nuevo.
 * No sobrescribe favoritos existentes.
 * @param {number} userId - Identificador del usuario.
 * @returns {Promise<number>} Número de favoritos insertados.
 */
export async function seedDefaultMetricFavorites(userId) {
  const values = [];
  const params = [userId];
  DEFAULT_METRIC_FAVORITES.forEach((favorite, index) => {
    const base = 2 + index * 3;
    values.push(`($1, $${base}, $${base + 1}, $${base + 2})`);
    params.push(favorite.statement, favorite.key, favorite.label);
  });
  const { rowCount } = await query(
    `INSERT INTO user_metric_favorites (user_id, statement, metric_key, label)
     VALUES ${values.join(', ')}
     ON CONFLICT (user_id, statement, metric_key) DO NOTHING`,
    params,
  );
  return rowCount;
}

/**
 * Cuenta las métricas favoritas de un usuario.
 * @param {number} userId - Identificador del usuario.
 * @returns {Promise<number>}
 */
export async function countMetricFavorites(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM user_metric_favorites WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.total ?? 0;
}

/**
 * Lista las métricas favoritas de un usuario.
 * @param {number} userId - Identificador del usuario.
 * @returns {Promise<Array<{statement: string, key: string, label: string, createdAt: Date}>>}
 */
export async function listMetricFavorites(userId) {
  const { rows } = await query(
    `SELECT statement, metric_key AS key, label, created_at AS "createdAt"
     FROM user_metric_favorites
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );
  return rows;
}

/**
 * Añade (o actualiza la etiqueta de) una métrica favorita del usuario.
 * @param {number} userId - Identificador del usuario.
 * @param {string} statement - Estado financiero ('income' | 'balance' | 'cashflow' | 'ratios').
 * @param {string} metricKey - Clave de la métrica.
 * @param {string} label - Etiqueta visible de la métrica.
 * @returns {Promise<Object|null>} Favorito guardado.
 */
export async function addMetricFavorite(userId, statement, metricKey, label) {
  const { rows } = await query(
    `INSERT INTO user_metric_favorites (user_id, statement, metric_key, label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, statement, metric_key)
     DO UPDATE SET label = EXCLUDED.label
     RETURNING statement, metric_key AS key, label, created_at AS "createdAt"`,
    [userId, statement, metricKey, label],
  );
  return rows[0] || null;
}

/**
 * Elimina una métrica favorita del usuario.
 * @param {number} userId - Identificador del usuario.
 * @param {string} statement - Estado financiero.
 * @param {string} metricKey - Clave de la métrica.
 * @returns {Promise<boolean>} Verdadero si existía y se eliminó.
 */
export async function removeMetricFavorite(userId, statement, metricKey) {
  const { rows } = await query(
    `DELETE FROM user_metric_favorites
     WHERE user_id = $1 AND statement = $2 AND metric_key = $3
     RETURNING id`,
    [userId, statement, metricKey],
  );
  return rows.length > 0;
}
