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
import { analyzePdf, analyzeText, htmlToText } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { getChartSeries, getCompanyHolders } from '../../services/market.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';

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
    const result = await getChartSeries(ticker, range, req.query.ma === '1');
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
    res.json({ ok: true, ...result });
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
    const content = await getFilingContentBuffer(ticker, accession);
    if (!content) {
      res.status(404).json({ error: 'Informe no encontrado.', code: 'FILING_NOT_FOUND' });
      return;
    }
    const user = await resolveUser(req);
    const options = {
      userId: user?.id ?? null,
      filename: `${ticker}-${accession}.pdf`,
    };
    const result = content.kind === 'pdf'
      ? await analyzePdf(content.buffer, options)
      : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);
    res.json({
      ok: true,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      report: result.report,
      pdfUrl: result.pdfUrl,
      saved: Boolean(user),
    });
  } catch (error) {
    if (error instanceof AgentError) {
      res.status(422).json({ error: error.message, code: error.code });
      return;
    }
    handleEdgarError(error, res, next);
  }
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
