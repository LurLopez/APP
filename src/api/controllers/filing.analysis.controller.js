/**
 * @fileoverview Módulo extraído de filingAnalysis.controller.js.
 */

import { getFilingContentBuffer, getPresentationBuffers } from '../../services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../../services/analysis.service.js';
import { findLatestDoneAnalysis } from '../../../db/repositories/analysisRepository.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError } from '../../services/ai/modelProvider.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { getAiQuota, reserveAiQuota, refundAiQuota } from '../../services/aiQuota.service.js';
import { handleEdgarError } from './screener.controller.js';
import { serveExistingAnalysis } from './filing.versions.controller.js';
import { resolveAnalysisLanguage } from '../../utils/analysisLanguage.js';
import { translateAnalysisVariant } from '../../services/translation/analysisTranslation.service.js';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../../utils/i18n.js';

export const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

export const ACCESSION_PATTERN = /^\d{10}-?\d{2}-?\d{6}$/;

export const PAGE_PATTERN = /^\d{1,4}$/;

export const PREVIEWS_DIR = new URL('../../../uploads/generated/filings/previews/', import.meta.url).pathname;

export function normalizeAccession(acc) {
  const clean = String(acc ?? '').trim();
  if (/^\d{18}$/.test(clean)) {
    return `${clean.slice(0, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
  }
  return clean;
}

/**
 * Busca una variante ya analizada del mismo filing en un idioma distinto al pedido.
 * @param {{ ticker: string, accession: string, userId: number|null, language: string }} params
 * @returns {Promise<object|null>}
 */
async function findLanguageVariant({ ticker, accession, userId, language }) {
  for (const candidate of SUPPORTED_LANGUAGES) {
    if (candidate === language) continue;
    const analysis = await findLatestDoneAnalysis({ ticker, accession, userId, language: candidate });
    if (analysis?.report) return analysis;
  }
  return null;
}

export async function analyzeFilingHandler(req, res, next) {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    const accession = normalizeAccession(req.params.accession);
    if (!TICKER_PATTERN.test(ticker) || !ACCESSION_PATTERN.test(accession)) {
      res.status(400).json({ error: 'Parámetros no válidos.' });
      return;
    }

    const user = await resolveUser(req);
    const force = req.query.force === '1' || req.query.force === 'true' || req.body?.force === true || res.locals.forceRegeneration === true;
    const upgrade = req.body?.upgrade === true || req.query.upgrade === '1' || res.locals.upgradeVersion === true;
    const confirmLanguage = req.body?.confirmLanguage === true || req.query.confirmLanguage === '1' || res.locals.confirmLanguage === true;
    const language = await resolveAnalysisLanguage(req, user);

    if (force && !user?.isAdmin) {
      res.status(403).json({ error: 'Solo los administradores pueden forzar la regeneración de informes.' });
      return;
    }

    if (upgrade || force) {
      const existingLatest = await findLatestDoneAnalysis({ ticker, accession });
      if (existingLatest?.is_reviewed && !user?.isAdmin) {
        res.status(403).json({ error: 'Este análisis ha sido revisado por un humano. Solo un administrador puede regenerarlo o actualizarlo.' });
        return;
      }
    }

    if (!force && !upgrade) {
      const existing = await findLatestDoneAnalysis({ ticker, accession, userId: user?.id ?? null, language });
      if (existing && existing.report) {
        await serveExistingAnalysis(existing, ticker, accession, user, res);
        return;
      }

      // Variante de idioma: si el análisis existe en otro idioma, se pide confirmación
      // explícita antes de gastar cupo generando la versión en el idioma pedido.
      if (!confirmLanguage) {
        const availableLanguages = [];
        for (const candidate of SUPPORTED_LANGUAGES) {
          if (candidate === language) continue;
          const other = await findLatestDoneAnalysis({ ticker, accession, userId: user?.id ?? null, language: candidate });
          if (other?.report) availableLanguages.push(candidate);
        }
        if (availableLanguages.length) {
          res.status(409).json({
            error: 'Este análisis ya existe en otro idioma. Se traducirá al idioma elegido en unos segundos, con las mismas cifras, y consume una generación de tu cupo diario.',
            code: 'LANGUAGE_VARIANT_REQUIRED',
            requestedLanguage: language,
            availableLanguages,
            translatable: true,
          });
          return;
        }
      }
    }

    if (!user) {
      res.status(401).json({
        error: 'Regístrate o inicia sesión para analizar informes nuevos con IA. Consultar análisis ya existentes es gratis.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    // Variante de idioma confirmada: se traduce el informe ya existente (mismos
    // datos, coste mínimo) en lugar de volver a analizar el filing desde cero.
    if (!force && !upgrade && confirmLanguage) {
      const variant = await findLanguageVariant({ ticker, accession, userId: user.id, language });
      if (variant?.report) {
        const translationUsageId = await reserveAiQuota(user);
        try {
          const translated = await translateAnalysisVariant({
            source: variant,
            targetLanguage: language,
            userId: user.id,
            actor: user.username || user.email,
          });
          const translationQuota = await getAiQuota(user);
          res.json({
            ok: true,
            ...translated,
            currentVersion: translated.version ?? null,
            versionOutdated: false,
            saved: true,
            cached: false,
            translated: true,
            quota: translationQuota,
          });
          return;
        } catch (translationError) {
          await refundAiQuota(translationUsageId);
          console.warn('[analysis:translation] Falló la traducción, se regenera el análisis completo:', translationError.message);
        }
      }
    }

    const usageId = await reserveAiQuota(user);
    let result;

    try {
      const content = await getFilingContentBuffer(ticker, accession);
      if (!content) {
        await refundAiQuota(usageId);
        res.status(404).json({ error: 'Informe no encontrado.', code: 'FILING_NOT_FOUND' });
        return;
      }

      let presentationText = null;
      try {
        const presentations = await getPresentationBuffers(ticker, accession);
        if (presentations.length) presentationText = await buildPresentationText(presentations);
      } catch (presentationError) {
        console.warn('[analysis:presentation]', presentationError.message);
      }

      const options = {
        userId: user.id,
        actor: user.username || user.email,
        isPublic: true,
        filename: `${ticker}-${accession}.pdf`,
        ticker,
        accession,
        sourceUrl: content.filing?.documentUrl ?? null,
        formType: content.filing?.formType ?? null,
        presentationText,
        language,
      };

      result = content.kind === 'pdf'
        ? await analyzePdf(content.buffer, options)
        : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);
    } catch (generationError) {
      await refundAiQuota(usageId);
      throw generationError;
    }

    const quota = await getAiQuota(user);
    res.json({
      ok: true,
      analysisId: result.analysisId ?? null,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      subsector: result.subsector ?? null,
      version: result.version ?? null,
      sectorVersion: result.sectorVersion ?? null,
      currentVersion: result.version ?? null,
      versionOutdated: false,
      report: result.report,
      pdfUrl: result.pdfUrl,
      downloadBase: result.downloadBase,
      language: result.language ?? DEFAULT_LANGUAGE,
      saved: true,
      cached: false,
      quota,
    });
  } catch (error) {
    if (error instanceof AgentError) {
      res.status(422).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof AiProviderError) {
      res.status(error.status || 503).json({ error: error.message, code: error.code });
      return;
    }
    handleEdgarError(error, res, next);
  }
}

export async function regenerateFilingHandler(req, res, next) {
  res.locals.forceRegeneration = true;
  return analyzeFilingHandler(req, res, next);
}
