/**
 * =========================================================================
 * MÓDULO DE GUÍAS DE CIFRA (lógica de interfaz)
 * =========================================================================
 * El contenido (apartados, sub-pestañas y paneles) vive en
 * `public/js/guias/guiasContent.js`, compartido con el renderizado SSR de
 * `/guias` para buscadores y LLMs. Aquí solo queda la navegación por pestañas,
 * el historial (#datos-financieros/cash-flows…) y el botón de donaciones.
 * =========================================================================
 */

import {
  escapeHtml,
  APARTADOS_VISIBLES,
  DATOS_FINANCIEROS_TABS,
  ANALISIS_IA_TABS,
  renderAvisoPanelContent,
  renderDatosFinancierosContent,
  renderAnalisisIaContent,
} from './js/guias/guiasContent.js?v=3';

const GuiasModule = {
  activeApartado: 'aviso',
  activeDatosTab: 'cuenta-resultados',
  activeIaTab: 'trimestral',
  _rendered: false,

  init() {
    const rawHash = (window.location.hash || '').replace('#', '').trim();
    const [apartadoHash, subtabHash] = rawHash.split('/');

    if (APARTADOS_VISIBLES.some((a) => a.id === apartadoHash)) {
      this.activeApartado = apartadoHash;
    }
    if (apartadoHash === 'datos-financieros' && DATOS_FINANCIEROS_TABS.some((t) => t.id === subtabHash)) {
      this.activeDatosTab = subtabHash;
    }
    if (apartadoHash === 'analisis-ia' && ANALISIS_IA_TABS.some((t) => t.id === subtabHash)) {
      this.activeIaTab = subtabHash;
    }

    this.render();
    this.bindEvents();
  },

  setApartado(apartadoId) {
    if (!APARTADOS_VISIBLES.some((a) => a.id === apartadoId)) return;
    this.activeApartado = apartadoId;

    const root = document.querySelector('#guias-section');
    const tabs = root ? root.querySelectorAll('.guias-nav-tab') : [];
    tabs.forEach((tab) => {
      const isActive = tab.dataset.apartado === apartadoId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const panels = root ? root.querySelectorAll('.guias-panel') : [];
    panels.forEach((panel) => {
      const isActive = panel.id === `guia-panel-${apartadoId}`;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
  },

  setDatosTab(tabId) {
    if (!DATOS_FINANCIEROS_TABS.some((t) => t.id === tabId)) return;
    this.activeDatosTab = tabId;

    const root = document.querySelector('#guias-section');
    const subtabs = root ? root.querySelectorAll('.guias-subnav-tab[data-subtab]') : [];
    subtabs.forEach((tab) => {
      const isActive = tab.dataset.subtab === tabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const panels = root ? root.querySelectorAll('.guias-df-panel:not(.guias-ia-tab-panel)') : [];
    panels.forEach((panel) => {
      const isActive = panel.id === `guias-df-panel-${tabId}`;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
  },

  setIaTab(tabId) {
    if (!ANALISIS_IA_TABS.some((t) => t.id === tabId)) return;
    this.activeIaTab = tabId;

    const root = document.querySelector('#guias-section');
    const subtabs = root ? root.querySelectorAll('.guias-subnav-tab[data-iasubtab]') : [];
    subtabs.forEach((tab) => {
      const isActive = tab.dataset.iasubtab === tabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const panels = root ? root.querySelectorAll('.guias-ia-tab-panel') : [];
    panels.forEach((panel) => {
      const isActive = panel.id === `guias-ia-panel-${tabId}`;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
  },

  bindEvents() {
    const root = document.querySelector('#guias-section');
    if (!root) return;

    // Navegación de pestañas principales (Apartados)
    root.querySelectorAll('.guias-nav-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.dataset.apartado;
        this.setApartado(target);
        if (history.replaceState) {
          const prefix = window.__CIFRA_LANGUAGE__ === 'en' ? '/en' : '';
          const hashTarget = target === 'datos-financieros'
            ? `datos-financieros/${this.activeDatosTab}`
            : target === 'analisis-ia'
            ? `analisis-ia/${this.activeIaTab}`
            : target;
          history.replaceState(null, '', `${prefix}/guias#${hashTarget}`);
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

    // Navegación de sub-pestañas de Datos Financieros
    root.querySelectorAll('.guias-subnav-tab[data-subtab]').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.dataset.subtab;
        this.setDatosTab(target);
        if (history.replaceState) {
          const prefix = window.__CIFRA_LANGUAGE__ === 'en' ? '/en' : '';
          history.replaceState(null, '', `${prefix}/guias#datos-financieros/${target}`);
        }
      });
    });

    root.querySelectorAll('.guias-subnav-tab[data-subtab]').forEach((tab, index, list) => {
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

    // Navegación de sub-pestañas de Análisis con IA
    root.querySelectorAll('.guias-subnav-tab[data-iasubtab]').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.dataset.iasubtab;
        this.setIaTab(target);
        if (history.replaceState) {
          const prefix = window.__CIFRA_LANGUAGE__ === 'en' ? '/en' : '';
          history.replaceState(null, '', `${prefix}/guias#analisis-ia/${target}`);
        }
      });
    });

    root.querySelectorAll('.guias-subnav-tab[data-iasubtab]').forEach((tab, index, list) => {
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

    // Botón de donación integrado
    const donateBtn = root.querySelector('#guias-donate-action-btn');
    if (donateBtn) {
      donateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.Donations && typeof window.Donations.open === 'function') {
          window.Donations.open();
        } else {
          const modal = document.querySelector('#donations-modal-backdrop');
          if (modal) modal.hidden = false;
        }
      });
    }

    // Navegación rápida desde las tarjetas de funcionalidades
    root.querySelectorAll('.guias-feature-card[data-target-section]').forEach((card) => {
      const handler = (e) => {
        e.preventDefault();
        const targetSec = card.dataset.targetSection;
        if (!targetSec) return;
        const navItem = document.querySelector(`.main-nav [data-section="${targetSec}"], .company-subnav [data-section="${targetSec}"]`);
        if (navItem) {
          navItem.click();
        } else if (targetSec === 'empresa' || targetSec === 'informes' || targetSec === 'datos') {
          const empresaNav = document.querySelector('.main-nav [data-section="empresa"]');
          if (empresaNav) {
            empresaNav.click();
          } else {
            window.location.href = '/empresa';
          }
        }
      };

      card.addEventListener('click', handler);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handler(e);
        }
      });
    });

    window.addEventListener('hashchange', () => {
      const rawHash = (window.location.hash || '').replace('#', '').trim();
      const [apartadoHash, subtabHash] = rawHash.split('/');
      if (APARTADOS_VISIBLES.some((a) => a.id === apartadoHash)) {
        this.setApartado(apartadoHash);
      }
      if (apartadoHash === 'datos-financieros' && DATOS_FINANCIEROS_TABS.some((t) => t.id === subtabHash)) {
        this.setDatosTab(subtabHash);
      }
      if (apartadoHash === 'analisis-ia' && ANALISIS_IA_TABS.some((t) => t.id === subtabHash)) {
        this.setIaTab(subtabHash);
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
          ${APARTADOS_VISIBLES.map((apartado) => `
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

        <!-- Paneles de los apartados -->
        <div class="guias-panels-wrap">
          ${APARTADOS_VISIBLES.map((apartado) => `
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

              ${apartado.id === 'aviso'
                ? renderAvisoPanelContent()
                : apartado.id === 'datos-financieros'
                ? renderDatosFinancierosContent(this.activeDatosTab)
                : apartado.id === 'analisis-ia'
                ? renderAnalisisIaContent(this.activeIaTab)
                : `
                  <div class="guias-empty-container">
                    <div class="guias-empty-box">
                      <div class="guias-empty-icon-wrap">
                        ${apartado.iconoSvg}
                      </div>
                      <h4>${escapeHtml(apartado.emptyTitulo)}</h4>
                      <p>${escapeHtml(apartado.emptyTexto)}</p>
                    </div>
                  </div>
                `
              }
            </div>
          `).join('')}
        </div>
      </div>
    `;
    this.buildLineCardBodies(root);
    this._rendered = true;
  },

  buildLineCardBodies(root) {
    root.querySelectorAll('.guias-line-card').forEach((card) => {
      const head = card.querySelector('.guias-line-card-head');
      if (!head || card.querySelector('.guias-line-body')) return;
      const rest = Array.from(card.children).filter((child) => child !== head);
      if (!rest.length) return;
      const body = document.createElement('div');
      body.className = 'guias-line-body';
      rest.forEach((child) => body.appendChild(child));
      card.appendChild(body);
    });
  }
};

window.GuiasModule = GuiasModule;
