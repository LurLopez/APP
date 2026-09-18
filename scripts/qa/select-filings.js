#!/usr/bin/env node
/**
 * @fileoverview Selecciona N informes (10-Q/10-K) aleatorios de empresas de consumo
 * defensivo de EE. UU. que aún no tengan análisis en la base de datos, simulando
 * el flujo real de «Analizar con IA» sobre un filing nuevo.
 *
 * Uso:
 *   node --env-file=.env scripts/qa/select-filings.js --count=15 --seed=20260918
 */

import { writeFile } from 'node:fs/promises';
import { getCompanyFilings } from '../../src/services/edgar.service.js';
import { getAnalyzedAccessions } from '../../db/repositories/analysisRepositoryQueries.js';
import { CONSUMER_STAPLES_UNIVERSE } from '../data/consumer-staples.js';
import { pool } from '../../db/pool.js';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const COUNT = Math.max(1, Number(getArg('count', 15)));
const SEED = Number(getArg('seed', 20260918));
const FROM_PERIOD = String(getArg('from-period', '2024-01-01'));
const OUTPUT = getArg('output', 'documentacion/revisiones/2026-09-18/seleccion.json');
const ANNUAL_TARGET = Number(getArg('annual-target', 4));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);
const shuffled = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

async function candidatesForTicker(ticker) {
  const { filings } = await getCompanyFilings(ticker, { limit: 80 });
  const eligible = (filings ?? []).filter((f) => {
    if (!['10-Q', '10-K'].includes(f.formType)) return false;
    const period = String(f.period ?? f.filedAt ?? '');
    return period >= FROM_PERIOD;
  });
  if (!eligible.length) return [];
  const analyzed = await getAnalyzedAccessions(ticker, eligible.map((f) => f.accession));
  return eligible.filter((f) => !analyzed.has(f.accession));
}

async function main() {
  const universe = CONSUMER_STAPLES_UNIVERSE.filter((u) => u.domestic && u.staples && u.capM >= 500);
  const tickers = shuffled(universe.map((u) => u.ticker));

  const selection = [];
  const annualCount = { value: 0 };

  for (const ticker of tickers) {
    if (selection.length >= COUNT) break;
    try {
      const candidates = await candidatesForTicker(ticker);
      if (!candidates.length) {
        console.log(`[SKIP] ${ticker}: sin filings sin analizar desde ${FROM_PERIOD}`);
        continue;
      }
      const quarters = candidates.filter((f) => f.formType === '10-Q');
      const annuals = candidates.filter((f) => f.formType === '10-K');
      const wantAnnual = annuals.length && annualCount.value < ANNUAL_TARGET && random() < 0.45;
      const pool2 = wantAnnual || !quarters.length ? annuals : quarters;
      const filing = pool2[Math.floor(random() * pool2.length)];
      if (filing.formType === '10-K') annualCount.value += 1;
      selection.push({
        ticker,
        name: universe.find((u) => u.ticker === ticker)?.name ?? null,
        formType: filing.formType,
        period: filing.period,
        periodLabel: filing.periodLabel,
        filedAt: filing.filedAt,
        accession: filing.accession,
        documentUrl: filing.documentUrl ?? null,
      });
      console.log(`[OK ${selection.length}/${COUNT}] ${ticker} ${filing.formType} ${filing.periodLabel ?? filing.period} (${filing.accession})`);
    } catch (error) {
      console.log(`[SKIP] ${ticker}: ${error.message}`);
    }
  }

  if (!selection.length) throw new Error('No se encontraron filings sin analizar.');

  await writeFile(OUTPUT, `${JSON.stringify({ seed: SEED, fromPeriod: FROM_PERIOD, createdAt: new Date().toISOString(), count: selection.length, filings: selection }, null, 2)}\n`);
  console.log(`\nSelección guardada en ${OUTPUT} (${selection.length} informes, semilla ${SEED}).`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
