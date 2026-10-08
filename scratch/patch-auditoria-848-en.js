/**
 * Genera la variante EN del análisis 848 (PEP 2026-Q3, ES ya corregido) usando el
 * servicio oficial de traducción, para que ambos idiomas lleven las mismas correcciones:
 *  - nota duplicada del guidance eliminada,
 *  - verificación de capital 3M corta con el efecto divisa (-431M),
 *  - texto del guidance con la tasa fiscal reducida (22% -> 21%).
 *
 * Uso: node --env-file=.env scratch/patch-auditoria-848-en.js
 */
import { getAnalysisById } from '../db/repositories/analysisRepository.js';
import { translateAnalysisVariant } from '../src/services/translation/analysisTranslation.service.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const SOURCE_ID = 848;

const source = await getAnalysisById(SOURCE_ID);
if (!source || !source.report) throw new Error(`No se encontró el análisis ${SOURCE_ID} con report`);

console.log(`Origen: #${source.id} (${source.language}) · ${source.ticker} ${source.accession}`);

const result = await translateAnalysisVariant({
  source,
  targetLanguage: 'en',
  actor: 'verificador-analisis',
  isPublic: true,
});

console.log(`Variante EN creada: #${result.analysisId} · ${result.pdfUrl}`);

const variant = await getAnalysisById(result.analysisId);
const report = variant.report;
const checks = runDeterministicChecks(report);
const fails = checks.findings.filter((f) => f.level === 'fail');

console.log('--- Validación de la variante EN ---');
console.log('deterministas:', checks.total, JSON.stringify(checks.counts));
if (fails.length) console.log('FAILS:', JSON.stringify(fails, null, 2));
console.log('capital 3M rows:', JSON.stringify(report.horizons[0].capital.rows));
console.log('capital 3M verification:', report.horizons[0].capital.verification);
console.log('capital 9M rows:', JSON.stringify(report.horizons[1].capital.rows));
console.log('quarterNotes:', JSON.stringify(report.quarterNotes?.notes?.map((n) => n.title)));
console.log('guidance:', report.quarterNotes?.guidance?.text);

if (fails.length) throw new Error('La variante EN introduce fallos deterministas');
console.log('OK: variante EN lista.');
