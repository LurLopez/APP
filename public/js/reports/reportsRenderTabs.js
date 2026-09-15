/**
 * @fileoverview Pestañas de IA y generales del centro de reportes (extraído de RenderTabs.js).
 */

(function (window) {


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

window.renderCompanyCard = renderCompanyCard;
window.renderAiTab = renderAiTab;
window.renderGeneralTab = renderGeneralTab;

})(window);
