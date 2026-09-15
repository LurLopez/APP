/**
 * @fileoverview Módulo extraído de analysisRepository.js.
 */

import { query } from '../pool.js';

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
