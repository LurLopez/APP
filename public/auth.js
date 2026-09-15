/**
 * @fileoverview Controlador principal de autenticación del cliente.
 * Gestiona el ciclo de vida de la sesión de usuario, peticiones de inicio de sesión,
 * registro, verificación de email y recuperación de contraseñas.
 * Delegando el renderizado visual a AuthUI.
 * @module auth
 */

let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

const state = {
  user: null,
  loaded: false,
  tab: 'login',
  step: 'credentials',
  verifyingEmail: null,
  resetEmail: null,
};

window.AuthModule = {
  getUser: () => state.user,
  isAdmin: () => Boolean(state.user?.isAdmin),
  isReady: () => state.loaded,
  whenReady: () => authReadyPromise,
  openModal: (tab) => openModal(tab),
};

const UI = window.AuthUI;
const el = UI.elements;

/**
 * Realiza peticiones JSON autenticadas contra la API interna.
 * @param {string} path - Ruta relativa de la API.
 * @param {Object} [options] - Opciones de fetch (método, body).
 * @returns {Promise<Object>} Respuesta procesada.
 */

/**
 * Notifica a los componentes y renderiza el estado de autenticación.
 */

/**
 * Abre el modal de autenticación fijando la pestaña activa.
 * @param {'login'|'register'} [tab='login']
 */
window.openModal = openModal;

/**
 * Cierra y reinicia el modal de autenticación.
 */

/**
 * Carga la sesión actual activa mediante la cookie HTTP-only.
 */

/**
 * Muestra el paso de verificación de correo en el modal.
 * @param {string} email
 */

/**
 * Maneja el envío del formulario principal de credenciales/registro.
 * @param {Event} event
 */

/**
 * Envía el código de 6 dígitos para validar la cuenta.
 * @param {string} email
 */

/**
 * Solicita el reenvío de un código de confirmación.
 */

/**
 * Envía la petición para iniciar la recuperación de contraseña.
 */

/**
 * Envía el código de restablecimiento y la nueva clave elegida.
 */

/**
 * Procesa parámetros de respuesta de OAuth Google tras redirección.
 */

/**
 * Limpia parámetros URL sin refrescar la página.
 * @param {string[]} keys
 */

// Inicialización y Listeners de Eventos
document.querySelector('#auth-login')?.addEventListener('click', () => openModal('login'));
document.querySelector('#auth-register')?.addEventListener('click', () => openModal('register'));
el.accountAction?.addEventListener('click', () => (state.user ? el.userLogout?.click() : openModal('login')));
el.modalClose?.addEventListener('click', closeModal);
el.modalBackdrop?.addEventListener('click', (e) => e.target === el.modalBackdrop && closeModal());
document.addEventListener('keydown', (e) => e.key === 'Escape' && !el.modalBackdrop?.hidden && closeModal());

el.modalTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    state.tab = tab.dataset.tab;
    UI.setTab(tab.dataset.tab);
  });
});

el.resendCodeBtn?.addEventListener('click', handleResendCode);
el.verifyBackBtn?.addEventListener('click', () => {
  state.step = 'credentials';
  UI.renderStep(state);
  el.authPassword?.focus();
});

el.forgotPasswordBtn?.addEventListener('click', () => {
  state.tab = 'login';
  state.step = 'reset-request';
  state.resetEmail = null;
  UI.renderStep(state);
  el.resetEmail?.focus();
});

const onResetBack = () => {
  if (state.step === 'reset-code') {
    state.step = 'reset-request';
    UI.renderStep(state);
    return el.resetEmail?.focus();
  }
  state.step = 'credentials';
  state.tab = 'login';
  UI.renderStep(state);
  el.authEmail?.focus();
};

el.resetBack?.addEventListener('click', onResetBack);
el.resetBack2?.addEventListener('click', onResetBack);

el.authForm?.addEventListener('submit', handleSubmit);
el.userLogout?.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch { /* Ignorar error de red al desloguear */ }
  state.user = null;
  updateAuthState();
  UI.showToast('Sesión cerrada.');
});

checkOAuthRedirect();
loadSession();
  window.state = state;
  window.UI = UI;
  window.el = el;
