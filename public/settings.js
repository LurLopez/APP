/**
 * @fileoverview Orquestador del panel de Ajustes y Preferencias de Usuario.
 * Gestiona la sincronización con la API, tabs de navegación y persistencia en sesión.
 * @module Settings
 */

const Settings = (() => {
  let userLogged = false;
  let preferences = {
    language: 'es',
    theme: 'indigo',
    darkMode: false,
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
  let currentUsername = '';

  /**
   * Petición helper fetch con captura de error.
   */
  async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error del servidor.');
    return data;
  }

  function getPreferences() {
    return { ...preferences };
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent('settings:change', { detail: { preferences: getPreferences() } }));
  }

  function emitPreview() {
    const preview = window.SettingsForm.readAppearance(form);
    window.dispatchEvent(new CustomEvent('settings:preview', { detail: preview }));
  }

  async function loadPreferences() {
    if (!userLogged) return;
    try {
      const data = await api('/api/watchlists/preferences');
      if (data?.preferences) {
        preferences = { ...preferences, ...data.preferences };
        renderForm();
        emitChange();
      }
    } catch {
      // Mantener defaults en caso de fallo
    }
  }

  async function loadProfile() {
    if (!userLogged) return;
    try {
      const data = await api('/api/auth/me');
      if (data?.user?.username) {
        currentUsername = data.user.username;
        const userInput = form?.querySelector('#pref-username');
        if (userInput) userInput.value = currentUsername;
      }
    } catch {
      // Ignorar error de perfil
    }
  }

  function setAuthenticated(value) {
    userLogged = Boolean(value);
    if (userLogged) {
      loadPreferences();
      loadProfile();
    }
  }

  function switchTab(tabName) {
    if (!modalBackdrop) return;
    modalBackdrop.querySelectorAll('.settings-nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.settingsTab === tabName);
    });
    modalBackdrop.querySelectorAll('.settings-panel').forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== tabName;
    });
  }

  function renderForm() {
    window.SettingsForm.populateForm(form, preferences, currentUsername);
  }

  async function updateUsername(newUsername) {
    if (!newUsername || newUsername === currentUsername) return;
    const uData = await api('/api/auth/username', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername }),
    });
    if (uData?.user?.username) {
      currentUsername = uData.user.username;
      window.dispatchEvent(new CustomEvent('auth:change', { detail: { user: uData.user } }));
    }
  }

  async function saveFromForm() {
    const saveBtn = form?.querySelector('#settings-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    const userInput = form?.querySelector('#pref-username');
    const newUsername = userInput ? userInput.value.trim() : '';
    const newPrefs = window.SettingsForm.readPreferences(form);

    try {
      await updateUsername(newUsername);
      const data = await api('/api/watchlists/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrefs),
      });
      preferences = data?.preferences ? { ...preferences, ...data.preferences } : { ...preferences, ...newPrefs };
      emitChange();
      window.showToast?.('Ajustes guardados correctamente.');
      close();
    } catch (error) {
      window.showToast?.(error.message);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function open() {
    if (!modalBackdrop) return;
    switchTab('apariencia');
    loadProfile();
    renderForm();
    modalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modalBackdrop) return;
    modalBackdrop.hidden = true;
    document.body.style.overflow = '';
    window.dispatchEvent(new CustomEvent('settings:preview', { detail: { ...preferences } }));
  }

  function initModal() {
    modalBackdrop = document.querySelector('#settings-modal-backdrop');
    form = document.querySelector('#settings-form');
    if (!modalBackdrop || !form) return;

    modalBackdrop.querySelector('#settings-modal-close')?.addEventListener('click', close);
    modalBackdrop.addEventListener('click', (e) => e.target === modalBackdrop && close());
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !modalBackdrop.hidden && close());

    document.querySelectorAll('.settings-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!userLogged) {
          window.showToast?.('Inicia sesión para gestionar tus preferencias.');
          window.openModal?.('login');
          return;
        }
        open();
      });
    });

    modalBackdrop.querySelectorAll('.settings-nav-item').forEach((item) => {
      item.addEventListener('click', () => switchTab(item.dataset.settingsTab));
    });

    window.SettingsForm.bindAppearanceEvents(form, emitPreview);
    window.SettingsForm.bindDependentCheckboxes(form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveFromForm();
    });
  }

  window.addEventListener('DOMContentLoaded', initModal);
  window.addEventListener('auth:change', (event) => {
    setAuthenticated(Boolean(event.detail?.user));
  });

  return { open, close, getPreferences, setAuthenticated };
})();
