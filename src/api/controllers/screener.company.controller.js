/**
 * @fileoverview Módulo extraído de screener.controller.js.
 */

import { Readable } from 'node:stream';
import { getCompanyResults, getCompanyFilings, getValuationSeries, getFilingsWithPresentations, getCachedFilingPresentations, getFilingsPresentationsMap, getFilingPresentations, getFilingDocumentStream } from '../../services/edgar.service.js';
import { getAnalyzedAccessionsWithRatings } from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { getChartSeries, getCompanyHolders } from '../../services/market.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

const ACCESSION_PATTERN = /^\d{10}-?\d{2}-?\d{6}$/;

export function handleEdgarError(error, res, next) {
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

export async function getCompanyDetailsHandler(req, res, next) {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const user = await resolveUser(req);
    const result = await getCompanyResults(ticker, { authenticated: Boolean(user) });
    res.json({ ok: true, authenticated: Boolean(user), ...result });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
}

export async function getCompanyChartHandler(req, res, next) {
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
      maParam = (maQuery === '1' || maQuery === 'true')
        ? [100]
        : String(maQuery)
          .split(',')
          .map((v) => parseInt(v.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0 && n <= 5000);
      if (Array.isArray(maParam) && !maParam.length) maParam = [100];
    }
    const result = await getChartSeries(ticker, range, maParam);
    res.json({ ok: true, ...result });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
}

export async function getCompanyValuationHandler(req, res, next) {
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
}

export async function getCompanyFilingsHandler(req, res, next) {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const includePresentations = req.query.presentations === '1' || req.query.presentations === 'true';
    const result = includePresentations
      ? await getFilingsWithPresentations(ticker)
      : await getCompanyFilings(ticker);

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
          if (idx < 16) anyPresentationsMissing = true;
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
}

export async function getCompanyPresentationsHandler(req, res, next) {
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
      presentationsByAccession[accession] = await getFilingPresentations(ticker, accession);
    } else {
      presentationsByAccession = await getFilingsPresentationsMap(ticker);
    }
    res.json({ ok: true, ticker, presentationsByAccession });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
}

export async function getCompanyHoldersHandler(req, res, next) {
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
}

export async function getFilingDocumentHandler(req, res, next) {
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
    const isPdf = /pdf/i.test(String(document.contentType ?? ''));
    const safeFilename = String(document.filename || 'informe.pdf')
      .replace(/[^\w.-]/g, '_')
      .slice(0, 150) || 'informe.pdf';
    res.status(200);
    res.setHeader('Content-Type', document.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // El HTML de la SEC (contenido de terceros) NUNCA se sirve inline: evita XSS
    // almacenado bajo nuestro dominio. Solo los PDF pueden visualizarse inline.
    res.setHeader('Content-Disposition', `${download || !isPdf ? 'attachment' : 'inline'}; filename="${safeFilename}"`);
    if (!isPdf) {
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    }
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
}
