/* ── Ajustes y Preferencias de Usuario ───────────────────────── */

const Settings = (() => {
  let userLogged = false;
  let preferences = {
    watchlistAutoCalendar: true,
    watchlistAutoNotify: true,
    watchlistNotifyEarnings: true,
    watchlistNotifyExdiv: false,
    watchlistNotifyPayout: false,
    portfolioAutoNotify: true,
    portfolioNotifyEarnings: true,
    portfolioNotifyExdiv: true,
    portfolioNotifyPayout: true,
  };

  let modalBackdrop = null;
  let form = null;

  async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error del servidor.');
    return data;
  }

  function getPreferences() {
    return { ...preferences };
  }

  async function loadPreferences() {
    if (!userLogged) return;
    try {
      const data = await api('/api/watchlists/preferences');
      if (data?.preferences) {
        preferences = { ...preferences, ...data.preferences };
        renderForm();
      }
    } catch {
      // Usar defaults
    }
  }

  function setAuthenticated(value) {
    userLogged = Boolean(value);
    if (userLogged) {
      loadPreferences();
    }
  }

  function initModal() {
    modalBackdrop = document.querySelector('#settings-modal-backdrop');
    form = document.querySelector('#settings-form');
    if (!modalBackdrop || !form) return;

    const closeBtn = modalBackdrop.querySelector('#settings-modal-close');
    closeBtn?.addEventListener('click', close);

    modalBackdrop.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) close();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modalBackdrop.hidden) close();
    });

    // Delegación de botón de configuración en cabecera
    document.querySelectorAll('.settings-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!userLogged) {
          showToast?.('Inicia sesión para gestionar tus preferencias.');
          window.openModal?.('login');
          return;
        }
        open();
      });
    });

    // Cambios dinámicos en los checkboxes padres
    const wlNotifyCheck = form.querySelector('#pref-wl-notify');
    const wlSubs = form.querySelector('#pref-wl-subs');
    wlNotifyCheck?.addEventListener('change', () => {
      if (wlSubs) wlSubs.classList.toggle('disabled', !wlNotifyCheck.checked);
    });

    const pfNotifyCheck = form.querySelector('#pref-pf-notify');
    const pfSubs = form.querySelector('#pref-pf-subs');
    pfNotifyCheck?.addEventListener('change', () => {
      if (pfSubs) pfSubs.classList.toggle('disabled', !pfNotifyCheck.checked);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveFromForm();
    });
  }

  function renderForm() {
    if (!form) return;
    const wlCal = form.querySelector('#pref-wl-calendar');
    const wlNot = form.querySelector('#pref-wl-notify');
    const wlEarn = form.querySelector('#pref-wl-earnings');
    const wlEx = form.querySelector('#pref-wl-exdiv');
    const wlPay = form.querySelector('#pref-wl-payout');

    const pfNot = form.querySelector('#pref-pf-notify');
    const pfEarn = form.querySelector('#pref-pf-earnings');
    const pfEx = form.querySelector('#pref-pf-exdiv');
    const pfPay = form.querySelector('#pref-pf-payout');

    if (wlCal) wlCal.checked = preferences.watchlistAutoCalendar;
    if (wlNot) wlNot.checked = preferences.watchlistAutoNotify;
    if (wlEarn) wlEarn.checked = preferences.watchlistNotifyEarnings;
    if (wlEx) wlEx.checked = preferences.watchlistNotifyExdiv;
    if (wlPay) wlPay.checked = preferences.watchlistNotifyPayout;

    if (pfNot) pfNot.checked = preferences.portfolioAutoNotify;
    if (pfEarn) pfEarn.checked = preferences.portfolioNotifyEarnings;
    if (pfEx) pfEx.checked = preferences.portfolioNotifyExdiv;
    if (pfPay) pfPay.checked = preferences.portfolioNotifyPayout;

    const wlSubs = form.querySelector('#pref-wl-subs');
    if (wlSubs && wlNot) wlSubs.classList.toggle('disabled', !wlNot.checked);

    const pfSubs = form.querySelector('#pref-pf-subs');
    if (pfSubs && pfNot) pfSubs.classList.toggle('disabled', !pfNot.checked);
  }

  async function saveFromForm() {
    const saveBtn = form?.querySelector('#settings-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    const newPrefs = {
      watchlistAutoCalendar: Boolean(form.querySelector('#pref-wl-calendar')?.checked),
      watchlistAutoNotify: Boolean(form.querySelector('#pref-wl-notify')?.checked),
      watchlistNotifyEarnings: Boolean(form.querySelector('#pref-wl-earnings')?.checked),
      watchlistNotifyExdiv: Boolean(form.querySelector('#pref-wl-exdiv')?.checked),
      watchlistNotifyPayout: Boolean(form.querySelector('#pref-wl-payout')?.checked),
      portfolioAutoNotify: Boolean(form.querySelector('#pref-pf-notify')?.checked),
      portfolioNotifyEarnings: Boolean(form.querySelector('#pref-pf-earnings')?.checked),
      portfolioNotifyExdiv: Boolean(form.querySelector('#pref-pf-exdiv')?.checked),
      portfolioNotifyPayout: Boolean(form.querySelector('#pref-pf-payout')?.checked),
    };

    try {
      const data = await api('/api/watchlists/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrefs),
      });
      if (data?.preferences) {
        preferences = { ...preferences, ...data.preferences };
      } else {
        preferences = { ...preferences, ...newPrefs };
      }
      showToast?.('Preferencias guardadas correctamente.');
      close();
    } catch (error) {
      showToast?.(error.message);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function open() {
    if (!modalBackdrop) return;
    renderForm();
    modalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modalBackdrop) return;
    modalBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  window.addEventListener('DOMContentLoaded', initModal);
  window.addEventListener('auth:change', (event) => {
    setAuthenticated(Boolean(event.detail?.user));
  });

  return {
    open,
    close,
    getPreferences,
    setAuthenticated,
  };
})();
