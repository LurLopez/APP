/**
 * @fileoverview Inventario de campos textuales del informe financiero (10-Q y 10-K)
 * y utilidades para recorrerlos: extracción de los textos que debe traducir la IA,
 * inyección de las traducciones y localización de etiquetas estructurales.
 * Las claves de ruta usan `*` para los índices de array (ej. `horizons.*.sales.notes.*`).
 * @module services/translation/reportTextFields
 */

/**
 * Textos narrativos que siempre traduce la IA. Los números que contengan se
 * validan después para garantizar que no cambian.
 */
export const FREE_TEXT_PATHS = new Set([
  'periodTitle',
  'rating.rationale',
  'horizons.*.sales.eps',
  'horizons.*.sales.shares',
  'horizons.*.sales.notes.*',
  'horizons.*.cashFlow.notes.*',
  'horizons.*.capital.notes.*',
  'horizons.*.capital.verification',
  'conclusion.repurchases.text',
  'conclusion.repurchases.programChanges',
  'conclusion.repurchases.programAuthorization',
  'conclusion.repurchases.authorizationRemaining',
  'conclusion.repurchases.authorizationExpiry',
  'conclusion.repurchases.shareCountEvolution',
  'conclusion.repurchases.bpaImpact',
  'conclusion.repurchases.futureProjection',
  'conclusion.executiveChanges.disclaimer',
  'conclusion.executiveChanges.changes.*.text',
  'conclusion.executiveChanges.changes.*.role',
  'conclusion.executiveChanges.changes.*.reason',
  'conclusion.executiveChanges.changes.*.source',
  'conclusion.executiveChanges.changes.*.oldExecutive.role',
  'conclusion.executiveChanges.changes.*.oldExecutive.salesDuringTenure',
  'conclusion.executiveChanges.changes.*.oldExecutive.whereTheyGo',
  'conclusion.executiveChanges.changes.*.oldExecutive.policies',
  'conclusion.executiveChanges.changes.*.newExecutive.origin',
  'conclusion.executiveChanges.changes.*.newExecutive.trackRecord',
  'conclusion.executiveChanges.changes.*.newExecutive.commitments',
  'conclusion.outlook.text',
  'conclusion.outlook.fcfAnalysis',
  'conclusion.outlook.riskFactors',
  'conclusion.outlook.efficiencyPlans',
  'conclusion.debt.text',
  'conclusion.debt.refinancingAnalysis',
  'conclusion.debt.refinancingImpact',
  'conclusion.debt.allDebtAverageRateSource',
  'conclusion.acquisitions.text',
  'conclusion.dividends.text',
  'conclusion.watchlist.items.*',
]);

/**
 * Etiquetas estructurales que se intentan traducir primero con el diccionario
 * (coste cero). Solo si no hay traducción determinista se envían a la IA.
 */
export const LABEL_PATHS = new Set([
  'horizons.*.label',
  'horizons.*.sales.rows.*.name',
  'horizons.*.cashFlow.rows.*.name',
  'horizons.*.cashFlow.scenarios.*',
  'horizons.*.capital.rows.*.name',
  'conclusion.repurchases.title',
  'conclusion.executiveChanges.title',
  'conclusion.outlook.title',
  'conclusion.debt.title',
  'conclusion.acquisitions.title',
  'conclusion.dividends.title',
  'conclusion.watchlist.title',
  'rating.label',
]);

/**
 * Extractos oficiales de la SEC: solo se traducen los títulos, resúmenes,
 * cabeceras y celdas con texto; las celdas puramente numéricas o de fechas se
 * copian tal cual llegan del informe original.
 */
export const SNIPPET_PREFIXES = [
  'conclusion.repurchases.secSnippet',
  'conclusion.outlook.secSnippet',
  'conclusion.debt.secSnippet',
  'conclusion.debt.secTable',
];

const LETTER_PATTERN = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;

/**
 * Convierte una ruta (array de claves e índices) en su clave canónica con `*`.
 * @param {Array<string|number>} path
 * @returns {string}
 */
export function pathKey(path) {
  return path.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.');
}

/**
 * Recorre todas las hojas de texto de un objeto o array.
 * @param {*} node
 * @param {(text: string, path: Array<string|number>) => void} visitor
 * @param {Array<string|number>} [path]
 */
export function walkStringLeaves(node, visitor, path = []) {
  if (typeof node === 'string') {
    visitor(node, path);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkStringLeaves(item, visitor, [...path, index]));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walkStringLeaves(value, visitor, [...path, key]);
    }
  }
}

/**
 * Escribe un valor en la ruta indicada de un objeto ya existente.
 * @param {object} root
 * @param {Array<string|number>} path
 * @param {string} value
 */
export function setByPath(root, path, value) {
  let target = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    target = target?.[path[i]];
    if (target == null) return;
  }
  const last = path[path.length - 1];
  if (target && typeof target === 'object' && last in target) {
    target[last] = value;
  }
}

function isSnippetPath(key) {
  return SNIPPET_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}.`));
}

/**
 * ¿Es un texto libre dentro de un extracto oficial de la SEC?
 * Se traducen títulos, resúmenes, cabeceras y celdas con letras.
 * @param {string} key
 * @param {string} text
 * @returns {boolean}
 */
export function isSnippetFreeText(key, text) {
  if (!isSnippetPath(key)) return false;
  if (/\.(title|summary)$/.test(key)) return true;
  if (/\.headers\.\*$/.test(key)) return true;
  if (/\.rows\.\*\.\*$/.test(key) || /\.rows\.\*$/.test(key)) return LETTER_PATTERN.test(text);
  return false;
}

/**
 * Extrae los textos que debe traducir la IA. Las etiquetas estructurales solo se
 * incluyen si el diccionario no puede resolverlas (el llamante pasa `canResolveLabel`).
 * @param {object} report
 * @param {(text: string, key: string) => boolean} canResolveLabel
 * @returns {Array<{ path: Array<string|number>, text: string }>}
 */
export function collectTranslatableTexts(report, canResolveLabel) {
  const entries = [];
  walkStringLeaves(report, (text, path) => {
    if (!text.trim()) return;
    const key = pathKey(path);
    if (FREE_TEXT_PATHS.has(key) || isSnippetFreeText(key, text)) {
      entries.push({ path, text });
      return;
    }
    if (LABEL_PATHS.has(key) && !canResolveLabel(text, key)) {
      entries.push({ path, text });
    }
  });
  return entries;
}

/**
 * Inyecta las traducciones devueltas por la IA en el informe clonado.
 * @param {object} report
 * @param {Array<{ path: Array<string|number>, text: string }>} entries
 * @param {string[]} translations
 */
export function applyTranslations(report, entries, translations) {
  entries.forEach((entry, index) => {
    const value = translations[index];
    if (typeof value !== 'string' || !value.trim()) return;
    setByPath(report, entry.path, value.trim());
  });
}

/**
 * Aplica la traducción determinista a las etiquetas estructurales del informe.
 * @param {object} report
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @param {(text: string, key: string) => string|null} resolveLabel
 */
export function applyLocalLabels(report, sourceLanguage, targetLanguage, resolveLabel) {
  if (sourceLanguage === targetLanguage) return;
  walkStringLeaves(report, (text, path) => {
    const key = pathKey(path);
    if (!LABEL_PATHS.has(key)) return;
    const resolved = resolveLabel(text, key);
    if (resolved != null && resolved !== text) setByPath(report, path, resolved);
  });
}
