import { query } from '../pool.js';

const ANALYSIS_COLUMNS = `
    id, user_id, is_public, filename, status, error, origin, sector, report,
    model_used, ticker, company_name, period_end, pdf_url, source_url, accession, created_at
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
} = {}) {
  const { rows } = await query(
    `INSERT INTO analyses (user_id, is_public, filename, status, ticker, company_name, period_end, pdf_url, source_url, accession)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${ANALYSIS_COLUMNS}`,
    [userId, Boolean(isPublic), filename, status, ticker, companyName, periodEnd, pdfUrl, sourceUrl, accession],
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

export async function updateAnalysis(id, fields) {
  const allowed = [
    'status', 'error', 'origin', 'sector', 'report', 'model_used', 'is_public',
    'ticker', 'company_name', 'period_end', 'pdf_url', 'source_url', 'accession',
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

export async function findLatestDoneAnalysis({ ticker, accession, userId = null }) {
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
      ORDER BY created_at DESC
      LIMIT 1`,
    [ticker, accession, filename, userId],
  );
  return rows[0] ?? null;
}

export async function getAnalyzedAccessionsWithRatings(ticker, accessions = [], userId = null) {
  if (!ticker || !accessions.length) return new Map();
  const filenames = accessions.map((a) => `${ticker}-${a}.pdf`);
  const { rows } = await query(
    `SELECT
       COALESCE(a.accession, substring(a.filename from '([0-9]{10}-[0-9]{2}-[0-9]{6})')) AS acc,
       MAX(a.id) AS analysis_id,
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
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, ticker, accession, filename],
  );
  return rows[0] ?? null;
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
    const { rows } = await query(
      `INSERT INTO analysis_ratings (analysis_id, user_id, rating, feedback, ip_address)
       VALUES ($1, NULL, $2, $3, $4)
       RETURNING id, analysis_id, user_id, rating, feedback, created_at, updated_at`,
      [analysisId, numericRating, feedback, ipAddress],
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

export async function updateAnalysisErrorReport(id, { status, adminNotes }) {
  const allowed = ['pending', 'reviewed', 'resolved', 'dismissed'];
  const validStatus = allowed.includes(status) ? status : undefined;
  const isResolved = validStatus === 'resolved' || validStatus === 'dismissed';

  const sets = [];
  const params = [id];

  if (validStatus) {
    params.push(validStatus);
    sets.push(`status = $${params.length}`);
    if (isResolved) {
      sets.push(`resolved_at = now()`);
    } else {
      sets.push(`resolved_at = NULL`);
    }
  }

  if (typeof adminNotes === 'string') {
    params.push(adminNotes.trim());
    sets.push(`admin_notes = $${params.length}`);
  }

  if (!sets.length) return null;

  const { rows } = await query(
    `UPDATE analysis_error_reports
     SET ${sets.join(', ')}
     WHERE id = $1
     RETURNING id, analysis_id, category, description, status, admin_notes, created_at, resolved_at`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteAnalysisErrorReport(id) {
  const { rows } = await query(
    `DELETE FROM analysis_error_reports WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows[0] ?? null;
}
