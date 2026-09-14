/**
 * @fileoverview Funciones auxiliares de renderizado y lectura del formulario de ajustes.
 * Encapsula la interacción directa con el DOM del panel de configuración.
 * @module SettingsForm
 */

(function () {
  'use strict';

  /**
   * Lee la configuración visual y de idioma desde el formulario.
   * @param {HTMLFormElement} form
   * @returns {{ theme: string, darkMode: boolean, language: string }}
   */
  function readAppearance(form) {
    if (!form) return { theme: 'indigo', darkMode: false, language: 'es' };
    const activeTheme = form.querySelector('.theme-option.active');
    return {
      theme: activeTheme?.dataset.themeValue || 'indigo',
      darkMode: Boolean(form.querySelector('#pref-darkmode')?.checked),
      language: form.querySelector('#pref-language')?.value || 'es',
    };
  }

  /**
   * Lee todas las preferencias guardables desde los campos del formulario.
   * @param {HTMLFormElement} form
   * @returns {Object}
   */
  function readPreferences(form) {
    if (!form) return {};
    const appearance = readAppearance(form);
    return {
      language: appearance.language,
      theme: appearance.theme,
      darkMode: appearance.darkMode,
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
  }

  /**
   * Actualiza el estado visual de los campos del formulario según las preferencias.
   * @param {HTMLFormElement} form
   * @param {Object} preferences
   * @param {string} currentUsername
   */
  function populateForm(form, preferences, currentUsername) {
    if (!form) return;

    const setChecked = (id, val) => {
      const el = form.querySelector(id);
      if (el) el.checked = Boolean(val);
    };

    setChecked('#pref-wl-calendar', preferences.watchlistAutoCalendar);
    setChecked('#pref-wl-notify', preferences.watchlistAutoNotify);
    setChecked('#pref-wl-earnings', preferences.watchlistNotifyEarnings);
    setChecked('#pref-wl-exdiv', preferences.watchlistNotifyExdiv);
    setChecked('#pref-wl-payout', preferences.watchlistNotifyPayout);

    setChecked('#pref-pf-notify', preferences.portfolioAutoNotify);
    setChecked('#pref-pf-earnings', preferences.portfolioNotifyEarnings);
    setChecked('#pref-pf-exdiv', preferences.portfolioNotifyExdiv);
    setChecked('#pref-pf-payout', preferences.portfolioNotifyPayout);

    const wlSubs = form.querySelector('#pref-wl-subs');
    if (wlSubs) wlSubs.classList.toggle('disabled', !preferences.watchlistAutoNotify);

    const pfSubs = form.querySelector('#pref-pf-subs');
    if (pfSubs) pfSubs.classList.toggle('disabled', !preferences.portfolioAutoNotify);

    form.querySelectorAll('.theme-option').forEach((opt) => {
      opt.classList.toggle('active', opt.dataset.themeValue === preferences.theme);
    });

    setChecked('#pref-darkmode', preferences.darkMode);

    const langSelect = form.querySelector('#pref-language');
    if (langSelect) langSelect.value = preferences.language || 'es';

    const userInput = form.querySelector('#pref-username');
    if (userInput && currentUsername) userInput.value = currentUsername;
  }

  /**
   * Conecta los eventos de cambio dinámico en opciones de apariencia.
   * @param {HTMLFormElement} form
   * @param {Function} onPreview
   */
  function bindAppearanceEvents(form, onPreview) {
    if (!form) return;
    form.querySelectorAll('.theme-option').forEach((option) => {
      option.addEventListener('click', () => {
        form.querySelectorAll('.theme-option').forEach((o) => o.classList.remove('active'));
        option.classList.add('active');
        onPreview();
      });
    });

    const darkToggle = form.querySelector('#pref-darkmode');
    darkToggle?.addEventListener('change', onPreview);
  }

  /**
   * Conecta los interruptores padres de notificaciones con sus sub-opciones.
   * @param {HTMLFormElement} form
   */
  function bindDependentCheckboxes(form) {
    if (!form) return;
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
  }

  window.SettingsForm = {
    readAppearance,
    readPreferences,
    populateForm,
    bindAppearanceEvents,
    bindDependentCheckboxes,
  };
})();
