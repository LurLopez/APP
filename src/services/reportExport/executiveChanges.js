/**
 * @fileoverview Normalización de la sección de cambios en la dirección para los exportadores.
 * Admite el formato nuevo (`executiveChanges`) y el antiguo (`ceoChange`) de informes ya guardados.
 * @module services/reportExport/executiveChanges
 */

import { t, normalizeLanguage } from '../../utils/i18n.js';

const FALLBACK_TITLE = 'Cambios en la dirección';
const LEGACY_TITLE = 'Cambio de CEO';
const DEFAULT_ROLE = 'Directivo';

const NO_INFO_RE = /^(?:no\s+(?:public(?:ly)?\s+)?information(?:\s+(?:is|was))?\s+available|no\s+information(?:\s+(?:is|was))?\s+available|no\s+se\s+(?:dispone|dispuso|encontro|encontraron|encuentra|ha\s+(?:encontrado|publicado|facilitado|indicado|especificado|detallado|mencionado|reportado|revelado|proporcionado)|han\s+(?:encontrado|publicado|facilitado|indicado|especificado|detallado|mencionado|reportado|revelado|proporcionado)|publico|publicaron|facilito|facilitaron|indico|indicaron|especifico|especificaron|detallo|detallaron|menciona|mencionaron|reporto|reportaron|revelo|revelaron|proporciono|proporcionaron|conoce|identifico|identificaron)[^.]*|no\s+(?:consta|figura|existe|hay|aplica|disponible|especificad[oa]|indicad[oa]|revelad[oa]|proporcionad[oa]|detallad[oa])[^.]*|sin\s+(?:informacion|datos|detalle)[^.]*|(?:informacion|datos)\s+no\s+disponible[^.]*|no\s+info(?:rmacion)?|not\s+(?:available|disclosed|stated|provided|specified|applicable|found|known|reported|mentioned)[^.]*|unknown|desconocid[oa]|none|null|undefined|n\/?a|no\s+data|[-—])$/i;

/**
 * Indica si un valor de texto es un relleno de "sin información" (no debe mostrarse).
 * @param {*} value
 * @returns {boolean}
 */
export function isNoInfoValue(value) {
  if (value == null) return true;
  if (typeof value === 'object') return false;
  let text = String(value).trim();
  if (!text) return true;
  text = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.\s]+$/, '');
  if (NO_INFO_RE.test(text)) return true;
  const firstSentence = text.split(/[.!?]/)[0].trim();
  return firstSentence !== text && NO_INFO_RE.test(firstSentence);
}

const EXEC_PERSON_FIELDS = ['name', 'role', 'tenureStart', 'salesDuringTenure', 'whereTheyGo', 'policies', 'origin', 'trackRecord', 'commitments'];

function normalizeExecutivePerson(person) {
  if (!person || typeof person !== 'object') return null;
  const normalized = {};
  EXEC_PERSON_FIELDS.forEach((key) => {
    const value = person[key];
    if (isNoInfoValue(value)) return;
    normalized[key] = value;
  });
  return Object.keys(normalized).length ? normalized : null;
}

/**
 * Etiquetas de los campos de los bloques de directivos (antiguo/nuevo) en el idioma indicado.
 * @param {string} [language]
 * @returns {Array<[string, string]>} Pares [etiqueta, clave del objeto persona].
 */
export function getExecutiveFieldLabels(language = 'es') {
  const lang = normalizeLanguage(language);
  return [
    [t('Inicio en el cargo', null, lang), 'tenureStart'],
    [t('Ventas durante su mandato', null, lang), 'salesDuringTenure'],
    [t('A dónde pasa', null, lang), 'whereTheyGo'],
    [t('Políticas de su etapa', null, lang), 'policies'],
    [t('De dónde viene', null, lang), 'origin'],
    [t('Trayectoria previa', null, lang), 'trackRecord'],
    [t('Qué ha anunciado', null, lang), 'commitments'],
  ];
}

function normalizeChange(change, language = 'es') {
  if (!change || typeof change !== 'object') return null;
  return {
    role: isNoInfoValue(change.role) ? t(DEFAULT_ROLE, null, language) : change.role,
    text: isNoInfoValue(change.text) ? null : change.text,
    announcementDate: isNoInfoValue(change.announcementDate) ? null : change.announcementDate,
    effectiveDate: isNoInfoValue(change.effectiveDate) ? null : change.effectiveDate,
    reason: isNoInfoValue(change.reason) ? null : change.reason,
    oldExecutive: normalizeExecutivePerson(change.oldExecutive),
    newExecutive: normalizeExecutivePerson(change.newExecutive),
    source: isNoInfoValue(change.source) ? null : change.source,
  };
}

function changeHasInfo(change) {
  return Boolean(change)
    && Boolean(change.oldExecutive || change.newExecutive || change.text || change.reason || change.announcementDate || change.effectiveDate);
}

/**
 * Normaliza la sección de cambios en la dirección.
 * @param {object} conclusion - Conclusión del informe.
 * @param {string} [language] - Idioma del informe para títulos por defecto.
 * @returns {object|null}
 */
export function getExecutiveChanges(conclusion, language = 'es') {
  const lang = normalizeLanguage(language);
  const modern = conclusion?.executiveChanges;
  if (modern && Array.isArray(modern.changes) && modern.changes.length) {
    const changes = modern.changes.map((change) => normalizeChange(change, lang)).filter(changeHasInfo);
    if (changes.length) {
      return {
        title: modern.title || t(FALLBACK_TITLE, null, lang),
        changes,
        disclaimer: modern.disclaimer || null,
      };
    }
  }

  const legacy = conclusion?.ceoChange;
  if (legacy && typeof legacy === 'object') {
    const change = normalizeChange({
      role: 'CEO',
      text: legacy.text,
      announcementDate: legacy.announcementDate,
      effectiveDate: legacy.effectiveDate,
      reason: legacy.reason,
      oldExecutive: legacy.oldCeo,
      newExecutive: legacy.newCeo,
      source: legacy.source,
    }, lang);
    if (changeHasInfo(change)) {
      return {
        title: legacy.title || t(LEGACY_TITLE, null, lang),
        changes: [change],
        disclaimer: legacy.disclaimer || null,
      };
    }
  }

  return null;
}
