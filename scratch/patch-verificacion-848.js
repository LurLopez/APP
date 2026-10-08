/**
 * Ajuste de la verificación de Asignación de Capital (3M) del análisis 848 (PEP 2026-Q3):
 * versión corta: sigue sin cuadrar, una parte (~-431M) es efecto divisa; el resto, movimientos
 * no monetarios de deuda y partidas no mapeadas. Sin afirmar que queda cerrado a 0.
 *
 * Uso: node --env-file=.env scratch/patch-verificacion-848.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const ANALYSIS_ID = 848;

const VERIFICATION_3M =
  'No cuadra: quedan +621M sin explicar entre el capital libre y los usos detectados. ' +
  'Una parte, -431M, es el efecto divisa negativo sobre la caja del trimestre (36 semanas -175M frente a +256M a 24 semanas del 2T); ' +
  'el resto corresponde a movimientos no monetarios de deuda y partidas no mapeadas.';

const row = await getAnalysisById(ANALYSIS_ID);
if (!row || !row.report) throw new Error(`No se encontró el análisis ${ANALYSIS_ID} con report`);

const report = structuredClone(row.report);
report.horizons[0].capital.verification = VERIFICATION_3M;

const res = runDeterministicChecks(report);
const fails = res.findings.filter((f) => f.level === 'fail');
console.log('checks:', JSON.stringify(res.counts));
if (fails.length > 0) {
  console.log('FAILS:', JSON.stringify(fails, null, 2));
  throw new Error('La corrección introduce fallos deterministas; no se guarda');
}

const updated = await updateAnalysis(ANALYSIS_ID, { report });
if (!updated) throw new Error('updateAnalysis no actualizó nada');

const base = path.basename(String(updated.pdf_url ?? row.pdf_url), path.extname(String(updated.pdf_url ?? row.pdf_url)));
await regenerateAllReportFormats(base, report);
console.log(`OK: verificación actualizada y formatos regenerados (base ${base})`);
console.log(report.horizons[0].capital.verification);
