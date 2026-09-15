/**
 * @fileoverview Normalización de la sección de cambios en la dirección para los exportadores.
 * Admite el formato nuevo (`executiveChanges`) y el antiguo (`ceoChange`) de informes ya guardados.
 * @module services/reportExport/executiveChanges
 */

const FALLBACK_TITLE = 'Cambios en la dirección';
const LEGACY_TITLE = 'Cambio de CEO';
const DEFAULT_ROLE = 'Directivo';

function normalizeChange(change) {
  if (!change || typeof change !== 'object') return null;
  return {
    role: change.role || DEFAULT_ROLE,
    text: change.text || null,
    announcementDate: change.announcementDate || null,
    effectiveDate: change.effectiveDate || null,
    reason: change.reason || null,
    oldExecutive: change.oldExecutive || null,
    newExecutive: change.newExecutive || null,
    source: change.source || null,
  };
}

export function getExecutiveChanges(conclusion) {
  const modern = conclusion?.executiveChanges;
  if (modern && Array.isArray(modern.changes) && modern.changes.length) {
    const changes = modern.changes.map(normalizeChange).filter(Boolean);
    if (changes.length) {
      return {
        title: modern.title || FALLBACK_TITLE,
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
    });
    if (change) {
      return {
        title: legacy.title || LEGACY_TITLE,
        changes: [change],
        disclaimer: legacy.disclaimer || null,
      };
    }
  }

  return null;
}
