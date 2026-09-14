import express from 'express';
import { Readable } from 'node:stream';
import {
  searchCompanies,
  getCompanyResults,
  getCompanyFilings,
  getValuationSeries,
  getFilingsWithPresentations,
  getCachedFilingPresentations,
  getFilingsPresentationsMap,
  getFilingPresentations,
  getPresentationBuffers,
  getFilingDocumentStream,
  getFilingPreview,
  getFilingContentBuffer,
} from '../../services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText, buildDownloadBase } from '../../services/analysis.service.js';
import { generateReportPdf, GENERATED_DIR } from '../../services/report.service.js';
import {
  findLatestDoneAnalysis,
  getAnalyzedAccessionsWithRatings,
  getAnalysisVersions,
  findUserAnalysis,
  createAnalysis,
  updateAnalysis,
} from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError } from '../../services/ai/modelProvider.js';
import { getChartSeries, getCompanyHolders } from '../../services/market.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import {
  getAiQuota,
  reserveAiQuota,
  refundAiQuota,
} from '../../services/aiQuota.service.js';
import fs from 'node:fs';
import path from 'node:path';

const router = express.Router();

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  scope: 'screener:analyze',
  message: 'Demasiadas solicitudes de análisis desde tu conexión. Espera unos minutos antes de volver a intentarlo.',
});

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const ACCESSION_PATTERN = /^\d{10}-?\d{2}-?\d{6}$/;

function normalizeAccession(acc) {
  const clean = String(acc ?? '').trim();
  if (/^\d{18}$/.test(clean)) {
    return `${clean.slice(0, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
  }
  return clean;
}

const PAGE_PATTERN = /^\d{1,4}$/;
const PREVIEWS_DIR = new URL('../../../uploads/generated/filings/previews/', import.meta.url).pathname;

function handleEdgarError(error, res, next) {
  if (error.code === 'COMPANY_NOT_FOUND') {
    res.status(404).json({ error: error.message, code: 'COMPANY_NOT_FOUND' });
    return;
  }
  if (error.code === 'EDGAR_UNAVAILABLE') {
    res.status(502).json({ error: error.message, code: 'EDGAR_UNAVAILABLE' });
    return;
  }
  next(error);
}

router.get('/search', async (req, res, next) => {
  try {
    const query = String(req.query.q ?? '').trim();
    if (!query) {
      res.status(400).json({ error: 'Falta el parámetro de búsqueda "q".' });
      return;
    }
    const companies = await searchCompanies(query);
    res.json({ ok: true, companies });
  } catch (error) {
    next(error);
  }
});

router.get('/company/:ticker', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const user = await resolveUser(req);
    const authenticated = Boolean(user);
    const result = await getCompanyResults(ticker, { authenticated });
    res.json({ ok: true, authenticated, ...result });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

router.get('/company/:ticker/chart', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const range = String(req.query.range ?? '5y');
    const maQuery = req.query.ma_windows ?? req.query.ma;
    let maParam = false;
    if (maQuery !== undefined && maQuery !== null && maQuery !== '' && maQuery !== '0' && maQuery !== 'false') {
      if (maQuery === '1' || maQuery === 'true') {
        maParam = [100];
      } else {
        const parsed = String(maQuery)
          .split(',')
          .map((v) => parseInt(v.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0 && n <= 5000);
        maParam = parsed.length ? parsed : [100];
      }
    }
    const result = await getChartSeries(ticker, range, maParam);
    res.json({ ok: true, ...result });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

router.get('/company/:ticker/valuation', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const range = String(req.query.range ?? '5y');
    const result = await getValuationSeries(ticker, range);
    res.json({ ok: true, ...result });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

router.get('/company/:ticker/filings', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const includePresentations = req.query.presentations === '1' || req.query.presentations === 'true';
    let result;
    if (includePresentations) {
      result = await getFilingsWithPresentations(ticker);
    } else {
      result = await getCompanyFilings(ticker);
    }
    const accessions = (result?.filings ?? []).map((f) => f.accession).filter(Boolean);
    const user = await resolveUser(req);
    const analyzedMap = await getAnalyzedAccessionsWithRatings(ticker, accessions, user?.id ?? null);
    let anyPresentationsMissing = false;
    const filings = await Promise.all((result?.filings ?? []).map(async (filing, idx) => {
      const info = analyzedMap.get(filing.accession);
      let presentations = filing.presentations;
      let presentationsLoaded = Boolean(filing.presentations);
      if (!presentations) {
        const cached = getCachedFilingPresentations(ticker, filing.accession);
        if (cached) {
          presentations = cached;
          presentationsLoaded = true;
        } else {
          presentations = [];
          presentationsLoaded = false;
          if (idx < 16) {
            anyPresentationsMissing = true;
          }
        }
      }
      const analysisVersion = info?.latestVersion ?? null;
      const analysisSubsector = info?.latestSubsector ?? null;
      const versionOptions = {
        sector: 'defensive_consumer',
        subsector: analysisSubsector,
        ticker,
        formType: filing.formType,
      };
      const currentVersion = await resolveAnalysisVersion(versionOptions);
      return {
        ...filing,
        kind: 'report',
        presentations,
        presentationsLoaded,
        hasAnalysis: Boolean(info),
        analysisId: info?.analysisId ?? null,
        latestAnalysisId: info?.latestAnalysisId ?? null,
        analysisVersion,
        analysisSubsector,
        versionsCount: info?.versionsCount ?? 0,
        isReviewed: Boolean(info?.latestIsReviewed),
        currentVersion,
        versionOutdated: Boolean(info) && await isAnalysisOutdated({
          version: analysisVersion,
          ...versionOptions,
        }),
        ratingAverage: info?.ratingAverage ?? null,
        ratingCount: info?.ratingCount ?? 0,
      };
    }));
    res.json({
      ok: true,
      company: result.company,
      filings,
      totalCount: result.totalCount ?? filings.length,
      presentationsPending: anyPresentationsMissing,
    });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

router.get('/company/:ticker/filings/presentations', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const accession = req.query.accession ? String(req.query.accession).trim() : null;
    let presentationsByAccession = {};
    if (accession) {
      if (!ACCESSION_PATTERN.test(accession)) {
        res.status(400).json({ error: 'Accession no válido.' });
        return;
      }
      const presentations = await getFilingPresentations(ticker, accession);
      presentationsByAccession[accession] = presentations;
    } else {
      presentationsByAccession = await getFilingsPresentationsMap(ticker);
    }
    res.json({ ok: true, ticker, presentationsByAccession });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

// Historial de versiones de un mismo informe. Se conservan todas al regenerar:
// cada una se puede consultar y descargar. Devuelve también la versión actual
// para que el frontend sepa si procede ofrecer la actualización.
router.get('/company/:ticker/filings/:accession/versions', async (req, res, next) => {
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
});

router.get('/company/:ticker/holders', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const result = await getCompanyHolders(ticker);
    res.json({ ok: true, ...result });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

router.get('/company/:ticker/filings/:accession/document', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    const accession = String(req.params.accession ?? '');
    if (!TICKER_PATTERN.test(ticker) || !ACCESSION_PATTERN.test(accession)) {
      res.status(400).json({ error: 'Parámetros no válidos.' });
      return;
    }
    const document = await getFilingDocumentStream(ticker, accession);
    if (!document) {
      res.status(404).json({ error: 'Informe no encontrado.', code: 'FILING_NOT_FOUND' });
      return;
    }
    const download = req.query.download === '1';
    res.status(200);
    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${document.filename}"`);
    if (document.contentLength) res.setHeader('Content-Length', document.contentLength);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const stream = Readable.fromWeb(document.stream);
    stream.on('error', (streamError) => {
      console.error('[screener:document]', streamError.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'No se pudo completar la descarga del documento.', code: 'EDGAR_UNAVAILABLE' });
      } else {
        res.on('error', () => {});
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

router.post('/company/:ticker/filings/:accession/analyze', analyzeLimiter, async (req, res, next) => {
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

    // 1. Si ya tenemos un análisis completado de este informe y no es regeneración
    // ni actualización de versión, lo servimos de inmediato sin coste ni espera.
    if (!force && !upgrade) {
      const existing = await findLatestDoneAnalysis({ ticker, accession, userId: user?.id ?? null });
      if (existing && existing.report) {
        let pdfUrl = existing.pdf_url;
        // Verificar que el archivo PDF exista en disco; si no o si está desactualizado, regenerar exportables
        const isAnnualReport = Boolean(existing.report?.conclusion || existing.report?.rating || String(existing.report?.formType || '').includes('10-K'));
        let needsRegen = !pdfUrl;
        if (pdfUrl) {
          const filePath = path.join(GENERATED_DIR, path.basename(pdfUrl));
          if (!fs.existsSync(filePath)) {
            needsRegen = true;
          } else if (isAnnualReport) {
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

        // Si el usuario tiene sesión, vincularlo a su historial si aún no lo tiene
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
              // Copiar el análisis completo (no solo el PDF) para que el historial
              // del usuario pueda abrir y regenerar el informe sin depender del autor original.
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
        const currentVersion = await resolveAnalysisVersion(versionOptions);
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
          currentVersion,
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
        return;
      }
    }

    // 2. Generar un análisis nuevo con IA: requiere cuenta registrada y consume
    // el cupo diario (leer análisis ya existentes, paso 1, no consume cupo).
    if (!user) {
      res.status(401).json({
        error: 'Regístrate o inicia sesión para analizar informes nuevos con IA. Consultar análisis ya existentes es gratis.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    // Reserva atómica de cupo: inserta y comprueba en una sola operación para que
    // peticiones paralelas del mismo usuario no superen el límite diario.
    const usageId = await reserveAiQuota(user);

    let result;
    try {
      const content = await getFilingContentBuffer(ticker, accession);
      if (!content) {
        await refundAiQuota(usageId);
        res.status(404).json({ error: 'Informe no encontrado.', code: 'FILING_NOT_FOUND' });
        return;
      }

      // Documento complementario: presentación de resultados (8-K). El outlook suele estar aquí
      // cuando el 10-K/10-Q no lo incluye.
      let presentationText = null;
      try {
        const presentations = await getPresentationBuffers(ticker, accession);
        if (presentations.length) {
          presentationText = await buildPresentationText(presentations);
        }
      } catch (presentationError) {
        console.warn('[analysis:presentation]', presentationError.message);
      }

      const options = {
        // Los informes de filings oficiales se comparten siempre de forma pública
        // (caché global): el siguiente visitante lo lee al instante y sin cupo.
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
});

router.post('/company/:ticker/filings/:accession/regenerate', async (req, res, next) => {
  // Express 5: req.query es un getter sin caché y no se puede mutar; se propaga la
  // regeneración por res.locals para que el handler de analyze ejecute el análisis desde cero.
  res.locals.forceRegeneration = true;
  const analyzeLayer = router.stack.find((layer) => layer.route?.path === '/company/:ticker/filings/:accession/analyze');
  if (analyzeLayer?.route?.stack?.[0]?.handle) {
    return analyzeLayer.route.stack[0].handle(req, res, next);
  }
  next();
});

router.get('/company/:ticker/filings/:accession/preview', async (req, res, next) => {
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
});

router.get('/company/:ticker/filings/:accession/preview/pages/:page', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    const accession = normalizeAccession(req.params.accession);
    const page = String(req.params.page ?? '');
    if (!TICKER_PATTERN.test(ticker) || !ACCESSION_PATTERN.test(accession) || !PAGE_PATTERN.test(page)) {
      res.status(400).json({ error: 'Parámetros no válidos.' });
      return;
    }
    const fs = await import('node:fs');
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
});

export default router;
