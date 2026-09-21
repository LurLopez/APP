/**
 * @fileoverview Modales de configuración y edición de empresas del calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function calendarConfigModalHtml() {
    if (!CS.calendarConfigModalOpen) return '';

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
                <input type="checkbox" data-cal-toggle-key="earnings" ${CS.calendarVisibility.earnings ? 'checked' : ''}>
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
                <input type="checkbox" data-cal-toggle-key="exdiv" ${CS.calendarVisibility.exdiv ? 'checked' : ''}>
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
                <input type="checkbox" data-cal-toggle-key="payout" ${CS.calendarVisibility.payout ? 'checked' : ''}>
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
                <input type="checkbox" data-cal-toggle-key="portfolio" ${CS.calendarVisibility.portfolio ? 'checked' : ''}>
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
                <input type="checkbox" data-cal-toggle-key="watchlist" ${CS.calendarVisibility.watchlist ? 'checked' : ''}>
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
    if (!CS.calendarEditingCompanyTicker) return '';
    const ticker = CS.calendarEditingCompanyTicker.toUpperCase();
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

window.calendarConfigModalHtml = calendarConfigModalHtml;
window.calendarCompanyEditModalHtml = calendarCompanyEditModalHtml;

})(window);
