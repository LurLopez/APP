import { readFile } from 'node:fs/promises';
import { BaseAgent, AgentError } from './baseAgent.js';
import { chatJson, AiProviderError } from '../services/ai/modelProvider.js';
import { getPreviousQuarterCashFlow, getCompanyResults, getHistoricalUnderlyingEps } from '../services/edgar.service.js';

const MAX_CHARS = 80000;
const KNOWLEDGE_DIR = new URL('./knowledge/', import.meta.url);
const PROMPTS_DIR = new URL('./prompts/', import.meta.url);
const SECTOR_FILES = { defensive_consumer: 'consumo-defensivo' };

// Interpreta cifras del informe con separador de miles de la SEC ("(16,615)" -> -16615)
// o con coma decimal ("1784,4" -> 1784,4). La lógica fina vive en parseLooseReportNumber.
function parseFinancialValue(val) {
  if (val == null || val === '—') return NaN;
  const raw = String(val).trim();
  const isParenthesized = /^\(.*\)$/.test(raw);
  const num = parseLooseReportNumber(raw);
  if (!Number.isFinite(num)) return NaN;
  return isParenthesized ? -num : num;
}

function extractTaxCashFlowAdjustment(text) {
  const source = String(text ?? '');
  const match = source.match(/(?:Deferred income taxes and income taxes payable,?\s+net|Deferred income tax(?:es)?\s+provision\s*\/\s*\(benefit\)|Deferred income tax(?:es)?\s+provision\s*\(benefit\)|Deferred income tax(?:es)?\s+expense\s*\(benefit\)|Deferred income tax(?:es)?\s*\(benefit\)\s*expense|Deferred income tax(?:es)?|Deferred taxes)\s+([()\d.,-]+)(?:\s+([()\d.,-]+))?/i);
  if (!match) return null;
  const current = parseFinancialValue(match[1]);
  return Number.isFinite(current) ? current : null;
}

function extractIncomeTaxesPaid(text) {
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

function parseDollarAmount(str) {
  if (str == null) return NaN;
  const unitMatch = String(str).match(/\b(billion|million)\b/i);
  const unit = unitMatch ? unitMatch[1].toLowerCase() : 'million';
  const num = parseFloat(String(str).replace(/[$,]/g, '').trim());
  if (!Number.isFinite(num)) return NaN;
  return Math.round((unit.startsWith('b') ? num * 1000 : num) * 10) / 10;
}

function extractRemainingAuthorization(text) {
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

// Términos del programa de recompra (autorización, fecha y vencimiento) desde el texto completo del 10-K.
function extractRepurchaseProgramTerms(text) {
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

function isPlaceholderText(value) {
  return /no disponible|no consta|no se (?:desglosa|indica|recoge|detalla)|sin datos|no incluido|not available|not disclosed|not stated|no especificad/i.test(String(value ?? ''));
}

// Evita redundancias al componer frases ("por la venta de Venta del negocio...") cuando la
// descripción extraída ya empieza por "venta de/del...".
function cleanAssetDescription(value) {
  const text = String(value ?? '').trim();
  const cleaned = text
    .replace(/^venta\s+(?:del|de la|de las|de los|de)?\.?\s*/i, '')
    .replace(/[.;,\s]+$/, '')
    .trim();
  return cleaned || text;
}

function parseLooseAmount(value) {
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

// Tipo de interés medio ponderado de toda la deuda a partir de la tabla oficial de deuda.
// Si una fila resume un rango de cupones (ej. "3.000 % – 7.125 %") se usa el punto medio
// y se marca el resultado como estimado.
function computeAllDebtAverageRate(secTable) {
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

// Estimación del tipo medio de la deuda cuando el informe no desglosa cupones:
// gasto/intereses pagados del ejercicio dividido por la deuda media del balance.
function computeEstimatedDebtRateFromIncome(annualRow, previousAnnualRow) {
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

function extractCapitalCashFlowFacts(text) {
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

// Entradas de caja por financiación de capital (no deuda): emisión de preferentes y
// venta de participaciones no controladoras manteniendo el control de la filial.
function extractEquityIssuance(text) {
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

// Flujo de caja neto de deuda (emisiones menos amortizaciones) leído de la sección de
// financiación del estado de flujos. Permite aislar la deuda asumida en adquisiciones:
// Δdeuda del balance - flujo de caja de deuda = deuda no-cash (asumida, FX...).
function extractDebtCashFlow(text) {
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
    // Se separan las columnas por tabuladores/espacios dobles y se toma la columna del
    // periodo actual; si es "—" no hay importe y no se debe usar el comparativo del año anterior.
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

function formatFinancialValue(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10).replace('.', ',') : null;
}

// Formatea una cifra en millones con como máximo 2 decimales (coma decimal), evitando
// cadenas con decimales largos que luego se malinterpretan al sumar (ej. 330,356).
function formatCellNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num * 100) / 100;
  return String(rounded).replace('.', ',');
}

// Interpreta cifras que pueden venir del modelo con separador de miles: "1,724" -> 1724,
// "239,5" -> 239,5 y "1.234,5"/"1,234.5" -> 1234,5. Evita sumar -1,724 como -1,724.
function parseLooseReportNumber(value) {
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
  // "330,356" o "1114,201" son importes con decimales (la lectura como miles daría una
  // cifra desorbitada); solo se aplica si el separador aparece una única vez.
  const separatorCount = (raw.match(/[.,]/g) || []).length;
  if (joinedThousands && num > 100000 && separatorCount === 1) {
    const decimalAttempt = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(decimalAttempt) && decimalAttempt < num) num = decimalAttempt;
  }
  return num;
}

// Normaliza una celda numérica a un máximo de 2 decimales (coma decimal) y elimina
// artefactos de coma flotante (ej. 1827.1000000000004 -> "1827,1"). Respeta textos,
// importes con símbolos ("0,95 $"), porcentajes y celdas vacías ("—").
function normalizeNumericCell(value) {
  if (value == null || value === '—') return value;
  const str = String(value).trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(str)) return value;
  const num = parseLooseReportNumber(str);
  if (!Number.isFinite(num)) return value;
  const rounded = Math.round(num * 100) / 100;
  return String(rounded).replace('.', ',');
}

// Los modelos a veces extraen importes en miles de dólares de tablas "(In thousands)".
// Se detectan valores desproporcionados para el tamaño de la compañía (referencia: la mayor
// cifra conocida de la cuenta de resultados) y se convierten a millones dividiendo entre 1000.
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

function normalizeExtractedUnits(extracted) {
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

function formatFiscalEndLabel(periodEnd) {
  const match = String(periodEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = MONTH_NAMES_EN[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

// El campo "period" de las series XBRL de la SEC es la etiqueta del frame (p. ej. CY2025) y
// puede no coincidir con el año natural del cierre (ejercicio cerrado en mayo de 2026 -> period
// "2025"). Se selecciona la fila por la FECHA de cierre para que "anterior" sea siempre el
// ejercicio inmediatamente anterior y nunca la fila del propio ejercicio analizado.
export function selectAnnualRows(annualSeries, { reportingPeriod, reportYear } = {}) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) {
    return { currentAnnualRow: null, previousAnnualRow: null };
  }
  const rowEndYear = (row) => {
    const match = String(row?.periodEnd ?? '').match(/^(20\d\d)/);
    return match ? Number(match[1]) : null;
  };
  const reportEndYear = /^\d{4}/.test(String(reportingPeriod ?? ''))
    ? Number(String(reportingPeriod).slice(0, 4))
    : null;
  const currentAnnualRow = (reportEndYear != null
    ? annualSeries.find((row) => rowEndYear(row) === reportEndYear)
    : null)
    || annualSeries.find((row) => Number(row.period) === Number(reportYear))
    || annualSeries[0]
    || null;
  const currentEndYear = rowEndYear(currentAnnualRow) ?? Number(currentAnnualRow?.period);
  const previousAnnualRow = (Number.isFinite(currentEndYear)
    ? (annualSeries.find((row) => row !== currentAnnualRow && rowEndYear(row) === currentEndYear - 1)
      || annualSeries.find((row) => row !== currentAnnualRow && Number(row.period) === currentEndYear - 1)
      || annualSeries.find((row) => row !== currentAnnualRow && (rowEndYear(row) ?? Number(row.period)) < currentEndYear))
    : null)
    || null;
  return { currentAnnualRow, previousAnnualRow };
}

// Serie de acciones en circulación al cierre de cada ejercicio desde SEC XBRL.
function buildSharesHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const hasOutstanding = annualSeries.some((row) => Number(row?.values?.sharesOutstanding) > 0);
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const raw = hasOutstanding
        ? Number(row?.values?.sharesOutstanding)
        : Number(row?.values?.weightedSharesBasic ?? row?.values?.weightedSharesDiluted);
      if (!Number.isFinite(year) || !Number.isFinite(raw) || raw <= 0) return null;
      return { year, shares: Math.round((raw / 1e6) * 10) / 10 };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length >= 2 ? unique.slice(-5) : null;
}

// Serie anual de recompras de acciones (estado de flujos de caja) desde SEC XBRL.
function buildRepurchaseHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const raw = Number(row?.values?.buybacks);
      if (!Number.isFinite(year) || !Number.isFinite(raw) || Math.abs(raw) <= 0) return null;
      return { year, end: row?.periodEnd ?? null, amount: Math.round((Math.abs(raw) / 1e6) * 10) / 10 };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length ? unique.slice(-5) : null;
}

// Serie anual de acciones recompradas (número de títulos) desde XBRL, cuando la compañía lo etiqueta.
function buildRepurchaseSharesHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const raw = Number(row?.values?.buybackShares);
      if (!Number.isFinite(year) || !Number.isFinite(raw) || Math.abs(raw) <= 0) return null;
      // Se conserva el número exacto de títulos (no millones) para que la tabla muestre
      // la cifra oficial sin pérdida de precisión.
      return { year, end: row?.periodEnd ?? null, shares: Math.round(Math.abs(raw)) };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length ? unique.slice(-5) : null;
}

// Añade el número de acciones recompradas a la serie de costes de recompra por año.
function mergeRepurchaseShares(repurchaseHistory, sharesHistory) {
  if (!Array.isArray(repurchaseHistory) || !Array.isArray(sharesHistory)) return repurchaseHistory;
  const sharesByYear = new Map(sharesHistory.map((point) => [Number(point?.year), Number(point?.shares)]));
  repurchaseHistory.forEach((point) => {
    const shares = sharesByYear.get(Number(point?.year));
    if (Number.isFinite(shares) && shares > 0) point.shares = shares;
  });
  return repurchaseHistory;
}

// Serie anual de dividendos desde XBRL: dividendo por acción, importe total y BPA diluido.
function buildDividendHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const values = row?.values ?? {};
      const dps = Number(values.dividendPerShare);
      const rawTotal = Math.abs(Number(values.dividendsCommon ?? values.dividends));
      const eps = Number(values.epsDiluted);
      if (!Number.isFinite(year)) return null;
      const hasDps = Number.isFinite(dps) && dps > 0;
      const hasTotal = Number.isFinite(rawTotal) && rawTotal > 0;
      if (!hasDps && !hasTotal) return null;
      return {
        year,
        dps: hasDps ? Math.round(dps * 100) / 100 : null,
        total: hasTotal ? Math.round((rawTotal > 1e6 ? rawTotal / 1e6 : rawTotal) * 10) / 10 : null,
        eps: Number.isFinite(eps) ? Math.round(eps * 100) / 100 : null,
      };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length >= 2 ? unique.slice(-5) : null;
}

// Fusiona el histórico de dividendos: XBRL manda en dps/total/BPA reportado y la IA aporta el BPA ajustado.
function mergeDividendHistory(primary, fallback) {
  const map = new Map();
  [...(Array.isArray(fallback) ? fallback : [])].forEach((point) => {
    const year = Number(point?.year);
    if (Number.isFinite(year)) map.set(year, { ...point });
  });
  [...(Array.isArray(primary) ? primary : [])].forEach((point) => {
    const year = Number(point?.year);
    if (!Number.isFinite(year)) return;
    const existing = map.get(year);
    if (!existing) {
      map.set(year, { ...point });
      return;
    }
    if (existing.adjustedEps == null && point.adjustedEps != null) existing.adjustedEps = point.adjustedEps;
    if (existing.dps == null && point.dps != null) existing.dps = point.dps;
    if (existing.total == null && point.total != null) existing.total = point.total;
  });
  return [...map.values()].sort((a, b) => Number(a.year) - Number(b.year));
}

// Fusiona historiales por año: el respaldo (EDGAR) manda y el primario rellena huecos.
function mergeHistoryByYear(primary, fallback) {
  const map = new Map();
  [...(Array.isArray(fallback) ? fallback : [])].forEach((point) => {
    const year = Number(point?.year);
    if (Number.isFinite(year)) map.set(year, point);
  });
  [...(Array.isArray(primary) ? primary : [])].forEach((point) => {
    const year = Number(point?.year);
    if (Number.isFinite(year) && !map.has(year)) map.set(year, point);
  });
  return [...map.values()].sort((a, b) => Number(a.year) - Number(b.year));
}

const sharesFormatter = new Intl.NumberFormat('en-US');

function formatRepurchaseShares(shares) {
  if (!Number.isFinite(Number(shares)) || Number(shares) <= 0) return '—';
  // Acepta el número exacto de títulos o una cifra en millones (p. ej. 12,9).
  const inShares = Number(shares) >= 1e6 ? Number(shares) : Number(shares) * 1e6;
  return sharesFormatter.format(Math.round(inShares));
}

// Precio medio pagado ($/acción) a partir del coste agregado en $M y el número de títulos.
function repurchaseAveragePrice(amount, shares) {
  const cost = Number(amount);
  const titles = Number(shares);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(titles) || titles <= 0) return null;
  const exactTitles = titles >= 1e6 ? titles : titles * 1e6;
  return (cost * 1e6) / exactTitles;
}

// Tabla SEC multianual de recompras cuando el 10-K no trae tabla propia.
// Incluye acciones recompradas y precio medio pagado cuando la serie los aporta.
function buildRepurchaseSecTable(repurchaseHistory, remainingAuthorization) {
  const entries = [...(Array.isArray(repurchaseHistory) ? repurchaseHistory : [])]
    .filter((point) => Number.isFinite(Number(point?.year)) && Number.isFinite(Number(point?.amount)) && Number(point.amount) > 0)
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 5);
  if (!entries.length) return null;
  const headers = ['', ...entries.map((point) => formatFiscalEndLabel(point.end) ?? String(point.year))];
  const hasShares = entries.some((point) => Number.isFinite(Number(point?.shares)) && Number(point?.shares) > 0);
  const rows = [];
  if (hasShares) {
    rows.push(['Shares repurchased', ...entries.map((point) => formatRepurchaseShares(point.shares))]);
  }
  rows.push(['Aggregate cost (in millions)', ...entries.map((point) => `$${String(point.amount).replace('.', ',')}`)]);
  if (hasShares) {
    rows.push([
      'Average price paid (in $)',
      ...entries.map((point) => {
        const price = repurchaseAveragePrice(point?.amount, point?.shares);
        return price != null ? `$${price.toFixed(1).replace('.', ',')}` : '—';
      }),
    ]);
  }
  const table = {
    title: 'Share Repurchase Program (Form 10-K)',
    summary: 'Tabla oficial de recompras anuales del Form 10-K',
    headers,
    rows,
  };
  const remaining = Number(remainingAuthorization);
  if (Number.isFinite(remaining) && remaining > 0) {
    table.rows.push([
      'Remaining authorization (in millions)',
      `$${String(remaining).replace('.', ',')}`,
      ...entries.slice(1).map(() => '—'),
    ]);
  }
  return table;
}

// Completa una tabla de recompras ya extraída con las acciones recompradas y el precio
// medio pagado cuando el sistema dispone de esa serie (XBRL) y la tabla no las trae.
function enrichRepurchaseSnippet(snippet, repurchaseHistory, remainingAuthorization) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  const rowName = (row) => String(Array.isArray(row) ? row[0] : (row?.metric ?? row?.name) ?? '');
  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  const rows = snippet.rows.map((row) => (Array.isArray(row) ? [...row] : [row?.metric ?? row?.name, row?.value]));
  const width = Math.max(headers.length || 0, rows[0]?.length || 0);
  const yearByColumn = headers.map((header) => {
    const match = String(header ?? '').match(/(20\d\d)/);
    return match ? match[1] : null;
  });

  // Fila de remanente de autorización si el sistema lo conoce y la tabla no la trae.
  const hasRemainingRow = rows.some((row) => /remaining authorization|autorizaci[oó]n remanente|remanente de autorizaci/i.test(String(row[0])));
  const remainingValue = Number(remainingAuthorization);
  if (!hasRemainingRow && Number.isFinite(remainingValue) && remainingValue > 0) {
    let latestColumn = 1;
    let bestYear = -Infinity;
    yearByColumn.forEach((year, index) => {
      if (!year) return;
      const value = Number(year);
      if (value > bestYear) {
        bestYear = value;
        latestColumn = index;
      }
    });
    const remainingRow = new Array(width).fill('—');
    remainingRow[0] = 'Remaining authorization (in millions)';
    remainingRow[latestColumn] = `$${String(remainingValue).replace('.', ',')}`;
    rows.push(remainingRow);
  }

  const sharesByYear = new Map(
    (Array.isArray(repurchaseHistory) ? repurchaseHistory : [])
      .filter((point) => Number.isFinite(Number(point?.shares)) && Number(point?.shares) > 0)
      .map((point) => [String(point.year), Number(point.shares)]),
  );
  if (!sharesByYear.size) return { ...snippet, rows };

  const hasSharesRow = rows.some((row) => /shares repurchased/i.test(rowName(row)));
  const hasCostRow = rows.some((row) => /aggregate cost/i.test(rowName(row)));
  const hasPriceRow = rows.some((row) => /average price/i.test(rowName(row)));

  if (!hasSharesRow && hasCostRow) {
    const costRow = rows.find((row) => /aggregate cost/i.test(String(row[0])));
    const sharesRow = ['Shares repurchased', ...costRow.slice(1).map((_, index) => {
      const year = yearByColumn[index + 1];
      const shares = year ? sharesByYear.get(year) : null;
      return Number.isFinite(shares) && shares > 0 ? formatRepurchaseShares(shares) : '—';
    })];
    rows.unshift(sharesRow);
  }

  if (!hasPriceRow) {
    const sharesRow = rows.find((row) => /shares repurchased/i.test(String(row[0])));
    const costRow = rows.find((row) => /aggregate cost/i.test(String(row[0])));
    if (sharesRow && costRow) {
      const priceRow = ['Average price paid (in $)', ...costRow.slice(1).map((costCell, index) => {
        const cost = parseLooseAmount(costCell);
        const sharesText = String(sharesRow[index + 1] ?? '');
        const shares = Number(sharesText.replace(/,/g, ''));
        const price = repurchaseAveragePrice(cost, shares);
        return price != null ? `$${price.toFixed(1).replace('.', ',')}` : '—';
      })];
      rows.push(priceRow);
    }
  }

  return { ...snippet, rows };
}

function buildFutureProjectionText({ remainingAuthorization, averagePrice, sharesHistory }) {
  const remaining = Number(remainingAuthorization);
  const price = Number(averagePrice);
  if (!Number.isFinite(remaining) || remaining <= 0 || !Number.isFinite(price) || price <= 0) return null;
  const sharesToRepurchase = remaining / price;
  const perYear = sharesToRepurchase / 5;
  const points = [...(Array.isArray(sharesHistory) ? sharesHistory : [])]
    .map((point) => Number(point?.shares))
    .filter((value) => Number.isFinite(value) && value > 0);
  const lastShares = points.length ? points[points.length - 1] : null;
  const annualPct = lastShares ? (perYear / lastShares) * 100 : null;
  const bpaPct = annualPct != null ? (annualPct / (100 - annualPct)) * 100 : null;
  const fmt = (value) => String(value.toFixed(1)).replace('.', ',');
  if (annualPct == null) {
    return `Proyección a 5 años: con ~${formatFinancialValue(remaining)}M de autorización restante y un precio medio de ~${fmt(price)} $, se podrían recomprar ~${fmt(sharesToRepurchase)}M de acciones (~${fmt(perYear)}M/año).`;
  }
  return `Proyección a 5 años: con ~${formatFinancialValue(remaining)}M de autorización restante y un precio medio de ~${fmt(price)} $, se podrían recomprar ~${fmt(sharesToRepurchase)}M de acciones (~${fmt(perYear)}M/año), lo que reduciría el capital un ~${fmt(annualPct)} % anual e impulsaría el BPA ~${fmt(bpaPct)} % cada año.`;
}

function buildShareCountEvolutionText(sharesHistory) {
  const points = [...(Array.isArray(sharesHistory) ? sharesHistory : [])]
    .map((point) => ({ year: Number(point?.year), shares: Number(point?.shares) }))
    .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.shares) && point.shares > 0)
    .sort((a, b) => a.year - b.year);
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  const curr = points[points.length - 1];
  const pct = ((curr.shares - prev.shares) / prev.shares) * 100;
  const fmtShares = (value) => String(Math.round(value * 10) / 10).replace('.', ',');
  const fmtPct = `${pct < 0 ? '-' : '+'}${Math.abs(pct).toFixed(1).replace('.', ',')} %`;
  return `De ${fmtShares(prev.shares)}M de acciones al cierre de ${prev.year} a ${fmtShares(curr.shares)}M al cierre de ${curr.year} (${fmtPct})`;
}

function getTaxNormalizationData({ extracted, horizon, isTrimestral }) {
  const facts = extracted.facts ?? {};
  const ebtRow = horizon.sales?.rows?.find((row) => String(row.name).toLowerCase().includes('ebt'));
  const netRow = horizon.sales?.rows?.find((row) => String(row.name).toLowerCase().includes('neto'));
  const ebtReported = parseFinancialValue(ebtRow?.normal);
  let ebtAdjusted = parseFinancialValue(ebtRow?.adjusted);
  const netReported = parseFinancialValue(netRow?.normal);

  if (!Number.isFinite(ebtAdjusted) && Number.isFinite(ebtReported)) {
    const impairments = Number(facts[isTrimestral ? 'impairmentsQuarter' : 'impairmentsYtd']) || 0;
    ebtAdjusted = ebtReported + impairments;
  }

  const normalizedRate = 0.23;
  if (!Number.isFinite(ebtAdjusted) || ebtAdjusted <= 0) {
    return null;
  }

  const normalizedCashTaxes = Math.round(ebtAdjusted * normalizedRate * 10) / 10;

  // 1. Pago directo de impuestos en efectivo (declarado en cash flow o notas)
  let cashTaxesPaid = Number(facts[isTrimestral ? 'incomeTaxesPaidQuarter' : 'incomeTaxesPaidYtd']);
  if (!Number.isFinite(cashTaxesPaid) || cashTaxesPaid <= 0) {
    const rawText = extracted._rawText || extracted.text || '';
    if (rawText) {
      const extractedPaid = extractIncomeTaxesPaid(rawText);
      if (Number.isFinite(extractedPaid) && extractedPaid > 0) {
        cashTaxesPaid = extractedPaid;
      }
    }
  }

  // 2. Método indirecto: gasto fiscal en PyG menos ajuste fiscal del cash flow (impuestos diferidos)
  const rawTaxCfoAdjustment = facts[isTrimestral ? 'taxCashFlowAdjustmentQuarter' : 'taxCashFlowAdjustmentYtd'];
  const taxCfoAdjustment = Number(rawTaxCfoAdjustment);
  const taxExpense = Number(facts[isTrimestral ? 'incomeTaxExpenseQuarter' : 'incomeTaxExpenseYtd']);
  const reportedTax = Number.isFinite(taxExpense)
    ? taxExpense
    : (Number.isFinite(ebtReported) && Number.isFinite(netReported) ? ebtReported - netReported : NaN);

  if (!Number.isFinite(cashTaxesPaid) || cashTaxesPaid <= 0) {
    if (Number.isFinite(reportedTax) && Number.isFinite(taxCfoAdjustment) && rawTaxCfoAdjustment != null && rawTaxCfoAdjustment !== 0) {
      cashTaxesPaid = Math.abs(reportedTax - taxCfoAdjustment);
    }
  }

  if (!Number.isFinite(cashTaxesPaid) || cashTaxesPaid <= 0) {
    return null;
  }

  // Ajuste al Cash Flow:
  // Si debería haber pagado 318,6M (319M) y en efectivo solo ha pagado 131,4M,
  // la empresa ha pagado 187,2M de menos, inflando temporalmente el cash flow operativo reportado.
  // En el Cash Flow Ajustado se resta esa diferencia:
  // adjustment = cashTaxesPaid - normalizedCashTaxes = 131,4 - 318,6 = -187,2M.
  const adjustment = Math.round((cashTaxesPaid - normalizedCashTaxes) * 10) / 10;
  if (Math.abs(adjustment) < 0.5) return null;

  const normTaxText = `${formatFinancialValue(normalizedCashTaxes)}M`;
  const paidTaxText = `${formatFinancialValue(cashTaxesPaid)}M`;
  const adjText = `${adjustment >= 0 ? '+' : ''}${formatFinancialValue(adjustment)}M`;

  return {
    reportedTax,
    taxCfoAdjustment: Number.isFinite(taxCfoAdjustment) ? taxCfoAdjustment : null,
    cashTaxesPaid,
    normalizedRate,
    normalizedCashTaxes,
    adjustment,
    explanation: `Impuestos: La empresa debería haber pagado ${normTaxText} en impuestos (23 % sobre el EBT ajustado de ${formatFinancialValue(ebtAdjusted)}M) y solamente ha pagado ${paidTaxText} en efectivo según el estado de flujos. Ajuste de ${adjText} al Cash Flow Ajustado por la discrepancia fiscal.`,
  };
}

function buildDebtDetails({ prev, curr, prevCash, currCash, prevSti, currSti, fallback }) {
  if (prev != null && curr != null) {
    const diff = Math.round((curr - prev) * 10) / 10;
    let netPart = '';
    if (prevCash != null && currCash != null) {
      const prevNet = Math.round((prev - prevCash - (prevSti ?? 0)) * 10) / 10;
      const currNet = Math.round((curr - currCash - (currSti ?? 0)) * 10) / 10;
      const diffNet = Math.round((currNet - prevNet) * 10) / 10;
      netPart = `. Deuda neta: ${prevNet}M -> ${currNet}M (${diffNet > 0 ? '+' : ''}${diffNet}M)`;
    }
    return `Deuda balance: ${prev}M -> ${curr}M (${diff > 0 ? '+' : ''}${diff}M)${netPart}`;
  }
  return fallback ?? null;
}

// Explica el movimiento real de caja y su traslado a la fila "Caja", para que el signo quede
// inequívoco: caja ↑ = uso de capital (-) / caja ↓ = fuente de liquidez (+). Se etiquetan los
// saldos con su ejercicio para que no se confundan con la columna comparativa del 10-K.
function buildCashMovementDetails({ prev, curr, caja, periodYear, statementChange }) {
  if (prev == null || curr == null) return null;
  const delta = Math.round((curr - prev) * 10) / 10;
  const deltaText = `${delta > 0 ? '+' : ''}${formatWcNumber(delta)}M`;
  const rowValue = caja != null ? `${Number(caja) > 0 ? '+' : ''}${formatWcNumber(caja)}M` : '—';
  const year = Number(periodYear);
  const prevLabel = Number.isFinite(year) ? ` (${year - 1})` : '';
  const currLabel = Number.isFinite(year) ? ` (${year})` : '';
  const meaning = delta >= 0 ? 'la caja aumentó: uso de capital (-)' : 'la caja disminuyó: fuente de liquidez (+)';
  let statementNote = '';
  const statement = Number(statementChange);
  if (Number.isFinite(statement) && Math.abs(statement - delta) >= 1) {
    const diff = Math.round((statement - delta) * 10) / 10;
    statementNote = ` El estado de flujos presenta un neto de ${formatWcNumber(statement)}M porque incluye efectivo restringido y otros ajustes (${diff > 0 ? '+' : ''}${formatWcNumber(diff)}M frente a la caja del balance).`;
  }
  return `Caja balance: ${formatWcNumber(prev)}M${prevLabel} -> ${formatWcNumber(curr)}M${currLabel} (${deltaText}); ${meaning}; fila Caja = ${rowValue}.${statementNote}`;
}

export function withOutlookComparison(snippet, report) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  const rawHeaders = Array.isArray(snippet.headers) ? snippet.headers : [];
  if (rawHeaders.length >= 4) return snippet;

  let nextYear = 2026;
  const titleMatch = (snippet.title || '').match(/20\d\d/);
  if (titleMatch) nextYear = parseInt(titleMatch[0], 10);
  else if (rawHeaders[1] && rawHeaders[1].match(/20\d\d/)) nextYear = parseInt(rawHeaders[1].match(/20\d\d/)[0], 10);
  else if (report?.fiscalYear) nextYear = report.fiscalYear + 1;
  const prevYear = nextYear - 1;

  const h0 = report?.horizons?.[0];
  const salesRows = h0?.sales?.rows || [];
  const cfRows = h0?.cashFlow?.rows || [];

  const parseNum = (val) => {
    if (val == null) return null;
    let s = String(val).replace(/[^0-9.,\-]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const fmtMoney = (n) => {
    if (n == null || !Number.isFinite(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US') + 'M';
  };

  const fmtEps = (n) => {
    if (n == null || !Number.isFinite(n)) return '—';
    return '$' + n.toFixed(2);
  };

  const getSalesRow = (name) => salesRows.find((r) => (r.name || '').toLowerCase().includes(name.toLowerCase()));
  const getCfRow = (name) => cfRows.find((r) => (r.name || '').toLowerCase().includes(name.toLowerCase()));

  const prevSalesRow = getSalesRow('Ventas');
  const prevSalesVal = parseNum(prevSalesRow?.adjusted || prevSalesRow?.normal);

  const prevEbtRow = getSalesRow('EBT');
  const prevEbtVal = parseNum(prevEbtRow?.adjusted || prevEbtRow?.normal);

  const prevFcfRow = getCfRow('FCF');
  const prevFcfVal = parseNum(prevFcfRow?.values?.[0]);
  const prevFcfAdjVal = parseNum(prevFcfRow?.values?.[1]);

  const prevCapexRow = getCfRow('CAPEX');
  const prevCapexVal = parseNum(prevCapexRow?.values?.[0]);

  const prevEpsVal = parseNum(h0?.sales?.eps) || (prevEbtVal ? prevEbtVal / (parseNum(h0?.sales?.shares) || 200) : null);

  const newHeaders = [
    rawHeaders[0] || 'Métrica',
    `${prevYear} (Año anterior)`,
    rawHeaders[1] || `Guidance ${nextYear}E*`,
    `Cifra Proyectada ${nextYear}E`,
  ];

  const newRows = snippet.rows.map((row) => {
    const metric = Array.isArray(row) ? row[0] : (row.metric ?? row.name);
    const guidance = Array.isArray(row) ? row[1] : row.value;
    if (Array.isArray(row) && row.length >= 4) return row;

    const m = String(metric).toLowerCase();
    const g = String(guidance ?? '');

    let prevStr = '—';
    let projStr = '—';

    // 1. Net Sales / Ventas
    if (/sales|ventas|revenue/i.test(m)) {
      if (prevSalesVal) prevStr = fmtMoney(prevSalesVal);
      if (/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i.test(g)) {
        const pct = parseFloat(g.match(/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i)[1].replace(',', '.')) / 100;
        if (prevSalesVal) {
          const low = prevSalesVal * (1 - pct);
          const high = prevSalesVal * (1 + pct);
          projStr = `~${fmtMoney(low)} – ${fmtMoney(high)}`;
        } else {
          projStr = `En línea con ${prevYear}`;
        }
      } else if (/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i.test(g)) {
        const match = g.match(/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i);
        let p1 = parseFloat(match[1].replace(',', '.')) / 100;
        let p2 = parseFloat(match[2].replace(',', '.')) / 100;
        if (/decline|caída|descenso/i.test(g) || g.includes('(')) {
          p1 = -Math.abs(p1);
          p2 = -Math.abs(p2);
        }
        const minP = Math.min(p1, p2), maxP = Math.max(p1, p2);
        if (prevSalesVal) {
          projStr = `~${fmtMoney(prevSalesVal * (1 + minP))} – ${fmtMoney(prevSalesVal * (1 + maxP))}`;
        }
      }
    }
    // 2. EBT / Income Before Taxes / Operating Income
    else if (/income before|ebt|operating income|beneficio/i.test(m)) {
      if (prevEbtVal) prevStr = `${fmtMoney(prevEbtVal)} (adj)`;
      if (/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i.test(g)) {
        const match = g.match(/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i);
        let p1 = parseFloat(match[1].replace(',', '.')) / 100;
        let p2 = parseFloat(match[2].replace(',', '.')) / 100;
        if (/decline|caída|descenso/i.test(g) || g.includes('(')) {
          p1 = -Math.abs(p1);
          p2 = -Math.abs(p2);
        }
        const minP = Math.min(p1, p2), maxP = Math.max(p1, p2);
        if (prevEbtVal) {
          projStr = `~${fmtMoney(prevEbtVal * (1 + minP))} – ${fmtMoney(prevEbtVal * (1 + maxP))}`;
        }
      }
    }
    // 3. EPS / BPA
    else if (/eps|earnings per share|bpa/i.test(m)) {
      if (prevEpsVal) prevStr = fmtEps(prevEpsVal);
      if (/\$?([0-9.,]+)\s*(?:to|a|-)\s*\$?([0-9.,]+)/i.test(g) && !g.includes('%')) {
        const match = g.match(/\$?([0-9.,]+)\s*(?:to|a|-)\s*\$?([0-9.,]+)/i);
        projStr = `$${parseFloat(match[1].replace(',', '.'))} – $${parseFloat(match[2].replace(',', '.'))}`;
      } else if (/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i.test(g)) {
        const match = g.match(/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i);
        let p1 = parseFloat(match[1].replace(',', '.')) / 100;
        let p2 = parseFloat(match[2].replace(',', '.')) / 100;
        if (/decline|caída|descenso/i.test(g) || g.includes('(')) {
          p1 = -Math.abs(p1);
          p2 = -Math.abs(p2);
        }
        const minP = Math.min(p1, p2), maxP = Math.max(p1, p2);
        if (prevEpsVal) {
          projStr = `~${fmtEps(prevEpsVal * (1 + minP))} – ${fmtEps(prevEpsVal * (1 + maxP))}`;
        }
      }
    }
    // 4. Free Cash Flow
    else if (/free cash flow|fcf/i.test(m)) {
      prevStr = prevFcfVal ? (prevFcfAdjVal ? `${fmtMoney(prevFcfVal)} / ${fmtMoney(prevFcfAdjVal)} (adj)` : fmtMoney(prevFcfVal)) : '—';
      if (/\$([0-9.,]+)\s*B\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
        const match = g.match(/\$([0-9.,]+)\s*B\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
        const base = parseFloat(match[1].replace(',', '.')) * 1000;
        const pct = parseFloat(match[2].replace(',', '.')) / 100;
        projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
      } else if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
        const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
        const base = parseFloat(match[1].replace(',', '.'));
        const pct = parseFloat(match[2].replace(',', '.')) / 100;
        projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
      } else if (/100\s*%/i.test(g)) {
        projStr = prevEbtVal ? `~${fmtMoney(prevEbtVal * 0.75)} (conversión ~100 %)` : '~100 % conversión';
      }
    }
    // 5. Depreciation & Amortization
    else if (/depreciation|amorti/i.test(m)) {
      prevStr = '—';
      if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
        const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
        const base = parseFloat(match[1].replace(',', '.'));
        const pct = parseFloat(match[2].replace(',', '.')) / 100;
        projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
      }
    }
    // 6. Net Interest Expense
    else if (/interest/i.test(m)) {
      prevStr = '—';
      if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
        const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
        const base = parseFloat(match[1].replace(',', '.'));
        const pct = parseFloat(match[2].replace(',', '.')) / 100;
        projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
      } else if (/\$?([0-9.,]+)\s*M/i.test(g)) {
        projStr = g;
      }
    }
    // 7. Effective Tax Rate
    else if (/tax rate|impuesto|tasa/i.test(m)) {
      prevStr = '—';
      projStr = g;
    }
    // 8. Capital Expenditures / CAPEX
    else if (/capex|capital expend/i.test(m)) {
      prevStr = prevCapexVal ? fmtMoney(prevCapexVal) : '—';
      if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
        const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
        const base = parseFloat(match[1].replace(',', '.'));
        const pct = parseFloat(match[2].replace(',', '.')) / 100;
        projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
      }
    } else {
      projStr = g;
    }

    return [metric, prevStr, guidance, projStr];
  });

  return {
    ...snippet,
    headers: newHeaders,
    rows: newRows,
  };
}

// Completa la columna "[AÑO-1] (Año anterior)" de la tabla de guidance cuando el modelo la
// dejó vacía ("—"), usando los valores del ejercicio cerrado extraídos del 10-K / 8-K. Si el
// dato no consta, la celda se queda como estaba: nunca se inventa una cifra.
export function completeOutlookPriorColumn(snippet, extractionOutlook) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  // Solo se completa el formato estándar de 4 columnas; con otras distribuciones el índice
  // de la columna "Año anterior" no es fiable.
  if (headers.length !== 4) return snippet;
  const priorIdx = 1;

  const fmtMoney = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return null;
    const rounded = Math.round(num * 10) / 10;
    return `$${rounded.toLocaleString('en-US')}M`;
  };
  const fmtDecimal = (value, digits = 2) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return null;
    return `$${num.toFixed(digits)}`;
  };
  const fmtPercent = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return null;
    return `${String(num).replace('.', ',')}%`;
  };

  const out = extractionOutlook ?? {};
  const rules = [
    { re: /free cash flow conversion|conversi[oó]n/i, value: out.priorYearFcfConversion, fmt: fmtPercent },
    { re: /free cash flow|fcf/i, value: out.priorYearFcf, fmt: fmtMoney },
    { re: /operating margin|margen/i, value: out.priorYearOperatingMargin, fmt: fmtPercent },
    { re: /net sales|ventas|revenue|organic/i, value: out.priorYearSales, fmt: fmtMoney },
    { re: /income before|ebt/i, value: out.priorYearEbt, fmt: fmtMoney },
    { re: /eps|bpa|earnings per share/i, value: out.priorYearEps, fmt: fmtDecimal },
    { re: /capital expenditures|capex|capital expend/i, value: out.priorYearCapex, fmt: fmtMoney },
    { re: /interest/i, value: out.priorYearNetInterest, fmt: fmtMoney, override: true },
  ];

  const rows = snippet.rows.map((row) => {
    if (!Array.isArray(row) || row.length < 4) return row;
    const current = String(row[priorIdx] ?? '').trim();
    const isEmpty = !current || current === '—' || current === '-';
    const metric = String(row[0] ?? '');
    for (const rule of rules) {
      if (!rule.re.test(metric)) continue;
      if (!isEmpty && !rule.override) break;
      const filled = rule.fmt(rule.value);
      if (!filled) break;
      const next = [...row];
      next[priorIdx] = filled;
      return next;
    }
    return row;
  });

  return { ...snippet, rows };
}

// Une a la tabla final de guidance las filas oficiales extraídas del 10-K / 8-K que el modelo
// de estructuración haya podido omitir (p. ej. conversión de FCF o gasto neto por intereses).
// Solo se fusiona cuando la tabla de extracción ya trae el formato de 4 columnas, para no
// descolocar valores entre columnas distintas.
export function mergeOutlookRows(finalSnippet, extractionSnippet) {
  if (!finalSnippet || !Array.isArray(finalSnippet.rows)) return finalSnippet;
  const finalHeaders = Array.isArray(finalSnippet.headers) ? finalSnippet.headers : [];
  // La fusión solo es segura en el formato estándar de 4 columnas.
  if (finalHeaders.length !== 4) return finalSnippet;
  const exHeaders = Array.isArray(extractionSnippet?.headers) ? extractionSnippet.headers : [];
  const exRows = Array.isArray(extractionSnippet?.rows) ? extractionSnippet.rows : [];
  if (exHeaders.length < 4 || !exRows.length) return finalSnippet;
  const headerCount = 4;
  const keyOf = (label) => String(label ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(net|underlying|adjusted|adj|organic|growth|change|revenue|total|vs|fy\d{2,4}|20\d{2})\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  const finalByKey = new Map();
  finalSnippet.rows.forEach((row) => {
    finalByKey.set(keyOf(Array.isArray(row) ? row[0] : row?.metric), row);
  });
  const orderedRows = [];
  const usedKeys = new Set();
  for (const row of exRows) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const key = keyOf(row[0]);
    if (finalByKey.has(key)) {
      orderedRows.push(finalByKey.get(key));
      usedKeys.add(key);
      continue;
    }
    if (!key || usedKeys.has(key)) continue;
    const padded = [...row];
    while (padded.length < headerCount) padded.push('—');
    orderedRows.push(padded.slice(0, headerCount));
    usedKeys.add(key);
  }
  // Las filas finales que no aparezcan en la tabla oficial se conservan al final.
  finalSnippet.rows.forEach((row) => {
    const key = keyOf(Array.isArray(row) ? row[0] : row?.metric);
    if (!usedKeys.has(key)) orderedRows.push(row);
  });
  return orderedRows.length ? { ...finalSnippet, rows: orderedRows } : finalSnippet;
}

function buildCapitalAllocationFromBalance(extracted) {
  const bal = extracted.balance ?? {};
  const invDiff3M = (bal.shortTermInvestments != null && bal.shortTermInvestmentsPreviousQuarter != null)
    ? Number(bal.shortTermInvestments) - Number(bal.shortTermInvestmentsPreviousQuarter)
    : 0;
  const invDiffYtd = (bal.shortTermInvestments != null)
    ? Number(bal.shortTermInvestments) - (bal.shortTermInvestmentsBeginningOfYear != null ? Number(bal.shortTermInvestmentsBeginningOfYear) : 0)
    : 0;
  const rawDivYtd = Number(extracted.facts?.brandDivestitures) || 0;
  const buybacksYtd = Number(extracted.facts?.shareBuybacks) || 0;
  const marketablePurchasesQuarter = Number(extracted.facts?.purchasesOfMarketableSecuritiesQuarter) || 0;
  const marketablePurchasesYtd = Number(extracted.facts?.purchasesOfMarketableSecuritiesYtd) || 0;
  const marketableProceedsQuarter = Number(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesQuarter) || 0;
  const marketableProceedsYtd = Number(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesYtd) || 0;
  const acquisitionsQuarter = Number(extracted.facts?.acquisitionsQuarter) || 0;
  const acquisitionsYtd = Number(extracted.facts?.acquisitionsYtd) || 0;
  const assetSalesQuarter = Number(extracted.facts?.assetSalesQuarter) || 0;
  const assetSalesYtd = Number(extracted.facts?.assetSalesYtd) || 0;
  const acquisitionDescription = extracted.facts?.acquisitionDescription ?? null;
  const divestitureDescription = extracted.facts?.divestitureDescription ?? null;
  const preferredYtdRaw = Number(extracted.facts?.preferredIssuanceYtd) || 0;
  const nonControllingYtdRaw = Number(extracted.facts?.nonControllingSaleYtd) || 0;
  const debtCashYtdRaw = Number(extracted.facts?.debtCashFlowYtd);
  const fiscalQuarterNumber = Number(extracted.fiscalQuarter);
  const debtDeltaYtd = (bal.totalDebt != null && bal.totalDebtBeginningOfYear != null)
    ? Number(bal.totalDebt) - Number(bal.totalDebtBeginningOfYear)
    : null;
  const assumedDebtYtd = (debtDeltaYtd != null && Number.isFinite(debtCashYtdRaw) && acquisitionsYtd >= 50)
    ? Math.round((debtDeltaYtd - debtCashYtdRaw) * 10) / 10
    : 0;
  // Efectivo restringido/escrow: mismo signo que Caja (si baja, libera caja: +).
  const restrictedCurr = Number(extracted.balance?.restrictedCash);
  const restrictedPrevious = Number(extracted.balance?.restrictedCashPreviousQuarter);
  const restrictedStart = Number(extracted.balance?.restrictedCashBeginningOfYear);
  const restrictedDiff3M = (Number.isFinite(restrictedCurr) && Number.isFinite(restrictedPrevious))
    ? restrictedCurr - restrictedPrevious
    : null;
  const restrictedDiffYtd = (Number.isFinite(restrictedCurr) && Number.isFinite(restrictedStart))
    ? restrictedCurr - restrictedStart
    : null;
  // Si la adquisición del trimestre es la misma que la del acumulado (se cerró en este
  // trimestre), la deuda asumida no-cash se imputa también al horizonte de 3 meses.
  const acquisitions3MAbs = acquisitionsQuarter >= 50
    ? acquisitionsQuarter
    : (fiscalQuarterNumber === 1 ? acquisitionsYtd : 0);
  const assumedDebt3M = (acquisitions3MAbs >= 50 && acquisitionsYtd >= 50
    && Math.abs(acquisitions3MAbs - acquisitionsYtd) < 1 && assumedDebtYtd >= 50)
    ? assumedDebtYtd
    : 0;
  const cashDiff3M = (bal.cash != null && bal.cashPreviousQuarter != null)
    ? Math.round(-(Number(bal.cash) - Number(bal.cashPreviousQuarter)) * 10) / 10
    : null;
  const cashDiffYtd = (bal.cash != null && bal.cashBeginningOfYear != null)
    ? Math.round(-(Number(bal.cash) - Number(bal.cashBeginningOfYear)) * 10) / 10
    : null;
  return {
    threeMonths: {
      libre: null,
      deuda: (bal.totalDebt != null && bal.totalDebtPreviousQuarter != null)
        ? Math.round((Number(bal.totalDebt) - Number(bal.totalDebtPreviousQuarter)) * 10) / 10
        : null,
      caja: cashDiff3M,
       inversionesCortoPlazo: (marketablePurchasesQuarter || marketableProceedsQuarter)
         ? Math.round((marketableProceedsQuarter - marketablePurchasesQuarter) * 10) / 10
         : (Math.abs(invDiff3M) >= 50 ? Math.round(-invDiff3M * 10) / 10 : 0),
       divestitures: rawDivYtd >= 50 ? rawDivYtd : 0,
      buybacks: Number(extracted.fiscalQuarter) === 1 ? -Math.abs(buybacksYtd) : 0,
      acquisitions: (() => {
        const raw = Number(extracted.fiscalQuarter) === 1 ? (acquisitionsQuarter || acquisitionsYtd) : acquisitionsQuarter;
        return raw >= 50 ? -Math.abs(raw) : 0;
      })(),
      assetSales: Number(extracted.fiscalQuarter) === 1 ? (assetSalesQuarter || assetSalesYtd) : assetSalesQuarter,
      preferredIssuance: fiscalQuarterNumber === 1 && preferredYtdRaw >= 50 ? preferredYtdRaw : 0,
      nonControllingSale: fiscalQuarterNumber === 1 && nonControllingYtdRaw >= 50 ? nonControllingYtdRaw : 0,
      assumedDebt: assumedDebt3M >= 50 ? assumedDebt3M : 0,
      restrictedCashMovement: (restrictedDiff3M != null && Math.abs(restrictedDiff3M) >= 50)
        ? Math.round(-restrictedDiff3M * 10) / 10
        : 0,
      acquisitionDescription,
      divestitureDescription,
      debtDetails: buildDebtDetails({
        prev: bal.totalDebtPreviousQuarter != null ? Number(bal.totalDebtPreviousQuarter) : null,
        curr: bal.totalDebt != null ? Number(bal.totalDebt) : null,
        prevCash: bal.cashPreviousQuarter != null ? Number(bal.cashPreviousQuarter) : null,
        currCash: bal.cash != null ? Number(bal.cash) : null,
        prevSti: bal.shortTermInvestmentsPreviousQuarter != null ? Number(bal.shortTermInvestmentsPreviousQuarter) : null,
        currSti: bal.shortTermInvestments != null ? Number(bal.shortTermInvestments) : null,
      }),
      cashDetails: buildCashMovementDetails({
        prev: bal.cashPreviousQuarter != null ? Number(bal.cashPreviousQuarter) : null,
        curr: bal.cash != null ? Number(bal.cash) : null,
        caja: cashDiff3M,
        periodYear: Number(extracted.fiscalYear) || (extracted.reportingPeriod ? Number(String(extracted.reportingPeriod).slice(0, 4)) : null),
        statementChange: Number(extracted.fiscalQuarter) === 1 ? extracted.facts?.netChangeInCash : undefined,
      }),
    },
    ytd: {
      libre: null,
      deuda: (bal.totalDebt != null && bal.totalDebtBeginningOfYear != null)
        ? Math.round((Number(bal.totalDebt) - Number(bal.totalDebtBeginningOfYear)) * 10) / 10
        : null,
      caja: cashDiffYtd,
       inversionesCortoPlazo: (marketablePurchasesYtd || marketableProceedsYtd)
         ? Math.round((marketableProceedsYtd - marketablePurchasesYtd) * 10) / 10
         : (Math.abs(invDiffYtd) >= 50 ? Math.round(-invDiffYtd * 10) / 10 : 0),
      divestitures: rawDivYtd >= 50 ? rawDivYtd : 0,
      buybacks: buybacksYtd ? -Math.abs(buybacksYtd) : 0,
      acquisitions: acquisitionsYtd >= 50 ? -Math.abs(acquisitionsYtd) : 0,
      assetSales: assetSalesYtd,
      preferredIssuance: preferredYtdRaw >= 50 ? preferredYtdRaw : 0,
      nonControllingSale: nonControllingYtdRaw >= 50 ? nonControllingYtdRaw : 0,
      assumedDebt: assumedDebtYtd >= 50 ? assumedDebtYtd : 0,
      restrictedCashMovement: (restrictedDiffYtd != null && Math.abs(restrictedDiffYtd) >= 50)
        ? Math.round(-restrictedDiffYtd * 10) / 10
        : 0,
      acquisitionDescription,
      divestitureDescription,
      debtDetails: buildDebtDetails({
        prev: bal.totalDebtBeginningOfYear != null ? Number(bal.totalDebtBeginningOfYear) : null,
        curr: bal.totalDebt != null ? Number(bal.totalDebt) : null,
        prevCash: bal.cashBeginningOfYear != null ? Number(bal.cashBeginningOfYear) : null,
        currCash: bal.cash != null ? Number(bal.cash) : null,
        prevSti: bal.shortTermInvestmentsBeginningOfYear != null ? Number(bal.shortTermInvestmentsBeginningOfYear) : null,
        currSti: bal.shortTermInvestments != null ? Number(bal.shortTermInvestments) : null,
      }),
      cashDetails: buildCashMovementDetails({
        prev: bal.cashBeginningOfYear != null ? Number(bal.cashBeginningOfYear) : null,
        curr: bal.cash != null ? Number(bal.cash) : null,
        caja: cashDiffYtd,
        periodYear: Number(extracted.fiscalYear) || (extracted.reportingPeriod ? Number(String(extracted.reportingPeriod).slice(0, 4)) : null),
        statementChange: extracted.facts?.netChangeInCash,
      }),
    },
  };
}

function formatWcNumber(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return String(Math.round(Number(value) * 10) / 10).replace('.', ',');
}

// Cierra la nota de capital circulante manteniendo el signo de la desviación y la resta
// explícita del Cash Flow ajustado (CF ajustado = CF normal - desviación). Evita frases
// contradictorias del tipo "ajuste de -159M (1784,4M + 159,1M)".
function buildWcDeviationSentence({ reported, wcReq, deviation, cfo, adjusted }) {
  const base = `Desviación del circulante reportado (${formatWcNumber(reported)}M) frente al WK teórico (${formatWcNumber(wcReq)}M): ${formatWcNumber(deviation)}M.`;
  if (Number.isFinite(Number(cfo)) && Number.isFinite(Number(adjusted))) {
    return `${base} El Cash Flow ajustado resta esa desviación: ${formatWcNumber(cfo)}M - (${formatWcNumber(deviation)}M) = ${formatWcNumber(adjusted)}M.`;
  }
  return base;
}

function buildWorkingCapitalDataFallback(extracted) {
  const balance = extracted.balance ?? {};
  const wc = extracted.workingCapital ?? {};
  const inv = Number(balance.inventories);
  const pay = Number(balance.accountsPayable);
  const rec = Number(balance.accountsReceivable ?? 0);
  const cfo = Number(extracted.cashFlow?.operating);
  const capex = extracted.cashFlow?.capex != null ? Math.abs(Number(extracted.cashFlow.capex)) : NaN;
  const dividends = extracted.cashFlow?.dividends != null ? Math.abs(Number(extracted.cashFlow.dividends)) : NaN;
  if (![cfo, capex].every(Number.isFinite)) return null;

  const inflation = Number.isFinite(Number(wc.inflationRate)) ? Number(wc.inflationRate) : 3;
  const volume = Number.isFinite(Number(wc.volumeGrowth)) ? Number(wc.volumeGrowth) : 0;
  const growth = Number.isFinite(Number(wc.inflationAndVolume))
    ? Number(wc.inflationAndVolume)
    : inflation + volume;
  const hasWcInputs = Number.isFinite(inv) && Number.isFinite(pay);
  const annualWcReq = hasWcInputs ? Math.round((pay - inv - rec) * (growth / 100) * 10) / 10 : 0;
  const months = Number(extracted.ytd?.months) || 3;
  const ytdWcReq = Math.round(annualWcReq * (months / 12) * 10) / 10;
  const repYtd = Number.isFinite(Number(wc.reportedChangeYtd)) ? Number(wc.reportedChangeYtd) : 0;
  const wcDiffYtd = Math.round((repYtd - ytdWcReq) * 10) / 10;
  const cfoAdjYtd = Math.round((cfo - wcDiffYtd) * 10) / 10;
  const fcf = Math.round((cfo - capex) * 10) / 10;
  const fcfAdj = Math.round((cfoAdjYtd - capex) * 10) / 10;
  const shares = Number(extracted.shares);
  const format = (value) => Number.isFinite(value) ? String(Math.round(value * 100) / 100).replace('.', ',') : null;
  const ytdValues = {
    cfo: [format(cfo), format(cfoAdjYtd)],
    capex: [format(capex), format(capex)],
    fcf: [format(fcf), format(fcfAdj)],
    fcfPerShare: [Number.isFinite(shares) && shares ? `${(fcf / shares).toFixed(2).replace('.', ',')} $` : null, Number.isFinite(shares) && shares ? `${(fcfAdj / shares).toFixed(2).replace('.', ',')} $` : null],
    dividends: [Number.isFinite(dividends) ? format(dividends) : null, Number.isFinite(dividends) ? format(dividends) : null],
    libre: [Number.isFinite(dividends) ? format(fcf - dividends) : null, Number.isFinite(dividends) ? format(fcfAdj - dividends) : null],
  };
  const result = {
    ytdScenarios: [`Normal (WC=${Math.round(repYtd)})`, `Ajustado (WC=${Math.round(ytdWcReq)})`],
    ytdValues,
    explanationYtd: hasWcInputs
      ? `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflation}% + ${volume}%) = ${formatWcNumber(annualWcReq)}M en todo el año -> en ${months} meses = ${formatWcNumber(ytdWcReq)}M. ${buildWcDeviationSentence({ reported: repYtd, wcReq: ytdWcReq, deviation: wcDiffYtd, cfo, adjusted: cfoAdjYtd })}`
      : `WK: no se dispone de inventarios, cuentas por pagar y cuentas por cobrar completas; se utiliza WK=0M y no se aplica ajuste de capital circulante. Volumen asumido: ${volume}%; inflación sectorial estimada: ${inflation}%.`,
  };
  if (Number(extracted.fiscalQuarter) === 1 || months === 3) {
    result.quarterScenarios = [`Normal (WC=${Math.round(repYtd)})`, `Ajustado (WC=${Math.round(annualWcReq / 4)})`];
    result.quarterValues = ytdValues;
    result.explanation3M = result.explanationYtd.replace(
      `en ${months} meses = ${formatWcNumber(ytdWcReq)}M`,
      `en 3 meses = ${formatWcNumber(Math.round(annualWcReq / 4 * 10) / 10)}M`,
    );
  }
  return result;
}

async function loadKnowledgeRules(sector, subsector, formType = '10-Q', ticker = null) {
  const isAnnual = String(formType || '').toUpperCase().includes('10-K') || String(formType || '').toLowerCase().includes('anual');

  let generalRules = '';
  if (isAnnual) {
    try {
      generalRules = await readFile(new URL('anual/general.md', KNOWLEDGE_DIR), 'utf8');
    } catch {}
  }
  if (!generalRules) {
    try {
      generalRules = await readFile(new URL('general.md', KNOWLEDGE_DIR), 'utf8');
    } catch {}
  }

  const sectorSlug = SECTOR_FILES[sector] ?? sector;
  let sectorRules = '';
  if (isAnnual) {
    try {
      sectorRules = await readFile(new URL(`anual/${sectorSlug}/sector.md`, KNOWLEDGE_DIR), 'utf8');
    } catch {}
  }
  if (!sectorRules) {
    try {
      sectorRules = await readFile(new URL(`${sectorSlug}/sector.md`, KNOWLEDGE_DIR), 'utf8');
    } catch {
      try {
        sectorRules = await readFile(new URL(`${sectorSlug}.md`, PROMPTS_DIR), 'utf8');
      } catch {}
    }
  }

  let subsectorRules = '';
  if (subsector) {
    if (isAnnual) {
      try {
        subsectorRules = await readFile(new URL(`anual/${sectorSlug}/subsectores/${subsector}/subsector.md`, KNOWLEDGE_DIR), 'utf8');
      } catch {}
    }
    if (!subsectorRules) {
      try {
        subsectorRules = await readFile(new URL(`${sectorSlug}/subsectores/${subsector}/subsector.md`, KNOWLEDGE_DIR), 'utf8');
      } catch {}
    }
  }

  // Reglas propias de la empresa (agente de empresa) cuando exista su .md.
  let empresaRules = '';
  const tickerSlug = String(ticker ?? '').trim().toLowerCase();
  if (tickerSlug) {
    try {
      empresaRules = await readFile(new URL(`${sectorSlug}/empresas/${tickerSlug}/empresa.md`, KNOWLEDGE_DIR), 'utf8');
    } catch {
      try {
        empresaRules = await readFile(new URL(`${sectorSlug}/empresas/${tickerSlug}.md`, KNOWLEDGE_DIR), 'utf8');
      } catch {}
    }
  }

  const parts = [];
  const generalTitle = isAnnual ? 'REGLAS GENERALES Y FORMATO ANUAL (10-K)' : 'REGLAS GENERALES Y FORMATO';
  if (generalRules) parts.push(`### ${generalTitle}:\n${generalRules}`);
  if (sectorRules) parts.push(`### REGLAS DEL SECTOR (${sectorSlug}):\n${sectorRules}`);
  if (subsectorRules) parts.push(`### REGLAS DEL SUBSECTOR (${subsector}):\n${subsectorRules}`);
  if (empresaRules) parts.push(`### REGLAS DE LA EMPRESA (${String(ticker).toUpperCase()}):\n${empresaRules}`);

  return parts.join('\n\n---\n\n') || sectorRules;
}

// Secciones dirigidas del 10-K que suelen quedar fuera de la ventana de estados financieros
// (nota de deuda con tipos cupón, programa de recompras, acciones en circulación...).
function extractKeyFilingSections(text) {
  const source = String(text ?? '');
  if (!source) return '';
  const wanted = [
    { re: /Debt Obligations[\s\S]{0,120}?(?:As of|\(In millions\)|December\s+\d{1,2},)/i, before: 400, after: 8500, label: 'DEUDA: NOTA DE OBLIGACIONES CON CUPONES Y VENCIMIENTOS' },
    { re: /Long-Term Debt:?\s*(?:The following table|The components|The Company)|Long-term debt obligations[^\n]{0,140}(?:table|summariz)/i, before: 300, after: 8500, label: 'DEUDA: NOTA DE DEUDA A LARGO PLAZO CON CUPONES' },
    { re: /aggregate principal maturities|principal maturities of our long-term debt/i, before: 1500, after: 2500, label: 'DEUDA: VENCIMIENTOS DE PRINCIPAL POR EJERCICIO' },
    { re: /Material Cash Requirements[^\n]{0,90}Obligations|Contractual Maturities/i, before: 300, after: 5500, label: 'DEUDA: VENCIMIENTOS CONTRACTUALES' },
    { re: /\n\s*Share Repurchase Program\s*\n/i, before: 300, after: 5000, label: 'RECOMPRAS: PROGRAMA Y REMANENTE' },
    { re: /remaining authorization|authorization remaining/i, before: 300, after: 1500, label: 'RECOMPRAS: AUTORIZACIÓN REMANENTE' },
    { re: /Shares of common stock issued, in treasury, and outstanding/i, before: 300, after: 2500, label: 'ACCIONES EN CIRCULACIÓN' },
    { re: /Selected Financial Data|Five[- ]Year Summary/i, before: 200, after: 6000, label: 'RESUMEN QUINQUENAL' },
  ];
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  const picked = [];
  for (const item of wanted) {
    const match = source.match(item.re);
    if (!match || match.index == null) continue;
    const range = {
      start: Math.max(0, match.index - item.before),
      end: Math.min(source.length, match.index + item.after),
      label: item.label,
    };
    if (picked.some((existing) => overlaps(existing, range))) continue;
    picked.push(range);
  }
  if (!picked.length) return '';
  picked.sort((a, b) => a.start - b.start);
  return picked.map((range) => `### ${range.label}\n${source.slice(range.start, range.end).trim()}`).join('\n\n');
}

function buildAnalysisText(text, presentationText) {
  const financialMarkers = [
    /consolidated statements? of cash flows?/i,
    /statements? of cash flows?/i,
    /consolidated balance sheets?/i,
    /consolidated statements? of (income|operations|earnings)/i,
  ];

  let financialIndex = -1;
  for (const marker of financialMarkers) {
    const index = text.search(marker);
    if (index !== -1) {
      financialIndex = index;
      break;
    }
  }

  const head = text.slice(0, 8000);
  const financialWindow = financialIndex !== -1
    ? text.slice(Math.max(0, financialIndex - 4000), Math.min(text.length, financialIndex + 45000))
    : '';

  let mainContent;
  if (financialWindow) {
    mainContent = `[COMIENZO DEL INFORME]\n${head}\n[SECCIÓN DE ESTADOS FINANCIEROS Y NOTAS]\n${financialWindow}`;
  } else {
    mainContent = text.slice(0, 60000);
  }

  // Se añaden secciones clave rescatadas de puntos del informe que quedan fuera de la
  // ventana (nota de deuda con cupones, recompras, acciones, resumen quinquenal).
  const keySections = extractKeyFilingSections(text);
  const keyBlock = keySections ? `\n\n[SECCIONES CLAVE ADICIONALES DEL INFORME]\n${keySections}` : '';
  const baseBudget = keyBlock
    ? Math.max(35000, 60000 - keyBlock.length)
    : 60000;
  const main = `${mainContent.slice(0, baseBudget)}${keyBlock}`;

  const presentation = String(presentationText ?? '').trim();
  if (!presentation) return main;

  const presentationBudget = 25000;
  return `${main}\n\n[SECCIÓN COMPLEMENTARIA: PRESENTACIÓN Y COMUNICADO DE RESULTADOS (EARNINGS PRESENTATION / 8-K PRESS RELEASE)]\n${presentation.slice(0, presentationBudget)}`;
}

const EXTRACTION_SCHEMA = `{
  "company": "The Kraft Heinz Company",
  "ticker": "KHC",
  "periodTitle": "2026 Q2 results — KHC",
  "reportingPeriod": "2026-06-27",
  "fiscalQuarter": 2,
  "fiscalYear": 2026,
  "shares": 1186,
  "quarter": {
    "sales": 6262,
    "grossProfit": 2028,
    "operatingIncome": 921,
    "ebt": 886,
    "netIncome": 752,
    "prev": { "sales": 6352, "grossProfit": 2183, "operatingIncome": 1292, "ebt": 1245, "netIncome": 994 }
  },
  "ytd": {
    "months": 6,
    "sales": 12309,
    "grossProfit": 4247,
    "operatingIncome": 2079,
    "ebt": 2079,
    "netIncome": 1601,
    "prev": { "sales": 12351, "grossProfit": 4247, "operatingIncome": 2488, "ebt": 2488, "netIncome": 1916 }
  },
  "cashFlow": {
    "operating": 2088,
    "capex": 429,
    "dividends": 949,
    "prevOperating": 1929
  },
  "balance": {
    "inventories": 1944,
    "accountsPayable": 1417,
    "accountsReceivable": 757,
    "cash": 55,
    "cashBeginningOfYear": 68,
    "cashPreviousQuarter": 47,
    "restrictedCash": 0,
    "restrictedCashBeginningOfYear": 0,
    "restrictedCashPreviousQuarter": 0,
    "shortTermInvestments": 1020,
    "shortTermInvestmentsBeginningOfYear": 0,
    "shortTermInvestmentsPreviousQuarter": 997,
    "totalDebt": 7332,
    "totalDebtBeginningOfYear": 8064,
    "totalDebtPreviousQuarter": 7624
  },
  "workingCapital": {
    "reportedChangeQuarter": 220,
    "reportedChangeYtd": -60,
    "inflationAndVolume": 3.0,
    "inflationRate": 3.0,
    "volumeGrowth": 0.0
  },
  "facts": {
    "impairmentsQuarter": 35,
    "impairmentsPrevQuarter": 1428,
    "impairmentsYtd": 9301,
    "impairmentsPrevYtd": 2282,
    "intangiblesAmortization": 4911,
    "effectiveTaxRate": 14.4,
    "incomeTaxExpenseQuarter": 134,
    "incomeTaxExpenseYtd": 163,
    "taxCashFlowAdjustmentQuarter": -20,
    "taxCashFlowAdjustmentYtd": 30.9,
    "incomeTaxesPaidQuarter": 131.4,
    "incomeTaxesPaidYtd": 131.4,
    "shareBuybacks": 435,
    "purchasesOfMarketableSecuritiesQuarter": 0,
    "purchasesOfMarketableSecuritiesYtd": 1020,
    "proceedsFromSaleOfMarketableSecuritiesQuarter": 0,
    "proceedsFromSaleOfMarketableSecuritiesYtd": 640,
    "brandDivestitures": 649,
    "acquisitionsQuarter": 0,
    "acquisitionsYtd": 271,
    "assetSalesQuarter": 0,
    "assetSalesYtd": 4.4,
    "preferredIssuanceQuarter": 0,
    "preferredIssuanceYtd": 0,
    "nonControllingSaleQuarter": 0,
    "nonControllingSaleYtd": 0,
    "acquisitionDescription": "Nombre del negocio o empresa adquirida en el periodo, o null si no hubo",
    "divestitureDescription": "Nombre de la marca, negocio o activo vendido en el periodo, o null si no hubo",
    "totalDebt": 7332
  },
  "annualDetails": {
    "repurchases": {
      "programSummary": "Resumen del programa (autorización, ampliaciones, vencimiento)",
      "programAuthorizedTotal": 4000,
      "programRemaining": 2600,
      "programExpiry": "Diciembre de 2031",
      "programAdditions": "Ampliación de 2.000M añadida recientemente",
      "sharesRepurchasedAnnual": 12.9,
      "aggregateCost": 658.1,
      "averagePrice": 51.0,
      "sharesStartPeriod": 213.0,
      "sharesEndPeriod": 190.8,
      "repurchaseHistory": [
        { "year": 2025, "end": "2025-12-31", "amount": 658.1 },
        { "year": 2024, "end": "2024-12-31", "amount": 645.2 },
        { "year": 2023, "end": "2023-12-31", "amount": 212.7 }
      ],
      "sharesHistory": [
        { "year": 2021, "shares": 231.5 },
        { "year": 2022, "shares": 226.1 },
        { "year": 2023, "shares": 217.2 },
        { "year": 2024, "shares": 208.9 },
        { "year": 2025, "shares": 199.1 }
      ],
      "secTable": {
        "headers": ["", "December 31, 2025", "December 31, 2024", "December 31, 2023"],
        "rows": [
          ["Shares repurchased", "12,906,851", "10,907,779", "3,454,694"],
          ["Aggregate cost (in millions)", "$658.1", "$645.2", "$212.7"],
          ["Average price paid (in $)", "$51.0", "$59.2", "$61.6"]
        ]
      }
    },
    "dividends": {
      "history": [
        { "year": 2025, "dps": 1.88, "total": 376.3, "adjustedEps": 5.42 },
        { "year": 2024, "dps": 1.76, "total": 369.2, "adjustedEps": 5.96 },
        { "year": 2023, "dps": 1.64, "total": 354.7, "adjustedEps": 5.8 }
      ],
      "changeType": "increase",
      "changePct": 6.8,
      "changeDate": "febrero de 2026"
    },
    "outlook": {
      "guidanceSales": "Flat +/- 1% constant currency",
      "guidanceEbt": "-15% to -18% decline",
      "guidanceEps": "-11% to -15% decline",
      "guidanceFcf": "$1.1B +/- 10%",
      "guidanceCapex": "$650M +/- 5%",
      "guidanceNetInterest": "$260M +/- 5%",
      "priorYearSales": 11141,
      "priorYearEbt": 1402,
      "priorYearEps": 5.8,
      "priorYearFcf": 1068,
      "priorYearFcfConversion": 88,
      "priorYearCapex": 717,
      "priorYearNetInterest": 230,
      "priorYearOperatingMargin": 13.4,
      "costSavingsPlan": "Programa de ahorro de 450M en 3 años",
      "commodityRisks": "Sensibilidad a aluminio, energía y fletes",
      "secTable": {
        "headers": ["Métrica", "2025 (Año anterior)", "Guidance 2026E*", "Cifra Proyectada 2026E"],
        "rows": [
          ["Net Sales Revenue Growth, Constant Currency", "$11,141M", "Flat +/- 1%", "~$11,030M – $11,252M"],
          ["Underlying Income Before Income Taxes", "$1,402M", "-15% to -18% Decline", "~$1,150M – $1,192M"],
          ["Underlying Diluted EPS Growth", "$5.80", "-11% to -15% Decline", "~$4.93 – $5.16"],
          ["Underlying Free Cash Flow", "$1,068M", "$1.1B +/- 10%", "~$990M – $1,210M"],
          ["Underlying Net Interest Expense", "$230M", "$260M +/- 5%", "~$247M – $273M"],
          ["Capital Expenditures Incurred", "$717M", "$650M +/- 5%", "~$618M – $683M"]
        ]
      }
    },
    "debt": {
      "nearTermMaturities": 2364,
      "nearTermRates": "CAD 500M al 3.44% y USD 2.0B al 3.0% vencimiento julio 2026",
      "estimatedRefinancingRate": 5.0,
      "estimatedInterestIncrease": 46,
      "maturitiesSchedule": "2026: 2.364M, 2027: 0.5M, 2028: 0.5M, 2029: 1.7M, 2030: 0.5M, después de 2030: 3.841,6M",
      "maturityAfterFive": 3841.6,
      "maturityItems": [
        { "year": 2026, "label": "CAD 500M 3.44% senior notes", "amount": 364.3, "rate": 3.44, "type": "Senior Notes" },
        { "year": 2026, "label": "$2.0B 3.0% senior notes", "amount": 2000.0, "rate": 3.0, "type": "Senior Notes" },
        { "year": 2029, "label": "CAD 445M 3.44% senior notes", "amount": 1.7, "rate": 3.44, "type": "Senior Notes" }
      ],
      "debtHistory": [
        { "year": 2021, "totalDebt": 7800, "netDebt": 7200 },
        { "year": 2022, "totalDebt": 6900, "netDebt": 6100 },
        { "year": 2023, "totalDebt": 6500, "netDebt": 5700 },
        { "year": 2024, "totalDebt": 6200, "netDebt": 5300 },
        { "year": 2025, "totalDebt": 5900, "netDebt": 4950 }
      ],
      "refinancing": {
        "occurred": true,
        "description": "Amortización de notas al 3.00% y emisión de notas al 5.25%",
        "oldDebtRate": 3.00,
        "newDebtRate": 5.25,
        "amountRefinanced": 1000,
        "annualInterestImpact": 22.5,
        "epsImpact": -0.09
      },
      "secTable": {
        "headers": ["Obligación", "Vencimiento", "December 31, 2025", "December 31, 2024"],
        "rows": [
          ["CAD 500 million 3.44% senior notes", "July 2026", "$364.3", "$347.6"],
          ["$2.0 billion 3.0% senior notes", "July 2026", "$2,000.0", "$2,000.0"],
          ["EUR 800 million 3.8% senior notes", "June 2032", "$939.7", "$828.3"],
          ["$1.1 billion 5.0% senior notes", "May 2042", "$1,100.0", "$1,100.0"],
          ["$1.8 billion 4.2% senior notes", "July 2046", "$1,800.0", "$1,800.0"]
        ]
      }
    }
  },
  "extraNotes": ["*3: ...", "Descripción de partidas extraordinarias o ventas de negocios"]
}`;

const EXTRACTION_PROMPT = `Eres el extractor de datos de Cifra. A partir del texto del informe financiero 10-Q / 10-K recibido, extrae las cifras clave del estado de resultados, del balance, del estado de flujos de caja y otros datos relevantes.

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):

{SCHEMA}

Instrucciones:
- "quarter" = datos del trimestre más reciente (por ejemplo "three months ended") y "quarter.prev" = las mismas líneas del mismo trimestre del año anterior (columnas comparativas del informe); "ytd" = acumulado del año fiscal en curso ("six/nine months ended") y "ytd.prev" = acumulado del mismo periodo del año anterior. Si el informe no trae comparativos, usa null.
- En informes anuales (Form 10-K), "ytd" representa el año fiscal completo (12 meses) y "quarter" puede omitirse o igualarse a ytd.
- Todas las cifras en MILLONES de dólares estadounidenses, como números (ej. 6262). Si una cifra no aparece usa null (no la omitas).
- UNIDADES OBLIGATORIAS: si una tabla del informe indica "(In thousands)" o "en miles", DIVIDE la cifra entre 1000 para pasarla a millones; si indica "(In millions)", úsala tal cual. Nunca devuelvas importes en miles (ej. 1.000.000 donde corresponde 1000) ni en dólares completos.
- EXACTITUD OBLIGATORIA: copia las cifras EXACTAS tal como figuran en el informe, sin redondear ni estimar (ej. si el estado de flujos dice "4,462" escribe 4462, no 4500; si dice "801" escribe 801, no 800; si dice "1,898" escribe 1898, no 1900). Nunca sustituyas una cifra reportada por una aproximación ni completes un dato que no aparece con un valor redondeado.
- Si el informe no desglosa el trimestre en algún estado (p. ej. flujos de caja solo acumulados), deja esos campos con null.
- "cashFlow" son las cifras del acumulado (net cash provided by operating activities, capital expenditures, cash dividends paid). Si solo aparecen del trimestre, úsalas igualmente.
- "balance": inventarios (inventories), cuentas por pagar (accounts payable / payables), cuentas por cobrar (accounts receivable / receivables), efectivo (cash), efectivo a principio de año fiscal (cashBeginningOfYear / cierre de ejercicio anterior), efectivo al cierre del trimestre previo (cashPreviousQuarter), efectivo restringido o en escrow (restrictedCash), a principio de año fiscal (restrictedCashBeginningOfYear) y al cierre del trimestre previo (restrictedCashPreviousQuarter), inversiones a corto plazo o valores negociables (shortTermInvestments / Marketable Securities), a principio de año fiscal (shortTermInvestmentsBeginningOfYear) y al cierre del trimestre previo (shortTermInvestmentsPreviousQuarter), deuda total o senior notes (totalDebt), deuda total a principio de año fiscal (totalDebtBeginningOfYear) y deuda total al cierre del trimestre previo (totalDebtPreviousQuarter) en millones (o null si no aparecen). El efectivo restringido incluye las líneas "Restricted cash" del balance o de la conciliación del estado de flujos ("Cash, cash equivalents, restricted cash and restricted cash equivalents") menos el efectivo y equivalentes no restringido.
- "totalDebt" = deuda financiera total del balance = deuda a largo plazo (long-term debt) + porción corriente de la deuda a largo plazo (current portion of long-term debt / current maturities) + préstamos a corto plazo (short-term borrowings). Excluye las cuentas comerciales a pagar a proveedores (accounts payable). En el balance general de US-GAAP la porción corriente de la deuda a largo plazo se clasifica dentro de pasivos corrientes (Current Liabilities) separada de la deuda a largo plazo no corriente, por lo que DEBE sumarse para obtener la deuda total financiera del balance.
- "workingCapital": variación del capital circulante / operating assets and liabilities en el estado de flujos de caja (reportedChangeQuarter para 3 meses o reportedChangeYtd para acumulado), inflación anual del sector ("inflationRate") y crecimiento real de volumen ("volumeGrowth") en %. Si el informe no proporciona volumen, "volumeGrowth" es obligatoriamente 0. Si no proporciona inflación propia, usa aproximadamente 3% para consumo defensivo y deja constancia de que es una hipótesis sectorial. "inflationAndVolume" debe ser la suma de ambos.
- "facts":
  * impairmentsQuarter: deterioros / impairments o depreciaciones extraordinarias de intangibles o goodwill del trimestre actual (o 0/null si no hubo).
  * impairmentsPrevQuarter: deterioros / impairments del mismo trimestre del ejercicio anterior (ej. 1428M en KHC, o 0/null si no hubo).
  * impairmentsYtd: deterioros / depreciaciones acumuladas del ejercicio actual (ej. 9301M en KHC).
  * impairmentsPrevYtd: deterioros / impairments acumulados del ejercicio anterior (ej. 2282M en KHC).
  * intangiblesAmortization: amortización de intangibles en millones.
  * effectiveTaxRate: tipo impositivo efectivo en %.
  * incomeTaxExpenseQuarter / incomeTaxExpenseYtd: gasto por impuestos reconocido en la cuenta de resultados del periodo.
  * taxCashFlowAdjustmentQuarter / taxCashFlowAdjustmentYtd: línea "Deferred income taxes and income taxes payable, net" o "Deferred income tax provision/(benefit)" del cash flow, con su signo tal como aparece. Es un ajuste no monetario, no impuestos pagados. Si existe cualquiera de esas líneas, estos campos son obligatorios.
  * incomeTaxesPaidQuarter / incomeTaxesPaidYtd: importe pagado en efectivo por impuestos sobre las ganancias en el periodo ("Income taxes paid", "Income tax (paid) received", "Total net cash income taxes paid", "Cash paid for income taxes"). Número positivo en $M (ej. 131.4). Si la empresa desglosa los impuestos pagados en efectivo en el estado de flujos o en la nota de impuestos, este campo es prioritario.
  * shareBuybacks: recompras de acciones en $M. Buscar también "repurchases of common stock", "purchases of treasury stock" y "share repurchases".
  * purchasesOfMarketableSecuritiesQuarter / purchasesOfMarketableSecuritiesYtd: compras de inversiones a corto plazo, valores negociables o marketable securities en el cash flow. Buscar expresamente "purchases of marketable securities". Se pasan al bloque de Asignación de Capital restadas de las ventas (ver el campo siguiente).
  * proceedsFromSaleOfMarketableSecuritiesQuarter / proceedsFromSaleOfMarketableSecuritiesYtd: cobros por venta o vencimiento de valores negociables en el cash flow ("Proceeds from sales of marketable securities", "Proceeds from sale and maturity of marketable securities"). En Asignación de Capital, la fila "Inversiones a corto plazo" es el flujo NETO: ventas (+) - compras (-). Ej.: compras de 1.724 y ventas de 686 => -1038.
  * IMPORTANTE (separador de miles): en las tablas de la SEC la coma suele ser separador de MILLARES ("(1,724)" = 1.724 millones; "1,024" = 1.024 millones). Interpreta siempre esas comas como miles, nunca como decimales.
  * brandDivestitures: ingresos netos por venta de marcas, activos o desinversiones materiales en $M (>= 50M).
  * acquisitionsQuarter / acquisitionsYtd: pagos netos por compra de negocios en el cash flow ("Acquisitions of businesses, net of cash acquired", "Acquisition of business, net of cash acquired", "Payments to acquire businesses") en $M, como número positivo, tomando la columna del periodo analizado. Buscar expresamente estas líneas (singular o plural); si existen, los campos son obligatorios. Ojo: aunque el nombre diga "net of cash acquired", el importe es el pagado por la adquisición y debe figurar como fila "Adquisiciones" en la asignación de capital.
  * assetSalesQuarter / assetSalesYtd: ingresos por venta de property, plant, equipment and other assets en el cash flow ("Proceeds from sales of property, plant, equipment and other assets") en $M, como número positivo. Si existen, los campos son obligatorios.
  * preferredIssuanceQuarter / preferredIssuanceYtd: entradas de caja por emisión de acciones preferentes en la sección de financiación ("Net proceeds from issuance of convertible preferred stock", "Proceeds from issuance of preferred stock"), en $M como número positivo. Si existen, son obligatorios.
  * nonControllingSaleQuarter / nonControllingSaleYtd: entradas de caja por venta de participaciones no controladoras/minoritarias manteniendo el control ("Net proceeds from sale of non-controlling interest", "Proceeds from sale of noncontrolling interest", "Proceeds from minority shareholders"), en $M como número positivo. Si existen, son obligatorios. NO es una desinversión.
  * REGLA DEL PERIODO (CRÍTICA): todas las partidas del estado de flujos (recompras, compras/ventas de valores negociables, adquisiciones, desinversiones y ventas de activos) se toman SIEMPRE de la columna del EJERCICIO analizado. Las columnas comparativas del año anterior NO cuentan: si la línea solo aparece con la cifra del comparativo (o a 0 en el periodo actual), escribe 0. Nunca atribuyas al ejercicio analizado una adquisición o desinversión del ejercicio anterior.
  * acquisitionDescription: breve descripción de QUÉ negocio/empresa se ha comprado en el periodo (según las notas del 10-Q/10-K), o null si no hubo adquisiciones.
  * divestitureDescription: breve descripción de QUÉ marca, negocio o activo se ha vendido en el periodo (según las notas del 10-Q/10-K), o null si no hubo ventas.
  * totalDebt: deuda total en balance.
- "annualDetails" (OBLIGATORIO para informes anuales Form 10-K):
  * "repurchases": extrae de la nota de Share Repurchase Program o Stockholders' Equity la autorización del programa, saldo disponible, acciones recompradas y tabla de recompras multianual.
    - "programRemaining": importe en $M pendiente de ejecutar bajo el programa vigente. ES OBLIGATORIO extraerlo si el 10-K lo indica. Búscalo en la nota de Stockholders' Equity, en el Item 5 ("Unregistered Sales of Equity Securities and Use of Proceeds") o en el resumen de recompras, con expresiones como "approximately $X million remaining under our share repurchase program", "$X million remaining", "of which $X million remained" o "available for future repurchases". Si el importe aparece en miles de millones, conviértelo a millones (ej. "$2.0 billion remaining" = 2000M). NUNCA dejes el campo vacío ni respondas que no se desglosa si encuentras la cifra.
    - "programExpiry": fecha o periodo en el que termina la autorización del programa (ej. "Diciembre de 2031"). Búscala con expresiones como "expires in", "through December 31, 20XX", "authorized through" o "no expiration date". Si el 10-K indica que el programa no caduca, escribe "Sin fecha de caducidad"; si no consta nada, null.
    - "averagePrice": precio medio ponderado pagado por acción en el año = aggregate cost ($M) / shares repurchased.
    - "sharesHistory": acciones en circulación al CIERRE de cada uno de los últimos 5 ejercicios (shares outstanding, no el promedio ponderado). Fuentes: estado de patrimonio, balance, nota de capital social, resumen quinquenal (Selected Financial Data / Five-Year Summary) o la sección de Earnings Per Share. Es OBLIGATORIO extraer al menos 3 ejercicios cuando el 10-K los muestra. Formato: [{ "year": 2021, "shares": 231.5 }, ...] con las acciones en millones.
    - "repurchaseHistory": serie anual de recompras de acciones ejecutadas (importe total en $M por ejercicio, últimos 3-5 años). Fuente principal: estado de flujos de caja, línea "Repurchases of common stock" / "Purchases of treasury stock" / "Repurchases of common stock, net of fees". Añade cada año con "year" y la fecha de cierre "end" en formato AAAA-MM-DD. Es la base para construir la tabla multianual cuando el 10-K no incluye una tabla propia de recompras.
    - "secTable": tabla oficial de recompras. Si el 10-K incluye una tabla propia con acciones y coste por año, los años de las columnas DEBEN ser los últimos 5 ejercicios disponibles (hasta 5 columnas), alineados con "sharesHistory"; "rows" DEBE incluir SIEMPRE, en este orden y cuando el informe los desglose, "Shares repurchased" (número de títulos, tal cual, con separador de miles), "Aggregate cost (in millions)" y "Average price paid (in $)" (precio medio = coste agregado / acciones recompradas, ej. "$51.0", "$59.2"). Si el 10-K NO incluye tabla propia pero existe "repurchaseHistory", construye "secTable" con una columna por ejercicio y la fila "Aggregate cost (in millions)"; añade "Shares repurchased" y "Average price paid (in $)" si el informe permite calcularlos (estado de patrimonio, nota de tesorería o acciones recompradas por ejercicio) y "Remaining authorization (in millions)" en la columna del último ejercicio si consta el remanente. Queda PROHIBIDO inventar el número de acciones recompradas o el precio medio: si no constan, se omiten y el sistema los completará desde la SEC cuando sea posible.
  * "dividends": extrae del estado de patrimonio, del estado de flujos de caja y de la sección de dividendos la política de reparto:
    - "history": serie de los últimos 3-5 ejercicios con "year", "dps" (dividendo declarado por acción en $), "total" (dividendos pagados en millones) y "adjustedEps" (BPA diluido AJUSTADO o subyacente del año, si consta en el 10-K o en el comunicado/presentación 8-K complementario). El sistema completa esta serie desde XBRL, pero el "adjustedEps" solo puede venir de la IA.
    - "changeType" ("increase", "cut", "unchanged"), "changePct" (variación % del dividendo por acción del último ejercicio frente al anterior) y "changeDate" (fecha del anuncio del cambio, si consta). Si el dividendo se mantiene sin cambios, deja "changeType" en "unchanged".
  * "outlook": extrae del Guidance / Full Year Outlook o Item 7 las metas oficiales de ingresos, EBT, BPA, FCF, CAPEX, intereses, programas de ahorro de costes y tabla del guidance. En "secTable" estructura OBLIGATORIAMENTE 4 columnas: "Métrica", "[AÑO-1] (Año anterior)", "Guidance [AÑO]E*" y "Cifra Proyectada [AÑO]E", incluyendo el valor del año pasado cerrado y la equivalencia en ventas/cifra de las metas en porcentaje o 'flat'.
    - La columna "[AÑO-1] (Año anterior)" NUNCA se deja con "—": rellena en TODAS las filas el dato real del ejercicio cerrado (ventas, EBT/BPA, FCF, conversión de FCF, CAPEX, gasto neto por intereses y margen operativo). Si una cifra no está en la tabla del 10-K, búscala en los estados financieros del propio 10-K o en la presentación/comunicado 8-K complementario.
    - Guarda esos mismos valores del año cerrado en los campos: "priorYearSales", "priorYearEbt", "priorYearEps", "priorYearFcf", "priorYearFcfConversion" (en %), "priorYearCapex", "priorYearNetInterest" y "priorYearOperatingMargin" (en %). Si algún dato no consta en ninguna fuente, usa null; nunca lo inventes.
  * "debt": extrae de la nota Debt Obligations el perfil de vencimientos contractuales para los PRÓXIMOS 5 AÑOS, el importe agregado posterior al año 5 en "maturityAfterFive" (si aparece), la evolución histórica de deuda normal y deuda neta de los últimos 10 años ("debtHistory"), y cualquier refinanciación acontecida o pactada en el ejercicio ("refinancing"), indicando tipo anterior, tipo nuevo y cuantía refinanciada.
    - "maturityItems": lista DETALLADA con un elemento POR CADA EMISIÓN/TRAMO de deuda (notas sénior, bonos, préstamos, líneas de crédito) que vence en cada uno de los próximos 5 años, no un único total agregado por año. Nunca uses etiquetas de varios ejercicios ("2027-2028", "2031 y posteriores"...): asigna cada emisión a su año exacto de vencimiento. Para cada emisión extrae: "year" (año de vencimiento), "label" (descripción con divisa, importe nominal y cupón, ej. "CAD 500M 3.44% senior notes due 2026"), "amount" (saldo/importe en millones de USD; si la emisión está en otra divisa, usa el importe en USD que figura en la tabla de deuda del 10-K), "rate" (tipo cupón en %) y "type" (Senior Notes, Commercial Paper, Term Loan, etcétera). Si dos emisiones vencen el mismo año, deben aparecer como DOS elementos con distinto tipo y cupón. Incluye TAMBIÉN las emisiones que vencen DESPUÉS del año 5 cuando la tabla de deuda detalle su cupón (aunque no se dibujen en el gráfico), para poder calcular el tipo de interés medio de toda la deuda. Ejemplo real: [{ "year": 2026, "label": "CAD 500M 3.44% senior notes", "amount": 364.3, "rate": 3.44, "type": "Senior Notes" }, { "year": 2026, "label": "$2.0B 3.0% senior notes", "amount": 2000, "rate": 3.0, "type": "Senior Notes" }].
    - Si el 10-K solo publica una tabla agregada de vencimientos por año (Contractual Maturities) sin detallar emisión ni cupón, usa esa tabla como respaldo dejando "rate" en null y "type" en "Deuda total". OJO: la tabla de "Material Cash Requirements" del MD&A incluye intereses y no sirve como calendario de principal; usa siempre la tabla de vencimientos de principal de la nota de deuda ("aggregate principal maturities") cuando exista.
    - "secTable": copia la tabla de la nota de deuda (Long-Term Debt / Debt Obligations) con sus columnas reales (obligación/categoría, vencimiento, tipo de interés y saldo del último ejercicio). Si la nota resume la deuda por categorías con rangos de cupón (ej. "3.000 % – 7.125 %"), incluye cada categoría con su rango tal cual y su saldo; en ese caso NO inventes un único tipo por categoría ni tramos individuales.
- "extraNotes": partidas extraordinarias, ventas de negocios, o cualquier hecho relevante que afecte a la comparabilidad (ej. "impairment de 1428M el año anterior"). En español. Vacío si no hay nada.
- DOCUMENTO COMPLEMENTARIO: El texto puede incluir una sección "[SECCIÓN COMPLEMENTARIA: PRESENTACIÓN Y COMUNICADO DE RESULTADOS (EARNINGS PRESENTATION / 8-K PRESS RELEASE)]" con la presentación de diapositivas o el comunicado del 8-K de resultados:
  * La sección complementaria es LA FUENTE PRIMARIA Y PRINCIPAL para "annualDetails.outlook": si el informe principal (10-K) no incluye tabla ni narrativa de guidance/outlook, extrae OBLIGATORIAMENTE de la sección complementaria las metas oficiales anunciadas por la dirección para el siguiente ejercicio fiscal (guidanceSales, guidanceEbt, guidanceEps, guidanceFcf, guidanceCapex, guidanceNetInterest, costSavingsPlan, commodityRisks) y la tabla del guidance ("secTable") con sus métricas y rangos tal como aparecen publicados.
  * Los estados financieros del informe principal (10-K) tienen SIEMPRE prioridad sobre la presentación para los datos contables históricos ("quarter", "ytd", "cashFlow", "balance" y "facts").
  * Queda TERMINANTEMENTE PROHIBIDO inventar cifras o copiar los números de ejemplo del schema. Si tras revisar minuciosamente tanto el 10-K como la sección complementaria la compañía no ha publicado ningún guidance cuantitativo para el próximo año, indica en guidanceSales "Sin guidance cuantitativo publicado" y deja el resto de campos numéricos en null.
  * También puede aportar datos de recompras, desinversiones o adquisiciones si el 10-K no los detalla, indicándolo en "extraNotes".`;

const OUTPUT_SCHEMA = `{
  "company": "Nombre de la empresa",
  "ticker": "TAP",
  "periodTitle": "2025 Q2 results — TAP",
  "reportingPeriod": "2025-06-30",
  "horizons": [
    {
      "label": "ÚLTIMOS 3 MESES",
      "sales": {
        "rows": [
          { "name": "Ventas", "adjusted": "3251M", "prevAdjusted": "3258M", "pctAdjusted": "-0,21 %", "normal": "3251M", "prevNormal": "3258M", "pctNormal": "-0,21 %", "isAdjusted": false },
          { "name": "Beneficio Bruto", "adjusted": "1298M", "prevAdjusted": "1342M", "pctAdjusted": "-3,28 %", "normal": "1298M", "prevNormal": "1342M", "pctNormal": "-3,28 %", "isAdjusted": false },
          { "name": "Beneficio Operativo", "adjusted": "520M", "prevAdjusted": "560M", "pctAdjusted": "-7,14 %", "normal": "485M", "prevNormal": "560M", "pctNormal": "-13,39 %", "isAdjusted": true, "adjustedNote": "*1" },
          { "name": "EBT", "adjusted": "490M", "prevAdjusted": "520M", "pctAdjusted": "-5,77 %", "normal": "455M", "prevNormal": "520M", "pctNormal": "-12,50 %", "isAdjusted": false },
          { "name": "Beneficio Neto", "adjusted": "377M", "prevAdjusted": "400M", "pctAdjusted": "-5,75 %", "normal": "342M", "prevNormal": "400M", "pctNormal": "-14,50 %", "isAdjusted": false }
        ],
        "notes": ["*1: Se excluyen 35M de amortización de intangibles para reflejar el beneficio operativo y neto recurrente de la compañía."],
        "shares": "205M",
        "eps": "1,84 $"
      },
      "cashFlow": {
        "scenarios": ["Normal (WC=150)", "Ajustado*1 (WC=-20)"],
        "rows": [
          { "name": "Cash Flow", "values": ["718,3", "650,0"] },
          { "name": "CAPEX", "values": ["163,3", "163,3"] },
          { "name": "FCF", "values": ["555,0", "486,7"] },
          { "name": "FCF/Acción", "values": ["2,71 $", "2,37 $"] },
          { "name": "Dividendo", "values": ["93,5", "93,5"] },
          { "name": "Libre", "values": ["461,5", "393,2"] }
        ],
        "notes": [
          "*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (1500 - 2200 - 800) × (3% - 0%) = -45M en todo el año -> en 3 meses = -12M por lo tanto, se ajusta la desviación de circulante frente a la necesidad recurrente."
        ]
      },
      "capital": {
        "rows": [
          { "name": "Libre", "value": "302" },
          { "name": "Caja*1", "value": "-8" },
          { "name": "Deuda*1", "value": "-292" },
          { "name": "En total", "value": "2" }
        ],
        "verification": "Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.",
        "notes": ["*1: Deuda balance: 7624M -> 7332M (-292M). Deuda neta: 6580M -> 6257M (-323M). Caja balance: 47M (2025) -> 55M (2026) (+8M); la caja aumentó: uso de capital (-); fila Caja = -8."]
      }
    },
    {
      "label": "EN TODO EL AÑO (9 MESES)",
      "sales": {
        "rows": [
          { "name": "Ventas", "adjusted": "8000,0", "prevAdjusted": "7800,0", "pctAdjusted": "+2,56 %", "normal": "8000,0", "prevNormal": "7800,0", "pctNormal": "+2,56 %" },
          { "name": "Beneficio bruto", "adjusted": "2400,0", "prevAdjusted": "2300,0", "pctAdjusted": "+4,35 %", "normal": "2400,0", "prevNormal": "2300,0", "pctNormal": "+4,35 %" },
          { "name": "Beneficio operativo", "adjusted": "1200,0", "prevAdjusted": "1100,0", "pctAdjusted": "+9,09 %", "normal": "1150,0", "prevNormal": "1100,0", "pctNormal": "+4,55 %", "isAdjusted": true, "adjustedNote": "*1" },
          { "name": "EBT", "adjusted": "950,0", "prevAdjusted": "880,0", "pctAdjusted": "+7,95 %", "normal": "900,0", "prevNormal": "880,0", "pctNormal": "+2,27 %" },
          { "name": "Beneficio neto", "adjusted": "730,0", "prevAdjusted": "677,0", "pctAdjusted": "+7,83 %", "normal": "693,0", "prevNormal": "677,0", "pctNormal": "+2,36 %" }
        ],
        "notes": ["*1: Se excluyen 50M de amortización de intangibles."],
        "shares": "205M",
        "eps": "3,56 $"
      },
      "cashFlow": {
        "scenarios": ["Normal (WC=180)", "Ajustado*1 (WC=-45)"],
        "rows": [
          { "name": "Cash Flow", "values": ["1800,0", "1575,0"] },
          { "name": "CAPEX", "values": ["400,0", "400,0"] },
          { "name": "FCF", "values": ["1400,0", "1175,0"] },
          { "name": "FCF/Acción", "values": ["6,83 $", "5,73 $"] },
          { "name": "Dividendo", "values": ["280,0", "280,0"] },
          { "name": "Libre", "values": ["1120,0", "895,0"] }
        ],
        "notes": [
          "*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (1500 - 2200 - 800) × (3% - 0%) = -45M en todo el año."
        ]
      },
      "capital": {
        "rows": [
          { "name": "Libre", "value": "80" },
          { "name": "Adquisiciones*1", "value": "-271" },
          { "name": "Desinversiones*2", "value": "649" },
          { "name": "Recompras", "value": "-15" },
          { "name": "Caja*3", "value": "13" },
          { "name": "Deuda*3", "value": "-732" },
          { "name": "En total", "value": "-276" }
        ],
        "verification": "No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo.",
        "notes": [
          "*1: Adquisiciones: Se destinaron 271M a la compra de [negocio o empresa adquirida] (uso de fondos).",
          "*2: Desinversiones: Se ingresaron 649M por la desinversión de [marca o negocio vendido] (fuente de fondos).",
          "*3: Deuda balance: 8064M -> 7332M (-732M). Deuda neta: 7996M -> 6257M (-1739M). Caja balance: 68M (2025) -> 55M (2026) (-13M); la caja disminuyó: fuente de liquidez (+); fila Caja = 13."
        ]
      }
    }
  ]
}`;

const ANNUAL_OUTPUT_SCHEMA = `{
  "company": "Nombre de la empresa",
  "ticker": "TAP",
  "periodTitle": "2025 ANNUAL results — TAP",
  "reportingPeriod": "2025-12-31",
  "formType": "10-K",
  "horizons": [
    {
      "label": "EN TODO EL AÑO (12 MESES)",
      "sales": {
        "rows": [
          { "name": "Ventas", "adjusted": "13040M", "prevAdjusted": "13734M", "pctAdjusted": "-5,05 %", "normal": "13040M", "prevNormal": "13734M", "pctNormal": "-5,05 %", "isAdjusted": false },
          { "name": "Beneficio Bruto", "adjusted": "4274M", "prevAdjusted": "4533M", "pctAdjusted": "-5,71 %", "normal": "4274M", "prevNormal": "4533M", "pctNormal": "-5,71 %", "isAdjusted": false },
          { "name": "Beneficio Operativo", "adjusted": "1583M", "prevAdjusted": "1753M", "pctAdjusted": "-9,70 %", "normal": "-2366M", "prevNormal": "1753M", "pctNormal": "—", "isAdjusted": true, "adjustedNote": "*1" },
          { "name": "EBT", "adjusted": "1402M", "prevAdjusted": "1503M", "pctAdjusted": "-6,72 %", "normal": "-2518M", "prevNormal": "1503M", "pctNormal": "—", "isAdjusted": false },
          { "name": "Beneficio Neto", "adjusted": "1086M", "prevAdjusted": "1164M", "pctAdjusted": "-6,70 %", "normal": "-2180M", "prevNormal": "1157M", "pctNormal": "—", "isAdjusted": true, "adjustedNote": "*2" }
        ],
        "notes": [
          "*1: Ha habido una depreciación del fondo de comercio de 3645 M. Además, de lo que aparece en el apartado 'Other Operating Income', unos -275 M corresponden a otras depreciaciones. En total, hay que sumar 3920 M.",
          "*2: Este año ha tenido un beneficio por impuestos de 337 M. Por supuesto, hay que ajustar esto (le he restado 1402 * 0,225 = 316). Por lo tanto, tendría que haber pagado 653 M más de lo que figura ahí; esto es muy importante para ajustar los Cash Flows."
        ],
        "shares": "190,8M (al final del 2025, no el promedio) -> %6,2 menos (203,2M)-> efecto en el BPA: %6,5",
        "eps": "5,69 $ -> %2,3 menos (5,73 $)"
      },
      "cashFlow": {
        "scenarios": ["Normal (WC=-146)", "Ajustado*1 (WC=70)"],
        "rows": [
          { "name": "Cash Flow", "values": ["1784", "1805"] },
          { "name": "CAPEX", "values": ["717", "717"] },
          { "name": "FCF", "values": ["1067", "1088"] },
          { "name": "FCF/Acción", "values": ["5,59 $", "5,70 $"] },
          { "name": "Dividendo", "values": ["376", "376"] },
          { "name": "Libre", "values": ["691", "712"] }
        ],
        "notes": [
          "*1: WK = (Inventarios + Cuentas por cobrar - Cuentas por pagar) × (inflación + volumen) = (700 + 700 - 2800) × (0,05 + 0) = 70. Por lo tanto, hay que sumar 146 + 70 = 216 M al cash flow. Este año han gastado 131 M en impuestos cuando en principio debían pagar 316 M, restando 185 M al cash flow."
        ]
      },
      "capital": {
        "rows": [
          { "name": "Libre", "value": "691" },
          { "name": "Inversiones a corto plazo", "value": "-85" },
          { "name": "Recompras", "value": "-650" },
          { "name": "Caja", "value": "70" },
          { "name": "Deuda", "value": "150" },
          { "name": "En total", "value": "176" }
        ],
        "verification": "No cuadra del todo, pero más o menos ha gastado todo lo que estaba libre en recompras.",
        "notes": [
          "*1: Deuda balance: 6126M -> 6260M (+134M). Deuda neta: 5740M -> 5840M (+100M). Caja balance: 560M (2024) -> 490M (2025) (-70M); la caja disminuyó: fuente de liquidez (+); fila Caja = 70."
        ]
      }
    }
  ],
  "conclusion": {
    "repurchases": {
      "title": "1: Recompras",
      "text": "Durante 2025 la compañía destinó 647,9M a la recompra de acciones propias...",
      "authorizationRemaining": "Unos 2.600M de $ pendientes de ejecución",
      "authorizationExpiry": "Vigente hasta diciembre de 2031",
      "shareCountEvolution": "De 208,9M de acciones en diciembre de 2024 a 199,1M en diciembre de 2025 (-4,7 %)",
      "bpaImpact": "+4,9 % de subida en el BPA en el último año exclusivamente por recompras",
      "futureProjection": "Proyección a 5 años: con ~2.600M de autorización restante y un precio medio de ~51 $, se podrían recomprar ~51M de acciones (~10,2M/año), lo que reduciría el capital un ~5,1 % anual e impulsaría el BPA ~5,4 % cada año.",
      "sharesHistory": [
        { "year": 2021, "shares": 231.5 },
        { "year": 2022, "shares": 226.1 },
        { "year": 2023, "shares": 217.2 },
        { "year": 2024, "shares": 208.9 },
        { "year": 2025, "shares": 199.1 }
      ],
      "secSnippet": {
        "title": "Share Repurchase Program (Form 10-K)",
        "summary": "Tabla oficial de recompras anuales del Form 10-K",
        "headers": ["", "December 31, 2025", "December 31, 2024", "December 31, 2023"],
        "rows": [
          ["Shares repurchased", "12,906,851", "10,907,779", "3,454,694"],
          ["Aggregate cost (in millions)", "$658.1", "$645.2", "$212.7"],
          ["Average price paid (in $)", "$51.0", "$59.2", "$61.6"]
        ]
      }
    },
    "outlook": {
      "title": "2: Outlook",
      "text": "La dirección proyecta para **2026** unas ventas planas en moneda constante (**flat +/- 1 %**), con un EBT subyacente en descenso del **-15 % al -18 %** y un BPA diluido subyacente en caída del **-11 % al -15 %**. El efecto amortiguador de las recompras de acciones (que reducen la base accionarial **~5 % anual**) suaviza parcialmente la caída del BPA frente a la del EBT. La compañía espera un tipo impositivo efectivo subyacente del **22 % al 24 %**.",
      "fcfAnalysis": "El guidance de Free Cash Flow subyacente es de **1.100M +/- 10 %**, con un CAPEX previsto de **650M +/- 5 %** y una amortización subyacente de **720M +/- 5 %**. Con un dividendo anual en torno a **376M**, el FCF esperado cubre sobradamente el dividendo...",
      "riskFactors": "Presión inflacionaria en materias primas, especialmente el **aluminio (Midwest Premium)**...",
      "efficiencyPlans": "Programa de ahorro de costes de hasta **450M en 3 años (2026-2028)**, junto con el Plan de Reestructuración de las Américas de **28,7M**...",
      "secSnippet": {
        "title": "2026 Guidance / Full Year Outlook",
        "summary": "Metas cuantitativas oficiales para el próximo ejercicio",
        "headers": ["Métrica", "2025 (Año anterior)", "Guidance 2026E*", "Cifra Proyectada 2026E"],
        "rows": [
          ["Net Sales Revenue Growth, Constant Currency", "$11,141M", "Flat +/- 1%", "~$11,030M – $11,252M"],
          ["Underlying Income Before Income Taxes", "$1,402M", "-15% to -18% Decline", "~$1,150M – $1,192M"],
          ["Underlying Diluted EPS Growth", "$5.80", "-11% to -15% Decline", "~$4.93 – $5.16"],
          ["Underlying Free Cash Flow", "$1,068M", "$1.1B +/- 10%", "~$990M – $1,210M"],
          ["Underlying Net Interest Expense", "$230M", "$260M +/- 5%", "~$247M – $273M"],
          ["Capital Expenditures Incurred", "$717M", "$650M +/- 5%", "~$618M – $683M"]
        ]
      }
    },
    "debt": {
      "title": "3: Deuda",
      "text": "La deuda neta se sitúa en **4.950 M$** (-350 M$ vs ejercicio anterior) y la deuda normal en **5.900 M$** (-300 M$). El calendario de vencimientos de los próximos 5 años muestra compromisos escalonados con un tipo de interés medio total del **3,35 %**.",
      "refinancingAnalysis": "Se refinanciaron **1.000 M$** de deuda que devengaba un **3,00 %** emitiendo nuevas obligaciones al **5,25 %** (+2,25 puntos porcentuales de coste).",
      "refinancingImpact": "Sobrecoste bruto de **22,5 M$** de intereses anuales. Tras impuestos (~23 %), el coste neto es de **~17,3 M$**, lo que reduce el BPA en torno a **-0,09 $/acción** (con 199M de acciones).",
      "maturitySchedule": [
        { "year": 2026, "label": "CAD 500M 3.44% senior notes", "amount": 364.3, "rate": 3.44, "type": "Senior Notes" },
        { "year": 2026, "label": "$2.0B 3.0% senior notes", "amount": 2000.0, "rate": 3.0, "type": "Senior Notes" },
        { "year": 2029, "label": "CAD 445M 3.44% senior notes", "amount": 1.7, "rate": 3.44, "type": "Senior Notes" }
      ],
      "maturityAfterFive": 3841.6,
      "debtHistory": [
        { "year": 2021, "totalDebt": 7800, "netDebt": 7200 },
        { "year": 2022, "totalDebt": 6900, "netDebt": 6100 },
        { "year": 2023, "totalDebt": 6500, "netDebt": 5700 },
        { "year": 2024, "totalDebt": 6200, "netDebt": 5300 },
        { "year": 2025, "totalDebt": 5900, "netDebt": 4950 }
      ],
      "refinancing": {
        "occurred": true,
        "oldDebtRate": 3.00,
        "newDebtRate": 5.25,
        "amountRefinanced": 1000,
        "annualInterestImpact": 22.5,
        "epsImpact": -0.09
      },
      "secSnippet": {
        "title": "Debt Obligations — Contractual Maturities (Form 10-K)",
        "summary": "Desglose de notas sénior y calendario de vencimientos de deuda",
        "headers": ["Obligación", "Vencimiento", "December 31, 2025", "December 31, 2024"],
        "rows": [
          ["CAD 500 million 3.44% senior notes", "July 2026", "$364.3", "$347.6"],
          ["$2.0 billion 3.0% senior notes", "July 2026", "$2,000.0", "$2,000.0"],
          ["EUR 800 million 3.8% senior notes", "June 2032", "$939.7", "$828.3"],
          ["$1.1 billion 5.0% senior notes", "May 2042", "$1,100.0", "$1,100.0"],
          ["$1.8 billion 4.2% senior notes", "July 2046", "$1,800.0", "$1,800.0"]
        ]
      }
    },
    "acquisitions": {
      "title": "4: Adquisiciones",
      "text": "No se realizaron adquisiciones materiales durante el ejercicio."
    },
    "dividends": {
      "title": "5: Dividendos",
      "text": "El dividendo por acción aumentó un 6,8 % en 2025, hasta 1,88 $, con un pago total de 376,3M.",
      "changeType": "increase",
      "changePct": 6.8,
      "history": [
        { "year": 2023, "dps": 1.64, "total": 354.7, "adjustedEps": 5.8 },
        { "year": 2024, "dps": 1.76, "total": 369.2, "adjustedEps": 5.96 },
        { "year": 2025, "dps": 1.88, "total": 376.3, "adjustedEps": 5.42 }
      ]
    },
    "watchlist": {
      "title": "Cosas a tener en cuenta en 2026",
      "items": [
        "1: Evolución de los beneficios y volúmenes en comparación con otras empresas del sector.",
        "2: Ritmo y precio medio de ejecución de las recompras de acciones.",
        "3: Refinanciación de la deuda que vence y coste efectivo de los nuevos intereses."
      ]
    }
  },
  "rating": {
    "score": 3,
    "label": "NOTA DE RESULTADOS: 3",
    "rationale": "Calificación puramente financiera basada exclusivamente en la realidad de las cuentas del año, las metas expuestas en el outlook oficial y la asignación de capital ejecutada. Sin especulación sobre el cumplimiento futuro."
  }
}`;

const SYSTEM_PROMPT = `Eres el analista principal de Cifra, un analizador de informes financieros 10-Q / 10-K de empresas de EE. UU.

Recibirás un JSON con las cifras clave extraídas del informe financiero (en millones de USD) y los datos comparativos del trimestre anterior si corresponde. A partir de esas cifras y de las reglas jerárquicas aplicables (Generales + Sector + Subsector), elabora el análisis estructurado siguiendo EXACTAMENTE estas reglas:

{REGLAS}

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):

{SCHEMA}

Instrucciones prioritarias:
- IMPORTANTE: los valores del esquema de ejemplo son de OTRA empresa y otro periodo. Usa EXCLUSIVAMENTE los datos del JSON de extracción recibido. Nunca copies los valores del ejemplo.
- "company", "ticker", "periodTitle" y "reportingPeriod" (fecha de fin del periodo en formato AAAA-MM-DD) se copian tal cual del JSON de extracción.
- HORIZONTES TEMPORALES (REGLA SEGÚN TRIMESTRE):
  * Si el informe es de un primer trimestre (Q1 o fiscalQuarter === 1): genera UN SOLO horizonte con la etiqueta "ÚLTIMOS 3 MESES (Q1)". Omite el bloque acumulado de "EN TODO EL AÑO" ya que 3 meses concluyen todo el ejercicio hasta la fecha.
  * Si es Q2, Q3 o Q4: genera obligatoriamente dos horizontes en este orden: 1. "ÚLTIMOS 3 MESES" (datos exclusivos del trimestre) y 2. "EN TODO EL AÑO (X MESES)" (datos acumulados hasta la fecha con los meses indicados).

- BLOQUE 1 — VENTAS (Cuenta de Resultados):
  * Filas obligatorias en orden: Ventas, Beneficio Bruto, Beneficio Operativo, EBT, Beneficio Neto.
  * AJUSTE OBLIGATORIO DE DETERIOROS / IMPAIRMENTS / DEPRECIACIONES EN "ANTERIOR AJUSTADO":
    - Si en el ejercicio anterior comparable la empresa sufrió deterioros o depreciaciones extraordinarias de intangibles o fondo de comercio (impairments de goodwill o marcas, reflejados en "impairmentsPrevQuarter" o "impairmentsPrevYtd"):
      1. ES OBLIGATORIO SUMAR DE VUELTA dicho deterioro en la columna "Anterior Ajustado" (prevAdjusted) para Beneficio Operativo, EBT y Beneficio Neto.
         * Beneficio Operativo Anterior Ajustado = Beneficio Operativo Anterior Normal + Impairment Año Anterior (ej. -101M + 1428M = 1327M en KHC 3M).
         * EBT Anterior Ajustado = EBT Anterior Normal + Impairment Año Anterior (ej. -283M + 1428M = 1145M en KHC 3M).
         * Beneficio Neto Anterior Ajustado = Beneficio Neto Anterior Normal + Impairment Año Anterior (o neto de impuestos).
      2. NUNCA copies "Anterior Normal" a "Anterior Ajustado" si hubo un impairment o deterioro en el ejercicio anterior.
      3. Añadir la nota explicativa correspondiente (ej. "*1: El año anterior tuvieron un impairment de 1428M").
  * AJUSTE DE ESTE AÑO EN "AJUSTADO":
    - Si este año hubo deterioros o amortizaciones extraordinarias de intangibles ("impairmentsQuarter" o "impairmentsYtd"), súmalos de vuelta a Beneficio Operativo, EBT y Beneficio Neto en la columna "Ajustado" y pon la nota explicativa correspondiente (ej. "*1: Ha habido una depreciación de intangibles de 9301M").
   * IMPUESTOS NORMALIZADOS SOBRE EL EBT AJUSTADO (REGLA DE DESVIACIÓN ±20%):
     - Compara siempre el impuesto reportado con el 23 % del EBT AJUSTADO. Si la desviación relativa supera -20 % o +20 %, aplica el 23 % sobre el EBT ajustado; si no, conserva el impuesto reportado o el tipo efectivo aplicable.
     - El 23 % se aplica sobre el EBT AJUSTADO, nunca sobre el EBT reportado ni como recargo sobre la cifra de impuestos reportada.
     - Cuando la desviación supere ±20 %:
      * Impuestos normalizados = 0,23 × EBT Ajustado.
      * Beneficio Neto Ajustado = EBT Ajustado × 0,77.
    - Ejemplo: EBT reportado 100M y beneficio neto 80M (tipo efectivo 20 %). Si el EBT ajustado es 300M, mantener solo 20M de impuestos es INCORRECTO: impuestos normalizados = 23 % × 300M = 69M → Beneficio Neto Ajustado = 231M.
     - La nota de impuestos debe desglosar el EBT ajustado, el tipo aplicado y el impuesto resultante. Se genera SIEMPRE UNA ÚNICA NOTA bien desarrollada para la normalización fiscal (*2), sin duplicar notas bajo ningún concepto.
   * Regla de herencia en "Anterior Ajustado" (prevAdjusted): ÚNICAMENTE si en el ejercicio anterior comparable NO hubo ningún ajuste contable documentado ni impairments, hereda obligatoriamente el valor de "Anterior Normal" (prevNormal), y calcula SIEMPRE el "% Ajustado" (pctAdjusted). Prohibido poner "—" si prevNormal tiene cifra.
   * COMPARATIVO DEL PERIODO ANTERIOR: las columnas "Anterior" son SIEMPRE las cifras comparativas del mismo periodo del ejercicio anterior. Queda TERMINANTEMENTE PROHIBIDO copiar las cifras del periodo actual en las columnas "Anterior" (variaciones falsas de "+0,00 %"): si el comparativo no aparece, deja "—".
   * Principio de Resaltado Exclusivo en la Casilla de Origen (Sin Propagación en Cascada): El color y la llamada de nota ("isAdjusted": true, "adjustedNote": "*1") se asignan ÚNICA Y EXCLUSIVAMENTE a la casilla de la métrica donde se origina directamente el ajuste contable:
     - Intangibles / amortización / deterioros (impairments): marcar "isAdjusted": true ÚNICAMENTE en "Beneficio Operativo". Aunque EBT y Beneficio Neto varíen matemáticamente en la columna Ajustado por arrastre aritmético, NO llevan resalte ("isAdjusted": false) ni asterisco a menos que contengan un ajuste directo propio.
     - Normalización de impuestos / créditos fiscales: marcar "isAdjusted": true ÚNICAMENTE en "Beneficio Neto" (con su propia nota de impuestos, ej. "*2"). EBT no se colorea por impuestos.
     - Queda terminantemente prohibido marcar en cascada EBT y Beneficio Neto ("isAdjusted": true) si el ajuste se originó en intangibles u operaciones.
   * Las notas explicativas deben detallar el motivo, la cifra teórica vs reportada y la diferencia neta.

 - BLOQUE 2 — CASH FLOW:
   * NORMALIZACIÓN FISCAL DEL CASH FLOW: El trabajo analítico es calcular cuántos impuestos debería pagar la empresa en realidad (23 % sobre el EBT ajustado) y cuánto consta que ha pagado en los cash flows (bien directamente por la línea de "Income tax (paid) received" / "Income taxes paid", o bien por la conciliación de impuestos devengados menos diferidos). Si hay una discrepancia entre lo que debería haber pagado y lo pagado en efectivo, SE AJUSTA el Cash Flow restando o sumando la diferencia en la columna Ajustado. Si pagó menos de lo normalizado, el Cash Flow Ajustado resta esa diferencia; si pagó más, la suma. Y se añade obligatoriamente la Nota *2 explicando cuántos impuestos debería haber pagado y cuánto ha pagado realmente en efectivo.
   * Ejemplo: EBT ajustado 1385,4M, impuestos teóricos normalizados al 23% = 318,6M (~319M). Si en los cash flows consta que solo pagó 131,4M en impuestos, pagó 187,2M de menos: el Cash Flow Ajustado resta -187,2M y se añade la Nota *2 detallándolo.
   * NUMERACIÓN INDEPENDIENTE DE NOTAS POR BLOQUE: Cada bloque (1. Ventas, 2. Cash Flow, 3. Asignación de Capital) reinicia obligatoriamente su numeración de notas en *1.
  * La sección cashFlow DEBE incluir SIEMPRE DOS columnas en "scenarios": ["Normal (WC=valorBase)", "Ajustado*1 (WC=valorAjustado)"], indicando obligatoriamente los valores numéricos concretos de WC aplicados (NUNCA dejes puntos suspensivos "WC=...").
  * Si en el JSON de entrada dispones de "workingCapitalData", usa obligatoriamente sus "quarterScenarios" / "ytdScenarios" y sus "quarterValues" / "ytdValues" para rellenar con exactitud matemática las columnas Normal y Ajustado.
  * Cada fila de cashFlow.rows DEBE tener el array "values" con EXACTAMENTE DOS valores: [valorNormal, valorAjustado].
  * Queda estrictamente prohibido copiar los mismos valores en ambas columnas si hay impacto de circulante.
  * Métricas obligatorias en orden: Cash Flow, CAPEX, FCF, FCF/Acción, Dividendo, Libre.
  * DEDUCCIÓN TRIMESTRAL EN Q2, Q3 Y Q4: NUNCA pongas "—" en los flujos de los últimos 3 meses si dispones de flujos acumulados. Si el informe solo da los flujos acumulados YTD, calcula obligatoriamente la resta:
    Flujo (3M) = Flujo YTD (Qn) - Flujo YTD (Qn-1)
    Usa obligatoriamente las cifras de "deducedQuarterCashFlow" y "previousQuarterCashFlow".
  * Notas de Cash Flow y Resaltado en Cabecera:
    - PROHIBIDO incluir nota al pie de deducción trimestral: La resta entre flujos acumulados es una simple operación matemática ordinaria, no un ajuste de criterio contable. Queda estrictamente prohibido generar notas como "*1: Flujo trimestral deducido del acumulado...".
    - Nota de Cash Flow: La normalización de capital circulante es siempre la Nota 1 ("*1: WK = ...") y la cabecera siempre "Ajustado*1 (WC=valorAjustado)". Si se aplica una normalización fiscal dentro del umbral permitido, su explicación va como NOTA INDEPENDIENTE ("*2: Impuestos: ..."), nunca mezclada dentro de la nota del circulante; la celda de Cash Flow Ajustado se identifica únicamente con el color de la Nota 2, SIN escribir "*2" en el texto de la celda.
     * Desglosar la fórmula (CxP - Inv - CxC) × (inflación+volumen), las cifras de balance y el ajuste resultante en Cash Flow. Si falta volumen, usar 0 %. Si falta inflación propia, usar la inflación sectorial estimada del consumo defensivo (aprox. 3 %) y declararlo.
     - Resaltado: La cabecera de la columna ajustada debe llevar la llamada a la nota ("Ajustado*1") y el color de la Nota 1 por la intervención de circulante. Las filas de datos permanecen limpias por WK; si hay ajuste fiscal, solo la celda de Cash Flow Ajustado lleva el color de la Nota 2 (sin llamada de texto).

- BLOQUE 3 — ASIGNACIÓN DE CAPITAL (REGLAS DE BALANCE Y SIGNOS CRÍTICOS):
  * Ecuación fundamental: Fuentes de capital (+) y Usos de capital (-).
  * FILAS Y CONVENCIÓN DE SIGNOS:
     1. "Libre": Primera fila obligatoria. Remanente de Cash Flow (FCF - Dividendos) del mismo horizonte. Debe conservar EXACTAMENTE el valor y el signo de "Libre" de la tabla de Cash Flow (puede ser negativo: p. ej. -223 si los dividendos superan al FCF).
    2. "Inversiones a corto plazo": Se calcula OBLIGATORIAMENTE con el flujo NETO de valores negociables del estado de flujos de caja (o, si no consta, con la variación de saldo del BALANCE):
       - FLUJO NETO = ventas/cobros de valores negociables ("proceedsFromSaleOfMarketableSecurities...") - compras ("purchasesOfMarketableSecurities...").
       - En "ÚLTIMOS 3 MESES": flujo neto del trimestre; si no consta, -(Inversiones fin - Inversiones previas).
       - En "EN TODO EL AÑO": flujo neto acumulado; si no consta, -(Inversiones fin - Inversiones a principio de año fiscal).
       - SIGNO:
         * Si compran más de lo que venden: NEGATIVO (-) porque se destina capital neto a comprar valores (ej. compras de 1.724 y ventas de 686 => -1038).
         * Si venden más de lo que compran: POSITIVO (+) porque la venta neta de valores libera liquidez.
         * Si el importe neto es marginal (< 50M) o 0 en el periodo, la fila se omite.
    3. "Desinversiones" (venta de marcas / negocios / activos): Ingresos netos obtenidos por la venta de marcas, negocios, filiales o activos (incluye "proceeds from sales of property, plant, equipment and other assets" y las desinversiones de negocios, campos "brandDivestitures", "assetSales..." y "divestitures", >= 50M en conjunto). Signo POSITIVO (+) porque entra dinero a la compañía. Si en el horizonte analizado no hubo venta o su importe fue marginal (< 50M) o 0, NO incluir esta fila.
    4. "Adquisiciones": Pagos netos por compra de negocios o empresas ("Acquisitions of businesses, net of cash acquired", "Acquisition of business, net of cash acquired", "Payments to acquire businesses", campos "acquisitions..." del JSON, >= 50M). Fila OBLIGATORIA si existe una adquisición material: signo NEGATIVO (-) porque es un uso de capital. Si no hubo adquisiciones o fueron marginales (< 50M), NO incluir esta fila.
    5. "Deuda": Se calcula OBLIGATORIAMENTE comparando la Deuda Total (Deuda a largo plazo + Deuda a corto plazo, excluyendo cuentas a pagar a proveedores que forman parte del Working Capital) directamente en el BALANCE:
       - Deuda Balance = Deuda a largo plazo (Long-Term Debt) + Deuda a corto plazo (Current debt / Short-Term debt).
       - Deuda Neta = Deuda Balance - (Efectivo y equivalentes + Inversiones a corto plazo).
       - En "ÚLTIMOS 3 MESES": Deuda este trimestre - Deuda trimestre anterior.
       - En "EN TODO EL AÑO": Deuda este trimestre - Deuda a principio de año fiscal (cierre ejercicio anterior).
       - La variación de esta fila en la tabla DEBE ser estrictamente idéntica a la reflejada en la nota explicativa de Deuda balance y Deuda neta.
       - SIGNO:
         * Si la deuda aumentó: POSITIVO (+) porque entra dinero prestado a la empresa (fuente de financiación).
         * Si la deuda disminuyó: NEGATIVO (-) porque se ha gastado dinero en amortizar/reducir deuda (uso de capital).
    6. "Caja": Se calcula OBLIGATORIAMENTE comparando el Efectivo directamente en el BALANCE:
       - En "ÚLTIMOS 3 MESES": -(Caja este trimestre - Caja trimestre anterior).
       - En "EN TODO EL AÑO": -(Caja este trimestre - Caja a principio de año fiscal).
        - SIGNO:
          * Si la caja aumentó: NEGATIVO (-) porque se ha asignado o gastado capital en incrementar la caja (uso de dinero).
          * Si la caja disminuyó: POSITIVO (+) porque la reducción de caja actúa como fuente de liquidez liberada para pagar otros usos.
        - REFERENCIA OBLIGATORIA: la fila "Caja" se mide SIEMPRE por la variación de saldos del BALANCE; nunca por el cambio neto de efectivo del estado de flujos de caja. Su cifra debe coincidir con la nota al pie.
     7. "Recompras": Salida de capital destinada a comprar acciones propias. Signo NEGATIVO (-). Si en el horizonte es 0, NO incluir esta fila.
    8. "En total": Última fila obligatoria. Suma algebraica con signo de todas las partidas de la tabla: Libre + Inversiones a corto plazo + Desinversiones + Adquisiciones + Deuda + Caja + Recompras.
  * Verificación de cuadre ("verification"):
    - Umbral razonable relativo: el descuadre es aceptable si |En total| <= máximo(50M, 20 % del capital Libre, 10 % de la suma bruta de movimientos de capital). En ese caso: "Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle." (o "El resultado cuadra." si es 0).
    - Si el descuadre supera ese umbral: "No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo."
   * Si en el JSON recibido dispones de "capitalAllocationData", usa obligatoriamente sus partidas y valores calculados para asegurar exactitud matemática perfecta.
   * EXTRACCIÓN OBLIGATORIA DE PARTIDAS: Busca expresamente "repurchases of common stock", "purchases of treasury stock", "share repurchases", "purchases of marketable securities", "proceeds from sale of marketable securities", "Acquisitions of businesses, net of cash acquired" (singular o plural), "Payments to acquire businesses" y "Proceeds from sales of property, plant, equipment and other assets". Las recompras deben aparecer como fila "Recompras" con signo negativo; las compras de marketable securities como "Inversiones a corto plazo" con el NETO (ventas - compras) y signo negativo si el neto es comprador; las compras de negocios como fila "Adquisiciones" con signo negativo (fila OBLIGATORIA si la adquisición es >= 50M, NUNCA la omitas); las ventas de activos/negocios como "Desinversiones" con signo positivo. No omitas una partida porque el modelo no la haya mencionado en su primer borrador si aparece en el JSON de extracción.
   * NOTAS OBLIGATORIAS AL PIE DE ASIGNACIÓN DE CAPITAL:
     1. NOTA DE DEUDA BALANCE, DEUDA NETA Y CAJA BALANCE (OBLIGATORIA SIEMPRE):
        - Debe incluir SIEMPRE y con este formato exacto la comparación de deuda bruta, deuda neta y caja:
          "Deuda balance: <anterior>M -> <actual>M (<variación>M). Deuda neta: <anterior_neta>M -> <actual_neta>M (<variación_neta>M). Caja balance: <anterior>M -> <actual>M (<variación>M); la caja aumentó: uso de capital (-) / la caja disminuyó: fuente de liquidez (+); fila Caja = <valor>M."
          (Usa los valores provistos en capitalAllocationData.debtDetails y capitalAllocationData.cashDetails si están presentes).
        - La fila "Caja" toma SIEMPRE la variación de saldos del BALANCE (nunca el cambio neto de efectivo del estado de flujos) y su cifra debe coincidir con la nota. Si el estado de flujos presenta un cambio neto distinto, se explica la diferencia citando las notas del 10-Q/10-K (efectivo restringido, efecto divisa u otras partidas no monetarias).
        - PROHIBIDO copiar los valores del ejemplo del esquema: son de otra empresa. Si capitalAllocationData.debtDetails está presente, úsalo VERBATIM. Si no está presente, calcula tú mismo la nota con los campos "balance" del JSON recibido: Deuda Balance = totalDebt; Deuda Neta = totalDebt - (cash + shortTermInvestments); comparando contra totalDebtPreviousQuarter / cashPreviousQuarter / shortTermInvestmentsPreviousQuarter (en 3M) o contra totalDebtBeginningOfYear / cashBeginningOfYear / shortTermInvestmentsBeginningOfYear (en acumulado).
     2. NOTA DE ADQUISICIONES / DESINVERSIONES (VENTA O COMPRA DE MARCAS, NEGOCIOS O ACTIVOS):
        - Si en la tabla figuran adquisiciones o desinversiones (venta de marcas, negocios o activos):
          EXPLICAR SIEMPRE CON UN BREVE TEXTO QUÉ NEGOCIO, MARCA O ACTIVO SE HA COMPRADO O VENDIDO, extrayendo la información del 10-Q/10-K recibido y usando los campos "acquisitionDescription" / "divestitureDescription" si están presentes (ej. "*1: Adquisiciones: Se destinaron 271M a la compra de [negocio adquirido]. *2: Desinversiones: Se ingresaron 649M por la venta de [marca o negocio vendido]"). Queda prohibido emitir notas genéricas sin detallar qué se vendió o compró, y prohibido omitir la nota cuando la fila de Adquisiciones o Desinversiones figure en la tabla.
    3. ORDEN Y NUMERACIÓN:
       - Enumerar correlativamente (*1:, *2:...) de manera limpia, sin notas duplicadas ni mezclar notas desordenadas.
    4. VINCULACIÓN Y LLAMADA A NOTAS EN LAS FILAS DE LA TABLA:
       - Cada fila de la tabla explicada por una nota al pie debe llevar la llamada a su nota correspondiente en el campo "name":
          * La fila de adquisiciones o de venta/desinversión de marcas lleva la llamada a su nota: ej. "Adquisiciones*1", "Desinversiones*2".
          * Las filas de "Caja", "Deuda" y (si existe) "Inversiones a corto plazo" hacen referencia conjunta a la nota de deuda balance/neta y caja balance, por lo que DEBEN llevar la llamada a dicha nota: ej. "Caja*2", "Deuda*2", "Inversiones a corto plazo*2" (o "*1" si no hubo venta de marcas).

- Porcentajes en español con coma decimal y signo (ej. "+16,67 %", "-2,29 %"). Cifras en millones con sufijo M en ventas (ej. "6237M") y valores numéricos en flujos y asignación de capital.`;

const ANNUAL_SYSTEM_PROMPT = `Eres el analista principal de Cifra, un analizador de informes financieros anuales (Form 10-K) de empresas de EE. UU.

Recibirás un JSON con las cifras clave extraídas del informe financiero 10-K (en millones de USD) y los datos comparativos del ejercicio anterior. A partir de esas cifras y de las reglas jerárquicas anuales aplicables (Generales + Sector + Subsector), elabora el análisis estructurado siguiendo EXACTAMENTE estas reglas:

{REGLAS}

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):

{SCHEMA}

Instrucciones prioritarias:
- IMPORTANTE: los valores del esquema de ejemplo son de OTRA empresa y otro periodo. Usa EXCLUSIVAMENTE los datos del JSON de extracción recibido. Nunca copies los valores del ejemplo.
- "company", "ticker", "periodTitle" y "reportingPeriod" (fecha de fin del periodo en formato AAAA-MM-DD) se copian tal cual del JSON de extracción.
- "formType": "10-K".

- PARTE I: RESUMEN DE CUENTAS (UN SOLO HORIZONTE OBLIGATORIO):
  * Genera UN SOLO horizonte con la etiqueta EXACTA: "EN TODO EL AÑO (12 MESES)".
  * Queda estrictamente PROHIBIDO generar horizontes trimestrales ("ÚLTIMOS 3 MESES") en informes anuales 10-K.

  * BLOQUE 1 — VENTAS (Cuenta de Resultados 12 meses):
    - Filas obligatorias en orden: Ventas, Beneficio Bruto, Beneficio Operativo, EBT, Beneficio Neto.
    - COMPARATIVO DEL AÑO ANTERIOR: las columnas "Anterior Aj." y "Anterior N." son SIEMPRE las cifras del ejercicio anterior cerrado (columnas comparativas del 10-K). Queda TERMINANTEMENTE PROHIBIDO copiar las cifras del ejercicio actual en las columnas "Anterior": si un dato comparativo no aparece en el informe, déjalo como "—" y el sistema lo completará desde la SEC. Una variación de "+0,00 %" en todas las filas solo es válida si las cifras son realmente idénticas.
    - Deterioros / Impairments / Depreciaciones:
      * Si en el ejercicio actual o previo hubo deterioros de intangibles o fondo de comercio (goodwill), súmalos de vuelta en la columna Ajustado (o Anterior Ajustado) del Beneficio Operativo.
      * "isAdjusted": true y "adjustedNote": "*1" ÚNICAMENTE en Beneficio Operativo. EBT y Beneficio Neto calculan sus cifras derivadas sin colorearse de forma heredada.
    - Normalización de Impuestos (23 %):
      * Compara el gasto por impuestos con el 23 % del EBT ajustado. Si hay beneficio fiscal atípico o tasa distorsionada, normalizar al 23 % (Beneficio Neto Ajustado = EBT Ajustado × 0,77) y desglosarlo en nota explicativa "*2".
    - Acciones y BPA:
      * "shares": Acciones a fecha de cierre del ejercicio (no el promedio ponderado diluido) comparadas contra el cierre anterior y el efecto % en el BPA por la variación de acciones (ej. "190,8M (al final del 2025, no el promedio) -> %6,2 menos (203,2M)-> efecto en el BPA: %6,5").
      * "eps": BPA diluido ajustado, variación porcentual y BPA previo.

  * BLOQUE 2 — CASH FLOW (12 meses):
    - Escenarios: ["Normal (WC=valorReportado)", "Ajustado*1 (WC=valorAjustado)"] con los importes numéricos exactos de Working Capital.
    - CIFRAS EXACTAS (OBLIGATORIO): usa las cifras EXACTAS del JSON de extracción (el sistema ya las completó desde el estado de flujos XBRL de la SEC). Queda TERMINANTEMENTE PROHIBIDO redondear o estimar cifras reportadas (ej. 4500 en vez de 4462, u 800 en vez de 801). Nunca escribas notas del tipo "el CAPEX no viene desglosado, se estima en ~800M": si el sistema dispone de la cifra, es exacta.
    - Working Capital Anual (12 meses):
      WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen). Al ser 12 meses completos, NO se divide por 4.
      Desviación WC = WC reportado - WK recurrente. Cash Flow ajustado = Cash Flow normal - Desviación WC.
    - REGLA DE SIGNOS EN LA NOTA (*1): la desviación conserva su signo y la resta se escribe de forma explícita, sin frases contradictorias. Ejemplo correcto: "Desviación del circulante reportado (-147M) frente al WK teórico (12,1M): -159,1M. El Cash Flow ajustado resta esa desviación: 1784,4M - (-159,1M) = 1943,5M.". Queda prohibido escribir "ajuste de -159M (1784,4M + 159,1M)".
    - Ajuste de impuestos en efectivo: si los impuestos pagados difieren significativamente del gasto devengado normalizado, reflejar el ajuste en efectivo y la nota al pie "*2".
    - Métricas obligatorias: Cash Flow, CAPEX, FCF, FCF/Acción, Dividendo, Libre.

  * BLOQUE 3 — ASIGNACIÓN DE CAPITAL (12 meses):
    - Variación acumulada de todo el año comparando el balance a cierre del ejercicio contra el balance de inicio del año (BeginningOfYear).
    - Partidas: Libre (+/-), Inversiones a corto plazo (neto ventas-compras; -/+), Desinversiones (+), Adquisiciones (-), Recompras (-), Caja (-/+), Deuda (+/-), En total.
    - Nota obligatoria de Deuda Balance, Deuda Neta y Caja Balance con formato exacto:
      "Deuda balance: <anterior>M -> <actual>M (<variación>M). Deuda neta: <anterior_neta>M -> <actual_neta>M (<variación_neta>M). Caja balance: <anterior>M -> <actual>M (<variación>M); la caja aumentó: uso de capital (-) / la caja disminuyó: fuente de liquidez (+); fila Caja = <valor>M."
    - La fila Caja y la Deuda se miden SIEMPRE por la variación de saldos del balance (nunca por el cambio neto de efectivo del estado de flujos). Si el estado de flujos presenta un neto de caja distinto, se explica la diferencia citando las notas del 10-K (efectivo restringido, efecto divisa u otras partidas no monetarias).
    - Verificación (umbral relativo): "Más o menos cuadra..." si |En total| <= máximo(50M, 20 % del capital Libre, 10 % de la suma bruta de movimientos de capital); "No cuadra..." si supera ese umbral.

- PARTE II: INDAGACIÓN A FONDO / CONCLUSIÓN (OBLIGATORIA EN 10-K):
  1. "repurchases":
     * Detalle exhaustivo de las recompras de acciones ejecutadas durante el año y en el histórico reciente (2-3 años), mencionando el importe total del ejercicio, las acciones recompradas y el precio medio pagado si el informe los desglosa, y el ritmo de ejecución multianual (usa "annualDetails.repurchases.repurchaseHistory" si está disponible).
     * Menciona también los términos del programa: importe autorizado, fecha de autorización y fecha de vencimiento de la autorización.
     * Precio medio ponderado pagado por acción durante el año.
     * "authorizationRemaining": Importe en $M que queda pendiente de ejecutar en el programa de recompras (remanente de la autorización vigente). NO uses "programAuthorization" ni "programRemaining". Si el JSON de extracción incluye "annualDetails.repurchases.programRemaining" (número en $M), usa OBLIGATORIAMENTE ese importe para "authorizationRemaining" y redáctalo como texto (ej. "Unos 2.600M de $ pendientes de ejecución"). Queda PROHIBIDO afirmar que el 10-K no desglosa el remanente si el JSON de extracción lo incluye.
     * "authorizationExpiry": SOLO si el 10-K lo indica de forma expresa: la fecha en que caduca la autorización del programa (ej. "Vigente hasta diciembre de 2031"); o "Sin fecha de caducidad" únicamente si el 10-K afirma explícitamente que el programa no tiene vencimiento. Si el 10-K no dice nada sobre la caducidad, OMITE el campo por completo (nunca escribas "no indicada" ni similar).
     * "shareCountEvolution": Evolución del número de acciones EN EL ÚLTIMO AÑO: del cierre del ejercicio anterior al cierre del ejercicio analizado, usando los dos últimos puntos de "sharesHistory" (ej. "De 208,9M de acciones en diciembre de 2024 a 199,1M en diciembre de 2025 (-4,7 %)"). NO uses el acumulado de dos o más años.
     * "bpaImpact": Impacto porcentual en el BPA DEL ÚLTIMO AÑO derivado exclusivamente de la reducción de acciones (ej. "+4,9 % de subida en el BPA en el último año exclusivamente por recompras"). NO uses el acumulado de dos años.
     * "futureProjection": PROYECCIÓN A 5 AÑOS con estimación matemática explícita si se mantiene el precio medio pagado en el año: acciones recomprables = authorizationRemaining / precio medio; reparto anual (dividido entre 5 años); reducción anual del número de acciones en %; y efecto anual resultante en el BPA. Ejemplo: "Proyección a 5 años: con ~2.600M de autorización restante y un precio medio de ~51 $, se podrían recomprar ~51M de acciones (~10,2M/año), lo que reduciría el capital un ~5,1 % anual e impulsaría el BPA ~5,4 % cada año." Solo incluye el cálculo si dispones de authorizationRemaining y precio medio; si no, describe la capacidad de recompra con el flujo libre.
     * "sharesHistory": Array con las acciones en circulación al cierre de los últimos 5 ejercicios: [{ "year": 2021, "shares": 231.5 }, ...] en millones. Usa los datos extraídos en "annualDetails.repurchases.sharesHistory" (mínimo 3 años si el informe no desglosa los 5).
     * "secSnippet": Tabla oficial del 10-K sobre compras de acciones propias (Share Repurchase Program) con headers y rows numéricos. Si el 10-K desglosa acciones y coste por año, "rows" DEBE incluir "Shares repurchased", "Aggregate cost (in millions)" y "Average price paid (in $)" (precio medio = coste agregado / acciones recompradas). Si el 10-K NO incluye tabla propia de recompras pero el JSON de extracción trae "annualDetails.repurchases.repurchaseHistory", construye la tabla multianual con una columna por ejercicio (mínimo 3 años), fila "Aggregate cost (in millions)" y, si consta el remanente, fila "Remaining authorization (in millions)" en la columna del último año. Queda PROHIBIDO limitar la tabla a un solo año cuando existan datos de varios ejercicios.
  2. "outlook":
     * REGLA DE FORMATO EN NEGRITA (OBLIGATORIA): En la redacción del outlook ("text", "fcfAnalysis", "riskFactors", "efficiencyPlans"), pon SIEMPRE en negrita con Markdown ("**...**") todos los números, porcentajes, importes monetarios, rangos de guidance, años proyectados y conceptos financieros más importantes (ejemplo: "**flat +/- 1 %**", "**-15 % al -18 %**", "**1.100M$ +/- 10 %**", "**650M$ +/- 5 %**", "**376M$**", "**450M$ en 3 años (2026-2028)**", "**~5 % anual**", "**22 % al 24 %**").
     * Análisis riguroso del guidance y perspectivas oficiales comunicadas por la dirección para el próximo ejercicio.
     * Desglose de metas: crecimiento de ingresos en moneda constante, EBT subyacente, BPA diluido, Free Cash Flow guiado, CAPEX presupuestado y gastos netos por intereses.
     * Si el informe anual 10-K no incluye guidance pero la sección complementaria (8-K / presentación) sí lo aporta, este apartado DEBE redactarse basándose en ese guidance oficial, citándolo expresamente como las metas de la dirección para el próximo año.
     * Si la compañía no facilita cifras cuantitativas en ninguna fuente, indícalo con objetividad ("La compañía no ha facilitado previsiones cuantitativas en la documentación oficial disponible..."). Queda TERMINANTEMENTE PROHIBIDO inventar rangos, porcentajes o copiar datos del schema de ejemplo.
     * "fcfAnalysis": Sostenibilidad y cobertura del FCF esperado para dividendos y recompras, comparándolo con el FCF del ejercicio cerrado.
     * "riskFactors": Sensibilidad operativa y riesgos de costes (materias primas específicas de su sector, energía, fletes, inflación).
     * "efficiencyPlans": Programas de ahorro o reestructuración de costes en marcha anunciados por la dirección.
     * "secSnippet": TABLA OFICIAL DEL GUIDANCE CON 4 COLUMNAS OBLIGATORIAS:
       - "headers": ["Métrica", "[AÑO-1] (Año anterior)", "Guidance [AÑO]E*", "Cifra Proyectada [AÑO]E"]
       - Columna 1 "Métrica": Denominación oficial de la métrica (Net Sales, Underlying EBT, Diluted EPS, Free Cash Flow, CAPEX, etc.).
       - Columna 2 "[AÑO-1] (Año anterior)": SIEMPRE poner el valor real conseguido el año pasado cerrado (obtenido del 10-K: ventas cerradas, EBT cerrado, BPA cerrado, FCF del estado de flujos, CAPEX cerrado, intereses cerrados, etc.).
       - Columna 3 "Guidance [AÑO]E*": La meta oficial cuantitativa facilitada por la empresa (ej. "Flat +/- 1%", "-15% to -18% Decline", "$1.1B +/- 10%").
       - Columna 4 "Cifra Proyectada [AÑO]E": CUANDO PONE FLAT Y LOS PORCENTAJES, PONER AL LADO CUÁNTO ES EN VENTAS O EN NÚMERO, calculando la cifra monetaria en valor absoluto proyectada (ej. si ventas 2025 fueron 11.141M$ y la guía es Flat +/- 1%, poner "~$11.030M – $11.252M"; si EBT fue 1.402M$ y la guía es -15% a -18%, poner "~$1.150M – $1.192M"; si FCF es $1.1B +/- 10%, poner "~$990M – $1.210M").
       - Queda TERMINANTEMENTE PROHIBIDO dejar solo 'flat' o porcentajes sin calcular la cifra monetaria en ventas/número al lado, y queda PROHIBIDO omitir el valor conseguido el año pasado.
   3. "debt":
      * REGLA DE FORMATO EN NEGRITA (OBLIGATORIA): En la redacción de deuda ("text", "refinancingAnalysis", "refinancingImpact"), pon SIEMPRE en negrita con Markdown ("**...**") todos los números, importes monetarios, porcentajes, tipos de interés, impactos en BPA y años (ej. "**4.950 M$**", "**-350 M$**", "**3,00 %**", "**5,25 %**", "**-0,09 $/acción**", "**2026**").
      * Diagnóstico riguroso de la estructura financiera y liquidez. Explicar cuánto ha variado la deuda neta y la deuda normal (total) respecto al ejercicio anterior.
       * Calendario de vencimientos contractuales: el desglose gráfico y detallado DEBE LIMITARSE ESTRICTAMENTE A LOS PRÓXIMOS 5 AÑOS (cualquier vencimiento posterior al año 5 se resume en "maturityAfterFive" y queda fuera del gráfico). En cada año debe listarse CADA emisión/tramo que vence con su importe y su tipo cupón: si un mismo año tiene dos vencimientos, "maturitySchedule" DEBE contener dos entradas para ese año (una por emisión, con "rate" y "type" propios), no un único total agregado. Si la emisión/tramo tiene un cupón conocido en la tabla de deuda, incluye "rate"; si el informe solo publica el importe agregado de vencimientos sin desglosar la emisión, deja "rate" en null (el gráfico NO debe repetir el tipo medio en cada barra).
      * Tipos medios: calcular para cada año el tipo de interés medio ponderado pagado por las deudas que vencen ese año. El banner del gráfico muestra el tipo de interés medio total de TODA la deuda (ponderando todos los tramos con cupón conocido, incluidos los que vencen después del año 5), no solo los de la ventana de 5 años. En la redacción NO llames "tipo de interés medio total" al promedio de los próximos 5 años: si lo mencionas, llámalo "tipo medio de los vencimientos de los próximos 5 años", y reserva "tipo de interés medio de toda la deuda" para el promedio ponderado de todos los tramos con cupón conocido (incluidos los posteriores al año 5). Si el JSON de extracción incluye "annualDetails.debt.allDebtAverageRate" (calculado por el sistema), usa EXACTAMENTE ese valor cuando menciones el tipo medio de toda la deuda. Si además "allDebtAverageRateEstimated" es true, preséntalo como "tipo de interés medio estimado" e indica su base según "allDebtAverageRateSource" (p. ej. rangos de cupón ponderados o intereses del ejercicio sobre la deuda media); nunca lo presentes como un cupón exacto. Queda PROHIBIDO afirmar que la compañía "no facilita" los tipos si el JSON de extracción incluye la tabla de deuda con tipos o rangos de cupón: en ese caso descríbelos y calcula el promedio ponderado.
      * Gráfico histórico de 10 años: proporcionar en "debtHistory" los últimos 10 años hasta la actualidad de Deuda Normal (Total) y Deuda Neta, indicando cuánto ha cambiado cada una respecto al año anterior.
      * Refinanciación e impacto en el BPA: si la empresa ha refinanciado deuda, indicar qué tipo de interés devengaba la deuda que acaba de vender o retirar ("oldDebtRate") y qué tipo de interés gasta la nueva deuda emitida ("newDebtRate"), calculando el sobrecoste o ahorro neto y el IMPACTO EXACTO EN EL BPA en $/acción.
      * Refinanciación POSIBLE (sin decisión tomada): si la compañía está evaluando refinanciar vencimientos próximos o aún no ha decidido, describe el escenario como posible/estimado: en "refinancing" marca "occurred": false, usa como "oldDebtRate" el tipo medio ponderado de los vencimientos que se refinanciarían, como "newDebtRate" el posible tipo estimado de la nueva emisión, como "amountRefinanced" el volumen que vence y calcula igualmente "annualInterestImpact" y "epsImpact" como POSIBLE impacto en el BPA. En la redacción usa expresamente "posible tipo de nueva emisión" y "posible impacto en BPA". Explica la BASE del tipo estimado (esto es obligatorio): parte del valor razonable de la deuda frente a su valor en libros revelado en el 10-K (si cotiza con descuento, el mercado exige más rendimiento que el cupón), de los cupones de las emisiones o refinanciaciones recientes de la propia compañía y del nivel general de tipos de mercado. Nunca presentes la estimación como un hecho consumado.
      * "secSnippet": Tabla oficial del 10-K de compromisos contractuales de deuda ("Debt obligations - Contractual maturities") con obligaciones, vencimientos y saldos.
  4. "acquisitions":
     * Detalle de adquisiciones o compras corporativas efectuadas en el ejercicio, o confirmación expresa de que no se realizaron compras materiales.
     * REGLA DEL EJERCICIO: si "annualDetails"/"facts" indica "acquisitionsYtd" = 0 o < 50M, la sección DEBE confirmar que no hubo adquisiciones materiales en el año analizado. Queda PROHIBIDO presentar una adquisición del ejercicio anterior como si fuera del año analizado; si se menciona como contexto, debe indicarse su fecha real (año anterior).
  5. "dividends":
     * Incluye esta sección ÚNICAMENTE si en el ejercicio ha habido un AUMENTO, RECORTE, SUSPENSIÓN o un cambio relevante en la política de dividendos. Si el dividendo se mantiene estable y sin cambios relevantes, OMITE por completo la sección.
     * Redacta en "text": dividendo por acción del ejercicio, importe total pagado, variación respecto al año anterior (%) y fecha del anuncio si consta.
     * "changeType": "increase", "cut" o "unchanged"; "changePct": variación porcentual del dividendo por acción del último ejercicio frente al anterior.
     * "history": serie de los últimos 3-5 ejercicios con "year", "dps" (dividendo por acción), "total" (millones) y "adjustedEps" (BPA diluido ajustado/subyacente del año, si consta). Usa "annualDetails.dividends.history" (completado por el sistema desde XBRL y el 8-K) como base y NO inventes el BPA ajustado: si un año no lo tienes, déjalo null.
  6. "watchlist":
     * "title": "Cosas a tener en cuenta en [AÑO SIGUIENTE]".
     * "items": Lista ordenada de 2 a 4 catalizadores o riesgos financieros clave a monitorizar el próximo año.

- PARTE III: NOTA DE RESULTADOS (1 A 10):
  * "score": Puntuación numérica del 1 al 10 (ej. 3, 7, 8).
  * "label": "NOTA DE RESULTADOS: <score>".
  * "rationale": Justificación analítica concisa.
  * REGLA ESTRICTA DE NO ESPECULACIÓN:
    La nota se fundamenta ÚNICA Y EXCLUSIVAMENTE en la realidad financiera de las cuentas del ejercicio cerrado, las cifras oficiales del guidance/outlook para el siguiente año y la efectividad de la asignación de capital ejecutada. Queda TERMINANTEMENTE PROHIBIDO especular o juzgar si la empresa o su directiva cumplirán o no esas expectativas.`;

export class AnalystAgent extends BaseAgent {
  constructor() {
    super({
      name: 'analyst',
      description: 'Analiza el informe financiero y genera la estructura de Ventas, Cash Flow y Asignación de Capital.',
    });
  }

  async run(input) {
    if (!input?.text?.trim()) {
      throw new AgentError('No se pudo leer el contenido del documento.', 'EMPTY_DOCUMENT');
    }

    const sector = input.sector ?? 'defensive_consumer';
    const subsector = input.subsector ?? null;
    const formType = input.formType ?? '10-Q';
    const isAnnual = String(formType || '').toUpperCase().includes('10-K') || String(formType || '').toLowerCase().includes('anual');
    let rules;
    try {
      rules = await loadKnowledgeRules(sector, subsector, formType, input.ticker ?? null);
    } catch {
      throw new AgentError(`No hay reglas de análisis definidas para el sector ${sector}.`, 'NO_SECTOR_RULES');
    }

    const extractionPrompt = EXTRACTION_PROMPT.replace('{SCHEMA}', EXTRACTION_SCHEMA.trim());
    let extracted;
    try {
      extracted = await chatJson([
        { role: 'system', content: extractionPrompt },
        { role: 'user', content: buildAnalysisText(input.text, input.presentationText) },
      ]);
    } catch (error) {
      console.error('[analyst:extraction]', error.message);
      if (error instanceof AiProviderError) throw error;
      throw new AgentError('No se pudieron extraer los datos del informe.', 'INVALID_MODEL_RESPONSE');
    }

    const ticker = input.ticker || extracted.ticker;
    const extractedTaxAdjustment = extractTaxCashFlowAdjustment(input.text);
    const extractedIncomeTaxesPaid = extractIncomeTaxesPaid(input.text);
    extracted._rawText = input.text;
    if (isAnnual) {
      extracted.annualDetails = extracted.annualDetails || {};
      const annualRep = extracted.annualDetails.repurchases || (extracted.annualDetails.repurchases = {});
      if (annualRep.programRemaining == null || annualRep.programRemaining === '' || isPlaceholderText(annualRep.programRemaining)) {
        const remaining = extractRemainingAuthorization(input.text);
        if (remaining != null) {
          annualRep.programRemaining = remaining;
          annualRep.programRemainingSource = 'extracción automática de remanente';
        }
      }
      const programTerms = extractRepurchaseProgramTerms(input.text);
      if (programTerms.programAuthorizedTotal != null && annualRep.programAuthorizedTotal == null) {
        annualRep.programAuthorizedTotal = programTerms.programAuthorizedTotal;
      }
      if (programTerms.programExpiry && !annualRep.programExpiry) {
        annualRep.programExpiry = programTerms.programExpiry;
      }
      if (programTerms.programSummary && !annualRep.programSummary) {
        annualRep.programSummary = programTerms.programSummary;
      }
      if (programTerms.programApprovalDate && !annualRep.programApprovalDate) {
        annualRep.programApprovalDate = programTerms.programApprovalDate;
      }
    }
    const extractedCapitalFacts = extractCapitalCashFlowFacts(input.text);
    if (extracted.facts) {
      if (extractedTaxAdjustment != null) {
        extracted.facts.taxCashFlowAdjustmentYtd ??= extractedTaxAdjustment;
      }
      if (extractedIncomeTaxesPaid != null) {
        extracted.facts.incomeTaxesPaidYtd ??= extractedIncomeTaxesPaid;
      }
    }
    const reportingPeriod = extracted.reportingPeriod || null;
    const fiscalQuarter = isAnnual ? 4 : (extracted.fiscalQuarter || (extracted.ytd?.months ? Math.round(extracted.ytd.months / 3) : null));
    const fiscalYear = extracted.fiscalYear || (reportingPeriod ? Number(reportingPeriod.slice(0, 4)) : null);
    if (extracted.facts) {
      if (extractedCapitalFacts.shareBuybacks != null) extracted.facts.shareBuybacks = Math.abs(extractedCapitalFacts.shareBuybacks);
      if (extractedCapitalFacts.purchasesOfMarketableSecurities != null) {
        extracted.facts.purchasesOfMarketableSecuritiesYtd = Math.abs(extractedCapitalFacts.purchasesOfMarketableSecurities);
        if (fiscalQuarter === 1) extracted.facts.purchasesOfMarketableSecuritiesQuarter = Math.abs(extractedCapitalFacts.purchasesOfMarketableSecurities);
      }
      if (extractedCapitalFacts.proceedsFromSaleOfMarketableSecurities != null) {
        extracted.facts.proceedsFromSaleOfMarketableSecuritiesYtd = Math.abs(extractedCapitalFacts.proceedsFromSaleOfMarketableSecurities);
        if (fiscalQuarter === 1) extracted.facts.proceedsFromSaleOfMarketableSecuritiesQuarter = Math.abs(extractedCapitalFacts.proceedsFromSaleOfMarketableSecurities);
      }
      if (extractedCapitalFacts.acquisitionsOfBusiness != null) {
        const acqValue = Math.abs(extractedCapitalFacts.acquisitionsOfBusiness);
        if (acqValue >= 50) {
          extracted.facts.acquisitionsYtd = acqValue;
          if (fiscalQuarter === 1) extracted.facts.acquisitionsQuarter = acqValue;
        }
      }
      if (extractedCapitalFacts.proceedsFromAssetSales != null) {
        const assetSalesValue = Math.abs(extractedCapitalFacts.proceedsFromAssetSales);
        extracted.facts.assetSalesYtd ??= assetSalesValue;
        if (fiscalQuarter === 1) extracted.facts.assetSalesQuarter ??= assetSalesValue;
      }
      const extractedEquity = extractEquityIssuance(input.text);
      if (extractedEquity.preferred != null && extractedEquity.preferred >= 50) {
        extracted.facts.preferredIssuanceYtd = extractedEquity.preferred;
        if (fiscalQuarter === 1) extracted.facts.preferredIssuanceQuarter = extractedEquity.preferred;
      }
      if (extractedEquity.nonControlling != null && extractedEquity.nonControlling >= 50) {
        extracted.facts.nonControllingSaleYtd = extractedEquity.nonControlling;
        if (fiscalQuarter === 1) extracted.facts.nonControllingSaleQuarter = extractedEquity.nonControlling;
      }
      const extractedDebtCash = extractDebtCashFlow(input.text);
      if (extractedDebtCash != null) extracted.facts.debtCashFlowYtd = extractedDebtCash;
    }
    normalizeExtractedUnits(extracted);
    // Recalcular con las partidas directas del estado de flujos (recompras y marketable securities).
    extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted);
    if (fiscalQuarter === 1 && extracted.facts) {
      if (extractedTaxAdjustment != null) {
        extracted.facts.taxCashFlowAdjustmentQuarter ??= extractedTaxAdjustment;
      }
      if (extractedIncomeTaxesPaid != null) {
        extracted.facts.incomeTaxesPaidQuarter ??= extractedIncomeTaxesPaid;
      }
    }

    // Asignación de capital calculada desde el balance extraído (siempre disponible;
    // el bloque EDGAR posterior la enriquece con flujos deducidos y desinversiones)
    extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted);

    if (ticker && fiscalQuarter && fiscalQuarter > 1 && !isAnnual) {
      try {
        const prevQ = await getPreviousQuarterCashFlow(ticker, fiscalYear, fiscalQuarter, reportingPeriod);
        if (prevQ) {
          extracted.previousQuarterCashFlow = prevQ;
          const cfoYtd = extracted.cashFlow?.operating != null ? Number(extracted.cashFlow.operating) : null;
          const capexYtd = extracted.cashFlow?.capex != null ? Math.abs(Number(extracted.cashFlow.capex)) : null;
          const divYtd = extracted.cashFlow?.dividends != null ? Math.abs(Number(extracted.cashFlow.dividends)) : null;

          let cfo3M = prevQ.currentQuarterData?.cfo3M != null ? prevQ.currentQuarterData.cfo3M : null;
          let capex3M = prevQ.currentQuarterData?.capex3M != null ? prevQ.currentQuarterData.capex3M : null;
          let div3M = prevQ.currentQuarterData?.dividends3M != null ? prevQ.currentQuarterData.dividends3M : null;

          if (cfo3M == null && cfoYtd != null && prevQ.cfoYtd != null) {
            cfo3M = Math.round((cfoYtd - prevQ.cfoYtd) * 10) / 10;
          }
          if (capex3M == null && capexYtd != null && prevQ.capexYtd != null) {
            capex3M = Math.round((capexYtd - prevQ.capexYtd) * 10) / 10;
          }
          if (div3M == null && divYtd != null && prevQ.dividendsYtd != null) {
            div3M = Math.round((divYtd - prevQ.dividendsYtd) * 10) / 10;
          }

          let fcf3M = null, libre3M = null;
          if (cfo3M != null && capex3M != null) {
            fcf3M = Math.round((cfo3M - capex3M) * 10) / 10;
            if (div3M != null) {
              libre3M = Math.round((fcf3M - div3M) * 10) / 10;
            }
          }

          extracted.deducedQuarterCashFlow = {
            operating: cfo3M,
            capex: capex3M,
            dividends: div3M,
            fcf: fcf3M,
            libre: libre3M,
            deductionDetail: (cfoYtd != null && prevQ.cfoYtd != null)
              ? `Q${fiscalQuarter} YTD ${cfoYtd}M − Q${fiscalQuarter - 1} YTD ${prevQ.cfoYtd}M = ${cfo3M}M`
              : null,
          };

          // Financing items de-accumulated for 3M
          const buybacksYtd = extracted.facts?.shareBuybacks != null ? Number(extracted.facts.shareBuybacks) : null;
          const buybacks3M = (buybacksYtd != null && prevQ.buybacksYtd != null)
            ? Math.max(0, Math.round((buybacksYtd - prevQ.buybacksYtd) * 10) / 10)
            : 0;

          extracted.deducedQuarterFinancing = {
            buybacks: buybacks3M,
          };

          // Working Capital calculation
          const inv = extracted.balance?.inventories ?? prevQ.currentQuarterData?.inventory ?? null;
          const pay = extracted.balance?.accountsPayable ?? prevQ.currentQuarterData?.payables ?? null;
          const rec = extracted.balance?.accountsReceivable ?? prevQ.currentQuarterData?.receivables ?? 0;
          const wcRep3M = extracted.workingCapital?.reportedChangeQuarter ?? prevQ.currentQuarterData?.workingCapitalChange3M ?? null;
           const inflationRate = Number.isFinite(Number(extracted.workingCapital?.inflationRate))
             ? Number(extracted.workingCapital.inflationRate)
             : 3.0;
           const volumeGrowth = Number.isFinite(Number(extracted.workingCapital?.volumeGrowth))
             ? Number(extracted.workingCapital.volumeGrowth)
             : 0;
           const growth = Number.isFinite(Number(extracted.workingCapital?.inflationAndVolume))
             ? Number(extracted.workingCapital.inflationAndVolume)
             : inflationRate + volumeGrowth;

          if (inv != null && pay != null) {
            // Impacto de caja WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) * (inflación + volumen)
            // Impacto de caja de la necesidad de circulante: una inversión de WC es negativa.
            // Se evita el doble cambio de signo de la fórmula anterior.
            const annualWcReq = Math.round(((pay - inv - rec) * (growth / 100)) * 10) / 10;
            const quarterWcReq = Math.round((annualWcReq / 4) * 10) / 10;

            const rep3M = wcRep3M != null ? wcRep3M : 0;
            const wcDiff3M = Math.round((rep3M - quarterWcReq) * 10) / 10;

            const cfoAdj3M = cfo3M != null ? Math.round((cfo3M - wcDiff3M) * 10) / 10 : null;
            const capexAdj3M = capex3M;
            const fcfAdj3M = (cfoAdj3M != null && capexAdj3M != null) ? Math.round((cfoAdj3M - capexAdj3M) * 10) / 10 : null;
            const divAdj3M = div3M;
            const libreAdj3M = (fcfAdj3M != null && divAdj3M != null) ? Math.round((fcfAdj3M - divAdj3M) * 10) / 10 : null;

            const sharesNum = extracted.shares || prevQ.currentQuarterData?.shares || null;
            const fcfPerShareNormal = (fcf3M != null && sharesNum) ? `${(fcf3M / sharesNum).toFixed(2).replace('.', ',')} $` : null;
            const fcfPerShareAdj = (fcfAdj3M != null && sharesNum) ? `${(fcfAdj3M / sharesNum).toFixed(2).replace('.', ',')} $` : null;

            const wcData = {
              inventories: inv,
              accountsPayable: pay,
              accountsReceivable: rec,
              inflationAndVolume: growth,
              inflationRate,
              volumeGrowth,
              annualWcReq,
              quarterWcReq,
              reportedWc3M: wcRep3M,
              wcDiff3M,
              quarterScenarios: [
                wcRep3M != null ? `Normal (WC=${Math.round(wcRep3M)})` : 'Normal',
                `Ajustado (WC=${Math.round(quarterWcReq)})`,
              ],
              quarterValues: {
                cfo: [cfo3M != null ? String(cfo3M).replace('.', ',') : null, cfoAdj3M != null ? String(cfoAdj3M).replace('.', ',') : null],
                capex: [capex3M != null ? String(capex3M).replace('.', ',') : null, capexAdj3M != null ? String(capexAdj3M).replace('.', ',') : null],
                fcf: [fcf3M != null ? String(fcf3M).replace('.', ',') : null, fcfAdj3M != null ? String(fcfAdj3M).replace('.', ',') : null],
                fcfPerShare: [fcfPerShareNormal, fcfPerShareAdj],
                dividends: [div3M != null ? String(div3M).replace('.', ',') : null, divAdj3M != null ? String(divAdj3M).replace('.', ',') : null],
                libre: [libre3M != null ? String(libre3M).replace('.', ',') : null, libreAdj3M != null ? String(libreAdj3M).replace('.', ',') : null],
              },
              explanation3M: `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflationRate}% + ${volumeGrowth}%) = ${formatWcNumber(annualWcReq)}M en todo el año -> en 3 meses = ${formatWcNumber(quarterWcReq)}M. ${buildWcDeviationSentence({ reported: rep3M, wcReq: quarterWcReq, deviation: wcDiff3M, cfo: cfo3M, adjusted: cfoAdj3M })}`,
            };

            if (extracted.ytd?.months) {
              const months = extracted.ytd.months;
              const ytdWcReq = Math.round((annualWcReq * (months / 12)) * 10) / 10;
              const ytdWcRep = extracted.workingCapital?.reportedChangeYtd ?? prevQ.workingCapitalChangeYtd ?? null;
              const repYtd = ytdWcRep != null ? ytdWcRep : 0;
              const wcDiffYtd = Math.round((repYtd - ytdWcReq) * 10) / 10;

              const cfoAdjYtd = cfoYtd != null ? Math.round((cfoYtd - wcDiffYtd) * 10) / 10 : null;
              const capexAdjYtd = capexYtd;
              const fcfYtd = (cfoYtd != null && capexYtd != null) ? Math.round((cfoYtd - capexYtd) * 10) / 10 : null;
              const fcfAdjYtd = (cfoAdjYtd != null && capexAdjYtd != null) ? Math.round((cfoAdjYtd - capexAdjYtd) * 10) / 10 : null;
              const divAdjYtd = divYtd;
              const libreYtd = (fcfYtd != null && divYtd != null) ? Math.round((fcfYtd - divYtd) * 10) / 10 : null;
              const libreAdjYtd = (fcfAdjYtd != null && divAdjYtd != null) ? Math.round((fcfAdjYtd - divAdjYtd) * 10) / 10 : null;

              const fcfPerShareNormalYtd = (fcfYtd != null && sharesNum) ? `${(fcfYtd / sharesNum).toFixed(2).replace('.', ',')} $` : null;
              const fcfPerShareAdjYtd = (fcfAdjYtd != null && sharesNum) ? `${(fcfAdjYtd / sharesNum).toFixed(2).replace('.', ',')} $` : null;

              wcData.ytdScenarios = [
                ytdWcRep != null ? `Normal (WC=${Math.round(ytdWcRep)})` : 'Normal',
                `Ajustado (WC=${Math.round(ytdWcReq)})`,
              ];
              wcData.ytdValues = {
                cfo: [cfoYtd != null ? String(cfoYtd).replace('.', ',') : null, cfoAdjYtd != null ? String(cfoAdjYtd).replace('.', ',') : null],
                capex: [capexYtd != null ? String(capexYtd).replace('.', ',') : null, capexAdjYtd != null ? String(capexAdjYtd).replace('.', ',') : null],
                fcf: [fcfYtd != null ? String(fcfYtd).replace('.', ',') : null, fcfAdjYtd != null ? String(fcfAdjYtd).replace('.', ',') : null],
                fcfPerShare: [fcfPerShareNormalYtd, fcfPerShareAdjYtd],
                dividends: [divYtd != null ? String(divYtd).replace('.', ',') : null, divAdjYtd != null ? String(divAdjYtd).replace('.', ',') : null],
                libre: [libreYtd != null ? String(libreYtd).replace('.', ',') : null, libreAdjYtd != null ? String(libreAdjYtd).replace('.', ',') : null],
              };
              wcData.explanationYtd = `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflationRate}% + ${volumeGrowth}%) = ${formatWcNumber(annualWcReq)}M en todo el año -> en ${months} meses = ${formatWcNumber(ytdWcReq)}M. ${buildWcDeviationSentence({ reported: repYtd, wcReq: ytdWcReq, deviation: wcDiffYtd, cfo: cfoYtd, adjusted: cfoAdjYtd })}`;
            }

            extracted.workingCapitalData = wcData;
          }

          // Capital Allocation calculation based on Balance Sheet & Divestitures
          const capFromEdgar = prevQ.capitalAllocation;

          // 3M Debt & Cash from extracted balance if available, else from EDGAR
          const prevDebt3M = prevQ.totalDebt != null ? prevQ.totalDebt : extracted.balance?.totalDebtPreviousQuarter;
          const currDebt3M = extracted.balance?.totalDebt != null ? extracted.balance.totalDebt : (prevDebt3M != null && capFromEdgar?.threeMonths?.deuda != null ? prevDebt3M + capFromEdgar.threeMonths.deuda : null);
          let debt3M = null;
          if (currDebt3M != null && prevDebt3M != null) {
            debt3M = Math.round((currDebt3M - prevDebt3M) * 10) / 10;
          } else if (capFromEdgar?.threeMonths?.deuda != null) {
            debt3M = capFromEdgar.threeMonths.deuda;
          }

          const prevCash3M = prevQ.cash != null ? prevQ.cash : extracted.balance?.cashPreviousQuarter;
          const currCash3M = extracted.balance?.cash != null ? extracted.balance.cash : null;
          let caja3M = null;
          if (currCash3M != null && prevCash3M != null) {
            caja3M = Math.round((-(currCash3M - prevCash3M)) * 10) / 10;
          } else if (capFromEdgar?.threeMonths?.caja != null) {
            caja3M = capFromEdgar.threeMonths.caja;
          }

          const debtDetails3M = buildDebtDetails({
            prev: prevDebt3M != null ? Number(prevDebt3M) : null,
            curr: currDebt3M != null ? Number(currDebt3M) : null,
            prevCash: prevCash3M != null ? Number(prevCash3M) : null,
            currCash: currCash3M != null ? Number(currCash3M) : null,
            prevSti: prevQ.shortTermInvestments != null ? Number(prevQ.shortTermInvestments) : (extracted.balance?.shortTermInvestmentsPreviousQuarter != null ? Number(extracted.balance.shortTermInvestmentsPreviousQuarter) : null),
            currSti: extracted.balance?.shortTermInvestments != null ? Number(extracted.balance.shortTermInvestments) : null,
            fallback: capFromEdgar?.threeMonths?.debtDetails ?? null,
          });

          let stInv3M = capFromEdgar?.threeMonths?.inversionesCortoPlazo || 0;
          const purchasesSec3M = Number(extracted.facts?.purchasesOfMarketableSecuritiesQuarter) || 0;
          const proceedsSec3M = Number(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesQuarter) || 0;
          if (purchasesSec3M || proceedsSec3M) {
            stInv3M = Math.round((proceedsSec3M - purchasesSec3M) * 10) / 10;
          } else if (extracted.balance?.shortTermInvestments != null && extracted.balance?.shortTermInvestmentsPreviousQuarter != null) {
            const diff = extracted.balance.shortTermInvestments - extracted.balance.shortTermInvestmentsPreviousQuarter;
            if (Math.abs(diff) >= 50) stInv3M = Math.round(-diff * 10) / 10;
          }

          const edgarDiv3M = capFromEdgar?.threeMonths?.divestitures;
          const divestitures3M = edgarDiv3M != null ? edgarDiv3M : 0;
          const buybacks3M_allocated = buybacks3M > 0
            ? -Math.abs(buybacks3M)
            : (capFromEdgar?.threeMonths?.buybacks ?? 0);

          const edgarAcq3M = capFromEdgar?.threeMonths?.acquisitions;
          const rawQuarterAcq = extracted.facts?.acquisitionsQuarter != null
            ? Math.abs(Number(extracted.facts.acquisitionsQuarter))
            : NaN;
          const rawYtdAcq = extracted.facts?.acquisitionsYtd != null
            ? Math.abs(Number(extracted.facts.acquisitionsYtd))
            : NaN;
          let acquisitions3M = 0;
          if (Number.isFinite(rawQuarterAcq) && rawQuarterAcq >= 50) {
            acquisitions3M = -rawQuarterAcq;
          } else if (Number.isFinite(rawYtdAcq) && rawYtdAcq >= 50) {
            // Trimestre = YTD Qn - YTD Qn-1 (si el trimestre anterior no tiene dato, se toma 0).
            const prevYtdAcq = Number.isFinite(Number(prevQ.acquisitionsYtd))
              ? Math.abs(Number(prevQ.acquisitionsYtd))
              : 0;
            const derivedAcq3M = Math.round((rawYtdAcq - prevYtdAcq) * 10) / 10;
            if (derivedAcq3M >= 50) acquisitions3M = -derivedAcq3M;
          }
          if (acquisitions3M === 0 && edgarAcq3M != null) {
            acquisitions3M = edgarAcq3M;
          }

          const edgarAssetSales3M = capFromEdgar?.threeMonths?.assetSales;
          let assetSales3M;
          if (edgarAssetSales3M != null) {
            assetSales3M = Math.abs(edgarAssetSales3M);
          } else if (extracted.facts?.assetSalesQuarter != null) {
            assetSales3M = Math.abs(Number(extracted.facts.assetSalesQuarter)) || 0;
          } else if (extracted.facts?.assetSalesYtd != null && fiscalQuarter === 1) {
            assetSales3M = Math.abs(Number(extracted.facts.assetSalesYtd)) || 0;
          } else {
            assetSales3M = 0;
          }

          // YTD Debt & Cash from extracted balance if available, else from EDGAR
          let debtYtd = null;
          if (extracted.balance?.totalDebt != null && extracted.balance?.totalDebtBeginningOfYear != null) {
            debtYtd = Math.round((extracted.balance.totalDebt - extracted.balance.totalDebtBeginningOfYear) * 10) / 10;
          } else if (capFromEdgar?.ytd?.deuda != null) {
            debtYtd = capFromEdgar.ytd.deuda;
          }

          let cajaYtd = null;
          if (extracted.balance?.cash != null && extracted.balance?.cashBeginningOfYear != null) {
            cajaYtd = Math.round((-(extracted.balance.cash - extracted.balance.cashBeginningOfYear)) * 10) / 10;
          } else if (capFromEdgar?.ytd?.caja != null) {
            cajaYtd = capFromEdgar.ytd.caja;
          }

          const debtDetailsYtd = buildDebtDetails({
            prev: extracted.balance?.totalDebtBeginningOfYear != null ? Number(extracted.balance.totalDebtBeginningOfYear) : null,
            curr: extracted.balance?.totalDebt != null ? Number(extracted.balance.totalDebt) : null,
            prevCash: extracted.balance?.cashBeginningOfYear != null ? Number(extracted.balance.cashBeginningOfYear) : null,
            currCash: extracted.balance?.cash != null ? Number(extracted.balance.cash) : null,
            prevSti: extracted.balance?.shortTermInvestmentsBeginningOfYear != null ? Number(extracted.balance.shortTermInvestmentsBeginningOfYear) : null,
            currSti: extracted.balance?.shortTermInvestments != null ? Number(extracted.balance.shortTermInvestments) : null,
            fallback: capFromEdgar?.ytd?.debtDetails ?? null,
          });

          let stInvYtd = capFromEdgar?.ytd?.inversionesCortoPlazo || 0;
          const purchasesSecYtd = Number(extracted.facts?.purchasesOfMarketableSecuritiesYtd) || 0;
          const proceedsSecYtd = Number(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesYtd) || 0;
          if (purchasesSecYtd || proceedsSecYtd) {
            stInvYtd = Math.round((proceedsSecYtd - purchasesSecYtd) * 10) / 10;
          } else if (extracted.balance?.shortTermInvestments != null) {
            const start = extracted.balance.shortTermInvestmentsBeginningOfYear ?? 0;
            const diff = extracted.balance.shortTermInvestments - start;
            if (Math.abs(diff) >= 50) stInvYtd = Math.round(-diff * 10) / 10;
          }

          const edgarDivYtd = capFromEdgar?.ytd?.divestitures;
          const rawDivYtd = edgarDivYtd != null
            ? Math.abs(edgarDivYtd)
            : (Math.abs(Number(extracted.facts?.brandDivestitures)) || 0);
          const divestituresYtd = rawDivYtd >= 50 ? rawDivYtd : 0;
          const edgarBuybacksYtd = capFromEdgar?.ytd?.buybacks;
          const buybacksYtd_allocated = edgarBuybacksYtd != null
            ? edgarBuybacksYtd
            : (extracted.facts?.shareBuybacks ? -Math.abs(Number(extracted.facts.shareBuybacks)) : 0);

          const edgarAcqYtd = capFromEdgar?.ytd?.acquisitions;
          let acquisitionsYtd_allocated;
          if (edgarAcqYtd != null && edgarAcqYtd !== 0) {
            acquisitionsYtd_allocated = edgarAcqYtd;
          } else if (extracted.facts?.acquisitionsYtd != null) {
            const rawAcqYtd = Math.abs(Number(extracted.facts.acquisitionsYtd)) || 0;
            acquisitionsYtd_allocated = rawAcqYtd >= 50 ? -rawAcqYtd : 0;
          } else if (edgarAcqYtd != null) {
            acquisitionsYtd_allocated = edgarAcqYtd;
          } else {
            acquisitionsYtd_allocated = 0;
          }

          const edgarAssetSalesYtd = capFromEdgar?.ytd?.assetSales;
          const assetSalesYtd_allocated = edgarAssetSalesYtd != null
            ? Math.abs(edgarAssetSalesYtd)
            : (extracted.facts?.assetSalesYtd != null ? (Math.abs(Number(extracted.facts.assetSalesYtd)) || 0) : 0);

          const preferredYtdAllocated = Number(extracted.facts?.preferredIssuanceYtd) || 0;
          const nonControllingYtdAllocated = Number(extracted.facts?.nonControllingSaleYtd) || 0;
          const debtCashYtdAllocated = Number(extracted.facts?.debtCashFlowYtd);
          const assumedDebtYtdAllocated = (debtYtd != null && Number.isFinite(debtCashYtdAllocated) && Math.abs(acquisitionsYtd_allocated) >= 50)
            ? Math.round((debtYtd - debtCashYtdAllocated) * 10) / 10
            : 0;
          const assumedDebt3MAllocated = (Math.abs(acquisitions3M) >= 50 && Math.abs(acquisitionsYtd_allocated) >= 50
            && Math.abs(Math.abs(acquisitions3M) - Math.abs(acquisitionsYtd_allocated)) < 1 && assumedDebtYtdAllocated >= 50)
            ? assumedDebtYtdAllocated
            : 0;
          const restrictedCurrAllocated = extracted.balance?.restrictedCash != null && Number.isFinite(Number(extracted.balance.restrictedCash))
            ? Number(extracted.balance.restrictedCash)
            : (prevQ.currentQuarterData?.restrictedCash ?? prevQ.restrictedCash ?? null);
          const restrictedPrev3MAllocated = extracted.balance?.restrictedCashPreviousQuarter != null && Number.isFinite(Number(extracted.balance.restrictedCashPreviousQuarter))
            ? Number(extracted.balance.restrictedCashPreviousQuarter)
            : (prevQ.currentQuarterData?.previousRestrictedCash ?? prevQ.previousRestrictedCash ?? null);
          const restrictedStartYtdAllocated = extracted.balance?.restrictedCashBeginningOfYear != null && Number.isFinite(Number(extracted.balance.restrictedCashBeginningOfYear))
            ? Number(extracted.balance.restrictedCashBeginningOfYear)
            : (prevQ.fyStartRestrictedCash ?? null);
          const restrictedDiff3MAllocated = (Number.isFinite(restrictedCurrAllocated) && Number.isFinite(restrictedPrev3MAllocated))
            ? restrictedCurrAllocated - restrictedPrev3MAllocated
            : null;
          const restrictedDiffYtdAllocated = (Number.isFinite(restrictedCurrAllocated) && Number.isFinite(restrictedStartYtdAllocated))
            ? restrictedCurrAllocated - restrictedStartYtdAllocated
            : null;

          extracted.capitalAllocationData = {
            threeMonths: {
              libre: libre3M,
              deuda: debt3M,
              caja: caja3M,
              inversionesCortoPlazo: stInv3M,
              divestitures: divestitures3M,
              buybacks: buybacks3M_allocated,
              acquisitions: acquisitions3M,
              assetSales: assetSales3M,
              preferredIssuance: fiscalQuarter === 1 && preferredYtdAllocated >= 50 ? preferredYtdAllocated : 0,
              nonControllingSale: fiscalQuarter === 1 && nonControllingYtdAllocated >= 50 ? nonControllingYtdAllocated : 0,
              assumedDebt: assumedDebt3MAllocated >= 50 ? assumedDebt3MAllocated : 0,
              restrictedCashMovement: (restrictedDiff3MAllocated != null && Math.abs(restrictedDiff3MAllocated) >= 50)
                ? Math.round(-restrictedDiff3MAllocated * 10) / 10
                : 0,
              acquisitionDescription: extracted.facts?.acquisitionDescription ?? null,
              divestitureDescription: extracted.facts?.divestitureDescription ?? null,
              debtDetails: debtDetails3M,
              cashDetails: (prevCash3M != null && currCash3M != null)
                ? buildCashMovementDetails({
                    prev: Number(prevCash3M),
                    curr: Number(currCash3M),
                    caja: caja3M,
                    periodYear: Number(extracted.fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null),
                  })
                : (capFromEdgar?.threeMonths?.cashDetails ?? null),
            },
            ytd: {
              libre: (cfoYtd != null && capexYtd != null && divYtd != null) ? Math.round((cfoYtd - capexYtd - divYtd) * 10) / 10 : null,
              deuda: debtYtd,
              caja: cajaYtd,
              inversionesCortoPlazo: stInvYtd,
              divestitures: divestituresYtd,
              buybacks: buybacksYtd_allocated,
              acquisitions: acquisitionsYtd_allocated,
              assetSales: assetSalesYtd_allocated,
              preferredIssuance: preferredYtdAllocated >= 50 ? preferredYtdAllocated : 0,
              nonControllingSale: nonControllingYtdAllocated >= 50 ? nonControllingYtdAllocated : 0,
              assumedDebt: assumedDebtYtdAllocated >= 50 ? assumedDebtYtdAllocated : 0,
              restrictedCashMovement: (restrictedDiffYtdAllocated != null && Math.abs(restrictedDiffYtdAllocated) >= 50)
                ? Math.round(-restrictedDiffYtdAllocated * 10) / 10
                : 0,
              acquisitionDescription: extracted.facts?.acquisitionDescription ?? null,
              divestitureDescription: extracted.facts?.divestitureDescription ?? null,
              debtDetails: debtDetailsYtd,
              cashDetails: (extracted.balance?.cashBeginningOfYear != null && extracted.balance?.cash != null)
                ? buildCashMovementDetails({
                    prev: Number(extracted.balance.cashBeginningOfYear),
                    curr: Number(extracted.balance.cash),
                    caja: cajaYtd,
                    periodYear: Number(extracted.fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null),
                    statementChange: extracted.facts?.netChangeInCash,
                  })
                : (capFromEdgar?.ytd?.cashDetails ?? null),
            },
          };
        }
      } catch (err) {
        console.warn('[analyst] No se pudo obtener el cash flow del Q anterior:', err.message);
      }
    }

    // Análisis anual (10-K): obtener historial de deuda de 10 años desde EDGAR y calcular Working Capital a 12 meses
    let edgarDebtHistory = null;
    let edgarDebtMaturities = null;
    let edgarSharesHistory = null;
    let edgarRepurchaseHistory = null;
    let edgarRepurchaseShares = null;
    let edgarDividendHistory = null;
    if (isAnnual && (extracted.ticker || input.ticker)) {
      try {
        const edgarResults = await getCompanyResults(extracted.ticker || input.ticker);
        const annualSeries = edgarResults?.annual || [];
        const reportYear = Number(fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null);
        edgarSharesHistory = buildSharesHistoryFromEdgar(annualSeries, reportYear);
        edgarRepurchaseHistory = buildRepurchaseHistoryFromEdgar(annualSeries, reportYear);
        edgarRepurchaseShares = buildRepurchaseSharesHistoryFromEdgar(annualSeries, reportYear);
        edgarDividendHistory = buildDividendHistoryFromEdgar(annualSeries, reportYear);
        if (annualSeries.length >= 2) {
          edgarDebtHistory = annualSeries
            .map((row) => {
              const yr = Number(row.period || (row.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
              const tDebt = Number(row.values?.totalDebt);
              const nDebt = Number(row.values?.netDebt);
              return {
                year: yr,
                totalDebt: Number.isFinite(tDebt) ? (tDebt > 1e6 ? Math.round(tDebt / 1e6) : Math.round(tDebt)) : null,
                netDebt: Number.isFinite(nDebt) ? (nDebt > 1e6 ? Math.round(nDebt / 1e6) : Math.round(nDebt)) : null,
              };
            })
            .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.totalDebt))
            .filter((p) => !Number.isFinite(reportYear) || p.year <= reportYear)
            .sort((a, b) => a.year - b.year)
            .slice(-10);
        }
        if (Array.isArray(edgarResults?.debtMaturities?.years) && edgarResults.debtMaturities.years.length) {
          if (!reportYear || Number(edgarResults.debtMaturities.baseYear) === reportYear) {
            edgarDebtMaturities = edgarResults.debtMaturities;
          }
        }

        // Respaldo de balance y circulante desde XBRL: la extracción del PDF a veces no mapea
        // las tablas del balance y deja inventarios/proveedores/cobros en 0 (WK = 0).
        const toMillionsValue = (value) => {
          const num = Number(value);
          if (!Number.isFinite(num)) return null;
          return Math.abs(num) > 1e6 ? Math.round((num / 1e6) * 10) / 10 : Math.round(num * 10) / 10;
        };
        // El XBRL de la SEC es la fuente oficial del balance: manda sobre la extracción de la
        // IA (que puede redondear o confundir separadores) para caja, deuda e inversiones.
        const { currentAnnualRow, previousAnnualRow } = selectAnnualRows(annualSeries, { reportingPeriod, reportYear });
        extracted.balance = extracted.balance || {};
        extracted.workingCapital = extracted.workingCapital || {};
        const fillBalance = (key, sourceValues, sourceKey, force = false) => {
          const value = toMillionsValue(sourceValues?.[sourceKey]);
          if (value == null) return;
          const current = Number(extracted.balance[key]);
          if (!force && Number.isFinite(current) && current !== 0) return;
          extracted.balance[key] = value;
        };
        fillBalance('inventories', currentAnnualRow?.values, 'inventory', true);
        fillBalance('accountsPayable', currentAnnualRow?.values, 'payables', true);
        fillBalance('accountsReceivable', currentAnnualRow?.values, 'receivables', true);
        fillBalance('cash', currentAnnualRow?.values, 'cash', true);
        fillBalance('shortTermInvestments', currentAnnualRow?.values, 'shortTermInvestments', true);
        fillBalance('totalDebt', currentAnnualRow?.values, 'totalDebt', true);
        fillBalance('cashBeginningOfYear', previousAnnualRow?.values, 'cash', true);
        fillBalance('shortTermInvestmentsBeginningOfYear', previousAnnualRow?.values, 'shortTermInvestments', true);
        fillBalance('totalDebtBeginningOfYear', previousAnnualRow?.values, 'totalDebt', true);
        // El estado de flujos de XBRL es la fuente oficial: manda sobre la extracción de la IA,
        // que tiende a redondear (p. ej. 4500 en vez de 4462 o 800 en vez de 801).
        extracted.cashFlow = extracted.cashFlow || {};
        const xbrlCfo = toMillionsValue(currentAnnualRow?.values?.cfo);
        if (xbrlCfo != null && xbrlCfo !== 0) extracted.cashFlow.operating = xbrlCfo;
        const xbrlCapex = toMillionsValue(currentAnnualRow?.values?.capex);
        if (xbrlCapex != null && xbrlCapex !== 0) extracted.cashFlow.capex = Math.abs(xbrlCapex);
        const xbrlDividendsPaid = toMillionsValue(
          currentAnnualRow?.values?.dividendsCommon
          ?? currentAnnualRow?.values?.dividends
          ?? currentAnnualRow?.values?.dividendsPreferred,
        );
        if (xbrlDividendsPaid != null && xbrlDividendsPaid !== 0) extracted.cashFlow.dividends = Math.abs(xbrlDividendsPaid);
        // Valores negociables: compras y ventas del estado de flujos en XBRL (neto para la
        // fila de Asignación de Capital). Manda sobre lo extraído por la IA.
        extracted.facts = extracted.facts || {};
        const xbrlSecuritiesPurchases = toMillionsValue(currentAnnualRow?.values?.securitiesInvesting);
        if (xbrlSecuritiesPurchases != null) extracted.facts.purchasesOfMarketableSecuritiesYtd = Math.abs(xbrlSecuritiesPurchases);
        const xbrlSecuritiesProceeds = toMillionsValue(currentAnnualRow?.values?.securitiesProceeds);
        if (xbrlSecuritiesProceeds != null) extracted.facts.proceedsFromSaleOfMarketableSecuritiesYtd = Math.abs(xbrlSecuritiesProceeds);
        // Resto del estado de flujos de inversión/financiación: el XBRL del ejercicio analizado
        // manda y EVITA que se cuele la columna comparativa del año anterior (p. ej. una
        // adquisición del ejercicio previo). Si el XBRL dice 0, se fuerza 0.
        const xbrlBuybacksPaid = toMillionsValue(currentAnnualRow?.values?.buybacks);
        if (xbrlBuybacksPaid != null) extracted.facts.shareBuybacks = Math.abs(xbrlBuybacksPaid);
        const xbrlAcquisitionsPaid = toMillionsValue(currentAnnualRow?.values?.acquisitions);
        if (xbrlAcquisitionsPaid != null) extracted.facts.acquisitionsYtd = Math.abs(xbrlAcquisitionsPaid);
        const xbrlDivestituresPaid = toMillionsValue(currentAnnualRow?.values?.divestitures);
        if (xbrlDivestituresPaid != null) extracted.facts.brandDivestitures = Math.abs(xbrlDivestituresPaid);
        const xbrlAssetSalesPaid = toMillionsValue(currentAnnualRow?.values?.salePPE);
        if (xbrlAssetSalesPaid != null) extracted.facts.assetSalesYtd = Math.abs(xbrlAssetSalesPaid);
        // Neto del estado de flujos (incluye efectivo restringido): permite explicar por qué
        // puede no coincidir con la variación de la caja del balance.
        const xbrlNetChangeInCash = toMillionsValue(currentAnnualRow?.values?.netChangeInCash);
        if (xbrlNetChangeInCash != null) extracted.facts.netChangeInCash = xbrlNetChangeInCash;
        const reportedWcChange = Number(extracted.workingCapital.reportedChangeYtd);
        if (!Number.isFinite(reportedWcChange) || reportedWcChange === 0) {
          const wcChange = toMillionsValue(currentAnnualRow?.values?.workingCapitalChange);
          if (wcChange != null) extracted.workingCapital.reportedChangeYtd = wcChange;
        }
        // Cuenta de resultados oficial XBRL: evita filas vacías ("—") o cifras redondeadas
        // cuando la extracción de la IA no devuelve alguna línea del estado de resultados.
        const currValues = currentAnnualRow?.values ?? {};
        const prevValues = previousAnnualRow?.values ?? {};
        const setIfNumber = (target, key, value) => {
          if (target && Number.isFinite(value)) target[key] = value;
        };
        extracted.ytd = extracted.ytd || {};
        setIfNumber(extracted.ytd, 'sales', toMillionsValue(currValues.revenue));
        setIfNumber(extracted.ytd, 'grossProfit', toMillionsValue(currValues.grossProfit));
        setIfNumber(extracted.ytd, 'operatingIncome', toMillionsValue(currValues.operatingIncome));
        setIfNumber(extracted.ytd, 'ebt', toMillionsValue(currValues.ebtIncludingUnusual ?? currValues.pretaxIncome));
        setIfNumber(extracted.ytd, 'netIncome', toMillionsValue(currValues.netIncomeToCommonIncludingUnusual ?? currValues.netIncome));
        extracted.ytd.prev = extracted.ytd.prev || {};
        setIfNumber(extracted.ytd.prev, 'sales', toMillionsValue(prevValues.revenue));
        setIfNumber(extracted.ytd.prev, 'grossProfit', toMillionsValue(prevValues.grossProfit));
        setIfNumber(extracted.ytd.prev, 'operatingIncome', toMillionsValue(prevValues.operatingIncome));
        setIfNumber(extracted.ytd.prev, 'ebt', toMillionsValue(prevValues.ebtIncludingUnusual ?? prevValues.pretaxIncome));
        setIfNumber(extracted.ytd.prev, 'netIncome', toMillionsValue(prevValues.netIncomeToCommonIncludingUnusual ?? prevValues.netIncome));
        // Deterioros exactos (goodwill + intangibles) desde XBRL cuando la IA se queda corta.
        const impairmentsFrom = (values) => {
          const goodwill = Math.abs(toMillionsValue(values?.goodwillImpairment) ?? 0);
          const assets = Math.abs(toMillionsValue(values?.assetImpairment) ?? 0);
          const total = goodwill + assets;
          return total > 0 ? Math.round(total * 10) / 10 : null;
        };
        const xbrlImpairmentsYtd = impairmentsFrom(currValues);
        if (xbrlImpairmentsYtd != null) {
          const aiImpairments = Number(extracted.facts.impairmentsYtd) || 0;
          if (!aiImpairments || xbrlImpairmentsYtd > aiImpairments) extracted.facts.impairmentsYtd = xbrlImpairmentsYtd;
        }
        const xbrlImpairmentsPrevYtd = impairmentsFrom(prevValues);
        if (xbrlImpairmentsPrevYtd != null) {
          const aiImpairmentsPrev = Number(extracted.facts.impairmentsPrevYtd) || 0;
          if (!aiImpairmentsPrev || xbrlImpairmentsPrevYtd > aiImpairmentsPrev) extracted.facts.impairmentsPrevYtd = xbrlImpairmentsPrevYtd;
        }
        const xbrlIntangiblesAmortization = Math.abs(toMillionsValue(currValues.amortizationGoodwillIntangibles) ?? 0);
        if (xbrlIntangiblesAmortization > 0 && !(Number(extracted.facts.intangiblesAmortization) > 0)) {
          extracted.facts.intangiblesAmortization = xbrlIntangiblesAmortization;
        }
        // Recalcular la asignación de capital con el balance XBRL ya corregido.
        extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted);
        // Estimación del tipo medio de la deuda a partir del gasto financiero y la deuda media.
        extracted.annualDetails = extracted.annualDetails || {};
        extracted.annualDetails.debt = extracted.annualDetails.debt || {};
        if (extracted.annualDetails.debt.allDebtAverageRate == null) {
          const estimatedRate = computeEstimatedDebtRateFromIncome(currentAnnualRow, previousAnnualRow);
          if (estimatedRate) {
            extracted.annualDetails.debt.allDebtAverageRate = estimatedRate.rate;
            extracted.annualDetails.debt.allDebtAverageRateEstimated = true;
            extracted.annualDetails.debt.allDebtAverageRateSource = estimatedRate.source;
          }
        }
        // Intereses netos oficiales del ejercicio cerrado (fuente XBRL) para la columna
        // "Año anterior" de la tabla de guidance: manda sobre lo extraído por la IA.
        const officialAnnualInterest = Math.abs(toMillionsValue(currentAnnualRow?.values?.interestExpense) ?? 0);
        if (Number.isFinite(officialAnnualInterest) && officialAnnualInterest > 0) {
          extracted.annualDetails.outlook = extracted.annualDetails.outlook || {};
          extracted.annualDetails.outlook.priorYearNetInterest = Math.round(officialAnnualInterest * 10) / 10;
        }
      } catch (err) {
        console.warn('[analyst] No se pudo obtener el historial de deuda desde EDGAR:', err.message);
      }
    }

    if (isAnnual && edgarDebtHistory && edgarDebtHistory.length) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.debt = extracted.annualDetails.debt || {};
      if (!extracted.annualDetails.debt.debtHistory || !extracted.annualDetails.debt.debtHistory.length) {
        extracted.annualDetails.debt.debtHistory = edgarDebtHistory;
      }
    }

    // Deuda anual: el calendario contractual de XBRL (principal por ejercicio, tal como lo
    // publica la nota del 10-K) manda sobre la extracción de la IA. Si la IA aporta el desglose
    // por emisión y su suma por año coincide con el XBRL, se conserva (aporta los cupones);
    // si no coincide (p. ej. importes brutos con intereses), se usa el importe oficial.
    if (isAnnual && Array.isArray(edgarDebtMaturities?.years) && edgarDebtMaturities.years.length) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.debt = extracted.annualDetails.debt || {};
      const extractionDebt = extracted.annualDetails.debt;
      const validItems = (list) => (Array.isArray(list) ? list : []).filter((item) => {
        const amount = Number(item?.amount ?? item?.totalAmount ?? item?.value);
        return Number.isFinite(Number(item?.year)) && Number.isFinite(amount) && amount > 0;
      });
      const aiItems = validItems(
        (Array.isArray(extractionDebt.maturityItems) && extractionDebt.maturityItems.length)
          ? extractionDebt.maturityItems
          : extractionDebt.maturitySchedule,
      );
      const itemsByYear = new Map();
      aiItems.forEach((item) => {
        const year = Number(item.year);
        if (!itemsByYear.has(year)) itemsByYear.set(year, []);
        itemsByYear.get(year).push(item);
      });
      // Una etiqueta de varios ejercicios ("2027-2028", "2031 y posteriores"...) no sirve como
      // tramo: el importe oficial por año tiene prioridad.
      const isBucketLabel = (item) => /20\d\d\s*[-–/]\s*20\d\d|and thereafter|y posteriores|posteriores a|a partir de|onwards/i.test(String(item?.label ?? item?.name ?? ''));
      const merged = [];
      edgarDebtMaturities.years.forEach((y) => {
        const year = Number(y.year);
        const officialAmount = Number(y.amount);
        if (!Number.isFinite(year) || !Number.isFinite(officialAmount) || officialAmount <= 0) return;
        const aiForYear = itemsByYear.get(year) ?? [];
        const aiSum = aiForYear.reduce((sum, item) => sum + Number(item.amount ?? item.totalAmount ?? item.value), 0);
        const tolerance = Math.max(15, officialAmount * 0.08);
        const hasDetailedAi = aiForYear.length > 0 && !aiForYear.some(isBucketLabel);
        if (hasDetailedAi && Math.abs(aiSum - officialAmount) <= tolerance) {
          merged.push(...aiForYear.map((item) => ({
            ...item,
            amount: Number(item.amount ?? item.totalAmount ?? item.value),
            interestRate: item.interestRate ?? item.rate ?? null,
          })));
        } else {
          merged.push({
            year,
            label: 'Vencimientos contractuales de deuda (Contractual Maturities)',
            amount: officialAmount,
            rate: null,
            type: 'Deuda total',
          });
        }
        itemsByYear.delete(year);
      });
      // Tramos de la IA de años fuera del calendario XBRL (normalmente posteriores al año 5),
      // necesarios para ponderar el tipo medio de toda la deuda.
      itemsByYear.forEach((items) => {
        merged.push(...items.map((item) => ({
          ...item,
          amount: Number(item.amount ?? item.totalAmount ?? item.value),
          interestRate: item.interestRate ?? item.rate ?? null,
        })));
      });
      extractionDebt.maturityItems = merged;
      delete extractionDebt.maturitySchedule;
      if (edgarDebtMaturities.afterYearFive != null) {
        extractionDebt.maturityAfterFive = edgarDebtMaturities.afterYearFive;
      }
    }

    // Tipo medio de toda la deuda calculado por el sistema, para que la IA use exactamente
    // la misma cifra que muestra el banner del gráfico. La tabla de deuda (con rangos de
    // cupón si es el caso) tiene prioridad sobre la estimación por gasto financiero.
    if (isAnnual) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.debt = extracted.annualDetails.debt || {};
      const debtDetails = extracted.annualDetails.debt;
      const computedRate = computeAllDebtAverageRate(debtDetails.secTable);
      if (computedRate != null) {
        debtDetails.allDebtAverageRate = computedRate.rate;
        debtDetails.allDebtAverageRateEstimated = computedRate.estimated;
        debtDetails.allDebtAverageRateSource = computedRate.source;
      }
    }

    // Recompras anuales: completar acciones en circulación y serie de costes con XBRL de la SEC
    if (isAnnual && (edgarSharesHistory || edgarRepurchaseHistory || edgarRepurchaseShares)) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.repurchases = extracted.annualDetails.repurchases || {};
      const extractionRepurchases = extracted.annualDetails.repurchases;

      const mergedSharesHistory = mergeHistoryByYear(extractionRepurchases.sharesHistory, edgarSharesHistory);
      if (mergedSharesHistory.length >= 2) {
        extractionRepurchases.sharesHistory = mergedSharesHistory;
      }

      if (edgarRepurchaseHistory?.length) {
        let mergedRepurchases = mergeHistoryByYear(extractionRepurchases.repurchaseHistory, edgarRepurchaseHistory);
        const sharesSource = [...(edgarRepurchaseShares ?? [])];
        if (Array.isArray(extractionRepurchases.repurchaseHistory)) sharesSource.push(...extractionRepurchases.repurchaseHistory);
        mergedRepurchases = mergeRepurchaseShares(mergedRepurchases, sharesSource);
        extractionRepurchases.repurchaseHistory = mergedRepurchases;
      }
    }

    // Dividendos anuales: completar la serie (dps, importe total y BPA) desde XBRL y calcular la variación
    if (isAnnual && edgarDividendHistory?.length) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.dividends = extracted.annualDetails.dividends || {};
      const extractionDividends = extracted.annualDetails.dividends;
      extractionDividends.history = mergeDividendHistory(extractionDividends.history, edgarDividendHistory);
      const history = extractionDividends.history;
      // BPA ajustado de toda la serie desde el comunicado anual de resultados (8-K) de cada
      // ejercicio: la IA solo ve el 10-K actual, por lo que los años antiguos pueden faltar
      // o estar mal recordados. La cifra oficial del comunicado tiene prioridad.
      const dividendTicker = extracted.ticker || input.ticker;
      if (dividendTicker && history.length) {
        try {
          const underlyingEps = await Promise.all(history.map((point) => getHistoricalUnderlyingEps(dividendTicker, Number(point.year))));
          history.forEach((point, index) => {
            const eps = underlyingEps[index];
            if (Number.isFinite(eps) && eps > 0) point.adjustedEps = eps;
          });
        } catch (err) {
          console.warn('[analyst] No se pudo completar el BPA ajustado histórico:', err.message);
        }
      }
      if (extractionDividends.changePct == null && history.length >= 2) {
        const prev = history[history.length - 2];
        const last = history[history.length - 1];
        if (Number.isFinite(prev?.dps) && prev.dps > 0 && Number.isFinite(last?.dps)) {
          const pct = Math.round(((last.dps - prev.dps) / prev.dps) * 1000) / 10;
          extractionDividends.changePct = pct;
          extractionDividends.changeType = pct > 0 ? 'increase' : (pct < 0 ? 'cut' : 'unchanged');
        }
      }
    }

    if (isAnnual) {
      const bal = extracted.balance ?? {};
      const inv = Number(bal.inventories) || 0;
      const pay = Number(bal.accountsPayable) || 0;
      const rec = Number(bal.accountsReceivable) || 0;
      const wcRepYtd = extracted.workingCapital?.reportedChangeYtd != null
        ? Number(extracted.workingCapital.reportedChangeYtd)
        : (extracted.workingCapital?.reportedChangeQuarter != null ? Number(extracted.workingCapital.reportedChangeQuarter) : 0);
      const inflationRate = Number.isFinite(Number(extracted.workingCapital?.inflationRate))
        ? Number(extracted.workingCapital.inflationRate)
        : 3.0;
      const volumeGrowth = Number.isFinite(Number(extracted.workingCapital?.volumeGrowth))
        ? Number(extracted.workingCapital.volumeGrowth)
        : 0;
      const growth = Number.isFinite(Number(extracted.workingCapital?.inflationAndVolume))
        ? Number(extracted.workingCapital.inflationAndVolume)
        : inflationRate + volumeGrowth;

      const annualWcReq = Math.round(((pay - inv - rec) * (growth / 100)) * 10) / 10;
      const cfoYtd = extracted.cashFlow?.operating != null ? Number(extracted.cashFlow.operating) : null;
      const capexYtd = extracted.cashFlow?.capex != null ? Math.abs(Number(extracted.cashFlow.capex)) : null;
      const divYtd = extracted.cashFlow?.dividends != null ? Math.abs(Number(extracted.cashFlow.dividends)) : null;

      const repYtd = wcRepYtd != null ? wcRepYtd : 0;
      const wcDiffYtd = Math.round((repYtd - annualWcReq) * 10) / 10;
      const cfoAdjYtd = cfoYtd != null ? Math.round((cfoYtd - wcDiffYtd) * 10) / 10 : null;
      const capexAdjYtd = capexYtd;
      const fcfYtd = (cfoYtd != null && capexYtd != null) ? Math.round((cfoYtd - capexYtd) * 10) / 10 : null;
      const fcfAdjYtd = (cfoAdjYtd != null && capexAdjYtd != null) ? Math.round((cfoAdjYtd - capexAdjYtd) * 10) / 10 : null;
      const divAdjYtd = divYtd;
      const libreYtd = (fcfYtd != null && divYtd != null) ? Math.round((fcfYtd - divYtd) * 10) / 10 : null;
      const libreAdjYtd = (fcfAdjYtd != null && divAdjYtd != null) ? Math.round((fcfAdjYtd - divAdjYtd) * 10) / 10 : null;

      const sharesNum = extracted.shares ? Number(extracted.shares) : null;
      const fcfPerShareNormalYtd = (fcfYtd != null && sharesNum) ? `${(fcfYtd / sharesNum).toFixed(2).replace('.', ',')} $` : null;
      const fcfPerShareAdjYtd = (fcfAdjYtd != null && sharesNum) ? `${(fcfAdjYtd / sharesNum).toFixed(2).replace('.', ',')} $` : null;

      extracted.workingCapitalData = {
        inventories: inv,
        accountsPayable: pay,
        accountsReceivable: rec,
        inflationAndVolume: growth,
        inflationRate,
        volumeGrowth,
        annualWcReq,
        quarterWcReq: annualWcReq,
        reportedWc3M: repYtd,
        reportedWcYtd: repYtd,
        wcDiff3M: wcDiffYtd,
        wcDiffYtd,
        ytdScenarios: [
          repYtd != null ? `Normal (WC=${Math.round(repYtd)})` : 'Normal',
          `Ajustado*1 (WC=${Math.round(annualWcReq)})`,
        ],
        ytdValues: {
          cfo: [cfoYtd != null ? String(cfoYtd).replace('.', ',') : null, cfoAdjYtd != null ? String(cfoAdjYtd).replace('.', ',') : null],
          capex: [capexYtd != null ? String(capexYtd).replace('.', ',') : null, capexAdjYtd != null ? String(capexAdjYtd).replace('.', ',') : null],
          fcf: [fcfYtd != null ? String(fcfYtd).replace('.', ',') : null, fcfAdjYtd != null ? String(fcfAdjYtd).replace('.', ',') : null],
          fcfPerShare: [fcfPerShareNormalYtd, fcfPerShareAdjYtd],
          dividends: [divYtd != null ? String(divYtd).replace('.', ',') : null, divAdjYtd != null ? String(divAdjYtd).replace('.', ',') : null],
          libre: [libreYtd != null ? String(libreYtd).replace('.', ',') : null, libreAdjYtd != null ? String(libreAdjYtd).replace('.', ',') : null],
        },
        explanationYtd: `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflationRate}% + ${volumeGrowth}%) = ${formatWcNumber(annualWcReq)}M en todo el año. ${buildWcDeviationSentence({ reported: repYtd, wcReq: annualWcReq, deviation: wcDiffYtd, cfo: cfoYtd, adjusted: cfoAdjYtd })}`,
      };

      if (extracted.capitalAllocationData?.ytd && libreYtd != null) {
        extracted.capitalAllocationData.ytd.libre = libreYtd;
      }
    }

    // Q1 y análisis sin EDGAR previo: construir igualmente el escenario de WC
    // y permitir la normalización fiscal del cash flow con los datos del filing.
    if (!extracted.workingCapitalData) {
      const fallbackWorkingCapital = buildWorkingCapitalDataFallback(extracted);
      if (fallbackWorkingCapital) extracted.workingCapitalData = fallbackWorkingCapital;
    }

    const basePrompt = isAnnual ? ANNUAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const schema = isAnnual ? ANNUAL_OUTPUT_SCHEMA : OUTPUT_SCHEMA;
    const systemPrompt = basePrompt
      .replace('{REGLAS}', rules.trim())
      .replace('{SCHEMA}', schema.trim());

    // Evitar serializar _rawText (el informe completo) en el prompt de la Fase 2:
    // el modelo solo necesita estructurar y redactar a partir del JSON extraído.
    const { _rawText, ...extractedForModel } = extracted;

    let result;
    try {
      result = await chatJson([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(extractedForModel, null, 2) },
      ]);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AgentError('El modelo no devolvió un análisis válido.', 'INVALID_MODEL_RESPONSE');
    }

    if (!result || !Array.isArray(result.horizons) || result.horizons.length === 0) {
      throw new AgentError('El análisis no contiene bloques válidos de datos.', 'INVALID_REPORT_STRUCTURE');
    }

    // Para informes anuales 10-K, garantizar exactamente UN SOLO horizonte: "EN TODO EL AÑO (12 MESES)"
    if (isAnnual) {
      const annualHorizon = result.horizons.find((h) =>
        String(h.label || '').toUpperCase().includes('12') ||
        String(h.label || '').toUpperCase().includes('AÑO')
      ) || result.horizons[result.horizons.length - 1];
      annualHorizon.label = 'EN TODO EL AÑO (12 MESES)';
      result.horizons = [annualHorizon];
    }

    // Normalización defensiva de datos generados
    result.horizons.forEach((horizon) => {
      // 1. Normalización de Ventas: ajustes de deterioros del año anterior y herencia
      if (horizon.sales?.rows) {
        const isTrimestral = String(horizon.label).toUpperCase().includes('ÚLTIMOS') || String(horizon.label).toUpperCase().includes('3 MESES');
        const prevImpairment = isTrimestral
          ? (Number(extracted.facts?.impairmentsPrevQuarter) || 0)
          : (Number(extracted.facts?.impairmentsPrevYtd) || 0);
        const currImpairment = isTrimestral
          ? (Number(extracted.facts?.impairmentsQuarter) || 0)
          : (Number(extracted.facts?.impairmentsYtd) || 0);

        horizon.sales.rows.forEach((row) => {
          const nameLower = String(row.name).toLowerCase();
          const isOperativeOrNet = nameLower.includes('operativo') || nameLower.includes('ebt') || nameLower.includes('neto');

          // Red de seguridad: si el modelo dejó una fila vacía ("—"), se rellena con la cifra
          // oficial de XBRL de la cuenta de resultados que el sistema ya volcó en la extracción.
          const reported = isTrimestral ? (extracted.quarter ?? {}) : (extracted.ytd ?? {});
          const reportedPrev = reported.prev ?? {};
          const reportedKey = (() => {
            if (nameLower.includes('venta') || nameLower.includes('sales') || nameLower.includes('ingreso')) return 'sales';
            if (nameLower.includes('bruto') || nameLower.includes('gross')) return 'grossProfit';
            if (nameLower.includes('operativ') || nameLower.includes('operating')) return 'operatingIncome';
            if (nameLower.includes('ebt') || nameLower.includes('impuesto') || nameLower.includes('before tax')) return 'ebt';
            if (nameLower.includes('neto') || nameLower.includes('net income')) return 'netIncome';
            return null;
          })();
          if (reportedKey) {
            const formatReported = (value) => (Number.isFinite(Number(value)) ? `${formatFinancialValue(Number(value))}M` : null);
            const normalFill = formatReported(reported[reportedKey]);
            const prevFill = formatReported(reportedPrev[reportedKey]);
            if (normalFill && (!row.normal || row.normal === '—')) row.normal = normalFill;
            // El ejercicio anterior del XBRL de la SEC es la fuente oficial: si existe, manda
            // sobre la extracción del modelo, que a veces copia la cifra actual en la columna
            // "Anterior" y produce variaciones falsas de +0,00 %.
            if (prevFill) {
              const officialPrev = parseFinancialValue(prevFill);
              const existingPrev = parseFinancialValue(row.prevNormal);
              const existingPrevAdjusted = parseFinancialValue(row.prevAdjusted);
              const prevAdjustedIsJustCopy = !Number.isFinite(existingPrevAdjusted)
                || (Number.isFinite(existingPrev) && Math.abs(existingPrevAdjusted - existingPrev) < 0.05);
              if (!Number.isFinite(existingPrev) || officialPrev !== existingPrev) {
                row.prevNormal = prevFill;
                if (prevAdjustedIsJustCopy) row.prevAdjusted = prevFill;
              }
            }
          }

          // Ajuste del ejercicio anterior si hubo impairment (>= 50M)
          if (isOperativeOrNet && prevImpairment >= 50 && row.prevNormal && row.prevNormal !== '—') {
            const prevNormVal = parseFinancialValue(row.prevNormal);
            const prevAdjVal = parseFinancialValue(row.prevAdjusted ?? '');

            if (!Number.isFinite(prevAdjVal) || Math.abs(prevAdjVal - prevNormVal) < 20 || (prevAdjVal <= 0 && prevNormVal <= 0)) {
              let calculatedPrevAdj;
              if (nameLower.includes('neto')) {
                // Impuestos normalizados sobre el EBT AJUSTADO: Neto = EBT ajustado x 0,77 (23%)
                const prevEbtRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('ebt'));
                const prevEbtNorm = prevEbtRow ? parseFinancialValue(prevEbtRow.prevNormal) : NaN;
                calculatedPrevAdj = Number.isFinite(prevEbtNorm)
                  ? Math.round((prevEbtNorm + prevImpairment) * 0.77)
                  : Math.round(prevNormVal + prevImpairment * 0.77);
              } else {
                calculatedPrevAdj = Math.round(prevNormVal + prevImpairment);
              }
              row.prevAdjusted = `${calculatedPrevAdj}M`;
              if (nameLower.includes('operativo')) {
                row.isAdjusted = true;
                if (!row.adjustedNote) row.adjustedNote = '*1';
              } else {
                row.isAdjusted = false;
                row.adjustedNote = undefined;
              }
            }
          }

          // Ajuste de este año si hubo impairment (>= 30M)
          if (isOperativeOrNet && currImpairment >= 30 && row.normal && row.normal !== '—') {
            const normVal = parseFinancialValue(row.normal);
            const adjVal = parseFinancialValue(row.adjusted ?? '');
            if (!Number.isFinite(adjVal) || Math.abs(adjVal - normVal) < 20) {
              let calculatedAdj;
              if (nameLower.includes('neto')) {
                // Impuestos normalizados sobre el EBT AJUSTADO: Neto = EBT ajustado x 0,77 (23%)
                const ebtRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('ebt'));
                const ebtNorm = ebtRow ? parseFinancialValue(ebtRow.normal) : NaN;
                calculatedAdj = Number.isFinite(ebtNorm)
                  ? Math.round((ebtNorm + currImpairment) * 0.77)
                  : Math.round(normVal + currImpairment * 0.77);
              } else {
                calculatedAdj = Math.round(normVal + currImpairment);
              }
              row.adjusted = `${calculatedAdj}M`;
              if (nameLower.includes('operativo')) {
                row.isAdjusted = true;
                if (!row.adjustedNote) row.adjustedNote = '*1';
              } else {
                row.isAdjusted = false;
                row.adjustedNote = undefined;
              }
            }
          }

          // Herencia en prevAdjusted si no hay ajuste
          if ((!row.prevAdjusted || row.prevAdjusted === '—') && row.prevNormal && row.prevNormal !== '—') {
            row.prevAdjusted = row.prevNormal;
          }

          // Herencia en adjusted si no hay ningún ajuste documentado: la columna Ajustado
          // coincide con la reportada (p. ej. Beneficio Bruto o EBT sin partidas extraordinarias).
          if ((!row.adjusted || row.adjusted === '—') && row.normal && row.normal !== '—') {
            row.adjusted = row.normal;
          }

          const parseVal = (val) => {
            if (val == null || val === '—') return null;
            const clean = String(val).replace('M', '').replace('$', '').replace('%', '').trim();
            const normalized = clean.replace(',', '.').replace(/[^\d.-]/g, '');
            const num = parseFloat(normalized);
            return Number.isFinite(num) ? num : null;
          };

          // Recalcular % Ajustado y % Normal siempre
          const a = parseVal(row.adjusted);
          const b = parseVal(row.prevAdjusted);
          if (a !== null && b !== null && b !== 0) {
            const pct = ((a - b) / Math.abs(b)) * 100;
            row.pctAdjusted = `${pct >= 0 ? '+' : ''}${pct.toFixed(2).replace('.', ',')} %`;
          }

          const an = parseVal(row.normal);
          const bn = parseVal(row.prevNormal);
          if (an !== null && bn !== null && bn !== 0) {
            if (bn > 0) {
              const pctN = ((an - bn) / Math.abs(bn)) * 100;
              row.pctNormal = `${pctN >= 0 ? '+' : ''}${pctN.toFixed(2).replace('.', ',')} %`;
            } else {
              row.pctNormal = '—';
            }
          }

          // Principio de casilla de origen:
          // Los ajustes de intangibles/impairments corresponden única y exclusivamente a Beneficio Operativo.
          // EBT y Beneficio Neto calculan sus cifras derivadas pero no se resaltan como ajustados.
          if (nameLower.includes('ebt')) {
            row.isAdjusted = false;
            row.adjustedNote = undefined;
          } else if (nameLower.includes('neto')) {
            const hasTaxNote = Boolean(row.adjustedNote && horizon.sales?.notes?.some((n) => {
              const str = String(n).toLowerCase();
              return str.startsWith(String(row.adjustedNote).toLowerCase()) &&
                (str.includes('impuesto') || str.includes('fiscal') || str.includes('23%') || str.includes('tasa') || str.includes('crédito'));
            }));
            if (!hasTaxNote) {
              row.isAdjusted = false;
              row.adjustedNote = undefined;
            }
          }

          if (row.isAdjusted && !row.adjustedNote) {
            row.adjustedNote = '*1';
          }
        });

        // Asegurar notas de deterioros en sales.notes
        horizon.sales.notes = Array.isArray(horizon.sales.notes) ? [...horizon.sales.notes] : [];
        if (prevImpairment >= 50 && !horizon.sales.notes.some((n) => (n.includes('impairment') || n.includes('deterioro')) && (n.includes('anterior') || n.includes('previo')))) {
          horizon.sales.notes.push(`*1: El año anterior tuvieron un impairment de ${Math.round(prevImpairment)}M.`);
        }
        if (currImpairment >= 50 && !horizon.sales.notes.some((n) => n.includes('depreciación') || n.includes('impairment') || n.includes('deterioro') || n.includes('intangible'))) {
          const nextNoteIdx = horizon.sales.notes.length + 1;
          horizon.sales.notes.push(`*${nextNoteIdx}: Ha habido una depreciación de intangibles de ${Math.round(currImpairment)}M.`);
        }

        // Deduplicar notas fiscales en Ventas: si existen varias (*2 y *3), conservar solo la más completa
        const isTaxNoteText = (n) => {
          const s = String(n).toLowerCase();
          return s.includes('impuesto') || s.includes('fiscal') || s.includes('beneficio fiscal') || s.includes('gasto fiscal') || s.includes('23%') || s.includes('23 %') || s.includes('tasa') || s.includes('crédito');
        };

        const taxIndices = [];
        horizon.sales.notes.forEach((n, idx) => {
          if (isTaxNoteText(n)) taxIndices.push(idx);
        });
        if (taxIndices.length > 1) {
          const bestIdx = taxIndices.reduce((best, curr) => {
            return horizon.sales.notes[curr].length > horizon.sales.notes[best].length ? curr : best;
          }, taxIndices[0]);
          horizon.sales.notes = horizon.sales.notes.filter((_, idx) => !taxIndices.includes(idx) || idx === bestIdx);
        }

        // Normalización fiscal por desviación relativa: se aplica si el impuesto reportado
        // se desvía más de +/-20% del 23% calculado sobre el EBT ajustado.
        const ebtTaxRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('ebt'));
        const netTaxRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('neto'));
        const ebtTaxAdjusted = parseFinancialValue(ebtTaxRow?.adjusted);
        const ebtTaxReported = parseFinancialValue(ebtTaxRow?.normal);
        const netTaxReported = parseFinancialValue(netTaxRow?.normal);
        const reportedTaxAmount = Number.isFinite(ebtTaxReported) && Number.isFinite(netTaxReported)
          ? ebtTaxReported - netTaxReported
          : NaN;
        const normalizedTaxAmount = Number.isFinite(ebtTaxAdjusted) ? ebtTaxAdjusted * 0.23 : NaN;
        const taxDeviation = Number.isFinite(normalizedTaxAmount) && normalizedTaxAmount !== 0 && Number.isFinite(reportedTaxAmount)
          ? (reportedTaxAmount - normalizedTaxAmount) / Math.abs(normalizedTaxAmount)
          : NaN;
        const shouldNormalizeReportedTax = Number.isFinite(taxDeviation) && Math.abs(taxDeviation) > 0.20;

        if (shouldNormalizeReportedTax || horizon.sales.notes.some(isTaxNoteText)) {
          const netoRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('neto'));
          const ebtRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('ebt'));
          let ebtAdj = ebtRow ? parseFinancialValue(ebtRow.adjusted) : NaN;
          if (!Number.isFinite(ebtAdj) && ebtRow) {
            const ebtNorm = parseFinancialValue(ebtRow.normal);
            if (Number.isFinite(ebtNorm)) ebtAdj = ebtNorm + currImpairment;
          }
          if (netoRow && Number.isFinite(ebtAdj)) {
            const ebtAdjR = Math.round(ebtAdj);
            const tax = Math.round(ebtAdjR * 0.23);
            const taxNoteIdxExisting = horizon.sales.notes.findIndex(isTaxNoteText);
            const taxNoteIdx = taxNoteIdxExisting >= 0 ? taxNoteIdxExisting + 1 : horizon.sales.notes.length + 1;

            if (taxNoteIdxExisting >= 0) {
              const existingNote = horizon.sales.notes[taxNoteIdxExisting];
              horizon.sales.notes[taxNoteIdxExisting] = `*${taxNoteIdx}: ${existingNote.replace(/^\*\d+:?\s*/, '')}`;
            } else {
              const deviationText = Number.isFinite(taxDeviation) ? `${taxDeviation >= 0 ? '+' : ''}${(taxDeviation * 100).toFixed(1).replace('.', ',')} %` : '';
              const taxNote = `*${taxNoteIdx}: Impuestos normalizados: 23 % sobre el EBT ajustado de ${ebtAdjR}M = ${tax}M de impuestos${Number.isFinite(reportedTaxAmount) ? `; impuesto reportado ${Math.round(reportedTaxAmount)}M (desviación ${deviationText})` : ''}.`;
              horizon.sales.notes.push(taxNote);
            }
            netoRow.isAdjusted = true;
            netoRow.adjustedNote = `*${taxNoteIdx}`;
            netoRow.adjusted = `${Math.round(ebtAdjR - tax)}M`;
          }
        }

        // Recalcular la variación después de cualquier normalización fiscal defensiva.
        horizon.sales.rows.forEach((row) => {
          const current = parseFinancialValue(row.adjusted);
          const previous = parseFinancialValue(row.prevAdjusted);
          if (Number.isFinite(current) && Number.isFinite(previous) && previous !== 0) {
            const pct = ((current - previous) / Math.abs(previous)) * 100;
            row.pctAdjusted = `${pct >= 0 ? '+' : ''}${pct.toFixed(2).replace('.', ',')} %`;
          }
        });
      }

      // 2. Normalización de Cash Flow: garantizar siempre 2 escenarios con valores distintos y sin '...'
      if (!horizon.cashFlow) {
        horizon.cashFlow = { scenarios: ['Normal', 'Ajustado'], rows: [], notes: [] };
      }
      if (!Array.isArray(horizon.cashFlow.rows) || horizon.cashFlow.rows.length === 0) {
        horizon.cashFlow.rows = [
          { name: 'Cash Flow', values: [] },
          { name: 'CAPEX', values: [] },
          { name: 'FCF', values: [] },
          { name: 'FCF/Acción', values: [] },
          { name: 'Dividendo', values: [] },
          { name: 'Libre', values: [] },
        ];
      }

      if (horizon.cashFlow?.rows) {
        const isTrimestral = String(horizon.label).toUpperCase().includes('ÚLTIMOS') || String(horizon.label).toUpperCase().includes('3 MESES');
        const wcInfo = extracted.workingCapitalData;
        const targetScenarios = isTrimestral ? wcInfo?.quarterScenarios : wcInfo?.ytdScenarios;
        const targetVals = isTrimestral ? wcInfo?.quarterValues : wcInfo?.ytdValues;
        const taxNormalization = getTaxNormalizationData({ extracted, horizon, isTrimestral });

        // Normaliza también los desfases temporales entre gasto fiscal y efectivo pagado.
        // Un ajuste negativo en el cash flow fiscal implica que se pagó más de lo devengado.
        if (taxNormalization && targetVals?.cfo?.[1] != null) {
          const adjustedCfo = parseFinancialValue(targetVals.cfo[1]);
          if (Number.isFinite(adjustedCfo)) {
            targetVals.cfo[1] = formatFinancialValue(adjustedCfo + taxNormalization.adjustment);
            const adjustedCapex = parseFinancialValue(targetVals.capex?.[1]);
            const adjustedFcf = Number.isFinite(adjustedCapex)
              ? adjustedCfo + taxNormalization.adjustment - adjustedCapex
              : NaN;
            if (Number.isFinite(adjustedFcf)) {
              targetVals.fcf[1] = formatFinancialValue(adjustedFcf);
              const shares = Number(extracted.shares);
              if (Number.isFinite(shares) && shares !== 0) {
                targetVals.fcfPerShare[1] = `${(adjustedFcf / shares).toFixed(2).replace('.', ',')} $`;
              }
              const adjustedDividends = parseFinancialValue(targetVals.dividends?.[1]);
              // Sin dividendo reportado (—) la empresa no reparte dividendo: Libre = FCF.
              targetVals.libre[1] = formatFinancialValue(adjustedFcf - (Number.isFinite(adjustedDividends) ? adjustedDividends : 0));
            }
          }
        }
        const taxCashFlowRow = horizon.cashFlow.rows.find((row) => {
          const name = String(row.name).toLowerCase();
          return name.includes('cash flow') || name.includes('flujo de caja');
        });
        if (taxCashFlowRow) {
          if (taxNormalization) taxCashFlowRow.cashFlowAdjustedNote = '*2';
          else delete taxCashFlowRow.cashFlowAdjustedNote;
        }

        let scenarios = Array.isArray(horizon.cashFlow.scenarios) ? [...horizon.cashFlow.scenarios] : [];
        if (targetScenarios && targetScenarios.length === 2) {
          scenarios = targetScenarios;
        } else {
          if (scenarios.length === 0) {
            scenarios = ['Normal', 'Ajustado'];
          } else if (scenarios.length === 1) {
            scenarios = [scenarios[0], 'Ajustado'];
          }
          scenarios = scenarios.map((s, idx) => {
            if (s.includes('...')) {
              return idx === 0 ? 'Normal' : 'Ajustado';
            }
            return s;
          });
        }
        horizon.cashFlow.scenarios = scenarios;

        horizon.cashFlow.rows.forEach((row) => {
          let vals = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
          const nameLower = String(row.name).toLowerCase();

          if (targetVals) {
            let key = null;
            if (nameLower.includes('cash flow') || nameLower.includes('flujo de caja')) key = 'cfo';
            else if (nameLower.includes('capex')) key = 'capex';
            else if (nameLower.includes('fcf/acción') || nameLower.includes('fcf / acción') || nameLower.includes('fcf/accion')) key = 'fcfPerShare';
            else if (nameLower.includes('fcf')) key = 'fcf';
            else if (nameLower.includes('dividendo')) key = 'dividends';
            else if (nameLower.includes('libre')) key = 'libre';

            if (key && targetVals[key]) {
              const [val0, val1] = targetVals[key];
              if (val0 != null && val1 != null) {
                // The computed values include both WC and tax normalization; never trust stale model values.
                vals = [val0, val1];
              }
            }
          }

          if (vals.length === 1 && scenarios.length === 2) {
            vals.push(vals[0]);
          }
          if (vals.length === 0) {
            vals = ['—', '—'];
          }
          row.values = vals.map(normalizeNumericCell);
        });

        // Cuadre aritmético obligatorio de las filas derivadas: FCF = Cash Flow - CAPEX
        // y Libre = FCF - Dividendo, en cada escenario.
        const cashFlowRowByName = (needle) => horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase().includes(needle));
        const cfoRow = cashFlowRowByName('cash flow') || cashFlowRowByName('flujo de caja');
        const capexRow = cashFlowRowByName('capex');
        const fcfRow = horizon.cashFlow.rows.find((r) => {
          const n = String(r.name).trim().toLowerCase();
          return n === 'fcf' || n.startsWith('fcf ') || n.startsWith('free cash flow');
        });
        const dividendRow = cashFlowRowByName('dividendo');
        const libreRow = cashFlowRowByName('libre');
        const readScenarioValue = (row, idx) => parseLooseReportNumber(Array.isArray(row?.values) ? row.values[idx] : row?.value);
        const writeScenarioValue = (row, idx, value) => {
          if (!row || !Number.isFinite(value)) return;
          const values = Array.isArray(row.values) ? [...row.values] : [row.value];
          values[idx] = formatCellNumber(value);
          row.values = values.map(normalizeNumericCell);
        };
        // Fallback: si no había targetVals.cfo, aplicar el ajuste de taxNormalization directamente a cfoRow
        if (taxNormalization && targetVals?.cfo?.[1] == null) {
          const cfoR = cashFlowRowByName('cash flow') || cashFlowRowByName('flujo de caja');
          const currentAdjCfo = parseFinancialValue(cfoR?.values?.[1]);
          if (Number.isFinite(currentAdjCfo)) {
            writeScenarioValue(cfoR, 1, currentAdjCfo + taxNormalization.adjustment);
          }
        }

        const scenarioSlots = scenarios.length >= 2 ? 2 : 1;
        for (let i = 0; i < scenarioSlots; i += 1) {
          const cfoValue = readScenarioValue(cfoRow, i);
          const capexValue = readScenarioValue(capexRow, i);
          if (Number.isFinite(cfoValue) && Number.isFinite(capexValue)) {
            writeScenarioValue(fcfRow, i, cfoValue - capexValue);
          }
        }
        const fcfPerShareRow = cashFlowRowByName('fcf/acción') || cashFlowRowByName('fcf / acción') || cashFlowRowByName('fcf/accion');
        const sharesCount = Number(extracted.shares) || parseFinancialValue(horizon.sales?.shares);
        if (fcfPerShareRow && fcfRow && Number.isFinite(sharesCount) && sharesCount > 0) {
          for (let i = 0; i < scenarioSlots; i += 1) {
            const fcfVal = readScenarioValue(fcfRow, i);
            if (Number.isFinite(fcfVal)) {
              writeScenarioValue(fcfPerShareRow, i, `${(fcfVal / sharesCount).toFixed(2).replace('.', ',')} $`);
            }
          }
        }
        for (let i = 0; i < scenarioSlots; i += 1) {
          const fcfValue = readScenarioValue(fcfRow, i);
          const dividendRaw = Array.isArray(dividendRow?.values) ? dividendRow.values[i] : dividendRow?.value;
          const dividendValue = readScenarioValue(dividendRow, i);
          if (!Number.isFinite(fcfValue)) continue;
          if (Number.isFinite(dividendValue)) {
            writeScenarioValue(libreRow, i, fcfValue - dividendValue);
          } else if (String(dividendRaw ?? '').trim() === '—') {
            // Sin dividendo reportado (—): Libre = FCF (no se resta nada).
            writeScenarioValue(libreRow, i, fcfValue);
          }
        }

        // 2.3 Numeración independiente por bloque: Cash Flow siempre reinicia notas en *1
        const wcNoteTag = '*1';

        // Filtrar notas de deducción trimestral (la resta entre acumulados no es un ajuste contable)
        horizon.cashFlow.notes = (Array.isArray(horizon.cashFlow.notes) ? [...horizon.cashFlow.notes] : [])
          .filter((n) => !String(n).toLowerCase().includes('deducido del acumulado') && !String(n).toLowerCase().includes('flujo trimestral deducido'))
          // Nunca se publican notas que reconozcan cifras estimadas o redondeadas de CAPEX:
          // el sistema inyecta las cifras exactas del estado de flujos (SEC XBRL).
          .filter((n) => {
            const note = String(n).toLowerCase();
            const admitsEstimation = /estima|no viene desglos|no aparece desglos|no se desglosa/;
            return !(note.includes('capex') && admitsEstimation.test(note));
          });

        let expNote = isTrimestral ? wcInfo?.explanation3M : wcInfo?.explanationYtd;
        if (expNote) {
          expNote = `*1: ${expNote.replace(/^\*\d+:?\s*/, '')}`;
        }

        const wcNoteIdx = horizon.cashFlow.notes.findIndex((n) => n.includes('WK') || n.includes('circulante') || n.includes('Cuentas por pagar'));
        if (expNote) {
          // La nota del WK la genera el sistema: evita que el modelo añada operaciones con
          // el signo cambiado (p. ej. "ajuste de -159M ... 1784,4M + 159,1M").
          if (wcNoteIdx !== -1) horizon.cashFlow.notes[wcNoteIdx] = expNote;
          else horizon.cashFlow.notes.push(expNote);
        } else if (wcNoteIdx !== -1) {
          const existingNote = horizon.cashFlow.notes[wcNoteIdx].replace(/^\*\d+:?\s*/, '');
          const wcLines = existingNote.split('\n').filter((line) => !/^impuestos:/i.test(line.trim()));
          horizon.cashFlow.notes[wcNoteIdx] = `*1: ${wcLines.join('\n')}`;
        }

        if (taxNormalization) {
          const taxNote = `*2: ${taxNormalization.explanation.replace(/^\*\d+:?\s*/, '')}`;
          const taxNoteIdx = horizon.cashFlow.notes.findIndex((n) => /^impuestos:/i.test(String(n).replace(/^\*\d+:?\s*/, '').trim()) || String(n).toLowerCase().includes('impuestos'));
          if (taxNoteIdx !== -1) {
            horizon.cashFlow.notes[taxNoteIdx] = taxNote;
          } else {
            horizon.cashFlow.notes.push(taxNote);
          }
        }

        // Sincronizar número de nota en cabecera Ajustado (*1)
        if (scenarios.length >= 2) {
          if (/\*\d+/.test(scenarios[1])) {
            scenarios[1] = scenarios[1].replace(/\*\d+/, '*1');
          } else {
            scenarios[1] = scenarios[1].replace(/Ajustado(?!\*)/, 'Ajustado*1');
          }
        }
        horizon.cashFlow.scenarios = scenarios;
      }

      // 3. Normalización de Asignación de Capital: balance general, venta de marcas y signos estrictos
      let emptyCapital = false;
      if (horizon.capital?.rows) {
        const isTrimestral = String(horizon.label).toUpperCase().includes('ÚLTIMOS') || String(horizon.label).toUpperCase().includes('3 MESES');
        const capData = isTrimestral ? extracted.capitalAllocationData?.threeMonths : extracted.capitalAllocationData?.ytd;

        // 3.0 Deduplicar filas de capital si vinieran partidas repetidas del modelo
        const seenConcepts = new Set();
        horizon.capital.rows = (Array.isArray(horizon.capital.rows) ? horizon.capital.rows : []).filter((r) => {
          const raw = String(r.name ?? '').replace(/\*\d+/g, '').trim().toLowerCase();
          let concept = raw;
          if (concept.includes('libre')) concept = 'libre';
          else if (concept.includes('adquisic') || concept.includes('acquisic')) concept = 'adquisiciones';
          else if (concept.includes('marca') || concept.includes('desinvers') || concept.includes('negocio')) concept = 'marcas';
          else if (concept.includes('corto plazo') || concept.includes('inversiones')) concept = 'inversiones';
          else if (concept.includes('recompra')) concept = 'recompras';
          else if (concept.includes('preferent')) concept = 'preferentes';
          else if (concept.includes('participacion')) concept = 'participaciones';
          else if (concept.includes('asumida')) concept = 'deuda-asumida';
          else if (concept.includes('restringid')) concept = 'efectivo-restringido';
          else if (concept === 'caja' || concept.includes('caja')) concept = 'caja';
          else if (concept.includes('deuda')) concept = 'deuda';
          else if (concept.includes('total')) concept = 'total';

          if (seenConcepts.has(concept)) return false;
          seenConcepts.add(concept);
          return true;
        });

        // 3.1 Vincular Libre con Cash Flow
        const cfLibreRow = horizon.cashFlow?.rows?.find((r) => String(r.name).toLowerCase().includes('libre'));
        let libreVal = cfLibreRow
          ? (Array.isArray(cfLibreRow.values) && cfLibreRow.values.length ? cfLibreRow.values[0] : cfLibreRow.value)
          : (capData?.libre != null ? formatCellNumber(capData.libre) : null);

        let capLibreRow = horizon.capital.rows.find((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase() === 'libre');
        if (!capLibreRow) {
          capLibreRow = { name: 'Libre', value: libreVal ? String(libreVal) : '0' };
          horizon.capital.rows.unshift(capLibreRow);
        } else if (libreVal) {
          capLibreRow.value = String(libreVal);
        }

        // 3.2 Inversiones a corto plazo: si != 0 incluir/asegurar fila con signo estricto; si es 0, omitir
        const stVal = capData?.inversionesCortoPlazo ?? 0;
        const stRowIdx = horizon.capital.rows.findIndex((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('corto plazo') || n.includes('inversiones') || n.includes('marketable');
        });
        if (stVal !== 0) {
          const formattedSt = formatCellNumber(stVal);
          if (stRowIdx !== -1) {
            horizon.capital.rows[stRowIdx].name = 'Inversiones a corto plazo';
            horizon.capital.rows[stRowIdx].value = formattedSt;
          } else {
            const insIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase() === 'libre');
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx + 1 : 1, 0, { name: 'Inversiones a corto plazo', value: formattedSt });
          }
        } else if (stRowIdx !== -1) {
          horizon.capital.rows.splice(stRowIdx, 1);
        }

        // 3.3 Desinversiones (venta de marcas, negocios o activos): solo si es material (>= 50M)
        const divVal = (capData?.divestitures ?? 0) + (capData?.assetSales ?? 0);
        const brandRowIdx = horizon.capital.rows.findIndex((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('marca') || n.includes('negocio') || n.includes('desinvers') || n.includes('divest');
        });
        if (divVal >= 50) {
          const formattedDiv = formatCellNumber(divVal);
          if (brandRowIdx !== -1) {
            horizon.capital.rows[brandRowIdx].value = formattedDiv;
          } else {
            const insIdx = horizon.capital.rows.findIndex((r) => {
              const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
              return n.includes('inversiones a corto plazo') || n === 'libre';
            });
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx + 1 : 1, 0, { name: 'Desinversiones', value: formattedDiv });
          }
        } else if (brandRowIdx !== -1) {
          horizon.capital.rows.splice(brandRowIdx, 1);
        }

        // 3.3b Adquisiciones (compra de negocios): obligatoria si es material (>= 50M)
        const acqVal = capData?.acquisitions ?? 0;
        const acqRowIdx = horizon.capital.rows.findIndex((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('adquisic') || n.includes('acquisic');
        });
        if (Math.abs(acqVal) >= 50) {
          const formattedAcq = formatCellNumber(-Math.abs(acqVal));
          if (acqRowIdx !== -1) {
            horizon.capital.rows[acqRowIdx].name = 'Adquisiciones';
            horizon.capital.rows[acqRowIdx].value = formattedAcq;
          } else {
            const desinvIdx = horizon.capital.rows.findIndex((r) => {
              const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
              return n.includes('marca') || n.includes('negocio') || n.includes('desinvers') || n.includes('divest');
            });
            const insIdx = horizon.capital.rows.findIndex((r) => {
              const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
              return n.includes('inversiones a corto plazo') || n === 'libre';
            });
            const insertAt = desinvIdx !== -1 ? desinvIdx + 1 : (insIdx !== -1 ? insIdx + 1 : 1);
            horizon.capital.rows.splice(insertAt, 0, { name: 'Adquisiciones', value: formattedAcq });
          }
        } else if (acqRowIdx !== -1) {
          horizon.capital.rows.splice(acqRowIdx, 1);
        }

        // 3.4 Recompras: solo si son materiales (>= 50M) se incluye la fila; las recompras
        // insignificantes se omiten para no ensuciar la asignación de capital.
        const buyVal = capData?.buybacks ?? 0;
        const buyRowIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('recompra'));
        if (Math.abs(buyVal) >= 50) {
          const formattedBuy = formatCellNumber(-Math.abs(buyVal));
          if (buyRowIdx !== -1) {
            horizon.capital.rows[buyRowIdx].value = formattedBuy;
          } else {
            const insIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('total'));
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx : horizon.capital.rows.length, 0, { name: 'Recompras', value: formattedBuy });
          }
        } else if (buyRowIdx !== -1) {
          horizon.capital.rows.splice(buyRowIdx, 1);
        }

        // 3.4b Financiación de capital: emisión de preferentes y venta de participaciones
        // no controladoras. Son fuentes de caja (+) que no son deuda ni desinversión.
        const equityRowSpecs = [
          { re: /preferent/i, name: 'Emisión de preferentes', value: Number(capData?.preferredIssuance ?? 0) },
          { re: /participacion/i, name: 'Venta de participaciones', value: Number(capData?.nonControllingSale ?? 0) },
        ];
        equityRowSpecs.forEach((spec) => {
          const rowIdx = horizon.capital.rows.findIndex((r) => spec.re.test(String(r.name).replace(/\*\d+/g, '').trim()));
          if (Math.abs(spec.value) >= 50) {
            const formattedEquity = formatCellNumber(Math.abs(spec.value));
            if (rowIdx !== -1) {
              horizon.capital.rows[rowIdx].name = spec.name;
              horizon.capital.rows[rowIdx].value = formattedEquity;
            } else {
              const anchor = horizon.capital.rows.findIndex((r) => {
                const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
                return n === 'caja' || n.includes('caja') || n.includes('deuda') || n.includes('total');
              });
              horizon.capital.rows.splice(anchor !== -1 ? anchor : horizon.capital.rows.length, 0, { name: spec.name, value: formattedEquity });
            }
          } else if (rowIdx !== -1) {
            horizon.capital.rows.splice(rowIdx, 1);
          }
        });

        // 3.5 Caja: asegurar signo según la regla del balance del usuario:
        // si la caja aumentó, signo negativo (-); si disminuyó, signo positivo (+)
        const cajaRow = horizon.capital.rows.find((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n === 'caja' || n.includes('caja');
        });
        if (capData?.caja != null) {
          const formattedCaja = formatCellNumber(capData.caja);
          if (cajaRow) {
            cajaRow.name = 'Caja';
            cajaRow.value = formattedCaja;
          } else {
            const insIdx = horizon.capital.rows.findIndex((r) => {
              const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
              return n.includes('deuda') || n.includes('total');
            });
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx : horizon.capital.rows.length, 0, { name: 'Caja', value: formattedCaja });
          }
        }

        // 3.5b Efectivo restringido/escrow: mismo signo que Caja (si baja, libera caja: +).
        const restrictedVal = Number(capData?.restrictedCashMovement ?? 0);
        const restrictedRowIdx = horizon.capital.rows.findIndex((r) => /restringid/i.test(String(r.name).replace(/\*\d+/g, '').trim()));
        if (Math.abs(restrictedVal) >= 50) {
          const formattedRestricted = formatCellNumber(restrictedVal);
          if (restrictedRowIdx !== -1) {
            horizon.capital.rows[restrictedRowIdx].name = 'Efectivo restringido';
            horizon.capital.rows[restrictedRowIdx].value = formattedRestricted;
          } else {
            const insIdx = horizon.capital.rows.findIndex((r) => {
              const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
              return n.includes('deuda') || n.includes('total');
            });
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx : horizon.capital.rows.length, 0, { name: 'Efectivo restringido', value: formattedRestricted });
          }
        } else if (restrictedRowIdx !== -1) {
          horizon.capital.rows.splice(restrictedRowIdx, 1);
        }

        // 3.6 Deuda: asegurar signo según la regla del balance del usuario:
        // si la deuda aumentó, signo positivo (+); si disminuyó, signo negativo (-)
        const deudaRow = horizon.capital.rows.find((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('deuda');
        });
        if (capData?.deuda != null) {
          const formattedDeuda = formatCellNumber(capData.deuda);
          if (!deudaRow) {
            const insIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('total'));
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx : horizon.capital.rows.length, 0, { name: 'Deuda', value: formattedDeuda });
          } else {
            deudaRow.name = 'Deuda';
            const existingVal = parseLooseReportNumber(deudaRow.value);
            const isAcceptable = isTrimestral
              ? (Number.isFinite(existingVal) && Math.abs(existingVal - capData.deuda) <= 150)
              : (Number.isFinite(existingVal) && Math.sign(existingVal) === Math.sign(capData.deuda) && Math.abs(existingVal) < 2000);
            deudaRow.value = isAcceptable ? formatCellNumber(existingVal) : formattedDeuda;
          }
        }

        // 3.6b Deuda asumida (no-cash): parte del aumento de deuda del balance procedente de
        // una adquisición que no supone entrada de caja; se resta para que el cuadre cierre.
        const assumedDebtValue = Number(capData?.assumedDebt ?? 0);
        const assumedRowIdx = horizon.capital.rows.findIndex((r) => /asumida/i.test(String(r.name).replace(/\*\d+/g, '').trim()));
        if (assumedDebtValue >= 50) {
          const formattedAssumed = formatCellNumber(-assumedDebtValue);
          if (assumedRowIdx !== -1) {
            horizon.capital.rows[assumedRowIdx].name = 'Deuda asumida (no-cash)';
            horizon.capital.rows[assumedRowIdx].value = formattedAssumed;
          } else {
            const deudaIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('deuda'));
            const totalIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('total'));
            const insertAt = deudaIdx !== -1 ? deudaIdx + 1 : (totalIdx !== -1 ? totalIdx : horizon.capital.rows.length);
            horizon.capital.rows.splice(insertAt, 0, { name: 'Deuda asumida (no-cash)', value: formattedAssumed });
          }
        } else if (assumedRowIdx !== -1) {
          horizon.capital.rows.splice(assumedRowIdx, 1);
        }

        // 3.6.1 Filtro de seguridad: eliminar cualquier duplicado residual antes de sumar total
        const finalSeen = new Set();
        horizon.capital.rows = horizon.capital.rows.filter((r) => {
          const raw = String(r.name ?? '').replace(/\*\d+/g, '').trim().toLowerCase();
          let key = raw;
          if (key.includes('libre')) key = 'libre';
          else if (key.includes('adquisic') || key.includes('acquisic')) key = 'adquisiciones';
          else if (key.includes('marca') || key.includes('desinvers') || key.includes('negocio')) key = 'marcas';
          else if (key.includes('corto plazo') || key.includes('inversiones')) key = 'inversiones';
          else if (key.includes('recompra')) key = 'recompras';
          else if (key.includes('preferent')) key = 'preferentes';
          else if (key.includes('participacion')) key = 'participaciones';
          else if (key.includes('asumida')) key = 'deuda-asumida';
          else if (key.includes('restringid')) key = 'efectivo-restringido';
          else if (key === 'caja' || key.includes('caja')) key = 'caja';
          else if (key.includes('deuda')) key = 'deuda';
          else if (key.includes('total')) key = 'total';

          if (finalSeen.has(key)) return false;
          finalSeen.add(key);
          return true;
        });

        // 3.7 Recalcular "En total" y emitir verificación precisa
        let totalRow = horizon.capital.rows.find((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('total'));
        if (!totalRow) {
          totalRow = { name: 'En total', value: '0' };
          horizon.capital.rows.push(totalRow);
        }

        horizon.capital.rows.forEach((r) => {
          r.value = normalizeNumericCell(r.value);
        });

        let sum = 0;
        let gross = 0;
        let hasValidRows = false;
        horizon.capital.rows.forEach((r) => {
          if (String(r.name).toLowerCase().includes('total')) return;
          const num = parseLooseReportNumber(r.value);
          if (Number.isFinite(num)) {
            sum += num;
            gross += Math.abs(num);
            hasValidRows = true;
          }
        });

        if (hasValidRows) {
          totalRow.value = formatCellNumber(sum);
          // Umbral relativo: el descuadre es razonable si es pequeño en términos absolutos o
          // si es menor al 20 % del capital libre / 10 % del volumen bruto de movimientos.
          const libreMagnitude = Math.abs(parseLooseReportNumber(capLibreRow?.value));
          const threshold = Math.max(
            50,
            Number.isFinite(libreMagnitude) ? libreMagnitude * 0.2 : 0,
            gross * 0.1,
          );
          if (Math.abs(sum) <= threshold) {
            horizon.capital.verification = 'Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.';
          } else {
            horizon.capital.verification = 'No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo.';
          }
        } else {
          // Sin ninguna cifra válida no se publica un bloque de asignación de capital vacío.
          emptyCapital = true;
        }

        // 3.7 Notas explicativas al pie
        const rawCapNotes = (Array.isArray(horizon.capital.notes) ? horizon.capital.notes : [])
          .filter(Boolean);

        const cleanNotes = [];
        let brandNoteNum = null;
        let debtNoteNum = null;
        let equityNoteNum = null;
        let assumedNoteNum = null;
        let restrictedNoteNum = null;
        const noActionNoteRe = /no hubo|no se realiz|sin desinversiones|sin adquisiciones|no se completaron|no divestitures|no acquisitions/i;

        // Buscar nota descriptiva de venta o compra de marcas / desinversiones.
        // Solo se incluye si la tabla tiene una fila de marcas/adquisiciones que la referencie.
        const brandNote = rawCapNotes.find((n) => {
          const lower = n.toLowerCase();
          return lower.includes('marca') || lower.includes('desinversión') || lower.includes('desinversion') || lower.includes('adquisición') || lower.includes('adquisicion');
        });
        const hasBrandRow = horizon.capital.rows.some((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('marca') || n.includes('desinvers') || n.includes('negocio') || n.includes('divest') || n.includes('adquisic') || n.includes('acquisic');
        });

        if (brandNote && hasBrandRow) {
          let cleaned = brandNote.replace(/^\*\d+:?\s*/, '').trim();
          // Si el texto incluye frases redundantes de deuda o caja, conservar solo la parte de la marca
          const splitPoint = cleaned.split(/(?:\.|\;)\s*(?:La deuda|Deuda balance|Deuda|La caja)/i);
          if (splitPoint.length > 1) {
            cleaned = splitPoint[0].trim();
            if (!cleaned.endsWith('.')) cleaned += '.';
          }
          // Sin adquisiciones materiales en el ejercicio, se elimina cualquier mención a
          // adquisiciones (la IA puede estar citando la compra del año anterior).
          if (Math.abs(Number(capData?.acquisitions ?? 0)) < 50 && /\badquisici/i.test(cleaned)) {
            cleaned = cleaned.split(/(?:\.|\;)?\s*(?:Y\s+)?Adquisiciones:?/i)[0].trim();
            if (cleaned && !cleaned.endsWith('.')) cleaned += '.';
          }
          // Sin desinversiones materiales (>= 50M) no debe quedar mención a ventas de activos.
          const divestitureTotal = Math.abs(Number(capData?.divestitures ?? 0)) + Math.abs(Number(capData?.assetSales ?? 0));
          if (divestitureTotal < 50 && /desinversi/i.test(cleaned)) {
            const divIndex = cleaned.search(/(?:\.|\;)?\s*(?:Y\s+)?Desinversiones:?/i);
            if (divIndex > 0) {
              cleaned = cleaned.slice(0, divIndex).trim();
              if (cleaned && !cleaned.endsWith('.')) cleaned += '.';
            } else if (divIndex === 0) {
              cleaned = '';
            }
          }
          if (cleaned && !noActionNoteRe.test(cleaned)) {
            cleanNotes.push(cleaned);
            brandNoteNum = cleanNotes.length;
          }
        }

        // Notas garantizadas: si hay fila de Adquisiciones o Desinversiones y ninguna nota las explica,
        // se construyen con las descripciones extraídas del informe o, en su defecto, con el importe de la fila.
        const rowValueByConcept = (test) => {
          const row = horizon.capital.rows.find((r) => test(String(r.name).replace(/\*\d+/g, '').trim().toLowerCase()));
          const value = parseLooseReportNumber(row?.value);
          return Number.isFinite(value) ? Math.abs(value) : null;
        };
        const hasAcqRow = horizon.capital.rows.some((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('adquisic') || n.includes('acquisic');
        });
        if (hasAcqRow && !cleanNotes.some((n) => n.toLowerCase().includes('adquisi'))) {
          const acqAmount = rowValueByConcept((n) => n.includes('adquisic') || n.includes('acquisic')) ?? Math.abs(Number(capData?.acquisitions ?? 0));
          cleanNotes.push(capData?.acquisitionDescription
            ? `Adquisiciones: Se destinaron ${formatCellNumber(acqAmount)}M a la compra de ${cleanAssetDescription(capData.acquisitionDescription)} (uso de fondos).`
            : `Adquisiciones: Se destinaron ${formatCellNumber(acqAmount)}M a la compra de negocios (uso de fondos).`);
          brandNoteNum = cleanNotes.length;
        }
        const hasDivRow = horizon.capital.rows.some((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('marca') || n.includes('desinvers') || n.includes('negocio') || n.includes('divest');
        });
        if (hasDivRow && !cleanNotes.some((n) => /desinversi|venta de marcas|venta de negocio/i.test(n))) {
          const divAmount = rowValueByConcept((n) => n.includes('marca') || n.includes('desinvers') || n.includes('negocio') || n.includes('divest')) ?? Math.abs(Number(capData?.divestitures ?? 0));
          cleanNotes.push(capData?.divestitureDescription
            ? `Desinversiones: Se ingresaron ${formatCellNumber(divAmount)}M por la venta de ${cleanAssetDescription(capData.divestitureDescription)} (fuente de fondos).`
            : `Desinversiones: Se ingresaron ${formatCellNumber(divAmount)}M por ventas de activos o negocios (fuente de fondos).`);
          brandNoteNum = cleanNotes.length;
        }

        // Nota de financiación de capital: preferentes y venta de participaciones no controladoras
        const preferredRow = horizon.capital.rows.find((r) => /preferent/i.test(String(r.name).replace(/\*\d+/g, '').trim()));
        const nonControllingRow = horizon.capital.rows.find((r) => /participacion/i.test(String(r.name).replace(/\*\d+/g, '').trim()));
        if (preferredRow || nonControllingRow) {
          const equityParts = [];
          if (preferredRow) equityParts.push(`${formatCellNumber(Math.abs(parseLooseReportNumber(preferredRow.value)))}M por emisión de preferentes`);
          if (nonControllingRow) equityParts.push(`${formatCellNumber(Math.abs(parseLooseReportNumber(nonControllingRow.value)))}M por venta de participaciones no controladoras`);
          cleanNotes.push(`Financiación de capital: se obtuvieron ${equityParts.join(' y ')} (fuente de fondos; no es deuda ni desinversión).`);
          equityNoteNum = cleanNotes.length;
        }

        // Nota obligatoria de Deuda Balance, Deuda Neta y movimiento de Caja
        if (capData?.debtDetails) {
          const debtLine = capData.debtDetails.endsWith('.') ? capData.debtDetails : `${capData.debtDetails}.`;
          const cashLine = capData.cashDetails
            ? ` ${capData.cashDetails.endsWith('.') ? capData.cashDetails : `${capData.cashDetails}.`}`
            : '';
          cleanNotes.push(`${debtLine}${cashLine}`);
          debtNoteNum = cleanNotes.length;
        } else if (capData?.cashDetails) {
          cleanNotes.push(capData.cashDetails.endsWith('.') ? capData.cashDetails : `${capData.cashDetails}.`);
          debtNoteNum = cleanNotes.length;
        } else {
          const existingDebtNote = rawCapNotes.find((n) => n.includes('Deuda balance') || n.includes('Deuda neta'));
          if (existingDebtNote) {
            cleanNotes.push(existingDebtNote.replace(/^\*\d+:?\s*/, '').trim());
            debtNoteNum = cleanNotes.length;
          }
        }

        // Nota de efectivo restringido/escrow (liberado o consignado en el periodo).
        const restrictedRow = horizon.capital.rows.find((r) => /restringid/i.test(String(r.name).replace(/\*\d+/g, '').trim()));
        if (restrictedRow) {
          const restrictedAmount = parseLooseReportNumber(restrictedRow.value);
          if (Number.isFinite(restrictedAmount)) {
            cleanNotes.push(restrictedAmount >= 0
              ? `Efectivo restringido: se liberaron ${formatCellNumber(Math.abs(restrictedAmount))}M de efectivo restringido/escrow (fuente de fondos).`
              : `Efectivo restringido: se consignaron ${formatCellNumber(Math.abs(restrictedAmount))}M como efectivo restringido/escrow (uso de fondos).`);
            restrictedNoteNum = cleanNotes.length;
          }
        }

        // En el horizonte trimestral, si una adquisición material se financió con recursos
        // levantados antes del trimestre (preferentes, participaciones o efectivo restringido)
        // y el 10-Q solo publica el flujo acumulado, el cuadre del trimestre no puede cerrar.
        const ytdEquityFinancing = (Number(extracted.facts?.preferredIssuanceYtd) || 0)
          + (Number(extracted.facts?.nonControllingSaleYtd) || 0);
        if (isTrimestral && !restrictedRow && Math.abs(Number(capData?.acquisitions ?? 0)) >= 50 && ytdEquityFinancing >= 50) {
          cleanNotes.push('Nota: la adquisición se financió en parte con recursos levantados antes del trimestre (emisión de preferentes, venta de participaciones y efectivo restringido/escrow de trimestres anteriores); el 10-Q solo publica el estado de flujos acumulado, por lo que la suma de los últimos 3 meses no puede cerrar exactamente.');
        }

        // Nota de deuda asumida (no-cash): desglosa el aumento de deuda del balance entre
        // la deuda emitida/amortizada con caja y la heredada de la empresa adquirida.
        const assumedRow = horizon.capital.rows.find((r) => /asumida/i.test(String(r.name).replace(/\*\d+/g, '').trim()));
        if (assumedRow) {
          const assumedAmount = Math.abs(parseLooseReportNumber(assumedRow.value));
          const debtDelta = Number(capData?.deuda);
          const debtCashNet = Number.isFinite(debtDelta) ? Math.round((debtDelta - assumedAmount) * 10) / 10 : null;
          const detail = Number.isFinite(debtCashNet) && debtCashNet >= 0
            ? `de los ${formatCellNumber(debtDelta)}M que sube la deuda del balance, ${formatCellNumber(debtCashNet)}M son deuda emitida/amortizada con caja y ${formatCellNumber(assumedAmount)}M son deuda que ya existía en la empresa adquirida y se asume con la compra`
            : `${formatCellNumber(assumedAmount)}M corresponden a deuda que ya existía en la empresa adquirida y se asume con la compra (la variación de deuda del periodo incluye además movimientos con caja y otros ajustes)`;
          cleanNotes.push(`Deuda asumida (no-cash): ${detail}; esa parte no supone entrada de caja y se resta en el cuadre.`);
          assumedNoteNum = cleanNotes.length;
        }

        // Renumerar correlativamente
        horizon.capital.notes = cleanNotes.map((text, idx) => `*${idx + 1}: ${text}`);

        // 3.8 Sincronizar llamadas a notas (*N) en las filas de la tabla
        horizon.capital.rows.forEach((r) => {
          const baseName = r.name.replace(/\*\d+/g, '').trim();
          const n = baseName.toLowerCase();

          if (brandNoteNum && (n.includes('marca') || n.includes('desinvers') || n.includes('negocio') || n.includes('adquisic') || n.includes('acquisic'))) {
            r.name = `${baseName}*${brandNoteNum}`;
          } else if (equityNoteNum && (n.includes('preferent') || n.includes('participacion'))) {
            r.name = `${baseName}*${equityNoteNum}`;
          } else if (assumedNoteNum && n.includes('asumida')) {
            r.name = `${baseName}*${assumedNoteNum}`;
          } else if (restrictedNoteNum && n.includes('restringid')) {
            r.name = `${baseName}*${restrictedNoteNum}`;
          } else if (debtNoteNum && (n === 'caja' || n.includes('caja') || n.includes('deuda') || n.includes('corto plazo') || n.includes('inversiones'))) {
            r.name = `${baseName}*${debtNoteNum}`;
          } else {
            r.name = baseName;
          }
        });
      }
      if (emptyCapital) {
        horizon.capital = { rows: [], verification: '', notes: [] };
      }

      // Coherencia de notas en Ventas: toda llamada de nota (*N) de una fila debe existir
      // realmente en el bloque; si no, se reasigna por concepto o se retira la llamada.
      if (horizon.sales?.rows?.length) {
        const salesNotes = Array.isArray(horizon.sales.notes) ? horizon.sales.notes : [];
        const hasPrefixed = salesNotes.some((n) => /^\s*\*?\d+\s*:/.test(String(n)));
        const tagExists = (tag) => {
          const num = Number(tag);
          if (!Number.isFinite(num) || num < 1 || num > salesNotes.length) return false;
          if (!hasPrefixed) return true;
          return /^\s*\*?\d+\s*:/.test(String(salesNotes[num - 1] ?? ''));
        };
        horizon.sales.rows.forEach((row) => {
          const tag = (String(row.adjustedNote ?? '').match(/\d+/) || [])[0];
          if (!tag || tagExists(tag)) return;
          const concept = String(row.name ?? '').toLowerCase();
          let remapped = null;
          salesNotes.forEach((note, idx) => {
            if (remapped) return;
            const text = String(note).toLowerCase();
            if (concept.includes('operativ') && /impair|deterior|intangible|amortiz/.test(text)) remapped = `*${idx + 1}`;
            if (concept.includes('neto') && /impuesto|fiscal|23\s*%|tasa/.test(text)) remapped = `*${idx + 1}`;
          });
          row.adjustedNote = remapped ?? undefined;
          if (!remapped) row.isAdjusted = false;
        });
      }
    });

    if (isAnnual) {
      result.conclusion = result.conclusion || {};
      const rawAnn = extracted.annualDetails || {};

      // 1: Recompras
      result.conclusion.repurchases = result.conclusion.repurchases || {};
      result.conclusion.repurchases.title = result.conclusion.repurchases.title || '1: Recompras';
      result.conclusion.repurchases.text = result.conclusion.repurchases.text || rawAnn.repurchasesNarrative || 'Detalle de los programas de recompras de acciones ejecutados durante el ejercicio.';
      result.conclusion.repurchases.programAuthorization = result.conclusion.repurchases.programAuthorization || rawAnn.repurchaseProgramSummary || null;
      result.conclusion.repurchases.programRemaining = result.conclusion.repurchases.programRemaining || rawAnn.repurchaseRemaining || null;
      result.conclusion.repurchases.shareCountEvolution = result.conclusion.repurchases.shareCountEvolution || null;
      result.conclusion.repurchases.bpaImpact = result.conclusion.repurchases.bpaImpact || null;
      result.conclusion.repurchases.futureProjection = result.conclusion.repurchases.futureProjection || null;
      const extractionRep = rawAnn.repurchases ?? {};
      const currentAuthRemaining = result.conclusion.repurchases.authorizationRemaining;
      if ((!currentAuthRemaining || isPlaceholderText(currentAuthRemaining)) && extractionRep.programRemaining != null && extractionRep.programRemaining !== '') {
        const remNum = Number(extractionRep.programRemaining);
        result.conclusion.repurchases.authorizationRemaining = Number.isFinite(remNum)
          ? `Unos ${String(remNum).replace('.', ',')}M de $ pendientes de ejecución`
          : String(extractionRep.programRemaining);
      }
      if (!result.conclusion.repurchases.futureProjection || isPlaceholderText(result.conclusion.repurchases.futureProjection)) {
        const avgPrice = Number(extractionRep.averagePrice)
          || (Number(extractionRep.aggregateCost) > 0 && Number(extractionRep.sharesRepurchasedAnnual) > 0
            ? Number(extractionRep.aggregateCost) / Number(extractionRep.sharesRepurchasedAnnual)
            : null);
        const projection = buildFutureProjectionText({
          remainingAuthorization: extractionRep.programRemaining,
          averagePrice: avgPrice,
          sharesHistory: result.conclusion.repurchases.sharesHistory,
        });
        if (projection) result.conclusion.repurchases.futureProjection = projection;
      }
      const expiryRaw = result.conclusion.repurchases.authorizationExpiry
        || extractionRep.programExpiry
        || null;
      result.conclusion.repurchases.authorizationExpiry = (expiryRaw && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(expiryRaw)))
        ? expiryRaw
        : null;
      if ((!Array.isArray(result.conclusion.repurchases.sharesHistory) || result.conclusion.repurchases.sharesHistory.length < 2)
        && Array.isArray(extractionRep.sharesHistory) && extractionRep.sharesHistory.length >= 2) {
        result.conclusion.repurchases.sharesHistory = extractionRep.sharesHistory;
      }
      if (Array.isArray(result.conclusion.repurchases.sharesHistory) && result.conclusion.repurchases.sharesHistory.length >= 2) {
        result.conclusion.repurchases.sharesHistory = mergeHistoryByYear(result.conclusion.repurchases.sharesHistory, []).slice(-5);
        const computedEvolution = buildShareCountEvolutionText(result.conclusion.repurchases.sharesHistory);
        if (computedEvolution) {
          const currentEvolution = result.conclusion.repurchases.shareCountEvolution;
          const saysNoChange = /sin variaci|no variaci|sin cambios|no changes?/i.test(String(currentEvolution ?? ''));
          const points = result.conclusion.repurchases.sharesHistory;
          const prevShares = Number(points[points.length - 2]?.shares);
          const lastShares = Number(points[points.length - 1]?.shares);
          const lastChangePct = prevShares > 0 ? Math.abs((lastShares - prevShares) / prevShares) * 100 : 0;
          if (!currentEvolution || (saysNoChange && lastChangePct >= 0.5)) {
            result.conclusion.repurchases.shareCountEvolution = computedEvolution;
          }
        }
      }
      if (!result.conclusion.repurchases.secSnippet && extractionRep.secTable) {
        result.conclusion.repurchases.secSnippet = extractionRep.secTable;
      }
      if (!result.conclusion.repurchases.secSnippet && rawAnn.repurchasesSecTable) {
        result.conclusion.repurchases.secSnippet = rawAnn.repurchasesSecTable;
      }
      // Si el 10-K no trae tabla propia de recompras y solo hay un año, construir la serie multianual con XBRL.
      if (Array.isArray(extractionRep.repurchaseHistory) && extractionRep.repurchaseHistory.length >= 3) {
        const snippetColumns = Array.isArray(result.conclusion.repurchases.secSnippet?.headers)
          ? result.conclusion.repurchases.secSnippet.headers.length
          : 0;
        if (!result.conclusion.repurchases.secSnippet || snippetColumns < 3) {
          const generatedTable = buildRepurchaseSecTable(extractionRep.repurchaseHistory, extractionRep.programRemaining);
          if (generatedTable) {
            result.conclusion.repurchases.secSnippet = generatedTable;
          }
        }
      }
      // La tabla final siempre incorpora "Shares repurchased", "Average price paid (in $)" y el
      // remanente de autorización cuando el sistema dispone de esas cifras (XBRL o extracción).
      if (result.conclusion.repurchases.secSnippet) {
        const remainingNumber = Number(extractionRep.programRemaining);
        const remainingFromText = (() => {
          const match = String(result.conclusion.repurchases.authorizationRemaining ?? '').match(/[\d.,]+/);
          const parsed = match ? parseLooseReportNumber(match[0]) : NaN;
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        })();
        result.conclusion.repurchases.secSnippet = enrichRepurchaseSnippet(
          result.conclusion.repurchases.secSnippet,
          extractionRep.repurchaseHistory,
          Number.isFinite(remainingNumber) && remainingNumber > 0 ? remainingNumber : remainingFromText,
        );
      }

      // 2: Outlook
      result.conclusion.outlook = result.conclusion.outlook || {};
      result.conclusion.outlook.title = result.conclusion.outlook.title || '2: Outlook';
      const extractionOut = rawAnn.outlook ?? {};
      if (!result.conclusion.outlook.text || result.conclusion.outlook.text === 'Metas y previsiones cuantitativas oficiales para el próximo ejercicio.') {
        const parts = [];
        if (extractionOut.guidanceSales && !/sin guidance/i.test(extractionOut.guidanceSales)) parts.push(`Ventas: ${extractionOut.guidanceSales}`);
        if (extractionOut.guidanceEbt) parts.push(`EBT: ${extractionOut.guidanceEbt}`);
        if (extractionOut.guidanceEps) parts.push(`BPA: ${extractionOut.guidanceEps}`);
        if (extractionOut.guidanceFcf) parts.push(`FCF: ${extractionOut.guidanceFcf}`);
        if (extractionOut.guidanceCapex) parts.push(`CAPEX: ${extractionOut.guidanceCapex}`);
        if (extractionOut.guidanceNetInterest) parts.push(`Gastos por intereses: ${extractionOut.guidanceNetInterest}`);
        if (parts.length) {
          result.conclusion.outlook.text = `Previsiones cuantitativas oficiales comunicadas por la dirección para el próximo ejercicio: ${parts.join(', ')}.`;
        } else if (rawAnn.outlookNarrative) {
          result.conclusion.outlook.text = rawAnn.outlookNarrative;
        }
      }
      result.conclusion.outlook.fcfAnalysis = result.conclusion.outlook.fcfAnalysis || (extractionOut.guidanceFcf ? `Previsión de FCF reportada en el guidance: ${extractionOut.guidanceFcf}.` : null);
      result.conclusion.outlook.riskFactors = result.conclusion.outlook.riskFactors || extractionOut.commodityRisks || null;
      result.conclusion.outlook.efficiencyPlans = result.conclusion.outlook.efficiencyPlans || extractionOut.costSavingsPlan || null;
      if (!result.conclusion.outlook.secSnippet && extractionOut.secTable && Array.isArray(extractionOut.secTable.rows) && extractionOut.secTable.rows.length) {
        result.conclusion.outlook.secSnippet = extractionOut.secTable;
      }
      if (!result.conclusion.outlook.secSnippet && rawAnn.outlookSecTable) {
        result.conclusion.outlook.secSnippet = rawAnn.outlookSecTable;
      }
      if (result.conclusion.outlook.secSnippet) {
        result.conclusion.outlook.secSnippet = completeOutlookPriorColumn(
          mergeOutlookRows(
            withOutlookComparison(result.conclusion.outlook.secSnippet, result),
            extractionOut.secTable,
          ),
          extractionOut,
        );
      }

      // 3: Deuda
      result.conclusion.debt = result.conclusion.debt || {};
      result.conclusion.debt.title = result.conclusion.debt.title || '3: Deuda';
      result.conclusion.debt.text = result.conclusion.debt.text || rawAnn.debtNarrative || 'Estructura de endeudamiento, liquidez y calendario de vencimientos de deuda.';
      result.conclusion.debt.refinancingAnalysis = result.conclusion.debt.refinancingAnalysis || null;
      result.conclusion.debt.refinancingImpact = result.conclusion.debt.refinancingImpact || null;

      const extractionDebt = rawAnn.debt ?? {};
      const extractionMaturity = (Array.isArray(extractionDebt.maturityItems) && extractionDebt.maturityItems.length)
        ? extractionDebt.maturityItems
        : ((Array.isArray(extractionDebt.maturitySchedule) && extractionDebt.maturitySchedule.length) ? extractionDebt.maturitySchedule : null);
      const hasMaturitySchedule = Array.isArray(result.conclusion.debt.maturitySchedule) && result.conclusion.debt.maturitySchedule.length > 0;
      // El calendario fusionado por el sistema (XBRL oficial + tramos con cupón de la IA) manda
      // siempre sobre el que haya podido redactar el modelo.
      if (extractionMaturity) {
        result.conclusion.debt.maturitySchedule = extractionMaturity;
      } else if (!hasMaturitySchedule && edgarDebtMaturities) {
        result.conclusion.debt.maturitySchedule = edgarDebtMaturities.years.map((y) => ({
          year: y.year,
          label: 'Vencimientos contractuales de deuda',
          amount: y.amount,
          type: 'Deuda total',
          interestRate: null,
        }));
      }
      if (edgarDebtMaturities?.afterYearFive != null) {
        result.conclusion.debt.maturityAfterFive = edgarDebtMaturities.afterYearFive;
      }
      // Tipo medio de toda la deuda calculado por el sistema (exacto o estimado con su base).
      if (extractionDebt.allDebtAverageRate != null) {
        result.conclusion.debt.allDebtAverageRate = extractionDebt.allDebtAverageRate;
        result.conclusion.debt.allDebtAverageRateEstimated = extractionDebt.allDebtAverageRateEstimated === true;
        result.conclusion.debt.allDebtAverageRateSource = extractionDebt.allDebtAverageRateSource ?? null;
      }
      // Histórico de deuda: combinar la serie de la IA con la oficial de EDGAR (que gana)
      // para garantizar hasta 10 ejercicios con importes válidos.
      const debtHistoryMaxYear = Number.isFinite(Number(fiscalYear)) ? Number(fiscalYear) : null;
      const aiDebtHistory = ((Array.isArray(result.conclusion.debt.debtHistory) && result.conclusion.debt.debtHistory.length)
        ? result.conclusion.debt.debtHistory
        : (Array.isArray(extractionDebt.debtHistory) ? extractionDebt.debtHistory : []))
        .filter((point) => debtHistoryMaxYear == null || Number(point?.year) <= debtHistoryMaxYear);
      const mergedDebtHistory = mergeHistoryByYear(aiDebtHistory, edgarDebtHistory).slice(-10);
      if (mergedDebtHistory.length) {
        result.conclusion.debt.debtHistory = mergedDebtHistory;
      }
      if (!result.conclusion.debt.refinancing && (extractionDebt.refinancing || extractionDebt.nearTermRates || extractionDebt.nearTermMaturities)) {
        result.conclusion.debt.refinancing = extractionDebt.refinancing || {
          occurred: Boolean(extractionDebt.nearTermMaturities),
          amountRefinanced: extractionDebt.nearTermMaturities,
          estimatedRefinancingRate: extractionDebt.estimatedRefinancingRate,
          annualInterestImpact: extractionDebt.estimatedInterestIncrease,
        };
      }
      if (!result.conclusion.debt.secSnippet && (rawAnn.debtMaturitiesSecTable || extractionDebt.secTable)) {
        result.conclusion.debt.secSnippet = rawAnn.debtMaturitiesSecTable || extractionDebt.secTable;
      }
      if (edgarDebtHistory) {
        result.edgarDebtHistory = edgarDebtHistory;
      }
      if (edgarDebtMaturities) {
        result.edgarDebtMaturities = edgarDebtMaturities;
      }
      if (edgarDividendHistory) {
        result.edgarDividendHistory = edgarDividendHistory;
      }

      // 4: Adquisiciones
      result.conclusion.acquisitions = result.conclusion.acquisitions || {};
      result.conclusion.acquisitions.title = result.conclusion.acquisitions.title || '4: Adquisiciones';
      result.conclusion.acquisitions.text = result.conclusion.acquisitions.text || rawAnn.acquisitionsNarrative || (extracted.facts?.acquisitionsYtd ? `Se completaron adquisiciones corporativas por un importe neto de ${extracted.facts.acquisitionsYtd}M.` : 'No se realizaron adquisiciones materiales durante el ejercicio.');
      // Si el estado de flujos oficial confirma que en el ejercicio NO hubo adquisiciones
      // materiales, el texto del modelo no puede atribuirle una compra del año anterior.
      {
        const hasOfficialAcquisitionFigure = extracted.facts?.acquisitionsYtd != null
          && Number.isFinite(Number(extracted.facts.acquisitionsYtd));
        const acquisitionAmount = hasOfficialAcquisitionFigure ? Math.abs(Number(extracted.facts.acquisitionsYtd)) : null;
        if (hasOfficialAcquisitionFigure && acquisitionAmount < 50) {
          const divestitureAmount = Math.abs(Number(extracted.facts?.brandDivestitures) || 0)
            + Math.abs(Number(extracted.facts?.assetSalesYtd) || 0);
          const divestitureDescription = extracted.facts?.divestitureDescription;
          const descriptionHasAmount = /\d[\d.,]*\s*(?:M\$|M\b|\$|millones|billion|million)/i.test(String(divestitureDescription ?? ''));
          const divestitureSentence = (divestitureAmount >= 50 && divestitureDescription)
            ? ` Se completó la desinversión de ${cleanAssetDescription(divestitureDescription)}${descriptionHasAmount ? '' : ` por ${Math.round(divestitureAmount)}M`}.`
            : '';
          result.conclusion.acquisitions.text = `No se realizaron adquisiciones materiales durante el ejercicio.${divestitureSentence}`;
        }
      }

      // 5: Dividendos (solo si ha habido un cambio relevante en el ejercicio)
      {
        const extractionDividends = rawAnn.dividends ?? {};
        const dividendHistory = mergeDividendHistory(extractionDividends.history, edgarDividendHistory);
        if (dividendHistory.length >= 2) {
          const prevDiv = dividendHistory[dividendHistory.length - 2];
          const lastDiv = dividendHistory[dividendHistory.length - 1];
          const computedChange = (Number.isFinite(prevDiv?.dps) && prevDiv.dps > 0 && Number.isFinite(lastDiv?.dps))
            ? Math.round(((lastDiv.dps - prevDiv.dps) / prevDiv.dps) * 1000) / 10
            : null;
          const changePct = Number.isFinite(Number(extractionDividends.changePct)) ? Number(extractionDividends.changePct) : computedChange;
          const changeType = extractionDividends.changeType || (changePct > 0 ? 'increase' : (changePct < 0 ? 'cut' : 'unchanged'));
          const aiDividends = result.conclusion.dividends ?? null;
          const material = Number.isFinite(changePct) && Math.abs(changePct) >= 2;
          if (aiDividends || material) {
            result.conclusion.dividends = aiDividends || {};
            result.conclusion.dividends.title = result.conclusion.dividends.title || '5: Dividendos';
            result.conclusion.dividends.history = dividendHistory;
            result.conclusion.dividends.changePct = changePct;
            result.conclusion.dividends.changeType = changeType;
            if (!result.conclusion.dividends.text) {
              const verb = changeType === 'cut' ? 'recortó' : 'aumentó';
              result.conclusion.dividends.text = `El dividendo por acción ${verb} un ${Math.abs(changePct).toFixed(1).replace('.', ',')} % en ${lastDiv.year}, pasando de ${String(prevDiv.dps).replace('.', ',')} $ a ${String(lastDiv.dps).replace('.', ',')} $, con un pago total de ${String(lastDiv.total).replace('.', ',')}M.`;
            }
          }
        }
      }

      // 6: Watchlist
      result.conclusion.watchlist = result.conclusion.watchlist || {};
      result.conclusion.watchlist.title = result.conclusion.watchlist.title || `Cosas a tener en cuenta en ${fiscalYear ? fiscalYear + 1 : 'el próximo año'}`;
      if (!Array.isArray(result.conclusion.watchlist.items) || result.conclusion.watchlist.items.length === 0) {
        result.conclusion.watchlist.items = [
          '1: Evolución de los ingresos orgánicos y volúmenes respecto a competidores del sector.',
          '2: Ritmo y precio de ejecución de los programas de recompra de acciones.',
          '3: Refinanciación de la deuda próxima a vencer y coste efectivo de los nuevos intereses.',
        ];
      }

      // Recompras insignificantes (< 50M): la sección completa de recompras se omite porque no
      // aporta información material al análisis (igual que las filas de la asignación de capital).
      // Solo se tienen en cuenta las recompras del EJERCICIO analizado, no el histórico.
      const buybackCandidates = [];
      const factsBuybacks = Number(extracted.facts?.shareBuybacks);
      if (Number.isFinite(factsBuybacks) && factsBuybacks !== 0) buybackCandidates.push(Math.abs(factsBuybacks));
      const capBuybacks = Number(extracted.capitalAllocationData?.ytd?.buybacks);
      if (Number.isFinite(capBuybacks) && capBuybacks !== 0) buybackCandidates.push(Math.abs(capBuybacks));
      if (Array.isArray(extractionRep.repurchaseHistory)) {
        const points = extractionRep.repurchaseHistory
          .map((point) => ({ year: Number(point?.year), amount: Math.abs(Number(point?.amount)) }))
          .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.amount) && point.amount > 0)
          .sort((a, b) => a.year - b.year);
        if (points.length) buybackCandidates.push(points[points.length - 1].amount);
      }
      const maxBuyback = buybackCandidates.length ? Math.max(...buybackCandidates) : null;
      if (result.conclusion.repurchases && maxBuyback != null && maxBuyback < 50) {
        delete result.conclusion.repurchases;
      }

      // Renumerar las secciones garantizadas según las que finalmente se muestran.
      let sectionNumber = 0;
      const numberSection = (key, fallback) => {
        const section = result.conclusion[key];
        if (!section) return;
        sectionNumber += 1;
        const baseTitle = String(section.title ?? '').replace(/^\d+\s*:\s*/, '').trim() || fallback;
        section.title = `${sectionNumber}: ${baseTitle}`;
      };
      numberSection('repurchases', 'Recompras');
      numberSection('outlook', 'Outlook');
      numberSection('debt', 'Deuda');
      if (result.conclusion.acquisitions) {
        result.conclusion.acquisitions.title = `${sectionNumber + 1}: Adquisiciones`;
      }

      // Parte III: Nota de Resultados (1 a 10)
      result.rating = result.rating || {};
      let scoreNum = Number(result.rating.score);
      if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 10) {
        const labelMatch = String(result.rating.label || '').match(/\d+(?:[.,]\d+)?/);
        scoreNum = labelMatch ? parseFloat(labelMatch[0].replace(',', '.')) : 5;
      }
      scoreNum = Math.min(10, Math.max(1, Math.round(scoreNum * 10) / 10));
      result.rating.score = scoreNum;
      result.rating.label = `NOTA DE RESULTADOS: ${scoreNum}`;
      result.rating.rationale = result.rating.rationale || 'Calificación puramente financiera basada exclusivamente en la realidad de las cuentas del año, las metas expuestas en el outlook oficial y la asignación de capital ejecutada. Sin especulación sobre el cumplimiento futuro.';

      result.isAnnual = true;
      result.formType = '10-K';
    } else {
      result.isAnnual = false;
      result.formType = input.formType ?? '10-Q';
    }

    result.fiscalQuarter = extracted.fiscalQuarter ?? fiscalQuarter ?? null;
    result.fiscalYear = extracted.fiscalYear ?? fiscalYear ?? null;

    return result;
  }
}
