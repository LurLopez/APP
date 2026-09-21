/**
 * @fileoverview Módulo extraído de financialParsers.js.
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
  const match = source.match(/(?:Deferred income taxes and income taxes payable,?\s+net|Deferred income tax(?:es)?\s+provision\s*\/\s*\(benefit\)|Deferred income tax(?:es)?\s+provision\s*\(benefit\)|Deferred income tax(?:es)?\s+expense\s*\(benefit\)|Deferred income tax(?:es)?\s*\(benefit\)\s*expense|Deferred income tax(?:es)?|Deferred taxes)\s+([()\d.,-]+)(?:\s+([()\d.,-]+))?/i)
    || source.match(/(?:Deferred income taxes and other|Deferred taxes and other|Deferred income taxes, net|Deferred income tax)\s+([()\d.,-]+)(?:\s+([()\d.,-]+))?/i)
    || source.match(/(?:Deferred income tax(?:es)?\s*\(benefit\))\s+([()\d.,-]+)/i);
  if (!match) return null;
  const current = parseFinancialValue(match[1]);
  return Number.isFinite(current) ? current : null;
}

/** Una columna de años (2026, 2025…) de la cabecera de una tabla no es un importe de impuestos. */
function looksLikeYearHeader(raw) {
  if (!/^\d{4}$/.test(String(raw ?? '').trim())) return false;
  const year = Number(raw);
  return Number.isInteger(year) && year >= 1900 && year <= 2100;
}

export function extractIncomeTaxesPaid(text) {
  const source = String(text ?? '');
  // Tablas de divulgación con columna por ejercicio (ASU 2023-09): se toma la fila "Total" de la
  // misma tabla porque las primeras cifras tras el encabezado son los años y no el importe pagado.
  const tableMatch = source.match(/Income tax(?:es)?[^\n]{0,60}net of refunds[\s\S]{0,1500}?(?:^|\n)\s*Total[^\d()]{0,15}\$?\s*([()\d.,-]+)/i)
    || source.match(/Income tax(?:es)?[^\n]{0,60}paid[\s\S]{0,600}?(?:^|\n)\s*Total[^\d()]{0,15}\$?\s*([()\d.,-]+)/i);
  if (tableMatch && !looksLikeYearHeader(tableMatch[1])) {
    const tableVal = parseFinancialValue(tableMatch[1]);
    if (Number.isFinite(tableVal)) return Math.abs(tableVal);
  }
  const directMatch = source.match(/(?:Income tax(?:es)?\s*(?:\(paid\)\s*received|\(paid\)|\(net of refunds\)|paid))\s+([()\d.,-]+)(?:\s+([()\d.,-]+))?/i)
    || source.match(/(?:Total net cash income taxes paid|Net cash paid for income taxes)\s+\$?\s*([()\d.,-]+)/i)
    || source.match(/Cash paid[^\n]{0,60}for income taxes[^\d()]*([()\d.,-]+)/i)
    || source.match(/(?:Income taxes paid,?\s+net|Net income taxes paid|Cash paid during the (?:year|period) for income taxes)[^\d()]*([()\d.,-]+)/i)
    || source.match(/Income taxes[^\n]{0,40}paid[^\d()]*([()\d.,-]+)/i);
  if (directMatch && !looksLikeYearHeader(directMatch[1])) {
    const val = parseFinancialValue(directMatch[1]);
    if (Number.isFinite(val)) return Math.abs(val);
  }
  return null;
}

export function extractStockCompensation(text) {
  const source = String(text ?? '');
  const match = source.match(/(?:Stock-based|Share-based)\s+compensation(?:\s+(?:expense|cost|charges))?[^\d()]{0,40}([()\d.,-]+)/i)
    || source.match(/(?:Share-based|Stock-based)\s+payments?[^\d()]{0,40}([()\d.,-]+)/i);
  if (!match) return null;
  const val = parseFinancialValue(match[1]);
  return Number.isFinite(val) ? Math.abs(val) : null;
}

export function extractCapitalCashFlowFacts(text) {
  const source = String(text);
  const readFirstValue = (pattern) => {
    const match = source.match(pattern);
    return match ? parseFinancialValue(match[1]) : null;
  };
  // El estado de flujos puede publicar una única línea conjunta ("Proceeds from sales and
  // maturities of marketable securities") o separar ventas y vencimientos en dos líneas
  // (habitual en NVIDIA). Se suman las dos cuando van por separado para no perder el neto.
  const readMarketableProceeds = () => {
    const combined = readFirstValue(/Proceeds from (?:sales? and maturit(?:y|ies)|maturit(?:y|ies) and sales?) of (?:marketable securities|investments|available-for-sale securities)\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Maturities and sales of (?:marketable securities|investments|available-for-sale securities)\s+([()\d.,-]+)/i);
    if (combined != null) return combined;
    const sales = readFirstValue(/Proceeds from sale(?:s)? of (?:marketable securities|investments|available-for-sale securities)\s+([()\d.,-]+)/i);
    const maturities = readFirstValue(/Proceeds from maturit(?:y|ies) of (?:marketable securities|investments|available-for-sale securities)\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Maturities of (?:marketable securities|investments|available-for-sale securities)\s+([()\d.,-]+)/i);
    if (sales != null || maturities != null) return (sales ?? 0) + (maturities ?? 0);
    return null;
  };
  return {
    shareBuybacks: readFirstValue(/Repurchases of common stock\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Repurchases? of (?:common stock|equity securities|treasury stock|shares)[^\d()-]{0,50}([()\d.,-]+)/i)
      ?? readFirstValue(/Payments? (?:for repurchase of common stock|to acquire treasury stock|for repurchase of shares)[^\d()-]{0,50}([()\d.,-]+)/i)
      ?? readFirstValue(/Common stock repurchased[^\d()-]{0,50}([()\d.,-]+)/i)
      ?? readFirstValue(/Treasury stock purchases[^\d()-]{0,50}([()\d.,-]+)/i),
    purchasesOfMarketableSecurities: readFirstValue(/Purchases of marketable securities\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Purchases of (?:available-for-sale|debt|marketable) securities\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Purchases of (?:investments|short-term investments)\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Payments to acquire (?:investments|marketable securities)\s+([()\d.,-]+)/i),
    proceedsFromSaleOfMarketableSecurities: readMarketableProceeds(),
    acquisitionsOfBusiness: readFirstValue(/Acquisitions? of businesses,? net of cash acquired\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Acquisition of business,? net of cash acquired\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Payments? to acquire businesses[^()\d-]{0,40}([()\d.,-]+)/i)
      ?? readFirstValue(/Payments? for (?:businesses acquired|acquisitions),? net of cash acquired[^()\d-]{0,40}([()\d.,-]+)/i)
      ?? readFirstValue(/Cash paid for acquisitions,? net[^()\d-]{0,40}([()\d.,-]+)/i),
    proceedsFromAssetSales: readFirstValue(/Proceeds from sales of property, plant, equipment and other assets\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Proceeds from sale(?:s)? of property, plant and equipment\s+([()\d.,-]+)/i)
      ?? readFirstValue(/Proceeds from (?:disposition|sale) of (?:property|productive assets|assets)\s+([()\d.,-]+)/i),
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

/** Detecta si el estado financiero está en miles (devuelve 1000) o en millones (1). */
function detectStatementScale(source, fromIndex, windowSize = 4000) {
  const window = source.slice(Math.max(0, fromIndex - windowSize), fromIndex).toLowerCase();
  const thousands = window.lastIndexOf('in thousands');
  const millions = window.lastIndexOf('in millions');
  if (thousands === -1 && millions === -1) return 1;
  return thousands > millions ? 1000 : 1;
}

/**
 * Suma la sección "Changes in operating assets and liabilities" del estado de flujos anual
 * (columna del ejercicio analizado). Es la variación de circulante REPORTADA con la que se
 * compara la necesidad teórica; la IA la lee mal con frecuencia (NVIDIA FY2026: −5.949M frente
 * a los −15.949M reales), así que el sistema la calcula de forma determinista.
 * @param {string} text - Texto del filing.
 * @returns {number|null} Variación neta en millones (signo del estado de flujos) o null.
 */
export function extractAnnualWorkingCapitalChange(text) {
  const source = String(text ?? '');
  const headingRe = /changes in operating assets and liabilities[^\n]*\n/gi;
  let heading = null;
  let match;
  while ((match = headingRe.exec(source)) !== null) heading = match;
  if (!heading) return null;
  const start = heading.index + heading[0].length;
  const tail = source.slice(start);
  const end = tail.search(/net cash (?:provided by|used in)[^\n]{0,80}operating/i);
  const section = tail.slice(0, end > 0 ? end : Math.min(tail.length, 8000));
  const amountCellRe = /^\(?\s*\$?\s*[\d.,]+\s*\$?\)?$/;
  let subtotal = null;
  let sum = 0;
  let count = 0;
  for (const line of section.split('\n')) {
    const cells = line.split(/\t|\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
    if (!cells.length) continue;
    const firstAmount = cells.find((cell) => amountCellRe.test(cell) && /\d/.test(cell));
    if (!firstAmount) continue;
    const value = parseFinancialValue(firstAmount);
    if (!Number.isFinite(value)) continue;
    const label = line.slice(0, 100).toLowerCase();
    // Si el estado publica un subtotal ("Net change in operating assets and liabilities"),
    // manda el subtotal y no se suman además sus líneas.
    if (/net change|changes in operating assets and liabilities/.test(label)) {
      subtotal = value;
      continue;
    }
    sum += value;
    count += 1;
  }
  const total = subtotal != null ? subtotal : (count >= 2 ? sum : null);
  if (total == null) return null;
  const scale = detectStatementScale(source, start);
  return Math.round((total / scale) * 10) / 10;
}

export function extractDebtCashFlow(text) {
  const source = String(text ?? '');
  const netIdx = source.search(/(?:Net cash(?: flows)? (?:provided by|used in|used for|from)|Cash (?:provided by|used in))[^\n]{0,60}financing/i);
  const lowerSource = source.toLowerCase();
  const searchLimit = netIdx > 0 ? netIdx : lowerSource.length;
  // Se busca el encabezado de la sección ("CASH FLOWS FROM FINANCING ACTIVITIES" o
  // "Cash Provided by (Used in) Financing Activities") y, si no aparece, la última mención a
  // "financing activities" anterior a la línea del neto.
  const headingIdx = Math.max(
    lowerSource.lastIndexOf('cash flows from financing activities', searchLimit),
    lowerSource.lastIndexOf('cash provided by (used in) financing activities', searchLimit),
  );
  const genericIdx = lowerSource.lastIndexOf('financing activities', searchLimit);
  let start = headingIdx >= 0 ? headingIdx : genericIdx;
  if (start < 0) return null;
  if (headingIdx < 0) {
    const lineStart = lowerSource.lastIndexOf('\n', start - 1) + 1;
    if (/^\s*other financing/.test(lowerSource.slice(lineStart, start))) {
      const lineEnd = lowerSource.indexOf('\n', start);
      if (lineEnd === -1) return null;
      start = lineEnd + 1;
    }
  }
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
  if (!found) return null;
  const scale = detectStatementScale(source, start);
  return Math.round((net / scale) * 10) / 10;
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

export function normalizeNumericCell(value, language = 'es') {
  if (value == null || value === '—') return value;
  const str = String(value).trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(str)) return value;
  const num = parseLooseReportNumber(str);
  if (!Number.isFinite(num)) return value;
  const rounded = String(Math.round(num * 100) / 100);
  return language === 'en' ? rounded : rounded.replace('.', ',');
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
    /(?:remained|was remaining|had remaining) (?:available )?under (?:the|its|our)? (?:share )?repurchase program[^.\d]{0,60}\$?([\d.,]+\s*(?:billion|million))/i,
    /share repurchase authorization of[^.\d]{0,60}\$?([\d.,]+\s*(?:billion|million))\s+remained/i,
    /\$?([\d.,]+\s*(?:billion|million))\s+(?:remained available|authorized remaining)/i,
    /remaining authorized (?:amount|funds)[^.]{0,80}?\$?([\d.,]+\s*(?:billion|million))/i,
    /authorization remaining (?:of|was|is)[^.]{0,40}?\$?([\d.,]+\s*(?:billion|million))/i,
    /authorized to repurchase up to \$?[\d.,]+\s*(?:billion|million)[^.]{0,120}?(?:with|having)\s*\$?([\d.,]+\s*(?:billion|million))\s+remaining/i,
    /(?:remanente|saldo|importe) pendiente (?:de autorizaci[oó]n|por recomprar)[^.\d]{0,50}(?:de\s+)?\$?([\d.,]+\s*(?:millones|billion|million))/i,
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

export function extractRepurchaseFactsFromText(text) {
  const source = String(text ?? '');
  const facts = {};

  const cleanNum = (str) => String(str ?? '').replace(/[.,;:!]+$/, '').trim();

  const sharesMatch = source.match(/repurchased\s+(?:approximately\s+)?([\d.,]+)\s*(million|billion)?\s*(?:shares of common stock|common shares|shares)/i)
    || source.match(/(?:recompra(?:ron)?|adquisici[oó]n de)\s+([\d.,]+)\s*(millones)?\s*(?:de acciones|acciones)/i);
  if (sharesMatch) {
    let count = parseLooseReportNumber(cleanNum(sharesMatch[1]));
    if (Number.isFinite(count) && count > 0) {
      if (/billion/i.test(sharesMatch[2])) count *= 1000;
      else if (!sharesMatch[2] && count > 10000) count = Math.round(count / 1e4) / 100;
      facts.sharesRepurchasedAnnual = Math.round(count * 100) / 100;
    }
  }

  const priceMatch = source.match(/average\s+(?:per[- ]share\s+)?price\s+(?:paid\s+)?(?:of|per share was|was)?\s*\$?([\d.,]+)/i)
    || source.match(/average cost per share of\s*\$?([\d.,]+)/i)
    || source.match(/precio medio (?:ponderado )?(?:de|por acci[oó]n)?\s*([\d.,]+)\s*[\$€]/i);
  if (priceMatch) {
    const p = parseLooseReportNumber(cleanNum(priceMatch[1]));
    if (Number.isFinite(p) && p > 0) facts.averagePrice = p;
  }

  const costMatch = source.match(/aggregate\s+(?:purchase\s+price|cost|expenditure)\s+(?:of\s+)?\$?([\d.,]+\s*(?:billion|million))/i)
    || source.match(/total expenditure of\s*\$?([\d.,]+\s*(?:billion|million))/i)
    || source.match(/importe (?:total|agregado) de\s*([\d.,]+)\s*millones/i);
  if (costMatch) {
    const c = parseDollarAmount(cleanNum(costMatch[1]));
    if (Number.isFinite(c) && c > 0) facts.aggregateCost = c;
  }

  return facts;
}

/**
 * Determina si un cambio directivo es histórico (una bio del 10-K, no un relevo del ejercicio).
 * Un tramo como "en diciembre de 2007 fue nombrado CEO ... y en enero de 2017 fue nombrado Chair"
 * no es un cambio de la cúpula directiva del ejercicio analizado.
 * Solo se usan las fechas declaradas del cambio: los años del texto pueden ser la antigüedad del
 * directivo saliente y no la fecha del relevo.
 * @param {object} change - Cambio con announcementDate y/o effectiveDate.
 * @param {number|null} fiscalYear - Año fiscal del informe.
 * @returns {boolean} true si todas las fechas del cambio son anteriores al ejercicio anterior.
 */
export function isStaleExecutiveChange(change, fiscalYear) {
  const year = Number(fiscalYear);
  if (!Number.isFinite(year) || year < 2000) return false;
  const years = [change?.announcementDate, change?.effectiveDate]
    .map((value) => String(value ?? '').match(/(?:19|20)\d{2}/)?.[0])
    .filter(Boolean)
    .map(Number);
  if (!years.length) return false;
  return Math.max(...years) < year - 1;
}

export function extractExecutiveChangesFromText(text, options = {}) {
  const source = String(text ?? '');
  if (!source) return [];

  const fiscalYear = Number(options?.fiscalYear) || null;
  const changes = [];
  const seenRoles = new Set();

  const rolePatterns = [
    {
      role: 'CEO',
      re: /(?:appointed|named|elected|will succeed|succeeded|assumed the role of|stepped down as|retired as|resigned as|will step down as|will retire as|transitioned from the role of|departure of)[^\n.]{0,100}?(?:Chief Executive Officer|CEO|Consejero Delegado)/gi,
      signalRe: /(?:Chief Executive Officer|CEO|Consejero Delegado)[^\n.]{0,100}?(?:transition|succession|retirement|resignation|appointment|relevo)/gi,
    },
    {
      role: 'CFO',
      re: /(?:appointed|named|elected|will succeed|succeeded|assumed the role of|stepped down as|retired as|resigned as|will step down as|will retire as|transitioned from the role of|departure of)[^\n.]{0,100}?(?:Chief Financial Officer|CFO|Director Financiero)/gi,
      signalRe: /(?:Chief Financial Officer|CFO|Director Financiero)[^\n.]{0,100}?(?:transition|succession|retirement|resignation|appointment|relevo)/gi,
    },
    {
      role: 'COO',
      re: /(?:appointed|named|elected|will succeed|succeeded|assumed the role of|stepped down as|retired as|resigned as|will step down as|will retire as|transitioned from the role of|departure of)[^\n.]{0,100}?(?:Chief Operating Officer|COO|Director de Operaciones)/gi,
      signalRe: /(?:Chief Operating Officer|COO)[^\n.]{0,100}?(?:transition|succession|retirement|resignation|appointment|relevo)/gi,
    },
    {
      role: 'President',
      re: /(?:appointed|named|elected|will succeed|succeeded|assumed the role of|stepped down as|retired as|resigned as)[^\n.]{0,100}?(?:President and Chief Executive|Presidente)/gi,
      signalRe: /(?:President|Presidente)[^\n.]{0,100}?(?:transition|succession|retirement|resignation|appointment)/gi,
    },
  ];

  for (const { role, re, signalRe } of rolePatterns) {
    if (seenRoles.has(role)) continue;
    // Se recorre cada patrón hasta encontrar un relevo vigente: las bio del 10-K mencionan
    // nombramientos antiguos ("appointed our CEO" en 2007) que no son cambios del ejercicio.
    for (const matcher of [re, signalRe]) {
      matcher.lastIndex = 0;
      let match;
      while ((match = matcher.exec(source)) !== null) {
        const start = Math.max(0, source.lastIndexOf('\n', match.index - 1));
        const end = Math.min(source.length, source.indexOf('\n', match.index + match[0].length));
        const sentence = source.slice(start, end > 0 ? end : match.index + 500).trim();
        if (sentence.length < 20) continue;

        let reason = 'Transición directiva';
        if (/retir|jubilaci/i.test(sentence)) reason = 'Retiro / Jubilación';
        else if (/resign|dimisi[oó]n|renuncia/i.test(sentence)) reason = 'Dimisión / Renuncia';
        else if (/succession|sucesi[oó]n|planificada/i.test(sentence)) reason = 'Sucesión planificada';
        else if (/appoint|nombramiento|named/i.test(sentence)) reason = 'Nombramiento';

        const effectiveMatch = sentence.match(/effective\s+([A-Z][a-z]+\s+\d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})/i)
          || sentence.match(/efectiv[ao]\s+(?:el\s+)?(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4})/i);
        const effectiveDate = effectiveMatch ? effectiveMatch[1] : null;

        const announceMatch = sentence.match(/(?:On|In)\s+([A-Z][a-z]+(?:\s+\d{1,2})?,?\s*\d{4})/i);
        const announcementDate = announceMatch ? announceMatch[1] : null;

        let oldName = null;
        let newName = null;
        const succeedMatch = sentence.match(/succeeding\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
        if (succeedMatch) oldName = succeedMatch[1];
        if (!oldName) {
          const retiredMatch = sentence.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:who\s+)?(?:retired|stepped down|resigned)/);
          if (retiredMatch) oldName = retiredMatch[1];
        }
        const appointMatch = sentence.match(/(?:appointed|named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:as|to the role of)/)
          || sentence.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:was|has been|is)?\s*(?:appointed|named|elected)/);
        if (appointMatch) newName = appointMatch[1];

        const change = {
          role,
          text: sentence.slice(0, 1000),
          announcementDate,
          effectiveDate,
          reason,
          oldExecutive: oldName ? { name: oldName, role: `${role} saliente` } : null,
          newExecutive: newName ? { name: newName, origin: null } : null,
          occurred: true,
          source: 'SEC filing text (extracción determinista)',
        };
        if (isStaleExecutiveChange(change, fiscalYear)) continue;
        seenRoles.add(role);
        changes.push(change);
        break;
      }
      if (seenRoles.has(role)) break;
    }
  }

  return changes;
}

export function extractRepurchaseProgramTerms(text) {
  const source = String(text);
  const terms = {};

  const authorized = source.match(/repurchase up to\s*\$?([\d.,]+\s*(?:billion|million))/i)
    || source.match(/(?:authorized|approved)\s+(?:a|the)?\s*(?:share\s+)?(?:repurchase|buyback)[^.]{0,140}?\$?([\d.,]+\s*(?:billion|million))/i)
    || source.match(/board of directors (?:authorized|approved)[^.]{0,120}?\$?([\d.,]+\s*(?:billion|million))/i);
  if (authorized) {
    const value = parseDollarAmount(authorized[1]);
    if (Number.isFinite(value)) terms.programAuthorizedTotal = value;
  }

  const expiry = source.match(/(?:repurchase|buyback|program)[\s\S]{0,220}?through\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i)
    || source.match(/expires?\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i)
    || source.match(/expiration date of\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i);
  if (expiry) terms.programExpiry = expiry[1];

  const approvalDate = source.match(/(?:In|On)\s+([A-Z][a-z]+\s+\d{4})[^.]{0,180}?(?:authorized|approved)[^.]{0,180}?(?:repurchase|buyback)/i)
    || source.match(/(?:authorized|approved) in\s+([A-Z][a-z]+\s+\d{4})/i);
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
