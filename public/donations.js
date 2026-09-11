/**
 * =========================================================================
 * MÓDULO DE DONACIONES - CIFRA TERMINAL
 * =========================================================================
 * 
 * ¿CÓMO CONFIGURAR TUS PROPIOS ENLACES DE DONACIÓN?
 * -------------------------------------------------------------------------
 * Puedes cambiar los valores por defecto en este archivo (DONATION_DEFAULTS)
 * O configurarlos directamente desde el modal pulsando en "Configurar enlaces".
 * =========================================================================
 */

const DONATION_STORAGE_KEY = 'cifra_donation_config_v1';

const DONATION_DEFAULTS = {
  // Tu enlace personal de PayPal (ej: 'https://paypal.me/tuusuario')
  paypalUrl: 'https://paypal.me/cifraterminal',
  // Tu enlace de Buy Me a Coffee (ej: 'https://buymeacoffee.com/tuusuario')
  buyMeACoffeeUrl: 'https://buymeacoffee.com/cifraterminal',
  // Tu enlace de Ko-fi (ej: 'https://ko-fi.com/tuusuario')
  kofiUrl: 'https://ko-fi.com/cifraterminal',
  // Número o alias para Bizum
  bizumNumber: '600 000 000',
  bizumConcept: 'Donación Cifra',
  // Billeteras de criptomonedas (opcional)
  cryptoBtc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  cryptoEth: '0x71C...3984',
  cryptoUsdt: 'TQn9Y2... (Red TRC20)'
};

const Donations = (() => {
  let modalBackdrop = null;
  let selectedAmount = 5; // Importe predeterminado en euros
  let config = { ...DONATION_DEFAULTS };

  function loadConfig() {
    try {
      const saved = localStorage.getItem(DONATION_STORAGE_KEY);
      if (saved) {
        config = { ...DONATION_DEFAULTS, ...JSON.parse(saved) };
      } else {
        config = { ...DONATION_DEFAULTS };
      }
    } catch {
      config = { ...DONATION_DEFAULTS };
    }
  }

  function saveConfig(newConfig) {
    config = { ...config, ...newConfig };
    try {
      localStorage.setItem(DONATION_STORAGE_KEY, JSON.stringify(config));
    } catch {}
    updateLinks();
  }

  function getActiveAmount() {
    const customInput = document.querySelector('#donations-custom-amount');
    if (customInput && customInput.value && !isNaN(customInput.value)) {
      const val = parseFloat(customInput.value);
      if (val > 0) return val;
    }
    return selectedAmount;
  }

  function updateLinks() {
    const amount = getActiveAmount();

    // PayPal
    const paypalBtn = document.querySelector('#donation-paypal-link');
    if (paypalBtn) {
      let base = config.paypalUrl || DONATION_DEFAULTS.paypalUrl;
      base = base.replace(/\/+$/, '');
      paypalBtn.href = `${base}/${amount}`;
    }

    // Buy Me a Coffee
    const bmacBtn = document.querySelector('#donation-bmac-link');
    if (bmacBtn) {
      let base = config.buyMeACoffeeUrl || DONATION_DEFAULTS.buyMeACoffeeUrl;
      bmacBtn.href = base;
    }

    // Ko-fi
    const kofiBtn = document.querySelector('#donation-kofi-link');
    if (kofiBtn) {
      let base = config.kofiUrl || DONATION_DEFAULTS.kofiUrl;
      kofiBtn.href = base;
    }

    // Bizum
    const bizumNumEl = document.querySelector('#donation-bizum-display');
    if (bizumNumEl) {
      bizumNumEl.textContent = config.bizumNumber || 'No configurado';
    }
    const bizumConceptEl = document.querySelector('#donation-bizum-concept');
    if (bizumConceptEl) {
      bizumConceptEl.textContent = `Concepto: ${config.bizumConcept || 'Donación Cifra'} (${amount} €)`;
    }

    // Crypto
    const btcEl = document.querySelector('#donation-btc-address');
    if (btcEl) btcEl.textContent = config.cryptoBtc || '—';

    const ethEl = document.querySelector('#donation-eth-address');
    if (ethEl) ethEl.textContent = config.cryptoEth || '—';

    const usdtEl = document.querySelector('#donation-usdt-address');
    if (usdtEl) usdtEl.textContent = config.cryptoUsdt || '—';
  }

  function copyToClipboard(text, buttonEl, successMsg = '¡Copiado!') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const originalText = buttonEl.innerHTML;
      buttonEl.innerHTML = `<span style="color:#16a34a">✓ ${successMsg}</span>`;
      buttonEl.disabled = true;
      setTimeout(() => {
        buttonEl.innerHTML = originalText;
        buttonEl.disabled = false;
      }, 2000);
      if (typeof window.showToast === 'function') {
        window.showToast(successMsg);
      }
    }).catch(() => {
      if (typeof window.showToast === 'function') {
        window.showToast('No se pudo copiar automáticamente.');
      }
    });
  }

  function setupAmountSelectors() {
    const pills = document.querySelectorAll('.donation-amount-pill');
    const customInput = document.querySelector('#donations-custom-amount');

    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        selectedAmount = parseFloat(pill.dataset.amount) || 5;
        if (customInput) customInput.value = '';
        updateLinks();
      });
    });

    if (customInput) {
      customInput.addEventListener('input', () => {
        pills.forEach((p) => p.classList.remove('active'));
        updateLinks();
      });
    }
  }

  function setupCopyButtons() {
    document.querySelector('#copy-bizum-btn')?.addEventListener('click', function () {
      copyToClipboard(config.bizumNumber, this, 'Número de Bizum copiado');
    });

    document.querySelector('#copy-btc-btn')?.addEventListener('click', function () {
      copyToClipboard(config.cryptoBtc, this, 'Dirección BTC copiada');
    });

    document.querySelector('#copy-eth-btn')?.addEventListener('click', function () {
      copyToClipboard(config.cryptoEth, this, 'Dirección ETH copiada');
    });

    document.querySelector('#copy-usdt-btn')?.addEventListener('click', function () {
      copyToClipboard(config.cryptoUsdt, this, 'Dirección USDT copiada');
    });
  }

  function setupConfigAccordion() {
    const toggleBtn = document.querySelector('#donations-toggle-settings');
    const panel = document.querySelector('#donations-settings-panel');
    const form = document.querySelector('#donations-settings-form');

    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = panel.hidden;
        panel.hidden = !isHidden;
        toggleBtn.setAttribute('aria-expanded', String(isHidden));
        toggleBtn.classList.toggle('active', isHidden);

        if (isHidden) {
          // Rellenar formulario con los valores actuales
          document.querySelector('#cfg-paypal').value = config.paypalUrl || '';
          document.querySelector('#cfg-bmac').value = config.buyMeACoffeeUrl || '';
          document.querySelector('#cfg-bizum').value = config.bizumNumber || '';
          document.querySelector('#cfg-btc').value = config.cryptoBtc || '';
          document.querySelector('#cfg-eth').value = config.cryptoEth || '';
          document.querySelector('#cfg-usdt').value = config.cryptoUsdt || '';
        }
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const updated = {
          paypalUrl: document.querySelector('#cfg-paypal').value.trim(),
          buyMeACoffeeUrl: document.querySelector('#cfg-bmac').value.trim(),
          bizumNumber: document.querySelector('#cfg-bizum').value.trim(),
          cryptoBtc: document.querySelector('#cfg-btc').value.trim(),
          cryptoEth: document.querySelector('#cfg-eth').value.trim(),
          cryptoUsdt: document.querySelector('#cfg-usdt').value.trim(),
        };
        saveConfig(updated);
        if (panel) panel.hidden = true;
        if (toggleBtn) {
          toggleBtn.classList.remove('active');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
        if (typeof window.showToast === 'function') {
          window.showToast('Enlaces de donación guardados.');
        }
      });

      document.querySelector('#cfg-reset-btn')?.addEventListener('click', () => {
        saveConfig(DONATION_DEFAULTS);
        document.querySelector('#cfg-paypal').value = DONATION_DEFAULTS.paypalUrl;
        document.querySelector('#cfg-bmac').value = DONATION_DEFAULTS.buyMeACoffeeUrl;
        document.querySelector('#cfg-bizum').value = DONATION_DEFAULTS.bizumNumber;
        document.querySelector('#cfg-btc').value = DONATION_DEFAULTS.cryptoBtc;
        document.querySelector('#cfg-eth').value = DONATION_DEFAULTS.cryptoEth;
        document.querySelector('#cfg-usdt').value = DONATION_DEFAULTS.cryptoUsdt;
        if (typeof window.showToast === 'function') {
          window.showToast('Valores restablecidos por defecto.');
        }
      });
    }
  }

  function open() {
    loadConfig();
    if (!modalBackdrop) {
      modalBackdrop = document.querySelector('#donations-modal-backdrop');
    }
    if (!modalBackdrop) return;

    updateLinks();
    modalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modalBackdrop) {
      modalBackdrop = document.querySelector('#donations-modal-backdrop');
    }
    if (!modalBackdrop) return;

    modalBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function init() {
    modalBackdrop = document.querySelector('#donations-modal-backdrop');
    loadConfig();

    // Botón en el sidebar abajo a la izquierda
    const triggerBtn = document.querySelector('#donations-btn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
    }

    // Botón de cierre en el modal
    document.querySelector('#donations-modal-close')?.addEventListener('click', close);
    document.querySelector('#donations-close-btn')?.addEventListener('click', close);

    // Cierre al pulsar en el backdrop
    modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) close();
    });

    // Cierre con la tecla Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop && !modalBackdrop.hidden) {
        close();
      }
    });

    setupAmountSelectors();
    setupCopyButtons();
    setupConfigAccordion();
    updateLinks();
  }

  return {
    init,
    open,
    close,
    saveConfig,
  };
})();

window.Donations = Donations;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Donations.init());
} else {
  Donations.init();
}
