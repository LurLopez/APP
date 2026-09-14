/**
 * @fileoverview Controlador para la búsqueda de empresas, cotizaciones, gráficos y filings de la SEC.
 * @module api/controllers/screener
 */

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
  getFilingDocumentStream,
} from '../../services/edgar.service.js';
import { getAnalyzedAccessionsWithRatings } from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { getChartSeries, getCompanyHolders } from '../../services/market.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const ACCESSION_PATTERN = /^\d{10}-?\d{2}-?\d{6}$/;

/**
 * Manejador centralizado de errores de la integración con SEC EDGAR.
 * @param {Error & { code?: string }} error - Error devuelto por el servicio EDGAR.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Función para propagar el error.
 */
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

/**
 * Busca empresas en la base de datos de SEC EDGAR por nombre o ticker.
 * @param {import('express').Request} req - Petición con query param `q`.
 * @param {import('express').Response} res - Lista de empresas que coinciden.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function searchCompaniesHandler(req, res, next) {
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
}

/**
 * Obtiene el perfil financiero y resultados clave de una empresa cotizada.
 * @param {import('express').Request} req - Petición con params.ticker.
 * @param {import('express').Response} res - Datos financieros consolidados.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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

/**
 * Obtiene la serie temporal de precios y medias móviles para el gráfico interactivo.
 * @param {import('express').Request} req - Petición con params.ticker y query params (range, ma).
 * @param {import('express').Response} res - Serie de velas/cierres y medias.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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

/**
 * Obtiene múltiplos y ratios de valoración histórica (P/E, EV/FCF, etc.).
 * @param {import('express').Request} req - Petición con params.ticker y query.range.
 * @param {import('express').Response} res - Serie histórica de valoración.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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

/**
 * Consulta la lista de filings presentados ante la SEC junto con su estado analítico.
 * @param {import('express').Request} req - Petición con params.ticker y opciones de presentaciones.
 * @param {import('express').Response} res - Lista de filings con metadatos de análisis y versiones.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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

/**
 * Consulta presentaciones de resultados asociadas a un informe o empresa.
 * @param {import('express').Request} req - Petición con params.ticker y query.accession opcional.
 * @param {import('express').Response} res - Mapa de presentaciones por accession.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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

/**
 * Obtiene los principales accionistas institucionales y fondos de una empresa.
 * @param {import('express').Request} req - Petición con params.ticker.
 * @param {import('express').Response} res - Lista de accionistas institucionales.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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

/**
 * Transmite el documento oficial de la SEC en streaming directo al cliente.
 * @param {import('express').Request} req - Petición con ticker y accession.
 * @param {import('express').Response} res - Stream del documento binario o HTML.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
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
}
