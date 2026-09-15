/**
 * @fileoverview Módulo extraído de reanalyze-existing.js.
 */

import { getCompanyFilings, getFilingContentBuffer, getPresentationBuffers } from '../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../src/services/analysis.service.js';
import { AiProviderError } from '../src/services/ai/modelProvider.js';
import { getPublicReportMarkdown, buildReportSlug, loadPublicReportRow } from '../src/services/seo.service.js';
import { pool } from '../db/pool.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);

function getArg(name, defaultValue = null) {
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  if (args.includes(`--${name}`)) return true;
  return defaultValue;
}

export const PROVIDER = getArg('provider', process.env.WORKER_AI_PROVIDER || 'opencode');

const DELAY_MS = Number(getArg('delay', 2000));

const CONCURRENCY = Math.max(1, Number(getArg('concurrency', process.env.WORKER_CONCURRENCY || 1)) || 1);

const RATE_LIMIT_WAIT_MS = Number(getArg('rate-limit-wait', 45)) * 1000;

const MAX_RATE_LIMITS = Number(getArg('max-rate-limits', 12));

const RUN_MINUTES = Number(getArg('run-minutes', 0));

const TICKERS_FILTER = getArg('tickers')
  ? String(getArg('tickers')).split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
  : null;

const REPORT_PATH = 'reanalisis-opencode.txt';

const COMPARE_DIR = 'comparacion';

function timestamp() {
  return new Date().toLocaleString('es-ES', { hour12: false });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const state = {
  startedAt: new Date().toISOString(),
  provider: PROVIDER,
  passesDone: 0,
  ok: 0,
  failed: 0,
  events: [],
  pairs: [],
  stopReason: null,
  formCache: new Map(),
  filingsCache: new Map(),
};

export function logEvent(text) {
  state.events.push(`${timestamp()} — ${text}`);
  console.log(`[${timestamp()}] ${text}`);
  writeReportFile();
}

function fmtTimestamp(iso) {
  return new Date(iso).toLocaleString('es-ES', { hour12: false });
}

function writeReportFile() {
  const lines = [];
  lines.push('REANÁLISIS CONTINUO CON OPENCODE (thinking desactivado)');
  lines.push(`Inicio: ${fmtTimestamp(state.startedAt)} · Proveedor: ${state.provider}`);
  lines.push(`Estado: ${state.stopReason ? `DETENIDO (${state.stopReason})` : 'EN EJECUCIÓN'}`);
  lines.push(`Pasadas completadas: ${state.passesDone} · Análisis nuevos: ${state.ok} · Fallos: ${state.failed}`);
  lines.push('');
  lines.push('Cada análisis nuevo se guarda junto a los anteriores para comparar versiones.');
  lines.push('');
  lines.push('Ticker | Tipo | Acceso | Versión anterior | Versión nueva');
  lines.push('-------|------|--------|------------------|--------------');
  for (const p of state.pairs) {
    lines.push(
      `${p.ticker} | ${p.form || '?'} | ${p.accession} | #${p.prevId ?? '?'} ${p.prevModel ?? ''} ${p.prevRating ?? ''} | #${p.newId ?? '-'} ${p.newModel ?? ''} ${p.newRating ?? ''}`,
    );
  }
  lines.push('');
  lines.push('EVENTOS (últimas 80 líneas)');
  for (const e of state.events.slice(-80)) lines.push(e);
  lines.push('');
  writeFileSync(REPORT_PATH, lines.join('\n'));
}

async function formInfoFor(ticker, accession) {
  if (!state.filingsCache.has(ticker)) {
    try {
      const data = await getCompanyFilings(ticker, { limit: 120 });
      state.filingsCache.set(ticker, data?.filings ?? []);
    } catch {
      state.filingsCache.set(ticker, []);
    }
  }
  const filings = state.filingsCache.get(ticker);
  const f = filings.find((x) => x.accession === accession);
  return { formType: f?.formType ?? null, periodLabel: f?.periodLabel ?? f?.period ?? null };
}

async function loadPairs() {
  const params = [];
  let where = `status='done' AND report IS NOT NULL AND ticker IS NOT NULL AND accession IS NOT NULL AND (is_reviewed IS FALSE OR is_reviewed IS NULL)`;
  if (TICKERS_FILTER) {
    params.push(TICKERS_FILTER);
    where += ` AND ticker = ANY($${params.length})`;
  }
  const { rows } = await pool.query(
    `SELECT ticker, accession, count(*) AS versions FROM analyses WHERE ${where} GROUP BY 1,2 ORDER BY 1,2`,
    params,
  );
  const pairs = [];
  for (const r of rows) {
    const info = await formInfoFor(r.ticker, r.accession);
    pairs.push({ ticker: r.ticker, accession: r.accession, form: info.formType, versions: Number(r.versions) });
  }
  return pairs;
}

async function refreshPairState(p) {
  const { rows } = await pool.query(
    `SELECT id, model_used, report->'rating'->>'score' AS score, created_at
       FROM analyses
      WHERE ticker=$1 AND accession=$2 AND status='done' AND report IS NOT NULL
      ORDER BY created_at DESC, id DESC`, [p.ticker, p.accession]);
  const [nueva, anterior] = rows;
  p.newId = nueva?.id ?? null;
  p.newModel = nueva?.model_used ?? null;
  p.newRating = nueva?.score ? `nota ${nueva.score}` : 'sin nota';
  p.prevId = anterior?.id ?? null;
  p.prevModel = anterior?.model_used ?? null;
  p.prevRating = anterior?.score ? `nota ${anterior.score}` : 'sin nota';
}

async function updatePairState(pair) {
  try {
    await refreshPairState(pair);
  } catch {
    // sin bloquear el bucle por un fallo de lectura puntual
  }
}

async function refreshPairsState() {
  for (const p of state.pairs) {
    await updatePairState(p);
  }
}

async function exportComparisons() {
  mkdirSync(COMPARE_DIR, { recursive: true });
  for (const p of state.pairs) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM analyses
          WHERE ticker=$1 AND accession=$2 AND status='done' AND report IS NOT NULL
          ORDER BY created_at DESC, id DESC LIMIT 2`, [p.ticker, p.accession]);
      if (!rows.length) continue;
      const slug = buildReportSlug(rows[0]);
      const modelSuffix = (m) => String(m || 'desconocido').replace(/[^a-z0-9-]/gi, '').toLowerCase();
      for (const [i, row] of rows.entries()) {
        const full = await loadPublicReportRow(row.id);
        const md = full ? await getPublicReportMarkdown(row.id) : null;
        if (!md) continue;
        const label = i === 0 ? 'nueva' : 'anterior';
        writeFileSync(`${COMPARE_DIR}/${p.ticker}-${slug}_${label}_${modelSuffix(row.model_used)}.md`, md);
      }
    } catch (error) {
      console.error(`[${timestamp()}] [EXPORT] ${p.ticker} ${p.accession}: ${error.message}`);
    }
  }
}

async function reanalyzePair(pair) {
  const { ticker, accession, form } = pair;
  const start = Date.now();
  const content = await getFilingContentBuffer(ticker, accession);
  if (!content) {
    console.warn(`[${timestamp()}] [AVISO] Sin contenido para ${ticker} ${accession}.`);
    return { ok: false, reason: 'FILING_CONTENT_EMPTY' };
  }
  let presentationText = null;
  try {
    const presentations = await getPresentationBuffers(ticker, accession);
    if (presentations.length) presentationText = await buildPresentationText(presentations);
  } catch (presentationError) {
    console.warn(`[${timestamp()}] [analysis:presentation] ${presentationError.message}`);
  }
  const options = {
    userId: null,
    actor: 'programa',
    isPublic: true,
    filename: `${ticker}-${accession}.pdf`,
    ticker,
    accession,
    sourceUrl: content.filing?.documentUrl ?? null,
    modelUsed: PROVIDER,
    formType: form ?? null,
    presentationText,
  };
  const result = content.kind === 'pdf'
    ? await analyzePdf(content.buffer, options)
    : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  return { ok: true, elapsed, analysisId: result?.analysisId ?? null };
}

export async function main() {
  console.log('='.repeat(70));
  console.log(' REANÁLISIS CONTINUO — versiones nuevas vs anteriores (OpenCode)');
  console.log('='.repeat(70));
  console.log(` • Proveedor: ${PROVIDER} · AI_THINKING=${process.env.AI_THINKING || 'disabled'}`);
  console.log(` • Paralelismo: ${CONCURRENCY} análisis simultáneos · Pausa: ${DELAY_MS} ms`);
  console.log(` • Reintento tras saturación: ${RATE_LIMIT_WAIT_MS / 1000}s (máx. ${MAX_RATE_LIMITS} seguidos)`);
  console.log(` • Duración máxima: ${RUN_MINUTES > 0 ? `${RUN_MINUTES} min` : 'sin límite'}`);

  state.pairs = await loadPairs();
  console.log(` • Informes con versiones anteriores: ${state.pairs.length}`);
  await refreshPairsState();
  writeReportFile();

  const deadline = RUN_MINUTES > 0 ? Date.now() + RUN_MINUTES * 60 * 1000 : Infinity;
  let pairIndex = 0;
  let consecutiveRateLimits = 0;
  let attempts = 0;

  function nextPair() {
    const pair = state.pairs[pairIndex % state.pairs.length];
    pairIndex += 1;
    return pair;
  }

  async function worker(workerId) {
    while (!state.stopReason) {
      if (Date.now() >= deadline) {
        state.stopReason = `tiempo máximo alcanzado (${RUN_MINUTES} min)`;
        return;
      }
      const pair = nextPair();
      attempts += 1;
      try {
        logEvent(`[W${workerId}] [ANALIZANDO] ${pair.ticker} ${pair.form || '?'} (${pair.accession})...`);
        const res = await reanalyzePair(pair);
        if (res.ok) {
          state.ok += 1;
          consecutiveRateLimits = 0;
          logEvent(`[W${workerId}] [OK] ${pair.ticker} ${pair.form || '?'} guardado (ID ${res.analysisId}, ${res.elapsed}s).`);
          await updatePairState(pair);
        } else {
          state.failed += 1;
          logEvent(`[W${workerId}] [FALLO] ${pair.ticker} ${pair.accession}: ${res.reason}`);
        }
      } catch (error) {
        const code = error instanceof AiProviderError ? error.code : null;
        if (code === 'AI_RATE_LIMIT') {
          consecutiveRateLimits += 1;
          if (consecutiveRateLimits >= MAX_RATE_LIMITS) {
            state.stopReason = `límite de la API alcanzado (${consecutiveRateLimits} saturaciones seguidas)`;
            logEvent(`[W${workerId}] [LÍMITE API] ${error.message}`);
            return;
          }
          logEvent(`[W${workerId}] [SATURADO] ${error.message} — espero ${RATE_LIMIT_WAIT_MS / 1000}s (${consecutiveRateLimits}/${MAX_RATE_LIMITS})`);
          await sleep(RATE_LIMIT_WAIT_MS);
        } else {
          state.failed += 1;
          logEvent(`[W${workerId}] [ERROR] ${pair.ticker} ${pair.accession}: ${code || error.name}: ${error.message}`);
        }
      }
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  logEvent(`── INICIO — ${CONCURRENCY} análisis en paralelo — ${state.pairs.length} informes en rotación ──`);

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  state.passesDone = state.pairs.length ? Math.floor(attempts / state.pairs.length) : 0;
  await refreshPairsState();
  await exportComparisons();
  writeReportFile();
  logEvent(`FIN — ${state.stopReason}. Análisis nuevos: ${state.ok}, fallos: ${state.failed}, intentos: ${attempts}. Resumen en ${REPORT_PATH}`);
  await pool.end();
}
