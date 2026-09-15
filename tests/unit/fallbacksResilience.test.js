import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries } from '../../src/services/edgar/factsSeries.js';
import {
  extractTaxCashFlowAdjustment,
  extractIncomeTaxesPaid,
  extractCapitalCashFlowFacts,
  extractRemainingAuthorization,
  extractRepurchaseProgramTerms,
  extractRepurchaseFactsFromText,
  extractExecutiveChangesFromText,
} from '../../src/agents/analyst/financialParsersExtract.js';
import { buildWorkingCapitalDataFallback } from '../../src/agents/analyst/capitalAllocationHelpers.js';
import { normalizeCashFlowBlock } from '../../src/agents/analyst/analystCashCapitalProcessor.js';
import { normalizeSalesBlock } from '../../src/agents/analyst/analystSalesProcessor.js';
import { buildMaturityScheduleFromDebtTable } from '../../src/agents/analyst/debtMaturityFallback.js';
import { buildDebtMaturityModel } from '../../src/services/reportExport/debtMaturityModel.js';
import { buildDebtMaturitiesFromFacts, extractDebtWeightedAverageRateFromFacts } from '../../src/services/edgar/debtMaturities.js';
import { processRepurchasesSection, processExecutiveChangesSection } from '../../src/agents/analyst/annualConclusionCeoRepurchases.js';

function annualEntry(tag, val) {
  return { start: '2023-01-01', end: '2023-12-31', val, frame: 'CY2023', fp: 'FY', form: '10-K', filed: '2024-02-01', tag };
}

test('buildSeries deriva GrossProfit cuando la etiqueta GrossProfit falta pero existen Revenue y CostOfRevenue', () => {
  const fixture = {
    facts: {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: { USD: [annualEntry('RevenueFromContractWithCustomerExcludingAssessedTax', 1500)] },
        },
        CostOfGoodsAndServicesSold: {
          units: { USD: [annualEntry('CostOfGoodsAndServicesSold', 900)] },
        },
      },
    },
  };
  const { annual } = buildSeries(fixture);
  assert.equal(annual.length, 1);
  assert.equal(annual[0].values.revenue, 1500);
  assert.equal(annual[0].values.costOfRevenue, -900);
  assert.equal(annual[0].values.grossProfit, 600);
});

test('buildSeries toma PaymentsForCapitalImprovements como capex si PaymentsToAcquirePropertyPlantAndEquipment no existe (caso utilities / NextEra)', () => {
  const fixture = {
    facts: {
      'us-gaap': {
        NetCashProvidedByUsedInOperatingActivities: {
          units: { USD: [annualEntry('NetCashProvidedByUsedInOperatingActivities', 2500)] },
        },
        PaymentsForCapitalImprovements: {
          units: { USD: [annualEntry('PaymentsForCapitalImprovements', 800)] },
        },
      },
    },
  };
  const { annual } = buildSeries(fixture);
  assert.equal(annual[0].values.cfo, 2500);
  assert.equal(annual[0].values.capex, -800);
  assert.equal(annual[0].values.freeCashFlow, 1700);
});

test('buildSeries asigna GrossProfit igual a Revenue cuando la empresa no desglosa CostOfRevenue (software/servicios)', () => {
  const fixture = {
    facts: {
      'us-gaap': {
        SalesRevenueNet: {
          units: { USD: [annualEntry('SalesRevenueNet', 500)] },
        },
      },
    },
  };
  const { annual } = buildSeries(fixture);
  assert.equal(annual[0].values.revenue, 500);
  assert.equal(annual[0].values.grossProfit, 500);
});

test('extractCapitalCashFlowFacts extrae recompras, inversiones y adquisiciones con frases alternativas de 10-K', () => {
  const filingSample = `
    CONSOLIDATED STATEMENTS OF CASH FLOWS
    Operating activities:
    Net income $ 1,200
    Net cash provided by operating activities 1,800
    Investing activities:
    Purchases of available-for-sale securities (450)
    Proceeds from maturities and sales of marketable securities 320
    Payments to acquire businesses, net of cash acquired (680)
    Proceeds from sale of property, plant and equipment 55
    Financing activities:
    Payments for repurchase of common stock (890)
    Payments of dividends (310)
  `;

  const facts = extractCapitalCashFlowFacts(filingSample);
  assert.equal(facts.shareBuybacks, -890);
  assert.equal(facts.purchasesOfMarketableSecurities, -450);
  assert.equal(facts.proceedsFromSaleOfMarketableSecurities, 320);
  assert.equal(facts.acquisitionsOfBusiness, -680);
  assert.equal(facts.proceedsFromAssetSales, 55);
});

test('extractIncomeTaxesPaid y extractTaxCashFlowAdjustment reconocen variantes de redacción', () => {
  const textSample = `
    Supplemental cash flow information:
    Income taxes paid, net of refunds $ 245
    Deferred income taxes and other (78)
  `;
  const taxesPaid = extractIncomeTaxesPaid(textSample);
  const taxAdj = extractTaxCashFlowAdjustment(textSample);
  assert.equal(taxesPaid, 245);
  assert.equal(taxAdj, -78);
});

test('extractRemainingAuthorization reconoce remanentes bajo el programa de recompra', () => {
  const text1 = 'As of December 31, 2023, approximately $ 2.5 billion remained available under its share repurchase program.';
  const text2 = 'The Company had remaining repurchase authorization of $850 million at year end.';
  assert.equal(extractRemainingAuthorization(text1), 2500);
  assert.equal(extractRemainingAuthorization(text2), 850);
});

test('buildWorkingCapitalDataFallback genera escenarios incluso si no hay capex o dividendos explícitos', () => {
  const extracted = {
    cashFlow: { operating: 1200 },
    balance: { inventories: 300, accountsPayable: 400, accountsReceivable: 250 },
    workingCapital: { inflationRate: 2.5, volumeGrowth: 1.0, reportedChangeYtd: 30 },
    shares: 100,
    ytd: { months: 12 },
  };

  const wc = buildWorkingCapitalDataFallback(extracted);
  assert.ok(wc);
  assert.ok(wc.ytdValues);
  assert.equal(wc.ytdValues.cfo[0], '1200');
  assert.equal(wc.ytdValues.capex[0], '0');
  assert.equal(wc.ytdValues.fcf[0], '1200');
  assert.equal(wc.ytdValues.fcfPerShare[0], '12,00 $');
});

test('normalizeCashFlowBlock rellena valores con fallbacks en lugar de dejar guiones', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: {
      scenarios: ['Normal', 'Ajustado'],
      rows: [
        { name: 'Cash Flow', values: ['—', '—'] },
        { name: 'CAPEX', values: ['—', '—'] },
        { name: 'FCF', values: ['—', '—'] },
        { name: 'FCF/Acción', values: ['—', '—'] },
        { name: 'Dividendo', values: ['—', '—'] },
        { name: 'Libre', values: ['—', '—'] },
      ],
    },
  };
  const extracted = {
    cashFlow: { operating: 500, capex: 100, dividends: 50 },
    shares: 50,
  };

  normalizeCashFlowBlock(horizon, extracted);

  const cfoRow = horizon.cashFlow.rows.find((r) => r.name === 'Cash Flow');
  const capexRow = horizon.cashFlow.rows.find((r) => r.name === 'CAPEX');
  const fcfRow = horizon.cashFlow.rows.find((r) => r.name === 'FCF');
  const libreRow = horizon.cashFlow.rows.find((r) => r.name === 'Libre');

  assert.equal(cfoRow.values[0], '500');
  assert.equal(capexRow.values[0], '100');
  assert.equal(fcfRow.values[0], '400');
  assert.equal(libreRow.values[0], '350');
});

test('normalizeSalesBlock rescata métricas faltantes con derivaciones lógicas', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'Ventas', normal: '—', prevNormal: '—' },
        { name: 'Margen Bruto', normal: '—', prevNormal: '—' },
        { name: 'Beneficio Operativo', normal: '—', prevNormal: '—' },
      ],
    },
  };
  const extracted = {
    ytd: {
      sales: 2000,
      cogs: 1200,
      ebt: 350,
      prev: { sales: 1800, cogs: 1100, ebt: 300 },
    },
  };

  normalizeSalesBlock(horizon, extracted);

  const salesRow = horizon.sales.rows.find((r) => r.name === 'Ventas');
  const grossRow = horizon.sales.rows.find((r) => r.name === 'Margen Bruto');
  const opRow = horizon.sales.rows.find((r) => r.name === 'Beneficio Operativo');

  assert.equal(salesRow.normal, '2000M');
  assert.equal(salesRow.prevNormal, '1800M');
  assert.equal(grossRow.normal, '800M'); // 2000 - 1200
  assert.equal(grossRow.prevNormal, '700M'); // 1800 - 1100
  assert.equal(opRow.normal, '350M'); // Fallback to ebt
  assert.equal(opRow.prevNormal, '300M');
});

test('buildMaturityScheduleFromDebtTable acumula filas Thereafter en afterYearFive y extrae cupones en columnas numéricas', () => {
  const table = {
    headers: ['Obligación', 'Vencimiento', 'Interest Rate', '2024'],
    rows: [
      ['Senior Notes A', '2025', '3.50', '$500'],
      ['Senior Notes B', '2026', '4.25', '$750'],
      ['Senior Notes C', '2027', '5.00', '$1,000'],
      ['Senior Notes D', '2028', '4.75', '$800'],
      ['Senior Notes E', '2029', '5.25', '$600'],
      ['Thereafter', '', '4.50', '$2,500'],
      ['Total', '', '', '$6,150'],
    ],
  };

  const schedule = buildMaturityScheduleFromDebtTable(table, 2024);
  assert.ok(schedule);
  assert.equal(schedule.items.length, 5);
  assert.equal(schedule.items[0].year, 2025);
  assert.equal(schedule.items[0].rate, 3.5);
  assert.equal(schedule.items[1].rate, 4.25);
  assert.equal(schedule.afterYearFive, 2500);
});

test('buildDebtMaturityModel asigna totalAverageRate a los años cuando los ítems carecen de cupón individual', () => {
  const debt = {
    maturitySchedule: [
      { year: 2025, amount: 500 },
      { year: 2026, amount: 800 },
    ],
    allDebtAverageRate: 4.25,
  };

  const model = buildDebtMaturityModel(debt, 2024);
  assert.ok(model);
  assert.equal(model.totalAverageRate, 4.25);
  assert.equal(model.years[0].averageRate, 4.25);
  assert.equal(model.years[0].averageRateEstimated, true);
  assert.equal(model.years[1].averageRate, 4.25);
  assert.equal(model.years[1].averageRateEstimated, true);
});

test('buildDebtMaturitiesFromFacts extrae weightedAverageRate de Company Facts us-gaap', () => {
  const fixture = {
    facts: {
      'us-gaap': {
        LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths: {
          units: { USD: [{ end: '2024-12-31', filed: '2025-02-15', form: '10-K', val: 500000000 }] },
        },
        LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo: {
          units: { USD: [{ end: '2024-12-31', filed: '2025-02-15', form: '10-K', val: 750000000 }] },
        },
        DebtWeightedAverageInterestRate: {
          units: { pure: [{ end: '2024-12-31', filed: '2025-02-15', form: '10-K', val: 0.0435 }] },
        },
      },
    },
  };

  const result = buildDebtMaturitiesFromFacts(fixture);
  assert.ok(result);
  assert.equal(result.weightedAverageRate, 4.35);
  assert.equal(result.years.length, 2);
});

test('processRepurchasesSection preserva las recompras si hay remanente o compras activas aunque el porcentaje sea bajo', () => {
  const conclusion = {
    repurchases: {
      text: 'La compañía cuenta con un programa activo.',
      authorizationRemaining: 'Unos 1.200M de $ pendientes',
    },
  };
  const rawAnn = {
    repurchases: {
      programRemaining: 1200,
      sharesRepurchasedAnnual: 1.5,
      averagePrice: 100,
      aggregateCost: 150,
    },
  };
  const extracted = {
    facts: { shareBuybacks: 150 },
    capitalAllocationData: { ytd: { buybacks: 150 } },
  };

  processRepurchasesSection(conclusion, rawAnn, extracted);
  assert.ok(conclusion.repurchases, 'No debe eliminarse el programa de recompras');
  assert.equal(conclusion.repurchases.programRemaining, 1200);
});

test('processExecutiveChangesSection normaliza transiciones de CEO, CFO y cúpula directiva sin perder datos', () => {
  const conclusion = {
    executiveChanges: {
      title: 'Cambios en la dirección',
      changes: [
        {
          role: 'CFO',
          text: 'John Doe asumió como Chief Financial Officer sucediendo a Jane Smith.',
          oldExecutive: { name: 'Jane Smith' },
          newExecutive: { name: 'John Doe' },
        },
      ],
    },
  };
  const rawAnn = {
    executiveChanges: [
      {
        role: 'Chief Financial Officer',
        occurred: true,
        reason: 'Jubilación',
        oldExecutive: { name: 'Jane Smith', role: 'CFO (2018-2024)' },
        newExecutive: { name: 'John Doe', origin: 'VP Finance' },
      },
    ],
  };

  processExecutiveChangesSection(conclusion, rawAnn);
  assert.ok(conclusion.executiveChanges);
  assert.equal(conclusion.executiveChanges.changes.length, 1);
  const c = conclusion.executiveChanges.changes[0];
  assert.equal(c.role, 'CFO');
  assert.equal(c.oldExecutive.name, 'Jane Smith');
  assert.equal(c.newExecutive.name, 'John Doe');
  assert.equal(c.newExecutive.origin, 'VP Finance');
  assert.equal(c.reason, 'Jubilación');
});

test('extractRepurchaseFactsFromText y extractExecutiveChangesFromText extraen datos cuantitativos y directivos del texto de filings', () => {
  const filingText = `
    Item 5. Market for Registrant's Common Equity
    During 2024, the Company repurchased 14.5 million shares of common stock at an average per-share price of $62.50, for an aggregate purchase price of $906 million.
    
    Item 5.02 Departure of Directors or Certain Officers
    On October 12, 2024, the Company announced that Jane Roe was appointed Chief Financial Officer, effective November 1, 2024, succeeding Richard Roe who retired as CFO.
  `;

  const repurchaseFacts = extractRepurchaseFactsFromText(filingText);
  assert.equal(repurchaseFacts.sharesRepurchasedAnnual, 14.5);
  assert.equal(repurchaseFacts.averagePrice, 62.5);
  assert.equal(repurchaseFacts.aggregateCost, 906);

  const execChanges = extractExecutiveChangesFromText(filingText);
  assert.ok(execChanges.length > 0);
  assert.equal(execChanges[0].role, 'CFO');
  assert.ok(execChanges[0].text.includes('Chief Financial Officer'));
  assert.equal(execChanges[0].newExecutive?.name, 'Jane Roe');
  assert.equal(execChanges[0].oldExecutive?.name, 'Richard Roe');
  assert.equal(execChanges[0].reason, 'Retiro / Jubilación');
});
