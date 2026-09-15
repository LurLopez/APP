/**
 * @fileoverview Vistas de cuadrícula y lista del calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function calendarGridViewHtml(events, year, month, data) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
    const prevMonthDays = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;

    const weekdayHeaders = WEEKDAYS_SHORT_ES.map((w, idx) => `
      <div class="pf-cal-weekday-header ${idx >= 5 ? 'weekend' : ''}">${w}</div>
    `).join('');

    const cellsHtml = [];

    for (let i = 0; i < totalCells; i++) {
      if (i < firstDayIndex) {
        const prevDay = prevMonthDays - firstDayIndex + i + 1;
        cellsHtml.push(`<div class="pf-cal-cell other-month"><span class="pf-cal-day-num">${prevDay}</span></div>`);
      } else if (i >= firstDayIndex + daysInMonth) {
        const nextDay = i - (firstDayIndex + daysInMonth) + 1;
        cellsHtml.push(`<div class="pf-cal-cell other-month"><span class="pf-cal-day-num">${nextDay}</span></div>`);
      } else {
        const day = i - firstDayIndex + 1;
        const isToday = (year === 2026 && month === 7 && day === 30);
        const dayEvents = events.filter((e) => e.day === day);
        const maxChips = 3;
        const visibleChips = dayEvents.slice(0, maxChips);
        const overflow = dayEvents.length - maxChips;

        const chipsHtml = visibleChips.map((e) => {
          let badgeLabel = '';
          if (e.type === 'earnings') badgeLabel = '10-Q';
          else if (e.type === 'exdiv') badgeLabel = e.isPortfolio ? 'Ex-Div' : `${fmtEur(e.perShare)}/acc.`;
          else badgeLabel = e.isPortfolio ? fmtEur(e.amount) : `${fmtEur(e.perShare)}/acc.`;

          const pfIndicator = e.isPortfolio
            ? '<span class="pf-cal-chip-origin-icon portfolio" title="Posición en cartera">💼</span>'
            : '<span class="pf-cal-chip-origin-icon watchlist" title="En seguimiento">👁️</span>';

          return `
            <div class="pf-cal-chip chip-${e.type} ${e.isPortfolio ? 'chip-is-portfolio' : 'chip-is-watchlist'}" data-cal-event-id="${escapeHtml(e.id)}" title="${escapeHtml(e.name)}: ${escapeHtml(e.typeName)} (${e.isPortfolio ? 'En Cartera' : 'Seguimiento'})">
              <span class="pf-cal-chip-dot" style="background-color:${e.color};"></span>
              ${pfIndicator}
              <strong class="pf-cal-chip-ticker">${escapeHtml(e.ticker)}</strong>
              <span class="pf-cal-chip-label">${badgeLabel}</span>
            </div>`;
        }).join('');

        const overflowHtml = overflow > 0 ? `<div class="pf-cal-more-chip" data-cal-open-day="${day}">+${overflow} más</div>` : '';

        cellsHtml.push(`
          <div class="pf-cal-cell ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}">
            <div class="pf-cal-cell-head">
              <span class="pf-cal-day-num">${day}</span>
              ${isToday ? '<span class="pf-cal-today-badge">Hoy</span>' : ''}
            </div>
            <div class="pf-cal-cell-events">
              ${chipsHtml}
              ${overflowHtml}
            </div>
          </div>
        `);
      }
    }

    const allMonthEvents = getPortfolioCalendarEvents(year, month, data);
    let emptyNotice = '';
    if (events.length === 0) {
      if (allMonthEvents.length > 0) {
        emptyNotice = `
          <div class="pf-cal-hidden-banner">
            <div class="pf-cal-hidden-text">
              <strong>⚠️ Todos los eventos de este mes están ocultos</strong>
              <span>Hay ${allMonthEvents.length} eventos en ${MONTH_NAMES_ES[month]} de ${year}, pero no se muestran según tus preferencias de visualización.</span>
            </div>
            <div class="pf-cal-hidden-btns">
              <button class="pf-cal-hidden-action" type="button" data-cal-preset="all">Mostrar todo</button>
              <button class="pf-cal-hidden-action secondary" type="button" data-cal-open-config>Editar qué mostrar</button>
            </div>
          </div>`;
      } else {
        emptyNotice = `
          <div class="pf-cal-grid-empty-notice">
            <span class="pf-cal-notice-icon">ℹ️</span>
            <span>Sin eventos anunciados oficialmente para ${MONTH_NAMES_ES[month]} de ${year}. Las empresas comunican sus fechas oficiales con 1 a 3 meses de antelación.</span>
          </div>`;
      }
    }

    return `
      ${emptyNotice}
      <div class="pf-cal-grid-container">
        <div class="pf-cal-weekdays-row">
          ${weekdayHeaders}
        </div>
        <div class="pf-cal-grid">
          ${cellsHtml.join('')}
        </div>
      </div>`;
  }

  function calendarListViewHtml(events, data) {
    if (!events || events.length === 0) {
      const allMonthEvents = getPortfolioCalendarEvents(CS.calendarYear, CS.calendarMonth, data);
      if (allMonthEvents.length > 0) {
        return `
          <div class="pf-cal-empty-state">
            <div class="pf-cal-empty-icon">🔍</div>
            <h4>No hay eventos visibles con la configuración actual</h4>
            <p>Hay ${allMonthEvents.length} eventos en ${MONTH_NAMES_ES[CS.calendarMonth]} de ${CS.calendarYear}, pero están ocultos por los filtros de visualización.</p>
            <div class="pf-cal-empty-actions">
              <button class="primary-button" type="button" data-cal-preset="all">Mostrar todos los eventos</button>
              <button class="pf-outline-button" type="button" data-cal-open-config>Editar qué mostrar</button>
            </div>
          </div>`;
      }
      return `
        <div class="pf-cal-empty-state">
          <div class="pf-cal-empty-icon">📅</div>
          <h4>Sin eventos anunciados oficialmente</h4>
          <p>Las compañías de tu cartera y seguimiento aún no han publicado convocatorias oficiales para ${MONTH_NAMES_ES[CS.calendarMonth]} de ${CS.calendarYear}.</p>
        </div>`;
    }

    const byDay = new Map();
    events.forEach((e) => {
      if (!byDay.has(e.day)) byDay.set(e.day, []);
      byDay.get(e.day).push(e);
    });

    const groupsHtml = [...byDay.entries()].map(([day, dayEvents]) => {
      const dateObj = new Date(CS.calendarYear, CS.calendarMonth, day);
      const dayName = WEEKDAYS_ES[(dateObj.getDay() + 6) % 7];
      const isToday = (CS.calendarYear === 2026 && CS.calendarMonth === 7 && day === 30);

      const itemsHtml = dayEvents.map((e) => {
        let eventBadgeClass = '';
        let eventBadgeText = '';
        let eventDetailSub = '';
        let quickActionsHtml = '';
        if (e.type === 'earnings') {
          eventBadgeClass = 'badge-earnings';
          eventBadgeText = '📊 Resultados 10-Q';
          eventDetailSub = `${e.periodLabel} · ${e.timing}`;
          quickActionsHtml = `
            ${e.documentUrl ? `
              <button class="pf-outline-button pf-cal-item-btn" type="button" data-cal-preview-doc="${escapeHtml(e.documentUrl)}" data-cal-preview-name="${escapeHtml(e.name + ' · ' + (e.periodLabel || '10-Q'))}" title="Vista previa del informe oficial">
                👁️ Vista previa
              </button>` : ''}
            <button class="pf-cal-btn-trigger-ai" type="button" data-cal-list-analyze="${escapeHtml(e.ticker)}" data-cal-accession="${escapeHtml(e.accession || '')}" title="Analizar resultados con IA">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span>Analizar IA</span>
            </button>
          `;
        } else if (e.type === 'exdiv') {
          eventBadgeClass = 'badge-exdiv';
          eventBadgeText = '⏳ Ex-Dividend';
          eventDetailSub = e.isPortfolio
            ? `Corte para dividendo de ${fmtEur(e.amount)} (${fmtEur(e.perShare)}/acc. × ${e.shares} acc.)`
            : `Fecha de corte oficial para dividendo anunciado de ${fmtEur(e.perShare)}/acc.`;
        } else {
          eventBadgeClass = 'badge-payout';
          eventBadgeText = '💰 Pago de Dividendo';
          eventDetailSub = e.isPortfolio
            ? `Abono de ${fmtEur(e.amount)} (${e.shares} acc. × ${fmtEur(e.perShare)}/acc.)`
            : `Pago anunciado de dividendo de ${fmtEur(e.perShare)}/acc.`;
        }

        const sourceBadgeHtml = e.isPortfolio
          ? `<span class="pf-cal-source-badge portfolio" title="Posición en tu cartera"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg> Cartera (${e.shares} acc.)</span>`
          : `<span class="pf-cal-source-badge watchlist" title="Empresa en seguimiento"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg> Seguimiento</span>`;

        return `
          <div class="pf-cal-list-item ${e.isPortfolio ? 'item-portfolio' : 'item-watchlist'}" data-cal-event-id="${escapeHtml(e.id)}">
            <div class="pf-cal-item-left">
              ${portfolioLogoHtml({ ticker: e.ticker, companyName: e.name })}
              <div class="pf-cal-item-info">
                <div class="pf-cal-item-name-row">
                  <strong>${escapeHtml(e.name)}</strong>
                  <span class="pf-cal-item-ticker">${escapeHtml(e.ticker)}</span>
                  ${sourceBadgeHtml}
                </div>
                <div class="pf-cal-item-desc">${escapeHtml(eventDetailSub)}</div>
              </div>
            </div>
            <div class="pf-cal-item-right">
              <span class="pf-cal-badge ${eventBadgeClass}">${eventBadgeText}</span>
              <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
              ${quickActionsHtml}
              <button class="pf-outline-button pf-cal-item-btn" type="button" data-cal-goto="${escapeHtml(e.ticker)}" title="Ver empresa">
                Ver empresa →
              </button>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="pf-cal-day-group ${isToday ? 'today-group' : ''}">
          <div class="pf-cal-day-group-header">
            <div class="pf-cal-day-circle">${day}</div>
            <div class="pf-cal-day-heading">
              <strong>${dayName}, ${day} de ${MONTH_NAMES_ES[CS.calendarMonth]} de ${CS.calendarYear}</strong>
              ${isToday ? '<span class="pf-cal-today-pill">Hoy</span>' : ''}
            </div>
            <span class="pf-cal-day-count">${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}</span>
          </div>
          <div class="pf-cal-day-items">
            ${itemsHtml}
          </div>
        </div>`;
    }).join('');

    return `<div class="pf-cal-list-view">${groupsHtml}</div>`;
  }

window.calendarGridViewHtml = calendarGridViewHtml;
window.calendarListViewHtml = calendarListViewHtml;

})(window);
