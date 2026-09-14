/**
 * @fileoverview Generadores de plantillas HTML y formateo visual para la sección de Novedades.
 * @module NovedadesRender
 */

(function () {
  'use strict';

  /**
   * Sanitiza cadenas de texto para prevenir inyecciones HTML.
   * @param {*} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const TAG_LABELS = {
    nuevo: 'Nuevo',
    mejora: 'Mejora',
    correccion: 'Corrección',
    arreglo: 'Corrección',
  };

  /**
   * Genera el bloque HTML de la lista de cambios de una versión.
   * @param {Array<Object>} cambios
   * @returns {string}
   */
  function renderChangesBlock(cambios) {
    if (!cambios || cambios.length === 0) return '';
    const items = cambios.map((c) => `
      <li class="novedad-cambio-item">
        <span class="novedad-tag tag-${escapeHtml(c.tipo)}">${TAG_LABELS[c.tipo] || 'Cambio'}</span>
        <span class="novedad-cambio-text">${escapeHtml(c.texto)}</span>
      </li>
    `).join('');

    return `
      <div class="novedad-cambios-wrap">
        <h4 class="novedad-cambios-title">Cambios introducidos:</h4>
        <ul class="novedad-cambios-list">${items}</ul>
      </div>
    `;
  }

  /**
   * Genera la tarjeta HTML para una versión concreta.
   * @param {Object} item
   * @param {boolean} isOpen
   * @returns {string}
   */
  function renderCard(item, isOpen) {
    const versionEsc = escapeHtml(item.version);
    const badgeHtml = item.esUltima ? '<span class="novedad-status-badge latest">Última versión</span>' : '';
    const cambiosHtml = renderChangesBlock(item.cambios);

    return `
      <article class="novedad-card ${isOpen ? 'is-open' : ''}" data-version="${versionEsc}">
        <div class="novedad-card-head" role="button" tabindex="0" aria-expanded="${isOpen}" aria-controls="novedad-body-${versionEsc}">
          <div class="novedad-head-left">
            <div class="novedad-meta-row">
              <span class="novedad-version-tag">${versionEsc}</span>
              ${badgeHtml}
              <span class="novedad-date">${escapeHtml(item.fecha)}</span>
            </div>
            <h3 class="novedad-title" title="Haz clic para ver la explicación detallada">
              ${escapeHtml(item.titulo)}
            </h3>
          </div>
          <div class="novedad-head-right">
            <span class="novedad-toggle-hint">Explicación</span>
            <span class="novedad-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </div>
        </div>
        <div class="novedad-card-body" id="novedad-body-${versionEsc}" ${!isOpen ? 'hidden' : ''}>
          <div class="novedad-body-content">
            <div class="novedad-explicacion-block">
              <h4 class="novedad-subheading">Explicación de esta versión:</h4>
              <p class="novedad-explicacion">${escapeHtml(item.explicacion)}</p>
            </div>
            ${cambiosHtml}
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Renderiza el estado vacío cuando la búsqueda no devuelve resultados.
   * @param {string} query
   * @returns {string}
   */
  function renderEmpty(query) {
    return `
      <div class="novedades-empty">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
        <p>No se han encontrado versiones que coincidan con <strong>"${escapeHtml(query)}"</strong>.</p>
        <button type="button" class="secondary-button" id="novedades-clear-filter">Restablecer búsqueda</button>
      </div>
    `;
  }

  /**
   * Renderiza el contenedor con barra de herramientas y buscador.
   * @param {number} totalCount
   * @returns {string}
   */
  function renderContainer(totalCount) {
    return `
      <div class="novedades-container">
        <div class="novedades-toolbar">
          <div class="novedades-toolbar-left">
            <span class="novedades-count"><strong>${totalCount}</strong> versiones publicadas</span>
            <div class="novedades-view-controls">
              <button type="button" class="novedades-action-btn" id="novedades-expand-all">Expandir todas</button>
              <span class="novedades-dot">·</span>
              <button type="button" class="novedades-action-btn" id="novedades-collapse-all">Contraer todas</button>
            </div>
          </div>
          <div class="novedades-toolbar-right">
            <div class="novedades-search-box">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
              <input type="search" id="novedades-search-input" placeholder="Buscar mejoras o versiones..." aria-label="Buscar en novedades">
            </div>
          </div>
        </div>
        <div class="novedades-list" id="novedades-list"></div>
      </div>
    `;
  }

  window.NovedadesRender = {
    escapeHtml,
    renderCard,
    renderEmpty,
    renderContainer,
  };
})();
