import fs from 'node:fs';
import { getAnalysisById } from '../db/repositories/analysisRepository.js';
import { findLatestDoneAnalysis } from '../db/repositories/analysisRepository.js';
import { translateAnalysisVariant } from '../src/services/translation/analysisTranslation.service.js';
import { buildReportHtml } from '../src/services/reportExport.service.js';

const OUT_DIR = '/tmp/opencode';
const TAP_SOURCE_ID = 554;

async function ensureEnglishVariant(sourceId) {
  const source = await getAnalysisById(sourceId);
  if (!source) throw new Error(`Análisis ${sourceId} no encontrado`);
  const existing = await findLatestDoneAnalysis({
    ticker: source.ticker,
    accession: source.accession,
    language: 'en',
  });
  if (existing) {
    console.log(`Variante EN ya existente para ${source.ticker} (análisis ${existing.id})`);
    return existing;
  }
  const result = await translateAnalysisVariant({
    source,
    targetLanguage: 'en',
    userId: source.user_id ?? null,
    isPublic: true,
  });
  console.log(`Traducido ${source.ticker} → análisis EN ${result.analysisId}`);
  return getAnalysisById(result.analysisId);
}

const khc = await ensureEnglishVariant(551);
fs.writeFileSync(`${OUT_DIR}/khc-en.html`, buildReportHtml(khc.report));
console.log(`KHC EN ${khc.id} → ${OUT_DIR}/khc-en.html`);

const tap = await ensureEnglishVariant(TAP_SOURCE_ID);
fs.writeFileSync(`${OUT_DIR}/tap-en-report.json`, JSON.stringify(tap.report, null, 2));
fs.writeFileSync(`${OUT_DIR}/tap-en.html`, buildReportHtml(tap.report));
console.log(`TAP EN ${tap.id} → ${OUT_DIR}/tap-en.html`);
