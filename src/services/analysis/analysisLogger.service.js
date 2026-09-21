/**
 * @fileoverview Servicio de auditoría y persistencia de métricas de ejecución de análisis de IA.
 * Registra tokens, costes estimados, duración y estado en log acumulativo y tabla `analysis_logs`.
 * @module services/analysis/analysisLogger
 */

import { createAnalysisLog } from '../../../db/repositories/analysisLogRepository.js';
import { findUserById } from '../../../db/repositories/userRepository.js';
import { appendAnalysisLog } from '../analysisLog.service.js';
import { getSessionUsage } from '../ai/usageTracker.js';

/**
 * Resuelve el identificador o nombre legible del usuario que solicitó el análisis.
 * @private
 * @param {Object} options - Opciones del análisis.
 * @returns {Promise<string>} Nombre o 'anónimo'.
 */
async function resolveActor(options) {
  if (options.actor) return options.actor;
  if (options.userId) {
    try {
      const user = await findUserById(options.userId);
      if (user) return user.username || user.email;
    } catch (error) {
      console.error('[analysis:actor]', error.message);
    }
  }
  return 'anónimo';
}

/**
 * Registra los detalles analíticos y de consumo del modelo en archivo de texto y en base de datos.
 * @param {Object} params - Parámetros de auditoría.
 * @param {Object} params.options - Opciones de la petición.
 * @param {Object|null} [params.result] - Resultado del análisis si fue exitoso.
 * @param {Error|null} [params.error] - Error producido si falló.
 * @param {number} params.startedAt - Timestamp de inicio en milisegundos.
 * @returns {Promise<void>}
 */
export async function logAnalysis({ options, result = null, error = null, startedAt }) {
  const usage = getSessionUsage();
  const report = result?.report ?? null;
  const entry = {
    fechaHora: new Date().toISOString(),
    usuario: await resolveActor(options),
    userId: options.userId ?? null,
    estado: error ? 'error' : 'ok',
    error: error ? (error.code || error.message) : null,
    analysisId: result?.analysisId ?? null,
    ticker: report?.ticker ?? options.ticker ?? null,
    accession: options.accession ?? null,
    filename: options.filename ?? null,
    version: result?.version ?? null,
    proveedores: usage.proveedores,
    modelos: usage.modelos,
    llamadas: usage.llamadas,
    tokens: {
      prompt: usage.promptTokens,
      completion: usage.completionTokens,
      reasoning: usage.reasoningTokens,
      cacheHit: usage.cacheHitTokens,
      cacheMiss: usage.cacheMissTokens,
      total: usage.totalTokens,
    },
    costeUsd: Number(usage.costeUsd.toFixed(6)),
    costeConocido: usage.costeConocido,
    duracionSegundos: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  };

  await appendAnalysisLog(entry);

  try {
    await createAnalysisLog({
      analysisId: entry.analysisId,
      userId: entry.userId,
      actor: entry.usuario,
      status: entry.estado,
      error: entry.error,
      ticker: entry.ticker,
      accession: entry.accession,
      filename: entry.filename,
      version: entry.version,
      providers: entry.proveedores,
      models: entry.modelos,
      calls: entry.llamadas,
      promptTokens: entry.tokens.prompt,
      completionTokens: entry.tokens.completion,
      reasoningTokens: entry.tokens.reasoning,
      cacheHitTokens: entry.tokens.cacheHit,
      cacheMissTokens: entry.tokens.cacheMiss,
      totalTokens: entry.tokens.total,
      costUsd: entry.costeUsd,
      costKnown: entry.costeConocido,
      durationSeconds: entry.duracionSegundos,
    });
  } catch (dbError) {
    console.error('[analysis-log:db]', dbError.message);
  }
}

/**
 * Envoltorio seguro para que los errores de logging nunca interrumpan la respuesta del análisis al cliente.
 * @param {Object} args - Parámetros para logAnalysis.
 * @returns {Promise<void>}
 */
export async function safeLogAnalysis(args) {
  try {
    await logAnalysis(args);
  } catch (logError) {
    console.error('[analysis:log]', logError.message);
  }
}
