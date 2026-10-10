/**
 * Corrección puntual de los análisis 852 (MU, ES) y 853 (EN):
 *  1) conclusion.debt.maturityAfterFive: 3369 -> 3467 (notas 2.808M + arrendamientos 659M posteriores al año 5).
 *  2) conclusion.debt.text: versión corta y clara.
 *  3) Eliminar el bloque de refinanciación (refinancing, refinancingAnalysis, refinancingImpact):
 *     no aporta (no fue una refinanciación; los tipos anteriores/nuevos eran «—»).
 *  4) conclusion.acquisitions: dejar solo el párrafo de la compra de Tongluo; fuera los «no hubo»
 *     de desinversiones, spin-offs y reestructuraciones; flags a false.
 *
 * Uso: node --env-file=.env scratch/patch-deuda-corpo-852-853.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const PATCHES = [
  {
    id: 852,
    oldDebtPrefix: 'La deuda neta se sitúa en',
    debtText: '**Deuda neta: -38.255M$** (caja neta) frente a **4.270M$** hace un año (**-42.525M$**). '
      + '**Deuda bruta: 5.179M$** frente a **14.577M$** (**-9.398M$**). No hay vencimientos de notas hasta '
      + '**2032**; hasta entonces solo se pagan arrendamientos (2027: 577M; 2028: 560M; 2029: 500M; 2030: 349M; '
      + '2031: 130M). Tipo medio estimado: **4,26 %**. Intereses: **106M** devengados y **197M** pagados en efectivo.',
    acqCut: '\n\n**Desinversiones',
  },
  {
    id: 853,
    oldDebtPrefix: 'Net debt stands at',
    debtText: '**Net debt: -38,255M$** (net cash) vs **4,270M$** a year ago (**-42,525M$**). '
      + '**Gross debt: 5,179M$** vs **14,577M$** (**-9,398M$**). No note maturities until **2032**; until then '
      + 'only finance leases are paid (2027: 577M; 2028: 560M; 2029: 500M; 2030: 349M; 2031: 130M). '
      + 'Estimated average rate: **4.26 %**. Interest: **106M** accrued and **197M** paid in cash.',
    acqCut: '\n\n**Divestitures',
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
  const debt = report.conclusion?.debt;
  const acq = report.conclusion?.acquisitions;
  if (!debt || !acq) throw new Error(`Análisis ${patch.id}: faltan conclusion.debt o conclusion.acquisitions`);

  const alreadyApplied = debt.maturityAfterFive === 3467
    && debt.refinancing === undefined && debt.refinancingAnalysis === undefined && debt.refinancingImpact === undefined
    && acq.hasDivestitures === false && acq.hasSpinOffs === false && acq.hasRestructurings === false
    && !String(acq.text).includes('no registró') && !String(acq.text).includes('recorded no');
  if (alreadyApplied) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }

  if (!String(debt.text ?? '').startsWith(patch.oldDebtPrefix)) {
    throw new Error(`Análisis ${patch.id}: debt.text no empieza como se esperaba: ${String(debt.text).slice(0, 80)}`);
  }
  const acqCutIdx = String(acq.text).indexOf(patch.acqCut);
  if (acqCutIdx === -1) {
    throw new Error(`Análisis ${patch.id}: no se encontró el corte de párrafos en acquisitions.text`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log('maturityAfterFive:', debt.maturityAfterFive, '| refinancing:', debt.refinancing ? 'sí' : 'no',
    '| flags:', acq.hasDivestitures, acq.hasSpinOffs, acq.hasRestructurings);

  // 1) Vencimientos posteriores al año 5: notas 2.808M + arrendamientos 659M.
  debt.maturityAfterFive = 3467;
  // 2) Texto de deuda corto y claro.
  debt.text = patch.debtText;
  // 3) Fuera el bloque de refinanciación.
  delete debt.refinancing;
  delete debt.refinancingAnalysis;
  delete debt.refinancingImpact;
  // 4) Operaciones corporativas: solo la adquisición de Tongluo y flags apagados.
  acq.text = String(acq.text).slice(0, acqCutIdx);
  acq.hasDivestitures = false;
  acq.hasSpinOffs = false;
  acq.hasRestructurings = false;

  console.log(`=== ${patch.id} DESPUÉS ===`);
  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  console.log('maturityAfterFive:', debt.maturityAfterFive, '| refinancing:', debt.refinancing ? 'sí' : 'no',
    '| flags:', acq.hasDivestitures, acq.hasSpinOffs, acq.hasRestructurings);
  console.log('debt.text:', debt.text);
  console.log('acq.text:', acq.text);
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
