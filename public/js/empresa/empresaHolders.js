/**
 * @file empresaHolders.js
 * @description Gestión y renderizado del accionariado (instituciones, directivos y fondos) en la vista de empresa.
 */

(function (window) {
  'use strict';

  let companyHoldersData = null;
  let companyHoldersLoading = false;
  let activeHoldersTab = 'institutions';

  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(val, digits = 2) {
    if (window.EmpresaFormatting?.formatProfileNumber) {
      return window.EmpresaFormatting.formatProfileNumber(val, digits);
    }
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(val));
  }

  function formatCompactUsd(val) {
    if (window.EmpresaFormatting?.formatProfileCompactUsd) {
      return window.EmpresaFormatting.formatProfileCompactUsd(val);
    }
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
    const absolute = Math.abs(Number(val));
    const units = absolute >= 1e9 ? [1e9, 'B'] : absolute >= 1e6 ? [1e6, 'M'] : absolute >= 1e3 ? [1e3, 'K'] : [1, ''];
    return `${Number(val) < 0 ? '−' : ''}${formatNumber(absolute / units[0], units[1] ? 2 : 0)} ${units[1]} $`.trim();
  }

  /**
   * Carga los datos de accionariado desde el backend.
   * @param {string} ticker
   * @param {string} [companyName]
   */
  async function loadHolders(ticker, companyName = '') {
    const currentTicker = ticker || window.companyTicker || '';
    if (!currentTicker) return;
    const loadingEl = document.querySelector('#accionariado-loading');
    const errorEl = document.querySelector('#accionariado-error');
    const tableWrap = document.querySelector('#accionariado-table-wrap');

    if (loadingEl) loadingEl.hidden = false;
    if (errorEl) errorEl.hidden = true;
    if (tableWrap) tableWrap.hidden = true;

    companyHoldersLoading = true;
    try {
      const res = await fetch(`/api/screener/company/${encodeURIComponent(currentTicker)}/holders`);
      if (!res.ok) {
        throw new Error(`Error ${res.status}: no se pudieron obtener los datos de accionariado.`);
      }
      const data = await res.json();
      companyHoldersData = data;
      renderHolders(companyName || currentTicker);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'No fue posible cargar el accionariado.';
        errorEl.hidden = false;
      }
    } finally {
      companyHoldersLoading = false;
      if (loadingEl) loadingEl.hidden = true;
    }
  }

  /**
   * Renderiza la tabla de directivos / insiders.
   * @param {HTMLElement} thead
   * @param {HTMLElement} tbody
   */
  function renderInsidersView(thead, tbody) {
    thead.innerHTML = `
      <tr>
        <th style="width: 32%;">Nombre</th>
        <th style="width: 24%;">Cargo / Relación</th>
        <th style="text-align: right; width: 16%;">Acciones directas</th>
        <th style="width: 16%;">Operación</th>
        <th style="text-align: right; width: 12%;">Fecha</th>
      </tr>
    `;
    const list = companyHoldersData.insiders || [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 24px;">No hay datos de directivos reportados.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map((item) => `
      <tr>
        <td>
          <span style="font-size: 16px; margin-right: 6px;" aria-hidden="true">👤</span>
          <strong style="color: var(--ink); font-size: 12.5px;">${escapeHtml(item.name || '—')}</strong>
        </td>
        <td style="color: var(--muted); font-size: 12px;">${escapeHtml(item.relation || 'Directivo')}</td>
        <td style="text-align: right; font-family: monospace; font-size: 12.5px; font-weight: 600; color: var(--ink);">
          ${formatNumber(item.position, 0)}
        </td>
        <td style="color: var(--muted); font-size: 11.5px;">${escapeHtml(item.transactionDescription || '—')}</td>
        <td style="text-align: right; color: var(--muted); font-size: 11.5px;">${escapeHtml(item.reportDate || '—')}</td>
      </tr>
    `).join('');
  }

  /**
   * Renderiza la tabla de instituciones o fondos.
   * @param {HTMLElement} thead
   * @param {HTMLElement} tbody
   * @param {boolean} isFunds
   */
  function renderInstitutionalView(thead, tbody, isFunds) {
    const list = isFunds ? (companyHoldersData.funds || []) : (companyHoldersData.institutions || []);
    thead.innerHTML = `
      <tr>
        <th style="width: 38%;">Nombre</th>
        <th style="text-align: right; width: 18%;">Acciones</th>
        <th style="text-align: right; width: 14%;">%</th>
        <th style="text-align: right; width: 16%;">Valoración</th>
        <th style="text-align: right; width: 14%;">Variación</th>
      </tr>
    `;

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 24px;">No se encontraron posiciones para esta categoría.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((item) => {
      const flag = item.country?.flag || '🇺🇸';
      const countryName = item.country?.name || 'Estados Unidos';
      const sharesStr = formatNumber(item.shares, 0);
      const pctStr = item.percentage !== null && item.percentage !== undefined
        ? `${formatNumber(item.percentage * 100, 2)} %`
        : '—';
      const valStr = formatCompactUsd(item.value);

      let changeHtml = '<span style="color: var(--muted);">—</span>';
      if (item.changePercent !== null && item.changePercent !== undefined) {
        const chg = item.changePercent * 100;
        const isPos = chg > 0;
        const isNeg = chg < 0;
        const sign = isPos ? '+' : '';
        const colorClass = isPos ? 'positive' : isNeg ? 'negative' : '';
        changeHtml = `<span class="td-change ${colorClass}">${sign}${formatNumber(chg, 2)} %</span>`;
      }

      return `
        <tr>
          <td>
            <span style="font-size: 16px; margin-right: 6px;" title="${escapeHtml(countryName)}">${flag}</span>
            <strong style="color: var(--ink); font-size: 12.5px;">${escapeHtml(item.name || '—')}</strong>
          </td>
          <td style="text-align: right; font-family: monospace; font-size: 12.5px; font-weight: 600; color: var(--ink);">
            ${sharesStr}
          </td>
          <td style="text-align: right; font-family: monospace; font-size: 12px; color: var(--ink);">
            ${pctStr}
          </td>
          <td style="text-align: right; font-family: monospace; font-size: 12px; font-weight: 600; color: var(--ink);">
            ${valStr}
          </td>
          <td style="text-align: right;">
            ${changeHtml}
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Renderiza el contenido del panel de accionariado.
   * @param {string} [companyDisplayName]
   */
  function renderHolders(companyDisplayName) {
    if (!companyHoldersData) return;

    const titleEl = document.querySelector('#accionariado-company-name');
    if (titleEl && companyDisplayName) {
      titleEl.textContent = companyDisplayName;
    }

    const institutions = companyHoldersData.institutions || [];
    const top10Pct = institutions.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0);

    const bk = companyHoldersData.breakdown || {};
    const kpiInstPct = document.querySelector('#kpi-institutions-pct');
    const kpiInstCount = document.querySelector('#kpi-institutions-count');
    const kpiInsidersPct = document.querySelector('#kpi-insiders-pct');

    if (kpiInstPct) {
      kpiInstPct.textContent = top10Pct > 0 ? `${formatNumber(top10Pct * 100, 2)} %` : '—';
    }
    if (kpiInsidersPct) {
      kpiInsidersPct.textContent = bk.insidersPercent !== null && bk.insidersPercent !== undefined
        ? `${formatNumber(bk.insidersPercent * 100, 2)} %`
        : '—';
    }
    if (kpiInstCount) {
      kpiInstCount.textContent = bk.institutionsCount ? `${formatNumber(bk.institutionsCount, 0)} entidades` : '—';
    }

    const thead = document.querySelector('#accionariado-thead');
    const tbody = document.querySelector('#accionariado-tbody');
    const tableWrap = document.querySelector('#accionariado-table-wrap');
    if (tableWrap) tableWrap.hidden = false;
    if (!thead || !tbody) return;

    if (activeHoldersTab === 'insiders') {
      renderInsidersView(thead, tbody);
    } else {
      renderInstitutionalView(thead, tbody, activeHoldersTab === 'funds');
    }
  }

  /**
   * Inicializa los listeners de pestañas de accionariado.
   */
  function initHoldersTabs() {
    document.querySelectorAll('[data-holders-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-holders-tab]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeHoldersTab = btn.dataset.holdersTab;
        renderHolders();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHoldersTabs);
  } else {
    initHoldersTabs();
  }

  const EmpresaHolders = {
    loadHolders,
    renderHolders,
    getData: () => companyHoldersData,
    setData: (data) => { companyHoldersData = data; }
  };

  window.EmpresaHolders = EmpresaHolders;
  window.loadHolders = loadHolders;
  window.renderHolders = renderHolders;
})(window);
