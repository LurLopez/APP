import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function createReportsEnvironment() {
  const context = {
    window: {},
    document: {},
    console,
  };
  context.window = context;

  const htmlUtilsCode = readFileSync(new URL('../../public/js/shared/htmlUtils.js', import.meta.url), 'utf8');
  vm.runInNewContext(htmlUtilsCode, context);

  const stateCode = readFileSync(new URL('../../public/reportsState.js', import.meta.url), 'utf8');
  vm.runInNewContext(stateCode, context);

  const renderCardsCode = readFileSync(new URL('../../public/js/reports/reportsRenderCards.js', import.meta.url), 'utf8');
  vm.runInNewContext(renderCardsCode, context);

  const renderTabsCode = readFileSync(new URL('../../public/js/reports/reportsRenderTabs.js', import.meta.url), 'utf8');
  vm.runInNewContext(renderTabsCode, context);

  const renderFacadeCode = readFileSync(new URL('../../public/js/reports/reportsRender.js', import.meta.url), 'utf8');
  vm.runInNewContext(renderFacadeCode, context);

  return context;
}

test('ReportsState inicializa con soporte para paginación, ordenación y sub-vistas', () => {
  const env = createReportsEnvironment();
  const RS = env.ReportsState;

  assert.equal(RS.activeTab, 'ai');
  assert.equal(RS.aiSubView, 'table');
  assert.equal(RS.aiPage, 1);
  assert.equal(RS.aiPageSize, 25);
  assert.equal(RS.aiSortField, 'created_at');
  assert.equal(RS.aiSortOrder, 'desc');
  assert.equal(RS.generalPage, 1);
  assert.equal(RS.generalPageSize, 25);
  assert.equal(RS.drawerOpen, false);
  assert.equal(RS.lightboxOpen, false);
});

test('renderHeader genera la barra de navegación enterprise y los botones de acción global', () => {
  const env = createReportsEnvironment();
  const headerHtml = env.ReportsRender.renderHeader({
    statsData: {
      aiErrors: { pending_ai_errors: 3 },
      generalReports: { pending_general_reports: 5 },
    },
    activeTab: 'ai',
    lastSyncTime: new Date(),
    isRefreshing: false,
  });

  assert.match(headerHtml, /Centro de Control de Reportes/);
  assert.match(headerHtml, /Consola de Administrador/);
  assert.match(headerHtml, /btn-global-refresh/);
  assert.match(headerHtml, /btn-global-export-csv/);
  assert.match(headerHtml, /btn-global-new-report/);
  assert.match(headerHtml, /1\. Auditoría de Análisis IA/);
  assert.match(headerHtml, /2\. Reportes de Plataforma/);
  assert.match(headerHtml, /pulse-badge/);
});

test('renderPagination calcula correctamente páginas y rango para 100 elementos', () => {
  const env = createReportsEnvironment();
  const paginationHtml = env.ReportsRender.renderPagination({
    total: 100,
    page: 2,
    pageSize: 25,
    idPrefix: 'test',
  });

  assert.match(paginationHtml, /Mostrando <strong>26 - 50<\/strong> de <strong>100<\/strong>/);
  assert.match(paginationHtml, /data-page="1"/);
  assert.match(paginationHtml, /data-page="2"/);
  assert.match(paginationHtml, /data-page="3"/);
  assert.match(paginationHtml, /data-page="4"/);
  assert.match(paginationHtml, /pagination-size-select/);
});

test('renderBulkActionBar muestra la barra cuando hay elementos seleccionados', () => {
  const env = createReportsEnvironment();
  const emptyBar = env.ReportsRender.renderBulkActionBar({ count: 0, type: 'general' });
  assert.equal(emptyBar, '');

  const activeBar = env.ReportsRender.renderBulkActionBar({ count: 4, type: 'general' });
  assert.match(activeBar, /4<\/span>/);
  assert.match(activeBar, /elementos seleccionados/);
  assert.match(activeBar, /Marcar Resueltos/);
  assert.match(activeBar, /En revisión/);
  assert.match(activeBar, /Descartar/);
  assert.match(activeBar, /Eliminar/);
});

test('renderDrawer genera la ficha lateral de detalle completa con estados y notas', () => {
  const env = createReportsEnvironment();
  const drawerHtml = env.ReportsRender.renderDrawer({
    item: {
      id: 42,
      title: 'Error al filtrar por PER en screener',
      description: 'El filtro no devuelve resultados cuando el PER supera 30.',
      status: 'pending',
      category: 'screener',
      user_email: 'inversor@example.com',
      created_at: new Date('2026-09-10T12:00:00Z'),
      admin_notes: 'Revisar consulta SQL en screenerRepository.',
      images: ['/uploads/captura1.png'],
    },
    type: 'general',
  });

  assert.match(drawerHtml, /reports-drawer-backdrop/);
  assert.match(drawerHtml, /#42 - Error al filtrar por PER en screener/);
  assert.match(drawerHtml, /inversor@example\.com/);
  assert.match(drawerHtml, /Revisar consulta SQL en screenerRepository\./);
  assert.match(drawerHtml, /captura1\.png/);
  assert.match(drawerHtml, /btn-save-drawer-notes/);
});

test('renderAiTab soporta 100 análisis paginando a 25 por página en la vista Tabla Global', () => {
  const env = createReportsEnvironment();
  const mockRawList = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    ticker: `TICK${(i % 10) + 1}`,
    company_name: `Empresa ${(i % 10) + 1}`,
    accession: `0000000000-26-00000${i}`,
    form_type: i % 2 === 0 ? '10-K' : '10-Q',
    period_title: 'Q2 2026',
    model_used: 'Claude 3.5 Sonnet',
    version: 1,
    created_at: new Date(Date.now() - i * 3600000),
    rating_average: 4.5,
    rating_count: 3,
    error_reports_count: i === 0 ? 2 : 0,
    error_reports: i === 0 ? [{ id: 999, category: 'missing_data', description: 'Falta EBITDA', status: 'pending' }] : [],
  }));

  const tabHtml = env.ReportsRender.renderAiTab({
    aiData: { rawList: mockRawList, companies: [] },
    aiSubView: 'table',
    aiFilterMode: 'all',
    aiSearchQuery: '',
    aiSortField: 'created_at',
    aiSortOrder: 'desc',
    aiPage: 1,
    aiPageSize: 25,
    selectedAiItems: new Set(),
  });

  assert.match(tabHtml, /Tabla Global \(100\)/);
  assert.match(tabHtml, /Mostrando <strong>1 - 25<\/strong> de <strong>100<\/strong>/);
  assert.match(tabHtml, /TICK1/);
});

test('renderGeneralTab genera la tabla de reportes con filtros segmentados de estado', () => {
  const env = createReportsEnvironment();
  const mockReports = [
    {
      id: 1,
      title: 'Fallo al descargar PDF',
      description: 'El botón de descarga responde 500.',
      status: 'pending',
      category: 'bug',
      user_email: 'user1@cifra.es',
      created_at: new Date(),
    },
    {
      id: 2,
      title: 'Añadir dividendos trimestrales',
      description: 'Sería útil ver el payout ratio.',
      status: 'resolved',
      category: 'suggestion',
      user_email: 'user2@cifra.es',
      created_at: new Date(),
    },
  ];

  const tabHtml = env.ReportsRender.renderGeneralTab({
    generalData: mockReports,
    generalTotal: 2,
    generalStatusFilter: 'all',
    generalCategoryFilter: 'all',
    generalSearchQuery: '',
    generalSortField: 'created_at',
    generalSortOrder: 'desc',
    generalPage: 1,
    generalPageSize: 25,
    selectedGeneralItems: new Set(),
  });

  assert.match(tabHtml, /Fallo al descargar PDF/);
  assert.match(tabHtml, /Añadir dividendos trimestrales/);
  assert.match(tabHtml, /status-tab-pill/);
  assert.match(tabHtml, /reports-data-table/);
});

test('ReportsModule renderiza la vista no autorizada si no es administrador', async () => {
  const sectionEl = { innerHTML: '', hidden: false, querySelector: () => null, querySelectorAll: () => [] };
  const context = {
    window: {},
    document: {
      querySelector: (sel) => (sel === '#section-reportes' ? sectionEl : null),
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
  };
  context.window = context;
  context.addEventListener = () => {};
  context.window.addEventListener = () => {};
  context.window.AuthModule = {
    whenReady: async () => {},
    isAdmin: () => false,
  };

  const files = [
    '../../public/js/shared/htmlUtils.js',
    '../../public/reportsState.js',
    '../../public/js/reports/imageAttachmentManager.js',
    '../../public/js/reports/reportsRenderCards.js',
    '../../public/js/reports/reportsRenderTabs.js',
    '../../public/js/reports/reportsRender.js',
    '../../public/js/reports/reportsActions.js',
    '../../public/js/reports/reportsModule.js',
    '../../public/reports.js',
  ];

  for (const f of files) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8');
    vm.runInNewContext(code, context);
  }

  await context.window.ReportsModule.render();
  assert.match(sectionEl.innerHTML, /reports-unauthorized-card/);
  assert.match(sectionEl.innerHTML, /Acceso exclusivo a administradores/);
});

test('ReportsModule renderiza la consola enterprise completa cuando es administrador', async () => {
  const sectionEl = { innerHTML: '', hidden: false, querySelector: () => null, querySelectorAll: () => [] };
  const context = {
    window: {},
    document: {
      querySelector: (sel) => (sel === '#section-reportes' ? sectionEl : null),
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    fetch: async (url) => ({
      ok: true,
      json: async () => {
        if (url.includes('stats')) return { ok: true, stats: { analyses: { total_analyses: 10, total_companies: 2 }, ratings: {}, aiErrors: {}, generalReports: {} } };
        if (url.includes('ai')) return { ok: true, companies: [{ ticker: 'TEST', totalAnalyses: 1, results: [] }], rawList: [], totalAnalyses: 1, totalCompanies: 1 };
        return { ok: true, reports: [], total: 0 };
      }
    }),
  };
  context.window = context;
  context.addEventListener = () => {};
  context.window.addEventListener = () => {};
  context.window.AuthModule = {
    whenReady: async () => {},
    isAdmin: () => true,
  };

  const files = [
    '../../public/js/shared/htmlUtils.js',
    '../../public/reportsState.js',
    '../../public/js/reports/imageAttachmentManager.js',
    '../../public/js/reports/reportsRenderCards.js',
    '../../public/js/reports/reportsRenderTabs.js',
    '../../public/js/reports/reportsRender.js',
    '../../public/js/reports/reportsActions.js',
    '../../public/js/reports/reportsModule.js',
    '../../public/reports.js',
  ];

  for (const f of files) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8');
    vm.runInNewContext(code, context);
  }

  await context.window.ReportsModule.render();
  assert.match(sectionEl.innerHTML, /reports-page-wrapper enterprise-dashboard/);
  assert.match(sectionEl.innerHTML, /Centro de Control de Reportes/);
});

