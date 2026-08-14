import express from 'express';
import { Readable } from 'node:stream';
import {
  searchCompanies,
  getCompanyResults,
  getCompanyFilings,
  getFilingDocumentStream,
} from '../../services/edgar.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';

const router = express.Router();

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const ACCESSION_PATTERN = /^\d{10}-\d{2}-\d{6}$/;

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
    Readable.fromWeb(document.stream).pipe(res);
  } catch (error) {
    handleEdgarError(error, res, next);
  }
});

export default router;
