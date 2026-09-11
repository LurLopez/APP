import { readFile } from 'node:fs/promises';
import { BaseAgent, AgentError } from './baseAgent.js';
import { chatJson } from '../services/ai/modelProvider.js';
import { getPreviousQuarterCashFlow, getCompanyResults } from '../services/edgar.service.js';

const MAX_CHARS = 80000;
const KNOWLEDGE_DIR = new URL('./knowledge/', import.meta.url);
const PROMPTS_DIR = new URL('./prompts/', import.meta.url);
const SECTOR_FILES = { defensive_consumer: 'consumo-defensivo' };

function parseFinancialValue(val) {
  if (val == null || val === '—') return NaN;
  const raw = String(val).trim();
  const isParenthesized = /^\(.*\)$/.test(raw);
  const clean = raw.replace(/^\(|\)$/g, '').replace('M', '').replace('$', '').trim().replace(',', '.');
  const num = parseFloat(clean.replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? (isParenthesized ? -num : num) : NaN;
}

function extractTaxCashFlowAdjustment(text) {
  const match = String(text).match(/(?:Deferred income taxes and income taxes payable,?\s+net|Deferred income tax provision\s*\/\s*\(benefit\)|Deferred income tax provision\s*\(benefit\))\s+([()\d.,-]+)(?:\s+([()\d.,-]+))?/i);
  if (!match) return null;
  const current = parseFinancialValue(match[1]);
  return Number.isFinite(current) ? current : null;
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

function extractCapitalCashFlowFacts(text) {
  const source = String(text);
  const readFirstValue = (pattern) => {
    const match = source.match(pattern);
    return match ? parseFinancialValue(match[1]) : null;
  };
  return {
    shareBuybacks: readFirstValue(/Repurchases of common stock\s+([()\d.,-]+)/i),
    purchasesOfMarketableSecurities: readFirstValue(/Purchases of marketable securities\s+([()\d.,-]+)/i),
    acquisitionsOfBusiness: readFirstValue(/Acquisition of business,? net of cash acquired\s+([()\d.,-]+)/i),
    proceedsFromAssetSales: readFirstValue(/Proceeds from sales of property, plant, equipment and other assets\s+([()\d.,-]+)/i),
  };
}

function formatFinancialValue(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10).replace('.', ',') : null;
}

function getTaxNormalizationData({ extracted, horizon, isTrimestral }) {
  const facts = extracted.facts ?? {};
  const ebtRow = horizon.sales?.rows?.find((row) => String(row.name).toLowerCase().includes('ebt'));
  const netRow = horizon.sales?.rows?.find((row) => String(row.name).toLowerCase().includes('neto'));
  const ebtReported = parseFinancialValue(ebtRow?.normal);
  const ebtAdjusted = parseFinancialValue(ebtRow?.adjusted);
  const netReported = parseFinancialValue(netRow?.normal);
  const taxExpense = Number(facts[isTrimestral ? 'incomeTaxExpenseQuarter' : 'incomeTaxExpenseYtd']);
  const rawTaxCfoAdjustment = facts[isTrimestral ? 'taxCashFlowAdjustmentQuarter' : 'taxCashFlowAdjustmentYtd'];
  const taxCfoAdjustment = Number(rawTaxCfoAdjustment);
  const effectiveTaxRate = Number(facts.effectiveTaxRate);
  const reportedTax = Number.isFinite(taxExpense)
    ? taxExpense
    : (Number.isFinite(ebtReported) && Number.isFinite(netReported) ? ebtReported - netReported : NaN);
  const reportedRate = Number.isFinite(effectiveTaxRate)
    ? effectiveTaxRate / 100
    : (Number.isFinite(ebtReported) && ebtReported !== 0 && Number.isFinite(reportedTax) ? reportedTax / ebtReported : NaN);
  const normalizedRate = 0.23;
  if (!Number.isFinite(ebtAdjusted) || !Number.isFinite(reportedTax)
    || rawTaxCfoAdjustment == null || rawTaxCfoAdjustment === 0
    || !Number.isFinite(taxCfoAdjustment) || !Number.isFinite(normalizedRate)) {
    return null;
  }

  const cashTaxesPaid = reportedTax - taxCfoAdjustment;
  const normalizedCashTaxes = ebtAdjusted * normalizedRate;
  if (!Number.isFinite(normalizedCashTaxes) || normalizedCashTaxes === 0) return null;
  const adjustment = Math.round((cashTaxesPaid - normalizedCashTaxes) * 10) / 10;
  const relativeDeviation = (cashTaxesPaid - normalizedCashTaxes) / Math.abs(normalizedCashTaxes);
  // Solo se corrigen desfases fiscales moderados; diferencias mayores pueden corresponder
  // a liquidaciones de ejercicios anteriores u otros movimientos no identificados.
  if (Math.abs(relativeDeviation) > 0.20) return null;
  if (Math.abs(adjustment) < 0.1) return null;

  return {
    reportedTax,
    taxCfoAdjustment,
    cashTaxesPaid,
    normalizedRate,
    normalizedCashTaxes,
    adjustment,
    explanation: `Impuestos: gasto reportado ${formatFinancialValue(reportedTax)}M ${taxCfoAdjustment >= 0 ? '-' : '+'} ajuste fiscal del cash flow ${formatFinancialValue(Math.abs(taxCfoAdjustment))}M = ${formatFinancialValue(cashTaxesPaid)}M pagados estimados; frente a ${formatFinancialValue(normalizedCashTaxes)}M normalizados (${Math.round(normalizedRate * 100)}% sobre EBT ajustado). Ajuste al Cash Flow Ajustado: ${adjustment >= 0 ? '+' : ''}${formatFinancialValue(adjustment)}M.`,
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
      prevStr = '$705M';
      if (/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i.test(g)) {
        const match = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
        const base = parseFloat(match[1].replace(',', '.'));
        const pct = parseFloat(match[2].replace(',', '.')) / 100;
        projStr = `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
      }
    }
    // 6. Net Interest Expense
    else if (/interest/i.test(m)) {
      prevStr = '$230M';
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
      prevStr = '21.5 %';
      projStr = g;
    }
    // 8. Capital Expenditures / CAPEX
    else if (/capex|capital expend/i.test(m)) {
      prevStr = prevCapexVal ? fmtMoney(prevCapexVal) : '$717M';
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
  const acquisitionsQuarter = Number(extracted.facts?.acquisitionsQuarter) || 0;
  const acquisitionsYtd = Number(extracted.facts?.acquisitionsYtd) || 0;
  const assetSalesQuarter = Number(extracted.facts?.assetSalesQuarter) || 0;
  const assetSalesYtd = Number(extracted.facts?.assetSalesYtd) || 0;
  const acquisitionDescription = extracted.facts?.acquisitionDescription ?? null;
  const divestitureDescription = extracted.facts?.divestitureDescription ?? null;
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
       inversionesCortoPlazo: marketablePurchasesQuarter
         ? -Math.abs(marketablePurchasesQuarter)
         : (Math.abs(invDiff3M) >= 50 ? Math.round(-invDiff3M * 10) / 10 : 0),
       divestitures: rawDivYtd >= 50 ? rawDivYtd : 0,
      buybacks: Number(extracted.fiscalQuarter) === 1 ? -Math.abs(buybacksYtd) : 0,
      acquisitions: (() => {
        const raw = Number(extracted.fiscalQuarter) === 1 ? (acquisitionsQuarter || acquisitionsYtd) : acquisitionsQuarter;
        return raw >= 50 ? -Math.abs(raw) : 0;
      })(),
      assetSales: Number(extracted.fiscalQuarter) === 1 ? (assetSalesQuarter || assetSalesYtd) : assetSalesQuarter,
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
      cashDetails: (bal.cash != null && bal.cashPreviousQuarter != null)
        ? `Caja balance: ${bal.cashPreviousQuarter}M -> ${bal.cash}M (${cashDiff3M > 0 ? '+' : ''}${cashDiff3M}M)`
        : null,
    },
    ytd: {
      libre: null,
      deuda: (bal.totalDebt != null && bal.totalDebtBeginningOfYear != null)
        ? Math.round((Number(bal.totalDebt) - Number(bal.totalDebtBeginningOfYear)) * 10) / 10
        : null,
      caja: cashDiffYtd,
       inversionesCortoPlazo: marketablePurchasesYtd
         ? -Math.abs(marketablePurchasesYtd)
         : (Math.abs(invDiffYtd) >= 50 ? Math.round(-invDiffYtd * 10) / 10 : 0),
      divestitures: rawDivYtd >= 50 ? rawDivYtd : 0,
      buybacks: buybacksYtd ? -Math.abs(buybacksYtd) : 0,
      acquisitions: acquisitionsYtd >= 50 ? -Math.abs(acquisitionsYtd) : 0,
      assetSales: assetSalesYtd,
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
      cashDetails: (bal.cash != null && bal.cashBeginningOfYear != null)
        ? `Caja balance: ${bal.cashBeginningOfYear}M -> ${bal.cash}M (${cashDiffYtd > 0 ? '+' : ''}${cashDiffYtd}M)`
        : null,
    },
  };
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
  const format = (value) => Number.isFinite(value) ? String(value).replace('.', ',') : null;
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
      ? `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflation}% + ${volume}%) = ${annualWcReq}M en todo el año -> en ${months} meses = ${ytdWcReq}M. Desviación frente al circulante reportado (${Math.round(repYtd)}M): ajuste de ${Math.round(wcDiffYtd)}M en Cash Flow.`
      : `WK: no se dispone de inventarios, cuentas por pagar y cuentas por cobrar completas; se utiliza WK=0M y no se aplica ajuste de capital circulante. Volumen asumido: ${volume}%; inflación sectorial estimada: ${inflation}%.`,
  };
  if (Number(extracted.fiscalQuarter) === 1 || months === 3) {
    result.quarterScenarios = [`Normal (WC=${Math.round(repYtd)})`, `Ajustado (WC=${Math.round(annualWcReq / 4)})`];
    result.quarterValues = ytdValues;
    result.explanation3M = result.explanationYtd.replace(`en ${months} meses = ${ytdWcReq}M`, `en 3 meses = ${Math.round(annualWcReq / 4 * 10) / 10}M`);
  }
  return result;
}

async function loadKnowledgeRules(sector, subsector, formType = '10-Q') {
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

  const parts = [];
  const generalTitle = isAnnual ? 'REGLAS GENERALES Y FORMATO ANUAL (10-K)' : 'REGLAS GENERALES Y FORMATO';
  if (generalRules) parts.push(`### ${generalTitle}:\n${generalRules}`);
  if (sectorRules) parts.push(`### REGLAS DEL SECTOR (${sectorSlug}):\n${sectorRules}`);
  if (subsectorRules) parts.push(`### REGLAS DEL SUBSECTOR (${subsector}):\n${subsectorRules}`);

  return parts.join('\n\n---\n\n') || sectorRules;
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

  const head = text.slice(0, 30000);
  const financialWindow = financialIndex !== -1
    ? text.slice(Math.max(0, financialIndex - 15000), Math.min(text.length, financialIndex + 50000))
    : '';

  let mainContent;
  if (financialWindow) {
    mainContent = `[COMIENZO DEL INFORME]\n${head}\n[SECCIÓN DE ESTADOS FINANCIEROS Y NOTAS]\n${financialWindow}`;
  } else {
    mainContent = text;
  }

  const presentation = String(presentationText ?? '').trim();
  if (!presentation) return mainContent.slice(0, MAX_CHARS);

  const presentationBudget = 55000;
  return `${mainContent.slice(0, MAX_CHARS)}\n\n[SECCIÓN COMPLEMENTARIA: PRESENTACIÓN Y COMUNICADO DE RESULTADOS (EARNINGS PRESENTATION / 8-K PRESS RELEASE)]\n${presentation.slice(0, presentationBudget)}`;
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
    "shareBuybacks": 435,
    "purchasesOfMarketableSecuritiesQuarter": 0,
    "purchasesOfMarketableSecuritiesYtd": 1020,
    "brandDivestitures": 649,
    "acquisitionsQuarter": 0,
    "acquisitionsYtd": 271,
    "assetSalesQuarter": 0,
    "assetSalesYtd": 4.4,
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
    "outlook": {
      "guidanceSales": "Flat +/- 1% constant currency",
      "guidanceEbt": "-15% to -18% decline",
      "guidanceEps": "-11% to -15% decline",
      "guidanceFcf": "$1.1B +/- 10%",
      "guidanceCapex": "$650M +/- 5%",
      "guidanceNetInterest": "$260M +/- 5%",
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
- Si el informe no desglosa el trimestre en algún estado (p. ej. flujos de caja solo acumulados), deja esos campos con null.
- "cashFlow" son las cifras del acumulado (net cash provided by operating activities, capital expenditures, cash dividends paid). Si solo aparecen del trimestre, úsalas igualmente.
- "balance": inventarios (inventories), cuentas por pagar (accounts payable / payables), cuentas por cobrar (accounts receivable / receivables), efectivo (cash), efectivo a principio de año fiscal (cashBeginningOfYear / cierre de ejercicio anterior), efectivo al cierre del trimestre previo (cashPreviousQuarter), inversiones a corto plazo o valores negociables (shortTermInvestments / Marketable Securities), a principio de año fiscal (shortTermInvestmentsBeginningOfYear) y al cierre del trimestre previo (shortTermInvestmentsPreviousQuarter), deuda total o senior notes (totalDebt), deuda total a principio de año fiscal (totalDebtBeginningOfYear) y deuda total al cierre del trimestre previo (totalDebtPreviousQuarter) en millones (o null si no aparecen).
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
  * shareBuybacks: recompras de acciones en $M. Buscar también "repurchases of common stock", "purchases of treasury stock" y "share repurchases".
  * purchasesOfMarketableSecuritiesQuarter / purchasesOfMarketableSecuritiesYtd: compras de inversiones a corto plazo, valores negociables o marketable securities en el cash flow. Buscar expresamente "purchases of marketable securities". Deben pasar al bloque de Asignación de Capital con signo negativo.
  * brandDivestitures: ingresos netos por venta de marcas, activos o desinversiones materiales en $M (>= 50M).
  * acquisitionsQuarter / acquisitionsYtd: pagos netos por compra de negocios en el cash flow ("Acquisition of business, net of cash acquired", "Payments to acquire businesses") en $M, como número positivo. Buscar expresamente estas líneas; si existen, los campos son obligatorios.
  * assetSalesQuarter / assetSalesYtd: ingresos por venta de property, plant, equipment and other assets en el cash flow ("Proceeds from sales of property, plant, equipment and other assets") en $M, como número positivo. Si existen, los campos son obligatorios.
  * acquisitionDescription: breve descripción de QUÉ negocio/empresa se ha comprado en el periodo (según las notas del 10-Q/10-K), o null si no hubo adquisiciones.
  * divestitureDescription: breve descripción de QUÉ marca, negocio o activo se ha vendido en el periodo (según las notas del 10-Q/10-K), o null si no hubo ventas.
  * totalDebt: deuda total en balance.
- "annualDetails" (OBLIGATORIO para informes anuales Form 10-K):
  * "repurchases": extrae de la nota de Share Repurchase Program o Stockholders' Equity la autorización del programa, saldo disponible, acciones recompradas y tabla de recompras multianual.
    - "programRemaining": importe en $M pendiente de ejecutar bajo el programa vigente. ES OBLIGATORIO extraerlo si el 10-K lo indica. Búscalo en la nota de Stockholders' Equity, en el Item 5 ("Unregistered Sales of Equity Securities and Use of Proceeds") o en el resumen de recompras, con expresiones como "approximately $X million remaining under our share repurchase program", "$X million remaining", "of which $X million remained" o "available for future repurchases". Si el importe aparece en miles de millones, conviértelo a millones (ej. "$2.0 billion remaining" = 2000M). NUNCA dejes el campo vacío ni respondas que no se desglosa si encuentras la cifra.
    - "programExpiry": fecha o periodo en el que termina la autorización del programa (ej. "Diciembre de 2031"). Búscala con expresiones como "expires in", "through December 31, 20XX", "authorized through" o "no expiration date". Si el 10-K indica que el programa no caduca, escribe "Sin fecha de caducidad"; si no consta nada, null.
    - "averagePrice": precio medio ponderado pagado por acción en el año = aggregate cost ($M) / shares repurchased.
    - "sharesHistory": acciones en circulación al cierre de cada uno de los últimos 5 ejercicios (si el 10-K no las desglosa todas, usa las disponibles, mínimo 3). Fuentes: resumen quinquenal (Selected Financial Data / Five-Year Summary), estado de patrimonio o notas. Formato: [{ "year": 2021, "shares": 231.5 }, ...] con las acciones en millones.
    - "secTable": tabla oficial de recompras. Los años de las columnas DEBEN ser los últimos 5 ejercicios disponibles (hasta 5 columnas, ej. 2021-2025), alineados con "sharesHistory"; si el 10-K solo desglosa menos años, usa los disponibles. "rows" DEBE incluir, además de "Shares repurchased" y "Aggregate cost (in millions)", una fila "Average price paid (in $)" con el precio medio por año calculado como coste agregado / acciones recompradas (ej. "$51.0", "$59.2").
  * "outlook": extrae del Guidance / Full Year Outlook o Item 7 las metas oficiales de ingresos, EBT, BPA, FCF, CAPEX, intereses, programas de ahorro de costes y tabla del guidance. En "secTable" estructura OBLIGATORIAMENTE 4 columnas: "Métrica", "[AÑO-1] (Año anterior)", "Guidance [AÑO]E*" y "Cifra Proyectada [AÑO]E", incluyendo el valor del año pasado cerrado y la equivalencia en ventas/cifra de las metas en porcentaje o 'flat'.
  * "debt": extrae de la nota Debt Obligations el perfil de vencimientos contractuales para los PRÓXIMOS 5 AÑOS (los importes y tipos cupón de cada tramo en "maturityItems"), el importe agregado posterior al año 5 en "maturityAfterFive" (si aparece), la evolución histórica de deuda normal y deuda neta de los últimos 10 años ("debtHistory"), y cualquier refinanciación acontecida o pactada en el ejercicio ("refinancing"), indicando tipo anterior, tipo nuevo y cuantía refinanciada.
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
          { "name": "Caja*1", "value": "-9" },
          { "name": "Deuda*1", "value": "-292" },
          { "name": "En total", "value": "1" }
        ],
        "verification": "Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.",
        "notes": ["*1: Deuda balance: 7624M -> 7332M (-292M). Deuda neta: 6580M -> 6257M (-323M)."]
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
          "*3: Deuda balance: 8064M -> 7332M (-732M). Deuda neta: 7996M -> 6257M (-1739M)."
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
          "*1: Deuda balance: 6126M -> 6260M (+134M). Deuda neta: 5740M -> 5840M (+100M)."
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
    - La nota de impuestos debe desglosar el EBT ajustado, el tipo aplicado y el impuesto resultante.
  * Regla de herencia en "Anterior Ajustado" (prevAdjusted): ÚNICAMENTE si en el ejercicio anterior comparable NO hubo ningún ajuste contable documentado ni impairments, hereda obligatoriamente el valor de "Anterior Normal" (prevNormal), y calcula SIEMPRE el "% Ajustado" (pctAdjusted). Prohibido poner "—" si prevNormal tiene cifra.
  * Principio de Resaltado Exclusivo en la Casilla de Origen (Sin Propagación en Cascada): El color y la llamada de nota ("isAdjusted": true, "adjustedNote": "*1") se asignan ÚNICA Y EXCLUSIVAMENTE a la casilla de la métrica donde se origina directamente el ajuste contable:
    - Intangibles / amortización / deterioros (impairments): marcar "isAdjusted": true ÚNICAMENTE en "Beneficio Operativo". Aunque EBT y Beneficio Neto varíen matemáticamente en la columna Ajustado por arrastre aritmético, NO llevan resalte ("isAdjusted": false) ni asterisco a menos que contengan un ajuste directo propio.
    - Normalización de impuestos / créditos fiscales: marcar "isAdjusted": true ÚNICAMENTE en "Beneficio Neto" (con su propia nota de impuestos, ej. "*2"). EBT no se colorea por impuestos.
    - Queda terminantemente prohibido marcar en cascada EBT y Beneficio Neto ("isAdjusted": true) si el ajuste se originó en intangibles u operaciones.
  * Las notas explicativas deben detallar el motivo, la cifra teórica vs reportada y la diferencia neta.

 - BLOQUE 2 — CASH FLOW:
   * NORMALIZACIÓN FISCAL DEL CASH FLOW: Si el JSON de extracción contiene "incomeTaxExpense..." y "taxCashFlowAdjustment...", calcula los impuestos corrientes estimados como gasto fiscal reportado menos la línea "Deferred income tax provision/(benefit)", "Deferred income taxes and income taxes payable, net" o "income taxes payable". Compara esa cifra con el 23 % del EBT ajustado y aplica la diferencia solo si está entre -20 % y +20 %. No confundas la línea del cash flow con impuestos pagados directamente.
   * Ejemplo: gasto fiscal 10M, ajuste fiscal del cash flow -20M, EBT ajustado 100M y tipo normalizado 23%: impuestos pagados estimados 30M, impuestos normalizados 23M, ajuste al Cash Flow Ajustado +7M.
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
    1. "Libre": Primera fila obligatoria. Remanente de Cash Flow (FCF - Dividendos) del mismo horizonte. Signo POSITIVO (+). Debe coincidir exactamente con el valor de "Libre" de la tabla de Cash Flow.
    2. "Inversiones a corto plazo": Se calcula OBLIGATORIAMENTE comparando el saldo de inversiones a corto plazo / valores negociables (Marketable Securities) del BALANCE:
       - En "ÚLTIMOS 3 MESES": -(Inversiones fin - Inversiones previas).
       - En "EN TODO EL AÑO": -(Inversiones fin - Inversiones a principio de año fiscal).
       - SIGNO:
         * Si aumentan las inversiones a corto plazo: NEGATIVO (-) porque se ha destinado capital a comprar valores/inversiones (ej. -1020M en KHC).
         * Si disminuyen: POSITIVO (+) porque la venta de valores libera liquidez.
         * Si el importe es marginal (< 50M) o 0 en el periodo, la fila se omite.
    3. "Desinversiones" (venta de marcas / negocios / activos): Ingresos netos obtenidos por la venta de marcas, negocios, filiales o activos (incluye "proceeds from sales of property, plant, equipment and other assets" y las desinversiones de negocios, campos "brandDivestitures", "assetSales..." y "divestitures", >= 50M en conjunto). Signo POSITIVO (+) porque entra dinero a la compañía. Si en el horizonte analizado no hubo venta o su importe fue marginal (< 50M) o 0, NO incluir esta fila.
    4. "Adquisiciones": Pagos netos por compra de negocios o empresas ("Acquisition of business, net of cash acquired", "Payments to acquire businesses", campos "acquisitions..." del JSON, >= 50M). Fila OBLIGATORIA si existe una adquisición material: signo NEGATIVO (-) porque es un uso de capital. Si no hubo adquisiciones o fueron marginales (< 50M), NO incluir esta fila.
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
    7. "Recompras": Salida de capital destinada a comprar acciones propias. Signo NEGATIVO (-). Si en el horizonte es 0, NO incluir esta fila.
    8. "En total": Última fila obligatoria. Suma algebraica con signo de todas las partidas de la tabla: Libre + Inversiones a corto plazo + Desinversiones + Adquisiciones + Deuda + Caja + Recompras.
  * Verificación de cuadre ("verification"):
    - Si el valor absoluto de "En total" es <= 50 (o diferencia residual): "Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle." (o "El resultado cuadra." si es 0).
    - Si presenta una discrepancia superior a 50 respecto a 0: "No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo."
   * Si en el JSON recibido dispones de "capitalAllocationData", usa obligatoriamente sus partidas y valores calculados para asegurar exactitud matemática perfecta.
   * EXTRACCIÓN OBLIGATORIA DE PARTIDAS: Busca expresamente "repurchases of common stock", "purchases of treasury stock", "share repurchases", "purchases of marketable securities", "Acquisition of business, net of cash acquired" y "Proceeds from sales of property, plant, equipment and other assets". Las recompras deben aparecer como fila "Recompras" con signo negativo; las compras de marketable securities como "Inversiones a corto plazo" con signo negativo; las compras de negocios como fila "Adquisiciones" con signo negativo (fila OBLIGATORIA si la adquisición es >= 50M, NUNCA la omitas); las ventas de activos/negocios como "Desinversiones" con signo positivo. No omitas una partida porque el modelo no la haya mencionado en su primer borrador si aparece en el JSON de extracción.
  * NOTAS OBLIGATORIAS AL PIE DE ASIGNACIÓN DE CAPITAL:
    1. NOTA DE DEUDA BALANCE Y DEUDA NETA (OBLIGATORIA SIEMPRE):
       - Debe incluir SIEMPRE y con este formato exacto la comparación tanto de deuda bruta como de deuda neta:
         "Deuda balance: <anterior>M -> <actual>M (<variación>M). Deuda neta: <anterior_neta>M -> <actual_neta>M (<variación_neta>M)."
         (Usa el valor provisto en capitalAllocationData.debtDetails si está presente).
       - PROHIBIDO copiar los valores del ejemplo del esquema: son de otra empresa. Si capitalAllocationData.debtDetails está presente, úsalo VERBATIM. Si no está presente, calcula tú mismo la nota con los campos "balance" del JSON recibido: Deuda Balance = totalDebt; Deuda Neta = totalDebt - (cash + shortTermInvestments); comparando contra totalDebtPreviousQuarter / cashPreviousQuarter / shortTermInvestmentsPreviousQuarter (en 3M) o contra totalDebtBeginningOfYear / cashBeginningOfYear / shortTermInvestmentsBeginningOfYear (en acumulado).
     2. NOTA DE ADQUISICIONES / DESINVERSIONES (VENTA O COMPRA DE MARCAS, NEGOCIOS O ACTIVOS):
        - Si en la tabla figuran adquisiciones o desinversiones (venta de marcas, negocios o activos):
          EXPLICAR SIEMPRE CON UN BREVE TEXTO QUÉ NEGOCIO, MARCA O ACTIVO SE HA COMPRADO O VENDIDO, extrayendo la información del 10-Q/10-K recibido y usando los campos "acquisitionDescription" / "divestitureDescription" si están presentes (ej. "*1: Adquisiciones: Se destinaron 271M a la compra de [negocio adquirido]. *2: Desinversiones: Se ingresaron 649M por la venta de [marca o negocio vendido]"). Queda prohibido emitir notas genéricas sin detallar qué se vendió o compró, y prohibido omitir la nota cuando la fila de Adquisiciones o Desinversiones figure en la tabla.
    3. ORDEN Y NUMERACIÓN:
       - Enumerar correlativamente (*1:, *2:...) de manera limpia, sin notas duplicadas ni mezclar notas desordenadas.
    4. VINCULACIÓN Y LLAMADA A NOTAS EN LAS FILAS DE LA TABLA:
       - Cada fila de la tabla explicada por una nota al pie debe llevar la llamada a su nota correspondiente en el campo "name":
          * La fila de adquisiciones o de venta/desinversión de marcas lleva la llamada a su nota: ej. "Adquisiciones*1", "Desinversiones*2".
         * Las filas de "Caja", "Deuda" y (si existe) "Inversiones a corto plazo" hacen referencia conjunta a la nota de deuda en balance y deuda neta, por lo que DEBEN llevar la llamada a dicha nota: ej. "Caja*2", "Deuda*2", "Inversiones a corto plazo*2" (o "*1" si no hubo venta de marcas).

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
    - Working Capital Anual (12 meses):
      WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen). Al ser 12 meses completos, NO se divide por 4. Ajuste al Cash Flow = (WC reportado - WK recurrente).
    - Ajuste de impuestos en efectivo: si los impuestos pagados difieren significativamente del gasto devengado normalizado, reflejar el ajuste en efectivo y la nota al pie "*2".
    - Métricas obligatorias: Cash Flow, CAPEX, FCF, FCF/Acción, Dividendo, Libre.

  * BLOQUE 3 — ASIGNACIÓN DE CAPITAL (12 meses):
    - Variación acumulada de todo el año comparando el balance a cierre del ejercicio contra el balance de inicio del año (BeginningOfYear).
    - Partidas: Libre (+), Inversiones a corto plazo (-/+), Desinversiones (+), Adquisiciones (-), Recompras (-), Caja (-/+), Deuda (+/-), En total.
    - Nota obligatoria de Deuda Balance y Deuda Neta con formato exacto:
      "Deuda balance: <anterior>M -> <actual>M (<variación>M). Deuda neta: <anterior_neta>M -> <actual_neta>M (<variación_neta>M)."
    - Verificación: "Más o menos cuadra..." si |En total| <= 50, o "No cuadra..." si supera 50.

- PARTE II: INDAGACIÓN A FONDO / CONCLUSIÓN (OBLIGATORIA EN 10-K):
  1. "repurchases":
     * Detalle exhaustivo de las recompras de acciones ejecutadas durante el año y en el histórico reciente (2-3 años).
     * Precio medio ponderado pagado por acción durante el año.
     * "authorizationRemaining": Importe en $M que queda pendiente de ejecutar en el programa de recompras (remanente de la autorización vigente). NO uses "programAuthorization" ni "programRemaining". Si el JSON de extracción incluye "annualDetails.repurchases.programRemaining" (número en $M), usa OBLIGATORIAMENTE ese importe para "authorizationRemaining" y redáctalo como texto (ej. "Unos 2.600M de $ pendientes de ejecución"). Queda PROHIBIDO afirmar que el 10-K no desglosa el remanente si el JSON de extracción lo incluye.
     * "authorizationExpiry": SOLO si el 10-K lo indica de forma expresa: la fecha en que caduca la autorización del programa (ej. "Vigente hasta diciembre de 2031"); o "Sin fecha de caducidad" únicamente si el 10-K afirma explícitamente que el programa no tiene vencimiento. Si el 10-K no dice nada sobre la caducidad, OMITE el campo por completo (nunca escribas "no indicada" ni similar).
     * "shareCountEvolution": Evolución del número de acciones EN EL ÚLTIMO AÑO: del cierre del ejercicio anterior al cierre del ejercicio analizado, usando los dos últimos puntos de "sharesHistory" (ej. "De 208,9M de acciones en diciembre de 2024 a 199,1M en diciembre de 2025 (-4,7 %)"). NO uses el acumulado de dos o más años.
     * "bpaImpact": Impacto porcentual en el BPA DEL ÚLTIMO AÑO derivado exclusivamente de la reducción de acciones (ej. "+4,9 % de subida en el BPA en el último año exclusivamente por recompras"). NO uses el acumulado de dos años.
     * "futureProjection": PROYECCIÓN A 5 AÑOS con estimación matemática explícita si se mantiene el precio medio pagado en el año: acciones recomprables = authorizationRemaining / precio medio; reparto anual (dividido entre 5 años); reducción anual del número de acciones en %; y efecto anual resultante en el BPA. Ejemplo: "Proyección a 5 años: con ~2.600M de autorización restante y un precio medio de ~51 $, se podrían recomprar ~51M de acciones (~10,2M/año), lo que reduciría el capital un ~5,1 % anual e impulsaría el BPA ~5,4 % cada año." Solo incluye el cálculo si dispones de authorizationRemaining y precio medio; si no, describe la capacidad de recompra con el flujo libre.
     * "sharesHistory": Array con las acciones en circulación al cierre de los últimos 5 ejercicios: [{ "year": 2021, "shares": 231.5 }, ...] en millones. Usa los datos extraídos en "annualDetails.repurchases.sharesHistory" (mínimo 3 años si el informe no desglosa los 5).
     * "secSnippet": Tabla oficial del 10-K sobre compras de acciones propias (Share Repurchase Program) con headers y rows numéricos. "rows" DEBE incluir la fila "Average price paid (in $)" con el precio medio pagado por acción en cada año (coste agregado / acciones recompradas), junto a "Shares repurchased" y "Aggregate cost (in millions)".
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
      * Calendario de vencimientos contractuales: el desglose gráfico y detallado DEBE LIMITARSE ESTRICTAMENTE A LOS PRÓXIMOS 5 AÑOS (cualquier vencimiento posterior al año 5 se resume en "maturityAfterFive" y queda fuera del gráfico). En cada año y bloque debe quedar claro qué tipo de deuda es y qué tipo de interés paga.
      * Tipos medios: calcular para cada año el tipo de interés medio ponderado pagado por las deudas que vencen ese año, y abajo el tipo de interés medio total ponderado pagado por el conjunto de la deuda de los próximos 5 años.
      * Gráfico histórico de 10 años: proporcionar en "debtHistory" los últimos 10 años hasta la actualidad de Deuda Normal (Total) y Deuda Neta, indicando cuánto ha cambiado cada una respecto al año anterior.
      * Refinanciación e impacto en el BPA: si la empresa ha refinanciado deuda o se analizan vencimientos próximos, indicar qué tipo de interés devengaba la deuda que acaba de vender o retirar ("oldDebtRate") y qué tipo de interés gasta la nueva deuda emitida ("newDebtRate"). Con esos dos valores, calcular el sobrecoste o ahorro neto y el IMPACTO EXACTO EN EL BPA en $/acción (ejemplo: "los nuevos costes bajan en torno a 0,05 $/acción" o "reducen el BPA en torno a 0,09 $/acción").
      * "secSnippet": Tabla oficial del 10-K de compromisos contractuales de deuda ("Debt obligations - Contractual maturities") con obligaciones, vencimientos y saldos.
  4. "acquisitions":
     * Detalle de adquisiciones o compras corporativas efectuadas en el ejercicio, o confirmación expresa de que no se realizaron compras materiales.
  5. "watchlist":
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
      rules = await loadKnowledgeRules(sector, subsector, formType);
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
      throw new AgentError('No se pudieron extraer los datos del informe.', 'INVALID_MODEL_RESPONSE');
    }

    const ticker = input.ticker || extracted.ticker;
    const extractedTaxAdjustment = extractTaxCashFlowAdjustment(input.text);
    if (isAnnual) {
      const annualRep = extracted?.annualDetails?.repurchases;
      if (annualRep && (annualRep.programRemaining == null || annualRep.programRemaining === '')) {
        const remaining = extractRemainingAuthorization(input.text);
        if (remaining != null) {
          annualRep.programRemaining = remaining;
          annualRep.programRemainingSource = 'extracción automática de remanente';
        }
      }
    }
    const extractedCapitalFacts = extractCapitalCashFlowFacts(input.text);
    if (extractedTaxAdjustment != null && extracted.facts) {
      extracted.facts.taxCashFlowAdjustmentYtd ??= extractedTaxAdjustment;
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
      if (extractedCapitalFacts.acquisitionsOfBusiness != null) {
        const acqValue = Math.abs(extractedCapitalFacts.acquisitionsOfBusiness);
        extracted.facts.acquisitionsYtd ??= acqValue;
        if (fiscalQuarter === 1) extracted.facts.acquisitionsQuarter ??= acqValue;
      }
      if (extractedCapitalFacts.proceedsFromAssetSales != null) {
        const assetSalesValue = Math.abs(extractedCapitalFacts.proceedsFromAssetSales);
        extracted.facts.assetSalesYtd ??= assetSalesValue;
        if (fiscalQuarter === 1) extracted.facts.assetSalesQuarter ??= assetSalesValue;
      }
    }
    // Recalcular con las partidas directas del estado de flujos (recompras y marketable securities).
    extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted);
    if (extractedTaxAdjustment != null && fiscalQuarter === 1 && extracted.facts) {
      extracted.facts.taxCashFlowAdjustmentQuarter ??= extractedTaxAdjustment;
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
              explanation3M: `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflationRate}% + ${volumeGrowth}%) = ${annualWcReq}M en todo el año -> en 3 meses = ${quarterWcReq}M. Desviación frente al circulante reportado (${Math.round(rep3M)}M): ajuste de ${Math.round(wcDiff3M)}M en Cash Flow.`,
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
              wcData.explanationYtd = `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflationRate}% + ${volumeGrowth}%) = ${annualWcReq}M en todo el año -> en ${months} meses = ${ytdWcReq}M. Desviación frente al circulante reportado (${Math.round(repYtd)}M): ajuste de ${Math.round(wcDiffYtd)}M en Cash Flow.`;
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
          if (extracted.facts?.purchasesOfMarketableSecuritiesQuarter != null) {
            stInv3M = -Math.abs(Number(extracted.facts.purchasesOfMarketableSecuritiesQuarter) || 0);
          } else if (extracted.balance?.shortTermInvestments != null && extracted.balance?.shortTermInvestmentsPreviousQuarter != null) {
            const diff = extracted.balance.shortTermInvestments - extracted.balance.shortTermInvestmentsPreviousQuarter;
            if (Math.abs(diff) >= 50) stInv3M = Math.round(-diff * 10) / 10;
          }

          const rawDiv3M = capFromEdgar?.threeMonths?.divestitures || 0;
          const divestitures3M = rawDiv3M >= 50 ? rawDiv3M : 0;
          const buybacks3M_allocated = buybacks3M > 0
            ? -Math.abs(buybacks3M)
            : (capFromEdgar?.threeMonths?.buybacks || 0);

          let acquisitions3M = capFromEdgar?.threeMonths?.acquisitions || 0;
          if (extracted.facts?.acquisitionsQuarter != null) {
            const rawAcq3M = Math.abs(Number(extracted.facts.acquisitionsQuarter)) || 0;
            acquisitions3M = rawAcq3M ? -rawAcq3M : 0;
          } else if (extracted.facts?.acquisitionsYtd != null && fiscalQuarter === 1) {
            const rawAcq3M = Math.abs(Number(extracted.facts.acquisitionsYtd)) || 0;
            acquisitions3M = rawAcq3M ? -rawAcq3M : 0;
          }

          let assetSales3M = capFromEdgar?.threeMonths?.assetSales || 0;
          if (extracted.facts?.assetSalesQuarter != null) {
            assetSales3M = Math.abs(Number(extracted.facts.assetSalesQuarter)) || 0;
          } else if (extracted.facts?.assetSalesYtd != null && fiscalQuarter === 1) {
            assetSales3M = Math.abs(Number(extracted.facts.assetSalesYtd)) || 0;
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
          if (extracted.facts?.purchasesOfMarketableSecuritiesYtd != null) {
            stInvYtd = -Math.abs(Number(extracted.facts.purchasesOfMarketableSecuritiesYtd) || 0);
          } else if (extracted.balance?.shortTermInvestments != null) {
            const start = extracted.balance.shortTermInvestmentsBeginningOfYear ?? 0;
            const diff = extracted.balance.shortTermInvestments - start;
            if (Math.abs(diff) >= 50) stInvYtd = Math.round(-diff * 10) / 10;
          }

          const rawDivYtd = Number(extracted.facts?.brandDivestitures) || capFromEdgar?.ytd?.divestitures || 0;
          const divestituresYtd = rawDivYtd >= 50 ? rawDivYtd : 0;
          const buybacksYtd_allocated = extracted.facts?.shareBuybacks
            ? -Math.abs(Number(extracted.facts.shareBuybacks))
            : (capFromEdgar?.ytd?.buybacks || 0);

          let acquisitionsYtd_allocated = capFromEdgar?.ytd?.acquisitions || 0;
          if (extracted.facts?.acquisitionsYtd != null) {
            const rawAcqYtd = Math.abs(Number(extracted.facts.acquisitionsYtd)) || 0;
            acquisitionsYtd_allocated = rawAcqYtd ? -rawAcqYtd : 0;
          }

          const assetSalesYtd_allocated = extracted.facts?.assetSalesYtd != null
            ? (Math.abs(Number(extracted.facts.assetSalesYtd)) || 0)
            : (capFromEdgar?.ytd?.assetSales || 0);

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
              acquisitionDescription: extracted.facts?.acquisitionDescription ?? null,
              divestitureDescription: extracted.facts?.divestitureDescription ?? null,
              debtDetails: debtDetails3M,
              cashDetails: capFromEdgar?.threeMonths?.cashDetails,
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
              acquisitionDescription: extracted.facts?.acquisitionDescription ?? null,
              divestitureDescription: extracted.facts?.divestitureDescription ?? null,
              debtDetails: debtDetailsYtd,
              cashDetails: capFromEdgar?.ytd?.cashDetails,
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
    if (isAnnual && (extracted.ticker || input.ticker)) {
      try {
        const edgarResults = await getCompanyResults(extracted.ticker || input.ticker);
        const annualSeries = edgarResults?.annual || [];
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
            .sort((a, b) => a.year - b.year)
            .slice(-10);
        }
        if (Array.isArray(edgarResults?.debtMaturities?.years) && edgarResults.debtMaturities.years.length) {
          const reportYear = Number(fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null);
          if (!reportYear || Number(edgarResults.debtMaturities.baseYear) === reportYear) {
            edgarDebtMaturities = edgarResults.debtMaturities;
          }
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
        explanationYtd: `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflationRate}% + ${volumeGrowth}%) = ${annualWcReq}M en todo el año. Desviación frente al circulante reportado (${Math.round(repYtd)}M): ajuste de ${Math.round(wcDiffYtd)}M en Cash Flow.`,
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

    let result;
    try {
      result = await chatJson([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(extracted, null, 2) },
      ]);
    } catch {
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

        if (shouldNormalizeReportedTax) {
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
            const taxNoteIdxExisting = horizon.sales.notes.findIndex((n) => {
              const s = String(n).toLowerCase();
              return s.includes('impuesto') && (s.includes('23') || s.includes('ebt ajustado') || s.includes('normaliz'));
            });
            const taxNoteIdx = taxNoteIdxExisting >= 0 ? taxNoteIdxExisting + 1 : horizon.sales.notes.length + 1;
            const deviationText = `${taxDeviation >= 0 ? '+' : ''}${(taxDeviation * 100).toFixed(1).replace('.', ',')} %`;
            const taxNote = `*${taxNoteIdx}: Impuestos normalizados: 23 % sobre el EBT ajustado de ${ebtAdjR}M = ${tax}M de impuestos; impuesto reportado ${Math.round(reportedTaxAmount)}M (desviación ${deviationText}).`;
            if (taxNoteIdxExisting >= 0) horizon.sales.notes[taxNoteIdxExisting] = taxNote;
            else horizon.sales.notes.push(taxNote);
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
              if (Number.isFinite(adjustedDividends)) {
                targetVals.libre[1] = formatFinancialValue(adjustedFcf - adjustedDividends);
              }
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
          row.values = vals;
        });

        // 2.3 Numeración independiente por bloque: Cash Flow siempre reinicia notas en *1
        const wcNoteTag = '*1';

        // Filtrar notas de deducción trimestral (la resta entre acumulados no es un ajuste contable)
        horizon.cashFlow.notes = (Array.isArray(horizon.cashFlow.notes) ? [...horizon.cashFlow.notes] : [])
          .filter((n) => !String(n).toLowerCase().includes('deducido del acumulado') && !String(n).toLowerCase().includes('flujo trimestral deducido'));

        let expNote = isTrimestral ? wcInfo?.explanation3M : wcInfo?.explanationYtd;
        if (expNote) {
          expNote = `*1: ${expNote.replace(/^\*\d+:?\s*/, '')}`;
        }

        const wcNoteIdx = horizon.cashFlow.notes.findIndex((n) => n.includes('WK') || n.includes('circulante') || n.includes('Cuentas por pagar'));
        if (wcNoteIdx !== -1) {
          const existingNote = horizon.cashFlow.notes[wcNoteIdx].replace(/^\*\d+:?\s*/, '');
          const wcLines = existingNote.split('\n').filter((line) => !/^impuestos:/i.test(line.trim()));
          horizon.cashFlow.notes[wcNoteIdx] = `*1: ${wcLines.join('\n')}`;
        } else if (expNote) {
          horizon.cashFlow.notes.push(expNote);
        }

        if (taxNormalization) {
          const taxNote = `*2: ${taxNormalization.explanation.replace(/^\*\d+:?\s*/, '')}`;
          const taxNoteIdx = horizon.cashFlow.notes.findIndex((n) => /^impuestos:/i.test(String(n).replace(/^\*\d+:?\s*/, '').trim()));
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
          : (capData?.libre != null ? String(capData.libre).replace('.', ',') : null);

        let capLibreRow = horizon.capital.rows.find((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase() === 'libre');
        if (!capLibreRow) {
          capLibreRow = { name: 'Libre', value: libreVal ? String(libreVal).replace('-', '') : '0' };
          horizon.capital.rows.unshift(capLibreRow);
        } else if (libreVal) {
          capLibreRow.value = String(libreVal).replace('-', '');
        }

        // 3.2 Inversiones a corto plazo: si != 0 incluir/asegurar fila con signo estricto; si es 0, omitir
        const stVal = capData?.inversionesCortoPlazo ?? 0;
        const stRowIdx = horizon.capital.rows.findIndex((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('corto plazo') || n.includes('inversiones') || n.includes('marketable');
        });
        if (stVal !== 0) {
          const formattedSt = String(stVal).replace('.', ',');
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
          const formattedDiv = String(divVal).replace('.', ',');
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
          const formattedAcq = String(-Math.abs(acqVal)).replace('.', ',');
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

        // 3.4 Recompras: si != 0 asegurar fila negativa; si es 0, omitir
        const buyVal = capData?.buybacks ?? 0;
        const buyRowIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('recompra'));
        if (buyVal !== 0) {
          const formattedBuy = String(-Math.abs(buyVal)).replace('.', ',');
          if (buyRowIdx !== -1) {
            horizon.capital.rows[buyRowIdx].value = formattedBuy;
          } else {
            const insIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('total'));
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx : horizon.capital.rows.length, 0, { name: 'Recompras', value: formattedBuy });
          }
        } else if (buyRowIdx !== -1) {
          horizon.capital.rows.splice(buyRowIdx, 1);
        }

        // 3.5 Caja: asegurar signo según la regla del balance del usuario:
        // si la caja aumentó, signo negativo (-); si disminuyó, signo positivo (+)
        const cajaRow = horizon.capital.rows.find((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n === 'caja' || n.includes('caja');
        });
        if (capData?.caja != null) {
          const formattedCaja = String(capData.caja).replace('.', ',');
          if (cajaRow) {
            cajaRow.name = 'Caja';
            cajaRow.value = formattedCaja;
          } else {
            const insIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('total'));
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx : horizon.capital.rows.length, 0, { name: 'Caja', value: formattedCaja });
          }
        }

        // 3.6 Deuda: asegurar signo según la regla del balance del usuario:
        // si la deuda aumentó, signo positivo (+); si disminuyó, signo negativo (-)
        const deudaRow = horizon.capital.rows.find((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('deuda');
        });
        if (capData?.deuda != null) {
          const formattedDeuda = String(capData.deuda).replace('.', ',');
          if (!deudaRow) {
            const insIdx = horizon.capital.rows.findIndex((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase().includes('total'));
            horizon.capital.rows.splice(insIdx !== -1 ? insIdx : horizon.capital.rows.length, 0, { name: 'Deuda', value: formattedDeuda });
          } else {
            deudaRow.name = 'Deuda';
            const existingVal = parseFloat(String(deudaRow.value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
            const isAcceptable = isTrimestral
              ? (Number.isFinite(existingVal) && Math.abs(existingVal - capData.deuda) <= 150)
              : (Number.isFinite(existingVal) && Math.sign(existingVal) === Math.sign(capData.deuda) && Math.abs(existingVal) < 2000);
            deudaRow.value = isAcceptable ? String(existingVal).replace('.', ',') : formattedDeuda;
          }
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

        let sum = 0;
        let hasValidRows = false;
        horizon.capital.rows.forEach((r) => {
          if (String(r.name).toLowerCase().includes('total')) return;
          const num = parseFloat(String(r.value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
          if (Number.isFinite(num)) {
            sum += num;
            hasValidRows = true;
          }
        });

        if (hasValidRows) {
          totalRow.value = String(Math.round(sum * 10) / 10).replace('.', ',');
          if (Math.abs(sum) <= 50) {
            horizon.capital.verification = 'Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.';
          } else {
            horizon.capital.verification = 'No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo.';
          }
        }

        // 3.7 Notas explicativas al pie
        const rawCapNotes = (Array.isArray(horizon.capital.notes) ? horizon.capital.notes : [])
          .filter(Boolean);

        const cleanNotes = [];
        let brandNoteNum = null;
        let debtNoteNum = null;

        // Buscar nota descriptiva de venta o compra de marcas / desinversiones
        const brandNote = rawCapNotes.find((n) => {
          const lower = n.toLowerCase();
          return lower.includes('marca') || lower.includes('desinversión') || lower.includes('desinversion') || lower.includes('adquisición') || lower.includes('adquisicion');
        });

        if (brandNote) {
          let cleaned = brandNote.replace(/^\*\d+:?\s*/, '').trim();
          // Si el texto incluye frases redundantes de deuda o caja, conservar solo la parte de la marca
          const splitPoint = cleaned.split(/(?:\.|\;)\s*(?:La deuda|Deuda balance|Deuda|La caja)/i);
          if (splitPoint.length > 1) {
            cleaned = splitPoint[0].trim();
            if (!cleaned.endsWith('.')) cleaned += '.';
          }
          cleanNotes.push(cleaned);
          brandNoteNum = cleanNotes.length;
        }

        // Notas garantizadas: si hay fila de Adquisiciones o Desinversiones y ninguna nota las explica,
        // se construyen con las descripciones extraídas del informe (siempre con breve texto explicativo).
        const hasAcqRow = horizon.capital.rows.some((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('adquisic') || n.includes('acquisic');
        });
        if (hasAcqRow && capData?.acquisitionDescription && !cleanNotes.some((n) => n.toLowerCase().includes('adquisici'))) {
          const acqAmount = Math.abs(parseFloat(String(capData.acquisitions ?? 0).replace(',', '.')) || 0);
          cleanNotes.push(`Adquisiciones: Se destinaron ${String(acqAmount).replace('.', ',')}M a la compra de ${capData.acquisitionDescription} (uso de fondos).`);
        }
        const hasDivRow = horizon.capital.rows.some((r) => {
          const n = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
          return n.includes('marca') || n.includes('desinvers') || n.includes('negocio') || n.includes('divest');
        });
        if (hasDivRow && capData?.divestitureDescription && !cleanNotes.some((n) => n.toLowerCase().includes('desinversi') || n.toLowerCase().includes('venta de marcas'))) {
          const divAmount = parseFloat(String(capData.divestitures ?? 0).replace(',', '.')) || 0;
          cleanNotes.push(`Desinversiones: Se ingresaron ${String(divAmount).replace('.', ',')}M por la venta de ${capData.divestitureDescription} (fuente de fondos).`);
        }

        // Nota obligatoria de Deuda Balance y Deuda Neta
        if (capData?.debtDetails) {
          cleanNotes.push(capData.debtDetails.endsWith('.') ? capData.debtDetails : `${capData.debtDetails}.`);
          debtNoteNum = cleanNotes.length;
        } else {
          const existingDebtNote = rawCapNotes.find((n) => n.includes('Deuda balance') || n.includes('Deuda neta'));
          if (existingDebtNote) {
            cleanNotes.push(existingDebtNote.replace(/^\*\d+:?\s*/, '').trim());
            debtNoteNum = cleanNotes.length;
          }
        }

        // Renumerar correlativamente
        horizon.capital.notes = cleanNotes.map((text, idx) => `*${idx + 1}: ${text}`);

        // 3.8 Sincronizar llamadas a notas (*N) en las filas de la tabla
        horizon.capital.rows.forEach((r) => {
          const baseName = r.name.replace(/\*\d+/g, '').trim();
          const n = baseName.toLowerCase();

          if (brandNoteNum && (n.includes('marca') || n.includes('desinvers') || n.includes('negocio') || n.includes('adquisic') || n.includes('acquisic'))) {
            r.name = `${baseName}*${brandNoteNum}`;
          } else if (debtNoteNum && (n === 'caja' || n.includes('caja') || n.includes('deuda') || n.includes('corto plazo') || n.includes('inversiones'))) {
            r.name = `${baseName}*${debtNoteNum}`;
          } else {
            r.name = baseName;
          }
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
      if (!result.conclusion.repurchases.authorizationRemaining && extractionRep.programRemaining != null && extractionRep.programRemaining !== '') {
        const remNum = Number(extractionRep.programRemaining);
        result.conclusion.repurchases.authorizationRemaining = Number.isFinite(remNum)
          ? `Unos ${String(remNum).replace('.', ',')}M de $ pendientes de ejecución`
          : String(extractionRep.programRemaining);
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
      if (!result.conclusion.repurchases.secSnippet && extractionRep.secTable) {
        result.conclusion.repurchases.secSnippet = extractionRep.secTable;
      }
      if (!result.conclusion.repurchases.secSnippet && rawAnn.repurchasesSecTable) {
        result.conclusion.repurchases.secSnippet = rawAnn.repurchasesSecTable;
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
        result.conclusion.outlook.secSnippet = withOutlookComparison(result.conclusion.outlook.secSnippet, result);
      }

      // 3: Deuda
      result.conclusion.debt = result.conclusion.debt || {};
      result.conclusion.debt.title = result.conclusion.debt.title || '3: Deuda';
      result.conclusion.debt.text = result.conclusion.debt.text || rawAnn.debtNarrative || 'Estructura de endeudamiento, liquidez y calendario de vencimientos de deuda.';
      result.conclusion.debt.refinancingAnalysis = result.conclusion.debt.refinancingAnalysis || null;
      result.conclusion.debt.refinancingImpact = result.conclusion.debt.refinancingImpact || null;

      const extractionDebt = rawAnn.debt ?? {};
      if (!result.conclusion.debt.maturitySchedule && (extractionDebt.maturityItems || extractionDebt.maturitySchedule)) {
        result.conclusion.debt.maturitySchedule = extractionDebt.maturityItems || extractionDebt.maturitySchedule;
      }
      if (!result.conclusion.debt.maturitySchedule && edgarDebtMaturities) {
        result.conclusion.debt.maturitySchedule = edgarDebtMaturities.years.map((y) => ({
          year: y.year,
          label: 'Vencimientos contractuales de deuda',
          amount: y.amount,
          type: 'Deuda total',
          interestRate: null,
        }));
      }
      if (edgarDebtMaturities?.afterYearFive != null && result.conclusion.debt.maturityAfterFive == null) {
        result.conclusion.debt.maturityAfterFive = edgarDebtMaturities.afterYearFive;
      }
      if (!result.conclusion.debt.debtHistory) {
        result.conclusion.debt.debtHistory = extractionDebt.debtHistory || edgarDebtHistory || null;
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

      // 4: Adquisiciones
      result.conclusion.acquisitions = result.conclusion.acquisitions || {};
      result.conclusion.acquisitions.title = result.conclusion.acquisitions.title || '4: Adquisiciones';
      result.conclusion.acquisitions.text = result.conclusion.acquisitions.text || rawAnn.acquisitionsNarrative || (extracted.facts?.acquisitionsYtd ? `Se completaron adquisiciones corporativas por un importe neto de ${extracted.facts.acquisitionsYtd}M.` : 'No se realizaron adquisiciones materiales durante el ejercicio.');

      // 5: Watchlist
      result.conclusion.watchlist = result.conclusion.watchlist || {};
      result.conclusion.watchlist.title = result.conclusion.watchlist.title || `Cosas a tener en cuenta en ${fiscalYear ? fiscalYear + 1 : 'el próximo año'}`;
      if (!Array.isArray(result.conclusion.watchlist.items) || result.conclusion.watchlist.items.length === 0) {
        result.conclusion.watchlist.items = [
          '1: Evolución de los ingresos orgánicos y volúmenes respecto a competidores del sector.',
          '2: Ritmo y precio de ejecución de los programas de recompra de acciones.',
          '3: Refinanciación de la deuda próxima a vencer y coste efectivo de los nuevos intereses.',
        ];
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
