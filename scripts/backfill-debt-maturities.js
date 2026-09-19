/**
 * @fileoverview Backfill determinista del calendario de vencimientos de deuda de análisis
 * anuales ya guardados. Corrige los calendarios construidos a partir de filas de deuda con
 * rangos amplios ("U.S. dollar notes due 2024-2093") que asignaban el agregado al primer año,
 * usando la tabla explícita "maturities of long-term debt" del propio filing.
 *
 * Uso:
 *   node --env-file=.env scripts/backfill-debt-maturities.js            # simulación (dry-run)
 *   node --env-file=.env scripts/backfill-debt-maturities.js --apply    # aplica los cambios
 */

import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { updateAnalysis } from '../db/repositories/analysisRepository.js';
import { FILINGS_DIR } from '../src/services/edgar/filingDocuments.js';
import { extractTextFromPdf } from '../src/services/pdf.service.js';
import { extractDebtFilingText } from '../src/agents/analyst/filingExtractor.js';
import { buildMaturityScheduleFromFilingText, hasWideRangeLabels } from '../src/agents/analyst/debtMaturityFallback.js';

const apply = process.argv.includes('--apply');

// Calendarios construidos con filas que no son vencimientos anuales: clasificaciones del balance
// ("Commercial paper borrowings", "Current maturities of long-term debt", "Lines of credit"...).
const NON_MATURITY_LABEL = /commercial paper|current maturities|lines of credit|net of current|short-term borrowings|long-term debt, (?:excluding|net)/i;

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function findFilingPdf(filename, accession) {
  const digits = String(accession || filename || '').replace(/\D/g, '');
  if (!digits) return null;
  let names = [];
  try {
    names = fs.readdirSync(FILINGS_DIR);
  } catch {
    return null;
  }
  const name = names.find((candidate) => candidate.endsWith(`-${digits}.pdf`));
  return name ? path.join(FILINGS_DIR, name) : null;
}

const { rows } = await pool.query(
  `SELECT id, ticker, filename, accession, period_end, language, report
     FROM analyses
    WHERE status = 'done' AND report IS NOT NULL
    ORDER BY created_at DESC`,
);

let patched = 0;
let skipped = 0;

for (const row of rows) {
  const report = row.report;
  const debt = report?.conclusion?.debt;
  const schedule = Array.isArray(debt?.maturitySchedule) ? debt.maturitySchedule : [];
  const needsFix = hasWideRangeLabels(schedule)
    || schedule.some((item) => NON_MATURITY_LABEL.test(String(item?.label ?? item?.name ?? item?.type ?? '')));
  if (!schedule.length || !needsFix) continue;

  const periodEnd = toIsoDate(row.period_end);
  const fiscalYear = periodEnd ? Number(periodEnd.slice(0, 4)) : null;
  const pdfPath = findFilingPdf(row.filename, row.accession);
  if (!fiscalYear || !pdfPath) {
    skipped += 1;
    console.log(`[skip] id=${row.id} ${row.ticker} ${row.filename} (sin PDF o sin fecha)`);
    continue;
  }

  try {
    const text = await extractTextFromPdf(fs.readFileSync(pdfPath));
    const debtText = extractDebtFilingText(text);
    const authoritative = buildMaturityScheduleFromFilingText(debtText, fiscalYear, periodEnd);
    if (!authoritative?.authoritative || !authoritative.items?.length) {
      skipped += 1;
      console.log(`[skip] id=${row.id} ${row.ticker} ${row.filename} (sin tabla año a año)`);
      continue;
    }

    const before = schedule.map((item) => `${item.year}:${item.amount}`).join(' ');
    const after = authoritative.items.map((item) => `${item.year}:${item.amount}`).join(' ');
    console.log(`[fix ] id=${row.id} ${row.ticker} ${row.filename} [${row.language}]`);
    console.log(`       antes: ${before}`);
    console.log(`       ahora: ${after}`);

    debt.maturitySchedule = authoritative.items;
    if (authoritative.afterYearFive != null) debt.maturityAfterFive = authoritative.afterYearFive;
    if (apply) await updateAnalysis(row.id, { report });
    patched += 1;
  } catch (error) {
    skipped += 1;
    console.log(`[skip] id=${row.id} ${row.ticker} ${row.filename} (${error.message})`);
  }
}

console.log(`\n${apply ? 'Aplicados' : 'Detectados'}: ${patched} · omitidos: ${skipped}${apply ? '' : ' (dry-run: usa --apply para guardar)'}`);
await pool.end();
