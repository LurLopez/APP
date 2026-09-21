import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries } from '../../src/services/edgar/factsSeries.js';
import {
  extractTaxCashFlowAdjustment,
  extractIncomeTaxesPaid,
  extractDebtCashFlow,
  extractCapitalCashFlowFacts,
  extractRemainingAuthorization,
  extractRepurchaseProgramTerms,
  extractRepurchaseFactsFromText,
  extractExecutiveChangesFromText,
  isStaleExecutiveChange,
} from '../../src/agents/analyst/financialParsersExtract.js';
import { buildWorkingCapitalDataFallback } from '../../src/agents/analyst/capitalAllocationHelpers.js';
import { getTaxNormalizationData } from '../../src/agents/analyst/dividendHistoryBuilders.js';
import { normalizeCashFlowBlock } from '../../src/agents/analyst/analystCashCapitalProcessor.js';
import { normalizeSalesBlock } from '../../src/agents/analyst/analystSalesProcessor.js';
import { buildMaturityScheduleFromDebtTable } from '../../src/agents/analyst/debtMaturityFallback.js';
import { buildDebtMaturityModel } from '../../src/services/reportExport/debtMaturityModel.js';
import { buildDebtMaturitiesFromFacts, extractDebtWeightedAverageRateFromFacts } from '../../src/services/edgar/debtMaturities.js';
import { processRepurchasesSection, processExecutiveChangesSection } from '../../src/agents/analyst/annualConclusionCeoRepurchases.js';
import { applyExecutiveChangesFallback } from '../../src/agents/analyst/analystRunSteps.js';

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

test('extractIncomeTaxesPaid toma el total de la tabla ASU y no el año de la cabecera', () => {
  const asuTable = `
    Income taxes paid, net of refunds, were:
    2026 \t2025 \t2024
    US federal \t$ \t112.2 $ \t150.3 $ \t263.7
    US state and local \t36.8 \t31.2 \t46.8
    Foreign
    Canada \t4.1 \t23.1 \t*
    Mexico \t20.0 \t22.5 \t21.4
    Other \t0.3 \t0.7 \t11.4
    24.4 \t46.3 \t32.8
    Total \t$ \t173.4 $ \t227.8 $ \t343.3
    * The amount of income taxes paid in this jurisdiction during the year were less than 5%
  `;
  assert.equal(extractIncomeTaxesPaid(asuTable), 173.4);
});

test('extractIncomeTaxesPaid no confunde el año de la cabecera con el importe pagado', () => {
  assert.equal(extractIncomeTaxesPaid('Income taxes paid, net of refunds, were: 2026 2025 2024'), null);
});

test('getTaxNormalizationData descarta un valor de impuestos igual al año fiscal (caso CAG FY2026)', () => {
  const asuTable = `
    Income taxes paid, net of refunds, were:
    2026 \t2025 \t2024
    US federal \t$ \t112.2 $ \t150.3 $ \t263.7
    Total \t$ \t173.4 $ \t227.8 $ \t343.3
  `;
  const horizon = {
    sales: {
      rows: [
        { name: 'EBT', normal: '1148,3', adjusted: '1148,3' },
        { name: 'Beneficio Neto', normal: '900', adjusted: '900' },
      ],
    },
  };
  const extracted = {
    facts: { incomeTaxesPaidYtd: 2026 },
    fiscalYear: 2026,
    reportingPeriod: '2026-05-31',
    _rawText: asuTable,
  };
  const result = getTaxNormalizationData({ extracted, horizon, isTrimestral: false });
  assert.ok(result);
  assert.equal(result.cashTaxesPaid, 173.4);
  assert.equal(result.normalizedCashTaxes, 264.1);
  assert.equal(result.adjustment, -90.7);
});

test('extractDebtCashFlow localiza la sección con encabezado en mayúsculas y neto "provided by/(used for)"', () => {
  const sample = `
    (in millions, except per share data)
    CASH FLOWS FROM FINANCING ACTIVITIES:
    Repayments of long-term debt \t(2,981) \t(676)
    Proceeds from issuance of long-term debt \t1,152 \t1,620
    Dividends paid \t(949) \t(951)
    Other financing activities, net \t(77) \t19
    Net cash provided by/(used for) financing activities \t(2,882) \t(423)
  `;
  assert.equal(extractDebtCashFlow(sample), -1829);
});

test('extractDebtCashFlow convierte a millones cuando el estado va en miles (caso HRL)', () => {
  const sample = `
    CONDENSED CONSOLIDATED STATEMENTS OF CASH FLOWS (In thousands)
    Financing Activities
    Repayments of Long-term Debt and Finance Leases \t(5,425) \t(6,250)
    Dividends Paid on Common Stock \t(481,401) \t(473,692)
    Net Cash Provided by (Used in) Financing Activities \t(488,435) \t(455,884)
  `;
  assert.equal(extractDebtCashFlow(sample), -5.4);
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

test('processRepurchasesSection omite la sección cuando las recompras son marginales (caso CAG FY2026)', () => {
  const conclusion = {
    repurchases: {
      text: 'Durante el ejercicio 2026 la compañía destinó 15,3M$ a la recompra de acciones propias.',
      authorizationRemaining: 'Unos 837,6M de $ pendientes de ejecución',
      secSnippet: { title: 'Share Repurchase Program', rows: [['Aggregate cost (in millions)', '$15.3']] },
    },
  };
  const rawAnn = {
    repurchases: {
      sharesRepurchasedAnnual: 0.8,
      averagePrice: 19.1,
      aggregateCost: 15.3,
      programRemaining: 837.6,
      sharesHistory: [
        { year: 2022, shares: 470 },
        { year: 2023, shares: 465 },
        { year: 2024, shares: 458 },
        { year: 2025, shares: 455 },
        { year: 2026, shares: 450 },
      ],
    },
  };
  const extracted = {
    facts: { shareBuybacks: 15.3 },
    capitalAllocationData: { ytd: { buybacks: -15.3 } },
  };

  processRepurchasesSection(conclusion, rawAnn, extracted);
  assert.equal(conclusion.repurchases, undefined, 'Las recompras marginales (< 1 % del capital) deben omitirse');
});

test('processRepurchasesSection mantiene la sección si hay un programa nuevo o cancelado aunque las recompras sean marginales', () => {
  const conclusion = {
    repurchases: { text: 'La compañía lanzó un nuevo programa.', programChanges: 'Nuevo programa de 2.000M autorizado en febrero de 2026' },
  };
  const rawAnn = {
    repurchases: {
      sharesRepurchasedAnnual: 0.8,
      averagePrice: 19.1,
      aggregateCost: 15.3,
      sharesHistory: [{ year: 2025, shares: 455 }, { year: 2026, shares: 450 }],
    },
  };
  const extracted = { facts: { shareBuybacks: 15.3 }, capitalAllocationData: { ytd: { buybacks: -15.3 } } };

  processRepurchasesSection(conclusion, rawAnn, extracted);
  assert.ok(conclusion.repurchases, 'Un cambio de programa mantiene la sección');
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

test('extractExecutiveChangesFromText ignora las bio antiguas del 10-K (caso Adobe 2007/2017)', () => {
  const bio = `Information About Our Executive Officers
Shantanu Narayen 62 Chair of the Board of Directors and Chief Executive Officer
Mr. Narayen currently serves as our Chief Executive Officer and Chair of the Board. He joined Adobe
in January 1998 as Vice President and General Manager. In January 2005, Mr. Narayen was promoted to President and Chief Operating Officer, and effective
December 2007, he was appointed our Chief Executive Officer and joined our Board. In January 2017,
he was named our Chair of the Board.`;
  assert.equal(extractExecutiveChangesFromText(bio, { fiscalYear: 2025 }).length, 0);
  assert.ok(extractExecutiveChangesFromText(bio).length > 0, 'Sin año fiscal se mantiene el comportamiento previo');
});

test('isStaleExecutiveChange distingue los relevos del ejercicio de las fechas antiguas', () => {
  assert.equal(isStaleExecutiveChange({ announcementDate: 'January 2017', text: 'In January 2017, he was named Chair' }, 2025), true);
  assert.equal(isStaleExecutiveChange({ effectiveDate: 'November 1, 2024', text: 'Jane Roe was appointed CFO' }, 2025), false);
  assert.equal(isStaleExecutiveChange({ text: 'John Doe asumió como CFO en marzo de 2025' }, 2025), false);
  assert.equal(isStaleExecutiveChange({ text: 'John Doe asumió como CFO' }, 2025), false);
});

test('applyExecutiveChangesFallback descarta los cambios históricos que trajo la IA y no inventa otros', () => {
  const extracted = {
    annualDetails: {
      executiveChanges: [{
        role: 'CEO',
        text: 'En diciembre de 2007 fue nombrado Chief Executive Officer y en enero de 2017 Chair of the Board.',
        announcementDate: 'January 2017',
        occurred: true,
      }],
    },
  };
  applyExecutiveChangesFallback(extracted, 'Texto del filing sin relevos recientes.', 2025);
  assert.equal(extracted.annualDetails.executiveChanges, undefined);
});

test('applyExecutiveChangesFallback conserva los relevos recientes del ejercicio', () => {
  const extracted = {
    annualDetails: {
      executiveChanges: [{
        role: 'CFO',
        text: 'Jane Roe was appointed CFO effective November 1, 2024.',
        effectiveDate: 'November 1, 2024',
        occurred: true,
      }],
    },
  };
  applyExecutiveChangesFallback(extracted, '', 2025);
  assert.equal(extracted.annualDetails.executiveChanges.length, 1);
  assert.equal(extracted.annualDetails.executiveChanges[0].role, 'CFO');
});

test('getExecutiveChanges descarta los rellenos de "sin información" en los bloques de directivos', async () => {
  const { getExecutiveChanges, isNoInfoValue } = await import('../../src/services/reportExport/executiveChanges.js');
  assert.equal(isNoInfoValue('No public information available'), true);
  assert.equal(isNoInfoValue('No se dispone de información pública verificada'), true);
  assert.equal(isNoInfoValue('No consta'), true);
  assert.equal(isNoInfoValue('N/A'), true);
  assert.equal(isNoInfoValue('Dejará el Consejo y participará como inversor a largo plazo'), false);

  const section = getExecutiveChanges({
    executiveChanges: {
      title: '2: Management changes',
      changes: [{
        role: 'CEO',
        text: 'Effective **December 1, 2025**, Athina Kanikura was appointed CEO.',
        oldExecutive: {
          name: 'No public information available',
          role: 'N/A',
          salesDuringTenure: 'No public information available',
          whereTheyGo: 'No public information available',
          policies: 'No public information available',
        },
        newExecutive: {
          name: 'Athina Kanikura',
          origin: 'PepsiCo, Executive Vice President',
          trackRecord: 'No public information available',
          commitments: 'No se dispone de información pública verificada',
        },
      }],
    },
  }, 'en');

  assert.ok(section);
  assert.equal(section.changes.length, 1);
  assert.equal(section.changes[0].oldExecutive, null, 'Un bloque solo con rellenos desaparece por completo');
  assert.deepEqual(section.changes[0].newExecutive, {
    name: 'Athina Kanikura',
    origin: 'PepsiCo, Executive Vice President',
  });
});

test('getExecutiveChanges omite la sección si todos los cambios solo traen rellenos', async () => {
  const { getExecutiveChanges } = await import('../../src/services/reportExport/executiveChanges.js');
  const section = getExecutiveChanges({
    executiveChanges: {
      changes: [{
        role: 'CFO',
        oldExecutive: { name: 'N/A', whereTheyGo: 'No public information available' },
        newExecutive: { name: null, trackRecord: 'No consta' },
      }],
    },
  });
  assert.equal(section, null);
});
