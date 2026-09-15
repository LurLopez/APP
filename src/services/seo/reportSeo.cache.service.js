/**
 * @fileoverview Módulo extraído de reportSeo.service.js.
 */

import { query } from '../../../db/pool.js';
import { reportCache, sitemapCache } from './seoConstants.js';

export function invalidateReportCache() {
  reportCache.clear();
  sitemapCache.xml = null;
}

export async function loadPublicReportsForSitemap() {
  const rows = await query(
    `SELECT id, ticker, period_end, created_at, report FROM analyses
      WHERE is_public = true AND status = 'done'
      ORDER BY ticker, created_at DESC, id DESC`,
  );
  return rows.rows;
}
