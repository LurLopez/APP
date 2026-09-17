/**
 * @fileoverview Módulo extraído de analysisRepository.js.
 */

import { query } from '../pool.js';

const ANALYSIS_COLUMNS = `
    id, user_id, is_public, filename, status, error, origin, sector, report,
    model_used, version, subsector, sector_version, is_reviewed, reviewed_at, reviewed_by,
    ticker, company_name, period_end, pdf_url, source_url, accession, language, created_at
`;

export async function createAnalysis({
  userId = null,
  isPublic = false,
  filename,
  status = 'processing',
  ticker = null,
  companyName = null,
  periodEnd = null,
  pdfUrl = null,
  sourceUrl = null,
  accession = null,
  version = null,
  subsector = null,
  sectorVersion = null,
  language = 'es',
} = {}) {
  const { rows } = await query(
    `INSERT INTO analyses (user_id, is_public, filename, status, ticker, company_name, period_end, pdf_url, source_url, accession, version, subsector, sector_version, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING ${ANALYSIS_COLUMNS}`,
    [userId, Boolean(isPublic), filename, status, ticker, companyName, periodEnd, pdfUrl, sourceUrl, accession, version, subsector, sectorVersion, language],
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
  reportType = null,
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

  if (reportType === 'annual') {
    conditions.push(`(
      (report->>'isAnnual' = 'true')
      OR (report->>'formType' = '10-K')
      OR (LOWER(COALESCE(report->>'periodTitle', '')) LIKE '%annual%')
      OR (LOWER(COALESCE(report->>'periodTitle', '')) LIKE '%full year%')
      OR (LOWER(COALESCE(filename, '')) LIKE '%10-k%')
      OR (LOWER(COALESCE(filename, '')) LIKE '%10k%')
    )`);
  } else if (reportType === 'quarterly') {
    conditions.push(`(
      NOT (
        (report->>'isAnnual' = 'true')
        OR (report->>'formType' = '10-K')
        OR (LOWER(COALESCE(report->>'periodTitle', '')) LIKE '%annual%')
        OR (LOWER(COALESCE(report->>'periodTitle', '')) LIKE '%full year%')
        OR (LOWER(COALESCE(filename, '')) LIKE '%10-k%')
        OR (LOWER(COALESCE(filename, '')) LIKE '%10k%')
      )
    )`);
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
    'status', 'error', 'origin', 'sector', 'report', 'model_used', 'version', 'subsector', 'sector_version', 'is_public',
    'ticker', 'company_name', 'period_end', 'pdf_url', 'source_url', 'accession', 'language',
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

export async function findLatestDoneAnalysis({ ticker, accession, userId = null, language = null }) {
  if (!ticker || !accession) return null;
  const filename = `${ticker}-${accession}.pdf`;
  const { rows } = await query(
    `SELECT ${ANALYSIS_COLUMNS}
     FROM analyses
     WHERE UPPER(ticker) = UPPER($1)
        AND (accession = $2 OR filename = $3)
        AND status = 'done'
        AND report IS NOT NULL
        AND (is_public = true OR ($4::int IS NOT NULL AND user_id = $4))
        AND ($5::text IS NULL OR language = $5)
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [ticker, accession, filename, userId, language || null],
  );
  return rows[0] ?? null;
}

export async function findUserAnalysis({ userId, ticker, accession }) {
  if (!userId || !ticker || !accession) return null;
  const filename = `${ticker}-${accession}.pdf`;
  const { rows } = await query(
    `SELECT ${ANALYSIS_COLUMNS}
     FROM analyses
     WHERE user_id = $1
       AND UPPER(ticker) = UPPER($2)
       AND (accession = $3 OR filename = $4)
       AND status = 'done'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId, ticker, accession, filename],
  );
  return rows[0] ?? null;
}

export async function setAnalysisReviewed(id, { isReviewed = true, userId = null } = {}) {
  const numericUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null;
  const { rows } = await query(
    `UPDATE analyses
     SET is_reviewed = $1,
         reviewed_at = CASE WHEN $1 THEN now() ELSE NULL END,
         reviewed_by = CASE WHEN $1 THEN $2::integer ELSE NULL END
     WHERE id = $3
     RETURNING ${ANALYSIS_COLUMNS}`,
    [Boolean(isReviewed), numericUserId, id],
  );
  return rows[0] ?? null;
}

export async function listAnalysisCompanies({ userId = null, search = null } = {}) {
  const params = [];
  const conditions = [];

  if (userId !== null) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }

  conditions.push(`COALESCE(ticker, company_name) IS NOT NULL`);

  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    conditions.push(
      `(LOWER(COALESCE(ticker, '')) LIKE $${params.length} OR LOWER(COALESCE(company_name, '')) LIKE $${params.length})`,
    );
  }

  params.push(30);

  const { rows } = await query(
    `SELECT
       MAX(UPPER(COALESCE(ticker, ''))) AS ticker,
       MAX(COALESCE(company_name, ticker, '')) AS company_name,
       COUNT(*)::int AS total
     FROM analyses
     WHERE ${conditions.join(' AND ')}
     GROUP BY LOWER(COALESCE(ticker, company_name))
     ORDER BY COUNT(*) DESC, LOWER(MAX(COALESCE(company_name, ticker, ''))) ASC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}
