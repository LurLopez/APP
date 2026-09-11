const PAYPAL_URL = 'https://paypal.me/cifraresearch';

const Donations = (() => {
  let modalBackdrop = null;
  let selectedAmount = 5;

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
    const paypalBtn = document.querySelector('#donation-paypal-link');
    if (paypalBtn && PAYPAL_URL) {
      paypalBtn.href = `${PAYPAL_URL.replace(/\/+$/, '')}/${amount}`;
    }
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

  function open() {
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

    const triggerBtn = document.querySelector('#donations-btn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
    }

    document.querySelector('#donations-modal-close')?.addEventListener('click', close);
    document.querySelector('#donations-close-btn')?.addEventListener('click', close);

    modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop && !modalBackdrop.hidden) {
        close();
      }
    });

    setupAmountSelectors();
    updateLinks();
  }

  return {
    init,
    open,
    close,
  };
})();

window.Donations = Donations;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Donations.init());
} else {
  Donations.init();
}
