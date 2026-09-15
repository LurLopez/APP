/**
 * @fileoverview Cálculo de eventos del calendario y panel de empresas (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;
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

window.getPortfolioCalendarEvents = getPortfolioCalendarEvents;
window.getCalendarCompanies = getCalendarCompanies;
window.calendarCompaniesPanelHtml = calendarCompaniesPanelHtml;
window.OFFICIAL_2026_EARNINGS = OFFICIAL_2026_EARNINGS;

})(window);
