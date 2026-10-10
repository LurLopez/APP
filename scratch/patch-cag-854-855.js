/**
 * Corrección puntual de los análisis 854 (CAG 2027-Q1, ES) y 855 (EN):
 *  1) Beneficio Neto Ajustado del trimestre: 187,6M -> 185,1M. El impuesto reportado (58,6M)
 *     está dentro del ±20 % del 23 % del EBT ajustado (56,05M; desviación +4,5 %), así que NO
 *     procede normalizar: Beneficio Neto Ajustado = EBT ajustado (243,7M) - impuesto (58,6M) = 185,1M.
 *     Se recalcula su % Ajustado: (185,1 - 222,61) / 222,61 = -16,85 %.
 *  2) Nota fiscal *2 huérfana: la fila de Beneficio Neto referencia *2 pero el auditor la borró.
 *     Se restaura la explicación de la normalización del PERIODO COMPARABLE (EBT 289,1M, tipo 43,1 %,
 *     desviación +87,39 %, Beneficio Neto Anterior Ajustado = 289,1M x 0,77 = 222,61M), que es la
 *     casilla resaltada ("adjustedCell": "previous").
 *  3) Se restaura el bloque de guidance (borrado por el auditor) con el outlook reafirmado del 8-K
 *     y la tabla comparativa frente al guidance anterior del 15/07/2026.
 *
 * Uso: node --env-file=.env scratch/patch-cag-854-855.js
 */
import path from 'node:path';
import { getAnalysisById, updateAnalysis } from '../db/repositories/analysisRepository.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';

const TAX_NOTE = {
  es: '*2: Impuestos: En el periodo comparable, el gasto fiscal reportado fue 124,6M sobre un EBT de 289,1M '
    + '(tipo efectivo del 43,1 %). La desviación de su tipo efectivo frente al 23 % de referencia es del +87,39 %, '
    + 'fuera del umbral de ±20 %, por lo que se normaliza el gasto al 23 % del EBT ajustado (289,1M): '
    + 'Beneficio Neto Anterior Ajustado = EBT Ajustado × 0,77 = 222,61M.',
  en: '*2: Taxes: In the comparable period, reported tax expense was 124.6M on an EBT of 289.1M '
    + '(effective rate 43.1%). The deviation of its effective rate from the 23 % reference is +87.39 %, '
    + 'outside the ±20 % band, so the tax expense is normalized to 23 % of adjusted EBT (289.1M): '
    + 'Prior-Year Adjusted Net Income = Adjusted EBT × 0.77 = 222.61M.',
};

const GUIDANCE = {
  es: {
    status: 'reaffirmed',
    text: 'La compañía reafirma su guidance para el ejercicio fiscal 2027: variación de ventas netas orgánicas de (3)% a (1)% '
      + 'frente al ejercicio 2026, margen operativo ajustado entre 10,0% y 10,5% y BPA ajustado entre 1,40$ y 1,50$. '
      + 'Las hipótesis clave se mantienen sin cambios: contribución de equity earnings de ~140M$, ingreso de pensiones de ~25M$, '
      + 'gasto por intereses de ~360M$, tasa fiscal efectiva ajustada de ~24%, CAPEX de ~550M$, conversión de flujo de caja '
      + 'libre superior al 90% y ratio de apalancamiento neto de ~4,0x al cierre del ejercicio.',
    secSnippet: {
      title: 'Guidance oficial del trimestre',
      summary: 'Tabla de previsiones publicada por la compañía',
      headers: ['Métrica', 'Guidance anterior', 'Guidance actual'],
      rows: [
        ['Variación de ventas netas orgánicas (vs. FY26)', '(3)% a (1)%', '(3)% a (1)%'],
        ['Margen operativo ajustado', '10,0% a 10,5%', '10,0% a 10,5%'],
        ['BPA ajustado', '1,40$ a 1,50$', '1,40$ a 1,50$'],
      ],
    },
  },
  en: {
    status: 'reaffirmed',
    text: 'The company reaffirms its fiscal 2027 guidance: organic net sales change of (3)% to (1)% versus fiscal 2026, '
      + 'adjusted operating margin between 10.0% and 10.5%, and adjusted EPS between $1.40 and $1.50. Key assumptions '
      + 'remain unchanged: equity earnings contribution of approximately $140M, pension income of approximately $25M, '
      + 'interest expense of approximately $360M, adjusted effective tax rate of approximately 24%, capital expenditures '
      + 'of approximately $550M, free cash flow conversion above 90%, and a net leverage ratio of approximately 4.0x at fiscal year end.',
    secSnippet: {
      title: 'Official quarterly guidance',
      summary: 'Forecast table published by the company',
      headers: ['Metric', 'Previous guidance', 'Current guidance'],
      rows: [
        ['Organic net sales change (vs. FY26)', '(3)% to (1)%', '(3)% to (1)%'],
        ['Adjusted operating margin', '10.0% to 10.5%', '10.0% to 10.5%'],
        ['Adjusted EPS', '$1.40 to $1.50', '$1.40 to $1.50'],
      ],
    },
  },
};

const PATCHES = [
  { id: 854, lang: 'es', netName: 'Beneficio Neto', oldAdj: '187,6M', newAdj: '185,1M', oldPct: '-15,73 %', newPct: '-16,85 %' },
  { id: 855, lang: 'en', netName: 'Net Income', oldAdj: '187.6M', newAdj: '185.1M', oldPct: '-15.73 %', newPct: '-16.85 %' },
];

function failCount(report) {
  const res = runDeterministicChecks(report);
  return { counts: res.counts, fails: res.findings.filter((f) => f.level === 'fail') };
}

for (const patch of PATCHES) {
  const row = await getAnalysisById(patch.id);
  if (!row || !row.report) throw new Error(`No se encontró el análisis ${patch.id} con report`);

  const report = structuredClone(row.report);
  const sales = report.horizons?.[0]?.sales;
  if (!Array.isArray(sales?.rows)) throw new Error(`Análisis ${patch.id}: no hay sales.rows`);

  const net = sales.rows.find((r) => r.name === patch.netName);
  if (!net) throw new Error(`Análisis ${patch.id}: no se encontró la fila ${patch.netName}`);

  const alreadyApplied = net.adjusted === patch.newAdj
    && net.pctAdjusted === patch.newPct
    && Array.isArray(sales.notes) && sales.notes.some((n) => String(n).startsWith('*2:'))
    && Boolean(report.quarterNotes?.guidance);
  if (alreadyApplied) {
    console.log(`\n=== ${patch.id}: ya estaba aplicado, nada que hacer ===`);
    continue;
  }

  if (net.adjusted !== patch.oldAdj) {
    throw new Error(`Análisis ${patch.id}: Beneficio Neto Ajustado no vale ${patch.oldAdj} (${net.adjusted})`);
  }
  if (net.pctAdjusted !== patch.oldPct) {
    throw new Error(`Análisis ${patch.id}: % Ajustado no vale ${patch.oldPct} (${net.pctAdjusted})`);
  }

  const before = failCount(report);
  console.log(`\n=== ${patch.id} (${row.language}) ANTES ===`);
  console.log('checks:', JSON.stringify(before.counts));
  console.log(`${net.name}: ajustado=${net.adjusted} | %=${net.pctAdjusted} | adjustedCell=${net.adjustedCell} | nota=${net.adjustedNote}`);
  console.log('notas ventas:', (sales.notes ?? []).map((n) => String(n).slice(0, 60)).join(' || '));
  console.log('guidance:', report.quarterNotes?.guidance ? 'sí' : 'NO');

  // 1) Impuesto dentro del ±20 %: no procede normalizar el trimestre actual.
  net.adjusted = patch.newAdj;
  net.pctAdjusted = patch.newPct;

  // 2) Restaurar la nota fiscal *2 (normalización del comparativo).
  sales.notes = Array.isArray(sales.notes) ? sales.notes : [];
  if (!sales.notes.some((n) => String(n).startsWith('*2:'))) sales.notes.push(TAX_NOTE[patch.lang]);
  sales.notes.sort((a, b) => Number(String(a).match(/^\*(\d+)/)?.[1] ?? Infinity) - Number(String(b).match(/^\*(\d+)/)?.[1] ?? Infinity));

  // 3) Restaurar el bloque de guidance del 8-K (outlook reafirmado).
  report.quarterNotes = report.quarterNotes ?? {};
  if (!report.quarterNotes.guidance) report.quarterNotes.guidance = GUIDANCE[patch.lang];

  console.log(`=== ${patch.id} DESPUÉS ===`);
  console.log(`${net.name}: ajustado=${net.adjusted} | %=${net.pctAdjusted} | adjustedCell=${net.adjustedCell} | nota=${net.adjustedNote}`);
  console.log('nota *2:', String(sales.notes.find((n) => String(n).startsWith('*2:'))));
  console.log('guidance:', JSON.stringify(report.quarterNotes.guidance.secSnippet.rows));

  const after = failCount(report);
  console.log('checks:', JSON.stringify(after.counts));
  const beforeFails = new Set(before.fails.map((f) => `${f.check}|${f.horizon ?? ''}`));
  const newFails = after.fails.filter((f) => !beforeFails.has(`${f.check}|${f.horizon ?? ''}`));
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
