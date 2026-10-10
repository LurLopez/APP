/**
 * Corrección puntual de los análisis 852 (MU 10-K FY2026, ES) y 853 (EN):
 * mejora del bloque 3 «Asignación de capital»:
 *  1) Se retira la fila Adquisiciones (-1800M): la compra de la fábrica de Tongluo va dentro
 *     de CAPEX (no hay línea de adquisición de negocios en el estado de flujos) y duplicaba el uso.
 *  2) «En total» pasa de -15100M a -13300M y la nota de deuda pasa a *1 (ya no hay nota *1 de adquisiciones).
 *  3) La nota *1 incorpora la variación de inversiones (corto y largo plazo).
 *  4) La verificación explica el descuadre con las partidas reales del filing
 *     (depósitos de clientes +12747, incentivos +3316, no cotizadas -1046, retenciones -1127,
 *     otras inversión -316, otras financiación +313, divisa +81, restringido -23 y la diferencia
 *     deuda balance vs efectivo amortizado -645), y cita que Tongluo ya está en el CAPEX.
 *
 * Uso: node --env-file=.env scratch/patch-capital-852-853.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const NOTE_852 =
  '*1: Deuda balance: 14577M -> 5179M (-9398M). Deuda neta: 4270M -> -38255M (-42525M). Caja balance: '
  + '9642M -> 38364M (+28722M); la caja aumentó: uso de capital (-); fila Caja = -28722M. Inversiones: la fila '
  + 'recoge las compras netas de valores disponibles para la venta (32883M); el saldo a corto plazo pasó de 665M '
  + 'a 5070M y el de largo plazo de 1629M a 30019M.';

const VERIF_852 =
  'No cuadra: quedan -13300M sin explicar entre el capital libre y los usos detectados. La diferencia se cierra '
  + 'con partidas del estado de flujos y de las notas que no figuran en la tabla: depósitos de clientes de acuerdos '
  + 'estratégicos +12747M (a devolver entre 2029 y 2031), incentivos públicos +3316M, compras de participaciones no '
  + 'cotizadas -1046M, retenciones de acciones a empleados -1127M, otras partidas de inversión -316M, otras de '
  + 'financiación +313M, efecto divisa positivo sobre la caja +81M y aumento del efectivo restringido -23M. Además, '
  + 'la fila Deuda usa la variación de balance (-9398M) mientras la amortización en efectivo fue -10043M (645M de '
  + 'diferencia, en parte por arrendamientos financieros no monetarios). La compra de la fábrica de Tongluo (1800M, '
  + 'marzo de 2026) ya está incluida en el CAPEX, por lo que no se añade como uso para no duplicarla. Con todo, el '
  + 'descuadre queda cerrado (≈0M).';

const NOTE_853 =
  '*1: Balance sheet debt: 14577M -> 5179M (-9398M). Net debt: 4270M -> -38255M (-42525M). Balance sheet cash: '
  + '9642M -> 38364M (+28722M); cash increased: use of capital (-); Cash row = -28722M. Investments: the row '
  + 'reflects net purchases of available-for-sale securities (32883M); the short-term balance went from 665M to '
  + '5070M and the long-term balance from 1629M to 30019M.';

const VERIF_853 =
  'Does not reconcile: -13300M remains unexplained between free capital and the detected uses. The gap is closed by '
  + 'items from the cash flow statement and the notes that are not in the table: customer deposits from strategic '
  + 'agreements +12747M (to be repaid between 2029 and 2031), government incentives +3316M, purchases of '
  + 'non-marketable equity securities -1046M, repurchases of stock for employee tax withholdings -1127M, other '
  + 'investing items -316M, other financing +313M, positive FX effect on cash +81M and an increase in restricted '
  + 'cash -23M. In addition, the Debt row uses the balance-sheet change (-9398M) while cash repayments were -10043M '
  + '(645M difference, partly non-cash finance leases). The purchase of the Tongluo fab (1800M, March 2026) is '
  + 'already included in CAPEX, so it is not added as a use to avoid double counting. All in all, the discrepancy '
  + 'is closed (≈0M).';

const PATCHES = [
  {
    id: 852,
    acqPrefix: 'Adquisiciones',
    totalName: 'En total',
    oldNotePrefix: '*2: Deuda balance:',
    newNote: NOTE_852,
    verification: VERIF_852,
  },
  {
    id: 853,
    acqPrefix: 'Acquisitions',
    totalName: 'Total',
    oldNotePrefix: '*2: Balance sheet debt:',
    newNote: NOTE_853,
    verification: VERIF_853,
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
  if (!Array.isArray(capital?.rows)) throw new Error(`Análisis ${patch.id}: no hay capital.rows`);

  const acqIndex = capital.rows.findIndex((r) => String(r.name).startsWith(patch.acqPrefix));
  const total = capital.rows.find((r) => r.name === patch.totalName);

  const alreadyApplied = acqIndex === -1 && total?.value === '-13300' && capital.verification === patch.verification;
  if (alreadyApplied) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }

  if (acqIndex === -1) throw new Error(`Análisis ${patch.id}: no se encontró la fila ${patch.acqPrefix}`);
  if (!total) throw new Error(`Análisis ${patch.id}: no se encontró la fila ${patch.totalName}`);
  if (String(capital.rows[acqIndex].value) !== '-1800') {
    throw new Error(`Análisis ${patch.id}: la fila ${patch.acqPrefix} no vale -1800 (${capital.rows[acqIndex].value})`);
  }
  if (String(total.value) !== '-15100') {
    throw new Error(`Análisis ${patch.id}: ${patch.totalName} no vale -15100 (${total.value})`);
  }
  const notes = capital.notes ?? [];
  if (!String(notes[1] ?? '').startsWith(patch.oldNotePrefix)) {
    throw new Error(`Análisis ${patch.id}: la nota de deuda no empieza como se esperaba: ${String(notes[1]).slice(0, 80)}`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log('rows:', capital.rows.map((r) => `${r.name}=${r.value}`).join(' | '));
  console.log('verificación:', capital.verification.slice(0, 140), '…');

  // 1) Retirar la fila de adquisiciones (ya está dentro del CAPEX: duplicaba el uso).
  capital.rows.splice(acqIndex, 1);
  // 2) Cuadre de la tabla: -15100 + 1800 = -13300.
  total.value = '-13300';
  // 3) Renumerar la nota de deuda/caja/inversiones como *1 y renombrar los enlaces de las filas.
  capital.rows.forEach((r) => {
    if (String(r.name).includes('*2')) r.name = String(r.name).replace('*2', '*1');
  });
  capital.notes = [patch.newNote];
  // 4) Verificación con el desglose real.
  capital.verification = patch.verification;

  console.log(`=== ${patch.id} DESPUÉS ===`);
  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  console.log('rows:', capital.rows.map((r) => `${r.name}=${r.value}`).join(' | '));
  console.log('nota:', capital.notes[0]);
  console.log('verificación:', capital.verification);
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
