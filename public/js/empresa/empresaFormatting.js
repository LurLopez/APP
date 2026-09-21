/**
 * @file empresaFormatting.js
 * @description Utilidades de formateo numérico, monetario, fechas y SEO para la vista de empresa.
 */

(function (window) {
  'use strict';

  const SEO_LOWER_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'y', 'of', 'the', 'and']);

  /**
   * Configuración regional activa según el idioma de la interfaz.
   * @returns {string}
   */
  function activeLocale() {
    return window.I18n?.getLanguage?.() === 'en' ? 'en-US' : 'es-ES';
  }

  /**
   * Formatea un número según la configuración regional activa.
   * @param {number|string|null} value
   * @param {number} [digits=2]
   * @returns {string}
   */
  function formatProfileNumber(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));
  }

  /**
   * Formatea un precio en dólares estadounidenses.
   * @param {number|string|null} value
   * @returns {string}
   */
  function formatProfilePrice(value) {
    return value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : `${formatProfileNumber(value)} $`;
  }

  /**
   * Formatea un valor monetario compacto (K, M, B) en dólares.
   * @param {number|string|null} value
   * @returns {string}
   */
  function formatProfileCompactUsd(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const absolute = Math.abs(Number(value));
    const units = absolute >= 1e9 ? [1e9, 'B'] : absolute >= 1e6 ? [1e6, 'M'] : absolute >= 1e3 ? [1e3, 'K'] : [1, ''];
    const formatted = formatProfileNumber(absolute / units[0], units[1] ? 2 : 0);
    return `${Number(value) < 0 ? '−' : ''}${formatted} ${units[1]} $`.replace('  $', ' $');
  }

  /**
   * Formatea un conteo compacto (K, M, B).
   * @param {number|string|null} value
   * @returns {string}
   */
  function formatProfileCompactCount(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const absolute = Math.abs(Number(value));
    const units = absolute >= 1e9 ? [1e9, 'B'] : absolute >= 1e6 ? [1e6, 'M'] : absolute >= 1e3 ? [1e3, 'K'] : [1, ''];
    const formatted = formatProfileNumber(absolute / units[0], units[1] ? 2 : 0);
    return `${Number(value) < 0 ? '−' : ''}${formatted} ${units[1]}`.trim();
  }

  /**
   * Formatea un porcentaje con signo opcional.
   * @param {number|string|null} value
   * @param {boolean} [signed=false]
   * @returns {string}
   */
  function formatProfilePercent(value, signed = false) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const number = Number(value);
    const prefix = signed && number > 0 ? '+' : number < 0 ? '−' : '';
    return `${prefix}${formatProfileNumber(Math.abs(number), 2)} %`;
  }

  /**
   * Formatea un múltiplo de valoración (ej: 15.2x).
   * @param {number|string|null} value
   * @param {number} [digits=2]
   * @returns {string}
   */
  function formatMultiple(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const number = Number(value);
    const prefix = number < 0 ? '−' : '';
    return `${prefix}${formatProfileNumber(Math.abs(number), digits)}x`;
  }

  /**
   * Formatea una fecha ISO a formato es-ES.
   * @param {string|null} value
   * @returns {string}
   */
  function formatProfileDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    if (window.I18n?.formatDate) return window.I18n.formatDate(date);
    return date.toLocaleDateString('es-ES');
  }

  /**
   * Formatea millones de dólares para estados financieros.
   * @param {number|string|null} value
   * @param {number} [precision]
   * @returns {string}
   */
  function formatMoneyUsd(value, precision = (window.screenerPrecision ?? 2)) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const num = Number(value) / 1e6;
    const formatter = new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: precision, maximumFractionDigits: precision });
    const formatted = formatter.format(Math.abs(num));
    return num < 0 ? `(${formatted})` : formatted;
  }

  /**
   * Formatea el Beneficio Por Acción (BPA / EPS).
   * @param {number|string|null} value
   * @param {number} [precision]
   * @returns {string}
   */
  function formatEps(value, precision = (window.screenerPrecision ?? 2)) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const formatter = new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: precision, maximumFractionDigits: precision });
    return `${formatter.format(Number(value))} $`;
  }

  /**
   * Formatea millones de acciones en circulación.
   * @param {number|string|null} value
   * @param {number} [precision]
   * @returns {string}
   */
  function formatShares(value, precision = (window.screenerPrecision ?? 2)) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const formatter = new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: precision, maximumFractionDigits: precision });
    return formatter.format(Number(value) / 1e6);
  }

  /**
   * Formatea un conteo con precisión adaptable.
   * @param {number|string|null} value
   * @param {number} [precision]
   * @returns {string}
   */
  function formatCount(value, precision = (window.screenerPrecision ?? 2)) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const formatter = new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: precision });
    return formatter.format(Number(value));
  }

  /**
   * Formatea un porcentaje financiero.
   * @param {number|string|null} value
   * @param {number} [precision]
   * @returns {string}
   */
  function formatPercentage(value, precision = (window.screenerPrecision ?? 2)) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const num = Number(value);
    const digits = precision === 0 ? 0 : 1;
    const formatter = new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${num < 0 ? `(${formatter.format(Math.abs(num))})` : formatter.format(num)} %`;
  }

  /**
   * Genera la etiqueta de un periodo (ej: 2023 (FY) o Q3 2023).
   * @param {string} period
   * @returns {string}
   */
  function periodLabel(period) {
    if (!period) return '—';
    if (/^\d{4}$/.test(period)) return `${period} (FY)`;
    const [year, quarter] = period.split('-Q');
    return `Q${quarter} ${year}`;
  }

  /**
   * Etiqueta de fecha o periodo para filas financieras.
   * @param {Object} row
   * @returns {string}
   */
  function periodDateLabel(row) {
    if (!row?.periodEnd) return periodLabel(row?.period);
    const date = new Date(`${row.periodEnd}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return periodLabel(row.period);
    return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${String(date.getUTCFullYear()).slice(-2)}`;
  }

  /**
   * Convierte un nombre corporativo a formato Title Case respetando artículos.
   * @param {string} name
   * @returns {string}
   */
  function seoTitleCase(name) {
    const words = String(name ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    return words
      .map((word, index) => {
        if (index > 0 && SEO_LOWER_WORDS.has(word)) return word;
        return word.split(/(-)/).map((part) => (part === '-' ? part : part.charAt(0).toUpperCase() + part.slice(1))).join('');
      })
      .join(' ');
  }

  /**
   * Actualiza una meta etiqueta en el documento HTML.
   * @param {string} tag
   * @param {string} attribute
   * @param {string} value
   */
  function setSeoMeta(tag, attribute, value) {
    if (tag === 'title') {
      document.title = value;
      return;
    }
    const selector = attribute === 'property' ? `meta[property="${tag}"]` : `meta[name="${tag}"]`;
    const element = document.head.querySelector(selector);
    if (element) element.setAttribute('content', value);
  }

  /**
   * Actualiza el SEO de la página con los datos de la empresa.
   * @param {Object} data
   * @param {string} defaultTicker
   */
  function updateCompanySeoMeta(data, defaultTicker = '') {
    const isEn = window.I18n?.getLanguage?.() === 'en' || window.location.pathname === '/en' || window.location.pathname.startsWith('/en/');
    const landingPath = window.location.pathname === '/' || window.location.pathname === '/empresa' || window.location.pathname === '/en' || window.location.pathname === '/en/empresa';
    const hasTickerQuery = new URLSearchParams(window.location.search).has('ticker');
    if (landingPath && !hasTickerQuery) return;

    const company = data?.company ?? {};
    const info = data?.profile?.info ?? {};
    const ticker = company.ticker ?? defaultTicker;
    const rawName = company.name ?? ticker;
    const name = seoTitleCase(rawName);

    let title, description, url;
    if (isEn) {
      let sec = info.sector && info.sector !== '—' ? info.sector.toLowerCase() : '';
      if (sec.includes('consumo defensivo')) sec = 'consumer defensive';
      if (sec.includes('consumo discrecional')) sec = 'consumer discretionary';
      const sectorPart = sec ? ` in the ${sec} sector` : '';
      const exchangePart = info.exchange ? ` Listed on ${info.exchange}.` : '';
      title = `${ticker} (${name}) — 10-Q & 10-K SEC Filings, Analysis | Cifra`;
      description = `Financial profile and analysis of ${name}${sectorPart}: SEC 10-Q and 10-K filings, with AI analysis of revenue, free cash flow and capital allocation.${exchangePart}`;
      url = new URL(`/en/empresa/${encodeURIComponent(ticker)}`, window.location.origin).toString();
    } else {
      const sectorPart = info.sector && info.sector !== '—' ? ` del sector ${info.sector.toLowerCase()}` : '';
      const exchangePart = info.exchange ? ` Cotiza en ${info.exchange}` : '';
      title = `${ticker} (${name}) — resultados 10-Q y 10-K | Cifra`;
      description = `Perfil y análisis de ${name}${sectorPart}: resultados de sus informes 10-Q y 10-K ante la SEC, con análisis con IA de ventas, flujo de caja libre y asignación de capital.${exchangePart}`;
      url = new URL(`/empresa/${encodeURIComponent(ticker)}`, window.location.origin).toString();
    }

    document.title = title;
    setSeoMeta('description', 'name', description);
    setSeoMeta('og:title', 'property', title);
    setSeoMeta('og:description', 'property', description);
    setSeoMeta('twitter:title', 'name', title);
    setSeoMeta('twitter:description', 'name', description);

    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', url);
    setSeoMeta('og:url', 'property', url);
  }

  const EmpresaFormatting = {
    formatProfileNumber,
    formatProfilePrice,
    formatProfileCompactUsd,
    formatProfileCompactCount,
    formatProfilePercent,
    formatMultiple,
    formatProfileDate,
    formatMoneyUsd,
    formatEps,
    formatShares,
    formatCount,
    formatPercentage,
    periodLabel,
    periodDateLabel,
    seoTitleCase,
    setSeoMeta,
    updateCompanySeoMeta
  };

  window.EmpresaFormatting = EmpresaFormatting;

  // Exportar también en window para compatibilidad directa
  Object.assign(window, EmpresaFormatting);
})(window);
