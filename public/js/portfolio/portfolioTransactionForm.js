/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function transactionFormHtml({ ticker = '', companyName = '' } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    return `
      <form class="pf-form" novalidate data-fixed-ticker="${escapeHtml(ticker)}">
        <div class="pf-form-row">
          <label class="pf-field pf-field-ticker">
            <span>Ticker</span>
            <div class="pf-ticker-wrap">
              <input class="pf-input pf-ticker-input" type="text" autocomplete="off" maxlength="10"
                placeholder="Busca la empresa (ej. KO)" value="${escapeHtml(ticker)}" required>
              <div class="pf-ticker-results" hidden></div>
            </div>
          </label>
          <label class="pf-field">
            <span>Tipo</span>
            <select class="pf-input pf-type-input" required>
              <option value="buy">Compra</option>
              <option value="sell">Venta</option>
            </select>
          </label>
          <label class="pf-field">
            <span>Cantidad</span>
            <input class="pf-input pf-shares-input" type="number" min="0.000001" step="any" inputmode="decimal" placeholder="Ej. 10" required>
          </label>
          <label class="pf-field">
            <span>Precio por acción ($)</span>
            <input class="pf-input pf-price-input" type="number" min="0" step="any" inputmode="decimal" placeholder="Ej. 50.00" required>
          </label>
          <label class="pf-field">
            <span>Fecha</span>
            <input class="pf-input pf-date-input" type="date" max="${today}" value="${today}" required>
          </label>
          <button class="primary-button pf-submit" type="submit">Guardar</button>
        </div>
        <p class="pf-form-note hidden"></p>
        ${companyName ? `<input type="hidden" class="pf-company-input" value="${escapeHtml(companyName)}">` : ''}
      </form>
    `;
  }

  function wireTransactionForm(form) {
    if (!form || form.dataset.wired) return;
    form.dataset.wired = 'true';

    const tickerInput = form.querySelector('.pf-ticker-input');
    const resultsBox = form.querySelector('.pf-ticker-results');
    const sharesInput = form.querySelector('.pf-shares-input');
    const priceInput = form.querySelector('.pf-price-input');
    const dateInput = form.querySelector('.pf-date-input');
    const typeInput = form.querySelector('.pf-type-input');
    const note = form.querySelector('.pf-form-note');
    const fixedTicker = form.dataset.fixedTicker ?? '';

    function clearSelectedCompany() {
      form.dataset.selectedTicker = '';
      form.querySelector('.pf-company-input')?.remove();
    }

    if (tickerInput) {
      tickerInput.addEventListener('input', () => {
        const value = tickerInput.value.trim().toUpperCase();
        const selected = form.dataset.selectedTicker ?? '';
        const preset = fixedTicker.toUpperCase();
        if ((selected && selected !== value) || (!selected && preset && value !== preset)) clearSelectedCompany();
        clearTimeout(PS.searchDebounceTimer);
        const query = tickerInput.value.trim();
        if (!query) {
          resultsBox.hidden = true;
          resultsBox.innerHTML = '';
          return;
        }
        PS.searchDebounceTimer = setTimeout(async () => {
          try {
            const response = await fetch(`/api/screener/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) return;
            const payload = await response.json().catch(() => null);
            const matches = payload?.companies ?? [];
            if (!matches.length) {
              resultsBox.innerHTML = '<div class="pf-ticker-empty">Sin resultados en EDGAR.</div>';
              resultsBox.hidden = false;
              return;
            }
            resultsBox.innerHTML = matches.map((company) => `
              <button class="pf-ticker-result" type="button" data-ticker="${escapeHtml(company.ticker)}" data-name="${escapeHtml(company.name)}">
                <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(company.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((company.name || company.ticker || '?').slice(0, 1).toUpperCase())}">
                <span>${escapeHtml(company.name)}</span><strong>${escapeHtml(company.ticker)}</strong>
              </button>
            `).join('');
            resultsBox.hidden = false;
            resultsBox.querySelectorAll('.pf-ticker-result').forEach((result) => {
              result.addEventListener('click', () => {
                tickerInput.value = result.dataset.ticker;
                form.dataset.selectedTicker = result.dataset.ticker;
                form.querySelector('.pf-company-input')?.remove();
                const hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.className = 'pf-company-input';
                hidden.value = result.dataset.name;
                form.appendChild(hidden);
                resultsBox.hidden = true;
                resultsBox.innerHTML = '';
              });
            });
            resultsBox.querySelectorAll('.search-result-logo').forEach((logo) => {
              logo.addEventListener('error', () => {
                const letter = document.createElement('span');
                letter.className = 'search-result-logo search-result-logo-fallback';
                letter.textContent = logo.dataset.letter || '?';
                logo.replaceWith(letter);
              });
            });
          } catch {
            resultsBox.hidden = true;
          }
        }, 250);
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (PS.formBusy) return;
      const ticker = (tickerInput?.value ?? '').trim().toUpperCase();
      const type = (typeInput?.value ?? '').trim();
      const shares = Number(sharesInput?.value);
      const price = Number(priceInput?.value);
      const date = dateInput?.value ?? '';

      if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
        note.textContent = 'Introduce un ticker válido (ej. KO).';
        note.classList.remove('hidden');
        return;
      }
      if (!Number.isFinite(shares) || shares <= 0) {
        note.textContent = 'La cantidad debe ser mayor que 0.';
        note.classList.remove('hidden');
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        note.textContent = 'El precio debe ser mayor o igual que 0.';
        note.classList.remove('hidden');
        return;
      }
      if (!date) {
        note.textContent = 'Elige una fecha.';
        note.classList.remove('hidden');
        return;
      }

      let companyName = form.querySelector('.pf-company-input')?.value ?? '';
      if (!companyName) {
        try {
          const response = await fetch(`/api/screener/search?q=${encodeURIComponent(ticker)}`);
          if (response.ok) {
            const payload = await response.json().catch(() => null);
            const exact = (payload?.companies ?? []).find((company) => company.ticker === ticker);
            if (!exact) {
              note.textContent = `"${ticker}" no existe en el buscador de EDGAR. Elige una empresa de la lista de resultados.`;
              note.classList.remove('hidden');
              return;
            }
            companyName = exact.name;
          }
        } catch {
          // El servidor también valida la empresa contra EDGAR.
        }
      }

      note.classList.add('hidden');
      PS.formBusy = true;
      const submitButton = form.querySelector('.pf-submit');
      if (submitButton) submitButton.disabled = true;
      try {
        await api('/api/portfolio/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, type, shares, price, date, companyName }),
        });
        const actionLabel = type === 'buy' ? (window.I18n ? window.I18n.t('Compra') : 'Compra') : (window.I18n ? window.I18n.t('Venta') : 'Venta');
        const countLabel = window.I18n ? window.I18n.tp(shares, '{n} acción', '{n} acciones') : `${shares} ${shares === 1 ? 'acción' : 'acciones'}`;
        const toastMsg = window.I18n
          ? window.I18n.t('{0} de {1} de {2} guardada.', { 0: actionLabel, 1: countLabel, 2: ticker })
          : `${type === 'buy' ? 'Compra' : 'Venta'} de ${shares} ${shares === 1 ? 'acción' : 'acciones'} de ${ticker} guardada.`;
        showToast?.(toastMsg);
        if (!fixedTicker) form.reset();
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        await refresh();
      } catch (error) {
        note.textContent = error.message;
        note.classList.remove('hidden');
      } finally {
        PS.formBusy = false;
        if (submitButton) submitButton.disabled = false;
      }
    });
  }
window.transactionFormHtml = transactionFormHtml;
window.wireTransactionForm = wireTransactionForm;

})(window);
