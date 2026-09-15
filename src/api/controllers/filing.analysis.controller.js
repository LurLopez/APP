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
      const existing = await findLatestDoneAnalysis({ ticker, accession, userId: user?.id ?? null });
      if (existing && existing.report) {
        await serveExistingAnalysis(existing, ticker, accession, user, res);
        return;
      }
    }

    if (!user) {
      res.status(401).json({
        error: 'Regístrate o inicia sesión para analizar informes nuevos con IA. Consultar análisis ya existentes es gratis.',
        code: 'AUTH_REQUIRED',
      });
      return;
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
