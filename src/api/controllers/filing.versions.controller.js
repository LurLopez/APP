/**
 * @fileoverview Módulo extraído de filingAnalysis.controller.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getFilingPreview } from '../../services/edgar.service.js';
import { buildDownloadBase } from '../../services/analysis.service.js';
import { generateReportPdf, GENERATED_DIR } from '../../services/report.service.js';
import { getAnalysisVersions, findUserAnalysis, createAnalysis, updateAnalysis } from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { handleEdgarError } from './screener.controller.js';
import { TICKER_PATTERN, ACCESSION_PATTERN, PAGE_PATTERN, PREVIEWS_DIR, normalizeAccession } from './filing.analysis.controller.js';

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
        language: entry.language ?? 'es',
        createdAt: entry.created_at,
        pdfUrl: entry.pdf_url ?? null,
        downloadBase: entry.pdf_url ? String(entry.pdf_url).replace(/\.pdf$/, '') : null,
      })),
    });
  } catch (error) {
    handleEdgarError(error, res, next);
  }
}

export async function serveExistingAnalysis(existing, ticker, accession, user, res) {
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
          language: existing.language ?? existing.report?.language ?? 'es',
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
    language: existing.language ?? existing.report?.language ?? 'es',
    saved: Boolean(user),
    cached: true,
  });
}

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
