import { query } from '../pool.js';

export async function listPriceAlerts(userId) {
  const { rows } = await query(
    `SELECT id, ticker, company_name AS "companyName",
            target_price::float AS "targetPrice", condition, status,
            triggered_at AS "triggeredAt",
            triggered_price::float AS "triggeredPrice",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM user_price_alerts
     WHERE user_id = $1
     ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
              created_at DESC`,
    [userId],
  );
  return rows;
}

export async function createPriceAlert(userId, { ticker, companyName, targetPrice, condition }) {
  const { rows } = await query(
    `INSERT INTO user_price_alerts (user_id, ticker, company_name, target_price, condition, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, ticker, company_name AS "companyName",
               target_price::float AS "targetPrice", condition, status,
               triggered_at AS "triggeredAt",
               triggered_price::float AS "triggeredPrice",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [userId, ticker, companyName || ticker, targetPrice, condition],
  );
  return rows[0] || null;
}

export async function deletePriceAlert(userId, alertId) {
  const { rows } = await query(
    `DELETE FROM user_price_alerts
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [alertId, userId],
  );
  return rows.length > 0;
}

export async function getActivePendingPriceAlerts() {
  const { rows } = await query(
    `SELECT a.id, a.user_id AS "userId", u.email, a.ticker,
            a.company_name AS "companyName",
            a.target_price::float AS "targetPrice",
            a.condition, a.status
     FROM user_price_alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.status = 'pending'
     ORDER BY a.created_at ASC`,
  );
  return rows;
}

export async function markPriceAlertTriggered(alertId, triggeredPrice) {
  const { rows } = await query(
    `UPDATE user_price_alerts
     SET status = 'triggered',
         triggered_at = now(),
         triggered_price = $2,
         updated_at = now()
     WHERE id = $1
     RETURNING id, status, triggered_at AS "triggeredAt", triggered_price::float AS "triggeredPrice"`,
    [alertId, triggeredPrice],
  );
  return rows[0] || null;
}
