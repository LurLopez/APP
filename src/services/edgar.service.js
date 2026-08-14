const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const FACTS_URL_TEMPLATE = 'https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json';
const SUBMISSIONS_URL_TEMPLATE = 'https://data.sec.gov/submissions/CIK{CIK}.json';
const USER_AGENT = 'Cifra contacto@cifra.local';

const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;
const FACTS_TTL = 6 * 60 * 60 * 1000;
const FILINGS_TTL = 6 * 60 * 60 * 1000;
const FILINGS_LIMIT = 40;

const STATEMENTS = {
  income: [
    { key: 'revenue', label: 'Ingresos', tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomer'], unit: 'USD' },
    { key: 'costOfRevenue', label: 'Coste de ventas', tags: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'], unit: 'USD' },
    { key: 'grossProfit', label: 'Beneficio bruto', tags: ['GrossProfit'], unit: 'USD', emphasis: true },
    { key: 'sellingGeneralAdmin', label: 'Gastos de venta, generales y administrativos', tags: ['SellingGeneralAndAdministrativeExpense'], unit: 'USD' },
    { key: 'researchDevelopment', label: 'Investigación y desarrollo', tags: ['ResearchAndDevelopmentExpense'], unit: 'USD' },
    { key: 'otherIncome', label: 'Otros ingresos (gastos)', tags: ['NonoperatingIncomeExpense', 'OtherNonoperatingIncomeExpense'], unit: 'USD' },
    { key: 'operatingIncome', label: 'Resultado operativo', tags: ['OperatingIncomeLoss'], unit: 'USD', emphasis: true },
    { key: 'interestExpense', label: 'Gastos por intereses', tags: ['InterestExpense', 'InterestExpenseNonoperating'], unit: 'USD' },
    { key: 'pretaxIncome', label: 'Resultado antes de impuestos', tags: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], unit: 'USD' },
    { key: 'incomeTax', label: 'Impuesto sobre beneficios', tags: ['IncomeTaxExpenseBenefit'], unit: 'USD' },
    { key: 'incomeFromContinuingOps', label: 'Resultado de operaciones continuadas', tags: ['IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest', 'IncomeLossFromContinuingOperations'], unit: 'USD' },
    { key: 'netIncome', label: 'Beneficio neto', tags: ['NetIncomeLoss', 'ProfitLoss'], unit: 'USD', emphasis: true },
    { key: 'epsDiluted', label: 'BPA diluido', tags: ['EarningsPerShareDiluted'], unit: 'USD/shares', format: 'perShare' },
    { key: 'epsBasic', label: 'BPA básico', tags: ['EarningsPerShareBasic'], unit: 'USD/shares', format: 'perShare' },
    { key: 'weightedSharesDiluted', label: 'Acciones diluidas (millones)', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'], unit: 'shares', format: 'shares' },
  ],
  balance: [
    { key: 'cash', label: 'Caja y equivalentes', tags: ['CashAndCashEquivalentsAtCarryingValue'], unit: 'USD' },
    { key: 'shortTermInvestments', label: 'Inversiones a corto plazo', tags: ['ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'], unit: 'USD' },
    { key: 'receivables', label: 'Cuentas por cobrar', tags: ['AccountsReceivableNetCurrent'], unit: 'USD' },
    { key: 'inventory', label: 'Inventario', tags: ['InventoryNet'], unit: 'USD' },
    { key: 'prepaidExpenses', label: 'Gastos anticipados', tags: ['PrepaidExpenseAndOtherAssetsCurrent'], unit: 'USD' },
    { key: 'currentAssets', label: 'Activo corriente', tags: ['AssetsCurrent'], unit: 'USD', emphasis: true },
    { key: 'propertyPlantEquipment', label: 'Inmovilizado material', tags: ['PropertyPlantAndEquipmentNet'], unit: 'USD' },
    { key: 'goodwill', label: 'Fondo de comercio', tags: ['Goodwill'], unit: 'USD' },
    { key: 'intangibleAssets', label: 'Activos intangibles', combine: ['FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'], tags: ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedTrademarks'], unit: 'USD' },
    { key: 'assetsNoncurrent', label: 'Activo no corriente', tags: ['AssetsNoncurrent'], unit: 'USD' },
    { key: 'assets', label: 'Total activo', tags: ['Assets'], unit: 'USD', emphasis: true },
    { key: 'payables', label: 'Cuentas por pagar', tags: ['AccountsPayableCurrent', 'AccountsPayableTradeCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'], unit: 'USD' },
    { key: 'accruedLiabilities', label: 'Gastos devengados', tags: ['AccruedLiabilitiesCurrent'], unit: 'USD' },
    { key: 'deferredRevenue', label: 'Ingresos diferidos', tags: ['ContractWithCustomerLiabilityCurrent', 'DeferredRevenueCurrent'], unit: 'USD' },
    { key: 'longTermDebtCurrent', label: 'Deuda a corto plazo', tags: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'], unit: 'USD' },
    { key: 'currentLiabilities', label: 'Pasivo corriente', tags: ['LiabilitiesCurrent'], unit: 'USD', emphasis: true },
    { key: 'longTermDebt', label: 'Deuda a largo plazo', tags: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebt'], unit: 'USD' },
    { key: 'liabilitiesNoncurrent', label: 'Pasivo no corriente', tags: ['LiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'liabilities', label: 'Total pasivo', tags: ['Liabilities'], unit: 'USD', emphasis: true },
    { key: 'additionalPaidInCapital', label: 'Capital adicional', tags: ['AdditionalPaidInCapital'], unit: 'USD' },
    { key: 'retainedEarnings', label: 'Reservas (ganancias retenidas)', tags: ['RetainedEarningsAccumulatedDeficit'], unit: 'USD' },
    { key: 'treasuryStock', label: 'Autocartera', tags: ['TreasuryStockValue'], unit: 'USD' },
    { key: 'minorityInterest', label: 'Intereses minoritarios', tags: ['MinorityInterest'], unit: 'USD' },
    { key: 'equity', label: 'Fondos propios', tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], unit: 'USD', emphasis: true },
  ],
  cashflow: [
    { key: 'netIncome', label: 'Beneficio neto', tags: ['NetIncomeLoss', 'ProfitLoss'], unit: 'USD' },
    { key: 'depreciationAmortization', label: 'Depreciación y amortización', tags: ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet'], unit: 'USD' },
    { key: 'stockCompensation', label: 'Retribución en acciones', tags: ['ShareBasedCompensation'], unit: 'USD' },
    { key: 'workingCapitalChange', label: 'Cambios en el capital circulante', tags: ['IncreaseDecreaseInOperatingCapital'], unit: 'USD' },
    { key: 'cfo', label: 'Cash flow operativo', tags: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'capex', label: 'Inversiones en inmovilizado (CAPEX)', tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], unit: 'USD' },
    { key: 'acquisitions', label: 'Adquisiciones', tags: ['PaymentsToAcquireBusinessesNetOfCashAcquired'], unit: 'USD' },
    { key: 'cfi', label: 'Cash flow de inversión', tags: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'dividendsPaid', label: 'Dividendos pagados', tags: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], unit: 'USD' },
    { key: 'buybacks', label: 'Recompra de acciones', tags: ['PaymentsForRepurchaseOfCommonStock'], unit: 'USD' },
    { key: 'debtIssued', label: 'Emisión de deuda', tags: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromIssuanceOfDebt'], unit: 'USD' },
    { key: 'debtPaid', label: 'Amortización de deuda', tags: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt', 'RepaymentsOfLongTermDebtAndCapitalSecurities', 'RepaymentsOfDebtAndDebtIssuanceCosts'], unit: 'USD' },
    { key: 'cff', label: 'Cash flow de financiación', tags: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'netChangeInCash', label: 'Variación neta de caja', tags: ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect', 'CashAndCashEquivalentsPeriodIncreaseDecrease'], unit: 'USD', emphasis: true },
  ],
};

const CONCEPTS = Object.values(STATEMENTS).flat();

const DISPLAY_STATEMENTS = {
  income: [
    { kind: 'section', label: 'Ingresos' },
    { key: 'revenue', label: 'Ingresos totales', emphasis: true },
    { kind: 'change', baseKey: 'revenue', label: '% De cambio interanual' },
    { key: 'costOfRevenue', label: 'Coste de los bienes vendidos' },
    { key: 'grossProfit', label: 'Beneficio bruto', emphasis: true },
    { kind: 'change', baseKey: 'grossProfit', label: '% De cambio interanual' },
    { kind: 'margin', baseKey: 'grossProfit', label: '% Márgenes brutos' },
    { key: 'sellingGeneralAdmin', label: 'Gastos de venta y administrativos' },
    { key: 'researchDevelopment', label: 'Amortización de fondos de comercio y activos intangibles' },
    { key: 'otherIncome', label: 'Otros gastos operacionales' },
    { key: 'operatingIncome', label: 'Beneficio operativo', emphasis: true },
    { kind: 'change', baseKey: 'operatingIncome', label: '% De cambio interanual' },
    { kind: 'margin', baseKey: 'operatingIncome', label: '% Márgenes operativos' },
    { key: 'interestExpense', label: 'Gastos por intereses' },
    { key: 'pretaxIncome', label: 'EBT incl. Artículos inusuales', emphasis: true },
    { key: 'incomeTax', label: 'Gastos de impuestos' },
    { key: 'incomeFromContinuingOps', label: 'Beneficios por operaciones continuadas', emphasis: true },
    { key: 'netIncome', label: 'Beneficio neto de la empresa', emphasis: true },
    { key: 'epsDiluted', label: 'BPA diluido sin extraordinarios', format: 'perShare' },
    { kind: 'change', baseKey: 'epsDiluted', label: '% De cambio interanual' },
    { key: 'weightedSharesDiluted', label: 'Promedio ponderado de acciones diluidas en circulación', format: 'shares' },
    { kind: 'section', label: 'Datos adicionales:' },
    { key: 'epsBasic', label: 'BPA básico', format: 'perShare' },
  ],
  balance: [
    { kind: 'section', label: 'Activos corrientes' },
    { key: 'cash', label: 'Efectivo y equivalentes' },
    { key: 'shortTermInvestments', label: 'Activos financieros para vender' },
    { key: 'receivables', label: 'Cuentas por cobrar' },
    { key: 'inventory', label: 'Inventario' },
    { key: 'prepaidExpenses', label: 'Gastos pagados por anticipado' },
    { key: 'currentAssets', label: 'Total de activo corriente', emphasis: true },
    { key: 'propertyPlantEquipment', label: 'Inmovilizado material bruto' },
    { key: 'intangibleAssets', label: 'Activos intangibles' },
    { key: 'goodwill', label: 'Fondo de comercio' },
    { key: 'assetsNoncurrent', label: 'Activo no corriente' },
    { key: 'assets', label: 'Activo total', emphasis: true },
    { kind: 'section', label: 'Pasivos y fondos propios' },
    { key: 'payables', label: 'Cuentas por pagar' },
    { key: 'accruedLiabilities', label: 'Gastos devengados' },
    { key: 'deferredRevenue', label: 'Ingresos diferidos' },
    { key: 'currentLiabilities', label: 'Total pasivo corriente', emphasis: true },
    { key: 'longTermDebt', label: 'Deuda a largo plazo' },
    { key: 'liabilitiesNoncurrent', label: 'Pasivo no corriente' },
    { key: 'liabilities', label: 'Pasivo total', emphasis: true },
    { key: 'additionalPaidInCapital', label: 'Capital adicional' },
    { key: 'retainedEarnings', label: 'Beneficio no distribuido' },
    { key: 'treasuryStock', label: 'Autocartera' },
    { key: 'equity', label: 'Patrimonio neto común total', emphasis: true },
    { kind: 'section', label: 'Datos adicionales:' },
  ],
  cashflow: [
    { kind: 'section', label: 'Cash flow de operaciones' },
    { key: 'netIncome', label: 'Beneficio neto' },
    { key: 'depreciationAmortization', label: 'Depreciación y amortización' },
    { key: 'stockCompensation', label: 'Amortización de fondos de comercio y activos intangibles' },
    { key: 'workingCapitalChange', label: 'Cambios en el capital circulante' },
    { key: 'cfo', label: 'Efectivo de Operaciones', emphasis: true },
    { kind: 'note', label: 'Nota: Cambio en el capital circulante' },
    { kind: 'section', label: 'Cash flow de inversión' },
    { key: 'capex', label: 'Gastos de capital' },
    { key: 'acquisitions', label: 'Adquisiciones con efectivo' },
    { key: 'cfi', label: 'Efectivo de la inversión', emphasis: true },
    { kind: 'section', label: 'Cash flow de financiación' },
    { key: 'debtIssued', label: 'Deuda total emitida' },
    { key: 'dividendsPaid', label: 'Dividendos comunes pagados' },
    { key: 'buybacks', label: 'Recompra de acciones' },
    { key: 'debtPaid', label: 'Amortización de deuda' },
    { key: 'cff', label: 'Efectivo de Financiamiento', emphasis: true },
    { key: 'netChangeInCash', label: 'Cambio neto en efectivo', emphasis: true },
    { kind: 'section', label: 'Datos adicionales:' },
  ],
};

function publicStatements() {
  const conceptByKey = new Map(CONCEPTS.map((item) => [item.key, item]));
  return Object.fromEntries(
    Object.entries(DISPLAY_STATEMENTS).map(([statement, items]) => [
      statement,
      items.map((item) => ({
        ...item,
        format: item.format ?? conceptByKey.get(item.key)?.format ?? 'money',
        emphasis: item.emphasis === true,
      })),
    ]),
  );
}

let tickerMapCache = null;

async function fetchSecJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new Error(`EDGAR respondió ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    const wrapped = new Error(`No se pudo consultar EDGAR: ${error.message}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
}

function notFound(message) {
  const error = new Error(message);
  error.code = 'COMPANY_NOT_FOUND';
  return error;
}

async function getTickerMap() {
  if (tickerMapCache && Date.now() - tickerMapCache.at < TICKER_MAP_TTL) {
    return tickerMapCache.data;
  }
  const raw = await fetchSecJson(COMPANY_TICKERS_URL);
  const data = new Map();
  for (const entry of Object.values(raw)) {
    data.set(String(entry.ticker).toUpperCase(), {
      cik: entry.cik_str,
      ticker: String(entry.ticker).toUpperCase(),
      name: entry.title,
    });
  }
  tickerMapCache = { data, at: Date.now() };
  return data;
}

export async function searchCompanies(query, limit = 8) {
  const map = await getTickerMap();
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const all = [...map.values()];
  const exact = all.find((company) => company.ticker === q);
  const byTicker = all
    .filter((company) => company.ticker !== q && company.ticker.startsWith(q))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const byName = all
    .filter((company) => company.ticker !== q && !company.ticker.startsWith(q) && company.name.toUpperCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...(exact ? [exact] : []), ...byTicker, ...byName].slice(0, limit);
}

async function getCompanyByTicker(ticker) {
  const map = await getTickerMap();
  const company = map.get(ticker.toUpperCase());
  if (!company) {
    throw notFound(`No se encontró la empresa "${ticker}" en EDGAR.`);
  }
  return company;
}

const factsCache = new Map();

async function getCompanyFacts(company) {
  const cached = factsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < FACTS_TTL) {
    return cached.data;
  }
  const url = FACTS_URL_TEMPLATE.replace('{CIK}', String(company.cik).padStart(10, '0'));
  const data = await fetchSecJson(url);
  factsCache.set(company.ticker, { data, at: Date.now() });
  return data;
}

const filingsCache = new Map();

async function getCompanySubmissions(company) {
  const cached = filingsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < FILINGS_TTL) {
    return cached.data;
  }
  const url = SUBMISSIONS_URL_TEMPLATE.replace('{CIK}', String(company.cik).padStart(10, '0'));
  const data = await fetchSecJson(url);
  filingsCache.set(company.ticker, { data, at: Date.now() });
  return data;
}

function filingPeriodLabel(formType, reportDate) {
  if (!reportDate) return '—';
  const year = reportDate.slice(0, 4);
  if (formType === '10-K') return `FY ${year}`;
  const quarter = Math.min(4, Math.ceil(Number(reportDate.slice(5, 7)) / 3));
  return `Q${quarter} ${year}`;
}

export async function getCompanyFilings(ticker) {
  const company = await getCompanyByTicker(ticker);
  const submissions = await getCompanySubmissions(company);
  const recent = submissions?.filings?.recent ?? [];
  const filings = recent
    .filter((entry) => entry.form === '10-Q' || entry.form === '10-K')
    .filter((entry) => entry.accessionNumber && entry.primaryDocument)
    .slice(0, FILINGS_LIMIT)
    .map((entry) => {
      const accessionNoDashes = entry.accessionNumber.replaceAll('-', '');
      const filedAt = entry.filingDate ?? null;
      return {
        formType: entry.form,
        period: entry.reportDate ?? null,
        periodLabel: filingPeriodLabel(entry.form, entry.reportDate),
        filedAt,
        accession: entry.accessionNumber,
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/${entry.primaryDocument}`,
        documentName: `${company.ticker.toLowerCase()}-${entry.form.replace('10', '')}-${filedAt ? filedAt.slice(0, 4) : accessionNoDashes.slice(0, 4)}.pdf`,
      };
    });
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    filings,
  };
}

export async function getFilingDocumentStream(ticker, accession) {
  const { filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return null;
  try {
    const response = await fetch(filing.documentUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/pdf',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`EDGAR respondió ${response.status}`);
    }
    return {
      url: filing.documentUrl,
      filename: filing.documentName,
      stream: response.body,
      contentType: response.headers.get('content-type') ?? 'application/pdf',
      contentLength: response.headers.get('content-length'),
    };
  } catch (error) {
    const wrapped = new Error(`No se pudo descargar el PDF de EDGAR: ${error.message}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
}

function combineConceptData(usGaap, tags, unit) {
  const byFrame = new Map();
  for (const tag of tags) {
    const unitData = usGaap[tag]?.units?.[unit];
    if (!Array.isArray(unitData)) continue;
    for (const entry of unitData) {
      if (!entry.frame || !classifyFrame(entry.frame)) continue;
      byFrame.set(entry.frame, (byFrame.get(entry.frame) ?? 0) + entry.val);
    }
  }
  if (!byFrame.size) return null;
  return [...byFrame].map(([frame, val]) => ({ frame, val }));
}

function latestFrameOf(unitData) {
  let latest = -Infinity;
  for (const entry of unitData) {
    if (!entry.frame) continue;
    const classified = classifyFrame(entry.frame);
    if (classified && classified.sortKey > latest) latest = classified.sortKey;
  }
  return latest;
}

function pickConceptData(facts, concept) {
  const usGaap = facts?.facts?.['us-gaap'] ?? {};

  let combined = null;
  if (Array.isArray(concept.combine) && concept.combine.length) {
    combined = combineConceptData(usGaap, concept.combine, concept.unit);
  }

  let best = null;
  let bestLatest = -Infinity;

  for (const tag of concept.tags) {
    const tagData = usGaap[tag];
    if (!tagData) continue;
    const unitData = tagData.units?.[concept.unit];
    if (!Array.isArray(unitData) || !unitData.length) continue;

    const latest = latestFrameOf(unitData);
    if (latest > bestLatest) {
      bestLatest = latest;
      best = unitData;
    }
  }

  if (!combined) return best;
  if (!best) return combined;
  return latestFrameOf(combined) >= bestLatest ? combined : best;
}

function classifyFrame(frame) {
  const annual = frame.match(/^CY(\d{4})$/);
  if (annual) return { series: 'annual', key: annual[1], sortKey: Number(annual[1]) * 10, isInstant: false };

  const quarterly = frame.match(/^CY(\d{4})Q([1-4])(I?)$/);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const quarter = Number(quarterly[2]);
    return { series: 'quarterly', key: `${year}-Q${quarter}`, sortKey: year * 10 + quarter, isInstant: quarterly[3] === 'I' };
  }
  return null;
}

function buildSeries(facts) {
  const rows = new Map();

  const setPeriodEnd = (row, end) => {
    if (typeof end === 'string' && (!row.periodEnd || end > row.periodEnd)) row.periodEnd = end;
  };

  const ensureRow = (key, series, sortKey) => {
    if (!rows.has(key)) {
       rows.set(key, { series, sortKey, period: key, periodEnd: null, values: {} });
    }
    return rows.get(key);
  };

  for (const concept of CONCEPTS) {
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;

    for (const entry of unitData) {
      if (entry.frame) {
        const classified = classifyFrame(entry.frame);
        if (classified) {
           const row = ensureRow(classified.key, classified.series, classified.sortKey);
           setPeriodEnd(row, entry.end);
           row.values[concept.key] = entry.val;
        }
      }

      if (entry.fp === 'FY' && typeof entry.end === 'string' && entry.end.length >= 4) {
        const year = entry.end.slice(0, 4);
         const annualRow = ensureRow(year, 'annual', Number(year) * 10);
         setPeriodEnd(annualRow, entry.end);
         annualRow.values[concept.key] = entry.val;
      }
    }
  }

  const all = [...rows.values()].sort((a, b) => b.sortKey - a.sortKey);
  const annual = all.filter((row) => row.series === 'annual').slice(0, 10);
  const quarterly = all.filter((row) => row.series === 'quarterly').slice(0, 8);

  all.forEach((row) => {
    if (row.values.liabilities === undefined && row.values.assets !== undefined && row.values.equity !== undefined) {
      row.values.liabilities = Math.round((row.values.assets - row.values.equity) * 1e6) / 1e6;
    }
    if (row.values.grossProfit === undefined && row.values.revenue !== undefined && row.values.costOfRevenue !== undefined) {
      row.values.grossProfit = Math.round((row.values.revenue - row.values.costOfRevenue) * 1e6) / 1e6;
    }
    if (row.values.assetsNoncurrent === undefined && row.values.assets !== undefined && row.values.currentAssets !== undefined) {
      row.values.assetsNoncurrent = Math.round((row.values.assets - row.values.currentAssets) * 1e6) / 1e6;
    }
    if (row.values.liabilitiesNoncurrent === undefined && row.values.liabilities !== undefined && row.values.currentLiabilities !== undefined) {
      row.values.liabilitiesNoncurrent = Math.round((row.values.liabilities - row.values.currentLiabilities) * 1e6) / 1e6;
    }
  });

  return { annual, quarterly };
}

export async function getCompanyResults(ticker, options = {}) {
  const company = await getCompanyByTicker(ticker);
  const facts = await getCompanyFacts(company);
  const { annual, quarterly } = buildSeries(facts);
  const authenticated = options.authenticated === true;
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    currency: 'USD',
    authenticated,
    statements: publicStatements(),
    annual,
    quarterly,
  };
}
