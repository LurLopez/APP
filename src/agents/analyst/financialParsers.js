/**
 * @fileoverview Funciones de extracción textual, formateo numérico y parseo de magnitudes financieras de filings SEC.
 * @module agents/analyst/financialParsers
 */

/**
 * Interpreta cifras del informe con separador de miles de la SEC ("(16,615)" -> -16615) o con coma decimal ("1784,4" -> 1784.4).
 * @param {string|number} val - Entrada a parsear.
 * @returns {number} Valor numérico o NaN.
 */
export function parseFinancialValue(val) {
  if (val == null || val === '—') return NaN;
  const raw = String(val).trim();
  const isParenthesized = /^\(.*\)$/.test(raw);
  const num = parseLooseReportNumber(raw);
  if (!Number.isFinite(num)) return NaN;
  return isParenthesized ? -num : num;
}

export function extractTaxCashFlowAdjustment(text) {
  const source = String(text ?? '');
  const match = source.match(/(?:Deferred income taxes and income taxes payable,?\s+net|Deferred income tax(?:es)?\s+provision\s*\/\s*\(benefit\)|Deferred income tax(?:es)?\s+provision\s*\(benefit\)|Deferred income tax(?:es)?\s+expense\s*\(benefit\)|Deferred income tax(?:es)?\s*\(benefit\)\s*expense|Deferred income tax(?:es)?|Deferred taxes)\s+([()\d.,-]+)(?:\s+([()\d.,-]+))?/i);
  if (!match) return null;
  const current = parseFinancialValue(match[1]);
  return Number.isFinite(current) ? current : null;
}

export function extractIncomeTaxesPaid(text) {
  const source = String(text ?? '');
  const directMatch = source.match(/(?:Income tax(?:es)?\s*(?:\(paid\)\s*received|\(paid\)|\(net of refunds\)|paid))\s+([()\d.,-]+)(?:\s+([()\d.,-]+))?/i)
    || source.match(/(?:Total net cash income taxes paid|Net cash paid for income taxes)\s+\$?\s*([()\d.,-]+)/i)
    || source.match(/Cash paid[^\n]{0,60}for income taxes[^\d()]*([()\d.,-]+)/i);
  if (directMatch) {
    const val = parseFinancialValue(directMatch[1]);
    if (Number.isFinite(val)) return Math.abs(val);
  }
  return null;
}

export function parseDollarAmount(str) {
  if (str == null) return NaN;
  const unitMatch = String(str).match(/\b(billion|million)\b/i);
  const unit = unitMatch ? unitMatch[1].toLowerCase() : 'million';
  const num = parseFloat(String(str).replace(/[$,]/g, '').trim());
  if (!Number.isFinite(num)) return NaN;
  return Math.round((unit.startsWith('b') ? num * 1000 : num) * 10) / 10;
}

export function extractRemainingAuthorization(text) {
  const source = String(text);
  const patterns = [
    /(?:approximately|about|around|approximately another|another)\s*\$?([\d.,]+\s*(?:billion|million))\s+(?:remains?|remaining|still available)/i,
    /(?:remains?|remaining|still available|available for future repurchase|capacity to repurchase)\s+(?:approximately|about|around|of)?\s*\$?([\d.,]+\s*(?:billion|million))/i,
    /\$?([\d.,]+\s*(?:billion|million))\s+(?:remains?|remaining|still available|was still available)/i,
    /(?:of which|leaving)\s*(?:approximately|about|around)?\s*\$?([\d.,]+\s*(?:billion|million))\s+(?:remained|was still available)/i,
    /remaining authorization[^.]{0,100}?\$?([\d.,]+\s*(?:billion|million))/i,
    /had remaining[^.]{0,100}?(?:approximately|about|around|of)?\s*\$?([\d.,]+\s*(?:billion|million))/i,
  ];
  for (const re of patterns) {
    const m = source.match(re);
    if (m && m[1]) {
      const value = parseDollarAmount(m[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

export function extractRepurchaseProgramTerms(text) {
  const source = String(text);
  const terms = {};

  const authorized = source.match(/repurchase up to\s*\$?([\d.,]+\s*(?:billion|million))/i)
    || source.match(/(?:authorized|approved)\s+(?:a|the)?\s*(?:share\s+)?(?:repurchase|buyback)[^.]{0,140}?\$?([\d.,]+\s*(?:billion|million))/i);
  if (authorized) {
    const value = parseDollarAmount(authorized[1]);
    if (Number.isFinite(value)) terms.programAuthorizedTotal = value;
  }

  const expiry = source.match(/(?:repurchase|buyback|program)[\s\S]{0,220}?through\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i)
    || source.match(/expires?\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i);
  if (expiry) terms.programExpiry = expiry[1];

  const approvalDate = source.match(/(?:In|On)\s+([A-Z][a-z]+\s+\d{4})[^.]{0,180}?(?:authorized|approved)[^.]{0,180}?(?:repurchase|buyback)/i);
  if (approvalDate) terms.programApprovalDate = approvalDate[1];

  const pieces = [];
  if (Number.isFinite(terms.programAuthorizedTotal)) pieces.push(`autorización de ${terms.programAuthorizedTotal}M`);
  if (terms.programApprovalDate) pieces.push(`aprobada en ${terms.programApprovalDate}`);
  if (terms.programExpiry) pieces.push(`vigente hasta ${terms.programExpiry}`);
  if (pieces.length) terms.programSummary = pieces.join(', ');

  return terms;
}

export function isPlaceholderText(value) {
  return /no disponible|no consta|no se (?:desglosa|indica|recoge|detalla)|sin datos|no incluido|not available|not disclosed|not stated|no especificad/i.test(String(value ?? ''));
}

export function cleanAssetDescription(value) {
  const text = String(value ?? '').trim();
  const cleaned = text
    .replace(/^venta\s+(?:del|de la|de las|de los|de)?\.?\s*/i, '')
    .replace(/[.;,\s]+$/, '')
    .trim();
  return cleaned || text;
}

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

export function extractCapitalCashFlowFacts(text) {
  const source = String(text);
  const readFirstValue = (pattern) => {
    const match = source.match(pattern);
    return match ? parseFinancialValue(match[1]) : null;
  };
  return {
    shareBuybacks: readFirstValue(/Repurchases of common stock\s+([()\d.,-]+)/i),
    purchasesOfMarketableSecurities: readFirstValue(/Purchases of marketable securities\s+([()\d.,-]+)/i),
    proceedsFromSaleOfMarketableSecurities: readFirstValue(/Proceeds from sale(?:s)? (?:of|and maturity of) marketable securities\s+([()\d.,-]+)/i),
    acquisitionsOfBusiness: readFirstValue(/Acquisitions? of businesses,? net of cash acquired\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Acquisition of business,? net of cash acquired\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Payments? to acquire businesses[^()\d-]{0,40}([()\d.,-]+)/i),
    proceedsFromAssetSales: readFirstValue(/Proceeds from sales of property, plant, equipment and other assets\s+([()\d.,-]+)/i),
  };
}

export function extractEquityIssuance(text) {
  const source = String(text ?? '');
  const read = (pattern) => {
    const match = source.match(pattern);
    if (!match) return null;
    const value = parseFinancialValue(match[1]);
    return Number.isFinite(value) ? Math.abs(value) : null;
  };
  return {
    preferred: read(/(?:Net )?proceeds from (?:the )?issuance of (?:convertible )?preferred stock[^()\d-]{0,80}([()\d.,-]+)/i),
    nonControlling: read(/(?:Net )?proceeds from (?:the )?sale of (?:non-?controlling interest|minority interest)[^()\d-]{0,80}([()\d.,-]+)/i),
  };
}

export function extractDebtCashFlow(text) {
  const source = String(text ?? '');
  const netIdx = source.search(/Net cash (?:provided by|used in)[^\n]{0,80}financing/i);
  const start = netIdx > 0
    ? source.lastIndexOf('Financing activities', netIdx)
    : source.search(/Financing activities/i);
  if (start < 0) return null;
  const tail = source.slice(start);
  const endMatch = tail.search(/Net cash (?:provided by|used in)[^\n]{0,80}financing/i);
  const section = tail.slice(0, endMatch > 0 ? endMatch : Math.min(tail.length, 25000));
  let net = 0;
  let found = false;
  const amountCellRe = /^\(?\s*\$?\s*[\d.,]+\s*\$?\)?$/;
  section.split('\n').forEach((line) => {
    const label = line.slice(0, 100).toLowerCase();
    if (!/debt|note|borrow|loan|commercial paper|term loan|finance lease|capital lease|line of credit|credit facility|bond/i.test(label)) return;
    if (/stock|share|equity|dividend|repurchase|treasury|preferred|non-?controlling|minority|structured payab/i.test(label)) return;
    const cells = line.split(/\t|\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
    let amountCell = cells.length > 1
      ? cells.slice(1).find((cell) => amountCellRe.test(cell) || cell === '—')
      : null;
    if (amountCell == null) {
      const match = line.match(/\(?\s*\$?\s*[\d.,]+\s*\$?\)?/);
      amountCell = match ? match[0].trim() : null;
    }
    if (!amountCell || /—/.test(amountCell)) return;
    const value = parseFinancialValue(amountCell);
    if (!Number.isFinite(value) || value === 0) return;
    const isRepayment = /repay|payment|redemption|maturit/i.test(label);
    net += isRepayment ? -Math.abs(value) : Math.abs(value);
    found = true;
  });
  return found ? Math.round(net * 10) / 10 : null;
}

export function formatFinancialValue(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10).replace('.', ',') : null;
}

export function formatCellNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num * 100) / 100;
  return String(rounded).replace('.', ',');
}

export function parseLooseReportNumber(value) {
  if (value == null || value === '—') return NaN;
  const raw = String(value).trim().replace(/[^0-9.,-]/g, '');
  if (!raw) return NaN;
  let s = raw;
  let joinedThousands = false;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(/,/g, '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 1 && parts[0] !== '0' && parts.slice(1).every((part) => part.length === 3)) {
      s = parts.join('');
      joinedThousands = true;
    } else {
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 1 && parts[0] !== '0' && parts.slice(1).every((part) => part.length === 3)) {
      s = parts.join('');
      joinedThousands = true;
    }
  }
  let num = parseFloat(s);
  if (!Number.isFinite(num)) return NaN;
  const separatorCount = (raw.match(/[.,]/g) || []).length;
  if (joinedThousands && num > 100000 && separatorCount === 1) {
    const decimalAttempt = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(decimalAttempt) && decimalAttempt < num) num = decimalAttempt;
  }
  return num;
}

export function normalizeNumericCell(value) {
  if (value == null || value === '—') return value;
  const str = String(value).trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(str)) return value;
  const num = parseLooseReportNumber(str);
  if (!Number.isFinite(num)) return value;
  const rounded = Math.round(num * 100) / 100;
  return String(rounded).replace('.', ',');
}

const EXTRACTED_FACT_MONEY_KEYS = [
  'shareBuybacks',
  'purchasesOfMarketableSecuritiesQuarter', 'purchasesOfMarketableSecuritiesYtd',
  'proceedsFromSaleOfMarketableSecuritiesQuarter', 'proceedsFromSaleOfMarketableSecuritiesYtd',
  'acquisitionsQuarter', 'acquisitionsYtd', 'assetSalesQuarter', 'assetSalesYtd', 'brandDivestitures',
  'impairmentsQuarter', 'impairmentsPrevQuarter', 'impairmentsYtd', 'impairmentsPrevYtd',
  'intangiblesAmortization', 'incomeTaxExpenseQuarter', 'incomeTaxExpenseYtd',
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
