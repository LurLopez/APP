import { query } from "../pool.js";

const REPORT_COLUMNS = "id, user_id, user_email, category, title, description, images, status, admin_notes, created_at, resolved_at";

export async function createGeneralReport({
  userId = null,
  userEmail = null,
  category = "bug",
  title,
  description,
  images = [],
}) {
  const validCategories = ["general", "bug", "screener", "market_data", "portfolio", "account", "suggestion", "other"];
  const safeCategory = validCategories.includes(category) ? category : "bug";

  const { rows } = await query(
    `INSERT INTO general_reports (user_id, user_email, category, title, description, images)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${REPORT_COLUMNS}`,
    [userId, userEmail, safeCategory, title, description, JSON.stringify(images || [])],
  );
  return rows[0];
}

export async function listGeneralReports({
  status = null,
  category = null,
  search = null,
  limit = 250,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];

  if (status && status !== "all") {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }

  if (category && category !== "all") {
    params.push(category);
    conditions.push(`r.category = $${params.length}`);
  }

  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    conditions.push(
      `(LOWER(r.title) LIKE $${params.length} OR LOWER(r.description) LIKE $${params.length} OR LOWER(COALESCE(r.user_email, '')) LIKE $${params.length} OR LOWER(COALESCE(u.email, '')) LIKE $${params.length})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countParams = [...params];
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM general_reports r LEFT JOIN users u ON u.id = r.user_id ${where}`,
    countParams,
  );
  const total = countRows[0]?.total ?? 0;

  params.push(Math.min(limit, 1000));
  const limitPlaceholder = `$${params.length}`;
  params.push(Math.max(offset, 0));
  const offsetPlaceholder = `$${params.length}`;

  const { rows } = await query(
    `SELECT
       r.id,
       r.user_id,
       COALESCE(r.user_email, u.email) AS user_email,
       u.username,
       r.category,
       r.title,
       r.description,
       r.images,
       r.status,
       r.admin_notes,
       r.created_at,
       r.resolved_at
     FROM general_reports r
     LEFT JOIN users u ON u.id = r.user_id
     ${where}
     ORDER BY
       CASE WHEN r.status = 'pending' THEN 0 WHEN r.status = 'reviewed' THEN 1 ELSE 2 END,
       r.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params,
  );
  return { reports: rows, total };
}

export async function getGeneralReportById(id) {
  const { rows } = await query(
    `SELECT
       r.id,
       r.user_id,
       COALESCE(r.user_email, u.email) AS user_email,
       u.username,
       r.category,
       r.title,
       r.description,
       r.images,
       r.status,
       r.admin_notes,
       r.created_at,
       r.resolved_at
     FROM general_reports r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateGeneralReport(id, { status, adminNotes }) {
  const allowed = ["pending", "reviewed", "resolved", "dismissed"];
  const validStatus = allowed.includes(status) ? status : undefined;
  const isResolved = validStatus === "resolved" || validStatus === "dismissed";

  const sets = [];
  const params = [id];

  if (validStatus) {
    params.push(validStatus);
    sets.push(`status = $${params.length}`);
    if (isResolved) {
      sets.push("resolved_at = now()");
    } else {
      sets.push("resolved_at = NULL");
    }
  }

  if (typeof adminNotes === "string") {
    params.push(adminNotes.trim());
    sets.push(`admin_notes = $${params.length}`);
  }

  if (!sets.length) return null;

  const { rows } = await query(
    `UPDATE general_reports
     SET ${sets.join(", ")}
     WHERE id = $1
     RETURNING ${REPORT_COLUMNS}`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteGeneralReport(id) {
  const { rows } = await query(
    "DELETE FROM general_reports WHERE id = $1 RETURNING id",
    [id],
  );
  return rows[0] ?? null;
}

export async function batchUpdateGeneralReports(ids, { status, adminNotes }) {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const allowed = ["pending", "reviewed", "resolved", "dismissed"];
  const validStatus = allowed.includes(status) ? status : undefined;
  const sets = [];
  const params = [ids];

  if (validStatus) {
    params.push(validStatus);
    sets.push(`status = $${params.length}`);
    if (validStatus === "resolved" || validStatus === "dismissed") {
      sets.push("resolved_at = now()");
    } else {
      sets.push("resolved_at = NULL");
    }
  }

  if (typeof adminNotes === "string" && adminNotes.trim()) {
    params.push(adminNotes.trim());
    sets.push(`admin_notes = $${params.length}`);
  }

  if (!sets.length) return 0;

  const { rowCount } = await query(
    `UPDATE general_reports SET ${sets.join(", ")} WHERE id = ANY($1::int[])`,
    params,
  );
  return rowCount ?? 0;
}

export async function batchDeleteGeneralReports(ids) {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const { rowCount } = await query(
    `DELETE FROM general_reports WHERE id = ANY($1::int[])`,
    [ids],
  );
  return rowCount ?? 0;
}

export async function getReportsStats() {
  const { rows: analysisStats } = await query(`
    SELECT
      COUNT(*)::int AS total_analyses,
      COUNT(DISTINCT ticker)::int AS total_companies,
      COUNT(*) FILTER (WHERE status = 'done')::int AS completed_analyses
    FROM analyses
  `);

  const { rows: ratingStats } = await query(`
    SELECT
      COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average_rating,
      COUNT(*)::int AS total_ratings
    FROM analysis_ratings
  `);

  const { rows: aiErrorStats } = await query(`
    SELECT
      COUNT(*)::int AS total_ai_errors,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_ai_errors,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_ai_errors
    FROM analysis_error_reports
  `);

  const { rows: generalReportStats } = await query(`
    SELECT
      COUNT(*)::int AS total_general_reports,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_general_reports,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_general_reports
    FROM general_reports
  `);

  return {
    analyses: analysisStats[0] ?? { total_analyses: 0, total_companies: 0, completed_analyses: 0 },
    ratings: ratingStats[0] ?? { average_rating: 0, total_ratings: 0 },
    aiErrors: aiErrorStats[0] ?? { total_ai_errors: 0, pending_ai_errors: 0, resolved_ai_errors: 0 },
    generalReports: generalReportStats[0] ?? { total_general_reports: 0, pending_general_reports: 0, resolved_general_reports: 0 },
  };
}
