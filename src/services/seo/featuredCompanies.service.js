/**
 * @fileoverview Consulta y agregación de empresas destacadas para metadatos SEO, sitemaps y feeds LLM.
 * @module services/seo/featuredCompanies.service
 */

import { query } from '../../../db/pool.js';
import { BENCHMARK_CONSUMER_DEFENSIVE, titleCaseName } from './seoConstants.js';

/**
 * Obtiene la lista ordenada de empresas con actividad reciente o pertenecientes al benchmark defensivo.
 * @param {number|null} [limit=8] - Número máximo de empresas a retornar o null para todas.
 * @returns {Promise<Array<{ticker: string, name: string}>>} Lista unificada sin duplicados.
 */
export async function getFeaturedCompanies(limit = 8) {
  const hasLimit = Number.isInteger(limit) && limit > 0;
  let dbCompanies = [];
  try {
    const rows = await query(
      `SELECT ticker, MAX(company_name) AS company_name, MAX(lastmod) AS lastmod
         FROM (
            SELECT ticker, company_name, created_at AS lastmod FROM analyses WHERE is_public = true AND status = 'done' AND ticker IS NOT NULL
            UNION ALL
            SELECT ticker, company_name, created_at AS lastmod FROM analyses WHERE ticker IS NOT NULL
            UNION ALL
            SELECT ticker, company_name, COALESCE(created_at, filed_at::timestamptz, now()) AS lastmod FROM filings
          ) t
         WHERE ticker ~ '^[A-Za-z0-9.-]{1,10}$'
         GROUP BY ticker
         ORDER BY lastmod DESC`,
    );
    dbCompanies = rows.rows.map((row) => ({
      ticker: String(row.ticker).toUpperCase(),
      name: titleCaseName(row.company_name),
    }));
  } catch {
    dbCompanies = [];
  }

  const seen = new Set();
  const merged = [];
  for (const c of dbCompanies) {
    if (!seen.has(c.ticker)) {
      seen.add(c.ticker);
      merged.push(c);
    }
  }
  for (const c of BENCHMARK_CONSUMER_DEFENSIVE) {
    if (!seen.has(c.ticker)) {
      seen.add(c.ticker);
      merged.push({ ticker: c.ticker, name: titleCaseName(c.name) });
    }
  }

  return hasLimit ? merged.slice(0, limit) : merged;
}
