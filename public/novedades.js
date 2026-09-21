/**
 * @fileoverview Controlador del módulo de Novedades y Notas de Versión.
 * Gestiona la lista de versiones publicadas, acordeones interactivos y búsqueda en tiempo real.
 * @module NovedadesModule
 */

const NOVEDADES_DATA = [
  {
    version: 'v0.1.0',
    fecha: '18 de Septiembre, 2026',
    titulo: 'Primera versión estable',
    esUltima: true,
    explicacion: 'Primera versión estable de Cifra Research. Esta actualización incorpora el multi-idioma, una IA más rápida y precisa, mejoras en los datos financieros y una renovación de la interfaz y los gráficos de la cartera.',
    cambios: [
      { tipo: 'nuevo', texto: 'Multi-idioma: la interfaz y los análisis ya están disponibles en español e inglés.' },
      { tipo: 'mejora', texto: 'Mejora de la interfaz y de los gráficos de la cartera.' },
      { tipo: 'mejora', texto: 'Optimización de los recursos al analizar con IA.' },
      { tipo: 'mejora', texto: 'Mejora de la calidad de los análisis con IA.' },
      { tipo: 'nuevo', texto: 'Nueva pestaña de ratios en los datos financieros.' },
      { tipo: 'nuevo', texto: 'Nueva pestaña de guías, para ver qué es cada cosa y cómo analiza la IA.' },
      { tipo: 'nuevo', texto: 'Añadidas las versiones de los análisis con IA.' },
      { tipo: 'correccion', texto: 'Corrección de errores generales de la aplicación.' },
      { tipo: 'correccion', texto: 'Corrección de algunos fallos en los datos financieros.' },
      { tipo: 'correccion', texto: 'Solución del problema del calendario.' },
    ],
  },
  {
    version: 'v0.0.1',
    fecha: '11 de Septiembre, 2026',
    titulo: 'Generación de la web básica',
    esUltima: false,
    explicacion: 'Primera generación de la web básica de Cifra Research.',
    cambios: [],
  },
];

const NovedadesModule = {
  data: NOVEDADES_DATA,
  expandedVersions: new Set(['v0.1.0']),

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
    this.data.forEach((item) => this.expandedVersions.add(item.version));
    this.updateAccordionUI();
  },

  collapseAll() {
    this.expandedVersions.clear();
    this.updateAccordionUI();
  },

  updateAccordionUI() {
    const cards = document.querySelectorAll('.novedad-card');
    cards.forEach((card) => {
      const ver = card.dataset.version;
      const isOpen = this.expandedVersions.has(ver);
      card.classList.toggle('is-open', isOpen);

      const headerBtn = card.querySelector('.novedad-card-head');
      if (headerBtn) headerBtn.setAttribute('aria-expanded', String(isOpen));

      const body = card.querySelector('.novedad-card-body');
      if (body) body.hidden = !isOpen;
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

    const filtered = this.data.filter((item) => {
      const inVersion = item.version.toLowerCase().includes(q);
      const inTitle = item.titulo.toLowerCase().includes(q);
      const inExpl = (item.explicacion || '').toLowerCase().includes(q);
      const inChanges = (item.cambios || []).some((c) => c.texto.toLowerCase().includes(q));
      return inVersion || inTitle || inExpl || inChanges;
    });

    filtered.forEach((item) => this.expandedVersions.add(item.version));
    this.renderList(filtered, q);
  },

  renderList(items, searchQuery = '') {
    const container = document.querySelector('#novedades-list');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = window.NovedadesRender.renderEmpty(searchQuery);
      document.querySelector('#novedades-clear-filter')?.addEventListener('click', () => {
        const input = document.querySelector('#novedades-search-input');
        if (input) input.value = '';
        this.renderList(this.data);
      });
      return;
    }

    container.innerHTML = items
      .map((item) => window.NovedadesRender.renderCard(item, this.expandedVersions.has(item.version)))
      .join('');

    container.querySelectorAll('.novedad-card-head').forEach((head) => {
      const card = head.closest('.novedad-card');
      const version = card?.dataset.version;
      if (!version) return;

      const handleToggle = (e) => {
        e.preventDefault();
        this.toggleVersion(version);
      };

      head.addEventListener('click', handleToggle);
      head.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') handleToggle(e);
      });
    });
  },

  render() {
    const root = document.querySelector('#novedades-section');
    if (!root) return;

    const topBadge = document.querySelector('#novedades-version-badge');
    if (topBadge && this.data[0]) {
      // El estado va en su propio nodo para que el motor i18n lo traduzca
      // («Actual» → «Current») sin depender de la versión que lo precede.
      topBadge.textContent = `${this.data[0].version} · `;
      const status = document.createElement('span');
      status.textContent = 'Actual';
      topBadge.append(status);
    }

    root.innerHTML = window.NovedadesRender.renderContainer(this.data.length);
    this.renderList(this.data);

    document.querySelector('#novedades-expand-all')?.addEventListener('click', () => this.expandAll());
    document.querySelector('#novedades-collapse-all')?.addEventListener('click', () => this.collapseAll());

    const searchInput = document.querySelector('#novedades-search-input');
    searchInput?.addEventListener('input', (e) => this.filterVersions(e.target.value));
  },
};

window.NovedadesModule = NovedadesModule;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NovedadesModule.init());
} else {
  NovedadesModule.init();
}
