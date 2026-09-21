/**
 * @fileoverview Conversión determinista del formato numérico de un informe entre
 * la convención española (1.234,56) y la inglesa (1,234.56). Nunca altera el valor
 * de las cifras: solo mueve los separadores de miles y decimales.
 * @module services/translation/reportNumbers
 */

const NUMBER_TOKEN_PATTERN = /\d[\d.,]*\d|\d/g;

// La coma decimal solo se interpreta como agrupación inglesa cuando hay dos o más
// grupos de tres dígitos (12,906,851); un único "1,197" se respeta como decimal
// porque el informe origen está redactado con la convención española.
const SPANISH_PATTERNS = [
  { regex: /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/, grouped: true },
  { regex: /^(\d+)(?:,(\d+))?$/, grouped: false },
  { regex: /^(\d{1,3}(?:,\d{3}){2,})$/, grouped: true },
];

const ENGLISH_PATTERNS = [
  { regex: /^(\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/, grouped: true },
  { regex: /^(\d+)(?:\.(\d+))?$/, grouped: false },
  { regex: /^(\d{1,3}(?:\.\d{3}){2,})$/, grouped: true },
];

/**
 * Inserta el separador de miles cada tres dígitos.
 * @param {string} digits
 * @param {string} separator
 * @returns {string}
 */
function groupInteger(digits, separator) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Reconstruye un número con la convención del idioma destino.
 * @param {string} integer - Dígitos enteros sin separadores.
 * @param {string} fraction - Dígitos decimales sin separadores.
 * @param {boolean} grouped - Si el número original usaba separador de miles.
 * @param {string} targetLanguage
 * @returns {string}
 */
function renderNumber(integer, fraction, grouped, targetLanguage) {
  const targetGroup = targetLanguage === 'en' ? ',' : '.';
  const targetDecimal = targetLanguage === 'en' ? '.' : ',';
  const integerText = grouped ? groupInteger(integer, targetGroup) : integer;
  return fraction ? `${integerText}${targetDecimal}${fraction}` : integerText;
}

/**
 * Convierte un único token numérico del idioma origen al destino.
 * @param {string} token
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {string}
 */
function convertNumberToken(token, sourceLanguage, targetLanguage) {
  const patterns = sourceLanguage === 'en' ? ENGLISH_PATTERNS : SPANISH_PATTERNS;
  for (const pattern of patterns) {
    const match = String(token).match(pattern.regex);
    if (!match) continue;
    const integer = match[1].split(/[.,]/).join('');
    const fraction = match[2] ?? '';
    return renderNumber(integer, fraction, pattern.grouped, targetLanguage);
  }
  return token;
}

/**
 * Convierte el formato de todos los números presentes en un texto.
 * @param {string} text
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {string}
 */
export function convertNumbersToLanguage(text, sourceLanguage, targetLanguage) {
  if (sourceLanguage === targetLanguage) return String(text ?? '');
  return String(text ?? '').replace(NUMBER_TOKEN_PATTERN, (token) => (
    convertNumberToken(token, sourceLanguage, targetLanguage)
  ));
}

/**
 * Convierte el formato de los números de un texto traducido comparándolo con su
 * original: los tokens que la IA ya reformateó se respetan; los que siguen
 * idénticos al original se adaptan por código.
 * @param {string} sourceText
 * @param {string} translatedText
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {string}
 */
export function convertNumbersAligned(sourceText, translatedText, sourceLanguage, targetLanguage) {
  if (sourceLanguage === targetLanguage) return String(translatedText ?? '');
  const sourceTokens = numberTokens(sourceText);
  const translated = String(translatedText ?? '');
  const translationTokens = numberTokens(translated);
  if (sourceTokens.length !== translationTokens.length) return translated;
  let index = 0;
  return translated.replace(NUMBER_TOKEN_PATTERN, (token) => {
    const sourceToken = sourceTokens[index];
    index += 1;
    return sourceToken === token ? convertNumberToken(token, sourceLanguage, targetLanguage) : token;
  });
}

/**
 * Extrae los tokens numéricos de un texto.
 * @param {string} text
 * @returns {string[]}
 */
export function numberTokens(text) {
  return String(text ?? '').match(NUMBER_TOKEN_PATTERN) ?? [];
}

/**
 * Reduce un token numérico a una forma canónica independiente del formato, para
 * comparar valores ("1.197", "1,197" y "1197" son equivalentes).
 * @param {string} token
 * @returns {string}
 */
export function canonicalNumberToken(token) {
  const raw = String(token ?? '');
  const parts = raw.split(/[.,]/);
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  const hasBoth = lastDot !== -1 && lastComma !== -1;
  const hasOne = lastDot !== -1 || lastComma !== -1;

  let decimalIndex = -1;
  if (hasBoth) {
    decimalIndex = Math.max(lastDot, lastComma);
  } else if (hasOne) {
    const separator = lastDot !== -1 ? '.' : ',';
    const looksGrouped = parts.length > 2
      || (parts.length === 2 && parts[1].length === 3);
    if (!looksGrouped) {
      decimalIndex = raw.lastIndexOf(separator);
    }
  }

  if (decimalIndex === -1) return parts.join('');
  const integer = raw.slice(0, decimalIndex).split(/[.,]/).join('');
  const fraction = raw.slice(decimalIndex + 1).split(/[.,]/).join('');
  return `${integer}.${fraction}`;
}

/**
 * Comprueba que dos textos contienen exactamente los mismos números (en valor,
 * ignorando el formato de separadores).
 * @param {string} sourceText
 * @param {string} translatedText
 * @returns {boolean}
 */
export function numbersPreserved(sourceText, translatedText) {
  const source = numberTokens(sourceText).map(canonicalNumberToken).sort();
  const translated = numberTokens(translatedText).map(canonicalNumberToken).sort();
  if (source.length !== translated.length) return false;
  return source.every((token, index) => token === translated[index]);
}
