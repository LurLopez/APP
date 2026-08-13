import { query } from '../pool.js';

const ANALYSIS_COLUMNS = `
    id, user_id, filename, status, error, origin, sector, report,
    model_used, created_at
`;

export async function createAnalysis({ userId = null, filename, status = 'processing' }) {
  const { rows } = await query(
    `INSERT INTO analyses (user_id, filename, status)
     VALUES ($1, $2, $3)
     RETURNING ${ANALYSIS_COLUMNS}`,
    [userId, filename, status],
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

export async function listAnalyses({ userId = null, limit = 50 } = {}) {
  const params = [];
  let where = '';

  if (userId !== null) {
    params.push(userId);
    where = 'WHERE user_id = $1';
  }

  params.push(limit);
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
  const allowed = ['status', 'error', 'origin', 'sector', 'report', 'model_used'];
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
