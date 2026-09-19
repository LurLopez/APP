/**
 * @fileoverview Módulo extraído de financialParsers.js.
 */

export function parseLooseAmount(value) {
  if (value == null) return NaN;
  let s = String(value).replace(/[$€£\s]/g, '').trim();
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(/,/g, '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts.length > 2 || parts[1]?.length === 3 ? parts.join('') : s.replace(',', '.');
  } else if (s.includes('.') && s.split('.').length > 2) {
    s = s.split('.').join('');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function computeAllDebtAverageRate(secTable) {
  if (!secTable || !Array.isArray(secTable.rows) || !secTable.rows.length) return null;
  const headers = Array.isArray(secTable.headers) ? secTable.headers : [];
  let balanceIdx = -1;
  let bestYear = -Infinity;
  headers.forEach((header, index) => {
    const match = String(header).match(/(20\d\d)/);
    if (match) {
      const year = Number(match[1]);
      if (year > bestYear) {
        bestYear = year;
        balanceIdx = index;
      }
    }
  });
  if (balanceIdx < 0) balanceIdx = headers.length >= 3 ? 2 : 1;
  let total = 0;
  let weighted = 0;
  let estimated = false;
  secTable.rows.forEach((row) => {
    const cells = Array.isArray(row) ? row : [row?.metric ?? row?.name, row?.value];
    const rateMatches = [...cells.join(' ').matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
      .map((match) => Number(String(match[1]).replace(',', '.')))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    if (!rateMatches.length) return;
    const rate = rateMatches.length >= 2
      ? (Math.min(...rateMatches) + Math.max(...rateMatches)) / 2
      : rateMatches[0];
    if (rateMatches.length >= 2) estimated = true;
    const balance = parseLooseAmount(cells[balanceIdx]);
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(balance) || balance <= 0) return;
    total += balance;
    weighted += balance * rate;
  });
  return total > 0
    ? { rate: Math.round((weighted / total) * 100) / 100, estimated, source: 'tabla de deuda' }
    : null;
}

export function computeEstimatedDebtRateFromIncome(annualRow, previousAnnualRow) {
  const values = annualRow?.values ?? {};
  const interest = Math.abs(Number(values.interestExpense) || 0)
    || Math.abs(Number(values.interestPaid) || 0);
  const debt = Number(values.totalDebt);
  const prevDebt = Number(previousAnnualRow?.values?.totalDebt);
  const averageDebt = (Number.isFinite(debt) && Number.isFinite(prevDebt) && debt > 0 && prevDebt > 0)
    ? (debt + prevDebt) / 2
    : debt;
  if (!(interest > 0) || !(averageDebt > 0)) return null;
  return {
    rate: Math.round((interest / averageDebt) * 10000) / 100,
    estimated: true,
    source: 'intereses del ejercicio sobre deuda media',
  };
}

export function formatFinancialValue(value, language = 'es') {
  if (!Number.isFinite(value)) return null;
  const rounded = String(Math.round(value * 10) / 10);
  return language === 'en' ? rounded : rounded.replace('.', ',');
}

export function formatCellNumber(value, language = 'es') {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = String(Math.round(num * 100) / 100);
  return language === 'en' ? rounded : rounded.replace('.', ',');
}

const EXTRACTED_FACT_MONEY_KEYS = [
  'shareBuybacks', 'shareBuybacksQuarter',
  'purchasesOfMarketableSecuritiesQuarter', 'purchasesOfMarketableSecuritiesYtd',
  'proceedsFromSaleOfMarketableSecuritiesQuarter', 'proceedsFromSaleOfMarketableSecuritiesYtd',
  'acquisitionsQuarter', 'acquisitionsYtd', 'assetSalesQuarter', 'assetSalesYtd', 'brandDivestitures',
  'impairmentsQuarter', 'impairmentsPrevQuarter', 'impairmentsYtd', 'impairmentsPrevYtd',
  'intangiblesAmortization', 'incomeTaxExpenseQuarter', 'incomeTaxExpenseYtd',
  'intangiblesAmortizationQuarter', 'intangiblesAmortizationYtd',
  'incomeTaxesPaidQuarter', 'incomeTaxesPaidYtd',
  'taxCashFlowAdjustmentQuarter', 'taxCashFlowAdjustmentYtd', 'netChangeInCash', 'totalDebt',
  'preferredIssuanceQuarter', 'preferredIssuanceYtd', 'nonControllingSaleQuarter', 'nonControllingSaleYtd',
  'debtCashFlowYtd',
];

const EXTRACTED_BALANCE_MONEY_KEYS = [
  'inventories', 'accountsPayable', 'accountsReceivable', 'cash', 'cashBeginningOfYear', 'cashPreviousQuarter',
  'restrictedCash', 'restrictedCashBeginningOfYear', 'restrictedCashPreviousQuarter',
  'shortTermInvestments', 'shortTermInvestmentsBeginningOfYear', 'shortTermInvestmentsPreviousQuarter',
  'totalDebt', 'totalDebtBeginningOfYear', 'totalDebtPreviousQuarter',
];

const EXTRACTED_CASHFLOW_MONEY_KEYS = ['operating', 'capex', 'dividends', 'prevOperating'];

const EXTRACTED_WORKING_CAPITAL_MONEY_KEYS = ['reportedChangeQuarter', 'reportedChangeYtd'];

export function normalizeExtractedUnits(extracted) {
  if (!extracted || typeof extracted !== 'object') return;
  const scaleValues = [
    extracted.ytd?.sales, extracted.quarter?.sales,
    extracted.ytd?.grossProfit, extracted.quarter?.grossProfit,
    extracted.ytd?.ebt, extracted.quarter?.ebt,
    extracted.ytd?.netIncome, extracted.quarter?.netIncome,
  ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const scale = scaleValues.length ? Math.max(...scaleValues) : null;
  const fix = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return value;
    const magnitude = Math.abs(num);
    if (Number.isFinite(scale)) {
      if (magnitude < scale * 20) return value;
    } else if (magnitude < 100000) {
      return value;
    }
    return Math.sign(num) * (Math.round((magnitude / 1000) * 10) / 10);
  };
  const targets = [
    [extracted.facts, EXTRACTED_FACT_MONEY_KEYS],
    [extracted.balance, EXTRACTED_BALANCE_MONEY_KEYS],
    [extracted.cashFlow, EXTRACTED_CASHFLOW_MONEY_KEYS],
    [extracted.workingCapital, EXTRACTED_WORKING_CAPITAL_MONEY_KEYS],
  ];
  targets.forEach(([target, keys]) => {
    if (!target || typeof target !== 'object') return;
    keys.forEach((key) => {
      if (target[key] == null) return;
      target[key] = fix(target[key]);
    });
  });
}

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatFiscalEndLabel(periodEnd) {
  const match = String(periodEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = MONTH_NAMES_EN[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}
