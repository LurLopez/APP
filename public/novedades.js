/**
 * =========================================================================
 * MÓDULO DE NOVEDADES Y NOTAS DE VERSIÓN (CIFRA TERMINAL)
 * =========================================================================
 * 
 * ¿CÓMO AÑADIR UNA NUEVA VERSIÓN?
 * -------------------------------------------------------------------------
 * Cuando subas una nueva versión a la aplicación:
 * 1. Añade un nuevo bloque al principio del array `NOVEDADES_DATA` a continuación.
 * 2. Asigna `esUltima: true` a la nueva versión (y `false` a la anterior).
 * 3. Escribe el número de versión, fecha, título, explicación y lista de cambios.
 * 4. ¡Listo! Se actualizará automáticamente en la pestaña de Novedades.
 * =========================================================================
 */

const NOVEDADES_DATA = [
  {
    version: 'v0.0.1',
    fecha: '11 de Septiembre, 2026',
    titulo: 'Generación de la web básica',
    esUltima: true,
    explicacion: 'Primera generación de la web básica de Cifra Research.',
    cambios: []
  }
];

// Helper para escapar HTML y evitar inyecciones
function escapeHtmlNovedades(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const NovedadesModule = {
  data: NOVEDADES_DATA,
  expandedVersions: new Set(['v0.0.1']), // La última versión inicia abierta por defecto

  init() {
    this.render();
  },

  toggleVersion(version) {
    if (this.expandedVersions.has(version)) {
      this.expandedVersions.delete(version);
    } else {
      this.expandedVersions.add(version);
    }
    this.updateAccordionUI();
  },

  expandAll() {
    this.data.forEach(item => this.expandedVersions.add(item.version));
    this.updateAccordionUI();
  },

  collapseAll() {
    this.expandedVersions.clear();
    this.updateAccordionUI();
  },

  updateAccordionUI() {
    const cards = document.querySelectorAll('.novedad-card');
    cards.forEach(card => {
      const ver = card.dataset.version;
      const isOpen = this.expandedVersions.has(ver);
      card.classList.toggle('is-open', isOpen);
      
      const headerBtn = card.querySelector('.novedad-card-head');
      if (headerBtn) {
        headerBtn.setAttribute('aria-expanded', String(isOpen));
      }
      
      const body = card.querySelector('.novedad-card-body');
      if (body) {
        body.hidden = !isOpen;
      }
    });
  },

  filterVersions(query) {
    const q = (query || '').toLowerCase().trim();
    const container = document.querySelector('#novedades-list');
    if (!container) return;

    if (!q) {
      this.renderList(this.data);
      return;
    }

    const filtered = this.data.filter(item => {
      const inVersion = item.version.toLowerCase().includes(q);
      const inTitle = item.titulo.toLowerCase().includes(q);
      const inExpl = (item.explicacion || '').toLowerCase().includes(q);
      const inChanges = (item.cambios || []).some(c => c.texto.toLowerCase().includes(q));
      return inVersion || inTitle || inExpl || inChanges;
    });

    // Al filtrar, expandir las que coincidan para ver los resultados
    filtered.forEach(item => this.expandedVersions.add(item.version));
    this.renderList(filtered, q);
  },

  renderList(items, searchQuery = '') {
    const container = document.querySelector('#novedades-list');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="novedades-empty">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
          <p>No se han encontrado versiones que coincidan con <strong>"${escapeHtmlNovedades(searchQuery)}"</strong>.</p>
          <button type="button" class="secondary-button" id="novedades-clear-filter">Restablecer búsqueda</button>
        </div>
      `;
      document.querySelector('#novedades-clear-filter')?.addEventListener('click', () => {
        const input = document.querySelector('#novedades-search-input');
        if (input) input.value = '';
        this.renderList(this.data);
      });
      return;
    }

    container.innerHTML = items.map((item) => {
      const isOpen = this.expandedVersions.has(item.version);
      const badgeHtml = item.esUltima 
        ? `<span class="novedad-status-badge latest">Última versión</span>` 
        : '';

      const tagLabels = {
        nuevo: 'Nuevo',
        mejora: 'Mejora',
        correccion: 'Corrección',
        arreglo: 'Corrección'
      };

      const cambiosHtml = (item.cambios && item.cambios.length > 0)
        ? `
          <div class="novedad-cambios-wrap">
            <h4 class="novedad-cambios-title">Cambios introducidos:</h4>
            <ul class="novedad-cambios-list">
              ${item.cambios.map(c => `
                <li class="novedad-cambio-item">
                  <span class="novedad-tag tag-${escapeHtmlNovedades(c.tipo)}">${tagLabels[c.tipo] || 'Cambio'}</span>
                  <span class="novedad-cambio-text">${escapeHtmlNovedades(c.texto)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : '';

      return `
        <article class="novedad-card ${isOpen ? 'is-open' : ''}" data-version="${escapeHtmlNovedades(item.version)}">
          <div class="novedad-card-head" role="button" tabindex="0" aria-expanded="${isOpen}" aria-controls="novedad-body-${escapeHtmlNovedades(item.version)}">
            <div class="novedad-head-left">
              <div class="novedad-meta-row">
                <span class="novedad-version-tag">${escapeHtmlNovedades(item.version)}</span>
                ${badgeHtml}
                <span class="novedad-date">${escapeHtmlNovedades(item.fecha)}</span>
              </div>
              <h3 class="novedad-title" title="Haz clic para ver la explicación detallada">
                ${escapeHtmlNovedades(item.titulo)}
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
          <div class="novedad-card-body" id="novedad-body-${escapeHtmlNovedades(item.version)}" ${!isOpen ? 'hidden' : ''}>
            <div class="novedad-body-content">
              <div class="novedad-explicacion-block">
                <h4 class="novedad-subheading">Explicación de esta versión:</h4>
                <p class="novedad-explicacion">${escapeHtmlNovedades(item.explicacion)}</p>
              </div>
              ${cambiosHtml}
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Asignar listeners a las cabeceras/títulos para expandir/contraer
    container.querySelectorAll('.novedad-card-head').forEach(head => {
      const card = head.closest('.novedad-card');
      const version = card?.dataset.version;
      if (!version) return;

      const handleToggle = (e) => {
        e.preventDefault();
        this.toggleVersion(version);
      };

      head.addEventListener('click', handleToggle);
      head.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleToggle(e);
        }
      });
    });
  },

  render() {
    const root = document.querySelector('#novedades-section');
    if (!root) return;

    // Actualizar badge de versión en la cabecera si existe
    const topBadge = document.querySelector('#novedades-version-badge');
    if (topBadge && this.data[0]) {
      topBadge.textContent = `${this.data[0].version} · Actual`;
    }

    root.innerHTML = `
      <div class="novedades-container">
        <div class="novedades-toolbar">
          <div class="novedades-toolbar-left">
            <span class="novedades-count"><strong>${this.data.length}</strong> versiones publicadas</span>
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

    // Renderizar la lista de versiones
    this.renderList(this.data);

    // Controles superiores
    document.querySelector('#novedades-expand-all')?.addEventListener('click', () => this.expandAll());
    document.querySelector('#novedades-collapse-all')?.addEventListener('click', () => this.collapseAll());

    // Buscador
    const searchInput = document.querySelector('#novedades-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.filterVersions(e.target.value);
    });
  }
};

window.NovedadesModule = NovedadesModule;

// Montar automáticamente cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NovedadesModule.init());
} else {
  NovedadesModule.init();
}
