/**
 * Corrección puntual de los análisis 852 (MU 10-K FY2026, ES) y 853 (EN):
 * reescribir la nota *2 de impuestos del bloque Cash Flow para explicar de forma breve
 * que solo se han pagado 1254M en efectivo y que el gasto fiscal de la cuenta de
 * resultados sigue pendiente de pago (9820M en otros pasivos no corrientes, Nota 18),
 * eliminando la frase confusa del auditor sobre la duplicación.
 *
 * Uso: node --env-file=.env scratch/patch-nota-impuestos-cashflow-852-853.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const PATCHES = [
  {
    id: 852,
    expectedPrefix: '*2: Impuestos: La empresa debería haber pagado',
    note: '*2: Impuestos: la empresa debería haber pagado 22924,3M (23 % sobre el EBT ajustado de 99671M) y solo ha pagado '
      + '1254M en efectivo; ajuste de __-21670,3M__ al Cash Flow Ajustado. La explicación: el gasto fiscal de la cuenta de '
      + 'resultados (14761M) no se ha pagado en caja y la mayor parte sigue pendiente como impuestos a pagar, con 9820M en '
      + 'otros pasivos no corrientes (Nota 18).',
  },
  {
    id: 853,
    expectedPrefix: '*2: Taxes: The company should have paid',
    note: '*2: Taxes: the company should have paid 22924.3M (23% on adjusted EBT of 99671M) and has only paid 1254M in cash; '
      + 'adjustment of __-21670.3M__ to Adjusted Cash Flow. The explanation: the income statement tax expense (14761M) has '
      + 'not been paid in cash and most of it remains as taxes payable, with 9820M in other noncurrent liabilities (Note 18).',
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
  const notes = report.horizons?.[0]?.cashFlow?.notes;
  if (!Array.isArray(notes) || !notes[1]) throw new Error(`Análisis ${patch.id}: no hay nota *2 en horizons[0].cashFlow.notes[1]`);

  if (notes[1] === patch.note) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }
  if (!String(notes[1]).startsWith(patch.expectedPrefix)) {
    throw new Error(`Análisis ${patch.id}: la nota actual no empieza como se esperaba: ${String(notes[1]).slice(0, 90)}`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log(notes[1]);

  notes[1] = patch.note;

  console.log(`=== ${patch.id} DESPUÉS ===`);
  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  console.log(notes[1]);
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
