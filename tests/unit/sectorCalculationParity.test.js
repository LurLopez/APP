import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Paridad de cálculos entre los dos sectores de consumo: consumo discrecional debe
 * producir exactamente las mismas cifras que consumo defensivo con los mismos datos
 * y la misma política sectorial (amortización, deterioros, impuestos, WC y capital).
 */

function buildHorizon() {
  return {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'Ventas', normal: '5000M', prevNormal: '4500M', adjusted: '5000M', prevAdjusted: '4500M' },
        { name: 'Beneficio Bruto', normal: '3000M', prevNormal: '2700M', adjusted: '3000M', prevAdjusted: '2700M' },
        { name: 'Beneficio Operativo', normal: '1400M', prevNormal: '1300M', adjusted: '1560M', prevAdjusted: '1370M', isAdjusted: true, adjustedNote: '*1' },
        { name: 'EBT', normal: '1000M', prevNormal: '900M', adjusted: '1160M', prevAdjusted: '970M', isAdjusted: false },
        { name: 'Beneficio Neto', normal: '800M', prevNormal: '720M', adjusted: '923,2M', prevAdjusted: '773,9M' },
      ],
      notes: ['*1: Amortización de intangibles y deterioros sumados de vuelta.'],
    },
    cashFlow: {
      scenarios: ['Normal (WC=-40)', 'Ajustado*1 (WC=-50)'],
      rows: [
        { name: 'Cash Flow', values: ['1200', '1190'] },
        { name: 'CAPEX', values: ['300', '300'] },
        { name: 'FCF', values: ['900', '890'] },
        { name: 'FCF/Acción', values: ['9,00 $', '8,90 $'] },
        { name: 'Dividendo', values: ['100', '100'] },
        { name: 'Libre', values: ['800', '790'] },
      ],
      notes: [],
    },
    capital: {
      rows: [
        { name: 'Libre', value: '800' },
        { name: 'Recompras', value: '-120' },
        { name: 'En total', value: '-120' },
      ],
      notes: [],
    },
  };
}

function buildExtracted() {
  return {
    shares: 100,
    fiscalYear: 2025,
    facts: {
      intangiblesAmortizationYtd: 80,
      goodwillImpairmentYtd: 50,
      intangibleImpairmentYtd: 30,
      intangiblesAmortizationPrevYtd: 70,
      incomeTaxExpenseYtd: 200,
      incomeTaxesPaidYtd: 150,
      stockCompensation: 60,
    },
    workingCapitalData: {
      ytdScenarios: ['Normal (WC=-40)', 'Ajustado*1 (WC=-50)'],
      ytdValues: {
        cfo: ['1200', '1190'],
        capex: ['300', '300'],
        fcf: ['900', '890'],
        fcfPerShare: ['9,00 $', '8,90 $'],
        dividends: ['100', '100'],
        libre: ['800', '790'],
      },
      explanationYtd: '*1: WC = peso agregado histórico × flujo del periodo: 1190M.',
    },
    capitalAllocationData: {
      ytd: { libre: 800, deuda: -120 },
      threeMonths: null,
    },
  };
}

async function normalizeAll(horizon, extracted, sector) {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const { normalizeCashFlowBlock, normalizeCapitalBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  normalizeSalesBlock(horizon, extracted, 'es', sector);
  normalizeCashFlowBlock(horizon, extracted, 'es', sector);
  normalizeCapitalBlock(horizon, extracted, 'es');
  return horizon;
}

test('consumo discrecional y consumo defensivo comparten la misma política sectorial', async () => {
  const { getSectorPolicy, SECTOR_POLICIES, buildSectorPolicyDirective } = await import('../../src/agents/analyst/sectorPolicy.js');
  assert.equal(getSectorPolicy('consumer_discretionary'), getSectorPolicy('defensive_consumer'));
  assert.equal(SECTOR_POLICIES.consumer_discretionary, SECTOR_POLICIES.defensive_consumer);

  const defensive = buildSectorPolicyDirective('defensive_consumer');
  const discretionary = buildSectorPolicyDirective('consumer_discretionary');
  const body = (directive) => directive.split('\n').slice(1).join('\n');
  assert.equal(body(discretionary), body(defensive));
});

test('los cálculos deterministas de consumo discrecional son idénticos a los de consumo defensivo', async () => {
  const defensive = await normalizeAll(buildHorizon(), buildExtracted(), 'defensive_consumer');
  const discretionary = await normalizeAll(buildHorizon(), buildExtracted(), 'consumer_discretionary');
  assert.deepEqual(discretionary, defensive);

  const rows = Object.fromEntries(defensive.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Operativo'].adjusted, '1560M');
  assert.equal(rows['Beneficio Neto'].adjusted, '923,2M');

  const cashRows = Object.fromEntries(defensive.cashFlow.rows.map((row) => [row.name, row]));
  assert.ok(cashRows['Cash Flow'].values[1] !== cashRows['Cash Flow'].values[0]);
});

test('la tecnología sí calcula distinto con los mismos datos (la paridad no es vacía)', async () => {
  const defensive = await normalizeAll(buildHorizon(), buildExtracted(), 'defensive_consumer');
  const technology = await normalizeAll(buildHorizon(), buildExtracted(), 'technology');

  const defensiveRows = Object.fromEntries(defensive.sales.rows.map((row) => [row.name, row]));
  const techRows = Object.fromEntries(technology.sales.rows.map((row) => [row.name, row]));
  assert.notEqual(techRows['Beneficio Operativo'].adjusted, defensiveRows['Beneficio Operativo'].adjusted);
  assert.equal(techRows['Beneficio Operativo'].adjusted, '1450M');
});
