/**
 * Corrección puntual de los análisis 852 (MU 10-K FY2026, ES) y 853 (EN):
 * simplificar la línea «ACCIONES / BPA» del bloque Ventas y corregir sus cifras.
 *   - Acciones: 1131M al cierre vs 1122M => +0,8 % (efecto en BPA -0,8 %). Antes decía +10,7 %.
 *   - BPA: según la regla del sector (Beneficio Neto Ajustado / acciones diluidas promedio):
 *     76.746,67 / 1.143 = 67,15 $; anterior 7.433,58 / 1.125 = 6,61 $ => +916,2 %.
 *     Antes mostraba 74,33 $ (GAAP) contra 8,29 $ (no-GAAP del año anterior).
 *
 * Uso: node --env-file=.env scratch/patch-acciones-bpa-852-853.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const PATCHES = [
  {
    id: 852,
    oldSharesPrefix: '1131M (al final del 2026',
    oldEpsPrefix: '74,33 $ ->',
    shares: '1131M al cierre vs 1122M (+0,8 %). Efecto en BPA: -0,8 %',
    eps: '67,15 $ vs 6,61 $ (+916,2 %)',
  },
  {
    id: 853,
    oldSharesPrefix: '1131M (at the end of 2026',
    oldEpsPrefix: '74.33 $ ->',
    shares: '1131M at year-end vs 1122M (+0.8 %). Effect on EPS: -0.8 %',
    eps: '67.15 $ vs 6.61 $ (+916.2 %)',
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
  const sales = report.horizons?.[0]?.sales;
  if (!sales) throw new Error(`Análisis ${patch.id}: no hay horizons[0].sales`);

  if (sales.shares === patch.shares && sales.eps === patch.eps) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }
  if (!String(sales.shares ?? '').startsWith(patch.oldSharesPrefix)) {
    throw new Error(`Análisis ${patch.id}: «shares» no empieza como se esperaba: ${String(sales.shares).slice(0, 80)}`);
  }
  if (!String(sales.eps ?? '').startsWith(patch.oldEpsPrefix)) {
    throw new Error(`Análisis ${patch.id}: «eps» no empieza como se esperaba: ${String(sales.eps).slice(0, 80)}`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log('shares:', sales.shares);
  console.log('eps:', sales.eps);

  sales.shares = patch.shares;
  sales.eps = patch.eps;

  console.log(`=== ${patch.id} DESPUÉS ===`);
  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  console.log('shares:', sales.shares);
  console.log('eps:', sales.eps);
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
