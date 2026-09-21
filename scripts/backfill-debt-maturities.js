/**
 * @fileoverview Backfill determinista del calendario de vencimientos de deuda de análisis
 * anuales ya guardados. Corrige:
 *  1) calendarios construidos a partir de filas de deuda con rangos amplios ("U.S. dollar notes
 *     due 2024-2093") que asignaban el agregado al primer año, usando la tabla explícita
 *     "maturities of long-term debt" del propio filing;
 *  2) calendarios parciales inferidos de la porción corriente de deuda del XBRL
 *     ("Vencimientos contractuales de deuda") de un ejercicio anterior que ya se amortizó
 *     (caso Adobe FY2025), reconstruyéndolos desde la nota de deuda del PDF;
 *  3) calendarios que son clasificaciones del balance ("Short-term borrowings and current portion
 *     of long-term obligations"), sustituyéndolos por los vencimientos año a año de la nota.
 * Si el texto del análisis afirmaba que el 10-K no desglosa los vencimientos, se sustituye por
 * la descripción determinista del calendario.
 *
 * Uso:
 *   node --env-file=.env scripts/backfill-debt-maturities.js            # simulación (dry-run)
 *   node --env-file=.env scripts/backfill-debt-maturities.js --apply    # aplica los cambios
 *   node --env-file=.env scripts/backfill-debt-maturities.js --apply --ids=778,780  # análisis concretos
 */

import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { updateAnalysis } from '../db/repositories/analysisRepository.js';
import { FILINGS_DIR } from '../src/services/edgar/filingDocuments.js';
import { extractTextFromPdf } from '../src/services/pdf.service.js';
import { extractDebtFilingText } from '../src/agents/analyst/filingExtractor.js';
import { buildMaturityScheduleFromFilingText, hasWideRangeLabels, sumMaturityAmounts } from '../src/agents/analyst/debtMaturityFallback.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { formatNumber } from '../src/utils/i18n.js';

const apply = process.argv.includes('--apply');
// Filtro opcional de análisis concretos: --ids=778,780 (omite el criterio de calendario sospechoso).
const onlyIds = (process.argv.find((arg) => arg.startsWith('--ids=')) ?? '')
  .slice('--ids='.length)
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

// Calendarios construidos con filas que no son vencimientos anuales: clasificaciones del balance
// ("Commercial paper borrowings", "Current maturities of long-term debt", "Lines of credit"...).
const NON_MATURITY_LABEL = /commercial paper|current maturities|lines of credit|net of current|short-term borrowings|long-term debt, (?:excluding|net)/i;
// Calendario parcial del XBRL (porción corriente) con etiqueta genérica sin desglose por emisión.
const EDGAR_PARTIAL_LABEL = /^(?:Vencimientos contractuales de deuda|Contractual debt maturities)$/i;
const NO_BREAKDOWN_CLAIM = /no desglosa|no detalla|no presenta|no incluye|no es posible construir|no aporta el desglose|no se dispone de informaci[oó]n suficiente|does not break|does not provide|does not disclose|does not detail|insufficient information|no maturity schedule/i;
const MATURITY_WORD = /vencim|calendario|maturity|schedule|deuda total|total debt/i;
const CALENDAR_SENTENCE = /calendario de vencimientos|maturity schedule/i;

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

function lastDebtTotal(report) {
  const history = report?.conclusion?.debt?.debtHistory;
  if (!Array.isArray(history)) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const total = Number(history[index]?.totalDebt);
    if (Number.isFinite(total) && total > 0) return total;
  }
  return null;
}

function formatAmount(amount, language) {
  return formatNumber(amount, { maximumFractionDigits: 1, useGrouping: 'always' }, language);
}

/**
 * Compara dos calendarios por año e importe de las partidas dentro de la ventana de 5 años.
 * El tramo posterior al año 5 no decide la sustitución (puede venir de una fuente mejor).
 * @param {Array<object>} a - Primer calendario.
 * @param {Array<object>} b - Segundo calendario.
 * @returns {boolean} true si representan los mismos vencimientos año a año.
 */
function sameSchedule(a, b) {
  const key = (items) => (Array.isArray(items) ? items : [])
    .map((item) => `${Number(item?.year)}:${Number(item?.amount)}`)
    .sort()
    .join('|');
  return key(a) === key(b);
}

/**
 * Construye la frase determinista que describe el calendario reconstruido.
 * @param {Array<object>} items - Partidas del calendario dentro de la ventana de 5 años.
 * @param {number|null} afterYearFive - Importe posterior al año 5.
 * @param {string} language - Idioma del análisis ('es' | 'en').
 * @returns {string} Frase lista para insertar en el texto del bloque de deuda.
 */
function describeSchedule(items, afterYearFive, language) {
  const byYear = new Map();
  items.forEach((item) => {
    const year = Number(item?.year);
    const amount = Number(item?.amount);
    if (!Number.isFinite(year) || !Number.isFinite(amount) || amount <= 0) return;
    byYear.set(year, (byYear.get(year) ?? 0) + amount);
  });
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (!years.length) return '';
  const en = language === 'en';
  const parts = years.map((year, index) => {
    const label = `${en ? '$' : ''}${formatAmount(byYear.get(year), language)}${en ? 'M' : 'M$'}`;
    const yearText = `**${year}**`;
    const separator = index === 0 ? '' : (index === years.length - 1 ? (en ? ' and ' : ' y ') : ', ');
    return `${separator}${label} ${en ? 'in' : 'en'} ${yearText}`;
  });
  const after = Number(afterYearFive);
  const afterText = Number.isFinite(after) && after > 0
    ? (en
      ? `, with **$${formatAmount(after, language)}M** from **${years[years.length - 1] + 1}** onward`
      : `, con **${formatAmount(after, language)}M$** a partir de **${years[years.length - 1] + 1}**`)
    : '';
  return en
    ? `The 10-K breaks the maturity calendar down by year: ${parts.join('')}${afterText}.`
    : `El 10-K desglosa el calendario de vencimientos por año: ${parts.join('')}${afterText}.`;
}

/**
 * Elimina del texto las frases que niegan el desglose de vencimientos (o que describen como
 * futuros vencimientos ya amortizados) y añade la descripción real del calendario reconstruido.
 * @param {string} text - Texto del bloque de deuda.
 * @param {Array<object>} items - Partidas del calendario reconstruido.
 * @param {number|null} afterYearFive - Importe posterior al año 5.
 * @param {string} language - Idioma del análisis ('es' | 'en').
 * @param {Array<object>} oldSchedule - Calendario anterior (para detectar frases obsoletas).
 * @returns {string} Texto corregido.
 */
function fixFalseCalendarClaim(text, items, afterYearFive, language, oldSchedule = []) {
  const source = String(text ?? '').trim();
  if (!source) return source;
  const newMinYear = items.reduce((min, item) => {
    const year = Number(item?.year);
    return Number.isFinite(year) && year < min ? year : min;
  }, Infinity);
  const staleEntries = oldSchedule.filter((item) => {
    const year = Number(item?.year);
    return Number.isFinite(year) && year < newMinYear && Number(item?.amount) > 0;
  });
  const sentences = source.split(/(?<=\.)\s+/);
  const cleaned = sentences.filter((sentence) => {
    if (NO_BREAKDOWN_CLAIM.test(sentence) && MATURITY_WORD.test(sentence)) return false;
    if (CALENDAR_SENTENCE.test(sentence)) return false;
    // Frase que presenta como futuro un vencimiento de un ejercicio ya cerrado según el calendario nuevo.
    const mentionsStaleYear = staleEntries.some((item) => sentence.includes(String(Number(item.year))));
    const mentionsStaleAmount = staleEntries.some((item) => {
      const amount = Number(item.amount);
      return sentence.includes(formatAmount(amount, language)) || sentence.includes(String(amount));
    });
    return !(mentionsStaleYear && mentionsStaleAmount);
  });
  if (cleaned.length === sentences.length) return source;
  const description = describeSchedule(items, afterYearFive, language);
  if (!description) return cleaned.join(' ');
  return `${cleaned.join(' ')} ${description}`.trim();
}

const { rows } = await pool.query(
  `SELECT id, ticker, filename, accession, period_end, language, pdf_url, report
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
  const totalDebt = lastDebtTotal(report);
  const nonMaturityLabel = schedule.some((item) => NON_MATURITY_LABEL.test(String(item?.label ?? item?.name ?? item?.type ?? '')));
  const staleEdgarPartial = schedule.length > 0
    && schedule.every((item) => EDGAR_PARTIAL_LABEL.test(String(item?.label ?? item?.name ?? '')));
  const needsFix = hasWideRangeLabels(schedule) || nonMaturityLabel || staleEdgarPartial;
  const forced = onlyIds.includes(Number(row.id));
  if (!schedule.length || (!needsFix && !forced)) continue;
  if (onlyIds.length && !forced) continue;

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
    const candidateCoverage = authoritative?.items?.length
      ? sumMaturityAmounts(authoritative.items) + (Number(authoritative.afterYearFive) || 0)
      : 0;
    const coversDebt = !Number.isFinite(totalDebt) || candidateCoverage >= totalDebt * 0.6;
    // Criterios de sustitución:
    //  - la tabla explícita año a año ("maturities of long-term debt") siempre manda;
    //  - el calendario parcial del XBRL de un ejercicio anterior se reemplaza si la nota cubre la deuda;
    //  - una clasificación del balance ("Short-term borrowings...") se sustituye por los vencimientos
    //    año a año de la nota, siempre que no traiga rangos amplios (evita asignar agregados al primer año).
    let replacement = authoritative?.authoritative === true ? authoritative : null;
    if (!replacement?.items?.length && coversDebt
      && (staleEdgarPartial || nonMaturityLabel || forced)
      && !hasWideRangeLabels(authoritative?.items)) {
      replacement = authoritative;
    }
    if (!replacement?.items?.length) {
      skipped += 1;
      console.log(`[skip] id=${row.id} ${row.ticker} ${row.filename} (sin calendario fiable)`);
      continue;
    }
    // Si el calendario reconstruido es el mismo que ya está guardado, no hay nada que corregir.
    if (sameSchedule(schedule, replacement.items)) {
      continue;
    }

    const before = schedule.map((item) => `${item.year}:${item.amount}`).join(' ');
    const after = replacement.items.map((item) => `${item.year}:${item.amount}`).join(' ');
    console.log(`[fix ] id=${row.id} ${row.ticker} ${row.filename} [${row.language}]`);
    console.log(`       antes: ${before}`);
    console.log(`       ahora: ${after}`);

    debt.maturitySchedule = replacement.items;
    if (replacement.afterYearFive != null) debt.maturityAfterFive = replacement.afterYearFive;
    if (replacement.weightedAverageRate?.rate != null
      && (debt.allDebtAverageRate == null || debt.allDebtAverageRateEstimated === true)) {
      debt.allDebtAverageRate = replacement.weightedAverageRate.rate;
      debt.allDebtAverageRateEstimated = true;
      debt.allDebtAverageRateSource = 'cupones de la nota ponderados por saldo';
    }
    const fixedText = fixFalseCalendarClaim(debt.text, replacement.items, replacement.afterYearFive, row.language, schedule);
    if (fixedText !== debt.text) {
      debt.text = fixedText;
      console.log('       texto: corregidas las frases obsoletas sobre el calendario de vencimientos');
      if (!apply) console.log(`       texto nuevo: ${fixedText.slice(0, 260)}${fixedText.length > 260 ? '…' : ''}`);
    }

    if (apply) {
      await updateAnalysis(row.id, { report });
      const baseId = row.pdf_url ? path.basename(String(row.pdf_url), path.extname(String(row.pdf_url))) : null;
      if (baseId) {
        await regenerateAllReportFormats(baseId, report);
        console.log('       formatos PDF/HTML/DOCX/ODT regenerados');
      }
    }
    patched += 1;
  } catch (error) {
    skipped += 1;
    console.log(`[skip] id=${row.id} ${row.ticker} ${row.filename} (${error.message})`);
  }
}

console.log(`\n${apply ? 'Aplicados' : 'Detectados'}: ${patched} · omitidos: ${skipped}${apply ? '' : ' (dry-run: usa --apply para guardar)'}`);
await pool.end();
