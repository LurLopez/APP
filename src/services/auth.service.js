/**
 * @fileoverview Servicio principal de autenticación, registro de usuarios, login tradicional y OAuth con Google.
 * @module services/auth
 */

import { login } from './auth.service.core.js';
export { toPublicUser, register, verifyEmail, resetPassword, login, loginOrRegisterGoogle, changeUsername, resendVerificationCode, requestPasswordReset, verificationEmailConfigured } from './auth.service.core.js';

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

// Hash de relleno para igualar tiempos de respuesta cuando el usuario no existe
// o no tiene contraseña (mitiga la enumeración por temporización).

/**
 * Registra una nueva cuenta de usuario con email y contraseña, emitiendo código de activación.
 * Respuesta uniforme: si el correo ya existe no se revela (anti-enumeración); si la cuenta
 * existente está sin verificar se reemite el código, y si está verificada no se hace nada.
 * @param {Object} data - Credenciales.
 * @param {string} data.email - Correo electrónico.
 * @param {string} data.password - Contraseña.
 * @returns {Promise<Object|null>} Usuario público recién registrado o null si ya existía.
 */

/**
 * Verifica la dirección de correo de un usuario mediante el código de 6 dígitos.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo del usuario.
 * @param {string} data.code - Código de 6 dígitos.
 * @returns {Promise<Object>} Usuario verificado.
 */

/**
 * Reenvía un nuevo código de activación al correo del usuario.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo del usuario.
 * @returns {Promise<void>}
 */

/**
 * Inicia el proceso de restablecimiento de contraseña emitiendo un código al correo si existe.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo del usuario.
 * @returns {Promise<void>}
 */

/**
 * Restablece la contraseña de acceso comprobando el código recibido.
 * @param {Object} data - Parámetros.
 * @param {string} data.email - Correo.
 * @param {string} data.code - Código de 6 dígitos.
 * @param {string} data.newPassword - Nueva contraseña de al menos 8 caracteres.
 * @returns {Promise<{ ok: boolean }>}
 */

/**
 * Autentica un usuario mediante su email o username y contraseña.
 * @param {Object} params - Credenciales.
 * @returns {Promise<Object>} Usuario público autenticado.
 */

/**
 * Inicia sesión o registra un usuario a través del proveedor OAuth de Google.
 * @param {Object} data - Datos de Google.
 * @param {string} data.googleId - ID de cuenta de Google.
 * @param {string} data.email - Correo provisto por Google.
 * @returns {Promise<Object>} Usuario público autenticado.
 */

/**
 * Indica si el servicio de envío de correos está activo y configurado en la plataforma.
 * @returns {boolean}
 */

/**
 * Modifica el nombre de usuario de un usuario verificado tras validar unicidad y formato.
 * @param {number} userId - ID del usuario.
 * @param {string} newUsername - Nuevo nombre de usuario deseado.
 * @returns {Promise<Object>} Usuario con el username actualizado.
 */
