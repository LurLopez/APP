/**
 * Corrección puntual de los análisis STZ 2027-Q2 (10-Q, cerrado 2026-08-31) con las reglas
 * fiscales deterministas actualizadas:
 *  - Retira la nota fiscal del trimestre actual cuando su tipo efectivo está dentro del ±20 %
 *    (no se ajusta nada: la nota sobraba).
 *  - Si el comparativo se normaliza (su impuesto real se desvía más del ±20 %), añade/reescribe
 *    la nota fiscal con el cierre «Beneficio Neto Anterior Ajustado = EBT Ajustado × 0,77» y
 *    marca el resalte en la casilla «Anterior Aj.» (adjustedCell "previous").
 *
 * Hechos fiscales reales del filing (XBRL SEC, CIK 16918):
 *  3M: gasto actual 147,1M · comparativo 296,8M (desviación +64,8 % → se normaliza).
 *  YTD: gasto actual 235,2M · comparativo 384,4M (desviación +19,9 % → dentro del umbral).
 *
 * Uso: node --env-file=.env scratch/patch-stz-fiscal.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';
import { normalizeSalesBlock } from '../src/agents/analyst/analystSalesProcessor.js';

const TARGETS = [
  { id: 850, language: 'es', label: 'STZ 2027-Q2 ES' },
  { id: 838, language: 'en', label: 'STZ 2027-Q2 EN' },
];

const FACTS = {
  incomeTaxExpenseQuarter: 147.1,
  incomeTaxExpensePrevQuarter: 296.8,
  incomeTaxExpenseYtd: 235.2,
  incomeTaxExpensePrevYtd: 384.4,
};

function failCount(report) {
  const res = runDeterministicChecks(report);
  return res.counts.fail ?? 0;
}

function describeHorizon(horizon) {
  const rows = Object.fromEntries((horizon?.sales?.rows ?? []).map((row) => [row.name, row]));
  const net = rows['Beneficio Neto'] ?? rows['Net Income'];
  return {
    label: horizon?.label,
    notes: horizon?.sales?.notes ?? [],
    net: net && {
      adjusted: net.adjusted,
      prevAdjusted: net.prevAdjusted,
      isAdjusted: net.isAdjusted,
      adjustedNote: net.adjustedNote,
      adjustedCell: net.adjustedCell,
    },
  };
}

for (const target of TARGETS) {
  const row = await getAnalysisById(target.id);
  if (!row?.report) throw new Error(`No se encontró el análisis ${target.id} con report`);

  const report = structuredClone(row.report);
  const failsBefore = failCount(report);

  console.log(`\n=== ${target.label} (id ${target.id}) · ANTES ===`);
  for (const horizon of report.horizons ?? []) console.log(JSON.stringify(describeHorizon(horizon), null, 2));

  for (const horizon of report.horizons ?? []) {
    normalizeSalesBlock(horizon, { fiscalYear: 2027, facts: FACTS }, target.language, 'consumer_defensive');
  }

  console.log(`=== ${target.label} · DESPUÉS ===`);
  for (const horizon of report.horizons ?? []) console.log(JSON.stringify(describeHorizon(horizon), null, 2));

  const failsAfter = failCount(report);
  if (failsAfter > failsBefore) {
    throw new Error(`La corrección aumenta los fallos deterministas (${failsBefore} -> ${failsAfter}); no se guarda el ${target.id}`);
  }

  const updated = await updateAnalysis(target.id, { report });
  if (!updated) throw new Error(`updateAnalysis no actualizó el análisis ${target.id}`);

  const pdfUrl = String(updated.pdf_url ?? row.pdf_url);
  const base = path.basename(pdfUrl, path.extname(pdfUrl));
  await regenerateAllReportFormats(base, report);
  console.log(`OK: análisis ${target.id} actualizado y formatos regenerados (base ${base})`);
}
