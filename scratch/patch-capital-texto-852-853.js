/**
 * Corrección puntual de los análisis 852 (MU, ES) y 853 (EN): acortar la verificación
 * del bloque «Asignación de capital» y centrarla en las dos causas principales
 * (depósitos de clientes estratégicos e incentivos públicos), sin forzar el cierre a 0.
 *
 * Uso: node --env-file=.env scratch/patch-capital-texto-852-853.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const PATCHES = [
  {
    id: 852,
    expectedPrefix: 'No cuadra: quedan -13300M',
    verification: 'No cuadra: quedan -13300M sin explicar. Principalmente son entradas de caja que no figuran en la tabla: '
      + 'depósitos de clientes estratégicos +12747M (anticipos a devolver entre 2029 y 2031) e incentivos públicos +3316M '
      + '(subvenciones CHIPS). El resto son partidas menores.',
  },
  {
    id: 853,
    expectedPrefix: 'Does not reconcile: -13300M',
    verification: 'Does not reconcile: -13300M remains unexplained. They are mainly cash inflows not shown in the table: '
      + 'strategic customer deposits +12747M (advances to be repaid between 2029 and 2031) and public incentives +3316M '
      + '(CHIPS subsidies). The rest are minor items.',
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
  const capital = report.horizons?.[0]?.capital;
  if (!capital || typeof capital.verification !== 'string') throw new Error(`Análisis ${patch.id}: no hay capital.verification`);

  if (capital.verification === patch.verification) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }
  if (!capital.verification.startsWith(patch.expectedPrefix)) {
    throw new Error(`Análisis ${patch.id}: la verificación actual no empieza como se esperaba: ${capital.verification.slice(0, 90)}`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log(capital.verification);

  capital.verification = patch.verification;

  console.log(`=== ${patch.id} DESPUÉS ===`);
  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  console.log(capital.verification);
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
