#!/usr/bin/env node
/**
 * @fileoverview Ejecuta el agente auditor sobre los análisis generados y guarda
 * la evaluación (nota 1-10, errores, aciertos y comprobaciones deterministas).
 *
 * Uso:
 *   node --env-file=.env scripts/qa/evaluate-analyses.js --provider=deepseek
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { AuditorAgent } from '../../src/agents/auditor/auditorAgent.js';
import { pool } from '../../db/pool.js';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const PROVIDER = getArg('provider', 'deepseek');
const ONLY = getArg('only', null);
const ANALISIS_DIR = getArg('analisis', 'documentacion/revisiones/2026-09-18/analisis');
const OUT_DIR = getArg('out', 'documentacion/revisiones/2026-09-18/evaluaciones');

process.env.AI_PROVIDER = PROVIDER;

const SELF_NEGATING = /no hay error|no es un error|no supone un error|no representa un error|es correcto|correcto[.,;:]|sin error|no es incorrecto|coincide con el filing|no es material/i;
const CONTRAST = /pero|sin embargo|no obstante|incorrecto|error real|en realidad|contradice|no coincide/i;

function cleanAudit(audit) {
  const raw = Array.isArray(audit?.errores) ? audit.errores : [];
  const filtered = raw.filter((item) => {
    const text = `${item?.descripcion ?? ''} ${item?.impacto ?? ''}`;
    if (!SELF_NEGATING.test(text)) return true;
    return CONTRAST.test(text);
  });
  const removed = raw.length - filtered.length;
  return { audit: { ...audit, errores: filtered.slice(0, 10) }, removed };
}

async function main() {
  const entries = (await readdir(ANALISIS_DIR))
    .filter((name) => name.endsWith('.json') && !name.endsWith('.error.json'))
    .filter((name) => !ONLY || name.startsWith(ONLY))
    .sort();
  console.log(`Evaluador: ${PROVIDER} · Informes encontrados: ${entries.length}`);

  for (const entry of entries) {
    const base = entry.replace(/\.json$/, '');
    const outPath = `${OUT_DIR}/${base}.json`;
    if (!ONLY) {
      try {
        await readFile(outPath);
        console.log(`[SKIP] ${base}: evaluación ya existente.`);
        continue;
      } catch {}
    }

    const payload = JSON.parse(await readFile(`${ANALISIS_DIR}/${entry}`, 'utf8'));
    const sourceText = await readFile(`${ANALISIS_DIR}/${base}.fuente.txt`, 'utf8');
    console.log(`\n[${new Date().toISOString()}] AUDITANDO ${base} (fuente ${sourceText.length} caracteres)...`);
    const start = Date.now();
    try {
      const { audit, deterministic } = await new AuditorAgent().run({
        report: payload.report,
        sourceText,
        filingMeta: payload.filing,
        provider: PROVIDER,
      });
      const cleaned = cleanAudit(audit);
      const elapsed = (Date.now() - start) / 1000;
      await writeFile(outPath, `${JSON.stringify({
        filing: payload.filing,
        analysisId: payload.analysisId,
        provider: PROVIDER,
        elapsed,
        audit: cleaned.audit,
        erroresDescartadosPorRuido: cleaned.removed,
        deterministic,
      }, null, 2)}\n`);
      console.log(`[OK] ${base} · nota ${audit.score} · ${cleaned.audit.errores?.length ?? 0} errores${cleaned.removed ? ` (${cleaned.removed} ruido descartado)` : ''} · ${elapsed.toFixed(1)}s`);
    } catch (error) {
      console.error(`[ERROR] ${base}: ${error.message}`);
      await writeFile(`${OUT_DIR}/${base}.error.json`, `${JSON.stringify({ error: error.message, code: error.code ?? null }, null, 2)}\n`);
    }
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
