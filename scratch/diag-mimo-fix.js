#!/usr/bin/env node
/**
 * Diagnóstico: por qué el corrector de Mimo devolvió JSON inválido en la prueba
 * comparativa. Repite la llamada del corrector sobre el informe de Mimo guardado
 * y guarda la respuesta cruda para inspeccionar la posición del fallo.
 *
 *   AI_PROVIDER=opencode OPENCODE_GO_MODEL=mimo-v2.6-flash \
 *     node --env-file=.env scratch/diag-mimo-fix.js <analysisId>
 */

import fs from 'node:fs/promises';
import { pool } from '../db/pool.js';
import { getAgent } from '../src/agents/agentRegistry.js';
import { runDeterministicChecks } from '../src/agents/auditor/deterministicChecks.js';
import { capAuditSource, auditSourceLimit } from '../src/agents/auditor/auditPolicy.js';
import { loadKnowledgeRules } from '../src/agents/analyst/filingExtractor.js';
import { CORRECTOR_SYSTEM_PROMPT, buildCorrectorUserPrompt } from '../src/agents/auditor/correctorPrompt.js';
import { buildSharedAuditContext } from '../src/agents/auditor/auditorPrompt.js';
import { getProvider } from '../src/services/ai/modelProvider.js';
import { getFilingContentBuffer } from '../src/services/edgar.service.js';
import { htmlToText } from '../src/services/analysis.service.js';

const analysisId = process.argv[2];
if (!analysisId) {
  console.error('Uso: node --env-file=.env scratch/diag-mimo-fix.js <analysisId>');
  process.exit(1);
}

async function main() {
  const { rows } = await pool.query('SELECT * FROM analyses WHERE id = $1', [analysisId]);
  const row = rows[0];
  if (!row) throw new Error(`No existe el análisis ${analysisId}`);

  const report = row.report;
  const ticker = row.ticker;
  const accession = row.accession;
  console.log(`Análisis ${analysisId} · ${ticker} ${accession} · modelo ${row.model_used}`);

  const content = await getFilingContentBuffer(ticker, accession);
  if (!content) throw new Error('Filing no disponible');
  const sourceText = content.kind === 'pdf'
    ? (await import('../src/services/pdf.service.js')).extractTextFromPdf(content.buffer)
    : htmlToText(content.buffer.toString('utf8'));

  const rules = await loadKnowledgeRules('defensive_consumer', null, '10-K', ticker);
  const capped = capAuditSource(sourceText, auditSourceLimit(String(rules).trim().length));

  const auditor = getAgent('auditor');
  const { audit, deterministic } = await auditor.run({
    report,
    sourceText: capped.text,
    filingMeta: { ticker, formType: '10-K', period: report.reportingPeriod ?? null, periodLabel: report.periodLabel ?? null },
    rules: String(rules).trim(),
  });
  console.log(`Auditoría: nota ${audit.score}/10 · ${audit.errores?.length ?? 0} errores`);

  const messages = [
    { role: 'system', content: `${buildSharedAuditContext({ rules: String(rules).trim(), deterministic })}\n\n${CORRECTOR_SYSTEM_PROMPT}` },
    { role: 'user', content: buildCorrectorUserPrompt({
      report,
      audit,
      filingMeta: { ticker, formType: '10-K', period: report.reportingPeriod ?? null, periodLabel: report.periodLabel ?? null },
    }) },
  ];

  const provider = getProvider();
  const response = await provider.chat(messages, { sessionId: `diag-${analysisId}` });
  const raw = typeof response === 'string' ? response : (response.content ?? '');
  const model = typeof response === 'string' ? null : response.model;
  const usage = typeof response === 'string' ? null : response.usage;

  const rawPath = `/tmp/opencode/mimo-fix-raw-${analysisId}.txt`;
  await fs.writeFile(rawPath, raw);
  console.log(`Respuesta cruda: ${raw.length} caracteres -> ${rawPath}`);
  console.log(`Modelo: ${model} · finish/usage: ${JSON.stringify(usage)}`);

  try {
    JSON.parse(raw);
    console.log('JSON.parse: OK (sin error)');
  } catch (error) {
    console.log(`JSON.parse: ${error.message}`);
    const m = String(error.message).match(/position (\d+)/);
    if (m) {
      const p = Number(m[1]);
      console.log('--- contexto ±300 caracteres ---');
      console.log(JSON.stringify(raw.slice(Math.max(0, p - 300), p + 300)));
      console.log('--------------------------------');
      console.log('char en posición:', JSON.stringify(raw.slice(p - 20, p + 20)));
    }
    console.log('Últimos 200 caracteres:', JSON.stringify(raw.slice(-200)));
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
