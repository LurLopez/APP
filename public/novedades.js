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
    version: 'v1.5.0',
    fecha: '10 de Septiembre, 2026',
    titulo: 'Presentaciones de resultados integradas en el análisis',
    esUltima: true,
    explicacion: 'El outlook/guidance casi nunca aparece en el 10-K: se publica en la presentación o comunicado de resultados del 8-K. A partir de ahora el analista recibe el 10-K/10-Q junto con la presentación de resultados asociada y usa ambas fuentes para el informe. En la pestaña de informes trimestrales aparecen ahora los dos documentos de cada periodo.',
    cambios: [
      { tipo: 'nuevo', texto: 'Detección automática del 8-K de resultados (item 2.02) vinculado a cada 10-Q/10-K y de sus presentaciones/comunicados (exhibits ex-99).' },
      { tipo: 'nuevo', texto: 'El analista IA recibe el 10-K/10-Q y la presentación de resultados y extrae el outlook/guidance de la presentación cuando el 10-K no lo incluye.' },
      { tipo: 'nuevo', texto: 'Botón "Presentación" en cada informe de la pestaña de informes trimestrales: abre el deck de resultados real publicado en la web de inversores de la empresa (y, si no existe, el comunicado del 8-K).' },
      { tipo: 'nuevo', texto: 'El analista IA recibe el 10-K/10-Q, el deck de la web de inversores y el comunicado del 8-K, y extrae el outlook/guidance de la presentación cuando el 10-K no lo incluye.' },
      { tipo: 'nuevo', texto: 'Subida manual opcional de la presentación junto al 10-Q/10-K para que la IA la use como documento complementario.' }
    ]
  },
  {
    version: 'v1.4.0',
    fecha: '10 de Septiembre, 2026',
    titulo: 'Sistema de valoración de análisis y reporte de incidencias',
    esUltima: false,
    explicacion: 'En esta versión incorporamos mecanismos directos de feedback para mejorar continuamente la precisión de los análisis financieros realizados por los agentes inteligentes de Cifra. Los usuarios ahora pueden calificar cada análisis fundamental completado y reportar cualquier discrepancia o anomalía encontrada.',
    cambios: [
      { tipo: 'nuevo', texto: 'Barra de valoración interactiva de 1 a 5 estrellas al pie de cada informe generado.' },
      { tipo: 'nuevo', texto: 'Modal de reporte de incidencias con categorías específicas (cifras incongruentes, periodos erróneos, datos faltantes, clasificaciones).' },
      { tipo: 'mejora', texto: 'Cálculo dinámico y visualización de la puntuación media y número total de valoraciones comunitarias.' },
      { tipo: 'mejora', texto: 'Persistencia y carga inmediata de valoraciones al consultar análisis guardados en el historial.' }
    ]
  },
  {
    version: 'v1.3.0',
    fecha: '9 de Septiembre, 2026',
    titulo: 'Exportación multi-formato (Word/ODT) y visor web de análisis',
    esUltima: false,
    explicacion: 'Se expanden sustancialmente las opciones para consultar y descargar los análisis fundamentales generados. Además de la descarga en PDF, ahora es posible exportar en formatos editables y revisar cualquier informe previo directamente en pantalla.',
    cambios: [
      { tipo: 'nuevo', texto: 'Exportación de informes a documentos Microsoft Word (.docx) y OpenDocument (.odt).' },
      { tipo: 'nuevo', texto: 'Apertura de análisis del histórico en la vista web interactiva completa al pulsar sobre la fila.' },
      { tipo: 'nuevo', texto: 'Filtro de empresas con desplegable inteligente y logotipos oficiales en el historial de análisis.' },
      { tipo: 'correccion', texto: 'Optimización de consultas SQL para el listado ordenado de empresas analizadas.' },
      { tipo: 'mejora', texto: 'Estilo visual del informe web con diseño cebrado y jerarquía idéntica al documento PDF.' }
    ]
  },
  {
    version: 'v1.2.0',
    fecha: '8 de Septiembre, 2026',
    titulo: 'Unificación de la aplicación y pipeline de análisis SEC EDGAR',
    esUltima: false,
    explicacion: 'Rediseño integral de la arquitectura frontend hacia una experiencia SPA unificada. Se integra el flujo de análisis fundamental autónomo directamente con los reportes oficiales 10-Q de la SEC sin necesidad de descargas manuales.',
    cambios: [
      { tipo: 'nuevo', texto: 'Pipeline autónomo de análisis con 3 agentes especializados (verificación de origen, sector y analista principal).' },
      { tipo: 'nuevo', texto: 'Pestaña de Informes trimestrales con listado de filings oficiales SEC EDGAR y botón directo de análisis.' },
      { tipo: 'nuevo', texto: 'Navegación unificada entre Empresa, Seguimiento, Alertas de precio, Cartera y Análisis.' },
      { tipo: 'mejora', texto: 'Aislamiento y optimización del módulo de análisis en JavaScript independiente.' }
    ]
  },
  {
    version: 'v1.1.0',
    fecha: '16 de Agosto, 2026',
    titulo: 'Gestión de cartera de inversión con operaciones FIFO',
    esUltima: false,
    explicacion: 'Implementación del módulo integral de Cartera para registrar operaciones de compra y venta de acciones, cálculo en tiempo real de plusvalías/minusvalías y rentabilidad por posición.',
    cambios: [
      { tipo: 'nuevo', texto: 'Registro y gestión de transacciones de compra y venta con deducción por criterio contable FIFO.' },
      { tipo: 'nuevo', texto: 'Gráficos interactivos de distribución de cartera por compañía y por sector.' },
      { tipo: 'nuevo', texto: 'Cálculo y previsión de dividendos acumulados y rentabilidad anualizada.' },
      { tipo: 'mejora', texto: 'Panel de resumen con métricas clave de inversión en la vista individual de empresa.' }
    ]
  },
  {
    version: 'v1.0.0',
    fecha: '14 de Agosto, 2026',
    titulo: 'Lanzamiento oficial de Cifra Terminal Beta',
    esUltima: false,
    explicacion: 'Primera versión oficial de Cifra Terminal orientada a inversores particulares. Herramienta especializada en el análisis fundamental de compañías cotizadas en Estados Unidos del sector de consumo defensivo.',
    cambios: [
      { tipo: 'nuevo', texto: 'Buscador de empresas cotizadas con cotizaciones y autocompletado en tiempo real.' },
      { tipo: 'nuevo', texto: 'Perfil corporativo completo con datos clave, cuenta de resultados y ratios.' },
      { tipo: 'nuevo', texto: 'Sistema de listas de seguimiento personalizadas y alertas automáticas de precio.' },
      { tipo: 'nuevo', texto: 'Generador automatizado de informes ejecutivos en formato PDF.' }
    ]
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
  expandedVersions: new Set(['v1.4.0']), // La última versión inicia abierta por defecto

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

        <div class="novedades-footer-note">
          <div class="novedades-note-icon">💡</div>
          <p>
            <strong>¿Actualizando la plataforma?</strong> 
            Para añadir una nueva versión, edita el archivo <code>public/novedades.js</code> e incorpora los cambios en el array <code>NOVEDADES_DATA</code>.
          </p>
        </div>
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
