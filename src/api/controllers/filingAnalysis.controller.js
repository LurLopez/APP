/**
 * @fileoverview Controlador para el análisis, regeneración, previsualización y control de versiones de filings de la SEC.
 * @module api/controllers/filingAnalysis
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  getFilingContentBuffer,
  getPresentationBuffers,
  getFilingPreview,
} from '../../services/edgar.service.js';
import {
  analyzePdf,
  analyzeText,
  htmlToText,
  buildPresentationText,
  buildDownloadBase,
} from '../../services/analysis.service.js';
import { generateReportPdf, GENERATED_DIR } from '../../services/report.service.js';
import {
  findLatestDoneAnalysis,
  getAnalysisVersions,
  findUserAnalysis,
  createAnalysis,
  updateAnalysis,
} from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError } from '../../services/ai/modelProvider.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { getAiQuota, reserveAiQuota, refundAiQuota } from '../../services/aiQuota.service.js';
import { handleEdgarError } from './screener.controller.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const ACCESSION_PATTERN = /^\d{10}-?\d{2}-?\d{6}$/;
const PAGE_PATTERN = /^\d{1,4}$/;
const PREVIEWS_DIR = new URL('../../../uploads/generated/filings/previews/', import.meta.url).pathname;

/**
 * Normaliza un número de acceso de la SEC al formato estándar con guiones (XXXXXXXXXX-YY-ZZZZZZ).
 * @param {unknown} acc - Número de acceso sin guiones o con formato parcial.
 * @returns {string} Accession normalizado.
 */
export function normalizeAccession(acc) {
  const clean = String(acc ?? '').trim();
  if (/^\d{18}$/.test(clean)) {
    return `${clean.slice(0, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
  }
  return clean;
}

/**
 * Consulta el historial de versiones guardadas de análisis para un mismo filing de la SEC.
 * @param {import('express').Request} req - Petición con ticker y accession.
 * @param {import('express').Response} res - Lista de versiones históricas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getFilingVersionsHandler(req, res, next) {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    const accession = normalizeAccession(req.params.accession);
    if (!TICKER_PATTERN.test(ticker) || !ACCESSION_PATTERN.test(accession)) {
      res.status(400).json({ error: 'Parámetros no válidos.' });
      return;
    }
    const user = await resolveUser(req);
    const versions = await getAnalysisVersions({ ticker, accession, userId: user?.id ?? null });
    const latest = versions[0] ?? null;
    const versionOptions = {
      sector: 'defensive_consumer',
      subsector: latest?.subsector ?? null,
      ticker,
      formType: latest?.form_type ?? null,
    };
    const currentVersion = await resolveAnalysisVersion(versionOptions);

    res.json({
      ok: true,
      ticker,
      accession,
      currentVersion,
      isReviewed: Boolean(latest?.is_reviewed),
      versionOutdated: latest ? await isAnalysisOutdated({
        version: latest.version,
        ...versionOptions,
      }) : false,
      versions: versions.map((entry) => ({
        id: entry.id,
        version: entry.version ?? null,
        subsector: entry.subsector ?? null,
        sectorVersion: entry.sector_version ?? null,
        isReviewed: Boolean(entry.is_reviewed),
        reviewedAt: entry.reviewed_at ?? null,
        reviewedBy: entry.reviewed_by ?? null,
        modelUsed: entry.model_used ?? null,
        formType: entry.form_type ?? null,
        createdAt: entry.created_at,
        pdfUrl: entry.pdf_url ?? null,
        downloadBase: entry.pdf_url ? String(entry.pdf_url).replace(/\.pdf$/, '') : null,
      })),
    });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
}

/**
 * Sirve un análisis existente en caché, regenerando el PDF en disco si hiciera falta y vinculando al usuario.
 * @private
 */
async function serveExistingAnalysis(existing, ticker, accession, user, res) {
  let pdfUrl = existing.pdf_url;
  const isAnnual = Boolean(existing.report?.conclusion || existing.report?.rating || String(existing.report?.formType || '').includes('10-K'));
  let needsRegen = !pdfUrl;

  if (pdfUrl) {
    const filePath = path.join(GENERATED_DIR, path.basename(pdfUrl));
    if (!fs.existsSync(filePath)) {
      needsRegen = true;
    } else if (isAnnual) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.size < 6000) needsRegen = true;
      } catch {
        needsRegen = true;
      }
    }
  }

  if (needsRegen) {
    try {
      const generated = await generateReportPdf(existing.report);
      pdfUrl = generated.url;
    } catch (genErr) {
      console.warn('[analysis:regenerate-pdf]', genErr.message);
    }
  }

  if (user?.id && existing.user_id !== user.id) {
    const userEntry = await findUserAnalysis({ userId: user.id, ticker, accession });
    if (!userEntry) {
      try {
        const linked = await createAnalysis({
          userId: user.id,
          isPublic: true,
          filename: existing.filename || `${ticker}-${accession}.pdf`,
          status: 'done',
          ticker: existing.ticker,
          companyName: existing.company_name,
          periodEnd: existing.period_end,
          pdfUrl,
          sourceUrl: existing.source_url,
          accession,
          version: existing.version ?? null,
          subsector: existing.subsector ?? null,
          sectorVersion: existing.sector_version ?? null,
        });
        await updateAnalysis(linked.id, {
          origin: existing.origin ?? null,
          sector: existing.sector ?? null,
          report: existing.report,
          model_used: existing.model_used ?? null,
        });
      } catch (saveErr) {
        console.error('[analysis:link-user]', saveErr.message);
      }
    }
  }

  const formType = existing.report?.formType ?? '10-Q';
  const versionOptions = {
    sector: existing.sector ?? 'defensive_consumer',
    subsector: existing.subsector ?? null,
    ticker: existing.ticker ?? ticker,
    formType,
  };

  res.json({
    ok: true,
    analysisId: existing.id,
    origin: existing.origin ?? 'US',
    formType,
    sector: existing.sector ?? 'defensive_consumer',
    subsector: existing.subsector ?? null,
    version: existing.version ?? null,
    sectorVersion: existing.sector_version ?? null,
    isReviewed: Boolean(existing.is_reviewed),
    reviewedAt: existing.reviewed_at ?? null,
    currentVersion: await resolveAnalysisVersion(versionOptions),
    versionOutdated: await isAnalysisOutdated({
      version: existing.version,
      ...versionOptions,
    }),
    report: existing.report,
    pdfUrl,
    downloadBase: buildDownloadBase(existing.report, formType),
    saved: Boolean(user),
    cached: true,
  });
}

/**
 * Analiza un filing oficial de la SEC con IA o devuelve la versión almacenada en caché.
 * @param {import('express').Request} req - Petición con ticker, accession y opciones de regeneración.
 * @param {import('express').Response} res - Resultado del análisis estructurado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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

/**
 * Fuerza la regeneración de un análisis de informe delegando al manejador principal de análisis.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function regenerateFilingHandler(req, res, next) {
  res.locals.forceRegeneration = true;
  return analyzeFilingHandler(req, res, next);
}

/**
 * Consulta la previsualización de páginas generadas de un filing de la SEC.
 * @param {import('express').Request} req - Petición con ticker y accession.
 * @param {import('express').Response} res - Metadatos de páginas disponibles.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getFilingPreviewHandler(req, res, next) {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    const accession = normalizeAccession(req.params.accession);
    if (!TICKER_PATTERN.test(ticker) || !ACCESSION_PATTERN.test(accession)) {
      res.status(400).json({ error: 'Parámetros no válidos.' });
      return;
    }
    const preview = await getFilingPreview(ticker, accession);
    if (!preview) {
      res.status(404).json({ error: 'Informe no encontrado.', code: 'FILING_NOT_FOUND' });
      return;
    }
    res.json({ ok: true, ...preview });
  } catch (error) {
    if (error.code === 'PREVIEW_UNAVAILABLE') {
      res.status(502).json({ error: error.message, code: 'PREVIEW_UNAVAILABLE' });
      return;
    }
    handleEdgarError(error, res, next);
  }
}

/**
 * Transmite la imagen PNG renderizada de una página específica del filing.
 * @param {import('express').Request} req - Petición con ticker, accession y page.
 * @param {import('express').Response} res - Imagen PNG.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getFilingPreviewPageHandler(req, res, next) {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    const accession = normalizeAccession(req.params.accession);
    const page = String(req.params.page ?? '');
    if (!TICKER_PATTERN.test(ticker) || !ACCESSION_PATTERN.test(accession) || !PAGE_PATTERN.test(page)) {
      res.status(400).json({ error: 'Parámetros no válidos.' });
      return;
    }
    const dir = `${PREVIEWS_DIR}${accession.replaceAll('-', '')}/`;
    const pageNumber = Number(page);
    let file = null;
    try {
      const files = fs.readdirSync(dir).filter((name) => /\.png$/i.test(name));
      file = files.find((name) => Number(name.replace(/\.[a-z]+$/i, '').replace(/^.*-/, '')) === pageNumber);
    } catch {
      file = null;
    }
    if (!file) {
      res.status(404).json({ error: 'Página no encontrada.', code: 'PAGE_NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = fs.createReadStream(`${dir}${file}`);
    stream.on('error', () => {
      res.on('error', () => {});
      res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}
