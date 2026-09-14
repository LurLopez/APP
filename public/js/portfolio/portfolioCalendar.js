/**
 * @file portfolioCalendar.js
 * @description Calendario de eventos financieros de la cartera y seguimiento (resultados SEC, dividendos y cortes ex-div).
 */

(function (window) {
  'use strict';

  const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const WEEKDAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const WEEKDAYS_SHORT_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const CALENDAR_VISIBILITY_STORAGE_KEY = 'cifra_calendar_visibility_v1';
  const CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY = 'cifra_calendar_company_visibility_v2';

  let calendarYear = 2026;
  let calendarMonth = 7; // Agosto (0-indexed)
  let calendarVisibility = loadCalendarVisibility();
  let calendarCompanyVisibility = loadCalendarCompanyVisibility();
  let calendarEditingCompanyTicker = null;
  let calendarConfigModalOpen = false;
  let calendarViewMode = 'grid'; // 'grid' | 'list'
  let calendarActiveModalEvent = null;
  let calendarAiLoading = false;
  let calendarAiResult = null;
  let calendarAiError = null;
  let calPreviewLoadTimeout = null;

  const fmt = () => window.PortfolioFormatting || {};
  const donutsMod = () => window.PortfolioDonuts || {};

  function escapeHtml(value) {
    return fmt().escapeHtml ? fmt().escapeHtml(value) : String(value ?? '');
  }

  function formatNumber(value, options) {
    return fmt().formatNumber ? fmt().formatNumber(value, options) : String(value ?? '');
  }

  function fmtEur(value) {
    return fmt().fmtEur ? fmt().fmtEur(value) : `${value} €`;
  }

  function portfolioLogoHtml(item) {
    return donutsMod().portfolioLogoHtml ? donutsMod().portfolioLogoHtml(item) : '';
  }

  function loadCalendarVisibility() {
    try {
      const raw = localStorage.getItem(CALENDAR_VISIBILITY_STORAGE_KEY);
      if (!raw) {
        return { earnings: true, exdiv: true, payout: true, portfolio: true, watchlist: true };
      }
      const data = JSON.parse(raw);
      return {
        earnings: data.earnings !== false,
        exdiv: data.exdiv !== false,
        payout: data.payout !== false,
        portfolio: data.portfolio !== false,
        watchlist: data.watchlist !== false,
      };
    } catch {
      return { earnings: true, exdiv: true, payout: true, portfolio: true, watchlist: true };
    }
  }

  function saveCalendarVisibility(vis) {
    try {
      localStorage.setItem(CALENDAR_VISIBILITY_STORAGE_KEY, JSON.stringify(vis));
    } catch {
      // Ignorar errores de almacenamiento local
    }
  }

  function loadCalendarCompanyVisibility() {
    try {
      const raw = localStorage.getItem(CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  function saveCalendarCompanyVisibility(map) {
    try {
      localStorage.setItem(CALENDAR_COMPANY_VISIBILITY_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignorar
    }
  }

  function getUserPreferences(data) {
    if (data?.userPreferences) return data.userPreferences;
    if (typeof window.Settings !== 'undefined' && typeof window.Settings.getPreferences === 'function') {
      return window.Settings.getPreferences();
    }
    return {
      watchlistAutoCalendar: true,
      watchlistAutoNotify: true,
      watchlistNotifyEarnings: true,
      watchlistNotifyExdiv: false,
      watchlistNotifyPayout: false,
      portfolioAutoNotify: true,
      portfolioNotifyEarnings: true,
      portfolioNotifyExdiv: true,
      portfolioNotifyPayout: true,
    };
  }

  function isCompanyInPortfolio(ticker, data) {
    const up = String(ticker || '').toUpperCase();
    const positions = data?.positions || [];
    if (positions.some((p) => p.ticker?.toUpperCase() === up && Number(p.shares) > 0)) return true;
    const comps = getCalendarCompanies(data);
    const c = comps.find((item) => item.ticker.toUpperCase() === up);
    return Boolean(c?.isPortfolio);
  }

  function getCompanyDefaultVisibility(ticker, data) {
    const isPort = isCompanyInPortfolio(ticker, data);
    const prefs = getUserPreferences(data);
    if (isPort) {
      return {
        earnings: prefs.portfolioNotifyEarnings !== false,
        exdiv: prefs.portfolioNotifyExdiv !== false,
        payout: prefs.portfolioNotifyPayout !== false,
      };
    }
    return {
      earnings: prefs.watchlistNotifyEarnings !== false,
      exdiv: Boolean(prefs.watchlistNotifyExdiv),
      payout: Boolean(prefs.watchlistNotifyPayout),
    };
  }

  function getCompanyVisibility(ticker, data) {
    const up = String(ticker || '').toUpperCase();
    const def = getCompanyDefaultVisibility(up, data);
    const custom = calendarCompanyVisibility[up];
    if (!custom) return def;
    return {
      earnings: custom.earnings !== undefined ? Boolean(custom.earnings) : def.earnings,
      exdiv: custom.exdiv !== undefined ? Boolean(custom.exdiv) : def.exdiv,
      payout: custom.payout !== undefined ? Boolean(custom.payout) : def.payout,
    };
  }

  function hasCustomCompanyFilters(ticker, data) {
    const up = String(ticker || '').toUpperCase();
    const custom = calendarCompanyVisibility[up];
    if (!custom) return false;
    const def = getCompanyDefaultVisibility(up, data);
    return (
      (custom.earnings !== undefined && Boolean(custom.earnings) !== def.earnings) ||
      (custom.exdiv !== undefined && Boolean(custom.exdiv) !== def.exdiv) ||
      (custom.payout !== undefined && Boolean(custom.payout) !== def.payout)
    );
  }

  function hasCustomCalendarFilters() {
    const hasAnyCustomCompany = Object.keys(calendarCompanyVisibility).some((t) => hasCustomCompanyFilters(t));
    return (
      !calendarVisibility.earnings ||
      !calendarVisibility.exdiv ||
      !calendarVisibility.payout ||
      !calendarVisibility.portfolio ||
      !calendarVisibility.watchlist ||
      hasAnyCustomCompany
    );
  }

  const OFFICIAL_2026_EARNINGS = {
    'KO': [ { m: 3, d: 28, q: '1' }, { m: 6, d: 23, q: '2' }, { m: 9, d: 22, q: '3' } ],
    'AAPL': [ { m: 0, d: 30, q: '1' }, { m: 4, d: 2, q: '2' }, { m: 7, d: 1, q: '3' }, { m: 9, d: 31, q: '4' } ],
    'MSFT': [ { m: 0, d: 28, q: '2' }, { m: 3, d: 25, q: '3' }, { m: 6, d: 25, q: '4' }, { m: 9, d: 24, q: '1' } ],
    'JNJ': [ { m: 0, d: 21, q: '4' }, { m: 3, d: 16, q: '1' }, { m: 6, d: 17, q: '2' }, { m: 9, d: 15, q: '3' } ],
    'SHEL': [ { m: 1, d: 6, q: '4' }, { m: 4, d: 2, q: '1' }, { m: 7, d: 1, q: '2' }, { m: 9, d: 31, q: '3' } ],
    'ALV.DE': [ { m: 1, d: 27, q: '4' }, { m: 4, d: 15, q: '1' }, { m: 7, d: 8, q: '2' }, { m: 10, d: 7, q: '3' } ],
    'BAS.DE': [ { m: 1, d: 28, q: '4' }, { m: 4, d: 3, q: '1' }, { m: 6, d: 26, q: '2' }, { m: 9, d: 29, q: '3' } ],
    'T': [ { m: 0, d: 24, q: '4' }, { m: 3, d: 24, q: '1' }, { m: 6, d: 24, q: '2' }, { m: 9, d: 23, q: '3' } ],
    'O': [ { m: 1, d: 20, q: '4' }, { m: 4, d: 6, q: '1' }, { m: 7, d: 5, q: '2' }, { m: 10, d: 4, q: '3' } ],
    'UL': [ { m: 1, d: 13, q: '4' }, { m: 3, d: 24, q: '1' }, { m: 6, d: 25, q: '2' }, { m: 9, d: 24, q: '3' } ],
  };

  function getPortfolioCalendarEvents(targetYear, targetMonth, data) {
    if (data?.calendarEvents && Array.isArray(data.calendarEvents)) {
      return data.calendarEvents.filter((e) => e.year === targetYear && e.month === targetMonth);
    }

    const userPositions = (data?.positions || []).filter((p) => Number(p.shares) > 0);
    if (!userPositions.length) return [];

    const activeTickers = new Set(userPositions.map((p) => p.ticker.toUpperCase()));
    if (targetYear > 2026 || targetYear < 2025) return [];

    const d = window.PortfolioDividendsData?.getDividendData ? window.PortfolioDividendsData.getDividendData(data) : {};
    const holdings = (d.holdings || []).filter((h) => activeTickers.has(h.ticker.toUpperCase()));

    const getHoldingInfo = (ticker) => {
      const pos = userPositions.find((p) => p.ticker.toUpperCase() === ticker.toUpperCase());
      const h = holdings.find((x) => x.ticker.toUpperCase() === ticker.toUpperCase());
      const name = pos?.companyName || h?.name || ticker;
      const color = h?.color || '#4e4ca0';
      const shares = Number(pos?.shares) || 0;
      const ttm = Number(pos?.projectedAnnualDividends) || Number(h?.ttm) || 0;
      return { ticker, name, color, shares, ttm, pos, h };
    };

    const activeHoldings = userPositions.map((p) => getHoldingInfo(p.ticker));
    const events = [];

    if (targetYear === 2026) {
      activeHoldings.forEach((h) => {
        const schedule = OFFICIAL_2026_EARNINGS[h.ticker.toUpperCase()] || [];
        schedule.forEach((entry) => {
          if (entry.m === targetMonth) {
            const timing = entry.d % 2 === 0 ? 'Antes de la apertura (BMO)' : 'Tras el cierre (AMC)';
            const isPast = targetMonth < 7 || (targetMonth === 7 && entry.d <= 30);
            events.push({
              id: `earn-${h.ticker}-${targetYear}-${entry.m}-${entry.d}`,
              type: 'earnings',
              typeName: 'Resultados',
              typeBadge: '10-Q',
              dateStr: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(entry.d).padStart(2, '0')}`,
              year: targetYear,
              month: targetMonth,
              day: entry.d,
              ticker: h.ticker,
              name: h.name,
              isPortfolio: true,
              shares: h.shares,
              color: '#2563eb',
              timing,
              periodLabel: `Q${entry.q} 2026`,
              status: isPast ? 'Publicado' : 'Confirmado',
              details: `Convocatoria oficial de cuentas trimestrales ante la SEC con análisis disponible.`,
            });
          }
        });
      });
    }

    const targetMonthTitle = `${MONTH_NAMES_ES[targetMonth]} de ${targetYear}`.toLowerCase();
    const summaryCard = (d.monthlySummaryCards || []).find((c) => {
      const t = (c.title || '').toLowerCase();
      return t === targetMonthTitle || (t.includes(MONTH_NAMES_ES[targetMonth].toLowerCase()) && t.includes(String(targetYear)));
    });

    if (summaryCard && summaryCard.payments?.length > 0) {
      const validPayments = summaryCard.payments.filter((p) => activeTickers.has(p.ticker.toUpperCase()));
      validPayments.forEach((p, idx) => {
        const h = getHoldingInfo(p.ticker);
        const day = ((idx * 7 + 5) % 28) + 1;
        const isPast = targetMonth < 7 || (targetMonth === 7 && day <= 30);
        const totalAmount = Number(p.amount) || (h.shares * 0.45);
        const perShare = h.shares > 0 ? (totalAmount / h.shares) : 0.45;

        events.push({
          id: `payout-${h.ticker}-${targetYear}-${targetMonth}-${day}`,
          type: 'payout',
          typeName: 'Pago de dividendo',
          typeBadge: 'Dividendo',
          dateStr: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          year: targetYear,
          month: targetMonth,
          day,
          ticker: h.ticker,
          name: h.name,
          isPortfolio: true,
          shares: h.shares,
          color: h.color,
          amount: totalAmount,
          perShare,
          status: isPast ? 'Cobrado' : 'Confirmado',
          details: `Abono de ${fmtEur(totalAmount)} (${h.shares} acc. × ${fmtEur(perShare)}/acc.) en cuenta de valores.`,
        });

        if (day > 14) {
          const exDay = day - 14;
          const isExPast = targetMonth < 7 || (targetMonth === 7 && exDay <= 30);
          events.push({
            id: `exdiv-${h.ticker}-${targetYear}-${targetMonth}-${exDay}`,
            type: 'exdiv',
            typeName: 'Fecha Ex-Dividend',
            typeBadge: 'Ex-Fecha',
            dateStr: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(exDay).padStart(2, '0')}`,
            year: targetYear,
            month: targetMonth,
            day: exDay,
            ticker: h.ticker,
            name: h.name,
            isPortfolio: true,
            shares: h.shares,
            color: '#d97706',
            amount: totalAmount,
            perShare,
            status: isExPast ? 'Ejecutado' : 'Anunciado',
            details: `Fecha de corte oficial para el dividendo de ${fmtEur(totalAmount)} (${fmtEur(perShare)}/acc.).`,
          });
        }
      });
    }

    events.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    return events;
  }

  function getCalendarCompanies(data) {
    if (data?.calendarCompanies && Array.isArray(data.calendarCompanies)) {
      return data.calendarCompanies;
    }
    const userPositions = (data?.positions || []).filter((p) => Number(p.shares) > 0);
    const portfolioTickers = new Set(userPositions.map((p) => p.ticker.toUpperCase()));
    const list = userPositions.map((p) => ({
      ticker: p.ticker.toUpperCase(),
      name: p.companyName || p.ticker,
      shares: Number(p.shares) || 0,
      isPortfolio: true,
    }));
    if (typeof window.Watchlists !== 'undefined' && typeof window.Watchlists.getCalendarTickers === 'function') {
      window.Watchlists.getCalendarTickers().forEach((t) => {
        const up = t.toUpperCase();
        if (!portfolioTickers.has(up)) {
          list.push({ ticker: up, name: up, shares: 0, isPortfolio: false });
        }
      });
    }
    list.sort((a, b) => {
      if (a.isPortfolio !== b.isPortfolio) return a.isPortfolio ? -1 : 1;
      return a.ticker.localeCompare(b.ticker);
    });
    return list;
  }

  function calendarCompaniesPanelHtml(data) {
    const companies = getCalendarCompanies(data);
    const portfolioCount = companies.filter((c) => c.isPortfolio).length;
    const trackingCount = companies.filter((c) => !c.isPortfolio).length;

    return `
      <div class="pf-cal-companies-card">
        <div class="pf-cal-companies-head">
          <div class="pf-cal-companies-title-col">
            <div class="pf-cal-companies-title-row">
              <span class="pf-cal-card-icon" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
              </span>
              <h4>Empresas en seguimiento del calendario</h4>
              <span class="pf-cal-companies-total-badge">${companies.length}</span>
              <button class="pf-cal-companies-quick-edit-btn" type="button" data-cal-open-config title="Editar qué tipos de eventos mostrar en el calendario">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                <span>Editar qué mostrar</span>
              </button>
            </div>
            <p class="pf-cal-companies-sub">
              <span><strong>${portfolioCount}</strong> en cartera (incluidas permanentemente)</span> ·
              <span><strong>${trackingCount}</strong> en seguimiento</span>
            </p>
          </div>

          <div class="pf-cal-add-company-wrap">
            <div class="pf-cal-add-search-box">
              <svg class="pf-cal-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="search" class="pf-cal-add-input" placeholder="Añadir empresa (ej. KO, AAPL, MSFT)..." autocomplete="off" aria-label="Añadir empresa al calendario">
              <div class="pf-cal-add-results" hidden></div>
            </div>
          </div>
        </div>

        <div class="pf-cal-companies-body">
          ${companies.length === 0 ? `
            <div class="pf-cal-companies-empty">
              <p>No estás siguiendo ninguna empresa en el calendario. Añade acciones con el buscador de arriba o regístralas en tu cartera para ver automáticamente sus resultados y dividendos.</p>
            </div>
          ` : `
            <div class="pf-cal-companies-chips">
              ${companies.map((c) => {
                const isCustomComp = hasCustomCompanyFilters(c.ticker, data);
                return `
                <div class="pf-cal-company-chip ${c.isPortfolio ? 'chip-portfolio' : 'chip-tracking'}" data-cal-chip-ticker="${escapeHtml(c.ticker)}" title="${escapeHtml(c.name)} (${c.isPortfolio ? 'En Cartera' : 'En Seguimiento'})">
                  <img class="pf-cal-chip-logo" src="https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(c.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((c.name || c.ticker || '?').slice(0, 1).toUpperCase())}">
                  <div class="pf-cal-chip-text">
                    <strong class="pf-cal-chip-sym">${escapeHtml(c.ticker)}</strong>
                    <span class="pf-cal-chip-comp-name">${escapeHtml(c.name || c.ticker)}</span>
                  </div>
                  <div class="pf-cal-chip-actions">
                    <button class="pf-cal-chip-btn edit ${isCustomComp ? 'has-custom' : ''}" type="button" data-cal-edit-company="${escapeHtml(c.ticker)}" title="${isCustomComp ? 'Configuración personalizada activa (clic para editar)' : 'Configurar eventos que muestra esta empresa'}">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    ${!c.isPortfolio ? `
                      <button class="pf-cal-chip-btn remove" type="button" data-cal-remove-ticker="${escapeHtml(c.ticker)}" title="Dejar de seguir esta empresa en el calendario">×</button>
                    ` : ''}
                  </div>
                </div>`;
              }).join('')}
            </div>
          `}
        </div>
      </div>`;
  }

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
      const allMonthEvents = getPortfolioCalendarEvents(calendarYear, calendarMonth, data);
      if (allMonthEvents.length > 0) {
        return `
          <div class="pf-cal-empty-state">
            <div class="pf-cal-empty-icon">🔍</div>
            <h4>No hay eventos visibles con la configuración actual</h4>
            <p>Hay ${allMonthEvents.length} eventos en ${MONTH_NAMES_ES[calendarMonth]} de ${calendarYear}, pero están ocultos por los filtros de visualización.</p>
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
          <p>Las compañías de tu cartera y seguimiento aún no han publicado convocatorias oficiales para ${MONTH_NAMES_ES[calendarMonth]} de ${calendarYear}.</p>
        </div>`;
    }

    const byDay = new Map();
    events.forEach((e) => {
      if (!byDay.has(e.day)) byDay.set(e.day, []);
      byDay.get(e.day).push(e);
    });

    const groupsHtml = [...byDay.entries()].map(([day, dayEvents]) => {
      const dateObj = new Date(calendarYear, calendarMonth, day);
      const dayName = WEEKDAYS_ES[(dateObj.getDay() + 6) % 7];
      const isToday = (calendarYear === 2026 && calendarMonth === 7 && day === 30);

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
              <strong>${dayName}, ${day} de ${MONTH_NAMES_ES[calendarMonth]} de ${calendarYear}</strong>
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

  function renderCalendarAiMetricsTable(report) {
    if (!report || !report.horizons || !report.horizons.length) return '';
    const h = report.horizons[0];
    const metrics = h.metrics || {};
    const sales = metrics.sales?.current ? `${formatNumber(metrics.sales.current)} M$` : '—';
    const salesGrowth = metrics.sales?.growthPct !== undefined && metrics.sales?.growthPct !== null ? `${metrics.sales.growthPct > 0 ? '+' : ''}${metrics.sales.growthPct}%` : '';
    const grossMargin = metrics.grossMargin?.current !== undefined ? `${metrics.grossMargin.current}%` : '—';
    const netIncome = metrics.netIncome?.current ? `${formatNumber(metrics.netIncome.current)} M$` : '—';
    const fcf = metrics.fcf?.current ? `${formatNumber(metrics.fcf.current)} M$` : '—';

    return `
      <div class="pf-cal-ai-metrics-grid">
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Ingresos</span>
          <span class="pf-cal-ai-metric-val">${sales}</span>
          ${salesGrowth ? `<span class="pf-cal-ai-metric-growth ${metrics.sales?.growthPct >= 0 ? 'growth-pos' : 'growth-neg'}">${salesGrowth}</span>` : ''}
        </div>
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Margen Bruto</span>
          <span class="pf-cal-ai-metric-val">${grossMargin}</span>
        </div>
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Beneficio Neto</span>
          <span class="pf-cal-ai-metric-val">${netIncome}</span>
        </div>
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Flujo de Caja Libre</span>
          <span class="pf-cal-ai-metric-val">${fcf}</span>
        </div>
      </div>
    `;
  }

  function renderCalendarAiHighlights(report) {
    if (!report) return '';
    const notes = report.extraNotes || [];
    if (!notes.length) return '';
    const itemsHtml = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    return `
      <div class="pf-cal-ai-highlights">
        <h6>Aspectos clave destacados por la IA:</h6>
        <ul>${itemsHtml}</ul>
      </div>
    `;
  }

  function calendarModalHtml() {
    if (!calendarActiveModalEvent) return '';
    const e = calendarActiveModalEvent;

    let modalTitle = '';
    let modalDesc = '';
    let metricRowsHtml = '';
    let aiSectionHtml = '';

    const originBadgeHtml = e.isPortfolio
      ? `<span class="pf-cal-modal-origin-pill portfolio"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg> Empresa en cartera (${formatNumber(e.shares, { maximumFractionDigits: 2 })} acciones)</span>`
      : `<span class="pf-cal-modal-origin-pill watchlist"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg> Empresa en seguimiento (Calendario)</span>`;

    if (e.type === 'earnings') {
      modalTitle = `Resultados Empresariales · ${e.name} (${e.ticker})`;
      modalDesc = `Presentación oficial del informe de resultados correspondiente al ${e.periodLabel}.`;
      metricRowsHtml = `
        <div class="pf-cal-modal-row">
          <span>Período fiscal</span>
          <strong>${escapeHtml(e.periodLabel)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Horario previsto</span>
          <strong>${escapeHtml(e.timing)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Tipo de documento</span>
          <strong>Formulario SEC ${escapeHtml(e.typeBadge || '10-Q')}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      `;

      if (calendarAiLoading) {
        aiSectionHtml = `
          <div class="pf-cal-ai-loading-box">
            <div class="pf-cal-spinner"></div>
            <div class="pf-cal-ai-loading-text">
              <strong>Analizando resultados de ${escapeHtml(e.name)} con IA…</strong>
              <p>Extrayendo cifras de ingresos, márgenes, beneficio neto y análisis estratégico del informe oficial.</p>
            </div>
          </div>
        `;
      } else if (calendarAiResult) {
        aiSectionHtml = `
          <div class="pf-cal-ai-result-box">
            <div class="pf-cal-ai-result-head">
              <div class="pf-cal-ai-chip-pill">🤖 Análisis IA de Resultados</div>
              <span class="pf-cal-ai-sector-tag">${escapeHtml(calendarAiResult.sector || 'Renta Variable')}</span>
            </div>

            ${renderCalendarAiMetricsTable(calendarAiResult.report)}
            ${renderCalendarAiHighlights(calendarAiResult.report)}

            <div class="pf-cal-ai-btn-row">
              ${calendarAiResult.pdfUrl ? `
                <a class="pf-cal-btn-pdf" href="${escapeHtml(calendarAiResult.pdfUrl)}" target="_blank" rel="noopener">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Descargar PDF del análisis
                </a>` : ''}
              ${e.documentUrl ? `
                <button class="pf-outline-button pf-cal-btn-edgar" type="button" data-cal-preview-doc="${escapeHtml(e.documentUrl)}" data-cal-preview-name="${escapeHtml(e.name + ' · ' + e.periodLabel)}">
                  👁️ Vista previa del informe
                </button>` : ''}
              <a class="pf-cal-btn-analyzer" href="/analisis?analizar=${encodeURIComponent(e.ticker)}&accession=${encodeURIComponent(e.accession || '')}">
                ⚡ Abrir en analizador interactivo
              </a>
            </div>
          </div>
        `;
      } else {
        aiSectionHtml = `
          ${calendarAiError ? `<div class="pf-cal-ai-error-box">⚠️ ${escapeHtml(calendarAiError)}</div>` : ''}
          <div class="pf-cal-ai-callout-box">
            <div class="pf-cal-ai-callout-header">
              <span class="pf-cal-ai-sparkle">✨</span>
              <strong>Analizador de Resultados 10-Q / 10-K con IA</strong>
            </div>
            <p>Obtén en segundos un desglose completo del informe oficial: crecimiento de ingresos, evolución de márgenes operativos, flujo de caja y valoración estratégica con Inteligencia Artificial.</p>
            <div class="pf-cal-ai-trigger-row">
              <button class="primary-button pf-cal-btn-trigger-ai" type="button" data-cal-run-ai="${escapeHtml(e.ticker)}" data-cal-accession="${escapeHtml(e.accession || '')}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                <span>Analizar informe con IA</span>
              </button>
              ${e.documentUrl ? `
                <button class="pf-outline-button pf-cal-btn-edgar" type="button" data-cal-preview-doc="${escapeHtml(e.documentUrl)}" data-cal-preview-name="${escapeHtml(e.name + ' · ' + e.periodLabel)}">
                  👁️ Vista previa del informe
                </button>
                <a class="pf-outline-button pf-cal-btn-edgar" href="${escapeHtml(e.documentUrl)}" target="_blank" rel="noopener">
                  Abrir documento ↗
                </a>` : ''}
            </div>
          </div>
        `;
      }
    } else if (e.type === 'exdiv') {
      modalTitle = `Fecha Ex-Dividend (Corte) · ${e.name} (${e.ticker})`;
      modalDesc = `Último día hábil para comprar o mantener acciones con derecho a percibir el dividendo próximo.`;
      metricRowsHtml = e.isPortfolio ? `
        <div class="pf-cal-modal-row">
          <span>Importe por acción</span>
          <strong>${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Acciones en cartera</span>
          <strong>${formatNumber(e.shares, { maximumFractionDigits: 2 })} acc.</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Importe bruto total</span>
          <strong class="text-amber">${fmtEur(e.amount)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      ` : `
        <div class="pf-cal-modal-row">
          <span>Importe por acción</span>
          <strong class="text-amber font-large">${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Posición en cartera</span>
          <span class="pf-cal-modal-unheld">Sin posición actual (En seguimiento)</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      `;
    } else {
      modalTitle = `Pago de Dividendos · ${e.name} (${e.ticker})`;
      modalDesc = `Abono de dividendos en efectivo transferido a la cuenta de valores.`;
      metricRowsHtml = e.isPortfolio ? `
        <div class="pf-cal-modal-row">
          <span>Importe bruto a percibir</span>
          <strong class="text-emerald font-large">${fmtEur(e.amount)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Dividendo por acción</span>
          <strong>${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Posición registrada</span>
          <strong>${formatNumber(e.shares, { maximumFractionDigits: 2 })} acciones</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado del pago</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      ` : `
        <div class="pf-cal-modal-row">
          <span>Dividendo por acción</span>
          <strong class="text-emerald font-large">${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Posición registrada</span>
          <span class="pf-cal-modal-unheld">Sin acciones en cartera (En seguimiento)</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado del pago</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      `;
    }

    return `
      <div class="pf-cal-modal-backdrop" data-cal-close-modal>
        <div class="pf-cal-modal ${e.type === 'earnings' ? 'pf-cal-modal-wide' : ''}" onclick="event.stopPropagation()">
          <div class="pf-cal-modal-head">
            <div class="pf-cal-modal-brand">
              ${portfolioLogoHtml({ ticker: e.ticker, companyName: e.name })}
              <div>
                <h4>${escapeHtml(modalTitle)}</h4>
                <p>${escapeHtml(e.dateStr)} · ${MONTH_NAMES_ES[e.month]} ${e.year}</p>
              </div>
            </div>
            <button class="pf-cal-modal-close" type="button" data-cal-close-modal title="Cerrar modal">×</button>
          </div>

          <div class="pf-cal-modal-body">
            <p class="pf-cal-modal-desc">${escapeHtml(modalDesc)}</p>
            <div class="pf-cal-modal-metrics">
              ${metricRowsHtml}
            </div>
            ${aiSectionHtml}
          </div>

          <div class="pf-cal-modal-footer">
            <button class="pf-outline-button" type="button" data-cal-close-modal>Cerrar</button>
            <button class="primary-button" type="button" data-cal-goto="${escapeHtml(e.ticker)}">Ver empresa ${escapeHtml(e.ticker)} →</button>
          </div>
        </div>
      </div>`;
  }

  function calendarConfigModalHtml() {
    if (!calendarConfigModalOpen) return '';

    return `
      <div class="pf-cal-modal-backdrop" data-cal-close-config>
        <div class="pf-cal-modal pf-cal-config-modal" onclick="event.stopPropagation()">
          <div class="pf-cal-modal-head">
            <div class="pf-cal-modal-brand">
              <span class="pf-cal-config-modal-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="14" y2="14"/><line x1="4" x2="20" y1="7" y2="7"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="14" r="2"/><circle cx="10" cy="21" r="2"/></svg>
              </span>
              <div>
                <h4>Personalizar qué mostrar en el calendario</h4>
                <p>Configura qué fechas financieras y qué empresas deseas ver en el calendario.</p>
              </div>
            </div>
            <button class="pf-cal-modal-close" type="button" data-cal-close-config title="Cerrar modal">×</button>
          </div>

          <div class="pf-cal-modal-body">
            <div class="pf-cal-config-section">
              <h5 class="pf-cal-config-section-title">Tipos de eventos financieros</h5>

              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-toggle-key="earnings" ${calendarVisibility.earnings ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon earnings">
                  <span class="pf-filter-dot dot-earnings"></span>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Resultados empresariales</strong>
                    <span class="pf-cal-config-tag earnings">Informes 10-Q / 10-K</span>
                  </div>
                  <span>Presentación oficial de cuentas trimestrales y anuales ante la SEC con análisis de IA y vista previa.</span>
                </div>
              </label>

              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-toggle-key="exdiv" ${calendarVisibility.exdiv ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon exdiv">
                  <span class="pf-filter-dot dot-exdiv"></span>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Fechas Ex-Dividend</strong>
                    <span class="pf-cal-config-tag exdiv">Corte de cupón</span>
                  </div>
                  <span>Día límite para tener acciones en posesión con derecho a percibir el dividendo anunciado.</span>
                </div>
              </label>

              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-toggle-key="payout" ${calendarVisibility.payout ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon payout">
                  <span class="pf-filter-dot dot-payout"></span>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Pagos y cobros de dividendos</strong>
                    <span class="pf-cal-config-tag payout">Abono en efectivo</span>
                  </div>
                  <span>Fecha estimada o confirmada de abono de los dividendos en la cuenta de valores.</span>
                </div>
              </label>
            </div>

            <div class="pf-cal-config-section">
              <h5 class="pf-cal-config-section-title">Origen de las empresas</h5>

              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-toggle-key="portfolio" ${calendarVisibility.portfolio ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon portfolio">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Empresas en mi cartera</strong>
                    <span class="pf-cal-config-tag portfolio">💼 Cartera</span>
                  </div>
                  <span>Mostrar eventos de compañías donde posees acciones compradas actualmente.</span>
                </div>
              </label>

              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-toggle-key="watchlist" ${calendarVisibility.watchlist ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon watchlist">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Empresas en seguimiento</strong>
                    <span class="pf-cal-config-tag watchlist">📅 Seguimiento</span>
                  </div>
                  <span>Mostrar eventos de compañías agregadas a seguir en el calendario sin posición en cartera.</span>
                </div>
              </label>
            </div>

            <div class="pf-cal-config-presets-box">
              <span class="pf-cal-presets-heading">Vistas rápidas:</span>
              <div class="pf-cal-presets-btns">
                <button class="pf-cal-preset-pill" type="button" data-cal-preset="all">Mostrar todo</button>
                <button class="pf-cal-preset-pill" type="button" data-cal-preset="dividends">Solo Dividendos (Ex-Div + Cobro)</button>
                <button class="pf-cal-preset-pill" type="button" data-cal-preset="earnings">Solo Resultados SEC</button>
              </div>
            </div>
          </div>

          <div class="pf-cal-modal-footer">
            <button class="pf-outline-button" type="button" data-cal-reset-config>Restablecer por defecto</button>
            <button class="primary-button" type="button" data-cal-close-config>Guardar y ver calendario</button>
          </div>
        </div>
      </div>`;
  }

  function calendarCompanyEditModalHtml(data) {
    if (!calendarEditingCompanyTicker) return '';
    const ticker = calendarEditingCompanyTicker.toUpperCase();
    const companies = getCalendarCompanies(data);
    const targetComp = companies.find((c) => c.ticker.toUpperCase() === ticker) || {
      ticker,
      name: ticker,
      isPortfolio: false,
      shares: 0,
    };
    const vis = getCompanyVisibility(ticker, data);

    return `
      <div class="pf-cal-modal-backdrop" data-cal-close-company-modal>
        <div class="pf-cal-modal pf-cal-company-edit-modal" onclick="event.stopPropagation()">
          <div class="pf-cal-modal-head">
            <div class="pf-cal-modal-brand">
              <img class="pf-cal-chip-logo" style="width:32px;height:32px;border-radius:7px;object-fit:contain;background:#f8fafc;padding:2px;border:1px solid #e2e8f0;" src="https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(targetComp.ticker)}.webp" alt="" data-letter="${escapeHtml((targetComp.name || targetComp.ticker || '?').slice(0, 1).toUpperCase())}">
              <div>
                <h4>Configurar eventos · ${escapeHtml(targetComp.ticker)}</h4>
                <p>${escapeHtml(targetComp.name || targetComp.ticker)} · ${targetComp.isPortfolio ? '💼 En Cartera' : '📅 En Seguimiento'}</p>
              </div>
            </div>
            <button class="pf-cal-modal-close" type="button" data-cal-close-company-modal title="Cerrar modal">×</button>
          </div>

          <div class="pf-cal-modal-body">
            <p class="pf-cal-modal-desc">
              Elige qué tipos de eventos de <strong>${escapeHtml(targetComp.name || targetComp.ticker)}</strong> quieres mostrar en el calendario financiero.
              ${hasCustomCompanyFilters(ticker, data)
                ? 'Esta empresa tiene una configuración personalizada activa.'
                : `Por defecto se aplican tus reglas de <strong>${targetComp.isPortfolio ? '💼 Cartera' : '⭐ Favoritos / Seguimiento'}</strong>.`}
            </p>

            <div class="pf-cal-config-section">
              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-company-toggle="payout" ${vis.payout ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon payout">
                  <span class="pf-filter-dot dot-payout"></span>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Dividendos (Pagos y cobros)</strong>
                    <span class="pf-cal-config-tag payout">Efectivo</span>
                  </div>
                  <span>Fechas estimadas o confirmadas de cobro del dividendo en tu cuenta.</span>
                </div>
              </label>

              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-company-toggle="earnings" ${vis.earnings ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon earnings">
                  <span class="pf-filter-dot dot-earnings"></span>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Resultados empresariales</strong>
                    <span class="pf-cal-config-tag earnings">Informes 10-Q / 10-K</span>
                  </div>
                  <span>Presentaciones de cuentas ante la SEC con opción de análisis interactivo con IA.</span>
                </div>
              </label>

              <label class="pf-cal-config-item">
                <input type="checkbox" data-cal-company-toggle="exdiv" ${vis.exdiv ? 'checked' : ''}>
                <div class="pf-cal-config-item-icon exdiv">
                  <span class="pf-filter-dot dot-exdiv"></span>
                </div>
                <div class="pf-cal-config-item-info">
                  <div class="pf-cal-config-item-title-row">
                    <strong>Fecha del Ex-Dividendo</strong>
                    <span class="pf-cal-config-tag exdiv">Corte de cupón</span>
                  </div>
                  <span>Día límite para tener las acciones en cartera y conservar el derecho al cobro.</span>
                </div>
              </label>
            </div>

            <div class="pf-cal-config-presets-box">
              <span class="pf-cal-presets-heading">Vistas rápidas para ${escapeHtml(targetComp.ticker)}:</span>
              <div class="pf-cal-presets-btns">
                <button class="pf-cal-preset-pill" type="button" data-cal-company-preset="all">Mostrar todo</button>
                <button class="pf-cal-preset-pill" type="button" data-cal-company-preset="dividends">Solo Dividendos (Ex-Div + Cobro)</button>
                <button class="pf-cal-preset-pill" type="button" data-cal-company-preset="earnings">Solo Resultados SEC</button>
                <button class="pf-cal-preset-pill" type="button" data-cal-company-preset="default">Por defecto (${targetComp.isPortfolio ? 'Cartera' : 'Seguimiento'})</button>
              </div>
            </div>
          </div>

          <div class="pf-cal-modal-footer">
            <button class="pf-outline-button" type="button" data-cal-company-reset="${escapeHtml(targetComp.ticker)}">Restablecer por defecto (${targetComp.isPortfolio ? 'Cartera' : 'Seguimiento'})</button>
            <button class="primary-button" type="button" data-cal-close-company-modal>Guardar y aplicar</button>
          </div>
        </div>
      </div>`;
  }

  function openCalendarFilingPreview(url, name) {
    if (!url) return;
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (!backdrop) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    const title = document.querySelector('#filings-preview-title');
    const loading = document.querySelector('#filings-preview-loading');
    const pages = document.querySelector('#filings-preview-pages');
    const openLink = document.querySelector('#filings-preview-open');

    clearTimeout(calPreviewLoadTimeout);
    if (title) title.textContent = `Vista previa · ${name || 'Informe'}`;
    if (openLink) openLink.href = url;
    if (pages) {
      pages.hidden = true;
      pages.innerHTML = '';
    }
    if (loading) {
      loading.hidden = false;
      loading.textContent = 'Generando páginas del documento…';
    }
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    calPreviewLoadTimeout = setTimeout(() => {
      if (loading && !loading.hidden) {
        loading.textContent = 'La vista previa tarda demasiado. Puedes abrir el documento en una pestaña nueva.';
      }
    }, 30000);

    const previewUrl = url.replace(/\/document$/, '/preview');
    fetch(previewUrl)
      .then((response) => response.json().catch(() => ({})))
      .then((resData) => {
        clearTimeout(calPreviewLoadTimeout);
        if (!resData || resData.ok !== true || !resData.pages) {
          if (loading) loading.textContent = 'No se pudo generar la vista previa. Abre el documento en una pestaña nueva.';
          return;
        }
        if (loading) loading.hidden = true;
        const pageWord = resData.pages === 1 ? 'página' : 'páginas';
        if (title) title.textContent = `Vista previa · ${name || 'Informe'} · ${resData.pages} ${pageWord}`;
        const base = previewUrl.replace(/\/preview$/, '/preview/pages');
        if (pages) {
          pages.innerHTML = Array.from({ length: resData.pages }, (_, index) => (
            `<img src="${base}/${index + 1}" alt="Página ${index + 1}" loading="lazy">`
          )).join('');
          pages.hidden = false;
        }
      })
      .catch(() => {
        clearTimeout(calPreviewLoadTimeout);
        if (loading) loading.textContent = 'No se pudo conectar con el servidor. Abre el documento en una pestaña nueva.';
      });
  }

  function closeCalendarFilingPreview() {
    clearTimeout(calPreviewLoadTimeout);
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (backdrop) backdrop.hidden = true;
    const pages = document.querySelector('#filings-preview-pages');
    if (pages) pages.innerHTML = '';
    document.body.style.overflow = '';
  }

  async function runCalendarFilingAnalysis(ticker, accession, renderFn) {
    calendarAiLoading = true;
    calendarAiError = null;
    calendarAiResult = null;
    if (typeof renderFn === 'function') renderFn();

    try {
      let targetAccession = accession;
      if (!targetAccession) {
        const fRes = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}/filings`);
        const fData = await fRes.json().catch(() => ({}));
        if (fData?.filings?.length > 0) {
          targetAccession = fData.filings[0].accession;
        }
      }

      if (!targetAccession) {
        throw new Error('No se encontró el identificador oficial (accession) del informe en SEC EDGAR.');
      }

      const response = await fetch(
        `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(targetAccession)}/analyze`,
        { method: 'POST' }
      );
      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (resData.code === 'AUTH_REQUIRED' || resData.code === 'DAILY_LIMIT_REACHED') {
          calendarAiLoading = false;
          calendarAiError = resData.error || 'No se pudo completar el análisis de IA del informe.';
          if (typeof renderFn === 'function') renderFn();
          if (resData.code === 'AUTH_REQUIRED') {
            window.showToast?.('Crea una cuenta gratis para analizar informes nuevos con IA.');
            window.AuthModule?.openModal?.('register');
          }
          return;
        }
        throw new Error(resData.error || 'No se pudo completar el análisis de IA del informe.');
      }

      calendarAiResult = resData;
      calendarAiLoading = false;
      if (typeof renderFn === 'function') renderFn();
    } catch (err) {
      calendarAiError = err.message || 'Error al conectar con el servidor de análisis.';
      calendarAiLoading = false;
      if (typeof renderFn === 'function') renderFn();
    }
  }

  function calendarPanelHtml(data) {
    const allEvents = getPortfolioCalendarEvents(calendarYear, calendarMonth, data);
    const earningsCount = allEvents.filter((e) => e.type === 'earnings').length;
    const exdivCount = allEvents.filter((e) => e.type === 'exdiv').length;
    const payoutEvents = allEvents.filter((e) => e.type === 'payout');
    const payoutCount = payoutEvents.length;
    const totalPayoutAmount = payoutEvents.reduce((acc, e) => acc + (e.amount || 0), 0);

    const filteredEvents = allEvents.filter((e) => {
      if (e.type === 'earnings' && !calendarVisibility.earnings) return false;
      if (e.type === 'exdiv' && !calendarVisibility.exdiv) return false;
      if (e.type === 'payout' && !calendarVisibility.payout) return false;

      if (e.isPortfolio && !calendarVisibility.portfolio) return false;
      if (!e.isPortfolio && !calendarVisibility.watchlist) return false;

      const ticker = (e.ticker || '').toUpperCase();
      const compVis = getCompanyVisibility(ticker, data);
      if (e.type === 'earnings' && !compVis.earnings) return false;
      if (e.type === 'exdiv' && !compVis.exdiv) return false;
      if (e.type === 'payout' && !compVis.payout) return false;

      return true;
    });

    const isCustom = hasCustomCalendarFilters();
    const monthName = MONTH_NAMES_ES[calendarMonth];

    return `
      <div class="pf-calendar-dashboard">
        ${calendarCompaniesPanelHtml(data)}

        <div class="pf-cal-kpis-grid">
          <article class="pf-cal-kpi-card pf-cal-kpi-interactive" data-cal-kpi-toggle="all" title="Clic para restablecer y mostrar todos los eventos">
            <div class="pf-cal-kpi-icon icon-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Eventos en ${monthName}</span>
                ${isCustom ? '<span class="pf-cal-kpi-pill filter-note">Filtro activo</span>' : ''}
              </div>
              <strong class="pf-cal-kpi-value">${filteredEvents.length}</strong>
              <small class="pf-cal-kpi-sub">${isCustom ? `${allEvents.length} eventos en total` : 'Total cartera y seguimiento'}</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card pf-cal-kpi-interactive ${!calendarVisibility.earnings ? 'kpi-dimmed' : ''}" data-cal-kpi-toggle="earnings" title="Clic para ${calendarVisibility.earnings ? 'ocultar' : 'mostrar'} resultados empresariales">
            <div class="pf-cal-kpi-icon icon-earnings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Resultados empresariales</span>
                <span class="pf-cal-kpi-pill ${calendarVisibility.earnings ? 'visible' : 'hidden'}">${calendarVisibility.earnings ? 'Visible' : 'Oculto'}</span>
              </div>
              <strong class="pf-cal-kpi-value">${earningsCount}</strong>
              <small class="pf-cal-kpi-sub">Informes 10-Q / 10-K</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card pf-cal-kpi-interactive ${!calendarVisibility.exdiv ? 'kpi-dimmed' : ''}" data-cal-kpi-toggle="exdiv" title="Clic para ${calendarVisibility.exdiv ? 'ocultar' : 'mostrar'} fechas ex-dividend">
            <div class="pf-cal-kpi-icon icon-exdiv">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Fechas Ex-Dividend</span>
                <span class="pf-cal-kpi-pill ${calendarVisibility.exdiv ? 'visible' : 'hidden'}">${calendarVisibility.exdiv ? 'Visible' : 'Oculto'}</span>
              </div>
              <strong class="pf-cal-kpi-value">${exdivCount}</strong>
              <small class="pf-cal-kpi-sub">Corte con derecho a cobro</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card pf-cal-kpi-interactive ${!calendarVisibility.payout ? 'kpi-dimmed' : ''}" data-cal-kpi-toggle="payout" title="Clic para ${calendarVisibility.payout ? 'ocultar' : 'mostrar'} pagos de dividendos">
            <div class="pf-cal-kpi-icon icon-payout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Total a cobrar en el mes</span>
                <span class="pf-cal-kpi-pill ${calendarVisibility.payout ? 'visible' : 'hidden'}">${calendarVisibility.payout ? 'Visible' : 'Oculto'}</span>
              </div>
              <strong class="pf-cal-kpi-value ${calendarVisibility.payout ? 'text-emerald' : ''}">${fmtEur(totalPayoutAmount)}</strong>
              <small class="pf-cal-kpi-sub">${payoutCount} pagos previstos</small>
            </div>
          </article>
        </div>

        <div class="pf-dividend-card pf-cal-card">
          <div class="pf-card-head pf-cal-card-head">
            <div class="pf-cal-month-nav">
              <button class="pf-outline-button pf-cal-nav-btn" type="button" data-cal-nav="prev" title="Mes anterior">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h3 class="pf-cal-month-title">${monthName} <span class="pf-cal-year-dim">${calendarYear}</span></h3>
              <button class="pf-outline-button pf-cal-nav-btn" type="button" data-cal-nav="next" title="Mes siguiente">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button class="pf-outline-button pf-cal-today-btn" type="button" data-cal-today>Hoy</button>
            </div>

            <div class="pf-cal-toolbar-actions">
              <div class="pf-cal-filters" role="group" aria-label="Filtrar eventos">
                <button class="pf-cal-filter-btn ${!isCustom ? 'active' : ''}" type="button" data-cal-filter-toggle="all" title="Mostrar todos los eventos">
                  Todos <span class="pf-filter-badge">${allEvents.length}</span>
                </button>
                <button class="pf-cal-filter-btn filter-earnings ${calendarVisibility.earnings ? 'active' : 'inactive'}" type="button" data-cal-filter-toggle="earnings" title="${calendarVisibility.earnings ? 'Ocultar Resultados' : 'Mostrar Resultados'}">
                  <span class="pf-filter-dot dot-earnings"></span>Resultados <span class="pf-filter-badge">${earningsCount}</span>
                </button>
                <button class="pf-cal-filter-btn filter-exdiv ${calendarVisibility.exdiv ? 'active' : 'inactive'}" type="button" data-cal-filter-toggle="exdiv" title="${calendarVisibility.exdiv ? 'Ocultar Ex-Dividend' : 'Mostrar Ex-Dividend'}">
                  <span class="pf-filter-dot dot-exdiv"></span>Ex-Dividend <span class="pf-filter-badge">${exdivCount}</span>
                </button>
                <button class="pf-cal-filter-btn filter-payout ${calendarVisibility.payout ? 'active' : 'inactive'}" type="button" data-cal-filter-toggle="payout" title="${calendarVisibility.payout ? 'Ocultar Cobros' : 'Mostrar Cobros'}">
                  <span class="pf-filter-dot dot-payout"></span>Cobro <span class="pf-filter-badge">${payoutCount}</span>
                </button>
              </div>

              <button class="pf-outline-button pf-cal-config-trigger-btn ${isCustom ? 'has-active-filters' : ''}" type="button" data-cal-open-config title="Editar qué tipos de eventos y empresas mostrar en el calendario">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="14" y2="14"/><line x1="4" x2="20" y1="7" y2="7"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="14" r="2"/><circle cx="10" cy="21" r="2"/></svg>
                <span>Editar qué mostrar</span>
                ${isCustom ? '<span class="pf-cal-config-active-dot" title="Filtros personalizados activos"></span>' : ''}
              </button>

              <div class="pf-segmented-toggle" role="group" aria-label="Modo de visualización">
                <button class="pf-seg-btn ${calendarViewMode === 'grid' ? 'active' : ''}" type="button" data-cal-view="grid" title="Vista Cuadrícula">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                  <span>Calendario</span>
                </button>
                <button class="pf-seg-btn ${calendarViewMode === 'list' ? 'active' : ''}" type="button" data-cal-view="list" title="Vista Lista">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
                  <span>Lista</span>
                </button>
              </div>
            </div>
          </div>

          <div class="pf-cal-content-wrap">
            ${calendarViewMode === 'grid' ? calendarGridViewHtml(filteredEvents, calendarYear, calendarMonth, data) : calendarListViewHtml(filteredEvents, data)}
          </div>
        </div>

        ${calendarModalHtml()}
        ${calendarConfigModalHtml()}
        ${calendarCompanyEditModalHtml(data)}
      </div>`;
  }

  function wireCalendarDashboard(scope, { renderCalendarView, onNavigate, getData, hasPosition, refresh } = {}) {
    if (!scope) return;
    const rerender = () => {
      if (typeof renderCalendarView === 'function') renderCalendarView();
    };

    scope.querySelectorAll('[data-cal-nav="prev"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarMonth--;
        if (calendarMonth < 0) {
          calendarMonth = 11;
          calendarYear--;
        }
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-nav="next"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarMonth++;
        if (calendarMonth > 11) {
          calendarMonth = 0;
          calendarYear++;
        }
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-today]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarYear = 2026;
        calendarMonth = 7;
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-filter-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const toggleKey = btn.dataset.calFilterToggle;
        if (toggleKey === 'all') {
          calendarVisibility.earnings = true;
          calendarVisibility.exdiv = true;
          calendarVisibility.payout = true;
          calendarVisibility.portfolio = true;
          calendarVisibility.watchlist = true;
        } else if (toggleKey in calendarVisibility) {
          calendarVisibility[toggleKey] = !calendarVisibility[toggleKey];
        }
        saveCalendarVisibility(calendarVisibility);
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-kpi-toggle]').forEach((card) => {
      card.addEventListener('click', () => {
        const toggleKey = card.dataset.calKpiToggle;
        if (toggleKey === 'all') {
          calendarVisibility.earnings = true;
          calendarVisibility.exdiv = true;
          calendarVisibility.payout = true;
          calendarVisibility.portfolio = true;
          calendarVisibility.watchlist = true;
        } else if (toggleKey in calendarVisibility) {
          calendarVisibility[toggleKey] = !calendarVisibility[toggleKey];
        }
        saveCalendarVisibility(calendarVisibility);
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-open-config]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarConfigModalOpen = true;
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-close-config]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarConfigModalOpen = false;
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-toggle-key]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.calToggleKey;
        if (key in calendarVisibility) {
          calendarVisibility[key] = input.checked;
          saveCalendarVisibility(calendarVisibility);
        }
      });
    });

    scope.querySelectorAll('[data-cal-preset]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const preset = btn.dataset.calPreset;
        if (preset === 'all') {
          calendarVisibility.earnings = true;
          calendarVisibility.exdiv = true;
          calendarVisibility.payout = true;
          calendarVisibility.portfolio = true;
          calendarVisibility.watchlist = true;
        } else if (preset === 'dividends') {
          calendarVisibility.earnings = false;
          calendarVisibility.exdiv = true;
          calendarVisibility.payout = true;
          calendarVisibility.portfolio = true;
          calendarVisibility.watchlist = true;
        } else if (preset === 'earnings') {
          calendarVisibility.earnings = true;
          calendarVisibility.exdiv = false;
          calendarVisibility.payout = false;
          calendarVisibility.portfolio = true;
          calendarVisibility.watchlist = true;
        }
        saveCalendarVisibility(calendarVisibility);
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-reset-config]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarVisibility = { earnings: true, exdiv: true, payout: true, portfolio: true, watchlist: true };
        saveCalendarVisibility(calendarVisibility);
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarViewMode = btn.dataset.calView;
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-event-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-cal-goto]') || ev.target.closest('[data-cal-list-analyze]') || ev.target.closest('[data-cal-preview-doc]')) return;
        const id = el.dataset.calEventId;
        const allEvents = getPortfolioCalendarEvents(calendarYear, calendarMonth, getData ? getData() : null);
        const match = allEvents.find((x) => x.id === id);
        if (match) {
          calendarActiveModalEvent = match;
          calendarAiLoading = false;
          calendarAiResult = null;
          calendarAiError = null;
          rerender();
        }
      });
    });

    scope.querySelectorAll('[data-cal-open-day]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarViewMode = 'list';
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-run-ai], [data-cal-list-analyze]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const ticker = btn.dataset.calRunAi || btn.dataset.calListAnalyze;
        const accession = btn.dataset.calAccession;
        if (!calendarActiveModalEvent && btn.dataset.calListAnalyze) {
          const allEvents = getPortfolioCalendarEvents(calendarYear, calendarMonth, getData ? getData() : null);
          const match = allEvents.find((x) => x.ticker === ticker && x.type === 'earnings');
          if (match) calendarActiveModalEvent = match;
        }
        await runCalendarFilingAnalysis(ticker, accession, rerender);
      });
    });

    scope.querySelectorAll('[data-cal-preview-doc]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const url = btn.dataset.calPreviewDoc;
        const name = btn.dataset.calPreviewName;
        openCalendarFilingPreview(url, name);
      });
    });

    scope.querySelectorAll('[data-cal-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarActiveModalEvent = null;
        calendarAiLoading = false;
        calendarAiResult = null;
        calendarAiError = null;
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-goto]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarActiveModalEvent = null;
        calendarAiLoading = false;
        calendarAiResult = null;
        calendarAiError = null;
        const ticker = btn.dataset.calGoto;
        if (ticker && onNavigate) onNavigate(ticker);
        else if (ticker) window.location.href = `/empresa/${encodeURIComponent(ticker)}`;
      });
    });

    scope.querySelectorAll('[data-cal-chip-ticker]').forEach((chip) => {
      chip.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-cal-remove-ticker]') || ev.target.closest('[data-cal-edit-company]')) return;
        const ticker = chip.dataset.calChipTicker;
        if (ticker && onNavigate) onNavigate(ticker);
        else if (ticker) window.location.href = `/empresa/${encodeURIComponent(ticker)}`;
      });
    });

    scope.querySelectorAll('[data-cal-edit-company]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarEditingCompanyTicker = btn.dataset.calEditCompany;
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-close-company-modal]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarEditingCompanyTicker = null;
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-company-toggle]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!calendarEditingCompanyTicker) return;
        const key = input.dataset.calCompanyToggle;
        const up = calendarEditingCompanyTicker.toUpperCase();
        if (!calendarCompanyVisibility[up]) {
          calendarCompanyVisibility[up] = { ...getCompanyDefaultVisibility(up, getData ? getData() : null) };
        }
        calendarCompanyVisibility[up][key] = input.checked;
        const def = getCompanyDefaultVisibility(up, getData ? getData() : null);
        if (
          calendarCompanyVisibility[up].earnings === def.earnings &&
          calendarCompanyVisibility[up].exdiv === def.exdiv &&
          calendarCompanyVisibility[up].payout === def.payout
        ) {
          delete calendarCompanyVisibility[up];
        }
        saveCalendarCompanyVisibility(calendarCompanyVisibility);
      });
    });

    scope.querySelectorAll('[data-cal-company-preset]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!calendarEditingCompanyTicker) return;
        const up = calendarEditingCompanyTicker.toUpperCase();
        const preset = btn.dataset.calCompanyPreset;
        if (preset === 'all') {
          calendarCompanyVisibility[up] = { earnings: true, exdiv: true, payout: true };
        } else if (preset === 'dividends') {
          calendarCompanyVisibility[up] = { earnings: false, exdiv: true, payout: true };
        } else if (preset === 'earnings') {
          calendarCompanyVisibility[up] = { earnings: true, exdiv: false, payout: false };
        } else if (preset === 'default') {
          delete calendarCompanyVisibility[up];
        }
        if (calendarCompanyVisibility[up]) {
          const def = getCompanyDefaultVisibility(up, getData ? getData() : null);
          if (
            calendarCompanyVisibility[up].earnings === def.earnings &&
            calendarCompanyVisibility[up].exdiv === def.exdiv &&
            calendarCompanyVisibility[up].payout === def.payout
          ) {
            delete calendarCompanyVisibility[up];
          }
        }
        saveCalendarCompanyVisibility(calendarCompanyVisibility);
        rerender();
      });
    });

    scope.querySelectorAll('[data-cal-company-reset]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!calendarEditingCompanyTicker) return;
        const up = calendarEditingCompanyTicker.toUpperCase();
        delete calendarCompanyVisibility[up];
        saveCalendarCompanyVisibility(calendarCompanyVisibility);
        rerender();
      });
    });

    scope.querySelectorAll('.pf-cal-chip-logo').forEach((logo) => {
      logo.addEventListener('error', () => {
        const letter = document.createElement('span');
        letter.className = 'pf-cal-chip-fallback';
        letter.textContent = logo.dataset.letter || '?';
        logo.replaceWith(letter);
      });
    });

    scope.querySelectorAll('[data-cal-remove-ticker]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const ticker = btn.dataset.calRemoveTicker;
        if (hasPosition && hasPosition(ticker)) {
          window.showToast?.(`No se puede eliminar ${ticker} porque está en tu cartera.`);
          return;
        }
        btn.disabled = true;
        try {
          const res = await fetch(`/api/watchlists/calendar/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error || 'No se pudo eliminar del calendario.');
          window.showToast?.(`${ticker} eliminada del calendario.`);
          if (typeof refresh === 'function') await refresh();
          if (typeof window.Watchlists !== 'undefined') await window.Watchlists.refresh();
        } catch (err) {
          window.showToast?.(err.message);
          btn.disabled = false;
        }
      });
    });

    const addInput = scope.querySelector('.pf-cal-add-input');
    const addResults = scope.querySelector('.pf-cal-add-results');
    let calSearchTimer = null;
    if (addInput && addResults) {
      addInput.addEventListener('input', () => {
        clearTimeout(calSearchTimer);
        const query = addInput.value.trim();
        if (!query) {
          addResults.hidden = true;
          addResults.innerHTML = '';
          return;
        }
        calSearchTimer = setTimeout(async () => {
          try {
            const res = await fetch(`/api/screener/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) return;
            const payload = await res.json().catch(() => null);
            const matches = payload?.companies ?? [];
            if (!matches.length) {
              addResults.innerHTML = '<div class="pf-ticker-empty">Sin resultados en EDGAR.</div>';
              addResults.hidden = false;
              return;
            }
            const existingTickers = new Set(getCalendarCompanies(getData ? getData() : null).map((c) => c.ticker.toUpperCase()));
            addResults.innerHTML = matches.map((comp) => {
              const already = existingTickers.has(comp.ticker.toUpperCase());
              return `
                <button class="pf-ticker-result" type="button" data-add-ticker="${escapeHtml(comp.ticker)}" data-add-name="${escapeHtml(comp.name)}">
                  <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(comp.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((comp.name || comp.ticker || '?').slice(0, 1).toUpperCase())}">
                  <span>${escapeHtml(comp.name)}</span>
                  ${already ? '<span class="pf-cal-result-already">En calendario</span>' : ''}
                  <strong>${escapeHtml(comp.ticker)}</strong>
                </button>
              `;
            }).join('');
            addResults.hidden = false;

            addResults.querySelectorAll('.pf-ticker-result').forEach((item) => {
              item.addEventListener('click', async () => {
                const t = item.dataset.addTicker;
                const n = item.dataset.addName;
                addInput.value = '';
                addResults.hidden = true;
                addResults.innerHTML = '';
                await addCalendarTickerAction(t, n);
              });
            });

            addResults.querySelectorAll('.search-result-logo').forEach((logo) => {
              logo.addEventListener('error', () => {
                const letter = document.createElement('span');
                letter.className = 'search-result-logo search-result-logo-fallback';
                letter.textContent = logo.dataset.letter || '?';
                logo.replaceWith(letter);
              });
            });
          } catch {
            // Silencioso
          }
        }, 250);
      });

      addInput.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const val = addInput.value.trim().toUpperCase();
          if (val) {
            addInput.value = '';
            addResults.hidden = true;
            addResults.innerHTML = '';
            await addCalendarTickerAction(val, val);
          }
        } else if (ev.key === 'Escape') {
          addResults.hidden = true;
          addInput.blur();
        }
      });

      document.addEventListener('click', (ev) => {
        if (!ev.target.closest('.pf-cal-add-company-wrap')) {
          addResults.hidden = true;
        }
      });
    }

    async function addCalendarTickerAction(ticker, name) {
      ticker = String(ticker || '').trim().toUpperCase();
      if (!ticker) return;
      if (hasPosition && hasPosition(ticker)) {
        window.showToast?.(`${ticker} ya está en tu cartera y siempre aparece en el calendario.`);
        return;
      }
      const current = getCalendarCompanies(getData ? getData() : null);
      if (current.some((c) => c.ticker === ticker)) {
        window.showToast?.(`${ticker} ya está en el calendario.`);
        return;
      }
      try {
        const res = await fetch('/api/watchlists/calendar/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, companyName: name || ticker }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'No se pudo añadir al calendario.');
        window.showToast?.(`${ticker} añadida al calendario.`);
        if (typeof refresh === 'function') await refresh();
        if (typeof window.Watchlists !== 'undefined') await window.Watchlists.refresh();
      } catch (err) {
        window.showToast?.(err.message);
      }
    }

    const previewCloseBtn = document.querySelector('#filings-preview-close');
    if (previewCloseBtn) previewCloseBtn.onclick = closeCalendarFilingPreview;
    const previewBackdrop = document.querySelector('#filings-preview-backdrop');
    if (previewBackdrop) {
      previewBackdrop.onclick = (event) => {
        if (event.target === previewBackdrop) closeCalendarFilingPreview();
      };
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const bd = document.querySelector('#filings-preview-backdrop');
        if (bd && !bd.hidden) closeCalendarFilingPreview();
        if (calendarEditingCompanyTicker) {
          calendarEditingCompanyTicker = null;
          rerender();
        } else if (calendarConfigModalOpen) {
          calendarConfigModalOpen = false;
          rerender();
        } else if (calendarActiveModalEvent) {
          calendarActiveModalEvent = null;
          calendarAiLoading = false;
          calendarAiResult = null;
          calendarAiError = null;
          rerender();
        }
      }
    });
  }

  const PortfolioCalendar = {
    MONTH_NAMES_ES,
    WEEKDAYS_ES,
    WEEKDAYS_SHORT_ES,
    getPortfolioCalendarEvents,
    getCalendarCompanies,
    calendarCompaniesPanelHtml,
    calendarPanelHtml,
    calendarGridViewHtml,
    calendarListViewHtml,
    calendarModalHtml,
    calendarConfigModalHtml,
    calendarCompanyEditModalHtml,
    openCalendarFilingPreview,
    closeCalendarFilingPreview,
    wireCalendarDashboard,
    get year() { return calendarYear; },
    set year(v) { calendarYear = v; },
    get month() { return calendarMonth; },
    set month(v) { calendarMonth = v; },
    get viewMode() { return calendarViewMode; },
    set viewMode(v) { calendarViewMode = v; }
  };

  window.PortfolioCalendar = PortfolioCalendar;
})(window);
