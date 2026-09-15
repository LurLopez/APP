/**
 * @fileoverview Tarjetas y utilidades de render del centro de reportes (extraído de RenderCards.js).
 */

(function (window) {


  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
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

window.escapeHtml = escapeHtml;
window.formatDate = formatDate;
window.formatShortDate = formatShortDate;
window.getCategoryLabel = getCategoryLabel;
window.getStatusBadge = getStatusBadge;
window.renderHeader = renderHeader;
window.renderStatsCards = renderStatsCards;
window.renderResultItem = renderResultItem;

})(window);
