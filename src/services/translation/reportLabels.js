/**
 * @fileoverview Traducción determinista (sin IA) de las etiquetas estructurales
 * del informe —etiquetas de horizonte, nombres de filas, escenarios del cash flow
 * y nota de resultados— usando el diccionario de la interfaz. Cualquier etiqueta
 * que no exista en el diccionario se devuelve como `null` para que la traduzca la IA.
 * @module services/translation/reportLabels
 */

import { getDictionary, normalizeLanguage } from '../../utils/i18n.js';

const dictionaries = new Map();
const lowerDictionaries = new Map();
const reverseDictionaries = new Map();
const capitalizedReverseDictionaries = new Map();
const preferredReverseDictionaries = new Map();
const lowerReverseDictionaries = new Map();

/**
 * Etiquetas del dominio del análisis ordenadas por prioridad. Cuando varios
 * textos españoles comparten la misma traducción (p. ej. "Free" ← "Gratis" y
 * "Libre"), se resuelve a favor de la etiqueta financiera (Libre, Caja, En total…)
 * y no de la de interfaz.
 */
const PREFERRED_SPANISH_LABELS = [
  'ÚLTIMOS 3 MESES', 'EN TODO EL AÑO', 'EN TODO EL AÑO (12 MESES)', 'EN TODO EL AÑO (Acumulado YTD)',
  'Ventas', 'Beneficio bruto', 'Beneficio Bruto', 'Beneficio operativo', 'Beneficio Operativo',
  'Beneficio neto', 'Beneficio Neto', 'EBT', 'Métrica', 'Valor',
  'Ajustado', 'Anterior Aj.', '% Ajustado', 'Normal', 'Anterior N.', '% Normal', 'ACCIONES', 'BPA',
  'Cash Flow', 'CAPEX', 'FCF', 'FCF/Acción', 'Dividendo', 'Libre',
  'Inversiones a corto plazo', 'Desinversiones', 'Adquisiciones', 'Deuda', 'Caja',
  'Recompras', 'Efectivo restringido', 'En total',
  'Asignación de capital', 'Asignación de Capital',
  'Flujo de caja libre', 'Flujo de Caja Libre', 'BPA ajustado', 'BPA Ajustado',
  '1: Recompras', '2: Cambios en la dirección', '3: Outlook', '4: Deuda',
  '5: Adquisiciones', '6: Dividendos', 'Operaciones corporativas',
  'Cosas a tener en cuenta', 'Cosas a tener en cuenta el próximo año',
];

function buildLowerMap(entries) {
  const map = new Map();
  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (!map.has(lower)) map.set(lower, value);
  }
  return map;
}

function capitalizeScore(source) {
  const words = String(source).split(/\s+/).filter((word) => /[A-Za-zÁÉÍÓÚÜÑ]/.test(word));
  if (!words.length) return 0;
  const capitalized = words.filter((word) => /^[A-ZÁÉÍÓÚÜÑ]/.test(word)).length;
  return capitalized / words.length;
}

function buildCapitalizedReverseMap(entries) {
  const map = new Map();
  const scores = new Map();
  for (const [source, target] of entries) {
    if (!/^[A-ZÁÉÍÓÚÜÑ]/.test(source)) continue;
    const score = capitalizeScore(source);
    if (!map.has(target) || score > scores.get(target)) {
      map.set(target, source);
      scores.set(target, score);
    }
  }
  return map;
}

function buildPreferredReverseMap(dictionary) {
  const map = new Map();
  for (const source of PREFERRED_SPANISH_LABELS) {
    const target = dictionary[source];
    if (target == null) continue;
    if (!map.has(target)) map.set(target, source);
  }
  return map;
}

function getLanguageCache(language) {
  if (!dictionaries.has(language)) {
    const dictionary = getDictionary(language);
    const entries = Object.entries(dictionary);
    const reverseEntries = entries.map(([source, target]) => [target, source]);
    dictionaries.set(language, new Map(entries));
    lowerDictionaries.set(language, buildLowerMap(entries));
    reverseDictionaries.set(language, new Map(reverseEntries));
    capitalizedReverseDictionaries.set(language, buildCapitalizedReverseMap(entries));
    preferredReverseDictionaries.set(language, buildPreferredReverseMap(dictionary));
    lowerReverseDictionaries.set(language, buildLowerMap(reverseEntries));
  }
  return {
    dictionary: dictionaries.get(language),
    lower: lowerDictionaries.get(language),
    reverse: reverseDictionaries.get(language),
    capitalizedReverse: capitalizedReverseDictionaries.get(language),
    preferredReverse: preferredReverseDictionaries.get(language),
    lowerReverse: lowerReverseDictionaries.get(language),
  };
}

function preserveCase(original, translated) {
  const isAllCaps = original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase();
  return isAllCaps ? translated.toUpperCase() : translated;
}

/**
 * Traduce un texto de español al idioma destino usando el diccionario.
 * @param {string} text
 * @param {string} targetLanguage
 * @returns {string|null}
 */
function forwardLookup(text, targetLanguage) {
  const cache = getLanguageCache(targetLanguage);
  if (cache.dictionary.has(text)) return cache.dictionary.get(text);
  const lower = cache.lower.get(text.toLowerCase());
  if (lower == null) return null;
  return preserveCase(text, lower);
}

/**
 * Restaura al español un texto escrito en el idioma origen.
 * @param {string} text
 * @param {string} sourceLanguage
 * @returns {string|null}
 */
function reverseLookup(text, sourceLanguage) {
  const cache = getLanguageCache(sourceLanguage);
  const preferred = cache.preferredReverse.get(text);
  if (preferred != null) return preferred;
  const startsUpper = /^[A-ZÁÉÍÓÚÜÑ]/.test(text);
  const maps = startsUpper ? [cache.capitalizedReverse, cache.reverse] : [cache.reverse];
  for (const map of maps) {
    const hit = map.get(text);
    if (hit != null) return hit;
  }
  const lower = cache.lowerReverse.get(text.toLowerCase());
  if (lower == null) return null;
  return preserveCase(text, lower);
}

const LABEL_PATTERNS = [
  { from: 'es', to: 'en', regex: /^ÚLTIMOS (\d+) MESES \((Q\d+)\)$/, replace: (m) => `LAST ${m[1]} MONTHS (${m[2]})` },
  { from: 'es', to: 'en', regex: /^ÚLTIMOS (\d+) MESES$/, replace: (m) => `LAST ${m[1]} MONTHS` },
  { from: 'es', to: 'en', regex: /^EN TODO EL AÑO \((\d+) MESES\)$/, replace: (m) => `FULL YEAR TO DATE (${m[1]} MONTHS)` },
  { from: 'es', to: 'en', regex: /^NOTA DE RESULTADOS: (.+)$/, replace: (m) => `RESULTS SCORE: ${m[1]}` },
  { from: 'en', to: 'es', regex: /^LAST (\d+) MONTHS \((Q\d+)\)$/, replace: (m) => `ÚLTIMOS ${m[1]} MESES (${m[2]})` },
  { from: 'en', to: 'es', regex: /^LAST (\d+) MONTHS$/, replace: (m) => `ÚLTIMOS ${m[1]} MESES` },
  { from: 'en', to: 'es', regex: /^FULL YEAR TO DATE \((\d+) MONTHS\)$/, replace: (m) => `EN TODO EL AÑO (${m[1]} MESES)` },
  { from: 'en', to: 'es', regex: /^FULL YEAR \((\d+) MONTHS\)$/, replace: (m) => `EN TODO EL AÑO (${m[1]} MESES)` },
  { from: 'en', to: 'es', regex: /^RESULTS SCORE: (.+)$/, replace: (m) => `NOTA DE RESULTADOS: ${m[1]}` },
];

function patternLookup(text, sourceLanguage, targetLanguage) {
  for (const pattern of LABEL_PATTERNS) {
    if (pattern.from !== sourceLanguage || pattern.to !== targetLanguage) continue;
    const match = text.match(pattern.regex);
    if (match) return pattern.replace(match);
  }
  return null;
}

/**
 * Traduce una etiqueta estructural del informe (nombre de fila, horizonte o nota)
 * sin usar IA. Devuelve `null` si no hay una traducción determinista disponible.
 * @param {string} text
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {string|null}
 */
export function resolveLocalLabel(text, sourceLanguage, targetLanguage) {
  const raw = String(text ?? '');
  if (!raw.trim()) return null;
  const source = normalizeLanguage(sourceLanguage);
  const target = normalizeLanguage(targetLanguage);
  if (source === target) return raw;

  const suffixMatch = raw.match(/^(.*?)(\*\d+)$/);
  const base = (suffixMatch ? suffixMatch[1] : raw).trim();
  const suffix = suffixMatch ? suffixMatch[2] : '';

  const translated = translatePivot(base, source, target);
  if (translated == null) return null;
  return `${translated}${suffix}`;
}

function translatePivot(base, source, target) {
  const spanish = source === 'es' ? base : reverseLookup(base, source);
  if (spanish != null) {
    const forward = target === 'es' ? spanish : forwardLookup(spanish, target);
    if (forward != null) return forward;
  }
  return patternLookup(base, source, target);
}

/**
 * Traduce una cabecera de escenario del cash flow conservando la coletilla `(WC=...)`.
 * @param {string} text
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {string|null}
 */
export function resolveLocalScenario(text, sourceLanguage, targetLanguage) {
  const raw = String(text ?? '');
  const wcIndex = raw.indexOf('(WC=');
  const base = (wcIndex === -1 ? raw : raw.slice(0, wcIndex)).trim();
  const suffix = wcIndex === -1 ? '' : ` ${raw.slice(wcIndex).trim()}`;
  const translated = resolveLocalLabel(base, sourceLanguage, targetLanguage);
  if (translated == null) return null;
  return `${translated}${suffix}`;
}
