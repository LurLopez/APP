/**
 * @fileoverview Tarjetas, componentes ejecutivos, drawer de detalle, paginación
 * y utilidades de render del Centro de Control de Reportes.
 */

(function (window) {
  'use strict';

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatShortDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatRelativeDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Hace instantes';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return formatShortDate(d);
  }

  function getCategoryLabel(cat) {
    const map = {
      incorrect_numbers: 'Cifras erróneas',
      wrong_period: 'Periodo incorrecto',
      missing_data: 'Datos faltantes',
      wrong_classification: 'Mala clasificación',
      bad_formatting: 'Formato deficiente',
      bug: 'Error técnico / Bug',
      market_data: 'Datos de mercado',
      screener: 'Screener / Buscador',
      portfolio: 'Cartera',
      account: 'Cuenta y acceso',
      suggestion: 'Sugerencia de mejora',
      general: 'General',
      other: 'Otro',
    };
    return map[cat] || cat || 'General';
  }

  function getCategoryTagHtml(cat) {
    const safeCat = escapeHtml(cat || 'general');
    const label = escapeHtml(getCategoryLabel(cat));
    return `<span class="report-cat-badge cat-${safeCat}">${label}</span>`;
  }

  function getStatusBadge(status) {
    const badges = {
      pending: '<span class="report-status-badge status-pending"><span class="status-dot"></span>Pendiente</span>',
      reviewed: '<span class="report-status-badge status-reviewed"><span class="status-dot"></span>En revisión</span>',
      resolved: '<span class="report-status-badge status-resolved"><span class="status-dot"></span>Resuelto</span>',
      dismissed: '<span class="report-status-badge status-dismissed"><span class="status-dot"></span>Descartado</span>',
    };
    return badges[status] || `<span class="report-status-badge">${escapeHtml(status || '—')}</span>`;
  }

  function renderHeader({ statsData, activeTab, lastSyncTime, isRefreshing }) {
    const aiCount = statsData?.aiErrors?.pending_ai_errors || 0;
    const aiBadge = aiCount > 0 ? `<span class="reports-tab-badge pulse-badge">${aiCount}</span>` : '';
    const genCount = statsData?.generalReports?.pending_general_reports || 0;
    const genBadge = genCount > 0 ? `<span class="reports-tab-badge pulse-badge">${genCount}</span>` : '';

    const syncLabel = lastSyncTime
      ? `Actualizado ${formatRelativeDate(lastSyncTime)}`
      : 'Sincronizado';

    return `
      <div class="reports-header-card enterprise-header">
        <div class="reports-header-top">
          <div class="reports-title-area">
            <div class="reports-breadcrumbs">
              <span class="breadcrumb-item">ADMINISTRACIÓN</span>
              <span class="breadcrumb-sep">/</span>
              <span class="breadcrumb-current">CENTRO DE CONTROL Y AUDITORÍA</span>
            </div>
            <div class="reports-title-row">
              <h1 class="reports-main-title">Centro de Control de Reportes</h1>
              <span class="reports-admin-pill">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Consola de Administrador
              </span>
            </div>
            <p class="reports-subtitle">Supervisión en tiempo real de análisis con IA, métricas de calidad de datos y resolución unificada de incidencias y soporte técnico.</p>
          </div>
          <div class="reports-actions-bar">
            <span class="reports-sync-indicator" title="Hora de última sincronización">
              <span class="sync-dot ${isRefreshing ? 'sync-spinning' : ''}"></span>
              ${syncLabel}
            </span>
            <button type="button" class="secondary-button btn-sm btn-icon-text" id="btn-global-refresh" title="Actualizar datos ahora">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="${isRefreshing ? 'spin-animation' : ''}"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              <span>Sincronizar</span>
            </button>
            <button type="button" class="secondary-button btn-sm btn-icon-text" id="btn-global-export-csv" title="Exportar vista actual a archivo CSV">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              <span>Exportar CSV</span>
            </button>
            <button type="button" class="primary-button btn-sm btn-icon-text" id="btn-global-new-report" title="Crear reporte general manual">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Nuevo reporte</span>
            </button>
          </div>
        </div>

        <div class="reports-tabs-nav">
          <button type="button" class="reports-nav-btn ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12A10 10 0 0 1 12 2z"/><path d="m10 15 5-3-5-3v6z"/></svg>
            <span>1. Auditoría de Análisis IA</span>
            ${aiBadge}
          </button>
          <button type="button" class="reports-nav-btn ${activeTab === 'general' ? 'active' : ''}" data-tab="general">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            <span>2. Reportes de Plataforma & Bugs</span>
            ${genBadge}
          </button>
        </div>
      </div>
    `;
  }

  function renderStatsCards(statsData) {
    if (!statsData) return '';
    const a = statsData.analyses || {};
    const r = statsData.ratings || {};
    const aiErr = statsData.aiErrors || {};
    const gen = statsData.generalReports || {};

    const pendingAi = Number(aiErr.pending_ai_errors || 0);
    const resolvedAi = Number(aiErr.resolved_ai_errors || 0);
    const totalAiErrors = Number(aiErr.total_ai_errors || 0);
    const aiResolutionRate = totalAiErrors > 0
      ? Math.round((resolvedAi / totalAiErrors) * 100)
      : 100;

    const pendingGen = Number(gen.pending_general_reports || 0);
    const resolvedGen = Number(gen.resolved_general_reports || 0);
    const totalGen = Number(gen.total_general_reports || 0);
    const genResolutionRate = totalGen > 0
      ? Math.round((resolvedGen / totalGen) * 100)
      : 100;

    const avgRating = r.average_rating ? Number(r.average_rating).toFixed(1) : '—';
    const totalRatings = Number(r.total_ratings || 0);

    return `
      <div class="reports-stats-grid enterprise-stats">
        <div class="reports-stat-card stat-card-interactive" data-stat-target="analyses">
          <div class="stat-card-header">
            <div class="stat-icon-wrap stat-icon-blue">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <span class="stat-trend-chip chip-blue">SEC EDGAR</span>
          </div>
          <div class="stat-info">
            <span class="stat-val">${a.total_analyses ?? 0}</span>
            <span class="stat-label">Análisis IA generados</span>
            <span class="stat-sublabel">En <strong>${a.total_companies ?? 0}</strong> empresas monitorizadas</span>
          </div>
        </div>

        <div class="reports-stat-card stat-card-interactive" data-stat-target="ratings">
          <div class="stat-card-header">
            <div class="stat-icon-wrap stat-icon-amber">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <span class="stat-trend-chip chip-amber">${totalRatings} votos</span>
          </div>
          <div class="stat-info">
            <span class="stat-val">${avgRating} <span class="stat-unit">★</span></span>
            <span class="stat-label">Satisfacción de usuarios</span>
            <span class="stat-sublabel">${totalRatings > 0 ? 'Media sobre 5.0 estrellas' : 'Sin valoraciones registradas'}</span>
          </div>
        </div>

        <div class="reports-stat-card stat-card-interactive ${pendingAi > 0 ? 'card-alert-amber' : ''}" data-stat-target="ai-pending" title="Hacer clic para ver incidencias IA">
          <div class="stat-card-header">
            <div class="stat-icon-wrap ${pendingAi > 0 ? 'stat-icon-red' : 'stat-icon-green'}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <span class="stat-trend-chip ${pendingAi > 0 ? 'chip-red' : 'chip-green'}">
              ${pendingAi > 0 ? `${pendingAi} pendientes` : 'Al día ✓'}
            </span>
          </div>
          <div class="stat-info">
            <span class="stat-val">${pendingAi}</span>
            <span class="stat-label">Incidencias en análisis IA</span>
            <span class="stat-sublabel">Tasa de resolución: <strong>${aiResolutionRate}%</strong></span>
          </div>
        </div>

        <div class="reports-stat-card stat-card-interactive ${pendingGen > 0 ? 'card-alert-amber' : ''}" data-stat-target="general-pending" title="Hacer clic para ver reportes pendientes">
          <div class="stat-card-header">
            <div class="stat-icon-wrap ${pendingGen > 0 ? 'stat-icon-red' : 'stat-icon-green'}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <span class="stat-trend-chip ${pendingGen > 0 ? 'chip-red' : 'chip-green'}">
              ${pendingGen > 0 ? `${pendingGen} pendientes` : 'Al día ✓'}
            </span>
          </div>
          <div class="stat-info">
            <span class="stat-val">${pendingGen}</span>
            <span class="stat-label">Reportes de plataforma</span>
            <span class="stat-sublabel">${resolvedGen} resueltos de ${totalGen} totales</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderPagination({ total, page, pageSize, idPrefix }) {
    if (!total || total <= 0) return '';
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (totalPages <= 1 && total <= 10) return '';

    const startItem = Math.min((page - 1) * pageSize + 1, total);
    const endItem = Math.min(page * pageSize, total);

    // Calcular números de página visibles (ej. 1, 2, 3... o ventana centrada)
    const pageNumbers = [];
    const delta = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        pageNumbers.push(i);
      } else if (pageNumbers[pageNumbers.length - 1] !== '...') {
        pageNumbers.push('...');
      }
    }

    const pagesHtml = pageNumbers.map((p) => {
      if (p === '...') {
        return '<span class="pagination-ellipsis">…</span>';
      }
      const isActive = p === page;
      return `
        <button type="button" class="pagination-page-btn ${isActive ? 'active' : ''}" data-prefix="${idPrefix}" data-page="${p}">
          ${p}
        </button>
      `;
    }).join('');

    return `
      <div class="reports-pagination-bar">
        <div class="pagination-info">
          <span>Mostrando <strong>${startItem} - ${endItem}</strong> de <strong>${total}</strong> registros</span>
          <label class="pagination-size-label">
            <span>Por pág:</span>
            <select class="pagination-size-select" data-prefix="${idPrefix}">
              <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
            </select>
          </label>
        </div>
        <div class="pagination-nav">
          <button type="button" class="pagination-btn" data-prefix="${idPrefix}" data-page="1" ${page <= 1 ? 'disabled' : ''} title="Primera página">«</button>
          <button type="button" class="pagination-btn" data-prefix="${idPrefix}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} title="Anterior">‹</button>
          <div class="pagination-pages-group">${pagesHtml}</div>
          <button type="button" class="pagination-btn" data-prefix="${idPrefix}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} title="Siguiente">›</button>
          <button type="button" class="pagination-btn" data-prefix="${idPrefix}" data-page="${totalPages}" ${page >= totalPages ? 'disabled' : ''} title="Última página">»</button>
        </div>
      </div>
    `;
  }

  function renderBulkActionBar({ count, type }) {
    if (!count || count <= 0) return '';
    return `
      <div class="reports-bulk-action-bar active" data-bulk-type="${type}">
        <div class="bulk-bar-left">
          <span class="bulk-count-badge">${count}</span>
          <span class="bulk-label">${count === 1 ? 'elemento seleccionado' : 'elementos seleccionados'}</span>
        </div>
        <div class="bulk-bar-actions">
          <button type="button" class="btn-bulk-resolve bulk-action-btn bulk-btn-green" data-bulk-type="${type}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Marcar Resueltos</span>
          </button>
          <button type="button" class="btn-bulk-review bulk-action-btn bulk-btn-blue" data-bulk-type="${type}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>En revisión</span>
          </button>
          <button type="button" class="btn-bulk-dismiss bulk-action-btn bulk-btn-gray" data-bulk-type="${type}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            <span>Descartar</span>
          </button>
          <button type="button" class="btn-bulk-delete bulk-action-btn bulk-btn-danger" data-bulk-type="${type}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>Eliminar</span>
          </button>
          <button type="button" class="btn-bulk-clear bulk-action-btn bulk-btn-ghost" data-bulk-type="${type}">
            ✕ Cancelar
          </button>
        </div>
      </div>
    `;
  }

  function renderDrawer({ item, type, parent }) {
    if (!item) return '';

    const isGeneral = type === 'general';
    const isAiError = type === 'ai-error';

    const id = item.id;
    const title = item.title || (isAiError ? `Incidencia sobre ${parent?.ticker || 'Análisis IA'}` : 'Reporte');
    const description = item.description || '';
    const status = item.status || 'pending';
    const category = item.category || 'general';
    const userEmail = item.user_email || item.email || (item.user_id ? `Usuario #${item.user_id}` : 'Anónimo');
    const username = item.username ? ` (@${item.username})` : '';
    const createdAt = formatDate(item.created_at);
    const resolvedAt = item.resolved_at ? formatDate(item.resolved_at) : null;
    const adminNotes = item.admin_notes || '';
    const images = Array.isArray(item.images) ? item.images : [];

    let contextBlock = '';
    if (isAiError && parent) {
      contextBlock = `
        <div class="drawer-section">
          <h4 class="drawer-section-title">Contexto del Análisis IA</h4>
          <div class="drawer-meta-grid">
            <div class="drawer-meta-item">
              <span class="drawer-meta-label">Empresa / Ticker:</span>
              <span class="drawer-meta-val"><strong>${escapeHtml(parent.ticker)}</strong> - ${escapeHtml(parent.company_name || parent.ticker)}</span>
            </div>
            <div class="drawer-meta-item">
              <span class="drawer-meta-label">Periodo / Formato:</span>
              <span class="drawer-meta-val">${escapeHtml(parent.form_type || '10-Q')} (${escapeHtml(parent.period_title || parent.period_label || '—')})</span>
            </div>
            <div class="drawer-meta-item">
              <span class="drawer-meta-label">Accession SEC:</span>
              <span class="drawer-meta-val mono-font">${escapeHtml(parent.accession || '—')}</span>
            </div>
            <div class="drawer-meta-item">
              <span class="drawer-meta-label">Modelo utilizado:</span>
              <span class="drawer-meta-val">${escapeHtml(parent.model_used || 'IA')}</span>
            </div>
          </div>
          <div class="drawer-quick-links">
            <button type="button" class="secondary-button btn-xs btn-open-analysis-from-drawer" data-ticker="${escapeHtml(parent.ticker)}" data-accession="${escapeHtml(parent.accession)}">
              👁️ Abrir informe analizado
            </button>
          </div>
        </div>
      `;
    }

    const imagesHtml = images.length > 0 ? `
      <div class="drawer-section">
        <h4 class="drawer-section-title">Capturas de pantalla adjuntas (${images.length})</h4>
        <p class="drawer-section-sub">Haz clic en cualquier imagen para ampliarla en detalle.</p>
        <div class="drawer-images-grid">
          ${images.map((src, i) => `
            <div class="drawer-image-thumb-wrap" data-img-src="${escapeHtml(src)}">
              <img src="${escapeHtml(src)}" alt="Captura ${i + 1}" class="drawer-image-thumb">
              <div class="image-zoom-overlay">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="reports-drawer-backdrop" id="reports-drawer-backdrop">
        <div class="reports-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
          <div class="drawer-header">
            <div class="drawer-header-left">
              <span class="drawer-tag">${isGeneral ? 'REPORTE GENERAL' : 'INCIDENCIA DE ANÁLISIS'}</span>
              <h2 class="drawer-title" id="drawer-title">#${id} - ${escapeHtml(title)}</h2>
            </div>
            <button type="button" class="drawer-close-btn" id="btn-close-drawer" aria-label="Cerrar panel">✕</button>
          </div>

          <div class="drawer-body">
            <!-- Selector de Estado Principal -->
            <div class="drawer-status-panel">
              <div class="drawer-status-header">
                <span class="drawer-status-title">Estado de la incidencia:</span>
                ${getStatusBadge(status)}
              </div>
              <div class="drawer-status-selector-row">
                <label class="drawer-status-option ${status === 'pending' ? 'selected' : ''}">
                  <input type="radio" name="drawer-status" value="pending" ${status === 'pending' ? 'checked' : ''}>
                  <span class="status-option-label status-pending">Pendiente</span>
                </label>
                <label class="drawer-status-option ${status === 'reviewed' ? 'selected' : ''}">
                  <input type="radio" name="drawer-status" value="reviewed" ${status === 'reviewed' ? 'checked' : ''}>
                  <span class="status-option-label status-reviewed">En revisión</span>
                </label>
                <label class="drawer-status-option ${status === 'resolved' ? 'selected' : ''}">
                  <input type="radio" name="drawer-status" value="resolved" ${status === 'resolved' ? 'checked' : ''}>
                  <span class="status-option-label status-resolved">Resuelto</span>
                </label>
                <label class="drawer-status-option ${status === 'dismissed' ? 'selected' : ''}">
                  <input type="radio" name="drawer-status" value="dismissed" ${status === 'dismissed' ? 'checked' : ''}>
                  <span class="status-option-label status-dismissed">Descartado</span>
                </label>
              </div>
            </div>

            <!-- Ficha de Metadatos -->
            <div class="drawer-section">
              <h4 class="drawer-section-title">Detalles del Reporte</h4>
              <div class="drawer-meta-grid">
                <div class="drawer-meta-item">
                  <span class="drawer-meta-label">Categoría:</span>
                  <span class="drawer-meta-val">${getCategoryTagHtml(category)}</span>
                </div>
                <div class="drawer-meta-item">
                  <span class="drawer-meta-label">Usuario / Reportador:</span>
                  <span class="drawer-meta-val">👤 ${escapeHtml(userEmail)}${escapeHtml(username)}</span>
                </div>
                <div class="drawer-meta-item">
                  <span class="drawer-meta-label">Fecha de recepción:</span>
                  <span class="drawer-meta-val">📅 ${createdAt}</span>
                </div>
                ${resolvedAt ? `
                  <div class="drawer-meta-item">
                    <span class="drawer-meta-label">Fecha de resolución:</span>
                    <span class="drawer-meta-val">✅ ${resolvedAt}</span>
                  </div>
                ` : ''}
              </div>
            </div>

            ${contextBlock}

            <!-- Descripción del problema -->
            <div class="drawer-section">
              <h4 class="drawer-section-title">Descripción y Contenido</h4>
              <div class="drawer-description-box">
                ${escapeHtml(description)}
              </div>
            </div>

            ${imagesHtml}

            <!-- Notas de Moderación del Administrador -->
            <div class="drawer-section">
              <h4 class="drawer-section-title">Notas Internas del Administrador</h4>
              <p class="drawer-section-sub">Registra la solución aplicada, causa raíz o contexto para otros miembros del equipo.</p>
              <textarea id="drawer-admin-notes" class="drawer-notes-textarea" placeholder="Escribe aquí las notas internas de moderación o resolución...">${escapeHtml(adminNotes)}</textarea>
              <div class="drawer-notes-actions">
                <button type="button" class="primary-button btn-sm" id="btn-save-drawer-notes" data-item-id="${id}" data-item-type="${type}">
                  Guardar notas y estado
                </button>
                <span class="drawer-save-feedback" id="drawer-save-feedback"></span>
              </div>
            </div>
          </div>

          <div class="drawer-footer">
            <button type="button" class="danger-button btn-sm" id="btn-drawer-delete" data-item-id="${id}" data-item-type="${type}">
              🗑️ Eliminar definitivamente
            </button>
            <button type="button" class="secondary-button btn-sm" id="btn-drawer-cancel">
              Cerrar panel
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLightbox(src) {
    if (!src) return '';
    return `
      <div class="reports-lightbox-backdrop active" id="reports-lightbox-backdrop">
        <div class="reports-lightbox-content">
          <button type="button" class="lightbox-close-btn" id="btn-close-lightbox" aria-label="Cerrar imagen">✕</button>
          <img src="${escapeHtml(src)}" alt="Captura ampliada" class="lightbox-full-img">
        </div>
      </div>
    `;
  }

  function renderResultItem(res) {
    const ratingAvg = res.rating_average ? Number(res.rating_average).toFixed(1) : null;
    const ratingCount = Number(res.rating_count) || 0;
    const errCount = Number(res.error_reports_count) || 0;
    const errorsList = Array.isArray(res.error_reports) ? res.error_reports : [];
    const formType = res.form_type || '10-Q';
    const periodLabel = res.period_title || res.period_label || formatShortDate(res.period_end) || 'Periodo';

    return `
      <div class="company-result-item" data-analysis-id="${res.id}">
        <div class="result-item-main">
          <div class="result-item-identity">
            <span class="filing-badge ${formType === '10-K' ? 'filing-badge-10k' : 'filing-badge-10q'}">${escapeHtml(formType)}</span>
            <strong class="result-item-period">${escapeHtml(periodLabel)}</strong>
            <span class="result-item-accession" title="Accession SEC">${escapeHtml(res.accession || '—')}</span>
            <span class="result-item-date" title="Fecha de análisis con IA">📅 ${formatShortDate(res.created_at)}</span>
            ${res.model_used ? `<span class="result-item-model">🤖 ${escapeHtml(res.model_used)}</span>` : ''}
            ${res.version ? `<span class="result-item-version" title="Versión del análisis">v${escapeHtml(res.version)}</span>` : ''}
          </div>
          <div class="result-item-feedback-pill">
            ${ratingCount > 0
              ? `<span class="res-rating-pill" title="${ratingCount} valoraciones"><span class="star">★</span> ${ratingAvg} (${ratingCount})</span>`
              : '<span class="res-rating-pill pill-muted" title="Sin valoraciones aún">★ —</span>'
            }
            ${errCount > 0
              ? `<span class="res-error-pill pill-warning" title="${errCount} incidencias reportadas">⚠️ ${errCount} ${errCount === 1 ? 'incidencia' : 'incidencias'}</span>`
              : '<span class="res-error-pill pill-ok">✓ Sin incidencias</span>'
            }
          </div>
          <div class="result-item-actions">
            <button type="button" class="btn-view-analysis secondary-button btn-xs" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-accession="${escapeHtml(res.accession)}">👁️ Ver</button>
            <button type="button" class="btn-regenerate-analysis primary-button btn-xs btn-regen" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-accession="${escapeHtml(res.accession)}" title="Generar nueva versión con IA">🔄 Regenerar</button>
            <button type="button" class="btn-delete-analysis danger-button btn-xs" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-period="${escapeHtml(periodLabel)}" title="Eliminar informe">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  window.escapeHtml = escapeHtml;
  window.formatDate = formatDate;
  window.formatShortDate = formatShortDate;
  window.formatRelativeDate = formatRelativeDate;
  window.getCategoryLabel = getCategoryLabel;
  window.getCategoryTagHtml = getCategoryTagHtml;
  window.getStatusBadge = getStatusBadge;
  window.renderHeader = renderHeader;
  window.renderStatsCards = renderStatsCards;
  window.renderPagination = renderPagination;
  window.renderBulkActionBar = renderBulkActionBar;
  window.renderDrawer = renderDrawer;
  window.renderLightbox = renderLightbox;
  window.renderResultItem = renderResultItem;

})(window);
