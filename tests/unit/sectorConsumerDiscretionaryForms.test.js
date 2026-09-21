import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadKnowledgeRules } from '../../src/agents/analyst/filingExtractor.js';
import { resolveAnalysisVersionInfo, isAnalysisOutdated, resolveAnalysisVersion } from '../../src/agents/versionRegistry.js';
import { buildSectorPolicyDirective } from '../../src/agents/analyst/sectorPolicy.js';

/**
 * Habilita y protege los análisis de consumo discrecional en sus dos formularios:
 * 10-Q (trimestral) y 10-K (anual). El pipeline es el mismo que el de consumo
 * defensivo; aquí se cubre la rama anual, que carga las reglas generales de 10-K
 * más el sector.md de consumo discrecional.
 */

test('las reglas de consumo discrecional se cargan en trimestral y en anual', async () => {
  const quarterly = await loadKnowledgeRules('consumer_discretionary', null, '10-Q', 'HD');
  assert.match(quarterly, /REGLAS GENERALES Y FORMATO:/);
  assert.match(quarterly, /Sector: Consumo Discrecional/);
  assert.doesNotMatch(quarterly, /REGLAS GENERALES Y FORMATO ANUAL/);

  const annual = await loadKnowledgeRules('consumer_discretionary', null, '10-K', 'HD');
  assert.match(annual, /REGLAS GENERALES Y FORMATO ANUAL \(10-K\)/);
  assert.match(annual, /Sector: Consumo Discrecional/);
  assert.match(annual, /EN TODO EL AÑO \(12 MESES\)/);
  // Las reglas de cálculo son las mismas en ambos formularios.
  assert.match(annual, /Beneficio Neto Ajustado = EBT Ajustado × 0,77/);
  assert.match(annual, /peso agregado histórico/);
  assert.match(annual, /Impuestos Normalizados/);
});

test('la versión del análisis de consumo discrecional es la misma en 10-Q y 10-K', async () => {
  const quarterly = await resolveAnalysisVersionInfo({ sector: 'consumer_discretionary', ticker: 'HD', formType: '10-Q' });
  const annual = await resolveAnalysisVersionInfo({ sector: 'consumer_discretionary', ticker: 'HD', formType: '10-K' });
  assert.equal(quarterly.sectorVersion, '1');
  assert.equal(annual.sectorVersion, '1');
  assert.equal(quarterly.version, annual.version);
});

test('isAnalysisOutdated detecta y acepta la versión vigente en ambos formularios', async () => {
  const annual = await resolveAnalysisVersionInfo({ sector: 'consumer_discretionary', ticker: 'MCD', formType: '10-K' });
  assert.equal(await isAnalysisOutdated({ version: '0', sector: 'consumer_discretionary', ticker: 'MCD', formType: '10-K' }), true);
  assert.equal(await isAnalysisOutdated({ version: annual.version, sector: 'consumer_discretionary', ticker: 'MCD', formType: '10-K' }), false);
  assert.equal(
    await resolveAnalysisVersion({ sector: 'consumer_discretionary', ticker: 'MCD', formType: '10-K' }),
    annual.version,
  );
});

test('la directiva de cálculo del bloque de Ventas es la de consumo defensivo en 10-K', async () => {
  const directive = buildSectorPolicyDirective('consumer_discretionary');
  assert.match(directive, /Amortización recurrente de intangibles: SÍ se suma de vuelta/);
  assert.match(directive, /Deterioro de fondo de comercio[\s\S]*SÍ se suma de vuelta/);
  assert.match(directive, /Deterioro de intangibles[\s\S]*SÍ se suma de vuelta/);
});
