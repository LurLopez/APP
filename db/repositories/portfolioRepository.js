import { query } from '../pool.js';

const TRANSACTION_COLUMNS = 'id, user_id, ticker, company_name, type, shares, price, trade_date, created_at';

function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value ?? '').slice(0, 10);
}

export async function listTransactions(userId) {
  const { rows } = await query(
    `SELECT ${TRANSACTION_COLUMNS}
     FROM portfolio_transactions
     WHERE user_id = $1
     ORDER BY trade_date ASC, id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    type: row.type,
    shares: Number(row.shares),
    price: Number(row.price),
    tradeDate: toIsoDate(row.trade_date),
    createdAt: row.created_at,
  }));
}

export async function addTransaction(userId, transaction) {
  const { rows } = await query(
    `INSERT INTO portfolio_transactions (user_id, ticker, company_name, type, shares, price, trade_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [
      userId,
      transaction.ticker,
      transaction.companyName,
      transaction.type,
      transaction.shares,
      transaction.price,
      transaction.tradeDate,
    ],
  );
  const row = rows[0];
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    type: row.type,
    shares: Number(row.shares),
    price: Number(row.price),
    tradeDate: toIsoDate(row.trade_date),
    createdAt: row.created_at,
  };
}

export async function getTransaction(userId, transactionId) {
  const { rows } = await query(
    `SELECT ${TRANSACTION_COLUMNS} FROM portfolio_transactions WHERE user_id = $1 AND id = $2`,
    [userId, transactionId],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    type: row.type,
    shares: Number(row.shares),
    price: Number(row.price),
    tradeDate: toIsoDate(row.trade_date),
    createdAt: row.created_at,
  };
}

export async function deleteTransaction(userId, transactionId) {
  const { rows } = await query(
    `DELETE FROM portfolio_transactions WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, transactionId],
  );
  return rows[0]?.id ?? null;
}

/* ── Pestañas (tabs) ───────────────────────────────────────── */

const TAB_COLUMNS = 'id, user_id, name, color, created_at';

function toTab(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

export async function listTabs(userId) {
  const { rows } = await query(
    `SELECT ${TAB_COLUMNS} FROM portfolio_tabs WHERE user_id = $1 ORDER BY id ASC`,
    [userId],
  );
  return rows.map(toTab);
}

export async function createTab(userId, { name, color }) {
  const { rows } = await query(
    `INSERT INTO portfolio_tabs (user_id, name, color) VALUES ($1, $2, $3) RETURNING ${TAB_COLUMNS}`,
    [userId, name, color],
  );
  return toTab(rows[0]);
}

export async function getTab(userId, tabId) {
  const { rows } = await query(
    `SELECT ${TAB_COLUMNS} FROM portfolio_tabs WHERE user_id = $1 AND id = $2`,
    [userId, tabId],
  );
  return rows[0] ? toTab(rows[0]) : null;
}

export async function updateTab(userId, tabId, { name, color }) {
  const { rows } = await query(
    `UPDATE portfolio_tabs SET
       name = COALESCE($3, name),
       color = COALESCE($4, color)
     WHERE user_id = $1 AND id = $2
     RETURNING ${TAB_COLUMNS}`,
    [userId, tabId, name ?? null, color ?? null],
  );
  return rows[0] ? toTab(rows[0]) : null;
}

export async function deleteTab(userId, tabId) {
  const { rows } = await query(
    `DELETE FROM portfolio_tabs WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, tabId],
  );
  return rows[0]?.id ?? null;
}

/* ── Grupos ────────────────────────────────────────────────── */

const GROUP_COLUMNS = 'id, user_id, tab_id, name, color, created_at';

function toGroup(row) {
  return {
    id: row.id,
    tabId: row.tab_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

export async function listGroups(userId) {
  const { rows } = await query(
    `SELECT ${GROUP_COLUMNS} FROM portfolio_groups WHERE user_id = $1 ORDER BY id ASC`,
    [userId],
  );
  return rows.map(toGroup);
}

export async function createGroup(userId, { tabId, name, color }) {
  const { rows } = await query(
    `INSERT INTO portfolio_groups (user_id, tab_id, name, color) VALUES ($1, $2, $3, $4) RETURNING ${GROUP_COLUMNS}`,
    [userId, tabId, name, color],
  );
  return toGroup(rows[0]);
}

export async function getGroup(userId, groupId) {
  const { rows } = await query(
    `SELECT ${GROUP_COLUMNS} FROM portfolio_groups WHERE user_id = $1 AND id = $2`,
    [userId, groupId],
  );
  return rows[0] ? toGroup(rows[0]) : null;
}

export async function updateGroup(userId, groupId, { name, color }) {
  const { rows } = await query(
    `UPDATE portfolio_groups SET
       name = COALESCE($3, name),
       color = COALESCE($4, color)
     WHERE user_id = $1 AND id = $2
     RETURNING ${GROUP_COLUMNS}`,
    [userId, groupId, name ?? null, color ?? null],
  );
  return rows[0] ? toGroup(rows[0]) : null;
}

export async function deleteGroup(userId, groupId) {
  const { rows } = await query(
    `DELETE FROM portfolio_groups WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, groupId],
  );
  return rows[0]?.id ?? null;
}

/* ── Reglas de ticker (acción completa) ────────────────────── */

export async function listGroupRules(userId) {
  const { rows } = await query(
    `SELECT id, user_id, group_id, ticker
     FROM portfolio_group_rules WHERE user_id = $1 ORDER BY id ASC`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, groupId: row.group_id, ticker: row.ticker }));
}

export async function addTickerRule(userId, groupId, ticker) {
  const { rows } = await query(
    `INSERT INTO portfolio_group_rules (user_id, group_id, ticker) VALUES ($1, $2, $3) RETURNING id`,
    [userId, groupId, ticker],
  );
  return rows[0]?.id ?? null;
}

export async function removeTickerRule(userId, groupId, ticker) {
  const { rows } = await query(
    `DELETE FROM portfolio_group_rules WHERE user_id = $1 AND group_id = $2 AND ticker = $3 RETURNING id`,
    [userId, groupId, ticker],
  );
  return rows[0]?.id ?? null;
}

/* ── Asignaciones de lote (sublínea) ───────────────────────── */

export async function listGroupLots(userId) {
  const { rows } = await query(
    `SELECT id, user_id, group_id, buy_transaction_id
     FROM portfolio_group_lots WHERE user_id = $1 ORDER BY id ASC`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, groupId: row.group_id, buyTransactionId: row.buy_transaction_id }));
}

export async function addLotAssignment(userId, groupId, buyTransactionId) {
  const { rows } = await query(
    `INSERT INTO portfolio_group_lots (user_id, group_id, buy_transaction_id) VALUES ($1, $2, $3) RETURNING id`,
    [userId, groupId, buyTransactionId],
  );
  return rows[0]?.id ?? null;
}

export async function removeLotAssignment(userId, groupId, buyTransactionId) {
  const { rows } = await query(
    `DELETE FROM portfolio_group_lots WHERE user_id = $1 AND group_id = $2 AND buy_transaction_id = $3 RETURNING id`,
    [userId, groupId, buyTransactionId],
  );
  return rows[0]?.id ?? null;
}
