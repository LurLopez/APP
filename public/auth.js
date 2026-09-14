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
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Error del servidor.');
    error.code = data.code || null;
    throw error;
  }
  return data;
}

/**
 * Notifica a los componentes y renderiza el estado de autenticación.
 */
function updateAuthState() {
  window.currentUser = state.user;
  UI.renderUserState(state.user);
  window.dispatchEvent(new CustomEvent('auth:change', {
    detail: { user: state.user, isAdmin: Boolean(state.user?.isAdmin) },
  }));
}

/**
 * Abre el modal de autenticación fijando la pestaña activa.
 * @param {'login'|'register'} [tab='login']
 */
function openModal(tab = 'login') {
  if (!el.modalBackdrop) return;
  UI.setTab(tab);
  state.tab = tab;
  el.modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  el.authEmail?.focus();
}
window.openModal = openModal;

/**
 * Cierra y reinicia el modal de autenticación.
 */
function closeModal() {
  if (!el.modalBackdrop) return;
  el.modalBackdrop.hidden = true;
  document.body.style.overflow = '';
  el.authForm?.reset();
  if (el.modalError) el.modalError.hidden = true;
  state.step = 'credentials';
  state.verifyingEmail = null;
  state.resetEmail = null;
  UI.renderStep(state);
}

/**
 * Carga la sesión actual activa mediante la cookie HTTP-only.
 */
async function loadSession() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
  } catch {
    state.user = null;
  }
  state.loaded = true;
  updateAuthState();
  if (typeof authReadyResolve === 'function') {
    authReadyResolve(state.user);
  }
}

/**
 * Muestra el paso de verificación de correo en el modal.
 * @param {string} email
 */
function showVerifyStep(email) {
  state.step = 'verify';
  state.verifyingEmail = email;
  UI.renderStep(state);
  el.authCode?.focus();
}

/**
 * Maneja el envío del formulario principal de credenciales/registro.
 * @param {Event} event
 */
async function handleSubmit(event) {
  event.preventDefault();
  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  const isRegister = state.tab === 'register';

  if (state.step === 'verify') return submitVerification(email);
  if (state.step === 'reset-request') return submitResetRequest();
  if (state.step === 'reset-code') return submitResetCode();

  if (isRegister && password !== el.authConfirm.value) {
    return UI.showModalError('Las contraseñas no coinciden.');
  }

  el.authSubmit.disabled = true;
  el.authSubmit.textContent = 'Espera un momento...';

  try {
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const { user } = await api(endpoint, {
      method: 'POST',
      body: { email, login: email, username: email, password },
    });
    if (isRegister) {
      showVerifyStep(email);
    } else {
      state.user = user;
      updateAuthState();
      closeModal();
      UI.showToast(`Bienvenido de nuevo, ${user.username || user.email}`);
    }
  } catch (error) {
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      showVerifyStep(email);
    } else {
      UI.showModalError(error.message);
    }
  } finally {
    el.authSubmit.disabled = false;
    el.authSubmit.textContent = isRegister ? 'Crear cuenta' : 'Entrar';
  }
}

/**
 * Envía el código de 6 dígitos para validar la cuenta.
 * @param {string} email
 */
async function submitVerification(email) {
  const code = el.authCode.value.trim();
  if (!/^\d{6}$/.test(code)) {
    return UI.showModalError('El código debe tener 6 dígitos.');
  }

  el.authSubmit.disabled = true;
  el.authSubmit.textContent = 'Verificando...';

  try {
    const { user } = await api('/api/auth/verify', {
      method: 'POST',
      body: { email, code },
    });
    state.user = user;
    updateAuthState();
    closeModal();
    UI.showToast(`Cuenta verificada. Bienvenido, ${email}`);
  } catch (error) {
    UI.showModalError(error.message);
    if (error.code === 'CODE_EXPIRED') {
      el.authCode.value = '';
      el.authCode.focus();
    }
  } finally {
    el.authSubmit.disabled = false;
    el.authSubmit.textContent = 'Verificar código';
  }
}

/**
 * Solicita el reenvío de un código de confirmación.
 */
async function handleResendCode() {
  if (!state.verifyingEmail) return;
  el.resendCodeBtn.disabled = true;
  el.resendCodeBtn.textContent = 'Enviando...';
  try {
    const { message } = await api('/api/auth/resend-code', {
      method: 'POST',
      body: { email: state.verifyingEmail },
    });
    el.authCode.value = '';
    if (el.modalError) el.modalError.hidden = true;
    UI.showToast(message || 'Te hemos enviado un código nuevo.');
  } catch (error) {
    UI.showModalError(error.message);
  } finally {
    el.resendCodeBtn.disabled = false;
    el.resendCodeBtn.textContent = 'Reenviar código';
  }
}

/**
 * Envía la petición para iniciar la recuperación de contraseña.
 */
async function submitResetRequest() {
  const email = el.resetEmail.value.trim();
  if (!email) return UI.showModalError('Escribe tu correo electrónico.');

  el.authSubmit.disabled = true;
  el.authSubmit.textContent = 'Enviando...';

  try {
    const { message } = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
    state.resetEmail = email;
    state.step = 'reset-code';
    UI.renderStep(state);
    if (el.modalError) el.modalError.hidden = true;
    el.resetCodeInput?.focus();
  } catch (error) {
    UI.showModalError(error.message);
  } finally {
    el.authSubmit.disabled = false;
    el.authSubmit.textContent = 'Enviar código';
  }
}

/**
 * Envía el código de restablecimiento y la nueva clave elegida.
 */
async function submitResetCode() {
  const code = el.resetCodeInput.value.trim();
  const newPassword = el.resetPassword.value;
  const confirm = el.resetConfirm.value;

  if (!/^\d{6}$/.test(code)) return UI.showModalError('El código debe tener 6 dígitos.');
  if (newPassword.length < 8) return UI.showModalError('La contraseña debe tener al menos 8 caracteres.');
  if (newPassword !== confirm) return UI.showModalError('Las contraseñas no coinciden.');

  el.authSubmit.disabled = true;
  el.authSubmit.textContent = 'Guardando...';

  try {
    const { message } = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { email: state.resetEmail, code, newPassword },
    });
    closeModal();
    UI.showToast(message || 'Contraseña actualizada. Ya puedes iniciar sesión.');
    openModal('login');
  } catch (error) {
    UI.showModalError(error.message);
    if (error.code === 'CODE_EXPIRED') {
      el.resetCodeInput.value = '';
      el.resetCodeInput.focus();
    }
  } finally {
    el.authSubmit.disabled = false;
    el.authSubmit.textContent = 'Cambiar contraseña';
  }
}

/**
 * Procesa parámetros de respuesta de OAuth Google tras redirección.
 */
function checkOAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const authSuccess = params.get('auth_success');
  const authError = params.get('auth_error');

  if (authSuccess === 'google') {
    UI.showToast('¡Sesión iniciada con Google!');
    cleanOAuthParams(['auth_success']);
  } else if (authError) {
    const messages = {
      google_not_configured: 'Google OAuth no está configurado en .env.',
      cancelled: 'Acceso con Google cancelado.',
      invalid_state: 'Sesión OAuth expirada o inválida.',
      email_required: 'La cuenta de Google no tiene un email válido.',
      admin_google_blocked: 'La cuenta admin solo puede entrar con credenciales.',
    };
    UI.showToast(messages[authError] || 'No se pudo iniciar sesión con Google.');
    cleanOAuthParams(['auth_error']);
  }
}

/**
 * Limpia parámetros URL sin refrescar la página.
 * @param {string[]} keys
 */
function cleanOAuthParams(keys) {
  const url = new URL(window.location.href);
  keys.forEach((k) => url.searchParams.delete(k));
  const newSearch = url.searchParams.toString();
  window.history.replaceState({}, '', url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash);
}

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
