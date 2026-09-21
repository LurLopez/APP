import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SectorAgent, resolveSectorByTicker, resolveSectorBySic } from '../../src/agents/sectorAgent.js';
import { resolveAnalysisVersionInfo } from '../../src/agents/versionRegistry.js';
import { loadKnowledgeRules } from '../../src/agents/analyst/filingExtractor.js';
import { profileSector } from '../../src/services/edgar/companyProfileData.js';

test('resolveSectorByTicker clasifica los subsectores admitidos de consumo discrecional', () => {
  for (const ticker of ['HD', 'LOW', 'POOL', 'TJX', 'ROST', 'NKE', 'LULU', 'MCD', 'CMG', 'AMZN', 'ETSY', 'KMX', 'DHI', 'TREX', 'APTV', 'SIG', 'ULTA']) {
    assert.equal(resolveSectorByTicker(ticker), 'consumer_discretionary', ticker);
  }
  // Los sectores existentes mantienen su prioridad
  assert.equal(resolveSectorByTicker('KO'), 'defensive_consumer');
  assert.equal(resolveSectorByTicker('MSFT'), 'technology');
});

test('los negocios de consumo discrecional fuera de alcance no se clasifican por ticker', () => {
  for (const ticker of ['GM', 'F', 'TSLA', 'RIVN', 'LCID', 'HOG', 'MAR', 'HLT', 'CCL', 'RCL', 'NCLH', 'BKNG', 'EXPE', 'LOPE', 'ATGE', 'BFAM', 'HRB', 'DAL', 'UAL', 'LUV']) {
    assert.equal(resolveSectorByTicker(ticker), null, ticker);
  }
});

test('resolveSectorBySic admite los rangos de consumo discrecional y rechaza los excluidos', () => {
  assert.equal(resolveSectorBySic(5211), 'consumer_discretionary', 'mejora del hogar');
  assert.equal(resolveSectorBySic(5651), 'consumer_discretionary', 'ropa');
  assert.equal(resolveSectorBySic(5812), 'consumer_discretionary', 'restaurantes');
  assert.equal(resolveSectorBySic(5961), 'consumer_discretionary', 'comercio electrónico');
  assert.equal(resolveSectorBySic(3714), 'consumer_discretionary', 'autopartes');
  assert.equal(resolveSectorBySic(1520), 'consumer_discretionary', 'promotoras de vivienda');
  assert.equal(resolveSectorBySic(3711), null, 'los fabricantes de automóviles quedan fuera');
  assert.equal(resolveSectorBySic(7011), null, 'los hoteles quedan fuera');
  assert.equal(resolveSectorBySic(7997), null, 'el ocio y los clubes quedan fuera');
  assert.equal(resolveSectorBySic(8200), null, 'la educación queda fuera');
  assert.equal(resolveSectorBySic(4724), null, 'las agencias de viaje quedan fuera');
  // Los rangos de los otros sectores siguen resolviendo igual
  assert.equal(resolveSectorBySic(2086), 'defensive_consumer');
  assert.equal(resolveSectorBySic(7372), 'technology');
});

test('resolveAnalysisVersionInfo resuelve la versión del sector de consumo discrecional', async () => {
  const versionInfo = await resolveAnalysisVersionInfo({ sector: 'consumer_discretionary' });
  assert.equal(versionInfo.sectorVersion, '1');
  assert.match(versionInfo.version, /^0\.1/);
});

test('loadKnowledgeRules carga las reglas de consumo discrecional con su alcance', async () => {
  const rules = await loadKnowledgeRules('consumer_discretionary', null, '10-Q', 'HD');
  assert.match(rules, /Sector: Consumo Discrecional/);
  assert.match(rules, /ventas comparables/);
  assert.match(rules, /Arrendamientos operativos/);
  assert.match(rules, /Fuera del sector \(se rechaza\)/);
});

test('SectorAgent.run detecta el consumo discrecional de forma determinista por ticker', async () => {
  const agent = new SectorAgent();
  const result = await agent.run({
    text: 'Form 10-Q for HOME DEPOT, INC. Item 1 Business and financial statements',
    ticker: 'HD',
    formType: '10-Q',
  });
  assert.equal(result.sector, 'consumer_discretionary');
  assert.equal(result.sectorVersion, '1');
});

// Cifras reales de AMZN 2026-Q2 (10-Q accession 0001018724-26-000026): la línea de inversión
// "Acquisitions, net of cash acquired, non-marketable investments, and other" financia las
// preferentes de Anthropic (5.000M Serie G + 10.000M adicionales) y OpenAI (13.700M Serie C)
// y la deuda del semestre (63.246M) se explica por las emisiones del estado de flujos.
function buildAmznQ2Extraction({ withSystemDebtCash = true } = {}) {
  return {
    ticker: 'AMZN',
    fiscalQuarter: 2,
    fiscalYear: 2026,
    balance: {
      cash: 78213,
      cashBeginningOfYear: 86810,
      cashPreviousQuarter: 101816,
      shortTermInvestments: 44775,
      shortTermInvestmentsBeginningOfYear: 36219,
      shortTermInvestmentsPreviousQuarter: 41273,
      totalDebt: 128894,
      totalDebtBeginningOfYear: 65648,
      totalDebtPreviousQuarter: 122058,
    },
    facts: {
      acquisitionsQuarter: 24359,
      acquisitionsYtd: 39767,
      assetSalesQuarter: 1132,
      assetSalesYtd: 2101,
      purchasesOfMarketableSecuritiesQuarter: 26006,
      purchasesOfMarketableSecuritiesYtd: 49262,
      proceedsFromSaleOfMarketableSecuritiesQuarter: 24196,
      proceedsFromSaleOfMarketableSecuritiesYtd: 41882,
      acquisitionDescription: 'Inversiones en acciones preferentes Serie G de Anthropic y Serie C de OpenAI (valores no negociables)',
      debtCashFlowYtd: 12488,
    },
    ...(withSystemDebtCash ? { systemDebtCash: { ytd: 63950, quarter: 7096 } } : {}),
  };
}

test('consumo discrecional no inventa deuda asumida con inversiones financieras (AMZN 2026-Q2)', async () => {
  const { buildCapitalAllocationFromBalance } = await import('../../src/agents/analyst/capitalAllocationHelpers.js');

  const { ytd, threeMonths } = buildCapitalAllocationFromBalance(buildAmznQ2Extraction(), 'es', 'consumer_discretionary');
  assert.equal(ytd.assumedDebt, 0, 'las preferentes de Anthropic/OpenAI no son una compra de negocio con deuda asumida');
  assert.equal(threeMonths.assumedDebt, 0);

  // Con la composición XBRL del sistema (flujo neto de deuda 63.950M ≈ variación del balance)
  // tampoco hay hueco para deuda asumida.
  const withSystem = buildCapitalAllocationFromBalance(buildAmznQ2Extraction(), 'es', 'consumer_discretionary');
  assert.equal(withSystem.ytd.assumedDebt, 0);

  // Sin la composición XBRL, la divergencia del 80 % sigue descartándose por política sectorial.
  const withoutSystem = buildCapitalAllocationFromBalance(
    buildAmznQ2Extraction({ withSystemDebtCash: false }),
    'es',
    'consumer_discretionary',
  );
  assert.equal(withoutSystem.ytd.assumedDebt, 0);

  // Consumo defensivo conserva el criterio clásico (el mismo caso no cambia su cálculo).
  const defensive = buildCapitalAllocationFromBalance(
    buildAmznQ2Extraction({ withSystemDebtCash: false }),
    'es',
    'defensive_consumer',
  );
  assert.equal(defensive.ytd.assumedDebt, 50758);
});

test('consumo discrecional cuadra la asignación de capital de AMZN 2026-Q2 sin la fila de deuda asumida', async () => {
  const { buildCapitalAllocationFromBalance } = await import('../../src/agents/analyst/capitalAllocationHelpers.js');
  const { normalizeCapitalBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');

  const extracted = buildAmznQ2Extraction();
  extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted, 'es', 'consumer_discretionary');
  const horizon = {
    label: 'EN TODO EL AÑO (6 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['-26992'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '-26992' },
        { name: 'En total', value: '0' },
      ],
      notes: [],
      verification: '',
    },
  };

  normalizeCapitalBlock(horizon, extracted, 'es');

  const rows = Object.fromEntries(horizon.capital.rows.map((row) => [row.name.replace(/\*\d+/g, '').trim(), row.value]));
  assert.equal(rows['Libre'], '-26992');
  assert.equal(rows['Adquisiciones'], '-39767');
  assert.equal(rows['Deuda'], '63246');
  assert.equal(rows['En total'], '-195', '-26.992 - 7.380 + 2.101 - 39.767 + 8.597 + 63.246 = -195');
  assert.ok(!horizon.capital.rows.some((row) => /asumid/i.test(row.name)), 'no debe existir la fila de deuda asumida');
  assert.ok(!horizon.capital.notes.some((note) => /asumid/i.test(String(note))), 'no debe quedar la nota de deuda asumida');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
  assert.doesNotMatch(horizon.capital.verification, /No cuadra/);
});

test('la política de deuda asumida se diferencia por sector sin tocar los add-back compartidos', async () => {
  const {
    getAssumedDebtPolicy,
    getSectorPolicy,
    SECTOR_POLICIES,
    isBusinessAcquisitionDescription,
  } = await import('../../src/agents/analyst/sectorPolicy.js');

  assert.equal(getAssumedDebtPolicy('consumer_discretionary').maxDebtDeltaRatio, 0.5);
  assert.equal(getAssumedDebtPolicy('defensive_consumer').maxDebtDeltaRatio, 0.85);
  assert.equal(getAssumedDebtPolicy('technology').maxDebtDeltaRatio, 0.85);
  assert.ok(isBusinessAcquisitionDescription('JDE Peet\'s, negocio de café y té'));
  assert.ok(!isBusinessAcquisitionDescription('acciones preferentes Serie C de OpenAI'));
  assert.ok(!isBusinessAcquisitionDescription('inversiones en valores no negociables de Anthropic'));
  assert.ok(!isBusinessAcquisitionDescription(null));

  // La política de ajustes del bloque de Ventas sigue siendo idéntica entre los dos consumos.
  assert.equal(getSectorPolicy('consumer_discretionary'), getSectorPolicy('defensive_consumer'));
  assert.equal(SECTOR_POLICIES.consumer_discretionary, SECTOR_POLICIES.defensive_consumer);
});

test('la política sectorial de consumo discrecional suma amortización y deterioros como consumo defensivo', async () => {
  const { getSectorPolicy, buildSectorPolicyDirective } = await import('../../src/agents/analyst/sectorPolicy.js');
  const policy = getSectorPolicy('consumer_discretionary');
  assert.equal(policy.intangibleAmortizationAddBack, true);
  assert.equal(policy.goodwillImpairmentAddBack, true);
  assert.equal(policy.intangibleImpairmentAddBack, true);

  const directive = buildSectorPolicyDirective('consumer_discretionary');
  assert.match(directive, /Amortización recurrente de intangibles: SÍ se suma de vuelta/);
  assert.match(directive, /Deterioro de fondo de comercio[\s\S]*SÍ se suma de vuelta/);
  assert.match(directive, /Deterioro de intangibles[\s\S]*SÍ se suma de vuelta/);
});

test('profileSector etiqueta el consumo discrecional sin absorber los negocios excluidos', () => {
  assert.equal(profileSector(5211), 'Consumo discrecional');
  assert.equal(profileSector(5812), 'Consumo discrecional');
  assert.equal(profileSector(3714), 'Consumo discrecional');
  assert.equal(profileSector(1520), 'Consumo discrecional');
  assert.notEqual(profileSector(3711), 'Consumo discrecional', 'los fabricantes de automóviles no entran');
  assert.notEqual(profileSector(7011), 'Consumo discrecional', 'los hoteles no entran');
  assert.notEqual(profileSector(8200), 'Consumo discrecional', 'la educación no entra');
});

test('el verificador mock reconoce el consumo discrecional de los subsectores admitidos', async () => {
  const { mockProvider } = await import('../../src/services/ai/providers/mock.provider.js');
  const response = await mockProvider.chat([
    { role: 'system', content: 'Eres el verificador de sector de un analizador financiero.' },
    { role: 'user', content: 'The Home Depot is a home improvement retailer with stores across the United States.' },
  ]);
  const parsed = JSON.parse(response.content);
  assert.equal(parsed.sector, 'consumer_discretionary');
  assert.equal(parsed.isConsumerDiscretionary, true);
});
