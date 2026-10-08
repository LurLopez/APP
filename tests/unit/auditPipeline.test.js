import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Flujo de auditoría + corrección del informe: decisiones sobre qué errores se corrigen,
 * recorte del texto fuente para el auditor, validación del informe corregido y registro
 * del agente auditor en el pipeline.
 */

async function policy() {
  return import('../../src/agents/auditor/auditPolicy.js');
}

test('isEnabledFlag interpreta los interruptores del .env de forma tolerante', async () => {
  const { isEnabledFlag } = await policy();

  assert.equal(isEnabledFlag(undefined), true);
  assert.equal(isEnabledFlag(''), true);
  assert.equal(isEnabledFlag('true'), true);
  assert.equal(isEnabledFlag('TRUE'), true);
  assert.equal(isEnabledFlag('si'), true);
  assert.equal(isEnabledFlag('1'), true);
  assert.equal(isEnabledFlag('false'), false);
  assert.equal(isEnabledFlag(' FALSE '), false);
  assert.equal(isEnabledFlag('0'), false);
  assert.equal(isEnabledFlag('no'), false);
  assert.equal(isEnabledFlag('off'), false);
  assert.equal(isEnabledFlag('disabled'), false);
  assert.equal(isEnabledFlag('desactivado'), false);
  assert.equal(isEnabledFlag('', false), false);
  assert.equal(isEnabledFlag(undefined, false), false);
});

test('diffReports resume los cambios del corrector con ruta, antes y después', async () => {
  const { diffReports } = await policy();
  const original = {
    ticker: 'MCD',
    horizons: [{ sales: { rows: [{ name: 'Ventas', normal: '100M' }] } }],
    conclusion: { dividends: { changePct: 5.8, text: 'Subió un 5,8 %.' } },
  };
  const corrected = {
    ticker: 'MCD',
    horizons: [{ sales: { rows: [{ name: 'Ventas', normal: '101M' }] } }],
    conclusion: { dividends: { changePct: 5, text: 'Subió un 5 %.' } },
  };

  const changes = diffReports(original, corrected);
  assert.deepEqual(changes.map((change) => change.ruta).sort(), [
    'conclusion.dividends.changePct',
    'conclusion.dividends.text',
    'horizons.0.sales.rows.0.normal',
  ]);
  const row = changes.find((change) => change.ruta === 'horizons.0.sales.rows.0.normal');
  assert.equal(row.antes, '100M');
  assert.equal(row.despues, '101M');
  assert.deepEqual(diffReports(original, original), []);
});

test('resolveReportFileBase admite el HTML previo a los ajustes y rechaza el resto', async () => {
  const { resolveReportFileBase } = await import('../../src/api/controllers/reportDownload.controller.js');
  const base = '97fed074-beed-4aa5-bd8d-d21a0043dbee';

  assert.deepEqual(resolveReportFileBase(base, base, 'pdf'), { base, auditBefore: false });
  assert.deepEqual(resolveReportFileBase(base, `${base}-antes`, 'html'), { base: `${base}-antes`, auditBefore: true });
  assert.equal(resolveReportFileBase(base, `${base}-antes`, 'pdf'), null);
  assert.equal(resolveReportFileBase(base, `${base}-otro`, 'html'), null);
  assert.equal(resolveReportFileBase(base, '00000000-0000-0000-0000-000000000000-antes', 'html'), null);
});

test('normaliza y clasifica la gravedad de los errores del auditor', async () => {
  const { normalizeGravity, isFixableGravity } = await policy();

  assert.equal(normalizeGravity('GRAVE'), 'grave');
  assert.equal(normalizeGravity('Cosmético'), 'cosmetico');
  assert.equal(isFixableGravity('grave'), true);
  assert.equal(isFixableGravity('Grave'), true);
  assert.equal(isFixableGravity('menor'), true);
  assert.equal(isFixableGravity('MENOR'), true);
  assert.equal(isFixableGravity('cosmético'), false);
  assert.equal(isFixableGravity('cosmetico'), false);
  assert.equal(isFixableGravity(undefined), false);
});

test('collectFixableErrors conserva solo graves y menores y detecta si hay que corregir', async () => {
  const { collectFixableErrors, auditNeedsFix } = await policy();
  const audit = {
    score: 6.5,
    errores: [
      { id: 'E1', gravedad: 'grave', descripcion: 'EBT mal' },
      { id: 'E2', gravedad: 'COSMÉTICO', descripcion: 'tilde' },
      { id: 'E3', gravedad: 'Menor', descripcion: 'nota imprecisa' },
    ],
  };

  const fixable = collectFixableErrors(audit);
  assert.equal(fixable.length, 2);
  assert.deepEqual(fixable.map((error) => error.id), ['E1', 'E3']);
  assert.equal(auditNeedsFix(audit), true);

  assert.equal(auditNeedsFix({ errores: [{ gravedad: 'cosmetico' }] }), false);
  assert.equal(auditNeedsFix({ errores: [] }), false);
  assert.equal(auditNeedsFix(null), false);
});

test('capAuditSource deja el texto intacto si cabe y conserva inicio y final si no', async () => {
  const { capAuditSource } = await policy();

  const short = 'A'.repeat(1000);
  const intact = capAuditSource(short, 2000);
  assert.equal(intact.truncated, false);
  assert.equal(intact.text, short);
  assert.equal(intact.omittedChars, 0);

  const long = `${'I'.repeat(10000)}${'M'.repeat(10000)}${'F'.repeat(10000)}`;
  const capped = capAuditSource(long, 1000);
  assert.equal(capped.truncated, true);
  assert.equal(capped.omittedChars, long.length - 1000);
  assert.ok(capped.text.startsWith('I'));
  assert.ok(capped.text.endsWith('F'));
  assert.match(capped.text, /TEXTO OMITIDO: \d+ caracteres/);
  assert.ok(capped.text.length < long.length);
});

test('auditSourceLimit reserva el espacio de las reglas sobre el límite por defecto (200k)', async () => {
  const { auditSourceLimit } = await policy();
  const previous = process.env.AI_AUDIT_MAX_SOURCE_CHARS;
  delete process.env.AI_AUDIT_MAX_SOURCE_CHARS;
  try {
    assert.equal(auditSourceLimit(0), 200000);
    assert.equal(auditSourceLimit(50000), 150000);
    assert.equal(auditSourceLimit(500000), 60000);
  } finally {
    if (previous === undefined) delete process.env.AI_AUDIT_MAX_SOURCE_CHARS;
    else process.env.AI_AUDIT_MAX_SOURCE_CHARS = previous;
  }
});

test('el contexto compartido es idéntico en auditoría y corrección y encabeza ambos sistemas', async () => {
  const { buildSharedAuditContext, AUDITOR_SYSTEM_PROMPT, buildAuditorUserPrompt } = await import('../../src/agents/auditor/auditorPrompt.js');
  const { CORRECTOR_SYSTEM_PROMPT, buildCorrectorUserPrompt } = await import('../../src/agents/auditor/correctorPrompt.js');
  const deterministic = { findings: [{ check: 'capital.verificacion', level: 'fail' }] };
  const shared = buildSharedAuditContext({ rules: 'REGLA X', deterministic });

  assert.equal(shared, buildSharedAuditContext({ rules: 'REGLA X', deterministic }));
  assert.match(shared, /REGLA X/);
  assert.match(shared, /capital\.verificacion/);

  const auditorSystem = `${shared}\n\n${AUDITOR_SYSTEM_PROMPT}`;
  const correctorSystem = `${shared}\n\n${CORRECTOR_SYSTEM_PROMPT}`;
  assert.ok(auditorSystem.startsWith(shared));
  assert.ok(correctorSystem.startsWith(shared));
  assert.equal(auditorSystem.slice(0, shared.length), correctorSystem.slice(0, shared.length));
});

test('el corrector ya no recibe el filing completo; el auditor sí', async () => {
  const { buildAuditorUserPrompt } = await import('../../src/agents/auditor/auditorPrompt.js');
  const { buildCorrectorUserPrompt } = await import('../../src/agents/auditor/correctorPrompt.js');
  const report = { ticker: 'KO', horizons: [{ label: 'A' }] };
  const filingMeta = { ticker: 'KO', formType: '10-Q', period: '2026-03-31' };
  const filingText = 'TEXTO DEL FILING QUE NO DEBE VIAJAR AL CORRECTOR';

  const auditUser = buildAuditorUserPrompt({ report, filingMeta, sourceText: filingText });
  const fixUser = buildCorrectorUserPrompt({
    report,
    audit: { score: 7, errores: [{ id: 'E1', gravedad: 'menor', esperado: '10M', evidencia: 'cita' }] },
    filingMeta,
    sourceText: filingText,
    rules: 'REGLA X',
  });

  assert.match(auditUser, /TEXTO DEL FILING QUE NO DEBE VIAJAR AL CORRECTOR/);
  assert.doesNotMatch(fixUser, /TEXTO DEL FILING/);
  assert.doesNotMatch(fixUser, /REGLA X/);
  assert.match(fixUser, /AUDITORÍA INDEPENDIENTE/);
  assert.match(fixUser, /"esperado": "10M"/);
});

test('validateCorrectedReport rechaza candidatos inválidos y restaura metadatos', async () => {
  const { validateCorrectedReport } = await policy();
  const original = {
    ticker: 'KHC',
    company: 'Kraft Heinz',
    formType: '10-K',
    isAnnual: true,
    language: 'es',
    fiscalYear: 2025,
    reportingPeriod: '2025-12-27',
    rating: { score: 7, label: 'NOTA DE RESULTADOS: 7' },
    conclusion: { outlook: { text: 'guía' } },
    horizons: [
      { label: 'EN TODO EL AÑO (12 MESES)', sales: { rows: [] }, cashFlow: { rows: [] }, capital: { rows: [] } },
    ],
  };

  assert.equal(validateCorrectedReport(null, original).ok, false);
  assert.equal(validateCorrectedReport('texto', original).ok, false);
  assert.equal(validateCorrectedReport({}, original).ok, false);
  assert.equal(validateCorrectedReport({ horizons: [] }, original).ok, false);
  assert.equal(
    validateCorrectedReport({ horizons: [{ label: 'a' }, { label: 'b' }] }, original).reason,
    'horizontes_alterados',
  );

  const candidate = {
    horizons: [{ label: 'EN TODO EL AÑO (12 MESES)', sales: { rows: [] }, cashFlow: { rows: [] }, capital: { rows: [] } }],
  };
  const validated = validateCorrectedReport(candidate, original);
  assert.equal(validated.ok, true);
  assert.equal(validated.report.ticker, 'KHC');
  assert.equal(validated.report.isAnnual, true);
  assert.equal(validated.report.fiscalYear, 2025);
  assert.deepEqual(validated.report.rating, original.rating);
  assert.deepEqual(validated.report.conclusion, original.conclusion);
});

test('el agente auditor está registrado en el pipeline y expone la corrección', async () => {
  const { getAgent } = await import('../../src/agents/agentRegistry.js');
  const auditor = getAgent('auditor');

  assert.ok(auditor, 'El agente auditor debe estar registrado.');
  assert.equal(auditor.name, 'auditor');
  assert.equal(typeof auditor.run, 'function');
  assert.equal(typeof auditor.fix, 'function');
});

function capitalReport(verification) {
  return {
    horizons: [{
      label: 'EN TODO EL AÑO (12 MESES)',
      sales: { rows: [], notes: [], shares: '710,6M', eps: '11,95 $' },
      cashFlow: { rows: [], scenarios: [], notes: [] },
      capital: {
        rows: [
          { name: 'Libre', value: '2071M' },
          { name: 'Desinversiones', value: '476M' },
          { name: 'Adquisiciones', value: '-354M' },
          { name: 'Recompras', value: '-2056M' },
          { name: 'Caja', value: '311M' },
          { name: 'Deuda', value: '1549M' },
          { name: 'En total', value: '1997M' },
        ],
        verification,
        notes: [],
      },
    }],
  };
}

test('la comprobación de capital acepta el descuadre explicado con deuda no monetaria', async () => {
  const { runDeterministicChecks } = await import('../../src/agents/auditor/deterministicChecks.js');
  const verification = 'Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle. La tabla solo incluye movimientos de caja; los siguientes no pasan por caja: deuda no monetaria (recompras o amortizaciones anticipadas de deuda con ganancia o pérdida, efecto divisa) -1627M. Con ellos, el resto sin explicar sería +370M, dentro del margen razonable.';

  const explained = runDeterministicChecks(capitalReport(verification));
  assert.equal(explained.findings.filter((item) => item.check === 'capital.verificacion').length, 0);

  const unexplained = runDeterministicChecks(capitalReport('Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.'));
  assert.equal(unexplained.findings.filter((item) => item.check === 'capital.verificacion').length, 1);
});
