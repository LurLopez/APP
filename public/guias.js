/**
 * =========================================================================
 * MÓDULO DE GUÍAS DE CIFRA
 * =========================================================================
 * Apartados:
 * 1. Datos Financieros (estados financieros, métricas, ratios)
 * 2. Cartera (gestión, ponderaciones, rentabilidad, operaciones)
 * 3. Análisis con IA (lectura de 10-Q / 10-K, prompts, metodología sectorial)
 *
 * Estructura modular preparada para incorporar contenido progresivamente.
 * =========================================================================
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const APARTADOS = [
    {
      id: 'datos-financieros',
      nombre: 'Datos Financieros',
      badge: 'Estados y Métricas',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
      descripcion: 'Guías de consulta sobre estados financieros (cuenta de resultados, balance, flujo de caja), métricas clave y ratios contables.',
      emptyTitulo: 'Apartado de Datos Financieros',
      emptyTexto: 'Este apartado está preparado para incorporar las guías y documentación sobre datos financieros, métricas contables y ratios de valoración. El contenido se añadirá próximamente.'
    },
    {
      id: 'cartera',
      nombre: 'Cartera',
      badge: 'Gestión y Rentabilidad',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
      descripcion: 'Guías sobre gestión de cartera, registro de transacciones, diversificación y seguimiento de rentabilidad.',
      emptyTitulo: 'Apartado de Cartera',
      emptyTexto: 'Este apartado está preparado para incorporar las guías sobre el funcionamiento de la cartera, asignación de activos, registro de operaciones y cálculo de rendimientos. El contenido se añadirá próximamente.'
    },
    {
      id: 'analisis-ia',
      nombre: 'Análisis con IA',
      badge: 'Metodología e IA',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
      descripcion: 'Guías sobre el motor de análisis de Cifra, interpretación de informes SEC con IA y marcos de análisis por sectores.',
      emptyTitulo: 'Apartado de Análisis con IA',
      emptyTexto: 'Este apartado está preparado para incorporar las guías sobre el sistema multi-agente de Cifra, lectura estructurada de informes 10-Q y 10-K y análisis adaptado a cada sector. El contenido se añadirá próximamente.'
    }
  ];

  const GuiasModule = {
    activeApartado: 'datos-financieros',
    _rendered: false,

    init() {
      const hash = (window.location.hash || '').replace('#', '').trim();
      if (APARTADOS.some((a) => a.id === hash)) {
        this.activeApartado = hash;
      }
      this.render();
      this.bindEvents();
    },

    setApartado(apartadoId) {
      if (!APARTADOS.some((a) => a.id === apartadoId)) return;
      this.activeApartado = apartadoId;

      const tabs = document.querySelectorAll('.guias-nav-tab');
      tabs.forEach((tab) => {
        const isActive = tab.dataset.apartado === apartadoId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      const panels = document.querySelectorAll('.guias-panel');
      panels.forEach((panel) => {
        const isActive = panel.id === `guia-panel-${apartadoId}`;
        panel.hidden = !isActive;
        panel.classList.toggle('active', isActive);
      });
    },

    bindEvents() {
      const root = document.querySelector('#guias-section');
      if (!root) return;

      root.querySelectorAll('.guias-nav-tab').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const target = tab.dataset.apartado;
          this.setApartado(target);
          if (history.replaceState) {
            history.replaceState(null, '', `/guias#${target}`);
          }
        });
      });

      root.querySelectorAll('.guias-nav-tab').forEach((tab, index, list) => {
        tab.addEventListener('keydown', (e) => {
          let nextIndex = null;
          if (e.key === 'ArrowRight') {
            nextIndex = (index + 1) % list.length;
          } else if (e.key === 'ArrowLeft') {
            nextIndex = (index - 1 + list.length) % list.length;
          }
          if (nextIndex !== null) {
            e.preventDefault();
            list[nextIndex].focus();
            list[nextIndex].click();
          }
        });
      });

      window.addEventListener('hashchange', () => {
        const hash = (window.location.hash || '').replace('#', '').trim();
        if (APARTADOS.some((a) => a.id === hash)) {
          this.setApartado(hash);
        }
      });
    },

    render() {
      const root = document.querySelector('#guias-section');
      if (!root) return;

      root.innerHTML = `
        <div class="guias-container">
          <!-- Navegación de apartados -->
          <nav class="guias-nav-tabs" role="tablist" aria-label="Apartados de Guías">
            ${APARTADOS.map((apartado) => `
              <button
                type="button"
                class="guias-nav-tab ${this.activeApartado === apartado.id ? 'active' : ''}"
                data-apartado="${escapeHtml(apartado.id)}"
                role="tab"
                id="tab-${escapeHtml(apartado.id)}"
                aria-selected="${this.activeApartado === apartado.id ? 'true' : 'false'}"
                aria-controls="guia-panel-${escapeHtml(apartado.id)}"
              >
                ${apartado.iconoSvg}
                <span>${escapeHtml(apartado.nombre)}</span>
              </button>
            `).join('')}
          </nav>

          <!-- Paneles de los apartados (vacíos de momento) -->
          <div class="guias-panels-wrap">
            ${APARTADOS.map((apartado) => `
              <div
                id="guia-panel-${escapeHtml(apartado.id)}"
                class="guias-panel ${this.activeApartado === apartado.id ? 'active' : ''}"
                role="tabpanel"
                aria-labelledby="tab-${escapeHtml(apartado.id)}"
                ${this.activeApartado === apartado.id ? '' : 'hidden'}
              >
                <div class="guias-panel-header">
                  <div class="guias-panel-title-area">
                    <span class="scope-badge">${escapeHtml(apartado.badge)}</span>
                    <h3>${escapeHtml(apartado.nombre)}</h3>
                    <p class="guias-panel-desc">${escapeHtml(apartado.descripcion)}</p>
                  </div>
                </div>

                <div class="guias-empty-container">
                  <div class="guias-empty-box">
                    <div class="guias-empty-icon-wrap">
                      ${apartado.iconoSvg}
                    </div>
                    <h4>${escapeHtml(apartado.emptyTitulo)}</h4>
                    <p>${escapeHtml(apartado.emptyTexto)}</p>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      this._rendered = true;
    }
  };

  window.GuiasModule = GuiasModule;
})();
