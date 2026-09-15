/**
 * @fileoverview Prompt de la pasada focalizada que recupera el calendario de vencimientos
 * de deuda cuando la extracción principal no lo devuelve.
 * @module agents/analyst/debtMaturityPrompt
 */

/**
 * Construye el prompt de extracción específica del calendario de vencimientos.
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @returns {string} Prompt listo para enviar al modelo junto al texto de la nota de deuda.
 */
export function buildDebtMaturityPrompt(fiscalYear) {
  const year = Number(fiscalYear);
  const windowEnd = Number.isFinite(year) ? year + 5 : null;
  const afterLabel = windowEnd ? `después de ${windowEnd}` : 'después del año 5';

  return `Eres un extractor de datos financieros. Recibirás un fragmento de un informe 10-K con la nota de deuda (Debt Obligations / Long-Term Debt). Extrae el calendario de vencimientos de principal.

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):
{"items":[{"year":2026,"label":"CAD 500M 3.44% senior notes","amount":364.3,"rate":3.44,"type":"Senior Notes"}],"afterYearFive":3841.6}

Instrucciones:
- Incluye un elemento por CADA fila o tramo con un año de vencimiento concreto: filas "Notes due 20XX", "Senior notes due 20XX", "maturing in 20XX" o el año que figure en la columna de vencimiento.
- "year": año de vencimiento. Si la fila agrupa un rango ("Notes due 2024-2047", "Other, due 2018-2026"), usa el primer año del rango.
- "label": etiqueta completa de la fila, con divisa, importe nominal y cupones si constan.
- "amount": saldo de principal en MILLONES de USD tomado de la columna del ejercicio analizado${Number.isFinite(year) ? ` (${year})` : ''}. Respeta el separador de miles: "3,948" son 3.948 millones; "(3,953)" es negativo.
- "rate": cupón en % si la fila indica un único tipo; null si indica varios tipos o no consta (no inventes la media).
- "type": Senior Notes, Commercial Paper, Term Loan, Deuda total, etc.
- "afterYearFive": importe total de principal que vence ${afterLabel} (o null si no consta).
- QUEDA PROHIBIDO extraer el calendario de la tabla "Payments Due by Period" / "Contractual Commitments" del MD&A (rangos agregados "1-3 years", "3-5 years", "2020 – 2021", "2024 and beyond", "menos de 1 año"): esa tabla agrupa periodos y no sirve como calendario. Usa EXCLUSIVAMENTE las filas con año de vencimiento de la nota de deuda ("Notes due 20XX", "Senior notes due 20XX", "maturing in 20XX", "Other, due 20XX-20XX").
- Ignora las filas sin año de vencimiento (subtotales, "Current maturities of long-term debt", "Commercial paper", "Total") y las que vencen antes del próximo ejercicio.
- No inventes cifras: si no hay ninguna fila con año de vencimiento, devuelve {"items":[],"afterYearFive":null}.`;
}
