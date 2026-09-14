/**
 * @fileoverview Servicio principal de autenticación, registro de usuarios, login tradicional y OAuth con Google.
 * @module services/auth
 */

import bcrypt from 'bcryptjs';
import {
  createUser,
  createGoogleUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserByUsername,
  linkGoogleAccount,
  markEmailVerified,
  updatePassword,
  updateUsername,
} from '../../db/repositories/userRepository.js';
import { normalizeEmail, isValidEmail, isValidPassword } from '../utils/validate.js';
import { emailServiceEnabled } from './email.service.js';
import {
  issueVerificationCode,
  issuePasswordResetCode,
  validateAndConsumeCode,
} from './auth/verificationCode.service.js';
import {
  ensureAdminUser,
  checkIsAdmin,
} from './auth/adminBootstrap.service.js';

export { ensureAdminUser, checkIsAdmin };

const SALT_ROUNDS = 10;

/**
 * Clase de error específica para anomalías en el flujo de autenticación y autorización.
 */
export class AuthError extends Error {
  /**
   * @param {string} message - Mensaje descriptivo amigable.
   * @param {number} [status=400] - Código HTTP.
   * @param {string|null} [code=null] - Código interno de la aplicación.
   */
  constructor(message, status = 400, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Transforma un registro de usuario de la BD en un objeto seguro sin credenciales para el frontend.
 * @param {Object} user - Registro de usuario con campos de base de datos.
 * @returns {Object} Objeto público de usuario.
 */
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
  };
}

/**
 * Registra una nueva cuenta de usuario con email y contraseña, emitiendo código de activación.
 * @param {Object} data - Credenciales.
 * @param {string} data.email - Correo electrónico.
 * @param {string} data.password - Contraseña.
 * @returns {Promise<Object>} Usuario público registrado.
 */
export async function register({ email, password }) {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw new AuthError('El correo electrónico no es válido.', 400);
  }
  if (!isValidPassword(password)) {
    throw new AuthError('La contraseña debe tener al menos 8 caracteres.', 400);
  }

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw new AuthError('Ya existe una cuenta con ese correo.', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await createUser({ email: normalizedEmail, passwordHash });
  await issueVerificationCode(user);

  return toPublicUser(user);
}

/**
 * Verifica la dirección de correo de un usuario mediante el código de 6 dígitos.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo del usuario.
 * @param {string} data.code - Código de 6 dígitos.
 * @returns {Promise<Object>} Usuario verificado.
 */
export async function verifyEmail({ email, code }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) throw new AuthError('No existe una cuenta con ese correo.', 404);
  if (user.email_verified) throw new AuthError('Este correo ya está verificado.', 400);

  await validateAndConsumeCode(user.id, code, AuthError);
  await markEmailVerified(user.id);
  user.email_verified = true;

  return toPublicUser(user);
}

/**
 * Reenvía un nuevo código de activación al correo del usuario.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo del usuario.
 * @returns {Promise<void>}
 */
export async function resendVerificationCode({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) throw new AuthError('No existe una cuenta con ese correo.', 404);
  if (user.email_verified) throw new AuthError('Este correo ya está verificado.', 400);

  await issueVerificationCode(user);
}

/**
 * Inicia el proceso de restablecimiento de contraseña emitiendo un código al correo si existe.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo del usuario.
 * @returns {Promise<void>}
 */
export async function requestPasswordReset({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);
  if (!user) return;
  await issuePasswordResetCode(user);
}

/**
 * Restablece la contraseña de acceso comprobando el código recibido.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo.
 * @param {string} data.code - Código de 6 dígitos.
 * @param {string} data.newPassword - Nueva contraseña de al menos 8 caracteres.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function resetPassword({ email, code, newPassword }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) throw new AuthError('No existe una cuenta con ese correo.', 404);
  if (!isValidPassword(newPassword)) {
    throw new AuthError('La contraseña debe tener al menos 8 caracteres.', 400);
  }

  await validateAndConsumeCode(user.id, code, AuthError);
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await updatePassword(user.id, passwordHash);
  await markEmailVerified(user.id);

  return { ok: true };
}

/**
 * Autentica un usuario mediante su email o username y contraseña.
 * @param {Object} params - Credenciales.
 * @returns {Promise<Object>} Usuario público autenticado.
 */
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

  if (!user) throw new AuthError('Usuario o contraseña incorrectos.', 401);
  if (!user.password_hash) {
    throw new AuthError('Esta cuenta se registró con Google. Inicia sesión con el botón de Google.', 400);
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) throw new AuthError('Usuario o contraseña incorrectos.', 401);

  if (!user.email_verified) {
    throw new AuthError('Debes verificar tu correo antes de entrar.', 403, 'EMAIL_NOT_VERIFIED');
  }

  return toPublicUser(user);
}

/**
 * Inicia sesión o registra un usuario a través del proveedor OAuth de Google.
 * @param {Object} data - Datos de Google.
 * @param {string} data.googleId - ID de cuenta de Google.
 * @param {string} data.email - Correo provisto por Google.
 * @returns {Promise<Object>} Usuario público autenticado.
 */
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
    user = await linkGoogleAccount(existingByEmail.id, googleId);
    return toPublicUser(user);
  }

  user = await createGoogleUser({ email: normalizedEmail, googleId });
  return toPublicUser(user);
}

/**
 * Indica si el servicio de envío de correos está activo y configurado en la plataforma.
 * @returns {boolean}
 */
export function verificationEmailConfigured() {
  return emailServiceEnabled();
}

/**
 * Modifica el nombre de usuario de un usuario verificado tras validar unicidad y formato.
 * @param {number} userId - ID del usuario.
 * @param {string} newUsername - Nuevo nombre de usuario deseado.
 * @returns {Promise<Object>} Usuario con el username actualizado.
 */
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
