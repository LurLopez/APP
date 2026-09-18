#!/usr/bin/env node
/**
 * @fileoverview Construye el informe markdown de la revisión QA a partir de los
 * análisis generados y las evaluaciones del agente auditor.
 *
 * Uso:
 *   node scripts/qa/build-report.js
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const DIR = getArg('dir', 'documentacion/revisiones/2026-09-18');
const OUT = getArg('out', `${DIR}/informe-cuerpo.md`);

const fmtScore = (score) => String(score ?? '—').replace('.', ',');
const esc = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const severityOrder = { grave: 0, menor: 1, cosmetico: 2, cosmético: 2 };
const normalizeVerdict = (verdict) => {
  const value = String(verdict ?? '').toLowerCase();
  if (value.includes('incorrecto')) return 'incorrecto';
  if (value.includes('reserva')) return 'correcto_con_reservas';
  return value ? 'correcto' : '—';
};
const sortErrors = (errors = []) => [...errors].sort((a, b) => (severityOrder[a.gravedad] ?? 3) - (severityOrder[b.gravedad] ?? 3));

function renderSalesTable(sales) {
  const lines = ['| Concepto | Actual | Anterior | Variación |', '|---|---|---|---|'];
  for (const row of sales?.rows ?? []) {
    const mark = row.isAdjusted ? ` (${row.adjustedNote ?? 'aj.'})` : '';
    const actual = row.isAdjusted ? `${row.normal} → **${row.adjusted}**${mark}` : row.normal;
    const prev = row.prevAdjusted && row.prevAdjusted !== row.prevNormal
      ? `${row.prevNormal} → **${row.prevAdjusted}**`
      : row.prevNormal;
    const pct = row.isAdjusted && row.pctAdjusted && row.pctAdjusted !== row.pctNormal
      ? `${row.pctNormal} → **${row.pctAdjusted}**`
      : row.pctNormal;
    lines.push(`| ${esc(row.name)} | ${esc(actual)} | ${esc(prev)} | ${esc(pct)} |`);
  }
  lines.push(`| BPA | ${esc(sales?.eps)} | | |`);
  lines.push(`| Acciones | ${esc(sales?.shares)} | | |`);
  return lines.join('\n');
}

function renderCashTable(cashFlow) {
  const scenarios = cashFlow?.scenarios ?? ['Normal', 'Ajustado'];
  const lines = [`| Concepto | ${esc(scenarios[0])} | ${esc(scenarios[1])} |`, '|---|---|---|'];
  for (const row of cashFlow?.rows ?? []) {
    lines.push(`| ${esc(row.name)} | ${esc(row.values?.[0])} | ${esc(row.values?.[1])} |`);
  }
  return lines.join('\n');
}

function renderCapitalTable(capital) {
  const lines = ['| Concepto | Importe |', '|---|---|'];
  for (const row of capital?.rows ?? []) {
    lines.push(`| ${esc(row.name)} | ${esc(row.value)} |`);
  }
  return lines.join('\n');
}

function renderHorizon(horizon) {
  const parts = [`#### ${horizon.label}`, ''];
  parts.push('**Ventas y cuenta de resultados**', '', renderSalesTable(horizon.sales), '');
  if (horizon.sales?.notes?.length) parts.push(`_${horizon.sales.notes.map(esc).join(' ')}_`, '');
  parts.push('**Flujo de caja**', '', renderCashTable(horizon.cashFlow), '');
  if (horizon.cashFlow?.notes?.length) parts.push(...horizon.cashFlow.notes.map((note) => `- ${esc(note)}`), '');
  parts.push('**Asignación de capital**', '', renderCapitalTable(horizon.capital), '');
  if (horizon.capital?.verification) parts.push(`> ${esc(horizon.capital.verification)}`, '');
  if (horizon.capital?.notes?.length) parts.push(...horizon.capital.notes.map((note) => `- ${esc(note)}`), '');
  return parts.join('\n');
}

function renderConclusion(report) {
  if (!report?.conclusion && !report?.rating) return '';
  const parts = ['#### Conclusión del 10-K', ''];
  if (report.rating) parts.push(`**${esc(report.rating.label)}** — ${esc(report.rating.rationale)}`, '');
  const conclusion = report.conclusion ?? {};
  for (const [key, value] of Object.entries(conclusion)) {
    if (!value) continue;
    if (typeof value === 'string') parts.push(`- **${key}**: ${esc(value)}`);
    else if (value.title && value.text) parts.push(`- **${esc(value.title)}**: ${esc(value.text).slice(0, 900)}`);
    else if (value.title) parts.push(`- **${esc(value.title)}**`);
    else if (value.items) parts.push(`- **${key}**: ${(value.items ?? []).map(esc).join(' · ')}`);
  }
  parts.push('');
  return parts.join('\n');
}

function renderErrors(errors = []) {
  if (!errors.length) return '_Sin errores reportados por el auditor._';
  const lines = ['| # | Gravedad | Ubicación | Error | Evidencia |', '|---|---|---|---|---|'];
  for (const item of errors) {
    lines.push(`| ${esc(item.id)} | ${esc(item.gravedad)} | ${esc(item.ubicacion)} | ${esc(item.descripcion)} | ${esc(item.evidencia).slice(0, 400)} |`);
  }
  return lines.join('\n');
}

async function main() {
  const files = (await readdir(`${DIR}/evaluaciones`)).filter((name) => name.endsWith('.json') && !name.endsWith('.error.json')).sort();
  const errorsFiles = (await readdir(`${DIR}/analisis`)).filter((name) => name.endsWith('.error.json'));

  const entries = [];
  for (const file of files) {
    const base = file.replace(/\.json$/, '');
    const evaluation = JSON.parse(await readFile(`${DIR}/evaluaciones/${file}`, 'utf8'));
    const analysis = JSON.parse(await readFile(`${DIR}/analisis/${base}.json`, 'utf8'));
    entries.push({ base, evaluation, analysis });
  }
  entries.sort((a, b) => (a.evaluation.audit.score ?? 0) - (b.evaluation.audit.score ?? 0));

  const summary = ['| # | Empresa | Filing | Nota | Veredicto | Errores graves | Errores menores | Cosm. |', '|---|---|---|---|---|---|---|---|'];
  entries.forEach((entry, index) => {
    const audit = entry.evaluation.audit;
    const count = (severity) => (audit.errores ?? []).filter((item) => item.gravedad === severity).length;
    summary.push(`| ${index + 1} | ${entry.analysis.filing.ticker} — ${esc(entry.analysis.filing.name)} | ${entry.analysis.filing.formType} ${esc(entry.analysis.filing.periodLabel)} | **${fmtScore(audit.score)}** | ${esc(normalizeVerdict(audit.veredicto))} | ${count('grave')} | ${count('menor')} | ${count('cosmetico')} |`);
  });
  const average = entries.reduce((acc, entry) => acc + (Number(entry.evaluation.audit.score) || 0), 0) / (entries.length || 1);

  const body = [];
  body.push('## Resumen de notas', '', summary.join('\n'), '', `**Nota media: ${fmtScore(average.toFixed(1))}/10** sobre ${entries.length} análisis evaluados.`, '');

  for (const entry of entries) {
    const { analysis, evaluation } = entry;
    const { filing, report, analysisId, elapsed, origin, sector, subsector } = analysis;
    const audit = evaluation.audit;
    body.push('---', '', `### ${filing.ticker} — ${filing.name} · ${filing.formType} ${filing.periodLabel ?? filing.period}`, '');
    body.push(`- **Cierre**: ${filing.period} · **Presentado**: ${filing.filedAt}`);
    body.push(`- **Análisis**: id ${analysisId} · ${elapsed.toFixed(1)} s · origen ${origin} · sector ${sector}${subsector ? `/${subsector}` : ''}`);
    body.push(`- **Filing oficial**: [SEC EDGAR](${filing.documentUrl})`);
    body.push(`- **Nota del auditor: ${fmtScore(audit.score)}/10** · veredicto: ${normalizeVerdict(audit.veredicto)}`, '');
    body.push(`**Explicación del auditor**: ${esc(audit.resumen)}`, '');
    body.push('#### Qué dice el análisis', '');
    for (const horizon of report.horizons ?? []) body.push(renderHorizon(horizon), '');
    const conclusion = renderConclusion(report);
    if (conclusion) body.push(conclusion);
    body.push('#### Evaluación del auditor', '');
    const blocks = audit.bloques ?? {};
    if (Object.keys(blocks).length) {
      body.push('| Bloque | Valoración |', '|---|---|');
      for (const [key, value] of Object.entries(blocks)) body.push(`| ${esc(key)} | ${esc(value)} |`);
      body.push('');
    }
    body.push('**Errores detectados**', '', renderErrors(sortErrors(audit.errores ?? [])), '');
    if (audit.aciertos?.length) body.push('**Aciertos**', '', ...audit.aciertos.map((item) => `- ${esc(item)}`), '');
    if (audit.dudas?.length) body.push('**Dudas / no verificable**', '', ...audit.dudas.map((item) => `- ${esc(item)}`), '');
    const det = evaluation.deterministic?.findings ?? [];
    if (det.length) {
      body.push('**Comprobaciones deterministas**', '', '| Nivel | Comprobación | Detalle |', '|---|---|---|');
      for (const item of det) body.push(`| ${esc(item.level)} | ${esc(item.check)} | ${esc(item.horizon ? `${item.horizon}: ` : '')}${esc(item.detail)} |`);
      body.push('');
    } else {
      body.push('**Comprobaciones deterministas**: sin incidencias aritméticas ni estructurales.', '');
    }
  }

  if (errorsFiles.length) {
    body.push('---', '', '## Informes rechazados por el pipeline', '');
    for (const file of errorsFiles) {
      const data = JSON.parse(await readFile(`${DIR}/analisis/${file}`, 'utf8'));
      body.push(`- **${data.filing.ticker} — ${data.filing.name}** (${data.filing.formType} ${data.filing.periodLabel}): rechazado con \`${data.code}\` — ${esc(data.error)}`);
    }
    body.push('');
  }

  await writeFile(OUT, `${body.join('\n')}\n`);
  console.log(`Informe generado en ${OUT} (${entries.length} evaluaciones, nota media ${fmtScore(average.toFixed(1))}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
