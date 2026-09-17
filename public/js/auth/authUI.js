/**
 * @fileoverview Interfaz de Usuario para el Módulo de Autenticación.
 * Gestiona el renderizado de la sesión, modales, pasos de verificación
 * y recuperación de contraseña, conforme a principios Clean Code y SRP.
 * @module AuthUI
 */

(function () {
  'use strict';

  // Cache de elementos del DOM
  const elements = {
    toast: document.querySelector('#toast'),
    authArea: document.querySelector('#auth-area'),
    userChip: document.querySelector('#user-chip'),
    userAvatar: document.querySelector('#user-avatar'),
    userEmail: document.querySelector('#user-email'),
    userLogout: document.querySelector('#user-logout'),
    accountAvatar: document.querySelector('#account-avatar'),
    accountName: document.querySelector('#account-name'),
    accountPlan: document.querySelector('#account-plan'),
    accountAction: document.querySelector('#account-action'),
    modalBackdrop: document.querySelector('#modal-backdrop'),
    modalClose: document.querySelector('#modal-close'),
    modalTitle: document.querySelector('#modal-title'),
    modalSubtitle: document.querySelector('#modal-subtitle'),
    modalTabs: document.querySelectorAll('.modal-tab'),
    authForm: document.querySelector('#auth-form'),
    authCredentials: document.querySelector('#auth-credentials'),
    authVerify: document.querySelector('#auth-verify'),
    authEmail: document.querySelector('#auth-email'),
    authPassword: document.querySelector('#auth-password'),
    authConfirmField: document.querySelector('#confirm-field'),
    authConfirm: document.querySelector('#auth-confirm'),
    authCode: document.querySelector('#auth-code'),
    verifyHint: document.querySelector('#verify-hint'),
    resendCodeBtn: document.querySelector('#resend-code'),
    verifyBackBtn: document.querySelector('#verify-back'),
    authSubmit: document.querySelector('#auth-submit'),
    modalError: document.querySelector('#modal-error'),
    forgotRow: document.querySelector('#forgot-row'),
    forgotPasswordBtn: document.querySelector('#forgot-password'),
    authResetRequest: document.querySelector('#auth-reset-request'),
    authResetCode: document.querySelector('#auth-reset-code'),
    resetEmail: document.querySelector('#reset-email'),
    resetHint: document.querySelector('#reset-hint'),
    resetCodeInput: document.querySelector('#reset-code'),
    resetPassword: document.querySelector('#reset-password'),
    resetConfirm: document.querySelector('#reset-confirm'),
    resetResend: document.querySelector('#reset-resend'),
    resetBack: document.querySelector('#reset-back'),
    resetBack2: document.querySelector('#reset-back2'),
    oauthSection: document.querySelector('#oauth-section'),
    oauthGoogleBtn: document.querySelector('#oauth-google-btn'),
    oauthGoogleText: document.querySelector('#oauth-google-text'),
  };

  let lastUser = null;

  /**
   * Helper de traducción para AuthUI.
   * @param {string} text
   * @param {Object} [params]
   * @returns {string}
   */
  function t(text, params) {
    return window.I18n?.t ? window.I18n.t(text, params) : text;
  }

  /**
   * Muestra una notificación emergente temporal en pantalla.
   * @param {string} message - Mensaje a mostrar.
   */
  function showToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = t(message);
    elements.toast.classList.add('visible');
    setTimeout(() => elements.toast.classList.remove('visible'), 3200);
  }

  /**
   * Obtiene las iniciales de 2 letras a partir de un correo o nombre.
   * @param {string} email
   * @returns {string}
   */
  function initials(email) {
    return (email.split('@')[0].slice(0, 2) || '?').toUpperCase();
  }

  /**
   * Etiqueta legible para el tipo de plan.
   * @param {string} plan
   * @returns {string}
   */
  function planLabel(plan) {
    return plan === 'premium' ? 'Plan premium' : 'Plan gratuito';
  }

  /**
   * Renderiza el estado del usuario logueado o invitado en la barra superior.
   * @param {Object} user - Usuario actual o null.
   */
  function renderUserState(user) {
    lastUser = user;
    const logged = Boolean(user);
    const isAdmin = Boolean(user?.isAdmin);

    if (elements.authArea) elements.authArea.hidden = logged;
    if (elements.userChip) elements.userChip.hidden = !logged;

    if (logged) {
      const displayName = user.username || user.email.split('@')[0];
      if (elements.userAvatar) elements.userAvatar.textContent = initials(displayName);
      if (elements.userEmail) elements.userEmail.textContent = displayName;
      if (elements.accountAvatar) elements.accountAvatar.textContent = initials(displayName);
      if (elements.accountName) elements.accountName.textContent = displayName;
      if (elements.accountPlan) {
        elements.accountPlan.textContent = isAdmin ? t('Administrador') : t(planLabel(user.plan));
        elements.accountPlan.classList.toggle('account-plan-admin', isAdmin);
      }
      if (elements.accountAction) elements.accountAction.textContent = t('Salir');
    } else {
      if (elements.accountAvatar) elements.accountAvatar.textContent = '?';
      if (elements.accountName) elements.accountName.textContent = t('Invitado');
      if (elements.accountPlan) {
        elements.accountPlan.textContent = t('Beta privada');
        elements.accountPlan.classList.remove('account-plan-admin');
      }
      if (elements.accountAction) elements.accountAction.textContent = t('Entrar');
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
  }

  /**
   * Renderiza la pestaña seleccionada (login o register).
   * @param {string} tab - 'login' o 'register'.
   */
  function setTab(tab) {
    const isRegister = tab === 'register';

    if (elements.modalTitle) elements.modalTitle.textContent = isRegister ? t('Crear cuenta') : t('Iniciar sesión');
    if (elements.modalSubtitle) {
      elements.modalSubtitle.textContent = isRegister
        ? t('Guarda tus análisis y accede desde cualquier equipo.')
        : t('Accede para guardar tus análisis.');
    }
    if (elements.authSubmit) elements.authSubmit.textContent = isRegister ? t('Crear cuenta') : t('Entrar');
    if (elements.authConfirmField) elements.authConfirmField.hidden = !isRegister;
    if (elements.authConfirm) elements.authConfirm.required = isRegister;
    if (elements.authEmail) {
      elements.authEmail.autocomplete = isRegister ? 'email' : 'username';
      elements.authEmail.type = isRegister ? 'email' : 'text';
      elements.authEmail.placeholder = isRegister ? 'tu@correo.com' : t('tu@correo.com o usuario');
    }
    const authEmailLabel = document.querySelector('#auth-email-label');
    if (authEmailLabel) {
      authEmailLabel.textContent = isRegister ? t('Correo electrónico') : t('Correo electrónico o usuario');
    }
    if (elements.authPassword) {
      elements.authPassword.autocomplete = isRegister ? 'new-password' : 'current-password';
    }
    if (elements.forgotRow) elements.forgotRow.hidden = !elements.isRegister && tab !== 'login';

    if (elements.oauthGoogleText) {
      elements.oauthGoogleText.textContent = isRegister ? t('Registrarse con Google') : t('Continuar con Google');
    }
    if (elements.oauthGoogleBtn) {
      const returnTo = window.location.pathname + window.location.search;
      elements.oauthGoogleBtn.href = `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
    }

    elements.modalTabs.forEach((tabButton) => {
      tabButton.classList.toggle('active', tabButton.dataset.tab === tab);
    });

    if (elements.modalError) elements.modalError.hidden = true;
  }

  /**
   * Renderiza los pasos del modal de autenticación según el estado.
   * @param {Object} state - Estado de la sesión y modales.
   */
  function renderStep(state) {
    const verifying = state.step === 'verify';
    const resetting = state.step === 'reset-request' || state.step === 'reset-code';

    if (elements.authCredentials) elements.authCredentials.hidden = verifying || resetting;
    if (elements.oauthSection) elements.oauthSection.hidden = verifying || resetting;
    if (elements.authVerify) elements.authVerify.hidden = !verifying;
    if (elements.authResetRequest) elements.authResetRequest.hidden = state.step !== 'reset-request';
    if (elements.authResetCode) elements.authResetCode.hidden = state.step !== 'reset-code';

    elements.modalTabs.forEach((tab) => {
      tab.disabled = verifying || resetting;
      tab.classList.toggle('active', !verifying && !resetting && tab.dataset.tab === state.tab);
    });

    if (state.step === 'verify') {
      elements.modalTitle.textContent = t('Verifica tu correo');
      elements.modalSubtitle.textContent = t('Solo nos queda confirmar que el correo es tuyo.');
      elements.verifyHint.textContent = t(`Te hemos enviado un código de 6 dígitos a ${state.verifyingEmail}.`);
      elements.authSubmit.textContent = t('Verificar código');
      elements.authCode.required = true;
    } else if (state.step === 'reset-request') {
      elements.modalTitle.textContent = t('Recuperar contraseña');
      elements.modalSubtitle.textContent = t('Te enviaremos un código a tu correo para restablecerla.');
      elements.authSubmit.textContent = t('Enviar código');
    } else if (state.step === 'reset-code') {
      elements.modalTitle.textContent = t('Nueva contraseña');
      elements.modalSubtitle.textContent = t('Introduce el código y tu nueva contraseña.');
      elements.resetHint.textContent = t(`Te hemos enviado un código de 6 dígitos a ${state.resetEmail}.`);
      elements.authSubmit.textContent = t('Cambiar contraseña');
    } else {
      setTab(state.tab);
    }
  }

  /**
   * Muestra un mensaje de error dentro del modal.
   * @param {string} message
   */
  function showModalError(message) {
    if (!elements.modalError) return;
    elements.modalError.textContent = t(message);
    elements.modalError.hidden = false;
  }

  window.addEventListener('i18n:change', () => {
    renderUserState(lastUser);
  });
  window.I18n?.whenReady?.(() => {
    renderUserState(lastUser);
  });

  // Exportar al objeto global
  window.AuthUI = {
    elements,
    showToast,
    initials,
    planLabel,
    renderUserState,
    setTab,
    renderStep,
    showModalError,
  };
})();
