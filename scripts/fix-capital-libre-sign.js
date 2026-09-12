#!/usr/bin/env node

/**
 * Reparación de informes ya guardados: la fila "Libre" de la tabla de
 * Asignación de Capital debe conservar el signo del "Libre" del Cash Flow.
 * Un bug hacía `replace('-', '')`, de modo que -223 se guardaba como 223 y el
 * total (y la verificación) no cuadraban. Este script corrige el valor, recalcula
 * "En total" y actualiza la verificación. Es idempotente.
 *
 * Uso:
 *   node --env-file=.env scripts/fix-capital-libre-sign.js
 */

import { pool } from '../db/pool.js';
import { updateAnalysis } from '../db/repositories/analysisRepository.js';

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const clean = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
}

function isLibre(name) {
  return /libre/i.test(String(name ?? ''));
}

function isTotal(name) {
  return /total/i.test(String(name ?? ''));
}

function verifyText(total) {
  return Math.abs(total) <= 50
    ? 'Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.'
    : 'No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo.';
}

const { rows } = await pool.query(
  `SELECT id, report FROM analyses WHERE status = 'done' AND report IS NOT NULL AND report->'horizons' IS NOT NULL`,
);

let updated = 0;
let horizonsFixed = 0;

for (const row of rows) {
  const report = row.report;
  let changed = false;

  for (const horizon of report.horizons ?? []) {
    const cfLibre = (horizon.cashFlow?.rows ?? []).find((r) => isLibre(r.name));
    const capRows = horizon.capital?.rows;
    if (!cfLibre || !Array.isArray(capRows)) continue;

    const cfValue = Array.isArray(cfLibre.values) && cfLibre.values.length ? cfLibre.values[0] : cfLibre.value;
    const cfNum = parseNumber(cfValue);
    const capLibre = capRows.find((r) => isLibre(r.name));
    if (!capLibre || cfNum === null) continue;

    const capNum = parseNumber(capLibre.value);
    if (capNum === cfNum) continue;

    capLibre.value = String(cfNum).replace('.', ',');
    changed = true;
    horizonsFixed += 1;

    const totalRow = capRows.find((r) => isTotal(r.name));
    let sum = 0;
    let hasValidRows = false;
    for (const r of capRows) {
      if (isTotal(r.name)) continue;
      const num = parseNumber(r.value);
      if (num !== null) {
        sum += num;
        hasValidRows = true;
      }
    }
    if (hasValidRows && totalRow) {
      const rounded = Math.round(sum * 10) / 10;
      totalRow.value = String(rounded).replace('.', ',');
      horizon.capital.verification = verifyText(rounded);
    }
  }

  if (changed) {
    await updateAnalysis(row.id, { report });
    updated += 1;
  }
}

console.log(`Informes revisados: ${rows.length} · horizontes corregidos: ${horizonsFixed} · informes actualizados: ${updated}`);
await pool.end();
