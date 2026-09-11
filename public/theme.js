/* ── Gestor de Apariencia (tema de color + modo oscuro) ──────── */

const ThemeManager = (() => {
  const STORAGE_KEY = 'cifra-appearance';
  const DEFAULTS = { theme: 'indigo', darkMode: false, language: 'es' };
  let current = { ...DEFAULTS };

  function readCache() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: current.theme, darkMode: current.darkMode, language: current.language }));
    } catch {
      // Sin almacenamiento disponible
    }
  }

  function normalize(prefs = {}) {
    return {
      theme: prefs.theme === 'naranja' ? 'naranja' : 'indigo',
      darkMode: Boolean(prefs.darkMode),
      language: prefs.language === 'en' ? 'en' : 'es',
    };
  }

  function apply(prefs) {
    current = normalize(prefs);
    const root = document.documentElement;
    if (current.theme === 'naranja') {
      root.setAttribute('data-theme', 'naranja');
    } else {
      root.removeAttribute('data-theme');
    }
    if (current.darkMode) {
      root.setAttribute('data-mode', 'dark');
    } else {
      root.removeAttribute('data-mode');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', current.darkMode ? '#0d1014' : (current.theme === 'naranja' ? '#242424' : '#1e293b'));
  }

  function applyAndPersist(prefs) {
    apply(prefs);
    persist();
  }

  window.addEventListener('DOMContentLoaded', () => {
    apply(readCache());
  });

  // Preferencias confirmadas (cargadas del servidor o guardadas desde el modal)
  window.addEventListener('settings:change', (event) => {
    if (event.detail?.preferences) applyAndPersist(event.detail.preferences);
  });

  // Previsualización en vivo desde el modal (no se guarda hasta "Guardar")
  window.addEventListener('settings:preview', (event) => {
    if (event.detail) apply(event.detail);
  });

  return {
    apply,
    getTheme: () => ({ ...current }),
  };
})();
