#!/usr/bin/env node
/**
 * Repara las notas del capital circulante (WK) que quedaron en español dentro de
 * informes generados en otro idioma. La nota es determinista, así que se regenera
 * con la plantilla del idioma del informe sin tocar ninguna cifra.
 *
 * Uso: node --env-file=.env scripts/repair-wk-notes.js [--dry]
 */

import { query } from '../db/pool.js';
import { updateAnalysis } from '../db/repositories/analysisRepository.js';
import { t, normalizeLanguage } from '../src/utils/i18n.js';

const DRY_RUN = process.argv.includes('--dry');

const WK_TEMPLATES = [
  {
    regex: /^WK = \(Cuentas por pagar - Inventarios - Cuentas por cobrar\) × \(inflación \+ volumen\) = \((-?[\d.,]+) - (-?[\d.,]+) - (-?[\d.,]+)\) × \((-?[\d.,]+)% \+ (-?[\d.,]+)%\) = (-?[\d.,]+)M en todo el año -> en (\d+) meses = (-?[\d.,]+)M\./,
    key: 'WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = ({pay} - {inv} - {rec}) × ({inflation}% + {volume}%) = {annual}M en todo el año -> en {months} meses = {ytd}M. {deviation}',
  },
  {
    regex: /^WK = \(Cuentas por pagar - Inventarios - Cuentas por cobrar\) × \(inflación \+ volumen\) = \((-?[\d.,]+) - (-?[\d.,]+) - (-?[\d.,]+)\) × \((-?[\d.,]+)% \+ (-?[\d.,]+)%\) = (-?[\d.,]+)M en todo el año -> en 3 meses = (-?[\d.,]+)M\./,
    key: 'WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = ({pay} - {inv} - {rec}) × ({inflation}% + {volume}%) = {annual}M en todo el año -> en 3 meses = {quarter}M. {deviation}',
  },
];

function repairWkNote(note, language) {
  const marker = String(note).match(/^\*(\d+):\s*([\s\S]*)$/);
  if (!marker) return null;
  const [, number, body] = marker;
  for (const template of WK_TEMPLATES) {
    const match = body.match(template.regex);
    if (!match) continue;
    const params = {
      pay: match[1],
      inv: match[2],
      rec: match[3],
      inflation: match[4],
      volume: match[5],
      annual: match[6],
      deviation: '',
    };
    if (template.key.includes('{months}')) {
      params.months = match[7];
      params.ytd = match[8];
    } else {
      params.quarter = match[7];
    }
    const prefix = t(template.key, params, language).trimEnd();
    const suffix = body.slice(match[0].length);
    return `*${number}: ${prefix}${suffix}`;
  }
  return null;
}

function repairReport(report, language) {
  let repaired = 0;
  for (const horizon of Array.isArray(report?.horizons) ? report.horizons : []) {
    const notes = horizon?.cashFlow?.notes;
    if (!Array.isArray(notes)) continue;
    horizon.cashFlow.notes = notes.map((note) => {
      const fixed = typeof note === 'string' ? repairWkNote(note, language) : null;
      if (fixed) repaired += 1;
      return fixed ?? note;
    });
  }
  return repaired;
}

const { rows } = await query(
  `SELECT id, ticker, language, report
   FROM analyses
   WHERE status = 'done' AND report IS NOT NULL
     AND report::text LIKE '%WK = (Cuentas por pagar%'`,
);

let touched = 0;
for (const row of rows) {
  const language = normalizeLanguage(row.report?.language ?? row.language);
  if (language === 'es') continue;
  const repaired = repairReport(row.report, language);
  if (!repaired) continue;
  touched += repaired;
  if (DRY_RUN) {
    console.log(`[dry] análisis ${row.id} (${row.ticker}, ${language}): ${repaired} nota(s)`);
    continue;
  }
  await updateAnalysis(row.id, { report: row.report });
  console.log(`análisis ${row.id} (${row.ticker}, ${language}): ${repaired} nota(s) reparada(s)`);
}

console.log(`${DRY_RUN ? 'Se repararían' : 'Reparadas'} ${touched} notas en ${rows.length} informe(s) candidato(s).`);
process.exit(0);
