/**
 * @file empresaFavoriteMetrics.js
 * @description Métricas favoritas de los estados financieros: corazones por fila,
 * pestaña de Favoritos y adición automática al gráfico de métricas.
 */

(function (window) {
  'use strict';

  const STORAGE_KEY = 'cifra_favorite_metrics_v1';
  const STATEMENT_ORDER = ['income', 'balance', 'cashflow'];
  const STATEMENT_LABELS = {
    income: 'Cuenta de resultados',
    balance: 'Balance de situación',
    cashflow: 'Estado de Flujo de Efectivo',
  };
  const LABEL_MAX_LENGTH = 160;

  const favorites = new Map(); // `${statement}:${key}` -> { statement, key, label }

  const HEART_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

  function escapeHtml(value) {
    return window.HtmlUtils?.escapeHtml ? window.HtmlUtils.escapeHtml(value) : String(value ?? '');
  }

  function isAuthenticated() {
    if (typeof window.companyAuthenticated === 'boolean') return window.companyAuthenticated;
    return Boolean(window.AuthModule?.getUser?.() || window.currentUser);
  }

  function favoriteId(statement, key) {
    return `${statement}:${key}`;
  }

  function normalizeFavorite(raw) {
    const statement = STATEMENT_ORDER.includes(raw?.statement) ? raw.statement : null;
    const key = typeof raw?.key === 'string' ? raw.key.trim() : '';
    if (!statement || !key) return null;
    return {
      statement,
      key,
      label: String(raw?.label ?? '').trim().slice(0, LABEL_MAX_LENGTH) || key,
    };
  }

  function getFavorites() {
    return [...favorites.values()];
  }

  function hasFavorite(statement, key) {
    return favorites.has(favoriteId(statement, key));
  }

  function setFavorites(list) {
    favorites.clear();
    list.forEach((raw) => {
      const favorite = normalizeFavorite(raw);
      if (favorite) favorites.set(favoriteId(favorite.statement, favorite.key), favorite);
    });
  }

  function readLocalFavorites() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.map(normalizeFavorite).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function writeLocalFavorites() {
    try {
      const list = getFavorites();
      if (list.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function clearLocalFavorites() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function chartMetricsMap() {
    return window.EmpresaMetricsChart?.chartMetrics ?? window.chartMetrics ?? null;
  }

  /**
   * Resuelve la definición actual de una métrica favorita en los datos de la empresa.
   * @param {{statement: string, key: string}} favorite
   * @returns {Object|null} Ítem con datos para el gráfico.
   */
  function findFavoriteItem(favorite) {
    const statements = window.companyData?.statements ?? {};
    const definition = (statements[favorite.statement] ?? []).find((item) => item.key === favorite.key);
    if (!definition) return null;
    return { ...definition, key: favorite.key, favoriteStatement: favorite.statement };
  }

  function addItemToChart(item) {
    const chartMetrics = chartMetricsMap();
    if (!chartMetrics || !item?.key || chartMetrics.has(item.key)) return;
    chartMetrics.set(item.key, { ...item, key: item.key });
    window.syncChartRowSelection?.();
    window.renderMetricsChart?.();
  }

  function removeItemFromChart(item) {
    if (!item?.key) return;
    const chartMetrics = chartMetricsMap();
    if (!chartMetrics?.has(item.key)) return;
    if (typeof window.removeChartMetric === 'function') {
      window.removeChartMetric(item.key);
    } else {
      chartMetrics.delete(item.key);
      window.syncChartRowSelection?.();
      window.renderMetricsChart?.();
    }
    window.pruneHiddenSeriesForMetric?.(item.key);
  }

  /**
   * Añade al gráfico todas las métricas favoritas que aún no estén visibles.
   */
  function applyFavoritesToChart() {
    const chartMetrics = chartMetricsMap();
    if (!chartMetrics || !window.companyData) return;
    let changed = false;
    favorites.forEach((favorite) => {
      const item = findFavoriteItem(favorite);
      if (item && !chartMetrics.has(item.key)) {
        chartMetrics.set(item.key, { ...item, key: item.key });
        changed = true;
      }
    });
    if (changed) {
      window.syncChartRowSelection?.();
      window.renderMetricsChart?.();
    }
  }

  function favoriteButtonHtml(item, statement) {
    const key = item?.key ?? '';
    const isFavorite = hasFavorite(statement, key);
    const label = escapeHtml(item?.label || key);
    return `<button type="button" class="metric-favorite-btn${isFavorite ? ' is-favorite' : ''}" data-favorite-statement="${escapeHtml(statement)}" data-favorite-key="${escapeHtml(key)}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? 'Quitar' : 'Añadir'} ${label} ${isFavorite ? 'de' : 'a'} favoritos" title="${isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${HEART_SVG}</button>`;
  }

  function updateHeartButtons() {
    document.querySelectorAll('.metric-favorite-btn[data-favorite-key]').forEach((button) => {
      const isFavorite = hasFavorite(button.dataset.favoriteStatement, button.dataset.favoriteKey);
      button.classList.toggle('is-favorite', isFavorite);
      button.setAttribute('aria-pressed', String(isFavorite));
      button.setAttribute('title', isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos');
    });
  }

  function renderFavoritesTabIfActive() {
    if (window.screenerStatement === 'favorites') window.renderScreenerTables?.();
  }

  function refreshUi(item, isFavorite) {
    updateHeartButtons();
    if (isFavorite) addItemToChart(item);
    else removeItemFromChart(item);
    renderFavoritesTabIfActive();
  }

  async function fetchRemoteFavorites() {
    const response = await fetch('/api/metric-favorites');
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const data = await response.json().catch(() => null);
    return Array.isArray(data?.favorites) ? data.favorites : [];
  }

  async function saveRemoteFavorite(favorite) {
    const url = `/api/metric-favorites/${encodeURIComponent(favorite.statement)}/${encodeURIComponent(favorite.key)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: favorite.label }),
    });
    if (!response.ok) throw new Error(`Error ${response.status}`);
  }

  async function removeRemoteFavorite(favorite) {
    const url = `/api/metric-favorites/${encodeURIComponent(favorite.statement)}/${encodeURIComponent(favorite.key)}`;
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw new Error(`Error ${response.status}`);
  }

  async function fetchRemoteHiddenSeries() {
    const response = await fetch('/api/hidden-series');
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const data = await response.json().catch(() => null);
    return Array.isArray(data?.seriesIds) ? data.seriesIds : [];
  }

  async function saveRemoteHiddenSeries(seriesIds) {
    const response = await fetch('/api/hidden-series', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesIds }),
    });
    if (!response.ok) throw new Error(`Error ${response.status}`);
  }

  let hiddenSeriesSyncTimer = null;

  function scheduleHiddenSeriesSync() {
    if (!isAuthenticated()) return;
    clearTimeout(hiddenSeriesSyncTimer);
    hiddenSeriesSyncTimer = setTimeout(() => {
      saveRemoteHiddenSeries([...(window.chartHiddenSeries ?? [])]).catch(() => {});
    }, 500);
  }

  /**
   * Sincroniza las series ocultas con la cuenta: si el servidor no tiene
   * ninguna se conserva el estado local (primer inicio de sesión) y, si tiene,
   * manda la cuenta (evita resucitar series ya mostradas en otro dispositivo).
   * @returns {Promise<void>}
   */
  async function syncHiddenSeries() {
    if (!isAuthenticated()) return;
    const localHidden = [...(window.chartHiddenSeries ?? [])];
    try {
      const remoteHidden = await fetchRemoteHiddenSeries();
      if (!remoteHidden.length && localHidden.length) {
        await saveRemoteHiddenSeries(localHidden);
        return;
      }
      window.replaceHiddenSeries?.(remoteHidden);
    } catch {}
  }

  /**
   * Alterna el estado de favorito de una métrica y lo persiste (servidor o dispositivo).
   * @param {Object} item - Definición de la métrica.
   * @param {string} statement - Estado financiero al que pertenece.
   */
  async function toggleFavorite(item, statement) {
    const key = item?.key;
    if (!key || !STATEMENT_ORDER.includes(statement)) return;
    const id = favoriteId(statement, key);
    const wasFavorite = favorites.has(id);
    const favorite = {
      statement,
      key,
      label: String(item?.label ?? key).trim().slice(0, LABEL_MAX_LENGTH) || key,
    };

    if (wasFavorite) favorites.delete(id);
    else favorites.set(id, favorite);
    refreshUi(item, !wasFavorite);

    try {
      if (isAuthenticated()) {
        await (wasFavorite ? removeRemoteFavorite(favorite) : saveRemoteFavorite(favorite));
      } else {
        writeLocalFavorites();
      }
    } catch {
      if (wasFavorite) favorites.set(id, favorite);
      else favorites.delete(id);
      refreshUi(item, wasFavorite);
      window.showToast?.('No se pudieron guardar tus métricas favoritas. Inténtalo de nuevo.');
    }
  }

  /**
   * Carga las métricas favoritas (del servidor si hay sesión; si no, del dispositivo)
   * y las añade al gráfico.
   * @returns {Promise<void>}
   */
  async function loadFavorites() {
    const localFavorites = readLocalFavorites();
    if (isAuthenticated()) {
      try {
        if (localFavorites.length) {
          await Promise.all(localFavorites.map((favorite) => saveRemoteFavorite(favorite).catch(() => null)));
          clearLocalFavorites();
        }
        setFavorites(await fetchRemoteFavorites());
      } catch {
        setFavorites(localFavorites);
      }
      await syncHiddenSeries();
    } else {
      setFavorites(localFavorites);
    }
    updateHeartButtons();
    applyFavoritesToChart();
    renderFavoritesTabIfActive();
  }

  /**
   * Construye la lista de ítems de la pestaña Favoritos, agrupados por estado financiero.
   * @param {Object} [statements] - Estados financieros de la empresa.
   * @returns {Array<Object>} Ítems listos para la tabla.
   */
  function buildFavoriteItems(statements = window.companyData?.statements ?? {}) {
    const items = [];
    STATEMENT_ORDER.forEach((statement) => {
      const stored = getFavorites().filter((favorite) => favorite.statement === statement);
      if (!stored.length) return;
      const definitions = statements?.[statement] ?? [];
      const rows = stored
        .map((favorite) => {
          const definition = definitions.find((item) => item.key === favorite.key);
          if (!definition) return null;
          return { ...definition, key: favorite.key, favoriteStatement: statement };
        })
        .filter(Boolean);
      if (!rows.length) return;
      items.push({ kind: 'section', label: STATEMENT_LABELS[statement] });
      items.push(...rows);
    });
    if (!items.length) {
      items.push({
        kind: 'note',
        label: 'Aún no tienes métricas favoritas. Pulsa el corazón de cualquier fila para guardarla aquí y verla en el gráfico.',
      });
    }
    return items;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFavoritesAuthListener);
  } else {
    initFavoritesAuthListener();
  }

  function initFavoritesAuthListener() {
    window.addEventListener('auth:change', () => {
      if (window.companyData) loadFavorites().catch(() => {});
    });
    window.addEventListener('chart:hidden-series-change', scheduleHiddenSeriesSync);
  }

  const EmpresaFavoriteMetrics = {
    loadFavorites,
    toggleFavorite,
    buildFavoriteItems,
    favoriteButtonHtml,
    updateHeartButtons,
    applyFavoritesToChart,
    isFavorite: hasFavorite,
    getFavorites,
  };

  window.EmpresaFavoriteMetrics = EmpresaFavoriteMetrics;
  window.loadFavoriteMetrics = loadFavorites;
  window.toggleFavoriteMetric = toggleFavorite;
  window.buildFavoriteItems = buildFavoriteItems;
  window.favoriteButtonHtml = favoriteButtonHtml;
  window.updateHeartButtons = updateHeartButtons;
})(window);
