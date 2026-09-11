let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

const state = { user: null, loaded: false, tab: 'login', step: 'credentials', verifyingEmail: null, resetEmail: null };

window.AuthModule = {
  getUser: () => state.user,
  isAdmin: () => Boolean(state.user?.isAdmin),
  isReady: () => state.loaded,
  whenReady: () => authReadyPromise,
  openModal: (tab) => openModal(tab),
};

const authArea = document.querySelector('#auth-area');
const userChip = document.querySelector('#user-chip');
const userAvatar = document.querySelector('#user-avatar');
const userEmail = document.querySelector('#user-email');
const userLogout = document.querySelector('#user-logout');
const accountAvatar = document.querySelector('#account-avatar');
const accountName = document.querySelector('#account-name');
const accountPlan = document.querySelector('#account-plan');
const accountAction = document.querySelector('#account-action');
const modalBackdrop = document.querySelector('#modal-backdrop');
const modalClose = document.querySelector('#modal-close');
const modalTitle = document.querySelector('#modal-title');
const modalSubtitle = document.querySelector('#modal-subtitle');
const modalTabs = document.querySelectorAll('.modal-tab');
const authForm = document.querySelector('#auth-form');
const authCredentials = document.querySelector('#auth-credentials');
const authVerify = document.querySelector('#auth-verify');
const authEmail = document.querySelector('#auth-email');
const authPassword = document.querySelector('#auth-password');
const authConfirmField = document.querySelector('#confirm-field');
const authConfirm = document.querySelector('#auth-confirm');
const authCode = document.querySelector('#auth-code');
const verifyHint = document.querySelector('#verify-hint');
const resendCodeBtn = document.querySelector('#resend-code');
const verifyBackBtn = document.querySelector('#verify-back');
const authSubmit = document.querySelector('#auth-submit');
const modalError = document.querySelector('#modal-error');
const forgotRow = document.querySelector('#forgot-row');
const forgotPasswordBtn = document.querySelector('#forgot-password');
const authResetRequest = document.querySelector('#auth-reset-request');
const authResetCode = document.querySelector('#auth-reset-code');
const resetEmail = document.querySelector('#reset-email');
const resetHint = document.querySelector('#reset-hint');
const resetCodeInput = document.querySelector('#reset-code');
const resetPassword = document.querySelector('#reset-password');
const resetConfirm = document.querySelector('#reset-confirm');
const resetResend = document.querySelector('#reset-resend');
const resetBack = document.querySelector('#reset-back');
const resetBack2 = document.querySelector('#reset-back2');
const oauthSection = document.querySelector('#oauth-section');
const oauthGoogleBtn = document.querySelector('#oauth-google-btn');
const oauthGoogleText = document.querySelector('#oauth-google-text');

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3200);
}

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

function initials(email) {
  return (email.split('@')[0].slice(0, 2) || '?').toUpperCase();
}

function planLabel(plan) {
  return plan === 'premium' ? 'Plan premium' : 'Plan gratuito';
}

function renderAuth() {
  const logged = Boolean(state.user);
  const isAdmin = Boolean(state.user?.isAdmin);
  window.currentUser = state.user;

  if (authArea) authArea.hidden = logged;
  if (userChip) userChip.hidden = !logged;

  if (logged) {
    const displayName = state.user.username || state.user.email.split('@')[0];
    if (userAvatar) userAvatar.textContent = initials(displayName);
    if (userEmail) userEmail.textContent = displayName;
    if (accountAvatar) accountAvatar.textContent = initials(displayName);
    if (accountName) accountName.textContent = displayName;
    if (accountPlan) {
      accountPlan.textContent = isAdmin ? 'Administrador' : planLabel(state.user.plan);
      accountPlan.classList.toggle('account-plan-admin', isAdmin);
    }
    if (accountAction) accountAction.textContent = 'Salir';
  } else {
    if (accountAvatar) accountAvatar.textContent = '?';
    if (accountName) accountName.textContent = 'Invitado';
    if (accountPlan) {
      accountPlan.textContent = 'Beta privada';
      accountPlan.classList.remove('account-plan-admin');
    }
    if (accountAction) accountAction.textContent = 'Entrar';
  }

  document.body.classList.toggle('is-admin', isAdmin);

  document.querySelectorAll('.admin-only:not(section), .nav-link-admin, #nav-item-reportes').forEach((el) => {
    el.hidden = !isAdmin;
    if (!isAdmin) {
      el.style.setProperty('display', 'none', 'important');
    } else {
      el.style.removeProperty('display');
    }
  });

  window.dispatchEvent(new CustomEvent('auth:change', { detail: { user: state.user, isAdmin } }));
}

function openModal(tab = 'login') {
  if (!modalBackdrop) return;
  setTab(tab);
  modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  authEmail.focus();
}

window.openModal = openModal;

function closeModal() {
  if (!modalBackdrop) return;
  modalBackdrop.hidden = true;
  document.body.style.overflow = '';
  authForm.reset();
  modalError.hidden = true;
  state.step = 'credentials';
  state.verifyingEmail = null;
  state.resetEmail = null;
  renderStep();
}

function renderStep() {
  const verifying = state.step === 'verify';
  const resetting = state.step === 'reset-request' || state.step === 'reset-code';

  authCredentials.hidden = verifying || resetting;
  if (oauthSection) oauthSection.hidden = verifying || resetting;
  authVerify.hidden = !verifying;
  authResetRequest.hidden = state.step !== 'reset-request';
  authResetCode.hidden = state.step !== 'reset-code';
  modalTabs.forEach((tab) => {
    tab.disabled = verifying || resetting;
    tab.classList.toggle(
      'active',
      !verifying && !resetting && tab.dataset.tab === state.tab,
    );
  });

  if (state.step === 'verify') {
    modalTitle.textContent = 'Verifica tu correo';
    modalSubtitle.textContent = 'Solo nos queda confirmar que el correo es tuyo.';
    verifyHint.textContent = `Te hemos enviado un código de 6 dígitos a ${state.verifyingEmail}.`;
    authSubmit.textContent = 'Verificar código';
    authCode.required = true;
  } else if (state.step === 'reset-request') {
    modalTitle.textContent = 'Recuperar contraseña';
    modalSubtitle.textContent = 'Te enviaremos un código a tu correo para restablecerla.';
    authSubmit.textContent = 'Enviar código';
  } else if (state.step === 'reset-code') {
    modalTitle.textContent = 'Nueva contraseña';
    modalSubtitle.textContent = 'Introduce el código y tu nueva contraseña.';
    resetHint.textContent = `Te hemos enviado un código de 6 dígitos a ${state.resetEmail}.`;
    authSubmit.textContent = 'Cambiar contraseña';
  } else {
    setTab(state.tab);
  }
}

function showVerifyStep(email) {
  state.step = 'verify';
  state.verifyingEmail = email;
  renderStep();
  authCode.focus();
}

function setTab(tab) {
  state.tab = tab;
  const isRegister = tab === 'register';

  modalTitle.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
  modalSubtitle.textContent = isRegister
    ? 'Guarda tus análisis y accede desde cualquier equipo.'
    : 'Accede para guardar tus análisis.';
  authSubmit.textContent = isRegister ? 'Crear cuenta' : 'Entrar';
  authConfirmField.hidden = !isRegister;
  authConfirm.required = isRegister;
  authEmail.autocomplete = isRegister ? 'email' : 'username';
  authEmail.type = isRegister ? 'email' : 'text';
  authEmail.placeholder = isRegister ? 'tu@correo.com' : 'tu@correo.com o usuario';
  const authEmailLabel = document.querySelector('#auth-email-label');
  if (authEmailLabel) {
    authEmailLabel.textContent = isRegister ? 'Correo electrónico' : 'Correo electrónico o usuario';
  }
  authPassword.autocomplete = isRegister ? 'new-password' : 'current-password';
  forgotRow.hidden = tab !== 'login';

  if (oauthGoogleText) {
    oauthGoogleText.textContent = isRegister ? 'Registrarse con Google' : 'Continuar con Google';
  }
  if (oauthGoogleBtn) {
    const returnTo = window.location.pathname + window.location.search;
    oauthGoogleBtn.href = `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  }

  modalTabs.forEach((tabButton) => {
    tabButton.classList.toggle('active', tabButton.dataset.tab === tab);
  });

  modalError.hidden = true;
}

function showModalError(message) {
  modalError.textContent = message;
  modalError.hidden = false;
}

async function loadSession() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
  } catch {
    state.user = null;
  }
  state.loaded = true;
  renderAuth();
  if (typeof authReadyResolve === 'function') {
    authReadyResolve(state.user);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const email = authEmail.value.trim();
  const password = authPassword.value;
  const isRegister = state.tab === 'register';
  const verifying = state.step === 'verify';

  if (verifying) {
    await submitVerification(email);
    return;
  }
  if (state.step === 'reset-request') {
    await submitResetRequest();
    return;
  }
  if (state.step === 'reset-code') {
    await submitResetCode();
    return;
  }

  if (isRegister && password !== authConfirm.value) {
    showModalError('Las contraseñas no coinciden.');
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = 'Espera un momento...';

  try {
    const { user } = await api(`/api/auth/${isRegister ? 'register' : 'login'}`, {
      method: 'POST',
      body: { email, login: email, username: email, password },
    });
    if (isRegister) {
      showVerifyStep(email);
    } else {
      state.user = user;
      renderAuth();
      closeModal();
      const displayName = user.username || user.email;
      showToast(`Bienvenido de nuevo, ${displayName}`);
    }
  } catch (error) {
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      showVerifyStep(email);
    } else {
      showModalError(error.message);
    }
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent =
      state.step === 'verify'
        ? 'Verificar código'
        : state.step === 'reset-request'
          ? 'Enviar código'
          : state.step === 'reset-code'
            ? 'Cambiar contraseña'
            : isRegister
              ? 'Crear cuenta'
              : 'Entrar';
  }
}

async function submitVerification(email) {
  const code = authCode.value.trim();

  if (!/^\d{6}$/.test(code)) {
    showModalError('El código debe tener 6 dígitos.');
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = 'Verificando...';

  try {
    const { user } = await api('/api/auth/verify', {
      method: 'POST',
      body: { email, code },
    });
    state.user = user;
    renderAuth();
    closeModal();
    showToast(`Cuenta verificada. Bienvenido, ${email}`);
  } catch (error) {
    showModalError(error.message);
    if (error.code === 'CODE_EXPIRED') {
      authCode.value = '';
      authCode.focus();
    }
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = 'Verificar código';
  }
}

async function handleResendCode() {
  if (!state.verifyingEmail) return;

  resendCodeBtn.disabled = true;
  resendCodeBtn.textContent = 'Enviando...';
  try {
    const { message } = await api('/api/auth/resend-code', {
      method: 'POST',
      body: { email: state.verifyingEmail },
    });
    authCode.value = '';
    modalError.hidden = true;
    showToast(message || 'Te hemos enviado un código nuevo.');
  } catch (error) {
    showModalError(error.message);
  } finally {
    resendCodeBtn.disabled = false;
    resendCodeBtn.textContent = 'Reenviar código';
  }
}

function handleVerifyBack() {
  state.step = 'credentials';
  renderStep();
  authPassword.focus();
}

function openForgot() {
  state.tab = 'login';
  state.step = 'reset-request';
  state.resetEmail = null;
  renderStep();
  resetEmail.focus();
}

async function submitResetRequest() {
  const email = resetEmail.value.trim();

  if (!email) {
    showModalError('Escribe tu correo electrónico.');
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = 'Enviando...';

  try {
    const { message } = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
    state.resetEmail = email;
    state.step = 'reset-code';
    renderStep();
    modalError.hidden = true;
    resetCodeInput.focus();
  } catch (error) {
    showModalError(error.message);
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = 'Enviar código';
  }
}

async function submitResetCode() {
  const code = resetCodeInput.value.trim();
  const newPassword = resetPassword.value;
  const confirm = resetConfirm.value;

  if (!/^\d{6}$/.test(code)) {
    showModalError('El código debe tener 6 dígitos.');
    return;
  }
  if (newPassword.length < 8) {
    showModalError('La contraseña debe tener al menos 8 caracteres.');
    return;
  }
  if (newPassword !== confirm) {
    showModalError('Las contraseñas no coinciden.');
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = 'Guardando...';

  try {
    const { message } = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { email: state.resetEmail, code, newPassword },
    });
    closeModal();
    showToast(message || 'Contraseña actualizada. Ya puedes iniciar sesión.');
    openModal('login');
  } catch (error) {
    showModalError(error.message);
    if (error.code === 'CODE_EXPIRED') {
      resetCodeInput.value = '';
      resetCodeInput.focus();
    }
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = 'Cambiar contraseña';
  }
}

function handleResetBack() {
  if (state.step === 'reset-code') {
    state.step = 'reset-request';
    renderStep();
    resetEmail.focus();
    return;
  }
  state.step = 'credentials';
  state.tab = 'login';
  renderStep();
  authEmail.focus();
}

async function handleResetResend() {
  if (!state.resetEmail) return;

  resetResend.disabled = true;
  resetResend.textContent = 'Enviando...';

  try {
    const { message } = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: state.resetEmail },
    });
    resetCodeInput.value = '';
    modalError.hidden = true;
    showToast(message || 'Te hemos enviado un código nuevo.');
  } catch (error) {
    showModalError(error.message);
  } finally {
    resetResend.disabled = false;
    resetResend.textContent = 'Reenviar código';
  }
}

document.querySelector('#auth-login')?.addEventListener('click', () => openModal('login'));
document.querySelector('#auth-register')?.addEventListener('click', () => openModal('register'));
accountAction?.addEventListener('click', () => {
  if (state.user) {
    userLogout?.click();
  } else {
    openModal('login');
  }
});

modalClose?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', (event) => {
  if (event.target === modalBackdrop) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalBackdrop && !modalBackdrop.hidden) closeModal();
});

modalTabs.forEach((tabButton) => {
  tabButton.addEventListener('click', () => setTab(tabButton.dataset.tab));
});

resendCodeBtn?.addEventListener('click', handleResendCode);
verifyBackBtn?.addEventListener('click', handleVerifyBack);
forgotPasswordBtn?.addEventListener('click', openForgot);
resetBack?.addEventListener('click', handleResetBack);
resetBack2?.addEventListener('click', handleResetBack);
resetResend?.addEventListener('click', handleResetResend);

authForm?.addEventListener('submit', handleSubmit);

oauthGoogleBtn?.addEventListener('click', () => {
  const returnTo = window.location.pathname + window.location.search;
  oauthGoogleBtn.href = `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
});

userLogout?.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // La sesión se limpia igualmente en el cliente
  }
  state.user = null;
  renderAuth();
  showToast('Sesión cerrada.');
});

function checkOAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const authSuccess = params.get('auth_success');
  const authError = params.get('auth_error');

  if (authSuccess === 'google') {
    showToast('¡Sesión iniciada con Google!');
    cleanOAuthParams(['auth_success']);
  } else if (authError) {
    let msg = 'No se pudo iniciar sesión con Google.';
    if (authError === 'google_not_configured') {
      msg = 'Google OAuth no está configurado en .env (faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).';
    } else if (authError === 'cancelled') {
      msg = 'Acceso con Google cancelado.';
    } else if (authError === 'invalid_state') {
      msg = 'Sesión OAuth expirada o inválida. Inténtalo de nuevo.';
    } else if (authError === 'email_required') {
      msg = 'La cuenta de Google no tiene un email válido.';
    }
    showToast(msg);
    cleanOAuthParams(['auth_error']);
  }
}

function cleanOAuthParams(keys) {
  const url = new URL(window.location.href);
  keys.forEach((k) => url.searchParams.delete(k));
  const newSearch = url.searchParams.toString();
  const cleanPath = url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash;
  window.history.replaceState({}, '', cleanPath);
}

checkOAuthRedirect();
loadSession();

window.AuthModule = {
  getUser: () => state.user,
  isAdmin: () => Boolean(state.user?.isAdmin),
  isReady: () => state.loaded,
  whenReady: () => authReadyPromise,
  openModal,
};

