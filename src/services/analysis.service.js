import { extractTextFromPdf } from './pdf.service.js';
import { getAgent } from '../agents/agentRegistry.js';
import { generateReportPdf } from './report.service.js';
import { createAnalysis, updateAnalysis } from '../../db/repositories/analysisRepository.js';

const PERIOD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function buildDownloadBase(report, formType) {
  const ticker = String(report?.ticker ?? '').replace(/[^\w.-]/g, '').toUpperCase() || 'INFORME';
  const year = Number(report?.fiscalYear)
    || (PERIOD_DATE_PATTERN.test(report?.reportingPeriod ?? '') ? Number(report.reportingPeriod.slice(0, 4)) : null)
    || new Date().getFullYear();
  const suffix = String(formType ?? '').includes('10-K')
    ? 'K'
    : report?.fiscalQuarter ? `Q${Number(report.fiscalQuarter)}` : 'FY';
  return `${ticker}-${year}-${suffix}`;
}

export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function saveAnalysis({ userId, filename, result, sourceUrl }) {
  if (!userId) return null;

  const report = result.report ?? {};
  const periodEnd = PERIOD_DATE_PATTERN.test(report.reportingPeriod ?? '') ? report.reportingPeriod : null;

  const created = await createAnalysis({
    userId,
    filename,
    status: 'done',
    ticker: report.ticker ?? null,
    companyName: report.company ?? null,
    periodEnd,
    pdfUrl: result.pdfUrl ?? null,
    sourceUrl: sourceUrl ?? null,
  });

  return updateAnalysis(created.id, {
    origin: result.origin ?? null,
    sector: result.sector ?? null,
    report,
    model_used: process.env.AI_PROVIDER ?? null,
  });
}

export async function analyzeText(text, options = {}) {
  const originAgent = getAgent('origin');
  const originResult = await originAgent.run({ text });

  const sectorAgent = getAgent('sector');
  const sectorResult = await sectorAgent.run({ text });

  const analystAgent = getAgent('analyst');
  const report = await analystAgent.run({
    text,
    sector: sectorResult.sector,
    formType: originResult.formType,
    ticker: options.ticker ?? null,
  });

  const { url, docxUrl, odtUrl } = await generateReportPdf(report);

  const result = {
    text,
    origin: originResult.origin,
    formType: originResult.formType,
    sector: sectorResult.sector,
    report,
    pdfUrl: url,
    docxUrl,
    odtUrl,
    downloadBase: buildDownloadBase(report, originResult.formType),
  };

  try {
    await saveAnalysis({
      userId: options.userId ?? null,
      filename: options.filename ?? 'informe.pdf',
      sourceUrl: options.sourceUrl ?? null,
      result,
    });
  } catch (error) {
    console.error('[analysis:save]', error.message);
  }

  return result;
}

export async function analyzePdf(buffer, options = {}) {
  const text = await extractTextFromPdf(buffer);
  return analyzeText(text, options);
}
