import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SectorAgent, resolveSectorByTicker, resolveSectorBySic } from '../../src/agents/sectorAgent.js';
import { resolveAnalysisVersionInfo } from '../../src/agents/versionRegistry.js';
import { loadKnowledgeRules } from '../../src/agents/analyst/filingExtractor.js';

test('resolveSectorByTicker clasifica correctamente tickers de tecnología y consumo defensivo', () => {
  assert.equal(resolveSectorByTicker('MSFT'), 'technology');
  assert.equal(resolveSectorByTicker('NVDA'), 'technology');
  assert.equal(resolveSectorByTicker('AAPL'), 'technology');
  assert.equal(resolveSectorByTicker('KO'), 'defensive_consumer');
  assert.equal(resolveSectorByTicker('PEP'), 'defensive_consumer');
  assert.equal(resolveSectorByTicker('UNKNOWN_XYZ'), null);
});

test('resolveAnalysisVersionInfo resuelve la versión del sector de tecnología', async () => {
  const versionInfo = await resolveAnalysisVersionInfo({ sector: 'technology' });
  assert.equal(versionInfo.sectorVersion, '1');
  assert.match(versionInfo.version, /^0\.1/);
});

test('loadKnowledgeRules carga las reglas de tecnología y software', async () => {
  const rules = await loadKnowledgeRules('technology', null, '10-Q', 'MSFT');
  assert.match(rules, /Sector: Tecnología y Software/);
  assert.match(rules, /Stock-Based Compensation/);
  assert.match(rules, /Ingresos Diferidos/);
});

test('SectorAgent.run detecta el sector tecnológico de forma determinista por ticker', async () => {
  const agent = new SectorAgent();
  const result = await agent.run({
    text: 'Form 10-Q for MICROSOFT CORP Item 1 Business and financial statements',
    ticker: 'MSFT',
    formType: '10-Q',
  });
  assert.equal(result.sector, 'technology');
  assert.equal(result.sectorVersion, '1');
});

test('SectorAgent.run detecta el sector de consumo defensivo por ticker', async () => {
  const agent = new SectorAgent();
  const result = await agent.run({
    text: 'Form 10-Q for THE COCA-COLA COMPANY Item 1 Business',
    ticker: 'KO',
    formType: '10-Q',
  });
  assert.equal(result.sector, 'defensive_consumer');
  assert.equal(result.sectorVersion, '1');
});

test('resolveSectorByTicker clasifica ADBE como tecnología', () => {
  assert.equal(resolveSectorByTicker('ADBE'), 'technology');
});

test('resolveSectorBySic solo admite los rangos SIC de consumo defensivo y tecnología', () => {
  assert.equal(resolveSectorBySic(2086), 'defensive_consumer');
  assert.equal(resolveSectorBySic(2100), 'defensive_consumer');
  assert.equal(resolveSectorBySic(2844), 'defensive_consumer');
  assert.equal(resolveSectorBySic(2834), null, 'las farmacéuticas no son consumo defensivo');
  assert.equal(resolveSectorBySic(3674), 'technology', 'los semiconductores son tecnología');
  assert.equal(resolveSectorBySic(3571), 'technology', 'el hardware informático es tecnología');
  assert.equal(resolveSectorBySic(7372), 'technology', 'el software es tecnología');
  assert.equal(resolveSectorBySic(7363), null, 'el staffing no es tecnología');
  assert.equal(resolveSectorBySic(7389), null, 'los servicios empresariales y pagos no son tecnología');
  assert.equal(resolveSectorBySic(3600), null, 'los equipos eléctricos y conglomerados no son tecnología');
  assert.equal(resolveSectorBySic(6021), null, 'la banca no está admitida');
});

test('profileSector no etiqueta farmacéuticas ni servicios empresariales como sectores admitidos', async () => {
  const { profileSector } = await import('../../src/services/edgar/companyProfileData.js');
  assert.equal(profileSector(2834), 'Química y farmacéutica');
  assert.notEqual(profileSector(2834), 'Consumo defensivo');
  assert.equal(profileSector(7361), 'Servicios empresariales');
  assert.notEqual(profileSector(7361), 'Servicios informáticos');
  assert.equal(profileSector(3600), 'Equipos eléctricos');
  assert.equal(profileSector(3674), 'Tecnología');
  assert.equal(profileSector(3571), 'Informática');
  assert.equal(profileSector(7372), 'Servicios informáticos');
});

test('isReadablePdfText distingue texto legible de fuentes corruptas de PDFs no oficiales', async () => {
  const { isReadablePdfText } = await import('../../src/services/pdf.service.js');
  // Simular texto de PDF con fuentes corruptas (alta proporción de caracteres no imprimibles y sin palabras clave)
  const corruptSample = ')\"\u001d(\u0019\u0018\u0001\'(\u0015(\u0019\'\n\'\u0019\u0017)&\u001d(\u001d\u0019\'\u0001\u0015\"\u0018\u0001\u0019,\u0017\u001c\u0015\"\u001b\u0019\u0001\u0017#!!\u001d\'\'\u001d#\"\n+0B78=6C>=\u0006\u0001\u0018\b\u0017\b\u0001 \t\u000f\u000e\u0013\n66666666666666666666666666666\n'.repeat(30);
  assert.equal(isReadablePdfText(corruptSample), false);

  // Texto real y limpio de un Form 10-K
  const cleanSample = 'UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. 20549 FORM 10-K ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934 For the fiscal year ended November 28, 2025 ADOBE INC. Consolidated Statements of Income Operating income Cash flows balance sheet assets liabilities'.repeat(5);
  assert.equal(isReadablePdfText(cleanSample), true);
  assert.equal(isReadablePdfText(''), false);
  assert.equal(isReadablePdfText('too short'), false);
});

test('extractStockCompensation detecta importes de remuneración en acciones en texto SEC', async () => {
  const { extractStockCompensation } = await import('../../src/agents/analyst/financialParsers.js');
  const sample = 'Operating activities:\nStock-based compensation 1,942 1,833 1,718\nOther charges';
  assert.equal(extractStockCompensation(sample), 1942);

  const sample2 = 'Share-based compensation expense   $ 450.5   380.0';
  assert.equal(extractStockCompensation(sample2), 450.5);

  assert.equal(extractStockCompensation('No stock options reported'), null);
});

test('normalizeCashFlowBlock aplica la deducción íntegra de stock options (SBC) al Cash Flow Ajustado', async () => {
  const { normalizeCashFlowBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'EBT', normal: '8891M', adjusted: '8891M' },
        { name: 'Beneficio Neto', normal: '6700M' },
      ],
    },
    cashFlow: {
      scenarios: ['Normal', 'Ajustado'],
      rows: [
        { name: 'Cash Flow', values: ['10031', '10139,2'] },
        { name: 'CAPEX', values: ['179', '179'] },
        { name: 'FCF', values: ['9852', '9960,2'] },
        { name: 'FCF/Acción', values: ['24,29 $', '24,55 $'] },
        { name: 'Dividendo', values: ['0', '0'] },
        { name: 'Libre', values: ['9852', '9960,2'] },
      ],
      notes: [],
    },
  };
  const extracted = {
    shares: 413,
    facts: {
      stockCompensation: 1942,
      incomeTaxesPaidYtd: 2219,
      incomeTaxExpenseYtd: 2000,
    },
    workingCapitalData: {
      ytdScenarios: ['Normal (WC=-166)', 'Ajustado*1 (WC=-58)'],
      ytdValues: {
        cfo: ['10031', '10139,2'],
        capex: ['179', '179'],
        fcf: ['9852', '9960,2'],
        fcfPerShare: ['24,29 $', '24,55 $'],
        dividends: ['0', '0'],
        libre: ['9852', '9960,2'],
      },
      explanationYtd: '*1: WC = (417 - 0 - 2344) x (3% + 0%) = -58M. Desviación: -108,2M. 10031M - (-108,2M) = 10139,2M.',
    },
  };

  normalizeCashFlowBlock(horizon, extracted);

  const cfoRow = horizon.cashFlow.rows.find((r) => r.name === 'Cash Flow');
  const fcfRow = horizon.cashFlow.rows.find((r) => r.name === 'FCF');
  const fcfPerShareRow = horizon.cashFlow.rows.find((r) => r.name === 'FCF/Acción');
  const libreRow = horizon.cashFlow.rows.find((r) => r.name === 'Libre');

  // Normal: 10031M.
  // WC: +108.2M -> 10139.2M
  // Tax: +174.1M -> 10313.3M
  // SBC: -1942M (importe íntegro)
  // Final CFO: 10313.3 - 1942 = 8371.3M
  assert.equal(cfoRow.values[1], '8371,3');
  assert.equal(fcfRow.values[1], '8192,3');
  assert.equal(fcfPerShareRow.values[1], '19,84 $');
  assert.equal(libreRow.values[1], '8192,3');

  const sbcNote = horizon.cashFlow.notes.find((n) => /stock options|sbc/i.test(n));
  assert.ok(sbcNote, 'Debe existir la nota de Stock Options');
  assert.match(sbcNote, /\*3:/);
  assert.match(sbcNote, /1942M/);
  assert.match(sbcNote, /-1942M/);
  assert.doesNotMatch(sbcNote, /120\s*%/);
  assert.match(sbcNote, /importe íntegro/);
  assert.match(sbcNote, /dilución efectiva del accionista/);
  assert.match(sbcNote, /10031M \+108,2M \(circulante\) \+174,1M \(impuestos\) -1942M \(stock options\)/);
});

test('normalizeCashFlowBlock asigna nota *2 a SBC cuando no hay normalización fiscal', async () => {
  const { normalizeCashFlowBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: { rows: [] },
    cashFlow: {
      scenarios: ['Normal', 'Ajustado'],
      rows: [
        { name: 'Cash Flow', values: ['5000', '4800'] },
        { name: 'CAPEX', values: ['500', '500'] },
        { name: 'FCF', values: ['4500', '4300'] },
        { name: 'FCF/Acción', values: ['4,50 $', '4,30 $'] },
        { name: 'Dividendo', values: ['0', '0'] },
        { name: 'Libre', values: ['4500', '4300'] },
      ],
      notes: [],
    },
  };
  const extracted = {
    shares: 1000,
    facts: {
      stockCompensation: 500, // importe íntegro deducido = 500
    },
    workingCapitalData: {
      ytdScenarios: ['Normal (WC=100)', 'Ajustado*1 (WC=300)'],
      ytdValues: {
        cfo: ['5000', '4800'], // WC adj: -200
        capex: ['500', '500'],
        fcf: ['4500', '4300'],
        fcfPerShare: ['4,50 $', '4,30 $'],
        dividends: ['0', '0'],
        libre: ['4500', '4300'],
      },
      explanationYtd: '*1: WC = 300M frente a 100M: -200M.',
    },
  };

  normalizeCashFlowBlock(horizon, extracted);

  const cfoRow = horizon.cashFlow.rows.find((r) => r.name === 'Cash Flow');
  const fcfRow = horizon.cashFlow.rows.find((r) => r.name === 'FCF');
  // 5000 - 200 (WC) - 500 (SBC) = 4300
  assert.equal(cfoRow.values[1], '4300');
  assert.equal(fcfRow.values[1], '3800');
  assert.equal(cfoRow.cashFlowAdjustedNote, '*2');

  const sbcNote = horizon.cashFlow.notes.find((n) => /stock options|sbc/i.test(n));
  assert.ok(sbcNote, 'Debe existir la nota de Stock Options');
  assert.match(sbcNote, /^\*2:/);
  assert.match(sbcNote, /500M/);
  assert.match(sbcNote, /-500M/);
  assert.match(sbcNote, /5000M -200M \(circulante\) -500M \(stock options\)/);
});

test('buildWorkingCapitalDataFallback calcula el circulante para tecnología usando el crecimiento de ventas y no volumen plano (caso NVDA)', async () => {
  const { buildWorkingCapitalDataFallback } = await import('../../src/agents/analyst/capitalAllocationHelpers.js');
  const extracted = {
    ticker: 'NVDA',
    sector: 'technology',
    balance: {
      accountsPayable: 9812,
      inventories: 21403,
      accountsReceivable: 38466,
    },
    cashFlow: {
      operating: 102718,
      capex: 6042,
      dividends: 974,
    },
    shares: 24500,
    ytd: {
      sales: 130497,
      prev: { sales: 60922 },
      months: 12,
    },
    workingCapital: {
      reportedChangeYtd: -15949,
    },
  };

  const wcData = buildWorkingCapitalDataFallback(extracted, 'es', 'technology');
  assert.ok(wcData, 'Debe generar datos de capital circulante');
  assert.match(wcData.explanationYtd, /crecimiento de ventas/i);
  assert.match(wcData.explanationYtd, /114,2\s*%/);
  assert.doesNotMatch(wcData.explanationYtd, /inflación \+ volumen/i);
  assert.doesNotMatch(wcData.explanationYtd, /\(3%\s*\+\s*0%\)/);

  // Verificación en inglés
  const wcDataEn = buildWorkingCapitalDataFallback(extracted, 'en', 'technology');
  assert.match(wcDataEn.explanationYtd, /sales growth/i);
  assert.match(wcDataEn.explanationYtd, /114\.2\s*%/);
  assert.doesNotMatch(wcDataEn.explanationYtd, /inflation \+ volume/i);
});

test('el circulante usa siempre la media histórica de 10 años, incluso con volumen reportado', async () => {
  const { buildWorkingCapitalDataFallback } = await import('../../src/agents/analyst/capitalAllocationHelpers.js');
  // Ejemplo del usuario: CFO 80.000M con ΔWC −20.000M => base 100.000M y peso del −20 %.
  const baseExtracted = {
    ticker: 'NVDA',
    sector: 'technology',
    cashFlow: { operating: 80000, capex: 5000, dividends: 0 },
    workingCapital: { reportedChangeYtd: -20000 },
    balance: { inventories: 1000, accountsPayable: 1500, accountsReceivable: 800 },
    // 10 ejercicios con peso constante del −20 % (ΔWC = −CFO/4 => ΔWC/(CFO−ΔWC) = −20 %).
    workingCapitalHistory: [
      { year: 2026, cfo: 80000, wcChange: -20000 },
      { year: 2025, cfo: 70000, wcChange: -17500 },
      { year: 2024, cfo: 60000, wcChange: -15000 },
      { year: 2023, cfo: 50000, wcChange: -12500 },
      { year: 2022, cfo: 40000, wcChange: -10000 },
      { year: 2021, cfo: 30000, wcChange: -7500 },
      { year: 2020, cfo: 20000, wcChange: -5000 },
      { year: 2019, cfo: 15000, wcChange: -3750 },
      { year: 2018, cfo: 10000, wcChange: -2500 },
      { year: 2017, cfo: 5000, wcChange: -1250 },
    ],
    shares: 1000,
    ytd: { sales: 200000, prev: { sales: 120000 }, months: 12 },
  };

  // Tecnología: siempre método histórico cuando hay serie suficiente.
  const tech = buildWorkingCapitalDataFallback(baseExtracted, 'es', 'technology');
  assert.match(tech.explanationYtd, /peso agregado/);
  assert.match(tech.explanationYtd, /10 ejercicios/);
  assert.match(tech.explanationYtd, /-20%/);
  assert.match(tech.explanationYtd, /-20000M en el periodo/);
  assert.deepEqual(tech.ytdScenarios, ['Normal (WC=-20000)', 'Ajustado*1 (WC=-20000)']);

  // Consumo defensivo sin dato de volumen: mismo método.
  const consumerNoVolume = buildWorkingCapitalDataFallback(
    { ...baseExtracted, workingCapital: { ...baseExtracted.workingCapital, volumeGrowth: 0 } },
    'es',
    'defensive_consumer',
  );
  assert.match(consumerNoVolume.explanationYtd, /peso agregado/);
  assert.match(consumerNoVolume.explanationYtd, /10 ejercicios/);
  assert.doesNotMatch(consumerNoVolume.explanationYtd, /inflación \+ volumen/);

  // Consumo defensivo con volumen reportado: el método histórico es el único (WC_METHOD=historical).
  const consumerVolume = buildWorkingCapitalDataFallback(
    { ...baseExtracted, workingCapital: { ...baseExtracted.workingCapital, volumeGrowth: 2, inflationRate: 3 } },
    'es',
    'defensive_consumer',
  );
  assert.match(consumerVolume.explanationYtd, /peso agregado/);
  assert.match(consumerVolume.explanationYtd, /10 ejercicios/);
  assert.doesNotMatch(consumerVolume.explanationYtd, /inflación \+ volumen/);

  // En inglés el método histórico también se traduce.
  const techEn = buildWorkingCapitalDataFallback(baseExtracted, 'en', 'technology');
  assert.match(techEn.explanationYtd, /aggregate share/);
  assert.match(techEn.explanationYtd, /10 fiscal years/);
});

test('WC_METHOD=formula restaura el comportamiento anterior (inflación + volumen con volumen reportado)', async () => {
  const { buildWorkingCapitalDataFallback } = await import('../../src/agents/analyst/capitalAllocationHelpers.js');
  const extracted = {
    ticker: 'KHC',
    sector: 'defensive_consumer',
    cashFlow: { operating: 4462, capex: 1000, dividends: 500 },
    workingCapital: { reportedChangeYtd: -19, volumeGrowth: 2, inflationRate: 3 },
    balance: { inventories: 1000, accountsPayable: 1500, accountsReceivable: 800 },
    workingCapitalHistory: [
      { year: 2025, cfo: 80000, wcChange: -20000 },
      { year: 2024, cfo: 70000, wcChange: -17500 },
      { year: 2023, cfo: 60000, wcChange: -15000 },
    ],
    shares: 1000,
    ytd: { sales: 200000, prev: { sales: 120000 }, months: 12 },
  };
  process.env.WC_METHOD = 'formula';
  try {
    const result = buildWorkingCapitalDataFallback(extracted, 'es', 'defensive_consumer');
    assert.match(result.explanationYtd, /inflación \+ volumen/);
    assert.match(result.explanationYtd, /3% \+ 2%/);
    assert.doesNotMatch(result.explanationYtd, /peso agregado/);
  } finally {
    delete process.env.WC_METHOD;
  }
});

test('el circulante trimestral usa la media histórica prorrateada (Q1 1/4, Q2 2/4, Q3 3/4)', async () => {
  const { buildWorkingCapitalDataFallback } = await import('../../src/agents/analyst/capitalAllocationHelpers.js');
  const history = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017].map((year) => ({
    year,
    cfo: 80000,
    wcChange: -20000,
  }));
  const makeExtracted = (months, quarter) => ({
    ticker: 'KHC',
    sector: 'defensive_consumer',
    cashFlow: { operating: 30000, capex: 2000, dividends: 500 },
    workingCapital: { reportedChangeYtd: -6000, reportedChangeQuarter: -2500 },
    balance: { inventories: 1000, accountsPayable: 1500, accountsReceivable: 800 },
    workingCapitalHistory: history,
    shares: 1000,
    fiscalQuarter: quarter,
    ytd: { sales: 200000, prev: { sales: 120000 }, months },
    deducedQuarterCashFlow: months > 3 ? { cfo: 8000, capex: 500, dividends: 100 } : null,
  });

  const q1 = buildWorkingCapitalDataFallback(makeExtracted(3, 1), 'es', 'defensive_consumer');
  assert.match(q1.explanationYtd, /-20% × 100000M/);
  assert.match(q1.explanationYtd, /-20000M en todo el año/);
  assert.match(q1.explanationYtd, /en 3 meses = -5000M/);
  assert.deepEqual(q1.ytdScenarios, ['Normal (WC=-6000)', 'Ajustado*1 (WC=-5000)']);
  assert.deepEqual(q1.quarterScenarios, ['Normal (WC=-2500)', 'Ajustado*1 (WC=-5000)']);

  const q2 = buildWorkingCapitalDataFallback(makeExtracted(6, 2), 'es', 'defensive_consumer');
  assert.match(q2.explanationYtd, /flujo anual de 2026/);
  assert.match(q2.explanationYtd, /en 6 meses = -10000M/);
  assert.deepEqual(q2.ytdScenarios, ['Normal (WC=-6000)', 'Ajustado*1 (WC=-10000)']);
  assert.match(q2.explanation3M, /en 3 meses = -5000M/);
  assert.deepEqual(q2.quarterScenarios, ['Normal (WC=-2500)', 'Ajustado*1 (WC=-5000)']);

  const q3 = buildWorkingCapitalDataFallback(makeExtracted(9, 3), 'es', 'defensive_consumer');
  assert.match(q3.explanationYtd, /en 9 meses = -15000M/);
  assert.deepEqual(q3.ytdScenarios, ['Normal (WC=-6000)', 'Ajustado*1 (WC=-15000)']);
  assert.match(q3.explanation3M, /en 3 meses = -5000M/);
});

test('la política sectorial de tecnología no suma la amortización ni el deterioro de intangibles y sí el de fondo de comercio; la de consumo suma ambas', async () => {
  const { getSectorPolicy, buildSectorPolicyDirective } = await import('../../src/agents/analyst/sectorPolicy.js');

  assert.equal(getSectorPolicy('technology').intangibleAmortizationAddBack, false);
  assert.equal(getSectorPolicy('technology').goodwillImpairmentAddBack, true);
  assert.equal(getSectorPolicy('technology').intangibleImpairmentAddBack, false);
  assert.equal(getSectorPolicy('defensive_consumer').intangibleAmortizationAddBack, true);
  assert.equal(getSectorPolicy('defensive_consumer').goodwillImpairmentAddBack, true);
  assert.equal(getSectorPolicy('defensive_consumer').intangibleImpairmentAddBack, true);

  const techDirective = buildSectorPolicyDirective('technology');
  assert.match(techDirective, /NO se suma de vuelta/);
  assert.match(techDirective, /intangiblesAmortization/);
  assert.match(techDirective, /Deterioro de fondo de comercio[\s\S]*SÍ se suma de vuelta/);
  assert.match(techDirective, /Deterioro de intangibles[\s\S]*NO se suma de vuelta/);

  const consumerDirective = buildSectorPolicyDirective('defensive_consumer');
  assert.match(consumerDirective, /Amortización recurrente de intangibles: SÍ se suma de vuelta/);
  assert.match(consumerDirective, /Deterioro de fondo de comercio[\s\S]*SÍ se suma de vuelta/);
  assert.match(consumerDirective, /Deterioro de intangibles[\s\S]*SÍ se suma de vuelta/);
});

test('normalizeSalesBlock revierte la amortización de intangibles sumada por el modelo en tecnología', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const buildHorizon = () => ({
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'Beneficio Operativo', normal: '1000M', adjusted: '1600M' },
        { name: 'EBT', normal: '900M', adjusted: '1500M' },
        { name: 'Beneficio Neto', normal: '700M', adjusted: '1162M' },
      ],
      notes: [],
    },
  });
  const extracted = { facts: { intangiblesAmortizationYtd: 600 } };

  const techHorizon = buildHorizon();
  normalizeSalesBlock(techHorizon, extracted, 'es', 'technology');
  const techRows = Object.fromEntries(techHorizon.sales.rows.map((r) => [r.name, r]));
  assert.equal(techRows['Beneficio Operativo'].adjusted, '1000M');
  assert.equal(techRows['EBT'].adjusted, '900M');
  assert.equal(techRows['Beneficio Neto'].adjusted, '700M');
  assert.equal(techRows['Beneficio Operativo'].isAdjusted, false);
  assert.equal(techRows['Beneficio Operativo'].adjustedNote, undefined);

  // Consumo defensivo mantiene el ajuste (política actual)
  const consumerHorizon = buildHorizon();
  normalizeSalesBlock(consumerHorizon, extracted, 'es', 'defensive_consumer');
  const consumerRows = Object.fromEntries(consumerHorizon.sales.rows.map((r) => [r.name, r]));
  assert.equal(consumerRows['Beneficio Operativo'].adjusted, '1600M');
  assert.equal(consumerRows['EBT'].adjusted, '1500M');
  assert.equal(consumerRows['Beneficio Neto'].adjusted, '1162M');
});

test('normalizeSalesBlock revierte el deterioro de intangibles sin desglose en tecnología y mantiene el de fondo de comercio con desglose', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const buildHorizon = (adjustedValues = {}) => ({
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'Beneficio Operativo', normal: '1000M', adjusted: adjustedValues.op ?? '1800M' },
        { name: 'EBT', normal: '900M', adjusted: adjustedValues.ebt ?? '1700M' },
        { name: 'Beneficio Neto', normal: '700M', adjusted: adjustedValues.net ?? '1316M' },
      ],
      notes: [],
    },
  });

  // Sin desglose: la política conservadora no puede atribuir el total al fondo de
  // comercio, así que se revierte el deterioro agregado y la amortización.
  const noSplitHorizon = buildHorizon();
  normalizeSalesBlock(noSplitHorizon, { facts: { impairmentsYtd: 200, intangiblesAmortizationYtd: 600 } }, 'es', 'technology');
  const noSplitRows = Object.fromEntries(noSplitHorizon.sales.rows.map((r) => [r.name, r]));
  assert.equal(noSplitRows['Beneficio Operativo'].adjusted, '1000M');
  assert.equal(noSplitRows['EBT'].adjusted, '900M');
  assert.equal(noSplitRows['Beneficio Neto'].adjusted, '700M');
  assert.equal(noSplitRows['Beneficio Operativo'].isAdjusted, false);

  // Con desglose: se mantiene el deterioro de fondo de comercio (200), se revierte
  // el de intangibles (300) y la amortización (600).
  const splitHorizon = buildHorizon({
    op: '2100M', // 1000 + 200 (goodwill) + 300 (intangibles) + 600 (amortización)
    ebt: '2000M',
    net: '1547M', // 700 + (200 + 300 + 600) × 0,77
  });
  const extracted = {
    facts: {
      goodwillImpairmentYtd: 200,
      intangibleImpairmentYtd: 300,
      intangiblesAmortizationYtd: 600,
    },
  };
  normalizeSalesBlock(splitHorizon, extracted, 'es', 'technology');
  const splitRows = Object.fromEntries(splitHorizon.sales.rows.map((r) => [r.name, r]));
  assert.equal(splitRows['Beneficio Operativo'].adjusted, '1200M');
  assert.equal(splitRows['EBT'].adjusted, '1100M');
  assert.equal(splitRows['Beneficio Neto'].adjusted, '854M');
  assert.equal(splitRows['Beneficio Operativo'].isAdjusted, true);

  // Consumo defensivo sigue sumando de vuelta ambos deterioros
  const consumerHorizon = buildHorizon({ op: '1500M', ebt: '1400M', net: '1085M' });
  normalizeSalesBlock(consumerHorizon, extracted, 'es', 'defensive_consumer');
  const consumerRows = Object.fromEntries(consumerHorizon.sales.rows.map((r) => [r.name, r]));
  assert.equal(consumerRows['Beneficio Operativo'].adjusted, '1500M');
  assert.equal(consumerRows['EBT'].adjusted, '1400M');
  assert.equal(consumerRows['Beneficio Neto'].adjusted, '1085M');
});

test('normalizeSalesBlock no revierte el deterioro de intangibles del periodo anterior en tecnología', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        // El modelo sumó el deterioro previo total (500 goodwill + 700 intangibles) al comparativo
        { name: 'Beneficio Operativo', normal: '1000M', prevNormal: '900M', prevAdjusted: '2100M' },
        { name: 'EBT', normal: '900M', prevNormal: '800M', prevAdjusted: '2000M' },
        { name: 'Beneficio Neto', normal: '700M', prevNormal: '600M', prevAdjusted: '1540M' },
      ],
      notes: [],
    },
  };
  const extracted = {
    facts: {
      goodwillImpairmentPrevYtd: 500,
      intangibleImpairmentPrevYtd: 700,
    },
  };

  normalizeSalesBlock(horizon, extracted, 'es', 'technology');
  const rows = Object.fromEntries(horizon.sales.rows.map((r) => [r.name, r]));
  // Solo se conserva el deterioro de fondo de comercio del año anterior: 900 + 500
  assert.equal(rows['Beneficio Operativo'].prevAdjusted, '1400M');
  assert.equal(rows['EBT'].prevAdjusted, '1300M');
  assert.equal(rows['Beneficio Neto'].prevAdjusted, '1001M');
});

test('renderNotesSsr, renderNotes y buildNotes coordinan el color de *2 y *3 en Cash Flow', async () => {
  const { renderNotesSsr } = await import('../../src/services/seo/reportSsrHtml.js');
  const { buildNotes } = await import('../../src/services/reportExport/reportSections.js');

  const notes = [
    '*1: WC = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (crecimiento de ventas)...',
    '*2: Impuestos: La empresa debería haber pagado 32533,5M en impuestos...',
    '*3: Stock Options / Compensación en acciones (SBC): La empresa reporta 6386M...',
  ];

  // 1. SSR HTML
  const ssrHtml = renderNotesSsr(notes, { isCashFlow: true });
  assert.match(ssrHtml, /<mark class="highlight-note highlight-c1">\*1:<\/mark>/);
  assert.match(ssrHtml, /<mark class="highlight-note highlight-c2">\*2:<\/mark>/);
  assert.match(ssrHtml, /<mark class="highlight-note highlight-c2">\*3:<\/mark>/, 'La nota *3 debe tener highlight-c2 al compartir casilla con *2');

  // 2. Export / buildNotes
  const exported = buildNotes(notes, { isCashFlow: true });
  assert.equal(exported[0].marker, '*1:');
  assert.equal(exported[0].bg, '#fef08a'); // Color 1
  assert.equal(exported[1].marker, '*2:');
  assert.equal(exported[1].bg, '#fed7aa'); // Color 2
  assert.equal(exported[2].marker, '*3:');
  assert.equal(exported[2].bg, '#fed7aa', 'La nota *3 de exportación debe tener el mismo fondo que la nota *2');
  assert.equal(exported[2].color, '#c2410c');
});



