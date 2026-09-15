/**
 * @fileoverview Retorno de OAuth y limpieza de parámetros.
 */

(function (window) {


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
      email_unverified: 'Google no ha verificado ese correo electrónico.',
      account_exists: 'Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña y vincula Google desde tu cuenta.',
      token_exchange_failed: 'No se pudo completar el acceso con Google. Inténtalo de nuevo.',
      profile_failed: 'No se pudo leer tu perfil de Google. Inténtalo de nuevo.',
      missing_code: 'La respuesta de Google no es válida. Inténtalo de nuevo.',
      server_error: 'Error del servidor al iniciar sesión con Google.',
      admin_google_blocked: 'La cuenta admin solo puede entrar con credenciales.',
    };
    UI.showToast(messages[authError] || 'No se pudo iniciar sesión con Google.');
    cleanOAuthParams(['auth_error']);
  }
}

function cleanOAuthParams(keys) {
  const url = new URL(window.location.href);
  keys.forEach((k) => url.searchParams.delete(k));
  const newSearch = url.searchParams.toString();
  window.history.replaceState({}, '', url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash);
}

window.checkOAuthRedirect = checkOAuthRedirect;
window.cleanOAuthParams = cleanOAuthParams;

})(window);
