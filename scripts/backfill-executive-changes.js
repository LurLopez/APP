/**
 * @fileoverview Backfill de la sección "Cambios en la dirección" de análisis anuales guardados.
 * Elimina los relevos históricos que la extracción tomó de las bio del 10-K ("en diciembre de
 * 2007 fue nombrado CEO ... en enero de 2017 Chair", caso Adobe) en lugar de cambios del
 * ejercicio, y renumera las secciones del informe. No toca los relevos con fechas del ejercicio
 * o del anterior (p. ej. la sucesión de CEO de Campbell's).
 *
 * Uso:
 *   node --env-file=.env scripts/backfill-executive-changes.js          # simulación (dry-run)
 *   node --env-file=.env scripts/backfill-executive-changes.js --apply  # aplica los cambios
 */

import path from 'node:path';
import { pool } from '../db/pool.js';
import { updateAnalysis } from '../db/repositories/analysisRepository.js';
import { isStaleExecutiveChange } from '../src/agents/analyst/financialParsersExtract.js';
import { renumberConclusionSections } from '../src/agents/analyst/annualConclusionSections.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';

const apply = process.argv.includes('--apply');

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function blockChanges(block) {
  if (!block) return [];
  if (Array.isArray(block)) return block;
  if (Array.isArray(block.changes)) return block.changes;
  return (block.role || block.text || block.newExecutive || block.oldExecutive) ? [block] : [];
}

const { rows } = await pool.query(
  `SELECT id, ticker, period_end, language, pdf_url, report
     FROM analyses
    WHERE status = 'done' AND report IS NOT NULL
      AND (report->'conclusion' ? 'executiveChanges' OR report->'conclusion' ? 'ceoChange')
    ORDER BY created_at DESC`,
);

let patched = 0;
let skipped = 0;

for (const row of rows) {
  const conclusion = row.report?.conclusion;
  if (!conclusion) continue;
  const periodEnd = toIsoDate(row.period_end);
  const fiscalYear = periodEnd ? Number(periodEnd.slice(0, 4)) : null;
  let changed = false;

  for (const key of ['executiveChanges', 'ceoChange']) {
    const changes = blockChanges(conclusion[key]);
    if (!changes.length) continue;
    const recent = changes.filter((change) => !isStaleExecutiveChange(change, fiscalYear));
    if (recent.length === changes.length) continue;
    changed = true;
    if (recent.length) {
      console.log(`[fix ] id=${row.id} ${row.ticker} ${periodEnd} — ${key}: quedan ${recent.length} de ${changes.length} cambios`);
      if (Array.isArray(conclusion[key]) || Array.isArray(conclusion[key]?.changes)) {
        if (Array.isArray(conclusion[key])) conclusion[key] = recent;
        else conclusion[key].changes = recent;
      } else {
        conclusion[key] = recent[0];
      }
    } else {
      console.log(`[fix ] id=${row.id} ${row.ticker} ${periodEnd} — ${key}: eliminados ${changes.length} cambios históricos`);
      delete conclusion[key];
    }
  }

  if (!changed) {
    skipped += 1;
    continue;
  }

  renumberConclusionSections(conclusion, row.language || 'es');
  if (apply) {
    await updateAnalysis(row.id, { report: row.report });
    const baseId = row.pdf_url ? path.basename(String(row.pdf_url), path.extname(String(row.pdf_url))) : null;
    if (baseId) {
      await regenerateAllReportFormats(baseId, row.report);
      console.log('       formatos PDF/HTML/DOCX/ODT regenerados');
    }
  }
  patched += 1;
}

console.log(`\n${apply ? 'Aplicados' : 'Detectados'}: ${patched} · sin cambios: ${skipped}${apply ? '' : ' (dry-run: usa --apply para guardar)'}`);
await pool.end();
