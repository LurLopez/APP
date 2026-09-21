/**
 * @fileoverview Prompt de la pasada focalizada que recupera una refinanciación real
 * (tender offer, exchange offer, amortización anticipada...) cuando la extracción principal no la detecta.
 * @module agents/analyst/debtRefinancingPrompt
 */

/**
 * Construye el prompt de extracción específica de refinanciaciones de deuda.
 * @returns {string} Prompt listo para enviar al modelo junto al texto de la operación.
 */
export function buildDebtRefinancingPrompt() {
  return `Eres un extractor de datos financieros. Recibirás un fragmento de un informe 10-K que puede describir operaciones de refinanciación de deuda (cash tender offers, exchange offers, amortizaciones anticipadas, redenciones o extinciones de deuda).

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):
{"occurred":true,"description":"Oferta de compra en efectivo de notas por 1.600M$ y ofertas de canje por 732M$","oldDebtRate":null,"newDebtRate":null,"amountRefinanced":1600,"annualInterestImpact":253,"epsImpact":-0.13}

Instrucciones:
- "occurred": true SOLO si la compañía ejecutó o acordó firmemente una refinanciación durante el ejercicio (tender offer, exchange offer, amortización anticipada, redención de notas o extensión firmada). Si el fragmento solo contiene provisiones genéricas de rescate ("redemption provisions"), vencimientos futuros o meras intenciones, devuelve {"occurred":false}.
- "description": qué operación se realizó y sobre qué deuda (resumen breve).
- "amountRefinanced": principal repagado, redimido o canjeado en MILLONES de USD; si hay varias operaciones (tender + exchange), la suma, y si el informe solo da un importe global en efectivo (ej. "1.6 billion"), usa ese importe (1600).
- "oldDebtRate": tipo medio de la deuda retirada en %; null si no consta.
- "newDebtRate": tipo de la nueva deuda emitida en %; null si no consta.
- "annualInterestImpact": cargo o impacto en intereses en $M como lo publica el informe; null si no consta.
- "epsImpact": impacto en el BPA en $/acción tal como lo publica el informe (con signo, ej. -0.13); null si no consta.
- No inventes: usa solo las cifras del fragmento.`;
}
