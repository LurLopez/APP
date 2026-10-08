/**
 * Corrección puntual del análisis 848 (PEP 2026-Q3, 10-Q, ES) tras auditoría manual:
 *  1) Eliminar la nota duplicada del guidance en quarterNotes.notes (ya está el bloque guidance).
 *  2) Reescribir la verificación de Asignación de Capital (3M) explicando el descuadre de +621M
 *     con el efecto divisa (-431M) y los movimientos no monetarios verificados.
 *  3) Precisar en el texto del guidance que la tasa fiscal core se reduce a ~21% (desde 22%),
 *     en lugar de quedar bajo "Mantiene ...".
 *
 * Uso: node --env-file=.env scratch/patch-auditoria-848.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const ANALYSIS_ID = 848;

const VERIFICATION_3M =
  'No cuadra: quedan +621M sin explicar entre el capital libre y los usos detectados. El descuadre se explica por movimientos no monetarios y partidas no mapeadas que lo cierran al incluirlos: ' +
  '(1) efecto divisa negativo sobre la caja del trimestre de -431M (acumulado a 36 semanas -175M frente al +256M acumulado a 24 semanas del 2T: -175M - 256M = -431M); ' +
  '(2) deuda no monetaria: el repago neto de deuda en efectivo fue de 1.501M frente a una reducción de balance de 1.333M (168M de diferencia por efecto divisa y revalorizaciones de deuda en divisas); ' +
  '(3) partidas de inversión no mapeadas, neto -39M (ventas de inmovilizado +18M, inversiones a corto plazo -11M y otros -46M); y ' +
  '(4) los -17M restantes se cierran con las opciones ejercidas (+8M), la diferencia entre las recompras de flujos (260M) y la fila (270M) (+10M) y redondeos (-1M). ' +
  'Con todo, el descuadre queda cerrado (≈0M).';

const GUIDANCE_BEFORE =
  'Mantiene el crecimiento de ingresos orgánicos en aproximadamente +3% (desde +2% a +4%), la tasa impositiva efectiva anual core en aproximadamente 21% (desde 22%), el gasto de capital por debajo del 5% de los ingresos netos, un ratio de conversión de flujo de caja libre de al menos 80% y retornos de efectivo a accionistas de 8.900M$ (7.900M$ en dividendos y 1.000M$ en recompras).';
const GUIDANCE_AFTER =
  'Mantiene el crecimiento de ingresos orgánicos en aproximadamente +3% (desde +2% a +4%) y reduce la tasa impositiva efectiva anual core a aproximadamente 21% (desde 22%). Mantiene el gasto de capital por debajo del 5% de los ingresos netos, un ratio de conversión de flujo de caja libre de al menos 80% y retornos de efectivo a accionistas de 8.900M$ (7.900M$ en dividendos y 1.000M$ en recompras).';

function failCount(report) {
  const res = runDeterministicChecks(report);
  return { counts: res.counts, fails: res.findings.filter((f) => f.level === 'fail') };
}

const row = await getAnalysisById(ANALYSIS_ID);
if (!row || !row.report) throw new Error(`No se encontró el análisis ${ANALYSIS_ID} con report`);

const report = structuredClone(row.report);

console.log('=== ANTES ===');
const before = failCount(report);
console.log('checks:', JSON.stringify(before.counts));
console.log('notes:', (report.quarterNotes?.notes ?? []).map((n) => n.title));
console.log('verificación 3M:', report.horizons?.[0]?.capital?.verification?.slice(0, 120), '...');

// 1) Nota duplicada del guidance
const notes = report.quarterNotes?.notes ?? [];
const filtered = notes.filter((n) => !/^revisi[oó]n a la baja del guidance/i.test(String(n?.title ?? '')));
if (filtered.length === notes.length) throw new Error('No se encontró la nota duplicada del guidance');
report.quarterNotes.notes = filtered;

// 2) Verificación de Asignación de Capital (3M)
report.horizons[0].capital.verification = VERIFICATION_3M;

// 3) Texto del guidance: la tasa fiscal se reduce, no se mantiene
if (!report.quarterNotes?.guidance?.text?.includes(GUIDANCE_BEFORE)) {
  throw new Error('No se encontró el fragmento esperado del guidance');
}
report.quarterNotes.guidance.text = report.quarterNotes.guidance.text.replace(GUIDANCE_BEFORE, GUIDANCE_AFTER);

console.log('=== DESPUÉS ===');
const after = failCount(report);
console.log('checks:', JSON.stringify(after.counts));
console.log('notes:', report.quarterNotes.notes.map((n) => n.title));
console.log('verificación 3M:', report.horizons[0].capital.verification);
console.log('guidance:', report.quarterNotes.guidance.text);

if (after.fails.length > 0) {
  console.log('FAILS DESPUÉS:', JSON.stringify(after.fails, null, 2));
  throw new Error('La corrección introduce fallos deterministas; no se guarda');
}

const updated = await updateAnalysis(ANALYSIS_ID, { report });
if (!updated) throw new Error('updateAnalysis no actualizó nada');

const base = path.basename(String(updated.pdf_url ?? row.pdf_url), path.extname(String(updated.pdf_url ?? row.pdf_url)));
await regenerateAllReportFormats(base, report);
console.log(`OK: análisis ${ANALYSIS_ID} actualizado y formatos regenerados (base ${base})`);
