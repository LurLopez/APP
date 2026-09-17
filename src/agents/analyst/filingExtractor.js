/**
 * @fileoverview Carga de reglas de conocimiento y extracción de secciones clave en informes SEC (10-K / 10-Q / 8-K).
 * @module agents/analyst/filingExtractor
 */

import { readFile } from 'node:fs/promises';

export const KNOWLEDGE_DIR = new URL('../knowledge/', import.meta.url);
export const PROMPTS_DIR = new URL('../prompts/', import.meta.url);
export const SECTOR_FILES = { defensive_consumer: 'consumo-defensivo' };

/**
 * Carga las reglas markdown de conocimiento aplicables a un sector, subsector, tipo de formulario y empresa.
 * @param {string} sector - Identificador o slug del sector.
 * @param {string} [subsector] - Slug del subsector (opcional).
 * @param {string} [formType='10-Q'] - Tipo de formulario SEC ('10-K', '10-Q', etc.).
 * @param {string} [ticker=null] - Ticker de la empresa.
 * @returns {Promise<string>} Bloque de reglas consolidado.
 */
export async function loadKnowledgeRules(sector, subsector, formType = '10-Q', ticker = null) {
  const isAnnual = String(formType || '').toUpperCase().includes('10-K')
    || String(formType || '').toLowerCase().includes('anual');

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

  // Reglas propias de la empresa si existe un markdown específico
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

const KEY_SECTION_PATTERNS = [
  { re: /(?:Note\s+\d+[\s.:–-]+)?Debt Obligations[\s\S]{0,120}?(?:As of|\(In millions\)|December\s+\d{1,2},)/i, before: 400, after: 8500, label: 'DEUDA: NOTA DE OBLIGACIONES CON CUPONES Y VENCIMIENTOS' },
  { re: /(?:Note\s+\d+[\s.:–-]+)?Long-Term Debt:?\s*(?:The following table|The components|The Company)|Long-term debt obligations[^\n]{0,140}(?:table|summariz)/i, before: 300, after: 8500, label: 'DEUDA: NOTA DE DEUDA A LARGO PLAZO CON CUPONES' },
  { re: /aggregate principal maturities|principal maturities of our long-term debt|(?:scheduled\s+)?maturities of (?:long-term )?debt/i, before: 1500, after: 2500, label: 'DEUDA: VENCIMIENTOS DE PRINCIPAL POR EJERCICIO' },
  { re: /Material Cash Requirements[^\n]{0,90}Obligations|Contractual (?:Cash )?Maturities/i, before: 300, after: 5500, label: 'DEUDA: VENCIMIENTOS CONTRACTUALES' },
  { re: /(?:\n\s*Share Repurchase Program\s*\n|Issuer Purchases of Equity Securities|Share Repurchase(?:s| Program| Plans)?|Stock Repurchase(?:s| Program| Plans)?|Common Stock Repurchase(?:s| Program)?)/i, before: 300, after: 5000, label: 'RECOMPRAS: PROGRAMA Y REMANENTE' },
  { re: /remaining authorization|authorization remaining|remaining under the (?:share |stock )?repurchase/i, before: 300, after: 1500, label: 'RECOMPRAS: AUTORIZACIÓN REMANENTE' },
  { re: /(?:Note\s+\d+[\s.:–-]+)?(?:Acquisitions?|Business Combinations?)(?:\s+and\s+Divestitures?)?[\s\S]{0,180}?(?:\(In millions|purchase price|consideration transferred|net of cash acquired|business acquired)/i, before: 300, after: 9000, label: 'OPERACIONES: NOTA DE ADQUISICIONES Y DESINVERSIONES' },
  { re: /(?:Divestitures?|sale of (?:our|the) (?:business|subsidiary|brand)|\bagreed to sell\b|\bheld for sale\b|discontinued operations)/i, before: 300, after: 6000, label: 'OPERACIONES: DESINVERSIONES Y VENTAS DE NEGOCIOS' },
  { re: /\bspin-?off\b|\bseparation (?:transaction|of|into)\b|\bplan to separate\b|\btax-free distribution\b/i, before: 300, after: 6000, label: 'OPERACIONES: SPIN-OFFS Y SEPARACIONES' },
  { re: /\brestructuring (?:plan|program|initiative|charges?)\b|\bRestructuring and Related (?:Activities|Costs)\b|\bcost (?:savings|reduction) (?:plan|program)\b/i, before: 300, after: 5000, label: 'OPERACIONES: REESTRUCTURACIONES Y AHORRO DE COSTES' },
  { re: /(?:appointed|named|elect(?:ed)?|succeed(?:ed|ing)?)[^\n]{0,160}(?:Chief Executive Officer|CEO|Chief Financial Officer|CFO|Chief Operating Officer|COO|President|Consejero Delegado|Director Financiero)|(?:Chief Executive Officer|CEO|Chief Financial Officer|CFO|Chief Operating Officer|COO|President|Consejero Delegado)[^\n]{0,160}(?:transition|succession|retire|retiring|step(?:ping)? down|resign|departure|appointment)/i, before: 600, after: 5000, label: 'CAMBIO DE DIRECTIVOS: NOMBRAMIENTOS Y SUCESIÓN' },
  { re: /(?:Executive Officers of the Registrant|Item 5\.02|Departure of Directors or (?:Certain )?Officers|Leadership Transition|Management Transition)/i, before: 400, after: 5000, label: 'CAMBIO DE DIRECTIVOS: CÚPULA DIRECTIVA' },
  { re: /Shares of common stock issued, in treasury, and outstanding/i, before: 300, after: 2500, label: 'ACCIONES EN CIRCULACIÓN' },
  { re: /Selected Financial Data|Five[- ]Year Summary/i, before: 200, after: 6000, label: 'RESUMEN QUINQUENAL' },
];

function pickKeySections(source, labelPrefix) {
  if (!source) return '';
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  const picked = [];

  for (const item of KEY_SECTION_PATTERNS) {
    if (labelPrefix && !item.label.startsWith(labelPrefix)) continue;
    const flags = item.re.flags.includes('g') ? item.re.flags : `${item.re.flags}g`;
    const regex = new RegExp(item.re.source, flags);
    let match;
    let chosen = null;
    while ((match = regex.exec(source)) !== null) {
      const snippet = source.slice(match.index, match.index + 260);
      if (!INDEX_ENTRY_PATTERN.test(snippet)) { chosen = match; break; }
      regex.lastIndex = match.index + 1;
    }
    if (!chosen || chosen.index == null) continue;
    const range = {
      start: Math.max(0, chosen.index - item.before),
      end: Math.min(source.length, chosen.index + item.after),
      label: item.label,
    };
    if (picked.some((existing) => overlaps(existing, range))) continue;
    picked.push(range);
  }

  if (!picked.length) return '';
  picked.sort((a, b) => a.start - b.start);
  return picked.map((range) => `### ${range.label}\n${source.slice(range.start, range.end).trim()}`).join('\n\n');
}

/**
 * Extrae secciones críticas dirigidas del texto del 10-K / 10-Q (deuda, cupones, recompras, acciones).
 * @param {string} text - Texto completo del documento SEC.
 * @returns {string} Bloques de texto identificados.
 */
export function extractKeyFilingSections(text) {
  return pickKeySections(String(text ?? ''), null);
}

const DEBT_COVER_PATTERN = /securities registered|name of each exchange|title of each class|nasdaq|new york stock exchange|stock exchange/i;
const DEBT_EXHIBIT_PATTERN = /incorporated herein by reference|current report on form 8-k|exhibit\s+\d|\bform of\b[\s\S]{0,90}?\b(?:senior\s+)?notes?\b/i;

function isDebtCoverOrIndexEntry(source, index) {
  const around = source.slice(Math.max(0, index - 250), index + 300);
  return DEBT_COVER_PATTERN.test(around) || DEBT_EXHIBIT_PATTERN.test(around);
}

function maturityWindowScore(source, range) {
  const snippet = source.slice(range.start, range.end);
  const yearRows = (snippet.match(/(?:due|maturing(?:\s+in)?)\s+(?:19|20)\d{2}/gi) || []).length;
  const amounts = (snippet.match(/\d{1,3}(?:,\d{3})+|\$\s?\d/g) || []).length;
  return yearRows * 3 + amounts * 10;
}

/**
 * Extrae únicamente los bloques de la nota de deuda (vencimientos y cupones).
 * Localiza las filas de vencimiento ("due 2019", "maturing in 2027") para no caer en el
 * índice del informe, descarta las menciones de la portada y del índice de exhibiciones, y
 * ordena las ventanas por contenido de tabla de vencimientos (años + importes) para que la
 * pasada focalizada reciba primero la nota real y no un fragmento de contexto.
 * @param {string} text - Texto completo del documento SEC.
 * @returns {string} Bloques de deuda identificados.
 */
export function extractDebtFilingText(text) {
  const source = String(text ?? '');
  if (!source) return '';

  const rowPattern = /(?:(?:due|maturing(?:\s+in)?)\s+(?:19|20)\d{2}|(?:maturities of (?:long-term )?debt|contractual maturities|scheduled maturities)[\s\S]{0,300}?\b20[2-4]\d\b)/gi;
  const windows = [];
  let match;
  while ((match = rowPattern.exec(source)) !== null && windows.length < 10) {
    if (isDebtCoverOrIndexEntry(source, match.index)) continue;
    const range = {
      start: Math.max(0, match.index - 3000),
      end: Math.min(source.length, match.index + 800),
    };
    const last = windows[windows.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      windows.push(range);
    }
  }

  if (windows.length) {
    windows.sort((a, b) => maturityWindowScore(source, b) - maturityWindowScore(source, a));
    return windows.map((range) => source.slice(range.start, range.end).trim()).join('\n\n[...]\n\n');
  }
  return pickKeySections(source, 'DEUDA');
}

const REFINANCING_SIGNALS = [
  /cash tender offer/gi,
  /exchange offer/gi,
  /debt extinguishment/gi,
  /early redemption/gi,
  /(?:we|company) redeemed/gi,
  /redemption of (?:the )?(?:notes|debt)/gi,
  /repurchase of (?:the )?(?:notes|debt)/gi,
  /amortizaci[oó]n anticipada/gi,
  /oferta(?:s)? de (?:compra|canje)/gi,
  /recompra de (?:bonos|notas|deuda)/gi,
];

/**
 * Extrae los bloques que describen una refinanciación real (tender offers, exchange offers,
 * amortizaciones anticipadas o extinciones de deuda), ignorando provisiones genéricas.
 * @param {string} text - Texto completo del documento SEC.
 * @returns {string} Bloques de refinanciación identificados o cadena vacía.
 */
export function extractRefinancingFilingText(text) {
  const source = String(text ?? '');
  if (!source) return '';

  const windows = [];
  for (const signal of REFINANCING_SIGNALS) {
    const regex = new RegExp(signal.source, 'gi');
    let match;
    while ((match = regex.exec(source)) !== null) {
      const range = {
        start: Math.max(0, match.index - 1500),
        end: Math.min(source.length, match.index + 3000),
      };
      const last = windows[windows.length - 1];
      if (last && range.start <= last.end) {
        last.end = Math.max(last.end, range.end);
      } else {
        windows.push(range);
      }
      if (windows.length >= 3) break;
    }
    if (windows.length >= 3) break;
  }

  if (!windows.length) return '';
  return windows.map((range) => source.slice(range.start, range.end).trim()).join('\n\n[...]\n\n').slice(0, 16000);
}

const REAL_FINANCIAL_PATTERNS = [
  // Cash Flows real:
  /(?:(?:consolidated|condensed consolidated)\s+statements?\s+of\s+cash\s+flows?|statements?\s+of\s+cash\s+flows?)[\s\S]{0,250}?(?:\(in millions|\(in thousands|operating activities|cash flows? from operating)/i,
  // Income / Operations real:
  /(?:(?:consolidated|condensed consolidated)\s+statements?\s+of\s+(?:operations|income|earnings|loss|net earnings|profit and loss)|statements?\s+of\s+(?:operations|income|earnings|loss|net earnings|profit and loss))[\s\S]{0,250}?(?:\(in millions|\(in thousands|operating revenues|revenues|net sales|cost of)/i,
  // Balance Sheets real:
  /(?:(?:consolidated|condensed consolidated)\s+(?:balance\s+sheets?|statements?\s+of\s+financial\s+(?:position|condition))|balance\s+sheets?|statements?\s+of\s+financial\s+(?:position|condition))[\s\S]{0,250}?(?:\(in millions|\(in thousands|current assets|cash and cash equivalents)/i,
];

const FALLBACK_FINANCIAL_MARKERS = [
  /(?:(?:condensed\s+)?consolidated\s+)?statements?\s+of\s+cash\s+flows?/gi,
  /(?:(?:condensed\s+)?consolidated\s+)?(?:balance\s+sheets?|statements?\s+of\s+financial\s+(?:position|condition))/gi,
  /(?:(?:condensed\s+)?consolidated\s+)?statements?\s+of\s+(?:operations|income|earnings|net\s+earnings|profit\s+and\s+loss)/gi,
];

const INDEX_ENTRY_PATTERN = /(?:\.{3,}|\t|\s{6,})\s*\d+\b/;

/**
 * Localiza las posiciones de inicio y fin de las tablas de estados financieros reales en el filing.
 * Evita coincidencias falsas con las tablas de contenidos o índices iniciales.
 * @param {string} source - Texto del filing.
 * @returns {{ start: number, end: number }|null} Rango de caracteres de las tablas contables.
 */
export function locateFinancialStatementsRange(source) {
  if (!source) return null;

  const matches = [];
  for (const pattern of REAL_FINANCIAL_PATTERNS) {
    const match = source.match(pattern);
    if (match && match.index != null) {
      matches.push(match.index);
    }
  }

  if (matches.length === 0) {
    for (const marker of FALLBACK_FINANCIAL_MARKERS) {
      let m;
      while ((m = marker.exec(source)) !== null) {
        const snippet = source.slice(m.index, m.index + 200);
        if (!INDEX_ENTRY_PATTERN.test(snippet)) {
          matches.push(m.index);
          break;
        }
      }
    }
  }

  if (matches.length === 0) return null;

  const minIndex = Math.min(...matches);
  const maxIndex = Math.max(...matches);

  return {
    start: Math.max(0, minIndex - 2000),
    end: Math.min(source.length, maxIndex + 30000),
  };
}

/**
 * Extrae el bloque continuo que contiene los estados financieros y notas explicativas inmediatas.
 * @param {string} source - Texto completo del filing.
 * @returns {string} Bloque de texto extraído.
 */
export function extractFinancialWindow(source) {
  const range = locateFinancialStatementsRange(source);
  if (!range) return '';
  return source.slice(range.start, range.end);
}

/**
 * Construye el cuerpo del informe textual optimizado para enviar al LLM, incluyendo estados financieros y notas.
 * @param {string} text - Texto principal del filing SEC.
 * @param {string} [presentationText] - Texto suplementario de la presentación de resultados.
 * @returns {string} Texto preparado con presupuesto de caracteres.
 */
export function buildAnalysisText(text, presentationText) {
  const source = String(text ?? '');
  if (!source) return '';

  const head = source.slice(0, 10000);
  const financialWindow = extractFinancialWindow(source);

  const mainContent = financialWindow
    ? `[COMIENZO DEL INFORME]\n${head}\n\n[SECCIÓN DE ESTADOS FINANCIEROS Y NOTAS]\n${financialWindow}`
    : source.slice(0, 60000);

  const keySections = extractKeyFilingSections(source);
  const keyBlock = keySections ? `\n\n[SECCIONES CLAVE ADICIONALES DEL INFORME]\n${keySections}` : '';
  const main = `${mainContent}${keyBlock}`;

  const presentation = String(presentationText ?? '').trim();
  if (!presentation) return main;

  const presentationBudget = 30000;
  return `${main}\n\n[SECCIÓN COMPLEMENTARIA: PRESENTACIÓN Y COMUNICADO DE RESULTADOS (EARNINGS PRESENTATION / 8-K PRESS RELEASE)]\n${presentation.slice(0, presentationBudget)}`;
}
