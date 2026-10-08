#!/usr/bin/env node

/**
 * Prueba comparativa: el MISMO informe anual (10-K) analizado con dos modelos.
 *
 * Reproduce el flujo completo de "Analizar informe" de la web:
 *   origen → sector → analista → auditor (revisión) → corrector → PDF/HTML → guardado.
 *
 * Uso (una pasada por modelo; el proveedor y el modelo se fijan al arrancar):
 *
 *   AI_PROVIDER=deepseek AI_MODEL=deepseek-flash \
 *     node --env-file=.env scripts/prueba-comparativa-modelos.js --tag=deepseek-v4.1-flash
 *
 *   AI_PROVIDER=opencode OPENCODE_GO_MODEL=mimo-v2.6-flash \
 *     node --env-file=.env scripts/prueba-comparativa-modelos.js --tag=mimo-v2.6-flash
 *
 * Opciones CLI:
 *   --ticker=KO            Ticker del informe (por defecto: KO).
 *   --accession=...        Accession del filing (por defecto: último 10-K de KO).
 *   --tag=...              Etiqueta del modelo para nombrar salidas (obligatoria).
 *   --out=comparacion      Carpeta de salida de los HTML y del resumen JSON.
 *   --language=es          Idioma del informe.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFilingContentBuffer, getPresentationBuffers } from '../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../src/services/analysis.service.js';
import { estimateDeepseekCostUsd } from '../src/services/ai/usageTracker.js';
import { deepseekProvider } from '../src/services/ai/providers/deepseek.provider.js';
import { opencodeGoProvider } from '../src/services/ai/providers/opencode-go.provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
function getArg(name, defaultValue = null) {
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  if (args.includes(`--${name}`)) return true;
  return defaultValue;
}

const TICKER = String(getArg('ticker', 'KO')).toUpperCase();
const ACCESSION = String(getArg('accession', '0001628280-26-010047'));
const TAG = String(getArg('tag', '')).replace(/[^\w.-]/g, '-');
const OUT_DIR = path.resolve(ROOT, String(getArg('out', 'comparacion')));
const LANGUAGE = String(getArg('language', 'es'));
const FORM_TYPE = String(getArg('form', '10-K'));

if (!TAG) {
  console.error('Falta la etiqueta del modelo: --tag=deepseek-v4.1-flash | --tag=mimo-v2.6-flash');
  process.exit(1);
}

const PROVIDER = process.env.AI_PROVIDER || 'deepseek';
const MODEL = PROVIDER === 'deepseek'
  ? (process.env.AI_MODEL || 'deepseek-flash')
  : (process.env.OPENCODE_GO_MODEL || 'deepseek-v4.1-flash');

// Diagnóstico: guarda cada respuesta cruda del modelo en /tmp/opencode para poder
// inspeccionar los fallos de JSON del corrector sin tocar el código del producto.
let rawSeq = 0;
for (const provider of [deepseekProvider, opencodeGoProvider]) {
  const originalChat = provider.chat.bind(provider);
  provider.chat = async (...chatArgs) => {
    const response = await originalChat(...chatArgs);
    rawSeq += 1;
    try {
      const content = typeof response === 'string' ? response : (response?.content ?? '');
      await fs.mkdir('/tmp/opencode', { recursive: true });
      await fs.writeFile(
        `/tmp/opencode/raw-${TAG}-${String(rawSeq).padStart(2, '0')}.txt`,
        content,
      );
    } catch {
      // el fallo al guardar un raw nunca debe romper el análisis
    }
    return response;
  };
}

/** Suma los consumos por fases devueltas por el pipeline. */
function totalUsage(phases) {
  const keys = ['llamadas', 'promptTokens', 'completionTokens', 'reasoningTokens', 'cacheHitTokens', 'cacheMissTokens', 'totalTokens'];
  const total = Object.fromEntries(keys.map((k) => [k, 0]));
  total.costeUsd = 0;
  total.costeConocido = true;
  for (const phase of [phases?.analisis, phases?.revision]) {
    if (!phase) continue;
    for (const k of keys) total[k] += Number(phase[k] ?? 0);
    total.costeUsd += Number(phase.costeUsd ?? 0);
    if (phase.costeConocido === false) total.costeConocido = false;
  }
  total.costeUsd = Number(total.costeUsd.toFixed(6));
  return total;
}

/** Precio de referencia: lo que costaría el mismo consumo con tarifa DeepSeek Flash. */
function referenceDeepseekCost(usage) {
  return estimateDeepseekCostUsd('deepseek-flash', {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    prompt_cache_hit_tokens: usage.cacheHitTokens,
    prompt_cache_miss_tokens: usage.cacheMissTokens,
  });
}

async function copyHtml(id, tag) {
  const generated = path.join(ROOT, 'uploads', 'generated');
  const copies = [];
  const pairs = [
    [`${id}.html`, `${tag}.html`],
    [`${id}-antes.html`, `${tag}-antes-auditoria.html`],
  ];
  for (const [src, dest] of pairs) {
    const from = path.join(generated, src);
    try {
      await fs.copyFile(from, path.join(OUT_DIR, dest));
      copies.push(dest);
    } catch {
      // el HTML "antes" solo existe si la auditoría llegó a ejecutarse
    }
  }
  return copies;
}

async function main() {
  console.log('='.repeat(72));
  console.log(` PRUEBA COMPARATIVA 10-K · ${TICKER} ${ACCESSION}`);
  console.log(` Proveedor: ${PROVIDER} · Modelo: ${MODEL} · tag: ${TAG} · idioma: ${LANGUAGE}`);
  console.log('='.repeat(72));

  const startedAt = Date.now();
  const content = await getFilingContentBuffer(TICKER, ACCESSION);
  if (!content) throw new Error(`No se pudo descargar el filing ${TICKER} ${ACCESSION}`);

  let presentationText = null;
  try {
    const presentations = await getPresentationBuffers(TICKER, ACCESSION);
    if (presentations?.length) presentationText = await buildPresentationText(presentations);
  } catch (error) {
    console.warn('[prueba] presentación no disponible:', error.message);
  }

  const options = {
    userId: null,
    actor: 'prueba-modelos',
    isPublic: false,
    filename: `${TICKER}-${ACCESSION}.pdf`,
    ticker: TICKER,
    accession: ACCESSION,
    sourceUrl: content.filing?.documentUrl ?? null,
    modelUsed: `${PROVIDER} · ${MODEL}`,
    formType: FORM_TYPE,
    presentationText,
    language: LANGUAGE,
  };

  const result = content.kind === 'pdf'
    ? await analyzePdf(content.buffer, options)
    : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);

  const elapsedSec = Number(((Date.now() - startedAt) / 1000).toFixed(1));
  const usage = totalUsage(result.phases);
  const referenceUsd = referenceDeepseekCost(usage);
  const id = path.basename(String(result.pdfUrl ?? ''), '.pdf');
  const report = result.report ?? {};

  await fs.mkdir(OUT_DIR, { recursive: true });
  const copies = id ? await copyHtml(id, TAG) : [];

  const summary = {
    tag: TAG,
    provider: PROVIDER,
    model: MODEL,
    ticker: TICKER,
    accession: ACCESSION,
    formType: result.formType,
    sector: result.sector,
    subsector: result.subsector,
    language: result.language,
    analysisId: result.analysisId,
    segundos: elapsedSec,
    fases: result.phases,
    consumo: usage,
    costeUsd: usage.costeUsd,
    costeConocido: usage.costeConocido,
    costeReferenciaDeepseekFlashUsd: Number((referenceUsd ?? 0).toFixed(6)),
    rating: report.rating ?? null,
    audit: result.audit ?? null,
    auditCambios: result.auditChanges ?? [],
    html: copies,
    generadoEn: new Date().toISOString(),
  };

  const summaryPath = path.join(OUT_DIR, `modelo-${TAG}.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n' + '-'.repeat(72));
  console.log(`RESULTADO ${TAG}`);
  console.log(`  Tiempo total      : ${elapsedSec} s`);
  console.log(`  Análisis          : ${result.phases?.analisis?.segundos ?? '—'} s · ${result.phases?.analisis?.llamadas ?? 0} llamadas`);
  console.log(`  Revisión (auditor): ${result.phases?.revision?.segundos ?? '—'} s · nota ${result.audit?.nota ?? '—'}/10 · ${result.audit?.errores ?? 0} errores · corregido=${result.audit?.corregido ?? false} (${result.audit?.cambios ?? 0} cambios)`);
  console.log(`  PDF/HTML          : ${result.phases?.pdf?.segundos ?? '—'} s`);
  console.log(`  Tokens            : prompt ${usage.promptTokens} · completion ${usage.completionTokens} · total ${usage.totalTokens}`);
  console.log(`  Coste estimado    : ${usage.costeConocido ? `$${usage.costeUsd}` : 'desconocido'} (proveedor ${PROVIDER})`);
  console.log(`  Ref. DeepSeek Flash: $${summary.costeReferenciaDeepseekFlashUsd} (mismo consumo a tarifa DeepSeek)`);
  console.log(`  Rating IA         : ${report.rating ? `${report.rating.score}/10 — ${report.rating.label ?? ''}` : '—'}`);
  console.log(`  HTML generados    : ${copies.join(', ') || 'ninguno'}`);
  console.log(`  Resumen JSON      : ${path.relative(ROOT, summaryPath)}`);
  console.log('-'.repeat(72));

  process.exit(0);
}

main().catch((error) => {
  console.error(`[prueba:${TAG}] ERROR`, error);
  process.exit(1);
});
