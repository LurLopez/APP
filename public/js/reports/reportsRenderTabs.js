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

  function collectAiErrors(rawList) {
    const allErrorsList = [];
    rawList.forEach((item) => {
      const errors = Array.isArray(item.error_reports) ? item.error_reports : [];
      errors.forEach((error) => {
        allErrorsList.push({ ...error, parentAnalysis: item });
      });
    });
    return {
      allErrorsList,
      pendingErrorsCount: allErrorsList.filter((error) => error.status === 'pending').length,
    };
  }

  function filterAiList(rawList, { searchQuery, filterMode }) {
    let filteredList = [...rawList];
    const query = (searchQuery || '').trim().toLowerCase();

    if (query) {
      filteredList = filteredList.filter((item) => {
        const tickerMatch = (item.ticker || '').toLowerCase().includes(query);
        const nameMatch = (item.company_name || '').toLowerCase().includes(query);
        const accMatch = (item.accession || '').toLowerCase().includes(query);
        const modelMatch = (item.model_used || '').toLowerCase().includes(query);
        const periodMatch = (item.period_title || item.period_label || '').toLowerCase().includes(query);
        return tickerMatch || nameMatch || accMatch || modelMatch || periodMatch;
      });
    }

    const modeFilters = {
      errors: (item) => Number(item.error_reports_count || 0) > 0,
      rated: (item) => Number(item.rating_count || 0) > 0,
      clean: (item) => Number(item.error_reports_count || 0) === 0,
      '10-k': (item) => (item.form_type || '').toUpperCase() === '10-K',
      '10-q': (item) => (item.form_type || '').toUpperCase() === '10-Q',
    };
    const modeFilter = modeFilters[filterMode];
    return modeFilter ? filteredList.filter(modeFilter) : filteredList;
  }

  function sortAiList(list, { sortField, sortOrder }) {
    return list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'created_at' || sortField === 'period_end') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (sortField === 'rating') {
        valA = Number(a.rating_average || 0);
        valB = Number(b.rating_average || 0);
      } else if (sortField === 'errors') {
        valA = Number(a.error_reports_count || 0);
        valB = Number(b.error_reports_count || 0);
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (sortOrder === 'asc') return (valA > valB ? 1 : -1);
      return (valA < valB ? 1 : -1);
    });
  }

  function buildAiSubView(subView, data) {
    if (subView === 'table') {
      return renderAiTableSubView({
        list: data.paginatedList,
        total: data.totalFiltered,
        selectedAiItems: data.selectedAiItems,
        aiSortField: data.aiSortField,
        aiSortOrder: data.aiSortOrder,
      });
    }
    if (subView === 'errors') {
      return renderAiErrorsSubView({
        allErrors: data.allErrorsList,
        searchQuery: data.searchQuery,
        selectedAiItems: data.selectedAiItems,
        page: data.page,
        pageSize: data.pageSize,
      });
    }
    if (subView === 'companies') {
      return renderAiCompaniesSubView({
        companies: data.companies,
        searchQuery: data.searchQuery,
        filterMode: data.filterMode,
        expandedCompanies: data.expandedCompanies,
        allCompaniesExpanded: data.allCompaniesExpanded,
      });
    }
    return '';
  }

  function buildAiToolbar({ rawCount, companiesCount, errorsCount, pendingErrorsCount, subView, searchQuery, filterMode }) {
    return `<!-- Sub-View Switcher y Herramientas -->
        <div class="reports-toolbar enterprise-toolbar">
          <div class="reports-subview-selector">
            <button type="button" class="subview-btn ${subView === 'table' ? 'active' : ''}" data-subview="table" title="Tabla completa de análisis generados con IA">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/></svg>
              <span>Tabla Global (${rawCount})</span>
            </button>
            <button type="button" class="subview-btn ${subView === 'errors' ? 'active' : ''}" data-subview="errors" title="Incidencias y errores reportados por usuarios">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Incidencias Reportadas</span>
              ${pendingErrorsCount > 0 ? `<span class="subview-badge badge-red">${pendingErrorsCount}</span>` : `<span class="subview-badge">${errorsCount}</span>`}
            </button>
            <button type="button" class="subview-btn ${subView === 'companies' ? 'active' : ''}" data-subview="companies" title="Agrupación por empresas monitorizadas">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="22.01"/><line x1="15" y1="22" x2="15" y2="22.01"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><line x1="9" y1="18" x2="9" y2="18.01"/><line x1="15" y1="18" x2="15" y2="18.01"/></svg>
              <span>Por Empresa (${companiesCount})</span>
            </button>
          </div>

          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-ai-search" class="reports-search-input" placeholder="Buscar ticker, empresa, accession, modelo..." value="${escapeHtml(searchQuery)}">
            ${searchQuery ? '<button type="button" class="search-clear-btn" id="btn-clear-ai-search">✕</button>' : ''}
          </div>

          <div class="reports-filter-chips">
            <button type="button" class="report-chip ${filterMode === 'all' ? 'active' : ''}" data-filter-mode="all">Todos</button>
            <button type="button" class="report-chip ${filterMode === 'errors' ? 'active' : ''}" data-filter-mode="errors">⚠️ Con incidencias</button>
            <button type="button" class="report-chip ${filterMode === 'rated' ? 'active' : ''}" data-filter-mode="rated">★ Con valoraciones</button>
            <button type="button" class="report-chip ${filterMode === 'clean' ? 'active' : ''}" data-filter-mode="clean">✓ Sin incidencias</button>
            <button type="button" class="report-chip ${filterMode === '10-k' ? 'active' : ''}" data-filter-mode="10-k">10-K Anual</button>
            <button type="button" class="report-chip ${filterMode === '10-q' ? 'active' : ''}" data-filter-mode="10-q">10-Q Trimestral</button>
          </div>
        </div>`;
  }

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

    const { allErrorsList, pendingErrorsCount } = collectAiErrors(rawList);
    const filteredList = sortAiList(
      filterAiList(rawList, { searchQuery: aiSearchQuery, filterMode: aiFilterMode }),
      { sortField: aiSortField, sortOrder: aiSortOrder }
    );
    const totalFiltered = filteredList.length;
    const startIndex = (aiPage - 1) * aiPageSize;
    const paginatedList = filteredList.slice(startIndex, startIndex + aiPageSize);

    const bulkBarHtml = window.renderBulkActionBar({
      count: selectedAiItems.size,
      type: aiSubView === 'errors' ? 'ai-errors' : 'ai-analyses',
    });
    const subViewContent = buildAiSubView(aiSubView, {
      paginatedList,
      totalFiltered,
      allErrorsList,
      companies,
      selectedAiItems,
      searchQuery: aiSearchQuery,
      filterMode: aiFilterMode,
      page: aiPage,
      pageSize: aiPageSize,
      expandedCompanies,
      allCompaniesExpanded,
      aiSortField,
      aiSortOrder,
    });
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
        ${buildAiToolbar({
          rawCount: rawList.length,
          companiesCount: companies.length,
          errorsCount: allErrorsList.length,
          pendingErrorsCount,
          subView: aiSubView,
          searchQuery: aiSearchQuery,
          filterMode: aiFilterMode,
        })}

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

  function countGeneralStatus(reports, statsData) {
    return {
      pendingCount: statsData?.generalReports?.pending_general_reports ?? reports.filter((r) => r.status === 'pending').length,
      reviewedCount: reports.filter((r) => r.status === 'reviewed').length,
      resolvedCount: statsData?.generalReports?.resolved_general_reports ?? reports.filter((r) => r.status === 'resolved').length,
      dismissedCount: reports.filter((r) => r.status === 'dismissed').length,
    };
  }

  function filterGeneralList(reports, { searchQuery, statusFilter, categoryFilter }) {
    let displayList = [...reports];
    const query = (searchQuery || '').trim().toLowerCase();

    if (query) {
      displayList = displayList.filter((report) => {
        const idMatch = String(report.id).includes(query);
        const titleMatch = (report.title || '').toLowerCase().includes(query);
        const descMatch = (report.description || '').toLowerCase().includes(query);
        const userMatch = (report.user_email || '').toLowerCase().includes(query);
        const catMatch = (getCategoryLabel(report.category) || '').toLowerCase().includes(query);
        return idMatch || titleMatch || descMatch || userMatch || catMatch;
      });
    }

    if (statusFilter !== 'all') {
      displayList = displayList.filter((report) => report.status === statusFilter);
    }
    if (categoryFilter !== 'all') {
      displayList = displayList.filter((report) => report.category === categoryFilter);
    }
    return displayList;
  }

  function sortGeneralList(list, { sortField, sortOrder }) {
    return list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'created_at') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (sortOrder === 'asc') return (valA > valB ? 1 : -1);
      return (valA < valB ? 1 : -1);
    });
  }

  function buildGeneralRow(report, selectedItems) {
    const isSelected = selectedItems.has(Number(report.id));
    const rawImages = Array.isArray(report.images) ? report.images : [];
    const hasImages = rawImages.length > 0;

    return `
          <tr class="enterprise-row ${isSelected ? 'row-selected' : ''}" data-report-id="${report.id}">
            <td class="col-checkbox">
              <input type="checkbox" class="general-item-checkbox" data-report-id="${report.id}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar reporte">
            </td>
            <td class="col-id"><strong class="mono-font">#${report.id}</strong></td>
            <td class="col-date">
              <div class="date-meta-stack">
                <span class="date-rel">${formatRelativeDate(report.created_at)}</span>
                <span class="date-full text-muted">${formatShortDate(report.created_at)}</span>
              </div>
            </td>
            <td class="col-category">${getCategoryTagHtml(report.category)}</td>
            <td class="col-details">
              <div class="report-title-row">
                <strong class="general-report-title text-truncate" title="${escapeHtml(report.title)}">${escapeHtml(report.title)}</strong>
                ${hasImages ? `<span class="attachment-badge" title="${rawImages.length} capturas adjuntas">📎 ${rawImages.length}</span>` : ''}
              </div>
              <p class="general-report-desc">${escapeHtml(report.description)}</p>
              ${report.admin_notes ? `<div class="error-admin-notes-hint">📝 <em>${escapeHtml(report.admin_notes)}</em></div>` : ''}
            </td>
            <td class="col-user">
              <div class="user-meta-stack">
                <span class="user-email-text">${report.user_email ? `👤 ${escapeHtml(report.user_email)}` : '<span class="text-muted">Anónimo</span>'}</span>
                ${report.username ? `<span class="user-name-sub">@${escapeHtml(report.username)}</span>` : ''}
              </div>
            </td>
            <td class="col-status">
              <select class="general-status-select reports-quick-select" data-report-id="${report.id}">
                <option value="pending" ${report.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                <option value="reviewed" ${report.status === 'reviewed' ? 'selected' : ''}>En revisión</option>
                <option value="resolved" ${report.status === 'resolved' ? 'selected' : ''}>Resuelto</option>
                <option value="dismissed" ${report.status === 'dismissed' ? 'selected' : ''}>Descartado</option>
              </select>
            </td>
            <td class="col-actions">
              <div class="table-actions-group">
                <button type="button" class="btn-open-general-drawer secondary-button btn-xs" data-report-id="${report.id}" title="Inspeccionar detalle completo">
                  Detalle
                </button>
                <button type="button" class="btn-delete-general danger-button btn-xs" data-report-id="${report.id}" title="Eliminar reporte">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
  }

  function buildGeneralTableRows({ list, selectedItems, searchQuery }) {
    if (!list.length) {
      return `
        <tr>
          <td colspan="8" class="reports-table-empty">
            <div class="empty-icon-circle green-circle">✓</div>
            <h3>No se encontraron reportes generales</h3>
            <p>${searchQuery ? 'No hay resultados que coincidan con la búsqueda.' : 'No se han registrado incidencias con los filtros aplicados.'}</p>
          </td>
        </tr>
      `;
    }
    return list.map((report) => buildGeneralRow(report, selectedItems)).join('');
  }

  function renderGeneralStatusTabs({ statusFilter, totalCount, pendingCount, reviewedCount, resolvedCount, dismissedCount }) {
    const tabs = [
      { key: 'all', label: 'Todos', count: totalCount, className: '' },
      { key: 'pending', label: 'Pendientes', count: pendingCount, className: 'pill-pending ', countClass: 'badge-red', withDot: true },
      { key: 'reviewed', label: 'En revisión', count: reviewedCount, className: 'pill-reviewed ', withDot: true },
      { key: 'resolved', label: 'Resueltos', count: resolvedCount, className: 'pill-resolved ', countClass: 'badge-green', withDot: true },
      { key: 'dismissed', label: 'Descartados', count: dismissedCount, className: 'pill-dismissed ', withDot: true },
    ];
    return tabs.map((tab) => `<button type="button" class="status-tab-pill ${tab.className}${statusFilter === tab.key ? 'active' : ''}" data-status="${tab.key}">
            ${tab.withDot ? '<span class="status-dot"></span>\n            ' : ''}<span>${tab.label}</span>
            <span class="status-tab-count${tab.countClass ? ' ' + tab.countClass : ''}">${tab.count}</span>
          </button>`).join('\n          ');
  }

  function buildGeneralToolbar({ searchQuery, categoryFilter }) {
    return `<!-- Barra de Herramientas y Filtros -->
        <div class="reports-toolbar enterprise-toolbar">
          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-general-search" class="reports-search-input" placeholder="Buscar por título, usuario, email, contenido o ID..." value="${escapeHtml(searchQuery)}">
            ${searchQuery ? '<button type="button" class="search-clear-btn" id="btn-clear-gen-search">✕</button>' : ''}
          </div>

          <div class="reports-filters-group">
            <select id="general-filter-category" class="reports-select" aria-label="Filtrar por categoría">
              <option value="all" ${categoryFilter === 'all' ? 'selected' : ''}>Todas las categorías</option>
              <option value="bug" ${categoryFilter === 'bug' ? 'selected' : ''}>Bug / Error web</option>
              <option value="market_data" ${categoryFilter === 'market_data' ? 'selected' : ''}>Datos de mercado</option>
              <option value="screener" ${categoryFilter === 'screener' ? 'selected' : ''}>Screener</option>
              <option value="portfolio" ${categoryFilter === 'portfolio' ? 'selected' : ''}>Cartera</option>
              <option value="suggestion" ${categoryFilter === 'suggestion' ? 'selected' : ''}>Sugerencias</option>
              <option value="account" ${categoryFilter === 'account' ? 'selected' : ''}>Cuenta y acceso</option>
              <option value="general" ${categoryFilter === 'general' ? 'selected' : ''}>General</option>
              <option value="other" ${categoryFilter === 'other' ? 'selected' : ''}>Otros</option>
            </select>
          </div>
        </div>`;
  }

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
    const statusCounts = countGeneralStatus(reports, statsData);

    const displayList = sortGeneralList(
      filterGeneralList(reports, {
        searchQuery: generalSearchQuery,
        statusFilter: generalStatusFilter,
        categoryFilter: generalCategoryFilter,
      }),
      { sortField: generalSortField, sortOrder: generalSortOrder }
    );

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

    const tableRows = buildGeneralTableRows({
      list: paginatedList,
      selectedItems: selectedGeneralItems,
      searchQuery: generalSearchQuery,
    });

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
          ${renderGeneralStatusTabs({
            statusFilter: generalStatusFilter,
            totalCount,
            ...statusCounts,
          })}
        </div>

        ${buildGeneralToolbar({ searchQuery: generalSearchQuery, categoryFilter: generalCategoryFilter })}

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
