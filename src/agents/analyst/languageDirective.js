/**
 * @fileoverview Directivas de idioma para el pipeline del analista.
 * La directiva se añade a los prompts de extracción y de redacción para que
 * la IA produzca TODO el contenido textual del informe en el idioma elegido,
 * con el formato numérico correcto y las etiquetas estructurales esperadas.
 * @module agents/analyst/languageDirective
 */

import { normalizeLanguage } from '../../utils/i18n.js';

const SPANISH_DIRECTIVE = `IDIOMA DEL INFORME (OBLIGATORIO): español.
- Redacta TODO el contenido textual (títulos, etiquetas, notas, verificación y narrativa) en español.
- Formato numérico en español: coma decimal y punto para los miles (ej. "+16,67 %", "6.237M", "205M").
- Etiquetas de horizonte: "ÚLTIMOS 3 MESES", "ÚLTIMOS 3 MESES (Q1)" y "EN TODO EL AÑO (X MESES)"; en 10-K: "EN TODO EL AÑO (12 MESES)".
- Filas de Ventas: "Ventas", "Beneficio Bruto", "Beneficio Operativo", "EBT", "Beneficio Neto".
- Filas de Cash Flow: "Cash Flow", "CAPEX", "FCF", "FCF/Acción", "Dividendo", "Libre".
- Filas de Asignación de Capital: "Libre", "Inversiones a corto plazo", "Desinversiones", "Adquisiciones", "Deuda", "Caja", "Recompras", "Emisión de preferentes", "Venta de participaciones", "Deuda asumida (no-cash)", "En total".
- Cabeceras de escenario de Cash Flow: "Normal (WC=...)" y "Ajustado*1 (WC=...)".
- Título de la nota de impuestos: "*2: Impuestos: ..." y verificación con las frases del prompt.
- Los textos libres ("extraNotes", "acquisitionDescription", "divestitureDescription") también en español.`;

const ENGLISH_DIRECTIVE = `OUTPUT LANGUAGE (MANDATORY): English.
- Write ALL textual content (titles, labels, notes, verification and narrative) in English. JSON keys and numeric fields never change.
- Use US number formatting: dot decimal and comma thousands (e.g. "+16.67 %", "6,237M", "205M").
- Horizon labels: "LAST 3 MONTHS", "LAST 3 MONTHS (Q1)" and "FULL YEAR TO DATE (X MONTHS)"; for 10-K: "FULL YEAR (12 MONTHS)".
- Sales rows: "Sales", "Gross Profit", "Operating Income", "EBT", "Net Income".
- Cash Flow rows: "Cash Flow", "CAPEX", "FCF", "FCF/Share", "Dividend", "Free".
- Capital Allocation rows: "Free", "Short-term investments", "Divestitures", "Acquisitions", "Debt", "Cash", "Buybacks", "Preferred stock issuance", "Sale of non-controlling interests", "Assumed debt (non-cash)", "Total".
- Cash Flow scenario headers: "Normal (WC=...)" and "Adjusted*1 (WC=...)".
- Mandated note phrases (translate them exactly like this):
  * Debt note: "Debt balance: <prev>M -> <current>M (<change>M). Net debt: <prevNet>M -> <currentNet>M (<netChange>M). Cash balance: <prev>M -> <current>M (<change>M); cash increased: use of capital (-) / cash decreased: source of liquidity (+); Cash row = <value>M."
  * Tax note: "*2: Taxes: ..." with the same detail as in Spanish.
  * WC note: "*1: WC = aggregate share of working capital over operating cash flow excluding working capital in the last <N> fiscal years: <ratio>% × <base>M = <annual>M for the period. Ratios by fiscal year: <list>. Deviation of reported working capital (<reported>M) vs. theoretical WC (<theoretical>M): <deviation>M. The Cash Flow after the working capital adjustment stands at: <cfo>M - (<deviation>M) = <adjusted>M."
  * Verification OK: "Roughly balances. It may still be that I missed a detail." or "It balances." if zero.
  * Verification KO: "Does not balance: <amount>M remain unexplained between free capital and detected uses. The gap corresponds to unmapped items or non-monetary movements and balance reclassifications (restricted cash, FX effect on cash, debt assumed in acquisitions, cash/investments reclassifications) that must be reviewed in the filing's cash flow and balance notes."
- Annual conclusion section titles must be in English and numbered in order: "1: Buybacks", "2: Management changes", "3: Outlook", "4: Debt", "5: Corporate actions", "6: Dividends" (number according to the sections actually present).
- Rating label: "RESULTS SCORE: <score>" and the rationale in English.
- Free text fields ("extraNotes", "acquisitionDescription", "divestitureDescription") must be in English too. Company names, tickers and proper nouns stay as in the filing.`;

/**
 * Devuelve la directiva de idioma que se añade a los prompts.
 * @param {string} [language] - Código de idioma ('es' | 'en').
 * @returns {string}
 */
export function getLanguageDirective(language) {
  return normalizeLanguage(language) === 'en' ? ENGLISH_DIRECTIVE : SPANISH_DIRECTIVE;
}

/**
 * ¿El idioma usa coma decimal? (español)
 * @param {string} [language]
 * @returns {boolean}
 */
export function usesCommaDecimal(language) {
  return normalizeLanguage(language) !== 'en';
}
