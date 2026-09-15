/**
 * @fileoverview Módulo extraído de analysisRepository.js.
 */

import { query } from '../pool.js';

export async function getAnalysisVersions({ ticker, accession, userId = null } = {}) {
  if (!ticker || !accession) return [];
  const filename = `${ticker}-${accession}.pdf`;
  const { rows } = await query(
    `SELECT
       id, version, subsector, sector_version, model_used, is_public, pdf_url, created_at,
       is_reviewed, reviewed_at, reviewed_by,
       report->>'formType' AS form_type
     FROM analyses
     WHERE UPPER(ticker) = UPPER($1)
        AND (accession = $2 OR filename = $3)
        AND status = 'done'
        AND report IS NOT NULL
        AND (is_public = true OR ($4::int IS NOT NULL AND user_id = $4))
     ORDER BY created_at DESC, id DESC`,
    [ticker, accession, filename, userId],
  );
  return rows;
}

export async function getAnalyzedAccessionsWithRatings(ticker, accessions = [], userId = null) {
  if (!ticker || !accessions.length) return new Map();
  const filenames = accessions.map((a) => `${ticker}-${a}.pdf`);
  const { rows } = await query(
    `SELECT
       COALESCE(a.accession, substring(a.filename from '([0-9]{10}-[0-9]{2}-[0-9]{6})')) AS acc,
       MAX(a.id) AS analysis_id,
       (array_agg(a.id ORDER BY a.created_at DESC, a.id DESC))[1] AS latest_analysis_id,
       (array_agg(a.version ORDER BY a.created_at DESC, a.id DESC))[1] AS latest_version,
       (array_agg(a.subsector ORDER BY a.created_at DESC, a.id DESC))[1] AS latest_subsector,
       (array_agg(a.sector_version ORDER BY a.created_at DESC, a.id DESC))[1] AS latest_sector_version,
       (array_agg(COALESCE(a.is_reviewed, false) ORDER BY a.created_at DESC, a.id DESC))[1] AS latest_is_reviewed,
       COUNT(DISTINCT a.id)::int AS versions_count,
       COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::float AS rating_average,
       COUNT(r.id)::int AS rating_count
     FROM analyses a
     LEFT JOIN analysis_ratings r ON r.analysis_id = a.id
     WHERE UPPER(a.ticker) = UPPER($1)
        AND a.status = 'done'
        AND a.report IS NOT NULL
        AND (a.is_public = true OR ($4::int IS NOT NULL AND a.user_id = $4))
        AND (
         a.accession = ANY($2::text[])
         OR a.filename = ANY($3::text[])
       )
     GROUP BY COALESCE(a.accession, substring(a.filename from '([0-9]{10}-[0-9]{2}-[0-9]{6})'))`,
    [ticker, accessions, filenames, userId],
  );
  const map = new Map();
  for (const r of rows) {
    if (r.acc) {
      map.set(r.acc, {
        analysisId: r.analysis_id,
        latestAnalysisId: r.latest_analysis_id,
        latestVersion: r.latest_version,
        latestSubsector: r.latest_subsector,
        latestSectorVersion: r.latest_sector_version,
        latestIsReviewed: Boolean(r.latest_is_reviewed),
        versionsCount: r.versions_count,
        ratingAverage: r.rating_count > 0 ? r.rating_average : null,
        ratingCount: r.rating_count,
      });
    }
  }
  return map;
}

export async function getAnalyzedAccessions(ticker, accessions = []) {
  const map = await getAnalyzedAccessionsWithRatings(ticker, accessions);
  return new Set(map.keys());
}

export async function saveAnalysisRating({ analysisId, userId = null, rating, feedback = null, ipAddress = null }) {
  const numericRating = Math.max(1, Math.min(5, Number(rating) || 5));
  let saved;
  if (userId) {
    const { rows } = await query(
      `INSERT INTO analysis_ratings (analysis_id, user_id, rating, feedback, ip_address)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (analysis_id, user_id)
       DO UPDATE SET rating = EXCLUDED.rating, feedback = EXCLUDED.feedback, ip_address = EXCLUDED.ip_address, updated_at = now()
       RETURNING id, analysis_id, user_id, rating, feedback, created_at, updated_at`,
      [analysisId, userId, numericRating, feedback, ipAddress],
    );
    saved = rows[0];
  } else {
    // Un solo voto anónimo por análisis e IP (índice parcial idx_analysis_ratings_anon_unique).
    const { rows } = await query(
      `INSERT INTO analysis_ratings (analysis_id, user_id, rating, feedback, ip_address)
       VALUES ($1, NULL, $2, $3, $4)
       ON CONFLICT (analysis_id, ip_address) WHERE user_id IS NULL
       DO UPDATE SET rating = EXCLUDED.rating, feedback = EXCLUDED.feedback, updated_at = now()
       RETURNING id, analysis_id, user_id, rating, feedback, created_at, updated_at`,
      [analysisId, numericRating, feedback, ipAddress || 'unknown'],
    );
    saved = rows[0];
  }
  return saved;
}

export async function getAnalysisRatingSummary(analysisId, userId = null) {
  const { rows: statsRows } = await query(
    `SELECT
       COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average,
       COUNT(*)::int AS count
     FROM analysis_ratings
     WHERE analysis_id = $1`,
    [analysisId],
  );

  let userRating = null;
  if (userId) {
    const { rows: userRows } = await query(
      `SELECT rating, feedback FROM analysis_ratings WHERE analysis_id = $1 AND user_id = $2`,
      [analysisId, userId],
    );
    if (userRows.length) {
      userRating = userRows[0].rating;
    }
  }

  return {
    average: statsRows[0]?.average ?? 0,
    count: statsRows[0]?.count ?? 0,
    userRating,
  };
}

export async function createAnalysisErrorReport({ analysisId, userId = null, category = 'other', description, images = [] }) {
  const { rows } = await query(
    `INSERT INTO analysis_error_reports (analysis_id, user_id, category, description, images)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, analysis_id, user_id, category, description, images, status, created_at`,
    [analysisId, userId, category, description, JSON.stringify(images || [])],
  );
  return rows[0];
}

export async function deleteAnalysisById(id) {
  const { rows } = await query(
    `DELETE FROM analyses WHERE id = $1 RETURNING id, ticker, accession, filename, pdf_url`,
    [id],
  );
  return rows[0] ?? null;
}

export async function deleteAnalysesByFiling({ ticker, accession }) {
  if (!ticker || !accession) return [];
  const filename = `${ticker}-${accession}.pdf`;
  const { rows } = await query(
    `DELETE FROM analyses
     WHERE UPPER(ticker) = UPPER($1)
       AND (accession = $2 OR filename = $3)
     RETURNING id, ticker, accession, filename, pdf_url`,
    [ticker, accession, filename],
  );
  return rows;
}

export async function listAnalysesForAdminReports({ ticker = null } = {}) {
  const params = [];
  const conditions = [];
  if (ticker) {
    params.push(`%${String(ticker).toLowerCase()}%`);
    conditions.push(`(LOWER(a.ticker) LIKE $${params.length} OR LOWER(a.company_name) LIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT
       a.id,
       a.ticker,
       a.company_name,
       a.accession,
       a.period_end,
       a.status,
       a.model_used,
       a.version,
       a.pdf_url,
       a.source_url,
       a.created_at,
       a.report->>'formType' AS form_type,
       a.report->>'periodTitle' AS period_title,
       a.report->>'period' AS period_label,
       COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::float AS rating_average,
       COUNT(DISTINCT r.id)::int AS rating_count,
       COUNT(DISTINCT er.id)::int AS error_reports_count,
       COALESCE(
         json_agg(
           DISTINCT jsonb_build_object(
             'id', er.id,
             'category', er.category,
             'description', er.description,
             'status', er.status,
             'admin_notes', er.admin_notes,
             'created_at', er.created_at,
             'resolved_at', er.resolved_at,
             'user_id', er.user_id,
             'user_email', u.email,
             'username', u.username
           )
         ) FILTER (WHERE er.id IS NOT NULL),
         '[]'::json
       ) AS error_reports
     FROM analyses a
     LEFT JOIN analysis_ratings r ON r.analysis_id = a.id
     LEFT JOIN analysis_error_reports er ON er.analysis_id = a.id
     LEFT JOIN users u ON u.id = er.user_id
     ${where}
     GROUP BY a.id
     ORDER BY a.ticker ASC, a.period_end DESC NULLS LAST, a.created_at DESC`,
    params,
  );
  return rows;
}
