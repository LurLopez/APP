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

/**
 * Extrae secciones críticas dirigidas del texto del 10-K / 10-Q (deuda, cupones, recompras, acciones).
 * @param {string} text - Texto completo del documento SEC.
 * @returns {string} Bloques de texto identificados.
 */
export function extractKeyFilingSections(text) {
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

const REAL_FINANCIAL_PATTERNS = [
  // Cash Flows real:
  /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+cash\s+flows?[\s\S]{0,250}?(?:\(in millions|\(in thousands|operating activities|cash flows? from operating)/i,
  // Income / Operations real:
  /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+(?:operations|income|earnings)[\s\S]{0,250}?(?:\(in millions|\(in thousands|operating revenues|revenues|net sales|cost of)/i,
  // Balance Sheets real:
  /(?:consolidated|condensed consolidated)\s+balance\s+sheets?[\s\S]{0,250}?(?:\(in millions|\(in thousands|current assets|cash and cash equivalents)/i,
];

const FALLBACK_FINANCIAL_MARKERS = [
  /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+cash\s+flows?/gi,
  /(?:consolidated|condensed consolidated)\s+balance\s+sheets?/gi,
  /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+(?:operations|income|earnings)/gi,
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
