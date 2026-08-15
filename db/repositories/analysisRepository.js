import { query } from '../pool.js';

const ANALYSIS_COLUMNS = `
    id, user_id, filename, status, error, origin, sector, report,
    model_used, ticker, company_name, period_end, pdf_url, created_at
`;

export async function createAnalysis({
  userId = null,
  filename,
  status = 'processing',
  ticker = null,
  companyName = null,
  periodEnd = null,
  pdfUrl = null,
} = {}) {
  const { rows } = await query(
    `INSERT INTO analyses (user_id, filename, status, ticker, company_name, period_end, pdf_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${ANALYSIS_COLUMNS}`,
    [userId, filename, status, ticker, companyName, periodEnd, pdfUrl],
  );
  return rows[0];
}

export async function getAnalysisById(id) {
  const { rows } = await query(
    `SELECT ${ANALYSIS_COLUMNS} FROM analyses WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listAnalyses({
  userId = null,
  limit = 50,
  ticker = null,
  periodFrom = null,
  periodTo = null,
  createdFrom = null,
  createdTo = null,
} = {}) {
  const conditions = [];
  const params = [];

  if (userId !== null) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }

  if (ticker) {
    params.push(`%${ticker.toLowerCase()}%`);
    conditions.push(
      `(LOWER(COALESCE(ticker, '')) LIKE $${params.length} OR LOWER(COALESCE(company_name, '')) LIKE $${params.length})`,
    );
  }

  if (periodFrom) {
    params.push(periodFrom);
    conditions.push(`period_end >= $${params.length}`);
  }

  if (periodTo) {
    params.push(periodTo);
    conditions.push(`period_end <= $${params.length}`);
  }

  if (createdFrom) {
    params.push(createdFrom);
    conditions.push(`(created_at AT TIME ZONE 'UTC')::date >= $${params.length}`);
  }

  if (createdTo) {
    params.push(createdTo);
    conditions.push(`(created_at AT TIME ZONE 'UTC')::date <= $${params.length}`);
  }

  params.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT ${ANALYSIS_COLUMNS}
     FROM analyses
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function updateAnalysis(id, fields) {
  const allowed = [
    'status', 'error', 'origin', 'sector', 'report', 'model_used',
    'ticker', 'company_name', 'period_end', 'pdf_url',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));

  if (!entries.length) return null;

  const sets = entries
    .map(([key], index) => `${key} = $${index + 2}`)
    .join(', ');

  const { rows } = await query(
    `UPDATE analyses
     SET ${sets}
     WHERE id = $1
     RETURNING ${ANALYSIS_COLUMNS}`,
    [id, ...entries.map(([, value]) => value)],
  );
  return rows[0] ?? null;
}
