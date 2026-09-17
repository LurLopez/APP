/**
 * @fileoverview Pestañas de Análisis IA y Reportes Generales con soporte
 * para vistas múltiples (Tabla, Incidencias, Empresas), filtros interactivos,
 * selección masiva y paginación enterprise.
 */

(function (window) {
  'use strict';

  function escapeHtml(val) {
    return window.escapeHtml(val);
  }

  function formatDate(d) {
    return window.formatDate(d);
  }

  function formatShortDate(d) {
    return window.formatShortDate(d);
  }

  function formatRelativeDate(d) {
    return window.formatRelativeDate(d);
  }

  function getCategoryLabel(c) {
    return window.getCategoryLabel(c);
  }

  function getCategoryTagHtml(c) {
    return window.getCategoryTagHtml(c);
  }

  function getStatusBadge(s) {
    return window.getStatusBadge(s);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PESTAÑA 1: ANÁLISIS E INCIDENCIAS DE IA
  // ═════════════════════════════════════════════════════════════════════════

  function renderAiTab({
    aiData,
    aiSubView = 'table',
    aiFilterMode = 'all',
    aiSearchQuery = '',
    aiSortField = 'created_at',
    aiSortOrder = 'desc',
    aiPage = 1,
    aiPageSize = 25,
    selectedAiItems = new Set(),
    expandedCompanies = new Set(),
    allCompaniesExpanded = false,
  }) {
    const rawList = Array.isArray(aiData?.rawList) ? aiData.rawList : [];
    const companies = Array.isArray(aiData?.companies) ? aiData.companies : [];

    // Extraer todas las incidencias de IA planas para la vista Foco
    const allErrorsList = [];
    rawList.forEach((item) => {
      const errs = Array.isArray(item.error_reports) ? item.error_reports : [];
      errs.forEach((e) => {
        allErrorsList.push({
          ...e,
          parentAnalysis: item,
        });
      });
    });

    const pendingErrorsCount = allErrorsList.filter((e) => e.status === 'pending').length;

    // ── Filtrado y Búsqueda de Análisis ──────────────────────────────────────
    let filteredList = [...rawList];
    const q = (aiSearchQuery || '').trim().toLowerCase();

    if (q) {
      filteredList = filteredList.filter((item) => {
        const tickerMatch = (item.ticker || '').toLowerCase().includes(q);
        const nameMatch = (item.company_name || '').toLowerCase().includes(q);
        const accMatch = (item.accession || '').toLowerCase().includes(q);
        const modelMatch = (item.model_used || '').toLowerCase().includes(q);
        const periodMatch = (item.period_title || item.period_label || '').toLowerCase().includes(q);
        return tickerMatch || nameMatch || accMatch || modelMatch || periodMatch;
      });
    }

    if (aiFilterMode === 'errors') {
      filteredList = filteredList.filter((item) => Number(item.error_reports_count || 0) > 0);
    } else if (aiFilterMode === 'rated') {
      filteredList = filteredList.filter((item) => Number(item.rating_count || 0) > 0);
    } else if (aiFilterMode === 'clean') {
      filteredList = filteredList.filter((item) => Number(item.error_reports_count || 0) === 0);
    } else if (aiFilterMode === '10-k') {
      filteredList = filteredList.filter((item) => (item.form_type || '').toUpperCase() === '10-K');
    } else if (aiFilterMode === '10-q') {
      filteredList = filteredList.filter((item) => (item.form_type || '').toUpperCase() === '10-Q');
    }

    // ── Ordenación ────────────────────────────────────────────────────────────
    filteredList.sort((a, b) => {
      let valA = a[aiSortField];
      let valB = b[aiSortField];

      if (aiSortField === 'created_at' || aiSortField === 'period_end') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (aiSortField === 'rating') {
        valA = Number(a.rating_average || 0);
        valB = Number(b.rating_average || 0);
      } else if (aiSortField === 'errors') {
        valA = Number(a.error_reports_count || 0);
        valB = Number(b.error_reports_count || 0);
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
        return aiSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (aiSortOrder === 'asc') return (valA > valB ? 1 : -1);
      return (valA < valB ? 1 : -1);
    });

    const totalFiltered = filteredList.length;
    const startIndex = (aiPage - 1) * aiPageSize;
    const paginatedList = filteredList.slice(startIndex, startIndex + aiPageSize);

    // ── Render de la barra superior y sub-vistas ──────────────────────────────
    const bulkBarHtml = window.renderBulkActionBar({
      count: selectedAiItems.size,
      type: aiSubView === 'errors' ? 'ai-errors' : 'ai-analyses',
    });

    let subViewContent = '';

    if (aiSubView === 'table') {
      subViewContent = renderAiTableSubView({
        list: paginatedList,
        total: totalFiltered,
        selectedAiItems,
        aiSortField,
        aiSortOrder,
      });
    } else if (aiSubView === 'errors') {
      subViewContent = renderAiErrorsSubView({
        allErrors: allErrorsList,
        searchQuery: aiSearchQuery,
        selectedAiItems,
        page: aiPage,
        pageSize: aiPageSize,
      });
    } else if (aiSubView === 'companies') {
      subViewContent = renderAiCompaniesSubView({
        companies,
        searchQuery: aiSearchQuery,
        filterMode: aiFilterMode,
        expandedCompanies,
        allCompaniesExpanded,
      });
    }

    const paginationHtml = aiSubView !== 'companies'
      ? window.renderPagination({
          total: aiSubView === 'errors' ? allErrorsList.length : totalFiltered,
          page: aiPage,
          pageSize: aiPageSize,
          idPrefix: 'ai',
        })
      : '';

    return `
      <div class="reports-tab-content">
        <!-- Sub-View Switcher y Herramientas -->
        <div class="reports-toolbar enterprise-toolbar">
          <div class="reports-subview-selector">
            <button type="button" class="subview-btn ${aiSubView === 'table' ? 'active' : ''}" data-subview="table" title="Tabla completa de análisis generados con IA">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/></svg>
              <span>Tabla Global (${rawList.length})</span>
            </button>
            <button type="button" class="subview-btn ${aiSubView === 'errors' ? 'active' : ''}" data-subview="errors" title="Incidencias y errores reportados por usuarios">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Incidencias Reportadas</span>
              ${pendingErrorsCount > 0 ? `<span class="subview-badge badge-red">${pendingErrorsCount}</span>` : `<span class="subview-badge">${allErrorsList.length}</span>`}
            </button>
            <button type="button" class="subview-btn ${aiSubView === 'companies' ? 'active' : ''}" data-subview="companies" title="Agrupación por empresas monitorizadas">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="22.01"/><line x1="15" y1="22" x2="15" y2="22.01"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><line x1="9" y1="18" x2="9" y2="18.01"/><line x1="15" y1="18" x2="15" y2="18.01"/></svg>
              <span>Por Empresa (${companies.length})</span>
            </button>
          </div>

          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-ai-search" class="reports-search-input" placeholder="Buscar ticker, empresa, accession, modelo..." value="${escapeHtml(aiSearchQuery)}">
            ${aiSearchQuery ? '<button type="button" class="search-clear-btn" id="btn-clear-ai-search">✕</button>' : ''}
          </div>

          <div class="reports-filter-chips">
            <button type="button" class="report-chip ${aiFilterMode === 'all' ? 'active' : ''}" data-filter-mode="all">Todos</button>
            <button type="button" class="report-chip ${aiFilterMode === 'errors' ? 'active' : ''}" data-filter-mode="errors">⚠️ Con incidencias</button>
            <button type="button" class="report-chip ${aiFilterMode === 'rated' ? 'active' : ''}" data-filter-mode="rated">★ Con valoraciones</button>
            <button type="button" class="report-chip ${aiFilterMode === 'clean' ? 'active' : ''}" data-filter-mode="clean">✓ Sin incidencias</button>
            <button type="button" class="report-chip ${aiFilterMode === '10-k' ? 'active' : ''}" data-filter-mode="10-k">10-K Anual</button>
            <button type="button" class="report-chip ${aiFilterMode === '10-q' ? 'active' : ''}" data-filter-mode="10-q">10-Q Trimestral</button>
          </div>
        </div>

        ${bulkBarHtml}

        <!-- Contenedor Principal de la Sub-Vista -->
        <div class="reports-view-container">
          ${subViewContent}
        </div>

        ${paginationHtml}
      </div>
    `;
  }

  // Sub-vista A: Tabla Global de Análisis IA
  function renderAiTableSubView({ list, total, selectedAiItems, aiSortField, aiSortOrder }) {
    if (!list.length) {
      return `
        <div class="reports-empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#9ca3af" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <h3>No se encontraron análisis de IA</h3>
          <p>No hay registros que coincidan con los filtros o el término de búsqueda actual.</p>
        </div>
      `;
    }

    const sortIndicator = (field) => {
      if (aiSortField !== field) return '<span class="sort-icon-neutral">↕</span>';
      return aiSortOrder === 'asc' ? '<span class="sort-icon active">↑</span>' : '<span class="sort-icon active">↓</span>';
    };

    const rowsHtml = list.map((item) => {
      const isSelected = selectedAiItems.has(Number(item.id));
      const ratingAvg = item.rating_average ? Number(item.rating_average).toFixed(1) : null;
      const ratingCount = Number(item.rating_count) || 0;
      const errCount = Number(item.error_reports_count) || 0;
      const formType = (item.form_type || '10-Q').toUpperCase();
      const periodLabel = item.period_title || item.period_label || formatShortDate(item.period_end) || '—';
      const ticker = String(item.ticker || 'DEMO').toUpperCase();
      const companyName = String(item.company_name || ticker);
      const errors = Array.isArray(item.error_reports) ? item.error_reports : [];
      const hasPendingError = errors.some((e) => e.status === 'pending');

      return `
        <tr class="enterprise-row ${isSelected ? 'row-selected' : ''}" data-analysis-id="${item.id}">
          <td class="col-checkbox">
            <input type="checkbox" class="ai-item-checkbox" data-analysis-id="${item.id}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar análisis">
          </td>
          <td class="col-company">
            <div class="company-cell-flex">
              <span class="company-mini-logo">${escapeHtml(ticker.slice(0, 4))}</span>
              <div class="company-meta-col">
                <div class="company-ticker-row">
                  <span class="company-ticker-pill">${escapeHtml(ticker)}</span>
                  <strong class="company-name-text" title="${escapeHtml(companyName)}">${escapeHtml(companyName)}</strong>
                </div>
              </div>
            </div>
          </td>
          <td class="col-filing">
            <div class="filing-meta-stack">
              <div class="filing-badge-row">
                <span class="filing-badge ${formType === '10-K' ? 'filing-badge-10k' : 'filing-badge-10q'}">${escapeHtml(formType)}</span>
                <span class="filing-period-text"><strong>${escapeHtml(periodLabel)}</strong></span>
              </div>
              <span class="filing-acc mono-font" title="Accession SEC">${escapeHtml(item.accession || '—')}</span>
            </div>
          </td>
          <td class="col-model">
            <div class="model-meta-stack">
              <span class="model-chip" title="Modelo de IA utilizado">🤖 ${escapeHtml(item.model_used || 'Claude/DeepSeek')}</span>
              ${item.version ? `<span class="version-chip">v${escapeHtml(item.version)}</span>` : ''}
            </div>
          </td>
          <td class="col-date">
            <div class="date-meta-stack">
              <span class="date-rel">${formatRelativeDate(item.created_at)}</span>
              <span class="date-full text-muted">${formatShortDate(item.created_at)}</span>
            </div>
          </td>
          <td class="col-rating">
            ${ratingCount > 0
              ? `<div class="rating-cell-pill" title="${ratingCount} valoraciones de usuarios"><span class="star-gold">★</span> <strong>${ratingAvg}</strong> <span class="rating-count">(${ratingCount})</span></div>`
              : '<span class="text-muted rating-empty">★ —</span>'
            }
          </td>
          <td class="col-errors">
            ${errCount > 0
              ? `<button type="button" class="btn-open-analysis-errors badge-alert-pill ${hasPendingError ? 'pill-urgent' : 'pill-reviewed'}" data-analysis-id="${item.id}" title="Ver ${errCount} incidencias">
                   ⚠️ ${errCount} ${errCount === 1 ? 'incidencia' : 'incidencias'} ${hasPendingError ? '(Pendiente)' : ''}
                 </button>`
              : '<span class="badge-ok-pill">✓ Limpio</span>'
            }
          </td>
          <td class="col-actions">
            <div class="table-actions-group">
              <button type="button" class="btn-view-analysis secondary-button btn-xs" data-analysis-id="${item.id}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(item.accession)}" title="Abrir informe completo">
                👁️ Ver
              </button>
              <button type="button" class="btn-regenerate-analysis primary-button btn-xs btn-regen" data-analysis-id="${item.id}" data-ticker="${escapeHtml(ticker)}" data-accession="${escapeHtml(item.accession)}" title="Forzar reanálisis desde SEC EDGAR">
                🔄
              </button>
              <button type="button" class="btn-delete-analysis danger-button btn-xs" data-analysis-id="${item.id}" data-ticker="${escapeHtml(ticker)}" data-period="${escapeHtml(periodLabel)}" title="Eliminar informe">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="reports-table-responsive enterprise-table-wrap">
        <table class="reports-data-table enterprise-table">
          <thead>
            <tr>
              <th style="width: 38px;">
                <input type="checkbox" id="select-all-ai" aria-label="Seleccionar todos los análisis visibles">
              </th>
              <th style="min-width: 180px;" class="th-sortable" data-sort="ticker" data-prefix="ai">
                Empresa ${sortIndicator('ticker')}
              </th>
              <th style="min-width: 160px;" class="th-sortable" data-sort="period_end" data-prefix="ai">
                Documento & Periodo ${sortIndicator('period_end')}
              </th>
              <th style="min-width: 140px;">Modelo & Versión</th>
              <th style="min-width: 120px;" class="th-sortable" data-sort="created_at" data-prefix="ai">
                Generado ${sortIndicator('created_at')}
              </th>
              <th style="width: 110px;" class="th-sortable" data-sort="rating" data-prefix="ai">
                Valoración ${sortIndicator('rating')}
              </th>
              <th style="width: 160px;" class="th-sortable" data-sort="errors" data-prefix="ai">
                Incidencias ${sortIndicator('errors')}
              </th>
              <th style="width: 130px; text-align: right;">Acciones</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  // Sub-vista B: Listado Plano de Incidencias Reportadas (Foco)
  function renderAiErrorsSubView({ allErrors, searchQuery, selectedAiItems, page, pageSize }) {
    let filtered = [...allErrors];
    const q = (searchQuery || '').trim().toLowerCase();

    if (q) {
      filtered = filtered.filter((err) => {
        const parent = err.parentAnalysis || {};
        const tickerMatch = (parent.ticker || '').toLowerCase().includes(q);
        const descMatch = (err.description || '').toLowerCase().includes(q);
        const userMatch = (err.user_email || '').toLowerCase().includes(q);
        const catMatch = (getCategoryLabel(err.category) || '').toLowerCase().includes(q);
        return tickerMatch || descMatch || userMatch || catMatch;
      });
    }

    if (!filtered.length) {
      return `
        <div class="reports-empty-state">
          <div class="empty-icon-circle green-circle">✓</div>
          <h3>Sin incidencias pendientes en análisis de IA</h3>
          <p>${searchQuery ? 'No se encontraron incidencias que coincidan con la búsqueda.' : 'Todos los informes analizados están libres de fallos reportados.'}</p>
        </div>
      `;
    }

    // Ordenar pendientes primero
    filtered.sort((a, b) => {
      const order = { pending: 0, reviewed: 1, resolved: 2, dismissed: 3 };
      const statusA = order[a.status] ?? 99;
      const statusB = order[b.status] ?? 99;
      if (statusA !== statusB) return statusA - statusB;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const startIndex = (page - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    const rowsHtml = paginated.map((err) => {
      const parent = err.parentAnalysis || {};
      const isSelected = selectedAiItems.has(Number(err.id));
      const ticker = String(parent.ticker || 'DEMO');
      const periodLabel = parent.period_title || parent.period_label || formatShortDate(parent.period_end) || '—';

      return `
        <tr class="enterprise-row ${isSelected ? 'row-selected' : ''}" data-error-id="${err.id}">
          <td class="col-checkbox">
            <input type="checkbox" class="ai-error-checkbox" data-error-id="${err.id}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar incidencia">
          </td>
          <td class="col-id">#${err.id}</td>
          <td class="col-company">
            <div class="company-ticker-row">
              <span class="company-ticker-pill">${escapeHtml(ticker)}</span>
              <span class="filing-badge filing-badge-sm">${escapeHtml(parent.form_type || '10-Q')}</span>
              <span class="filing-period-text">${escapeHtml(periodLabel)}</span>
            </div>
          </td>
          <td class="col-category">${getCategoryTagHtml(err.category)}</td>
          <td class="col-details">
            <div class="error-desc-clamp" title="${escapeHtml(err.description)}">
              ${escapeHtml(err.description)}
            </div>
            ${err.admin_notes ? `<div class="error-admin-notes-hint">📝 <em>${escapeHtml(err.admin_notes)}</em></div>` : ''}
          </td>
          <td class="col-user">
            <span class="user-email-text">👤 ${escapeHtml(err.user_email || 'Anónimo')}</span>
          </td>
          <td class="col-date">
            <span class="date-rel">${formatRelativeDate(err.created_at)}</span>
          </td>
          <td class="col-status">
            <select class="res-error-status-select reports-quick-select" data-error-id="${err.id}">
              <option value="pending" ${err.status === 'pending' ? 'selected' : ''}>Pendiente</option>
              <option value="reviewed" ${err.status === 'reviewed' ? 'selected' : ''}>En revisión</option>
              <option value="resolved" ${err.status === 'resolved' ? 'selected' : ''}>Resuelto</option>
              <option value="dismissed" ${err.status === 'dismissed' ? 'selected' : ''}>Descartado</option>
            </select>
          </td>
          <td class="col-actions">
            <div class="table-actions-group">
              <button type="button" class="btn-open-error-drawer secondary-button btn-xs" data-error-id="${err.id}" title="Inspeccionar detalle y notas">
                Detalle
              </button>
              <button type="button" class="btn-view-analysis secondary-button btn-xs" data-ticker="${escapeHtml(parent.ticker)}" data-accession="${escapeHtml(parent.accession)}" title="Ver análisis completo">
                👁️
              </button>
              <button type="button" class="btn-del-error danger-button btn-xs" data-error-id="${err.id}" title="Eliminar incidencia">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="reports-table-responsive enterprise-table-wrap">
        <table class="reports-data-table enterprise-table">
          <thead>
            <tr>
              <th style="width: 38px;">
                <input type="checkbox" id="select-all-ai-errors" aria-label="Seleccionar todas las incidencias">
              </th>
              <th style="width: 60px;">ID</th>
              <th style="min-width: 170px;">Análisis Afectado</th>
              <th style="width: 140px;">Categoría</th>
              <th style="min-width: 250px;">Descripción de la Incidencia</th>
              <th style="width: 150px;">Usuario</th>
              <th style="width: 110px;">Fecha</th>
              <th style="width: 130px;">Estado</th>
              <th style="width: 120px; text-align: right;">Acciones</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  // Sub-vista C: Agrupación por Empresa (Acordeón Enterprise)
  function renderAiCompaniesSubView({ companies, searchQuery, filterMode, expandedCompanies, allCompaniesExpanded }) {
    let filtered = [...companies];
    const q = (searchQuery || '').trim().toLowerCase();

    if (q) {
      filtered = filtered.filter((c) => {
        const tMatch = (c.ticker || '').toLowerCase().includes(q);
        const nMatch = (c.companyName || '').toLowerCase().includes(q);
        return tMatch || nMatch;
      });
    }

    if (filterMode === 'errors') {
      filtered = filtered.filter((c) => c.totalErrors > 0);
    } else if (filterMode === 'rated') {
      filtered = filtered.filter((c) => c.results.some((r) => Number(r.rating_count) > 0));
    }

    if (!filtered.length) {
      return `
        <div class="reports-empty-state">
          <h3>No se encontraron empresas</h3>
          <p>No hay empresas que coincidan con la búsqueda o filtro aplicado.</p>
        </div>
      `;
    }

    const cardsHtml = filtered.map((c) => {
      const compTicker = String(c.ticker || 'DEMO').toUpperCase();
      const compName = String(c.companyName || compTicker);
      const isExpanded = allCompaniesExpanded || expandedCompanies.has(compTicker);
      const hasErrors = Number(c.totalErrors || 0) > 0;
      const resultsCount = c.results.length;

      const itemsHtml = isExpanded
        ? c.results.map((r) => window.renderResultItem(r)).join('')
        : '';

      return `
        <div class="company-reports-card enterprise-company-card ${hasErrors ? 'card-has-errors' : ''}" data-ticker="${escapeHtml(compTicker)}">
          <div class="company-card-header" data-toggle-company="${escapeHtml(compTicker)}">
            <div class="company-card-left">
              <span class="company-card-logo">${escapeHtml(compTicker.slice(0, 4))}</span>
              <div class="company-card-titles">
                <div class="company-card-title-row">
                  <h3 class="company-card-name">${escapeHtml(compName)}</h3>
                  <span class="company-card-ticker">${escapeHtml(compTicker)}</span>
                </div>
                <span class="company-card-sub">${resultsCount} ${resultsCount === 1 ? 'informe analizado' : 'informes analizados'}</span>
              </div>
            </div>
            <div class="company-card-right">
              ${hasErrors
                ? `<span class="company-error-alert-badge">⚠️ ${c.totalErrors} ${c.totalErrors === 1 ? 'incidencia' : 'incidencias'}</span>`
                : '<span class="company-ok-badge">✓ Al día</span>'
              }
              <button type="button" class="btn-toggle-accordion ${isExpanded ? 'rotated' : ''}" aria-label="Desplegar empresa">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
          </div>
          ${isExpanded ? `<div class="company-results-container">${itemsHtml}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="company-view-wrapper">
        <div class="company-accordion-toolbar">
          <span class="company-accordion-count">Mostrando <strong>${filtered.length}</strong> empresas</span>
          <button type="button" class="secondary-button btn-xs" id="btn-toggle-all-companies">
            ${allCompaniesExpanded ? 'Colapsar todas' : 'Expandir todas'}
          </button>
        </div>
        <div class="company-reports-list">${cardsHtml}</div>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PESTAÑA 2: REPORTES GENERALES DE PLATAFORMA (BUGS, SOPORTE)
  // ═════════════════════════════════════════════════════════════════════════

  function renderGeneralTab({
    generalData = [],
    generalTotal = 0,
    generalStatusFilter = 'all',
    generalCategoryFilter = 'all',
    generalSearchQuery = '',
    generalSortField = 'created_at',
    generalSortOrder = 'desc',
    generalPage = 1,
    generalPageSize = 25,
    selectedGeneralItems = new Set(),
    statsData = null,
  }) {
    const reports = Array.isArray(generalData) ? generalData : [];
    const totalCount = generalTotal || reports.length;

    // Conteo por estado para los botones segmentados
    const pendingCount = statsData?.generalReports?.pending_general_reports ?? reports.filter((r) => r.status === 'pending').length;
    const reviewedCount = reports.filter((r) => r.status === 'reviewed').length;
    const resolvedCount = statsData?.generalReports?.resolved_general_reports ?? reports.filter((r) => r.status === 'resolved').length;
    const dismissedCount = reports.filter((r) => r.status === 'dismissed').length;

    // Filtrado en cliente (adicional al filtro en servidor)
    let displayList = [...reports];
    const q = (generalSearchQuery || '').trim().toLowerCase();

    if (q) {
      displayList = displayList.filter((r) => {
        const idMatch = String(r.id).includes(q);
        const titleMatch = (r.title || '').toLowerCase().includes(q);
        const descMatch = (r.description || '').toLowerCase().includes(q);
        const userMatch = (r.user_email || '').toLowerCase().includes(q);
        const catMatch = (getCategoryLabel(r.category) || '').toLowerCase().includes(q);
        return idMatch || titleMatch || descMatch || userMatch || catMatch;
      });
    }

    if (generalStatusFilter !== 'all') {
      displayList = displayList.filter((r) => r.status === generalStatusFilter);
    }

    if (generalCategoryFilter !== 'all') {
      displayList = displayList.filter((r) => r.category === generalCategoryFilter);
    }

    // Ordenación en cliente
    displayList.sort((a, b) => {
      let valA = a[generalSortField];
      let valB = b[generalSortField];

      if (generalSortField === 'created_at') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
        return generalSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (generalSortOrder === 'asc') return (valA > valB ? 1 : -1);
      return (valA < valB ? 1 : -1);
    });

    // Paginación en cliente sobre el conjunto devuelto
    const startIndex = (generalPage - 1) * generalPageSize;
    const paginatedList = displayList.slice(startIndex, startIndex + generalPageSize);

    const bulkBarHtml = window.renderBulkActionBar({
      count: selectedGeneralItems.size,
      type: 'general',
    });

    const sortIndicator = (field) => {
      if (generalSortField !== field) return '<span class="sort-icon-neutral">↕</span>';
      return generalSortOrder === 'asc' ? '<span class="sort-icon active">↑</span>' : '<span class="sort-icon active">↓</span>';
    };

    let tableRows = '';
    if (!paginatedList.length) {
      tableRows = `
        <tr>
          <td colspan="8" class="reports-table-empty">
            <div class="empty-icon-circle green-circle">✓</div>
            <h3>No se encontraron reportes generales</h3>
            <p>${generalSearchQuery ? 'No hay resultados que coincidan con la búsqueda.' : 'No se han registrado incidencias con los filtros aplicados.'}</p>
          </td>
        </tr>
      `;
    } else {
      tableRows = paginatedList.map((r) => {
        const isSelected = selectedGeneralItems.has(Number(r.id));
        const rawImages = Array.isArray(r.images) ? r.images : [];
        const hasImages = rawImages.length > 0;

        return `
          <tr class="enterprise-row ${isSelected ? 'row-selected' : ''}" data-report-id="${r.id}">
            <td class="col-checkbox">
              <input type="checkbox" class="general-item-checkbox" data-report-id="${r.id}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar reporte">
            </td>
            <td class="col-id"><strong class="mono-font">#${r.id}</strong></td>
            <td class="col-date">
              <div class="date-meta-stack">
                <span class="date-rel">${formatRelativeDate(r.created_at)}</span>
                <span class="date-full text-muted">${formatShortDate(r.created_at)}</span>
              </div>
            </td>
            <td class="col-category">${getCategoryTagHtml(r.category)}</td>
            <td class="col-details">
              <div class="report-title-row">
                <strong class="general-report-title text-truncate" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</strong>
                ${hasImages ? `<span class="attachment-badge" title="${rawImages.length} capturas adjuntas">📎 ${rawImages.length}</span>` : ''}
              </div>
              <p class="general-report-desc">${escapeHtml(r.description)}</p>
              ${r.admin_notes ? `<div class="error-admin-notes-hint">📝 <em>${escapeHtml(r.admin_notes)}</em></div>` : ''}
            </td>
            <td class="col-user">
              <div class="user-meta-stack">
                <span class="user-email-text">${r.user_email ? `👤 ${escapeHtml(r.user_email)}` : '<span class="text-muted">Anónimo</span>'}</span>
                ${r.username ? `<span class="user-name-sub">@${escapeHtml(r.username)}</span>` : ''}
              </div>
            </td>
            <td class="col-status">
              <select class="general-status-select reports-quick-select" data-report-id="${r.id}">
                <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                <option value="reviewed" ${r.status === 'reviewed' ? 'selected' : ''}>En revisión</option>
                <option value="resolved" ${r.status === 'resolved' ? 'selected' : ''}>Resuelto</option>
                <option value="dismissed" ${r.status === 'dismissed' ? 'selected' : ''}>Descartado</option>
              </select>
            </td>
            <td class="col-actions">
              <div class="table-actions-group">
                <button type="button" class="btn-open-general-drawer secondary-button btn-xs" data-report-id="${r.id}" title="Inspeccionar detalle completo">
                  Detalle
                </button>
                <button type="button" class="btn-delete-general danger-button btn-xs" data-report-id="${r.id}" title="Eliminar reporte">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const paginationHtml = window.renderPagination({
      total: displayList.length,
      page: generalPage,
      pageSize: generalPageSize,
      idPrefix: 'general',
    });

    return `
      <div class="reports-tab-content">
        <!-- Pestañas de Estado Segmentadas estilo Linear/GitHub -->
        <div class="reports-status-tabs-row">
          <button type="button" class="status-tab-pill ${generalStatusFilter === 'all' ? 'active' : ''}" data-status="all">
            <span>Todos</span>
            <span class="status-tab-count">${totalCount}</span>
          </button>
          <button type="button" class="status-tab-pill pill-pending ${generalStatusFilter === 'pending' ? 'active' : ''}" data-status="pending">
            <span class="status-dot"></span>
            <span>Pendientes</span>
            <span class="status-tab-count badge-red">${pendingCount}</span>
          </button>
          <button type="button" class="status-tab-pill pill-reviewed ${generalStatusFilter === 'reviewed' ? 'active' : ''}" data-status="reviewed">
            <span class="status-dot"></span>
            <span>En revisión</span>
            <span class="status-tab-count">${reviewedCount}</span>
          </button>
          <button type="button" class="status-tab-pill pill-resolved ${generalStatusFilter === 'resolved' ? 'active' : ''}" data-status="resolved">
            <span class="status-dot"></span>
            <span>Resueltos</span>
            <span class="status-tab-count badge-green">${resolvedCount}</span>
          </button>
          <button type="button" class="status-tab-pill pill-dismissed ${generalStatusFilter === 'dismissed' ? 'active' : ''}" data-status="dismissed">
            <span class="status-dot"></span>
            <span>Descartados</span>
            <span class="status-tab-count">${dismissedCount}</span>
          </button>
        </div>

        <!-- Barra de Herramientas y Filtros -->
        <div class="reports-toolbar enterprise-toolbar">
          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-general-search" class="reports-search-input" placeholder="Buscar por título, usuario, email, contenido o ID..." value="${escapeHtml(generalSearchQuery)}">
            ${generalSearchQuery ? '<button type="button" class="search-clear-btn" id="btn-clear-gen-search">✕</button>' : ''}
          </div>

          <div class="reports-filters-group">
            <select id="general-filter-category" class="reports-select" aria-label="Filtrar por categoría">
              <option value="all" ${generalCategoryFilter === 'all' ? 'selected' : ''}>Todas las categorías</option>
              <option value="bug" ${generalCategoryFilter === 'bug' ? 'selected' : ''}>Bug / Error web</option>
              <option value="market_data" ${generalCategoryFilter === 'market_data' ? 'selected' : ''}>Datos de mercado</option>
              <option value="screener" ${generalCategoryFilter === 'screener' ? 'selected' : ''}>Screener</option>
              <option value="portfolio" ${generalCategoryFilter === 'portfolio' ? 'selected' : ''}>Cartera</option>
              <option value="suggestion" ${generalCategoryFilter === 'suggestion' ? 'selected' : ''}>Sugerencias</option>
              <option value="account" ${generalCategoryFilter === 'account' ? 'selected' : ''}>Cuenta y acceso</option>
              <option value="general" ${generalCategoryFilter === 'general' ? 'selected' : ''}>General</option>
              <option value="other" ${generalCategoryFilter === 'other' ? 'selected' : ''}>Otros</option>
            </select>
          </div>
        </div>

        ${bulkBarHtml}

        <!-- Tabla Enterprise de Reportes -->
        <div class="reports-table-responsive enterprise-table-wrap">
          <table class="reports-data-table enterprise-table">
            <thead>
              <tr>
                <th style="width: 38px;">
                  <input type="checkbox" id="select-all-general" aria-label="Seleccionar todos los reportes">
                </th>
                <th style="width: 65px;" class="th-sortable" data-sort="id" data-prefix="gen">
                  ID ${sortIndicator('id')}
                </th>
                <th style="width: 120px;" class="th-sortable" data-sort="created_at" data-prefix="gen">
                  Fecha ${sortIndicator('created_at')}
                </th>
                <th style="width: 140px;" class="th-sortable" data-sort="category" data-prefix="gen">
                  Categoría ${sortIndicator('category')}
                </th>
                <th style="min-width: 280px;" class="th-sortable" data-sort="title" data-prefix="gen">
                  Asunto y Detalles ${sortIndicator('title')}
                </th>
                <th style="width: 160px;" class="th-sortable" data-sort="user_email" data-prefix="gen">
                  Usuario ${sortIndicator('user_email')}
                </th>
                <th style="width: 130px;" class="th-sortable" data-sort="status" data-prefix="gen">
                  Estado ${sortIndicator('status')}
                </th>
                <th style="width: 120px; text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>

        ${paginationHtml}
      </div>
    `;
  }

  window.renderAiTab = renderAiTab;
  window.renderGeneralTab = renderGeneralTab;

})(window);
