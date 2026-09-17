/**
 * @fileoverview Modal de detalle de evento del calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function calendarModalHtml() {
    if (!CS.calendarActiveModalEvent) return '';
    const e = CS.calendarActiveModalEvent;

    let modalTitle = '';
    let modalDesc = '';
    let metricRowsHtml = '';
    let aiSectionHtml = '';

    const originBadgeHtml = e.isPortfolio
      ? `<span class="pf-cal-modal-origin-pill portfolio"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg> Empresa en cartera (${formatNumber(e.shares, { maximumFractionDigits: 2 })} acciones)</span>`
      : `<span class="pf-cal-modal-origin-pill watchlist"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg> Empresa en seguimiento (Calendario)</span>`;

    if (e.type === 'earnings') {
      modalTitle = `Resultados Empresariales · ${e.name} (${e.ticker})`;
      modalDesc = e.accession
        ? `Presentación oficial del informe de resultados correspondiente al ${e.periodLabel}.`
        : `Presentación de resultados anunciada por el mercado. El informe oficial (10-Q / 10-K) todavía no está disponible en la SEC.`;
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
          <strong>${e.accession ? `Formulario SEC ${escapeHtml(e.typeBadge || '10-Q')}` : 'Pendiente de publicación en la SEC'}</strong>
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

      if (!e.accession && !e.documentUrl) {
        aiSectionHtml = `
          <div class="pf-cal-ai-callout-box">
            <div class="pf-cal-ai-callout-header">
              <span class="pf-cal-ai-sparkle">📅</span>
              <strong>Informe aún no publicado en la SEC</strong>
            </div>
            <p>El análisis con IA estará disponible cuando la compañía presente el informe oficial (10-Q / 10-K) en la SEC. La fecha mostrada es la anunciada por el mercado y puede variar.</p>
          </div>
        `;
      } else if (CS.calendarAiLoading) {
        aiSectionHtml = `
          <div class="pf-cal-ai-loading-box">
            <div class="pf-cal-spinner"></div>
            <div class="pf-cal-ai-loading-text">
              <strong>Analizando resultados de ${escapeHtml(e.name)} con IA…</strong>
              <p>Extrayendo cifras de ingresos, márgenes, beneficio neto y análisis estratégico del informe oficial.</p>
            </div>
          </div>
        `;
      } else if (CS.calendarAiResult) {
        aiSectionHtml = `
          <div class="pf-cal-ai-result-box">
            <div class="pf-cal-ai-result-head">
              <div class="pf-cal-ai-chip-pill">🤖 Análisis IA de Resultados</div>
              <span class="pf-cal-ai-sector-tag">${escapeHtml(CS.calendarAiResult.sector || 'Renta Variable')}</span>
            </div>

            ${renderCalendarAiMetricsTable(CS.calendarAiResult.report)}
            ${renderCalendarAiHighlights(CS.calendarAiResult.report)}

            <div class="pf-cal-ai-btn-row">
              ${CS.calendarAiResult.pdfUrl ? `
                <a class="pf-cal-btn-pdf" href="${escapeHtml(CS.calendarAiResult.pdfUrl)}" target="_blank" rel="noopener">
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
          ${CS.calendarAiError ? `<div class="pf-cal-ai-error-box">⚠️ ${escapeHtml(CS.calendarAiError)}</div>` : ''}
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

window.calendarModalHtml = calendarModalHtml;

})(window);
