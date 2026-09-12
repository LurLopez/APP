/* ── Banner de consentimiento de cookies (Consent Mode v2) ───────────────── */

(function () {
  'use strict';

  var STORAGE_KEY = 'cifra_cookie_consent_v1';
  var BANNER_ID = 'cifra-cookie-banner';

  function readConsent() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function saveConsent(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      /* almacenamiento no disponible */
    }
  }

  function updateGtagConsent(value) {
    if (typeof window.gtag !== 'function') return;
    var granted = value === 'granted';
    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: granted ? 'granted' : 'denied',
    });
  }

  function removeBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
  }

  function showBanner() {
    if (document.getElementById(BANNER_ID)) return;

    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-label', 'Preferencias de cookies');
    banner.style.cssText = [
      'position:fixed',
      'left:16px',
      'right:16px',
      'bottom:16px',
      'z-index:2147483000',
      'max-width:860px',
      'margin:0 auto',
      'background:#0f172a',
      'color:#e2e8f0',
      'border:1px solid #334155',
      'border-radius:12px',
      'box-shadow:0 18px 45px rgba(15,23,42,.45)',
      'padding:18px 20px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      'font-size:13.5px',
      'line-height:1.5',
    ].join(';');

    banner.innerHTML = [
      '<div style="display:flex;flex-direction:column;gap:12px">',
      '  <div>',
      '    <strong style="display:block;color:#fff;font-size:14.5px;margin-bottom:4px">Cookies y privacidad</strong>',
      '    <span style="color:#cbd5e1">Cifra usa cookies técnicas propias (imprescindibles para la sesión) y cookies analíticas de Google Analytics para entender cómo se usa el sitio. Puedes aceptar o rechazar las analíticas. Más información en la',
      '    <a href="/legal/cookies" style="color:#34d399;text-decoration:underline">Política de cookies</a> y en la',
      '    <a href="/legal/privacidad" style="color:#34d399;text-decoration:underline">Política de privacidad</a>.</span>',
      '  </div>',
      '  <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">',
      '    <button type="button" data-consent="denied" style="cursor:pointer;border:1px solid #475569;background:transparent;color:#e2e8f0;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600">Rechazar</button>',
      '    <button type="button" data-consent="granted" style="cursor:pointer;border:0;background:#10b981;color:#052e22;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700">Aceptar analíticas</button>',
      '  </div>',
      '</div>',
    ].join('\n');

    banner.querySelectorAll('button[data-consent]').forEach(function (button) {
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-consent');
        saveConsent(value);
        updateGtagConsent(value);
        removeBanner();
      });
    });

    document.body.appendChild(banner);
  }

  function open() {
    showBanner();
  }

  function accept() {
    saveConsent('granted');
    updateGtagConsent('granted');
    removeBanner();
  }

  function reject() {
    saveConsent('denied');
    updateGtagConsent('denied');
    removeBanner();
  }

  window.CifraCookies = { open: open, accept: accept, reject: reject };

  function init() {
    var stored = readConsent();
    if (stored === 'granted' || stored === 'denied') {
      updateGtagConsent(stored);
      return;
    }
    if (!document.body) return;
    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
