#!/usr/bin/env node
/**
 * @fileoverview Compara, con datos reales de EDGAR, la estimación del circulante por peso
 * agregado histórico (10 ejercicios) frente a la fórmula (inflación + volumen) del sector
 * cuando no hay dato de volumen. Imprime la tabla por empresa y el error medio de cada método.
 *
 * Uso:
 *   node --env-file=.env scripts/qa/compare-working-capital.js [TICKER1 TICKER2 ...]
 */

import { getCompanyResults } from '../../src/services/edgar.service.js';
import { buildWorkingCapitalHistory } from '../../src/agents/analyst/analystRunSteps.js';

const DEFAULT_TICKERS = ['KO', 'PEP', 'PG', 'CL', 'KMB', 'KHC', 'GIS', 'MKC', 'CPB', 'TAP'];
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TICKERS;
const toM = (value) => (value == null ? null : Math.round(Number(value) / 1e6 * 10) / 10);
const fmt = (value) => (value == null || !Number.isFinite(value)
  ? '—'
  : (value > 0 ? '+' : '') + Math.round(value).toLocaleString('es-ES'));
const fmtPct = (value) => (value == null ? '—' : `${(value * 100).toFixed(1).replace('.', ',')}%`);

const rows = [];
for (const ticker of TICKERS) {
  try {
    const res = await getCompanyResults(ticker);
    const history = buildWorkingCapitalHistory(res);
    const latest = history[0];
    const latestRow = (res.annual || []).find((row) => Number(row.values?.cfo) === latest.cfo * 1e6) || (res.annual || [])[0];
    const values = latestRow?.values || {};
    const inv = toM(values.inventory);
    const pay = toM(values.payables);
    const rec = toM(values.receivables);
    const base = pay != null && inv != null && rec != null ? pay - inv - rec : null;
    const reported = latest.wcChange;
    const periodBase = latest.cfo - reported;
    const sumWc = history.reduce((acc, point) => acc + point.wcChange, 0);
    const sumBase = history.reduce((acc, point) => acc + (point.cfo - point.wcChange), 0);
    const ratio = sumBase > 0 ? sumWc / sumBase : null;
    const theoOld = base != null ? Math.round(base * 0.03 * 10) / 10 : null;
    const theoNew = ratio != null ? Math.round(ratio * periodBase * 10) / 10 : null;
    const devOld = theoOld != null ? Math.round((reported - theoOld) * 10) / 10 : null;
    const devNew = theoNew != null ? Math.round((reported - theoNew) * 10) / 10 : null;
    rows.push({ ticker, years: history.length, base, reported, theoOld, devOld, ratio, theoNew, devNew });
    console.log(`${ticker.padEnd(5)} años=${history.length} base=${fmt(base).padStart(12)} reportado=${fmt(reported).padStart(11)} | 3%: teor=${fmt(theoOld).padStart(11)} desv=${fmt(devOld).padStart(11)} | hist=${fmtPct(ratio).padStart(7)} teor=${fmt(theoNew).padStart(11)} desv=${fmt(devNew).padStart(11)}`);
  } catch (error) {
    console.warn(`${ticker}: ${error.message}`);
  }
}

const withData = rows.filter((row) => row.devOld != null && row.devNew != null);
const avg = (list) => list.reduce((acc, value) => acc + value, 0) / list.length;
const maeOld = avg(withData.map((row) => Math.abs(row.devOld)));
const maeNew = avg(withData.map((row) => Math.abs(row.devNew)));
const hitsOld = withData.filter((row) => Math.abs(row.devOld) < Math.abs(row.devNew)).length;
console.log(`\n=== ${withData.length} empresas ===`);
console.log(`Error absoluto medio frente al reportado — fórmula 3 % (inflación + volumen): ${Math.round(maeOld)}M`);
console.log(`Error absoluto medio frente al reportado — peso agregado 10 años: ${Math.round(maeNew)}M`);
console.log(`Más cerca del reportado: fórmula 3 % -> ${hitsOld} | histórico -> ${withData.length - hitsOld}`);
console.log('\nticker;base;reportado;teorico3%;desv3%;ratio10a;teoricoHist;desvHist');
for (const row of rows) {
  console.log([row.ticker, row.base, row.reported, row.theoOld, row.devOld, (row.ratio * 100).toFixed(1), row.theoNew, row.devNew].join(';'));
}
