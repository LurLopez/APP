/**
 * Corrección puntual de los análisis 852 (MU 10-K FY2026, ES) y 853 (EN):
 *  1) Simplificar la nota fiscal *2 del bloque Ventas al formato pedido:
 *     "con un 23 % de referencia debería haber pagado X, ha pagado Y y se le han restado Z".
 *       - 2026: 23 % × 99.671M = 22.924,33M; gasto fiscal 14.761M; resta 8.163,33M.
 *       - 2025: 23 % × 9.654M = 2.220,42M; gasto fiscal 1.124M; resta 1.096,42M.
 *  2) Renombrar la columna del bloque Cash Flow "Ajustado*1" -> "Normalizado*1"
 *     (ES) / "Adjusted*1" -> "Normalized*1" (EN).
 *
 * Uso: node --env-file=.env scratch/patch-nota-fiscal-852-853.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const PATCHES = [
  {
    id: 852,
    expectedPrefix: '*2: Impuestos: el gasto fiscal reportado',
    note: '*2: Impuestos: con el 23 % de referencia debería haber pagado 22924,33M y ha pagado 14761M; '
      + 'se le han restado 8163,33M. En el periodo comparable debería haber pagado 2220,42M y ha pagado 1124M; '
      + 'se le han restado 1096,42M.',
    expectedScenario: 'Ajustado*1 (WC=-13570)',
    scenario: 'Normalizado*1 (WC=-13570)',
  },
  {
    id: 853,
    expectedPrefix: '*2: Taxes: reported tax expense',
    note: '*2: Taxes: with the 23% reference it should have paid 22924.33M and it paid 14761M; '
      + '8163.33M have been deducted. In the comparable period it should have paid 2220.42M and it paid 1124M; '
      + '1096.42M have been deducted.',
    expectedScenario: 'Adjusted*1 (WC=-13570)',
    scenario: 'Normalized*1 (WC=-13570)',
  },
];

function failCount(report) {
  const res = runDeterministicChecks(report);
  return { counts: res.counts, fails: res.findings.filter((f) => f.level === 'fail') };
}

for (const patch of PATCHES) {
  const row = await getAnalysisById(patch.id);
  if (!row || !row.report) throw new Error(`No se encontró el análisis ${patch.id} con report`);

  const report = structuredClone(row.report);
  const notes = report.horizons?.[0]?.sales?.notes;
  if (!Array.isArray(notes) || !notes[0]) throw new Error(`Análisis ${patch.id}: no hay nota fiscal en horizons[0].sales.notes[0]`);

  const cashFlow = report.horizons?.[0]?.cashFlow;
  if (!Array.isArray(cashFlow?.scenarios)) throw new Error(`Análisis ${patch.id}: no hay cashFlow.scenarios`);

  const alreadyApplied = notes[0] === patch.note && cashFlow.scenarios.includes(patch.scenario);
  if (alreadyApplied) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }

  if (!String(notes[0]).startsWith(patch.expectedPrefix)) {
    throw new Error(`Análisis ${patch.id}: la nota actual no empieza como se esperaba: ${String(notes[0]).slice(0, 80)}`);
  }
  const scenarioIdx = cashFlow.scenarios.indexOf(patch.expectedScenario);
  if (scenarioIdx === -1) {
    throw new Error(`Análisis ${patch.id}: no se encontró el escenario "${patch.expectedScenario}" en cashFlow.scenarios`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log('nota:', notes[0]);
  console.log('escenarios:', JSON.stringify(cashFlow.scenarios));

  notes[0] = patch.note;
  cashFlow.scenarios[scenarioIdx] = patch.scenario;

  console.log(`=== ${patch.id} DESPUÉS ===`);
  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  console.log('nota:', notes[0]);
  console.log('escenarios:', JSON.stringify(cashFlow.scenarios));
  const beforeChecks = new Set(before.fails.map((f) => `${f.check}|${f.horizon ?? ''}`));
  const newFails = after.fails.filter((f) => !beforeChecks.has(`${f.check}|${f.horizon ?? ''}`));
  if (newFails.length > 0) {
    console.log('FAILS NUEVOS:', JSON.stringify(newFails, null, 2));
    throw new Error(`El parche del análisis ${patch.id} introduce fallos deterministas nuevos; no se guarda`);
  }

  const updated = await updateAnalysis(patch.id, { report });
  if (!updated) throw new Error(`updateAnalysis no actualizó el análisis ${patch.id}`);

  const url = String(updated.pdf_url ?? row.pdf_url);
  const base = path.basename(url, path.extname(url));
  await regenerateAllReportFormats(base, report);
  console.log(`OK: análisis ${patch.id} actualizado y formatos regenerados (base ${base})`);
}
