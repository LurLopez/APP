/**
 * @fileoverview Módulo extraído de auth.service.js.
 */

import bcrypt from 'bcryptjs';
import { createUser, createGoogleUser, findUserByEmail, findUserByGoogleId, findUserByUsername, linkGoogleAccount, markEmailVerified, updatePassword, updateUsername } from '../../db/repositories/userRepository.js';
import { seedDefaultMetricFavorites } from '../../db/repositories/metricFavoriteRepository.js';
import { normalizeEmail, isValidEmail, isValidPassword } from '../utils/validate.js';
import { emailServiceEnabled } from './email.service.js';
import { issueVerificationCode, issuePasswordResetCode, validateAndConsumeCode } from './auth/verificationCode.service.js';
import { checkIsAdmin } from './auth/adminBootstrap.service.js';

const SALT_ROUNDS = 10;

export function toPublicUser(user) {
  const isAdmin = checkIsAdmin(user);
  return {
    id: user.id,
    email: user.email,
    username: user.username || user.email.split('@')[0],
    plan: user.plan,
    role: isAdmin ? 'admin' : (user.role || 'user'),
    isAdmin,
    email_verified: user.email_verified,
    has_google: Boolean(user.google_id),
    created_at: user.created_at,
    // Versión de sesión: se incluye en el JWT y se incrementa al cambiar la contraseña.
    token_version: Number(user.token_version ?? 0),
  };
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('cifra-timing-equalizer', SALT_ROUNDS);

/**
 * Crea las métricas favoritas por defecto de una cuenta recién creada sin
 * interrumpir el registro si la inserción falla.
 * @private
 * @param {number} userId - Identificador del usuario.
 * @returns {Promise<void>}
 */
async function applyDefaultMetricFavorites(userId) {
  try {
    await seedDefaultMetricFavorites(userId);
  } catch (error) {
    console.error('[auth:default-favorites]', error.message);
  }
}

export async function register({ email, password }) {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw new AuthError('El correo electrónico no es válido.', 400);
  }
  if (!isValidPassword(password)) {
    throw new AuthError('La contraseña debe tener entre 8 y 128 caracteres.', 400);
  }

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    if (!existing.email_verified) {
      try {
        await issueVerificationCode(existing);
      } catch (error) {
        console.error('[auth:register-existing]', error.message);
      }
    }
    return null;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await createUser({ email: normalizedEmail, passwordHash });
  await applyDefaultMetricFavorites(user.id);
  await issueVerificationCode(user);

  return toPublicUser(user);
}

export async function verifyEmail({ email, code }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  // Mensajes genéricos para no revelar si el correo está registrado.
  if (!user || user.email_verified) {
    throw new AuthError('El código no es válido o ha expirado. Pide uno nuevo.', 400, 'CODE_EXPIRED');
  }

  await validateAndConsumeCode(user.id, code, AuthError);
  await markEmailVerified(user.id);
  user.email_verified = true;

  return toPublicUser(user);
}

export async function resetPassword({ email, code, newPassword }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!isValidPassword(newPassword)) {
    throw new AuthError('La contraseña debe tener entre 8 y 128 caracteres.', 400);
  }
  // Mensaje idéntico exista o no la cuenta (anti-enumeración).
  if (!user) {
    throw new AuthError('El código no es válido o ha expirado. Pide uno nuevo.', 400, 'CODE_EXPIRED');
  }

  await validateAndConsumeCode(user.id, code, AuthError);
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await updatePassword(user.id, passwordHash);
  await markEmailVerified(user.id);

  return { ok: true };
}

export async function login({ email, login: loginField, username, password }) {
  const identifier = String(email || loginField || username || '').trim();

  if (!identifier) throw new AuthError('Introduce tu correo o nombre de usuario.', 400);
  if (!password) throw new AuthError('Introduce tu contraseña.', 400);

  let user = null;
  if (isValidEmail(identifier)) {
    user = await findUserByEmail(normalizeEmail(identifier));
  } else {
    user = await findUserByUsername(identifier) || await findUserByEmail(normalizeEmail(identifier));
  }

  // Todas las variantes de fallo devuelven el mismo mensaje y un coste bcrypt
  // similar, para no filtrar qué usuarios existen ni con qué método se registraron.
  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new AuthError('Usuario o contraseña incorrectos.', 401);
  }
  if (!user.password_hash) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new AuthError('Usuario o contraseña incorrectos.', 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) throw new AuthError('Usuario o contraseña incorrectos.', 401);

  if (!user.email_verified) {
    throw new AuthError('Debes verificar tu correo antes de entrar.', 403, 'EMAIL_NOT_VERIFIED');
  }

  return toPublicUser(user);
}

export async function loginOrRegisterGoogle({ googleId, email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    throw new AuthError('El correo proporcionado por Google no es válido.', 400);
  }

  const adminBlocked = () => new AuthError(
    'La cuenta de administración solo puede iniciar sesión con su usuario y contraseña.',
    403,
    'ADMIN_GOOGLE_BLOCKED',
  );

  let user = await findUserByGoogleId(googleId);
  if (user) {
    if (checkIsAdmin(user)) throw adminBlocked();
    return toPublicUser(user);
  }

  const existingByEmail = await findUserByEmail(normalizedEmail);
  if (existingByEmail) {
    if (checkIsAdmin(existingByEmail)) throw adminBlocked();
    // NUNCA se vincula automáticamente a una cuenta con contraseña: un atacante
    // podría haber registrado antes el correo de la víctima (pre-secuestro).
    // Debe iniciar sesión con su contraseña (o restablecerla) para vincular Google.
    if (existingByEmail.password_hash || (existingByEmail.google_id && existingByEmail.google_id !== googleId)) {
      throw new AuthError(
        'Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña para vincular Google.',
        409,
        'ACCOUNT_LINK_REQUIRED',
      );
    }
    user = await linkGoogleAccount(existingByEmail.id, googleId);
    return toPublicUser(user);
  }

  user = await createGoogleUser({ email: normalizedEmail, googleId });
  await applyDefaultMetricFavorites(user.id);
  return toPublicUser(user);
}

export async function changeUsername(userId, newUsername) {
  const trimmed = String(newUsername ?? '').trim();
  if (!trimmed) throw new AuthError('El nombre de usuario no puede estar vacío.', 400);
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(trimmed)) {
    throw new AuthError(
      'El nombre de usuario debe tener entre 3 y 30 caracteres alfanuméricos (letras, números, _, -, .).',
      400,
    );
  }

  const existing = await findUserByUsername(trimmed);
  if (existing && existing.id !== userId) {
    throw new AuthError('Ese nombre de usuario ya está en uso. Elige otro.', 409);
  }

  const updated = await updateUsername(userId, trimmed);
  return toPublicUser(updated);
}

export async function resendVerificationCode({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  // Silencioso ante correos inexistentes o ya verificados (anti-enumeración).
  if (!user || user.email_verified) return;

  await issueVerificationCode(user);
}

export async function requestPasswordReset({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);
  if (!user) return;
  await issuePasswordResetCode(user);
}

export function verificationEmailConfigured() {
  return emailServiceEnabled();
}
