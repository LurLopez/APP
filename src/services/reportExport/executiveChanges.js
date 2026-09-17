/**
 * @fileoverview Normalización de la sección de cambios en la dirección para los exportadores.
 * Admite el formato nuevo (`executiveChanges`) y el antiguo (`ceoChange`) de informes ya guardados.
 * @module services/reportExport/executiveChanges
 */

import { t, normalizeLanguage } from '../../utils/i18n.js';

const FALLBACK_TITLE = 'Cambios en la dirección';
const LEGACY_TITLE = 'Cambio de CEO';
const DEFAULT_ROLE = 'Directivo';

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
    role: change.role || t(DEFAULT_ROLE, null, language),
    text: change.text || null,
    announcementDate: change.announcementDate || null,
    effectiveDate: change.effectiveDate || null,
    reason: change.reason || null,
    oldExecutive: change.oldExecutive || null,
    newExecutive: change.newExecutive || null,
    source: change.source || null,
  };
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
    const changes = modern.changes.map((change) => normalizeChange(change, lang)).filter(Boolean);
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
    if (change) {
      return {
        title: legacy.title || t(LEGACY_TITLE, null, lang),
        changes: [change],
        disclaimer: legacy.disclaimer || null,
      };
    }
  }

  return null;
}
