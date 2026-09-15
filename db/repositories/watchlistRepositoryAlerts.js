/**
 * @fileoverview Módulo extraído de watchlistRepository.js.
 */

import { query } from '../pool.js';

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

export async function autoEnableEmailAlertIfMissing(userId, ticker, companyName) {
  const { rows } = await query(
    `INSERT INTO user_email_alerts (user_id, ticker, company_name, enabled, notify_earnings, notify_exdiv, notify_payout)
     VALUES ($1, $2, $3, true, true, true, true)
     ON CONFLICT (user_id, ticker) DO NOTHING
     RETURNING ticker, company_name, enabled, notify_earnings, notify_exdiv, notify_payout`,
    [userId, ticker, companyName || ticker],
  );
  return rows[0] ? {
    ticker: rows[0].ticker,
    companyName: rows[0].company_name,
    enabled: Boolean(rows[0].enabled),
    notifyEarnings: Boolean(rows[0].notify_earnings),
    notifyExdiv: Boolean(rows[0].notify_exdiv),
    notifyPayout: Boolean(rows[0].notify_payout),
  } : null;
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
