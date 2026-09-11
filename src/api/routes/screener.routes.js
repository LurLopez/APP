import express from 'express';
import { Readable } from 'node:stream';
import {
  searchCompanies,
  getCompanyResults,
  getValuationSeries,
  getCompanyFilings,
  getFilingDocumentStream,
  getFilingPreview,
  getFilingContentBuffer,
} from '../../services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildDownloadBase } from '../../services/analysis.service.js';
import { generateReportPdf, cleanupGeneratedReports, GENERATED_DIR } from '../../services/report.service.js';
import {
  findLatestDoneAnalysis,
  getAnalyzedAccessions,
  getAnalyzedAccessionsWithRatings,
  findUserAnalysis,
  createAnalysis,
  deleteAnalysesByFiling,
} from '../../../db/repositories/analysisRepository.js';
import { AgentError } from '../../agents/baseAgent.js';
import { getChartSeries, getCompanyHolders } from '../../services/market.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import fs from 'node:fs';
import path from 'node:path';

const router = express.Router();

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
    const result = await getCompanyFilings(ticker);
    const accessions = (result?.filings ?? []).map((f) => f.accession).filter(Boolean);
    const analyzedMap = await getAnalyzedAccessionsWithRatings(ticker, accessions);
    const filings = (result?.filings ?? []).map((f) => {
      const info = analyzedMap.get(f.accession);
      const hasAnalysis = Boolean(info);
      return {
        ...f,
        hasAnalysis,
        analysisId: info?.analysisId ?? null,
        ratingAverage: info?.ratingAverage ?? null,
        ratingCount: info?.ratingCount ?? 0,
      };
    });
    res.json({ ok: true, filings, totalCount: result.totalCount ?? filings.length });
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

router.post('/company/:ticker/filings/:accession/analyze', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    const accession = normalizeAccession(req.params.accession);
    if (!TICKER_PATTERN.test(ticker) || !ACCESSION_PATTERN.test(accession)) {
      res.status(400).json({ error: 'Parámetros no válidos.' });
      return;
    }

    const user = await resolveUser(req);
    const force = req.query.force === '1' || req.query.force === 'true' || req.body?.force === true;

    if (force) {
      if (!user?.isAdmin) {
        res.status(403).json({ error: 'Solo los administradores pueden forzar la regeneración de informes.' });
        return;
      }
      const deleted = await deleteAnalysesByFiling({ ticker, accession });
      for (const item of deleted) {
        if (item.pdf_url) {
          await cleanupGeneratedReports(item.pdf_url);
        }
      }
    }

    // 1. Si ya tenemos un análisis completado de este informe y no es regeneración, lo servimos de inmediato sin coste ni espera
    if (!force) {
      const existing = await findLatestDoneAnalysis({ ticker, accession });
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
              await createAnalysis({
                userId: user.id,
                filename: existing.filename || `${ticker}-${accession}.pdf`,
                status: 'done',
                ticker: existing.ticker,
                companyName: existing.company_name,
                periodEnd: existing.period_end,
                pdfUrl,
                sourceUrl: existing.source_url,
                accession,
              });
            } catch (saveErr) {
              console.error('[analysis:link-user]', saveErr.message);
            }
          }
        }

        const formType = existing.report?.formType ?? '10-Q';
        res.json({
          ok: true,
          analysisId: existing.id,
          origin: existing.origin ?? 'US',
          formType,
          sector: existing.sector ?? 'defensive_consumer',
          report: existing.report,
          pdfUrl,
          downloadBase: buildDownloadBase(existing.report, formType),
          saved: Boolean(user),
          cached: true,
        });
        return;
      }
    }

    // 2. Si no estaba guardado, proceder con la descarga y análisis en vivo
    const content = await getFilingContentBuffer(ticker, accession);
    if (!content) {
      res.status(404).json({ error: 'Informe no encontrado.', code: 'FILING_NOT_FOUND' });
      return;
    }
    const options = {
      userId: user?.id ?? null,
      filename: `${ticker}-${accession}.pdf`,
      ticker,
      accession,
      sourceUrl: content.filing?.documentUrl ?? null,
      formType: content.filing?.formType ?? null,
    };
    const result = content.kind === 'pdf'
      ? await analyzePdf(content.buffer, options)
      : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);
    res.json({
      ok: true,
      analysisId: result.analysisId ?? null,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      report: result.report,
      pdfUrl: result.pdfUrl,
      downloadBase: result.downloadBase,
      saved: Boolean(user),
      cached: false,
    });
  } catch (error) {
    if (error instanceof AgentError) {
      res.status(422).json({ error: error.message, code: error.code });
      return;
    }
    handleEdgarError(error, res, next);
  }
});

router.post('/company/:ticker/filings/:accession/regenerate', async (req, res, next) => {
  req.query.force = '1';
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
