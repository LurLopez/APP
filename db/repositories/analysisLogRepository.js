import { query } from '../pool.js';

// Cada análisis (o intento rechazado) guarda aquí el mismo registro de consumo
// que se escribe en logs/analisis.log: usuario, tokens, coste, duración, etc.
export async function createAnalysisLog({
  analysisId = null,
  userId = null,
  actor = null,
  status = 'ok',
  error = null,
  ticker = null,
  accession = null,
  filename = null,
  version = null,
  providers = [],
  models = [],
  calls = 0,
  promptTokens = 0,
  completionTokens = 0,
  reasoningTokens = 0,
  cacheHitTokens = 0,
  cacheMissTokens = 0,
  totalTokens = 0,
  costUsd = 0,
  costKnown = true,
  durationSeconds = 0,
} = {}) {
  const { rows } = await query(
    `INSERT INTO analysis_logs (
       analysis_id, user_id, actor, status, error, ticker, accession, filename, version,
       providers, models, calls, prompt_tokens, completion_tokens, reasoning_tokens,
       cache_hit_tokens, cache_miss_tokens, total_tokens, cost_usd, cost_known, duration_seconds
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     RETURNING id, created_at`,
    [
      analysisId,
      userId,
      actor,
      status,
      error,
      ticker,
      accession,
      filename,
      version,
      providers,
      models,
      calls,
      promptTokens,
      completionTokens,
      reasoningTokens,
      cacheHitTokens,
      cacheMissTokens,
      totalTokens,
      costUsd,
      costKnown,
      durationSeconds,
    ],
  );
  return rows[0] ?? null;
}

export async function listAnalysisLogs({ limit = 200, actor = null, ticker = null } = {}) {
  const conditions = [];
  const params = [];

  if (actor) {
    params.push(`%${String(actor).toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(actor, '')) LIKE $${params.length}`);
  }
  if (ticker) {
    params.push(`%${String(ticker).toUpperCase()}%`);
    conditions.push(`UPPER(COALESCE(ticker, '')) LIKE $${params.length}`);
  }

  params.push(Math.min(Number(limit) || 200, 1000));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT *
     FROM analysis_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}
