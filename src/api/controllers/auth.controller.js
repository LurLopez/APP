import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../../../config/index.js';
import * as authService from '../../services/auth.service.js';
import { toPublicUser } from '../../services/auth.service.js';

const LEGACY_COOKIE_NAME = 'token';
// __Host- exige Secure, Path=/ y sin Domain: la cookie no puede ser sobrescrita
// desde subdominios. Solo se usa en producción (requiere HTTPS).
const COOKIE_NAME = config.production ? '__Host-token' : LEGACY_COOKIE_NAME;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res, userId, tokenVersion = 0) {
  const token = jwt.sign(
    { sub: userId, tv: Number(tokenVersion) || 0 },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: '7d' },
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

function safeRedirect(res, targetUrl, paramName, paramValue) {
  const safePath = typeof targetUrl === 'string' && targetUrl.startsWith('/') && !targetUrl.startsWith('//')
    ? targetUrl
    : '/';
  const separator = safePath.includes('?') ? '&' : '?';
  return res.redirect(`${safePath}${separator}${paramName}=${encodeURIComponent(paramValue)}`);
}

export function googleAuth(req, res) {
  const returnTo = typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/') && !req.query.returnTo.startsWith('//')
    ? req.query.returnTo
    : '/';

  if (!config.google.clientId || !config.google.clientSecret) {
    return safeRedirect(res, returnTo, 'auth_error', 'google_not_configured');
  }

  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    maxAge: 10 * 60 * 1000,
  });
  res.cookie('google_oauth_return_to', returnTo, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    maxAge: 10 * 60 * 1000,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.google.clientId);
  authUrl.searchParams.set('redirect_uri', config.google.callbackUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  res.redirect(authUrl.toString());
}

export async function googleAuthCallback(req, res) {
  const returnTo = req.cookies.google_oauth_return_to || '/';
  const savedState = req.cookies.google_oauth_state;

  res.clearCookie('google_oauth_state');
  res.clearCookie('google_oauth_return_to');

  const { code, state, error } = req.query;

  if (error) {
    return safeRedirect(res, returnTo, 'auth_error', 'cancelled');
  }

  if (!state || !savedState || state !== savedState) {
    return safeRedirect(res, returnTo, 'auth_error', 'invalid_state');
  }

  if (!code) {
    return safeRedirect(res, returnTo, 'auth_error', 'missing_code');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Google OAuth] Error token endpoint:', errText);
      return safeRedirect(res, returnTo, 'auth_error', 'token_exchange_failed');
    }

    const tokens = await tokenRes.json();
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      const profileErr = await profileRes.text();
      console.error('[Google OAuth] Error userinfo endpoint:', profileErr);
      return safeRedirect(res, returnTo, 'auth_error', 'profile_failed');
    }

    const profile = await profileRes.json();
    if (!profile.email) {
      return safeRedirect(res, returnTo, 'auth_error', 'email_required');
    }
    if (profile.email_verified === false) {
      return safeRedirect(res, returnTo, 'auth_error', 'email_unverified');
    }

    const user = await authService.loginOrRegisterGoogle({
      googleId: profile.sub,
      email: profile.email,
    });

    setAuthCookie(res, user.id, user.token_version);
    return safeRedirect(res, returnTo, 'auth_success', 'google');
  } catch (err) {
    if (err?.code === 'ADMIN_GOOGLE_BLOCKED') {
      return safeRedirect(res, returnTo, 'auth_error', 'admin_google_blocked');
    }
    if (err?.code === 'ACCOUNT_LINK_REQUIRED') {
      return safeRedirect(res, returnTo, 'auth_error', 'account_exists');
    }
    console.error('[Google OAuth] Error inesperado en callback:', err);
    return safeRedirect(res, returnTo, 'auth_error', 'server_error');
  }
}

export async function register(req, res) {
  const user = await authService.register(req.body);
  // Respuesta uniforme exista o no la cuenta (anti-enumeración).
  res.status(201).json({
    user,
    message: 'Si el correo no estaba registrado, recibirás un código de verificación.',
  });
}

export async function verify(req, res) {
  const user = await authService.verifyEmail(req.body);
  setAuthCookie(res, user.id, user.token_version);
  res.json({ user });
}

export async function resendCode(req, res) {
  await authService.resendVerificationCode(req.body);
  res.json({ ok: true, message: 'Si existe una cuenta sin verificar con ese correo, recibirás un código.' });
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.body);
  res.json({
    ok: true,
    message: 'Si existe una cuenta con ese correo, te hemos enviado un código.',
  });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  res.json({ ok: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
}

export async function login(req, res) {
  const user = await authService.login(req.body);
  setAuthCookie(res, user.id, user.token_version);
  res.json({ user });
}

export function logout(_req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.clearCookie(LEGACY_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({ user: toPublicUser(req.user) });
}

export async function updateUsername(req, res) {
  const user = await authService.changeUsername(req.user.id, req.body.username);
  res.json({ ok: true, user, message: 'Nombre de usuario actualizado con éxito.' });
}
