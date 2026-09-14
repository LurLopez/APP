/**
 * @fileoverview Generadores de plantillas y vistas HTML para el Centro de Reportes.
 * @module ReportsRender
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function getCategoryLabel(cat) {
    const map = {
      incorrect_numbers: 'Cifras erróneas',
      wrong_period: 'Periodo incorrecto',
      missing_data: 'Datos faltantes',
      wrong_classification: 'Mala clasificación',
      bad_formatting: 'Formato deficiente',
      bug: 'Error técnico / Bug',
      market_data: 'Datos de cotización',
      screener: 'Buscador / Screener',
      portfolio: 'Cartera',
      account: 'Cuenta y acceso',
      suggestion: 'Sugerencia / Mejora',
      general: 'General',
      other: 'Otro',
    };
    return map[cat] || cat || 'General';
  }

  function getStatusBadge(status) {
    const badges = {
      pending: '<span class="report-status-badge status-pending">Pendiente</span>',
      reviewed: '<span class="report-status-badge status-reviewed">En revisión</span>',
      resolved: '<span class="report-status-badge status-resolved">Resuelto</span>',
      dismissed: '<span class="report-status-badge status-dismissed">Descartado</span>',
    };
    return badges[status] || `<span class="report-status-badge">${escapeHtml(status || '—')}</span>`;
  }

  function renderHeader({ statsData, activeTab }) {
    const aiCount = statsData?.aiErrors?.pending_ai_errors;
    const aiBadge = aiCount ? `<span class="reports-tab-badge">${aiCount}</span>` : '';
    const genCount = statsData?.generalReports?.pending_general_reports;
    const genBadge = genCount ? `<span class="reports-tab-badge">${genCount}</span>` : '';

    return `
      <div class="reports-header-card">
        <div class="reports-title-wrap">
          <div class="reports-title-left">
            <span class="section-index">ADMINISTRACIÓN Y AUDITORÍA</span>
            <div class="reports-title-row">
              <h1 class="reports-main-title">Centro de Reportes</h1>
              <span class="reports-admin-pill">👑 Modo Administrador</span>
            </div>
            <p class="reports-subtitle">Supervisa los informes analizados con IA agrupados por empresa y resultados, gestiona incidencias de usuarios y revisa los reportes generales de la plataforma.</p>
          </div>
          <div class="reports-tabs-nav">
            <button type="button" class="reports-nav-btn ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13H7zM14 3v5h5"/><path d="M10 12h6M10 16h6"/></svg>
              <span>1. Reportes por Análisis de IA</span>
              ${aiBadge}
            </button>
            <button type="button" class="reports-nav-btn ${activeTab === 'general' ? 'active' : ''}" data-tab="general">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>2. Reportes Generales</span>
              ${genBadge}
            </button>
          </div>
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

    return `
      <div class="reports-stats-grid">
        <div class="reports-stat-card">
          <div class="stat-icon-wrap stat-icon-blue">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${a.total_analyses ?? 0}</span>
            <span class="stat-label">Análisis IA generados (${a.total_companies ?? 0} empresas)</span>
          </div>
        </div>
        <div class="reports-stat-card">
          <div class="stat-icon-wrap stat-icon-amber">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${r.average_rating ? r.average_rating + ' ★' : '—'}</span>
            <span class="stat-label">Valoración media (${r.total_ratings ?? 0} votos)</span>
          </div>
        </div>
        <div class="reports-stat-card">
          <div class="stat-icon-wrap ${aiErr.pending_ai_errors > 0 ? 'stat-icon-red' : 'stat-icon-green'}">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${aiErr.pending_ai_errors ?? 0}</span>
            <span class="stat-label">Incidencias en análisis pendientes</span>
          </div>
        </div>
        <div class="reports-stat-card">
          <div class="stat-icon-wrap ${gen.pending_general_reports > 0 ? 'stat-icon-red' : 'stat-icon-green'}">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${gen.pending_general_reports ?? 0}</span>
            <span class="stat-label">Reportes generales pendientes</span>
          </div>
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

    let errorsHtml = '';
    if (errCount > 0) {
      errorsHtml = `
        <div class="res-error-reports-wrap">
          <div class="res-error-reports-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ef4444" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>${errCount} ${errCount === 1 ? 'incidencia reportada' : 'incidencias reportadas'} por usuarios sobre este análisis:</span>
          </div>
          <div class="res-errors-list">
            ${errorsList.map((err) => `
              <div class="res-error-card status-${escapeHtml(err.status || 'pending')}">
                <div class="res-error-head">
                  <span class="res-error-category">${escapeHtml(getCategoryLabel(err.category))}</span>
                  ${getStatusBadge(err.status)}
                  <span class="res-error-date">${formatDate(err.created_at)}</span>
                  ${err.user_email ? `<span class="res-error-user">👤 ${escapeHtml(err.user_email)}</span>` : '<span class="res-error-user">👤 Anónimo</span>'}
                </div>
                <div class="res-error-desc">${escapeHtml(err.description)}</div>
                <div class="res-error-actions-row">
                  <label class="res-error-status-label">
                    Estado:
                    <select class="res-error-status-select" data-error-id="${err.id}">
                      <option value="pending" ${err.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                      <option value="reviewed" ${err.status === 'reviewed' ? 'selected' : ''}>En revisión</option>
                      <option value="resolved" ${err.status === 'resolved' ? 'selected' : ''}>Resuelto</option>
                      <option value="dismissed" ${err.status === 'dismissed' ? 'selected' : ''}>Descartado</option>
                    </select>
                  </label>
                  <input type="text" class="res-error-notes-input" data-error-id="${err.id}" placeholder="Nota interna del admin..." value="${escapeHtml(err.admin_notes || '')}">
                  <button type="button" class="btn-save-error-notes secondary-button btn-xs" data-error-id="${err.id}">Guardar</button>
                  <button type="button" class="btn-del-error danger-button btn-xs" data-error-id="${err.id}" title="Eliminar incidencia">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="company-result-item" data-analysis-id="${res.id}">
        <div class="result-item-main">
          <div class="result-item-identity">
            <span class="filing-badge ${formType === '10-K' ? 'filing-badge-10k' : 'filing-badge-10q'}">${escapeHtml(formType)}</span>
            <strong class="result-item-period">${escapeHtml(periodLabel)}</strong>
            <span class="result-item-accession" title="Accession SEC">${escapeHtml(res.accession || '—')}</span>
            <span class="result-item-date" title="Fecha en que se analizó con IA">📅 Generado: ${formatShortDate(res.created_at)}</span>
            ${res.model_used ? `<span class="result-item-model">🤖 ${escapeHtml(res.model_used)}</span>` : ''}
            ${res.version ? `<span class="result-item-version" title="Versión del análisis">Versión ${escapeHtml(res.version)}</span>` : ''}
          </div>
          <div class="result-item-feedback-pill">
            ${ratingCount > 0
              ? `<span class="res-rating-pill" title="${ratingCount} valoraciones de usuarios"><span class="star">★</span> ${ratingAvg} (${ratingCount})</span>`
              : '<span class="res-rating-pill pill-muted" title="Sin valoraciones aún">★ —</span>'
            }
            ${errCount > 0
              ? `<span class="res-error-pill pill-warning" title="${errCount} incidencias reportadas">⚠️ ${errCount} ${errCount === 1 ? 'reporte' : 'reportes'}</span>`
              : '<span class="res-error-pill pill-ok">✓ Sin fallos reportados</span>'
            }
          </div>
          <div class="result-item-actions">
            <button type="button" class="btn-view-analysis secondary-button btn-sm" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-accession="${escapeHtml(res.accession)}">👁️ Ver análisis</button>
            <button type="button" class="btn-regenerate-analysis primary-button btn-sm btn-regen" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-accession="${escapeHtml(res.accession)}" title="Generar versión nueva">🔄 Regenerar con IA</button>
            <button type="button" class="btn-delete-analysis danger-button btn-sm" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-period="${escapeHtml(periodLabel)}" title="Eliminar informe">🗑️</button>
          </div>
        </div>
        ${errorsHtml}
      </div>
    `;
  }

  function renderCompanyCard(company) {
    const hasErrors = company.totalErrors > 0;
    const resultsCount = company.results.length;
    const resultsListHtml = company.results.map(renderResultItem).join('');
    const compTicker = String(company.ticker || 'DEMO');
    const compName = String(company.companyName || company.ticker || 'Empresa');
    const compLogo = compTicker.slice(0, 4);

    return `
      <div class="company-reports-card ${hasErrors ? 'card-has-errors' : ''}">
        <div class="company-card-header">
          <div class="company-card-left">
            <span class="company-card-logo">${escapeHtml(compLogo)}</span>
            <div>
              <div class="company-card-title-row">
                <h3 class="company-card-name">${escapeHtml(compName)}</h3>
                <span class="company-card-ticker">${escapeHtml(compTicker)}</span>
              </div>
              <span class="company-card-sub">${resultsCount} ${resultsCount === 1 ? 'informe analizado' : 'informes analizados'} por la IA</span>
            </div>
          </div>
          <div class="company-card-right">
            ${hasErrors
              ? `<span class="company-error-alert-badge">⚠️ ${company.totalErrors} ${company.totalErrors === 1 ? 'incidencia pendiente' : 'incidencias pendientes'}</span>`
              : '<span class="company-ok-badge">✓ Informes al día</span>'
            }
          </div>
        </div>
        <div class="company-results-container">${resultsListHtml}</div>
      </div>
    `;
  }

  function renderAiTab({ aiData, aiFilterMode, aiSearchQuery }) {
    let filtered = aiData?.companies || [];
    if (aiFilterMode === 'errors') filtered = filtered.filter((c) => c.totalErrors > 0);
    else if (aiFilterMode === 'rated') filtered = filtered.filter((c) => c.results.some((r) => Number(r.rating_count) > 0));

    let listHtml = '';
    if (!filtered.length) {
      listHtml = `
        <div class="reports-empty-state">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#9ca3af" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <h3>No se encontraron análisis</h3>
          <p>${aiSearchQuery ? 'No hay resultados para "' + escapeHtml(aiSearchQuery) + '".' : 'Aún no se ha generado ningún análisis de informe con IA.'}</p>
        </div>
      `;
    } else {
      listHtml = filtered.map(renderCompanyCard).join('');
    }

    return `
      <div class="reports-tab-content">
        <div class="reports-toolbar">
          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-ai-search" class="reports-search-input" placeholder="Buscar por ticker o empresa..." value="${escapeHtml(aiSearchQuery)}">
          </div>
          <div class="reports-filter-chips">
            <button type="button" class="report-chip ${aiFilterMode === 'all' ? 'active' : ''}" data-filter-mode="all">Todas las empresas</button>
            <button type="button" class="report-chip ${aiFilterMode === 'errors' ? 'active' : ''}" data-filter-mode="errors">⚠️ Con incidencias</button>
            <button type="button" class="report-chip ${aiFilterMode === 'rated' ? 'active' : ''}" data-filter-mode="rated">★ Con valoraciones</button>
          </div>
          <button type="button" class="secondary-button btn-sm" id="btn-refresh-ai-reports">🔄 Refrescar</button>
        </div>
        <div class="company-reports-list">${listHtml}</div>
      </div>
    `;
  }

  function renderGeneralTab({ generalData, generalStatusFilter, generalCategoryFilter, generalSearchQuery }) {
    const reports = generalData || [];
    let tableRows = '';
    if (!reports.length) {
      tableRows = '<tr><td colspan="7" class="reports-table-empty">No se han registrado reportes generales aún.</td></tr>';
    } else {
      tableRows = reports.map((r) => {
        const rawImages = Array.isArray(r.images) ? r.images : [];
        const imagesThumb = rawImages.length > 0 ? `
          <div class="report-images-row">
            ${rawImages.map((img, i) => `
              <a href="${escapeHtml(img)}" target="_blank" rel="noopener" class="report-img-thumb-link">
                <img src="${escapeHtml(img)}" class="report-img-thumb" alt="Captura ${i + 1}">
              </a>
            `).join('')}
          </div>
        ` : '';

        return `
          <tr class="general-report-row" data-report-id="${r.id}">
            <td class="col-id">#${r.id}</td>
            <td class="col-date">${formatDate(r.created_at)}</td>
            <td class="col-category"><span class="category-tag tag-${escapeHtml(r.category)}">${escapeHtml(getCategoryLabel(r.category))}</span></td>
            <td class="col-details">
              <strong class="general-report-title">${escapeHtml(r.title)}</strong>
              <p class="general-report-desc">${escapeHtml(r.description)}</p>
              ${imagesThumb}
            </td>
            <td class="col-user">${r.user_email ? `<span>👤 ${escapeHtml(r.user_email)}</span>` : '<span class="text-muted">Anónimo</span>'}</td>
            <td class="col-status">
              <select class="general-status-select" data-report-id="${r.id}">
                <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                <option value="reviewed" ${r.status === 'reviewed' ? 'selected' : ''}>En revisión</option>
                <option value="resolved" ${r.status === 'resolved' ? 'selected' : ''}>Resuelto</option>
                <option value="dismissed" ${r.status === 'dismissed' ? 'selected' : ''}>Descartado</option>
              </select>
            </td>
            <td class="col-actions">
              <div class="report-notes-row">
                <input type="text" class="general-notes-input" data-report-id="${r.id}" placeholder="Nota de resolución..." value="${escapeHtml(r.admin_notes || '')}">
                <button type="button" class="btn-save-general-notes secondary-button btn-xs" data-report-id="${r.id}">Guardar</button>
                <button type="button" class="btn-delete-general danger-button btn-xs" data-report-id="${r.id}">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    return `
      <div class="reports-tab-content">
        <div class="reports-toolbar">
          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-general-search" class="reports-search-input" placeholder="Buscar..." value="${escapeHtml(generalSearchQuery)}">
          </div>
          <div class="reports-filters-group">
            <select id="general-filter-status" class="reports-select">
              <option value="all" ${generalStatusFilter === 'all' ? 'selected' : ''}>Todos los estados</option>
              <option value="pending" ${generalStatusFilter === 'pending' ? 'selected' : ''}>Solo Pendientes</option>
              <option value="reviewed" ${generalStatusFilter === 'reviewed' ? 'selected' : ''}>En revisión</option>
              <option value="resolved" ${generalStatusFilter === 'resolved' ? 'selected' : ''}>Resueltos</option>
              <option value="dismissed" ${generalStatusFilter === 'dismissed' ? 'selected' : ''}>Descartados</option>
            </select>
            <select id="general-filter-category" class="reports-select">
              <option value="all" ${generalCategoryFilter === 'all' ? 'selected' : ''}>Todas las categorías</option>
              <option value="bug" ${generalCategoryFilter === 'bug' ? 'selected' : ''}>Bug / Error web</option>
              <option value="market_data" ${generalCategoryFilter === 'market_data' ? 'selected' : ''}>Datos de mercado</option>
              <option value="screener" ${generalCategoryFilter === 'screener' ? 'selected' : ''}>Screener</option>
              <option value="portfolio" ${generalCategoryFilter === 'portfolio' ? 'selected' : ''}>Cartera</option>
              <option value="suggestion" ${generalCategoryFilter === 'suggestion' ? 'selected' : ''}>Sugerencia</option>
              <option value="account" ${generalCategoryFilter === 'account' ? 'selected' : ''}>Cuenta</option>
              <option value="general" ${generalCategoryFilter === 'general' ? 'selected' : ''}>General</option>
            </select>
          </div>
          <button type="button" class="primary-button btn-sm" id="btn-create-general-report">➕ Nuevo reporte</button>
          <button type="button" class="secondary-button btn-sm" id="btn-refresh-general-reports">🔄 Refrescar</button>
        </div>
        <div class="reports-table-responsive">
          <table class="reports-data-table">
            <thead>
              <tr>
                <th style="width: 50px;">ID</th>
                <th style="width: 140px;">Fecha</th>
                <th style="width: 130px;">Categoría</th>
                <th>Detalles de la incidencia</th>
                <th style="width: 150px;">Usuario</th>
                <th style="width: 130px;">Estado</th>
                <th style="width: 200px;">Acciones</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.ReportsRender = {
    escapeHtml,
    formatDate,
    formatShortDate,
    getCategoryLabel,
    getStatusBadge,
    renderHeader,
    renderStatsCards,
    renderAiTab,
    renderGeneralTab,
  };
})();
