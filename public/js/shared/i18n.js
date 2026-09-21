/**
 * @fileoverview Motor de internacionalización de la interfaz de Cifra.
 * Traduce la interfaz completa (texto estático y dinámico) usando diccionarios
 * cuya clave es el texto fuente en español (estilo gettext). Añadir un idioma
 * nuevo consiste en dejar un fichero `public/locales/<codigo>.json` con el mapa
 * español → idioma; no hay que tocar el código.
 * @module I18n
 */

(function (window, document) {
  'use strict';

  const DEFAULT_LANGUAGE = 'es';
  const SUPPORTED_LANGUAGES = ['es', 'en'];
  const LANGUAGE_STORAGE_KEY = 'cifra_language';
  const ANALYSIS_LANGUAGE_STORAGE_KEY = 'cifra_analysis_language';
  const DICTIONARY_VERSION = '10';
  const SKIP_SELECTOR = '[data-i18n-skip],script,style,noscript,textarea,pre,code[data-i18n-skip],[contenteditable="true"]';
  const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];

  const SPANISH_OFFICIAL_COUNTRIES = [
    'ES', 'MX', 'CO', 'AR', 'PE', 'VE', 'CL', 'GT', 'EC', 'BO',
    'CU', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'GQ', 'PR',
  ];

  const SPANISH_OFFICIAL_TIMEZONES = new Set([
    'Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta',
    'America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey',
    'America/Mazatlan', 'America/Chihuahua', 'America/Hermosillo', 'America/Tijuana',
    'America/Bahia_Banderas', 'America/Matamoros', 'America/Ojinaga',
    'America/Bogota',
    'America/Buenos_Aires', 'America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba',
    'America/Argentina/Salta', 'America/Argentina/Jujuy', 'America/Argentina/Tucuman',
    'America/Argentina/Catamarca', 'America/Argentina/La_Rioja', 'America/Argentina/San_Juan',
    'America/Argentina/Mendoza', 'America/Argentina/San_Luis', 'America/Argentina/Rio_Gallegos',
    'America/Argentina/Ushuaia', 'America/Rosario', 'America/Cordoba',
    'America/Lima',
    'America/Caracas',
    'America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter',
    'America/Guatemala',
    'America/Guayaquil', 'Pacific/Galapagos',
    'America/La_Paz',
    'America/Havana',
    'America/Santo_Domingo',
    'America/Tegucigalpa',
    'America/Asuncion',
    'America/El_Salvador',
    'America/Managua',
    'America/Costa_Rica',
    'America/Panama',
    'America/Montevideo',
    'Africa/Malabo',
    'America/Puerto_Rico',
  ]);

  let language = DEFAULT_LANGUAGE;
  let dictionary = {};
  let reverseDictionary = {};
  let lowerDictionary = new Map();
  let lowerReverseDictionary = new Map();
  let compiledPatterns = [];
  let compiledReversePatterns = [];
  let initialized = false;
  let applying = false;
  let observer = null;
  let pendingNodes = new Set();
  let flushScheduled = false;
  const languageCaches = new Map();
  const loadingLanguages = new Map();

  function updateLowerDictionaries() {
    lowerDictionary = new Map();
    for (const [k, v] of Object.entries(dictionary)) {
      const lk = k.toLowerCase();
      if (!lowerDictionary.has(lk)) lowerDictionary.set(lk, v);
    }
    lowerReverseDictionary = new Map();
    for (const [k, v] of Object.entries(reverseDictionary)) {
      const lk = k.toLowerCase();
      if (!lowerReverseDictionary.has(lk)) lowerReverseDictionary.set(lk, v);
    }
    compiledReversePatterns = compilePatterns(reverseDictionary);
  }

  /**
   * Construye un mapa insensible a mayúsculas de un diccionario.
   * @param {Object<string,string>} dict
   * @returns {Map<string,string>}
   */
  function buildLowerLookup(dict) {
    const map = new Map();
    for (const [key, value] of Object.entries(dict)) {
      const lower = key.toLowerCase();
      if (!map.has(lower)) map.set(lower, value);
    }
    return map;
  }

  /**
   * Guarda (y precompila) el diccionario de un idioma en la caché.
   * @param {string} lang
   * @param {Object<string,string>} dict
   */
  function cacheLanguageDictionary(lang, dict) {
    const target = normalizeLanguage(lang);
    if (target === DEFAULT_LANGUAGE) return;
    const reverse = buildReverseDictionary(dict);
    languageCaches.set(target, {
      dictionary: dict,
      reverse,
      lower: buildLowerLookup(dict),
      lowerReverse: buildLowerLookup(reverse),
      patterns: compilePatterns(dict),
      reversePatterns: compilePatterns(reverse),
    });
  }

  /**
   * Garantiza que el diccionario de un idioma esté cargado en la caché, sin
   * cambiar el idioma activo de la interfaz. Lo usan los informes traducidos:
   * el contenido del informe se pinta en su idioma y el resto de la web en el
   * idioma de la interfaz.
   * @param {string} lang
   * @returns {Promise<string>}
   */
  async function ensureLanguage(lang) {
    const target = normalizeLanguage(lang);
    if (target === DEFAULT_LANGUAGE || languageCaches.has(target)) return target;
    if (!loadingLanguages.has(target)) {
      const promise = loadDictionary(target)
        .then((dict) => {
          cacheLanguageDictionary(target, dict);
          return target;
        })
        .catch(() => {
          cacheLanguageDictionary(target, {});
          return target;
        });
      loadingLanguages.set(target, promise);
    }
    await loadingLanguages.get(target);
    return target;
  }

  /**
   * ¿Está ya disponible el diccionario de un idioma?
   * @param {string} lang
   * @returns {boolean}
   */
  function hasLanguage(lang) {
    const target = normalizeLanguage(lang);
    return target === DEFAULT_LANGUAGE || languageCaches.has(target);
  }

  /**
   * Normaliza un código de idioma al conjunto soportado.
   * @param {string} code
   * @returns {string}
   */
  function normalizeLanguage(code) {
    const clean = String(code || '').trim().toLowerCase();
    if (!clean) return DEFAULT_LANGUAGE;
    if (SUPPORTED_LANGUAGES.includes(clean)) return clean;
    const base = clean.split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
  }

  /**
   * Detecta el idioma inicial:
   * 1. Inyección explícita del servidor (window.__CIFRA_LANGUAGE__).
   * 2. Ruta /en en la URL.
   * 3. Preferencia guardada explícita.
   * 4. Si el país del usuario no tiene el español como oficial, el idioma prioritario es inglés.
   * @returns {string}
   */
  function detectInitialLanguage() {
    if (typeof window !== 'undefined' && window.__CIFRA_LANGUAGE__) {
      return normalizeLanguage(window.__CIFRA_LANGUAGE__);
    }

    if (window.location && (window.location.pathname === '/en' || window.location.pathname.startsWith('/en/'))) {
      return 'en';
    }

    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored) return normalizeLanguage(stored);
      const appearance = JSON.parse(window.localStorage.getItem('cifra-appearance') || '{}');
      if (appearance?.language) return normalizeLanguage(appearance.language);
    } catch {
      // Sin almacenamiento disponible
    }

    const navigatorLanguages = Array.isArray(window.navigator?.languages) && window.navigator.languages.length
      ? window.navigator.languages
      : [window.navigator?.language];

    for (const candidate of navigatorLanguages) {
      if (!candidate) continue;
      const clean = String(candidate).trim();
      const parts = clean.split(/[-_]/);
      const lang = parts[0].toLowerCase();
      const region = parts[1] ? parts[1].toUpperCase() : null;

      if (lang === 'en') return 'en';
      if (region && !SPANISH_OFFICIAL_COUNTRIES.includes(region)) {
        return 'en';
      }
      if (lang === 'es' && (!region || SPANISH_OFFICIAL_COUNTRIES.includes(region))) {
        return 'es';
      }
      if (lang !== 'es') {
        return 'en';
      }
    }

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && !SPANISH_OFFICIAL_TIMEZONES.has(tz)) {
        return 'en';
      }
    } catch {
      // Sin soporte de zona horaria
    }

    return DEFAULT_LANGUAGE;
  }

  /**
   * Carga el diccionario de un idioma (el español es el idioma fuente).
   * @param {string} lang
   * @returns {Promise<Object>}
   */
  async function loadDictionary(lang) {
    if (normalizeLanguage(lang) === DEFAULT_LANGUAGE) return {};
    try {
      const response = await fetch(`/locales/${normalizeLanguage(lang)}.json?v=${DICTIONARY_VERSION}`);
      if (!response.ok) return {};
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') return {};
      const normalized = {};
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value !== 'string') continue;
        normalized[String(key).trim()] = value.trim();
      }
      return normalized;
    } catch {
      return {};
    }
  }

  /**
   * Construye el diccionario inverso (idioma → español) para poder volver al idioma fuente.
   * @param {Object} dict
   * @returns {Object}
   */
  function buildReverseDictionary(dict) {
    const reverse = {};
    for (const [source, target] of Object.entries(dict)) {
      if (typeof target === 'string' && !(target in reverse)) reverse[target] = source;
    }
    return reverse;
  }

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Compila los patrones de las plantillas con marcadores `{0}`, `{1}`... para poder
   * traducir textos generados con interpolación sin tocar el código que los crea.
   * @param {Object} map - Diccionario origen → destino.
   * @returns {Array<{ regex: RegExp, target: string, len: number }>}
   */
  function compilePatterns(map) {
    const list = [];
    for (const [source, target] of Object.entries(map)) {
      if (typeof source !== 'string' || typeof target !== 'string') continue;
      if (!/\{\d+\}/.test(source)) continue;
      const escaped = escapeRegex(source).replace(/\\\{(\d+)\\\}/g, '(.+?)');
      let regex;
      try {
        regex = new RegExp(`^${escaped}$`, 'i');
      } catch {
        continue;
      }
      list.push({ regex, target, len: source.length });
    }
    list.sort((a, b) => b.len - a.len);
    return list;
  }

  /**
   * Traduce un texto interpolado probando los patrones del diccionario activo.
   * @param {string} text
   * @returns {string|null}
   */
  function translatePattern(text) {
    return translatePatternFrom(compiledPatterns, text);
  }

  /**
   * Traduce un texto interpolado probando una lista de patrones concreta.
   * @param {Array<{ regex: RegExp, target: string }>} patterns
   * @param {string} text
   * @returns {string|null}
   */
  function translatePatternFrom(patterns, text) {
    const clean = String(text ?? '').trim();
    if (!clean || !Array.isArray(patterns) || !patterns.length) return null;
    for (let i = 0; i < patterns.length; i++) {
      const entry = patterns[i];
      const match = clean.match(entry.regex);
      if (match) {
        return entry.target.replace(/\{(\d+)\}/g, (_, idx) => match[Number(idx) + 1] ?? '');
      }
    }
    return null;
  }

  /**
   * Interpola parámetros `{clave}` en un texto.
   * @param {string} text
   * @param {Object} [params]
   * @returns {string}
   */
  function interpolate(text, params) {
    if (!params || text == null) return text;
    return String(text).replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
    ));
  }

  /**
   * Traduce un texto exacto usando el diccionario del idioma activo (o el inverso
   * cuando se vuelve al idioma fuente). Si no hay traducción devuelve el original.
   * @param {string} text
   * @param {Object} [params]
   * @returns {string}
   */
  function t(text, params) {
    if (text == null) return text;
    const key = String(text);
    if (key.trim().toLowerCase() === 'cifra') return key;
    if (language !== DEFAULT_LANGUAGE) {
      let translated = dictionary[key];
      if (translated == null) {
        const lowerVal = lowerDictionary.get(key.toLowerCase());
        if (lowerVal != null) {
          if (key.length > 1 && key === key.toUpperCase() && key !== key.toLowerCase()) {
            translated = lowerVal.toUpperCase();
          } else {
            translated = lowerVal;
          }
        }
      }
      return interpolate(translated != null ? translated : key, params);
    }
    let restored = reverseDictionary[key];
    if (restored == null) {
      const lowerVal = lowerReverseDictionary.get(key.toLowerCase());
      if (lowerVal != null) {
        if (key.length > 1 && key === key.toUpperCase() && key !== key.toLowerCase()) {
          restored = lowerVal.toUpperCase();
        } else {
          restored = lowerVal;
        }
      }
    }
    return interpolate(restored != null ? restored : key, params);
  }

  /**
   * Traduce un texto con elección de forma singular/plural según la cantidad.
   * @param {number} count
   * @param {string} one - Texto en singular (fuente en español, admite {n}).
   * @param {string} other - Texto en plural (fuente en español, admite {n}).
   * @param {Object} [params]
   * @returns {string}
   */
  function tp(count, one, other, params) {
    const isSingular = language === 'en' ? Number(count) === 1 : Number(count) === 1;
    return t(isSingular ? one : other, { n: count, ...(params || {}) });
  }

  /**
   * Busca una traducción exacta o insensible a mayúsculas preservando el formato
   * en mayúsculas cuando el original estaba en mayúsculas completas.
   * @param {Object<string,string>} dict
   * @param {Map<string,string>} lower
   * @param {string} key
   * @returns {string|null}
   */
  function lookupWithPreservedCase(dict, lower, key) {
    const direct = dict[key];
    if (direct != null) return direct;
    const lowerVal = lower.get(key.toLowerCase());
    if (lowerVal == null) return null;
    if (key.length > 1 && key === key.toUpperCase() && key !== key.toLowerCase()) {
      return lowerVal.toUpperCase();
    }
    return lowerVal;
  }

  /**
   * Restaura al español un texto escrito en otro idioma usando cualquier
   * diccionario inverso disponible.
   * @param {string} key
   * @returns {string|null}
   */
  function reverseLookupAnyLanguage(key) {
    if (language !== DEFAULT_LANGUAGE) {
      const hit = lookupWithPreservedCase(reverseDictionary, lowerReverseDictionary, key)
        ?? translatePatternFrom(compiledReversePatterns, key);
      if (hit != null) return hit;
    }
    for (const data of languageCaches.values()) {
      const hit = lookupWithPreservedCase(data.reverse, data.lowerReverse, key)
        ?? translatePatternFrom(data.reversePatterns, key);
      if (hit != null) return hit;
    }
    return null;
  }

  /**
   * Traduce un texto con el diccionario de un idioma concreto, distinto del activo.
   * Sirve para pintar el contenido de un informe en su propio idioma aunque la
   * interfaz de la web esté en otro. El español usa el diccionario inverso.
   * @param {string} text
   * @param {Object} [params]
   * @param {string} [lang] - Idioma destino; por defecto, el de la interfaz.
   * @returns {string}
   */
  function tIn(text, params, lang) {
    if (text == null) return text;
    const key = String(text);
    if (key.trim().toLowerCase() === 'cifra') return key;
    const target = normalizeLanguage(lang || language);
    if (target === language) return t(key, params);
    if (target === DEFAULT_LANGUAGE) {
      const restored = reverseLookupAnyLanguage(key);
      return interpolate(restored != null ? restored : key, params);
    }
    const data = languageCaches.get(target);
    if (!data) return t(key, params);
    const translated = lookupWithPreservedCase(data.dictionary, data.lower, key)
      ?? translatePatternFrom(data.patterns, key);
    return interpolate(translated != null ? translated : key, params);
  }

  /**
   * Traduce todos los nodos de texto y atributos traducibles de un árbol.
   * @param {Node} [root]
   */
  function apply(root) {
    const scope = root || document;
    if (!initialized || !scope) return;
    applying = true;
    try {
      translateAttributes(scope);
      const walker = document.createTreeWalker(scope, window.NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return window.NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || parent.closest(SKIP_SELECTOR)) return window.NodeFilter.FILTER_REJECT;
          return window.NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(translateTextNode);
    } finally {
      applying = false;
    }
  }

  /**
   * Idioma forzado para el contenido de un informe traducido. Los nodos dentro
   * de un contenedor con `data-report-language` se pintan en el idioma del
   * informe, no en el de la interfaz.
   * @param {Node} node
   * @returns {string|null}
   */
  function renderLanguageFor(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element || typeof element.closest !== 'function') return null;
    const container = element.closest('[data-report-language]');
    if (!container) return null;
    const raw = container.getAttribute('data-report-language');
    if (!raw) return null;
    const target = normalizeLanguage(raw);
    return target === language ? null : target;
  }

  /**
   * Traduce un texto con `tIn` si hay idioma de informe forzado, o con el
   * diccionario activo y sus plantillas en caso contrario.
   * @param {string} text
   * @param {string|null} override
   * @returns {string}
   */
  function translateNodeText(text, override) {
    if (override) return tIn(text, null, override);
    const direct = t(text);
    if (direct !== text) return direct;
    const patterned = translatePattern(text);
    return patterned != null ? patterned : text;
  }

  /**
   * Traduce un nodo de texto si su contenido exacto existe en el diccionario,
   * o si coincide con una plantilla interpolada conocida. Los nodos multilínea
   * se buscan con los espacios internos colapsados, igual que el extractor.
   * @param {Text} node
   */
  function translateTextNode(node) {
    const raw = node.nodeValue;
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'cifra') return;
    const override = renderLanguageFor(node);
    const collapsed = trimmed.replace(/\s+/g, ' ');
    let translated = translateNodeText(collapsed, override);
    if (translated === collapsed && collapsed !== trimmed) translated = translateNodeText(trimmed, override);
    if (translated !== collapsed) {
      node.nodeValue = raw.replace(trimmed, translated);
      return;
    }
    // Fragmentos con prefijo de viñeta o símbolos («— texto», «• texto», «✓ texto», «⇩ texto», etc.)
    const bullet = trimmed.match(/^([—–\-·•✓✔⇩↓↑→←▲▼⚠️ℹ️🔍≥≤]\s*)(.+)$/);
    if (bullet) {
      const innerText = bullet[2].replace(/\s+/g, ' ');
      let inner = translateNodeText(innerText, override);
      if (inner === innerText) inner = translateNodeText(bullet[2], override);
      if (inner !== innerText) {
        node.nodeValue = raw.replace(trimmed, bullet[1] + inner);
      }
    }
  }

  /**
   * Traduce atributos traducibles (placeholder, title, aria-label, alt) del árbol.
   * @param {Node} scope
   */
  function translateAttributes(scope) {
    const element = scope.nodeType === 1 ? scope : scope.parentElement;
    const root = element || document;
    const process = (el) => {
      if (el.closest && el.closest(SKIP_SELECTOR)) return;
      const override = renderLanguageFor(el);
      TRANSLATABLE_ATTRIBUTES.forEach((attr) => {
        const value = el.getAttribute && el.getAttribute(attr);
        if (!value || !value.trim()) return;
        if (value.trim().toLowerCase() === 'cifra') return;
        const translated = translateNodeText(value.trim(), override);
        if (translated !== value.trim()) el.setAttribute(attr, translated);
      });
    };
    if (root.matches && root.matches(TRANSLATABLE_ATTRIBUTES.map((a) => `[${a}]`).join(','))) process(root);
    root.querySelectorAll?.(TRANSLATABLE_ATTRIBUTES.map((a) => `[${a}]`).join(',')).forEach(process);
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    window.requestAnimationFrame(() => {
      flushScheduled = false;
      const nodes = [...pendingNodes];
      pendingNodes = new Set();
      applying = true;
      try {
        nodes.forEach((node) => {
          if (!node.isConnected) return;
          if (node.nodeType === 3) translateTextNode(node);
          else apply(node);
        });
      } finally {
        applying = false;
      }
    });
  }

  /**
   * Observa el DOM para traducir cualquier nodo generado dinámicamente.
   */
  function observe() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver((mutations) => {
      if (applying) return;
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          pendingNodes.add(mutation.target);
          return;
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 3 || node.nodeType === 1) pendingNodes.add(node);
        });
      });
      if (pendingNodes.size) scheduleFlush();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  /**
   * Cambia el idioma activo, recarga el diccionario y re-traduce la página.
   * @param {string} nextLanguage
   * @param {{ persist?: boolean, reason?: string }} [options]
   * @returns {Promise<string>} Idioma efectivo.
   */
  async function setLanguage(nextLanguage, options = {}) {
    const target = normalizeLanguage(nextLanguage);
    const { persist = true, reason = 'manual' } = options;
    if (target !== DEFAULT_LANGUAGE) {
      if (!Object.keys(dictionary).length || language !== target) {
        await ensureLanguage(target);
        const data = languageCaches.get(target) ?? { dictionary: {}, reverse: {} };
        dictionary = data.dictionary;
        reverseDictionary = data.reverse;
        updateLowerDictionaries();
      }
      compiledPatterns = compilePatterns(dictionary);
    } else {
      compiledPatterns = compilePatterns(reverseDictionary);
    }
    language = target;
    window.__CIFRA_LANGUAGE__ = target;
    document.documentElement.setAttribute('lang', target);
    if (persist) {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, target);
      } catch {
        // Sin almacenamiento disponible
      }
    }
    apply(document);
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { language: target, reason } }));
    return target;
  }

  /**
   * Idioma guardado para los análisis (independiente del idioma de la interfaz).
   * @returns {string}
   */
  function getAnalysisLanguage() {
    try {
      const stored = window.localStorage.getItem(ANALYSIS_LANGUAGE_STORAGE_KEY);
      if (stored) return normalizeLanguage(stored);
    } catch {
      // Sin almacenamiento disponible
    }
    return language;
  }

  /**
   * Guarda el idioma elegido para generar los análisis.
   * @param {string} lang
   * @param {{ persist?: boolean }} [options]
   */
  function setAnalysisLanguage(lang, options = {}) {
    const target = normalizeLanguage(lang);
    window.__CIFRA_ANALYSIS_LANGUAGE__ = target;
    if (options.persist === false) return target;
    try {
      window.localStorage.setItem(ANALYSIS_LANGUAGE_STORAGE_KEY, target);
    } catch {
      // Sin almacenamiento disponible
    }
    window.dispatchEvent(new CustomEvent('analysis-language:change', { detail: { language: target } }));
    return target;
  }

  function localeFor(lang) {
    return normalizeLanguage(lang) === 'en' ? 'en-US' : 'es-ES';
  }

  /**
   * Devuelve el nombre corto del mes localizado («Ene»/«Jan») para los ejes de gráficos.
   * @param {number} monthIndex - Mes 0-11.
   * @param {string} [lang] - Idioma opcional.
   * @returns {string}
   */
  function shortMonth(monthIndex, lang) {
    const idx = Number(monthIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 11) return '';
    const label = new Intl.DateTimeFormat(localeFor(lang || language), { month: 'short' })
      .format(new Date(Date.UTC(2021, idx, 15)))
      .replace('.', '');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /**
   * Formatea un número con la configuración regional del idioma activo.
   * @param {number} value
   * @param {Intl.NumberFormatOptions} [options]
   * @param {string} [lang]
   * @returns {string}
   */
  function formatNumber(value, options, lang) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat(localeFor(lang || language), options).format(number);
  }

  /**
   * Formatea un porcentaje con signo y el idioma indicado.
   * @param {number} value - Valor ya en porcentaje (15.5 = 15,5 %).
   * @param {{ digits?: number, signed?: boolean, lang?: string }} [options]
   * @returns {string}
   */
  function formatPercent(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    const digits = Number.isInteger(options.digits) ? options.digits : 2;
    const formatted = new Intl.NumberFormat(localeFor(options.lang || language), {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(number);
    const sign = options.signed !== false && number > 0 ? '+' : '';
    return `${sign}${formatted} %`;
  }

  /**
   * Formatea una fecha con el idioma activo (o el indicado).
   * @param {string|number|Date} value
   * @param {Intl.DateTimeFormatOptions} [options]
   * @param {string} [lang]
   * @returns {string}
   */
  function formatDate(value, options, lang) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(localeFor(lang || language), options || { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  /**
   * Formatea un importe en dólares con el idioma activo.
   * @param {number} value
   * @param {{ digits?: number, lang?: string }} [options]
   * @returns {string}
   */
  function formatCurrency(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    const digits = Number.isInteger(options.digits) ? options.digits : 2;
    return new Intl.NumberFormat(localeFor(options.lang || language), {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(number);
  }

  /**
   * Inicializa el motor: detecta idioma, carga el diccionario y traduce la página.
   * @returns {Promise<string>}
   */
  async function init() {
    if (initialized) return language;
    language = detectInitialLanguage();
    window.__CIFRA_LANGUAGE__ = language;
    document.documentElement.setAttribute('lang', language);
    if (language !== DEFAULT_LANGUAGE) {
      await ensureLanguage(language);
      const data = languageCaches.get(language) ?? { dictionary: {}, reverse: {} };
      dictionary = data.dictionary;
      reverseDictionary = data.reverse;
      updateLowerDictionaries();
      compiledPatterns = compilePatterns(dictionary);
    }
    initialized = true;
    apply(document);
    observe();
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { language, reason: 'init' } }));
    return language;
  }

  function whenReady(callback) {
    if (initialized) {
      callback(language);
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { init().then(callback); }, { once: true });
    } else {
      init().then(callback);
    }
  }

  window.addEventListener('settings:preview', (event) => {
    const prefs = event.detail;
    if (prefs?.language) setLanguage(prefs.language, { persist: false, reason: 'preview' });
  });

  window.addEventListener('settings:change', (event) => {
    const prefs = event.detail?.preferences;
    if (!prefs) return;
    if (prefs.analysisLanguage) setAnalysisLanguage(prefs.analysisLanguage);
    if (prefs.language) setLanguage(prefs.language, { reason: 'settings' });
  });

  window.I18n = {
    init,
    whenReady,
    t,
    tIn,
    tp,
    apply,
    setLanguage,
    ensureLanguage,
    hasLanguage,
    getLanguage: () => language,
    getAnalysisLanguage,
    setAnalysisLanguage,
    normalizeLanguage,
    localeFor,
    shortMonth,
    formatNumber,
    formatPercent,
    formatDate,
    formatCurrency,
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
  };

  whenReady(() => {});
})(window, document);
