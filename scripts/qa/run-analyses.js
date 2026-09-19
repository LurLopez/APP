#!/usr/bin/env node
/**
 * @fileoverview Ejecuta el pipeline real de análisis IA (Origen -> Sector -> Analista)
 * sobre los filings seleccionados, igual que hace la web al pulsar «Analizar con IA».
 *
 * Uso:
 *   node --env-file=.env scripts/qa/run-analyses.js --provider=deepseek --delay=4000
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { getFilingContentBuffer, getPresentationBuffers } from '../../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../../src/services/analysis.service.js';
import { buildAnalysisText } from '../../src/agents/analyst/filingExtractor.js';
import { pool } from '../../db/pool.js';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const PROVIDER = getArg('provider', 'deepseek');
const DELAY_MS = Number(getArg('delay', 4000));
const ONLY = getArg('only', null);
const SKIP = new Set(String(getArg('skip', '')).split(',').map((t) => t.trim()).filter(Boolean));
const ANALYSIS_TIMEOUT_MS = Number(getArg('timeout-ms', 900000));
const SELECTION = getArg('selection', 'documentacion/revisiones/2026-09-18/seleccion.json');
const OUT_DIR = getArg('out', 'documentacion/revisiones/2026-09-18/analisis');

process.env.AI_PROVIDER = PROVIDER;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slug = (f) => `${f.ticker}-${f.formType.replace('-', '')}-${f.period}`;

async function analyzeOne(filing) {
  const start = Date.now();
  const content = await getFilingContentBuffer(filing.ticker, filing.accession);
  if (!content) throw new Error(`Sin contenido para ${filing.ticker} ${filing.accession}`);

  let presentationText = null;
  try {
    const presentations = await getPresentationBuffers(filing.ticker, filing.accession);
    if (presentations.length) presentationText = await buildPresentationText(presentations);
  } catch (error) {
    console.warn(`[presentation] ${filing.ticker}: ${error.message}`);
  }

  const sourceText = content.kind === 'pdf'
    ? null
    : htmlToText(content.buffer.toString('utf8'));

  const options = {
    userId: null,
    actor: 'qa-evaluador',
    isPublic: true,
    filename: `${filing.ticker}-${filing.accession}.pdf`,
    ticker: filing.ticker,
    accession: filing.accession,
    sourceUrl: content.filing?.documentUrl ?? filing.documentUrl ?? null,
    modelUsed: PROVIDER,
    formType: filing.formType,
    presentationText,
  };

  const result = content.kind === 'pdf'
    ? await analyzePdf(content.buffer, options)
    : await analyzeText(sourceText, options);

  const analysisText = buildAnalysisText(sourceText ?? result.text ?? '', presentationText);

  return { result, analysisText, elapsed: (Date.now() - start) / 1000 };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const selection = JSON.parse(await readFile(SELECTION, 'utf8'));
  const filings = ONLY
    ? selection.filings.filter((f) => f.ticker === ONLY || slug(f) === ONLY)
    : selection.filings;

  console.log(`Proveedor: ${PROVIDER} · Informes: ${filings.length}`);

  for (const filing of filings) {
    const base = slug(filing);
    const target = `${OUT_DIR}/${base}.json`;
    if (SKIP.has(filing.ticker) || SKIP.has(base)) {
      console.log(`[SKIP] ${base}: en lista de exclusión.`);
      continue;
    }
    if (!ONLY) {
      try {
        await access(target);
        console.log(`[SKIP] ${base}: ya existe ${target}`);
        continue;
      } catch {}
    }
    console.log(`\n[${new Date().toISOString()}] ANALIZANDO ${base} (${filing.accession})...`);
    try {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout de análisis (${Math.round(ANALYSIS_TIMEOUT_MS / 1000)}s)`)), ANALYSIS_TIMEOUT_MS).unref();
      });
      const { result, analysisText, elapsed } = await Promise.race([analyzeOne(filing), timeout]);
      const payload = {
        filing,
        provider: PROVIDER,
        elapsed,
        analysisId: result.analysisId ?? null,
        origin: result.origin,
        formType: result.formType,
        sector: result.sector,
        subsector: result.subsector ?? null,
        version: result.version ?? null,
        sectorVersion: result.sectorVersion ?? null,
        language: result.language ?? 'es',
        report: result.report,
      };
      await writeFile(`${OUT_DIR}/${base}.json`, `${JSON.stringify(payload, null, 2)}\n`);
      await writeFile(`${OUT_DIR}/${base}.fuente.txt`, analysisText ?? '');
      console.log(`[OK] ${base} · ${elapsed.toFixed(1)}s · analysisId=${result.analysisId}`);
    } catch (error) {
      const payload = {
        filing,
        provider: PROVIDER,
        status: 'error',
        code: error.code ?? error.name ?? 'ERROR',
        error: error.message,
      };
      await writeFile(`${OUT_DIR}/${base}.error.json`, `${JSON.stringify(payload, null, 2)}\n`);
      console.error(`[ERROR] ${base}: ${error.code ?? ''} ${error.message}`);
    }
    await sleep(DELAY_MS);
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
