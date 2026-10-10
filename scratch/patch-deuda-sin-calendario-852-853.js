/**
 * Corrección puntual de los análisis 852 (MU, ES) y 853 (EN):
 * quitar el gráfico de vencimientos del bloque Deuda (solo mostraba pagos de arrendamientos;
 * el usuario quiere solo notas) y evitar que aparezca la tabla de respaldo de la Nota 9.
 *   - Se eliminan: maturitySchedule, maturityCalendar, maturityAfterFive, secSnippet y secTable.
 *   - El texto de deuda queda solo con notas.
 *
 * Uso: node --env-file=.env scratch/patch-deuda-sin-calendario-852-853.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const PATCHES = [
  {
    id: 852,
    oldDebtPrefix: '**Deuda neta:',
    debtText: '**Deuda neta: -38.255M$** (caja neta) frente a **4.270M$** hace un año (**-42.525M$**). '
      + '**Deuda bruta: 5.179M$** frente a **14.577M$** (**-9.398M$**). No hay vencimientos de notas '
      + 'hasta **2032**. Tipo medio estimado: **4,26 %**. Intereses: **106M** devengados y **197M** pagados en efectivo.',
  },
  {
    id: 853,
    oldDebtPrefix: '**Net debt:',
    debtText: '**Net debt: -38,255M$** (net cash) vs **4,270M$** a year ago (**-42,525M$**). '
      + '**Gross debt: 5,179M$** vs **14,577M$** (**-9,398M$**). No note maturities until **2032**. '
      + 'Estimated average rate: **4.26 %**. Interest: **106M** accrued and **197M** paid in cash.',
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
  if (!debt) throw new Error(`Análisis ${patch.id}: no hay conclusion.debt`);

  const alreadyApplied = debt.maturitySchedule === undefined && debt.maturityAfterFive === undefined
    && debt.secSnippet === undefined && debt.secTable === undefined && debt.text === patch.debtText;
  if (alreadyApplied) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }
  if (!String(debt.text ?? '').startsWith(patch.oldDebtPrefix)) {
    throw new Error(`Análisis ${patch.id}: debt.text no empieza como se esperaba: ${String(debt.text).slice(0, 80)}`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log('tiene calendario:', Array.isArray(debt.maturitySchedule) ? debt.maturitySchedule.length : 0,
    '| maturityAfterFive:', debt.maturityAfterFive, '| secSnippet:', debt.secSnippet ? 'sí' : 'no');

  // Fuera el calendario de vencimientos (solo mostraba arrendamientos) y su tabla de respaldo.
  delete debt.maturitySchedule;
  delete debt.maturityCalendar;
  delete debt.maturityAfterFive;
  delete debt.secSnippet;
  delete debt.secTable;
  // Texto solo con notas.
  debt.text = patch.debtText;

  console.log(`=== ${patch.id} DESPUÉS ===`);
  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  console.log('tiene calendario:', Array.isArray(debt.maturitySchedule) ? debt.maturitySchedule.length : 0,
    '| maturityAfterFive:', debt.maturityAfterFive, '| secSnippet:', debt.secSnippet ? 'sí' : 'no');
  console.log('debt.text:', debt.text);
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
