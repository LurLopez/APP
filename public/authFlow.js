/**
 * @fileoverview Flujo de autenticación: sesión, verificación y recuperación.
 */

(function (window) {


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

function updateAuthState() {
  window.currentUser = state.user;
  UI.renderUserState(state.user);
  window.dispatchEvent(new CustomEvent('auth:change', {
    detail: { user: state.user, isAdmin: Boolean(state.user?.isAdmin) },
  }));
}

function openModal(tab = 'login') {
  if (!el.modalBackdrop) return;
  UI.setTab(tab);
  state.tab = tab;
  el.modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  el.authEmail?.focus();
}

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

function showVerifyStep(email) {
  state.step = 'verify';
  state.verifyingEmail = email;
  UI.renderStep(state);
  el.authCode?.focus();
}

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
    el.authSubmit.textContent = window.I18n?.t ? window.I18n.t('Verificar código') : 'Verificar código';
  }
}

async function handleResendCode() {
  if (!state.verifyingEmail) return;
  el.resendCodeBtn.disabled = true;
  el.resendCodeBtn.textContent = window.I18n?.t ? window.I18n.t('Enviando...') : 'Enviando...';
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
    el.resendCodeBtn.textContent = window.I18n?.t ? window.I18n.t('Reenviar código') : 'Reenviar código';
  }
}

async function submitResetRequest() {
  const email = el.resetEmail.value.trim();
  if (!email) return UI.showModalError('Escribe tu correo electrónico.');

  el.authSubmit.disabled = true;
  el.authSubmit.textContent = window.I18n?.t ? window.I18n.t('Enviando...') : 'Enviando...';

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
    el.authSubmit.textContent = window.I18n?.t ? window.I18n.t('Enviar código') : 'Enviar código';
  }
}

async function submitResetCode() {
  const code = el.resetCodeInput.value.trim();
  const newPassword = el.resetPassword.value;
  const confirm = el.resetConfirm.value;

  if (!/^\d{6}$/.test(code)) return UI.showModalError('El código debe tener 6 dígitos.');
  if (newPassword.length < 8) return UI.showModalError('La contraseña debe tener al menos 8 caracteres.');
  if (newPassword !== confirm) return UI.showModalError('Las contraseñas no coinciden.');

  el.authSubmit.disabled = true;
  el.authSubmit.textContent = window.I18n?.t ? window.I18n.t('Guardando...') : 'Guardando...';

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
    el.authSubmit.textContent = window.I18n?.t ? window.I18n.t('Cambiar contraseña') : 'Cambiar contraseña';
  }
}

window.api = api;
window.updateAuthState = updateAuthState;
window.openModal = openModal;
window.closeModal = closeModal;
window.loadSession = loadSession;
window.showVerifyStep = showVerifyStep;
window.handleSubmit = handleSubmit;
window.submitVerification = submitVerification;
window.handleResendCode = handleResendCode;
window.submitResetRequest = submitResetRequest;
window.submitResetCode = submitResetCode;

})(window);
