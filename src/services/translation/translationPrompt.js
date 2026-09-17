/**
 * @fileoverview Prompt de traducción de los textos libres de un informe financiero.
 * Se mantiene aparte para que el extractor de i18n no confunda el prompt con
 * textos de interfaz.
 * @module services/translation/translationPrompt
 */

const LANGUAGE_NAMES = {
  es: 'español',
  en: 'inglés',
};

/**
 * Nombre legible del idioma para el prompt.
 * @param {string} code
 * @returns {string}
 */
export function translationLanguageName(code) {
  return LANGUAGE_NAMES[code] ?? code;
}

/**
 * Construye los mensajes de chat para traducir un lote de textos del informe.
 * @param {{ sourceLanguage: string, targetLanguage: string, payload: Object<string,string> }} params
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildTranslationMessages({ sourceLanguage, targetLanguage, payload }) {
  const source = translationLanguageName(sourceLanguage);
  const target = translationLanguageName(targetLanguage);
  const system = `Eres el traductor financiero de Cifra. Recibirás un objeto JSON cuyas claves (t0, t1, t2…) identifican fragmentos de un informe de resultados trimestral (10-Q) o anual (10-K) redactado en ${source}. Traduce cada valor al ${target}.

Reglas obligatorias:
1. Devuelve ÚNICAMENTE un objeto JSON válido con exactamente las mismas claves t0, t1, t2… y los mismos elementos. No añadas ni elimines claves.
2. Traduce todo el contenido textual de forma natural y profesional. No dejes ningún fragmento en ${source} (salvo los términos que la regla 4 obliga a mantener).
3. NO TOQUES LOS NÚMEROS: copia carácter a carácter todos los importes, porcentajes, años, fechas, tipos y múltiplos exactamente como aparecen. No cambies separadores decimales ni de miles (da igual si ves "1.234,56" o "1,234.56": déjalo idéntico), no redondees, no recalcules y no añadas cifras nuevas.
4. Mantén sin traducir: tickers y nombres de empresas o personas, marcas y productos, términos de la SEC y de los filings (10-Q, 10-K, 8-K, Form, US GAAP, TCJ Act, guidance, outlook, cash flow, WK, WC) y los marcadores de nota (*1, *2, *3).
5. Conserva los asteriscos de Markdown (**negrita**), los saltos de línea (\\n) y los símbolos (~, ±, ->, %, $, M).
6. Usa terminología financiera estándar: en inglés "Working Capital", "Free Cash Flow", "share buybacks", "capital allocation"; en español "capital circulante", "flujo de caja libre", "recompras de acciones", "asignación de capital".
7. Si un valor ya está en ${target}, devuélvelo tal cual.
8. No añadas explicaciones, comentarios ni texto fuera del JSON.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}
