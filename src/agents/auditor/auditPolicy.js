/**
 * @fileoverview Reglas de decisión del flujo de auditoría y corrección: qué errores
 * de la auditoría son corregibles, cómo se recorta el texto fuente para el auditor
 * y qué validaciones debe superar el informe corregido antes de sustituir al original.
 * @module agents/auditor/auditPolicy
 */

const DEFAULT_MAX_SOURCE_CHARS = 200000;
const MIN_SOURCE_CHARS = 60000;
const HEAD_RATIO = 0.35;
const FALSE_FLAG_VALUES = new Set(['false', '0', 'no', 'off', 'disabled', 'desactivado', 'n']);
const PRESERVED_FIELDS = [
  'ticker',
  'company',
  'formType',
  'isAnnual',
  'language',
  'fiscalQuarter',
  'fiscalYear',
  'reportingPeriod',
];

/**
 * Interpreta un interruptor de configuración (`.env`) de forma tolerante: ausente o vacío
 * devuelve el valor por defecto; false/0/no/off/disabled/desactivado apagan; el resto encienden.
 * @param {*} value - Valor leído de `process.env`.
 * @param {boolean} [defaultValue=true] - Valor cuando la variable no está definida o está vacía.
 * @returns {boolean} Estado del interruptor.
 */
export function isEnabledFlag(value, defaultValue = true) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  return !FALSE_FLAG_VALUES.has(normalized);
}

/**
 * Compara el informe original con el corregido y devuelve la lista de cambios aplicados
 * por el corrector (ruta, valor anterior y valor nuevo), acotada para el registro.
 * @param {Object} original - Informe antes de la corrección.
 * @param {Object} corrected - Informe corregido.
 * @param {Object} [options] - Límites del diff.
 * @param {number} [options.maxChanges=80] - Máximo de cambios registrados.
 * @param {number} [options.maxValueChars=400] - Máximo de caracteres por valor.
 * @returns {Array<{ruta: string, antes: *, despues: *}>} Cambios aplicados.
 */
export function diffReports(original, corrected, { maxChanges = 80, maxValueChars = 400 } = {}) {
  const changes = [];
  const summarize = (value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text === undefined) return null;
    return text.length > maxValueChars ? `${text.slice(0, maxValueChars)}…` : text;
  };
  const walk = (before, after, base) => {
    if (changes.length >= maxChanges) return;
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    for (const key of keys) {
      if (changes.length >= maxChanges) return;
      const path = base ? `${base}.${key}` : key;
      const beforeValue = before?.[key];
      const afterValue = after?.[key];
      if (beforeValue && afterValue && typeof beforeValue === 'object' && typeof afterValue === 'object') {
        walk(beforeValue, afterValue, path);
      } else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes.push({ ruta: path, antes: summarize(beforeValue), despues: summarize(afterValue) });
      }
    }
  };
  walk(original ?? {}, corrected ?? {}, '');
  return changes;
}

/**
 * Normaliza una gravedad de la auditoría (mayúsculas, tildes) para compararla.
 * @param {string} value - Gravedad declarada por el auditor.
 * @returns {string} Gravedad sin acentos y en minúsculas.
 */
export function normalizeGravity(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Indica si una gravedad justifica corregir el informe (grave o menor).
 * Los errores cosméticos no disparan la corrección.
 * @param {string} value - Gravedad declarada por el auditor.
 * @returns {boolean} Verdadero si el error es corregible.
 */
export function isFixableGravity(value) {
  const gravity = normalizeGravity(value);
  return gravity.startsWith('grave') || gravity.startsWith('menor');
}

/**
 * Devuelve los errores de la auditoría cuya gravedad es corregible.
 * @param {Object|null} audit - JSON devuelto por el auditor.
 * @returns {Array<Object>} Errores graves y menores.
 */
export function collectFixableErrors(audit) {
  const errors = Array.isArray(audit?.errores) ? audit.errores : [];
  return errors.filter((error) => isFixableGravity(error?.gravedad));
}

/**
 * Indica si la auditoría exige una corrección del informe.
 * @param {Object|null} audit - JSON devuelto por el auditor.
 * @returns {boolean} Verdadero si hay errores graves o menores.
 */
export function auditNeedsFix(audit) {
  return collectFixableErrors(audit).length > 0;
}

/**
 * Presupuesto de texto fuente del auditor: el límite configurado (`AI_AUDIT_MAX_SOURCE_CHARS`,
 * 200000 por defecto) menos el espacio que ocupan las reglas `.md` del analista, que también
 * recibe, con un mínimo de 60000 caracteres para que la fuente nunca desaparezca. Con las
 * reglas habituales (45-55k) el filing enviado queda en ~145-155k caracteres: conserva
 * cabecera, estados financieros y notas (cola) y recorta el centro (Item 1A, legal).
 * @param {number} [rulesChars=0] - Caracteres que ocupan las reglas de análisis.
 * @returns {number} Máximo de caracteres del filing para el auditor.
 */
export function auditSourceLimit(rulesChars = 0) {
  const configured = Number(process.env.AI_AUDIT_MAX_SOURCE_CHARS);
  const base = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_MAX_SOURCE_CHARS;
  const reserved = Math.max(0, Number(rulesChars) || 0);
  return Math.max(MIN_SOURCE_CHARS, base - reserved);
}

/**
 * Recorta el texto fuente si supera el presupuesto del auditor: conserva el inicio
 * (presentación y negocio) y el final (estados financieros y notas, donde están las
 * cifras) e inserta una marca con lo omitido.
 * @param {string} source - Texto completo del filing.
 * @param {number} [maxChars] - Presupuesto de caracteres (por defecto `AI_AUDIT_MAX_SOURCE_CHARS` o 200000).
 * @returns {{text: string, truncated: boolean, omittedChars: number, maxChars: number}}
 */
export function capAuditSource(source, maxChars = undefined) {
  const text = String(source ?? '');
  const configured = maxChars ?? Number(process.env.AI_AUDIT_MAX_SOURCE_CHARS);
  const limit = Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_SOURCE_CHARS;

  if (text.length <= limit) {
    return { text, truncated: false, omittedChars: 0, maxChars: limit };
  }

  const headLength = Math.floor(limit * HEAD_RATIO);
  const tailLength = limit - headLength;
  const omittedChars = text.length - limit;
  const marker = `\n\n[... TEXTO OMITIDO: ${omittedChars} caracteres del centro del documento por el límite de contexto del auditor ...]\n\n`;
  return {
    text: `${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`,
    truncated: true,
    omittedChars,
    maxChars: limit,
  };
}

/**
 * Valida el informe corregido y restaura los metadatos que el corrector no debe alterar.
 * @param {Object|null} candidate - Informe devuelto por el corrector.
 * @param {Object} original - Informe auditado original.
 * @returns {{ok: boolean, reason?: string, report?: Object}} Resultado de la validación.
 */
export function validateCorrectedReport(candidate, original) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, reason: 'no_objeto' };
  }
  if (!Array.isArray(candidate.horizons) || candidate.horizons.length === 0) {
    return { ok: false, reason: 'sin_horizontes' };
  }
  const originalHorizons = Array.isArray(original?.horizons) ? original.horizons : [];
  if (candidate.horizons.length !== originalHorizons.length) {
    return { ok: false, reason: 'horizontes_alterados' };
  }

  const report = { ...candidate };
  for (const field of PRESERVED_FIELDS) {
    const missing = report[field] === null || report[field] === undefined;
    if (missing && original?.[field] !== null && original?.[field] !== undefined) {
      report[field] = original[field];
    }
  }
  for (const field of ['rating', 'conclusion', 'quarterNotes']) {
    const value = report[field];
    const empty = value === null || value === undefined
      || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
    if (empty && original?.[field]) report[field] = original[field];
  }

  return { ok: true, report };
}
