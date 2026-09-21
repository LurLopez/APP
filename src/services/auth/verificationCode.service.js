/**
 * @fileoverview Servicio especializado en la emisión, hashing criptográfico y validación de códigos temporales de verificación.
 * @module services/auth/verificationCode
 */

import crypto from 'node:crypto';
import config from '../../../config/index.js';
import {
  saveVerificationCode,
  findActiveVerificationCode,
  consumeVerificationCode,
  incrementCodeAttempts,
  deleteVerificationCodesForUser,
} from '../../../db/repositories/userRepository.js';
import { getUserPreferences } from '../../../db/repositories/watchlistRepositoryPrefs.js';
import { sendVerificationCode, sendPasswordResetCode } from '../email.service.js';

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const CODE_PATTERN = /^\d{6}$/;

/**
 * Genera un código numérico aleatorio seguro de 6 dígitos.
 * @returns {string} Código de 6 dígitos con ceros a la izquierda si procede.
 */
export function generateVerificationCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

/**
 * Calcula un HMAC-SHA-256 del código usando un secreto del servidor (pepper).
 * Así, aunque se filtre la base de datos, los códigos no son reversibles por
 * fuerza bruta (un SHA-256 plano de 6 dígitos se rompe en milisegundos).
 * @param {string} code - Código en texto plano.
 * @returns {string} Digest hexadecimal.
 */
export function hashVerificationCode(code) {
  return crypto.createHmac('sha256', config.codePepper).update(String(code)).digest('hex');
}

/**
 * Compara dos hashes en tiempo constante para no filtrar información por temporización.
 * @param {string} a - Primer valor.
 * @param {string} b - Segundo valor.
 * @returns {boolean}
 */
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Emite un nuevo código de verificación para activación de cuenta y lo envía por email.
 * @param {Object} user - Usuario destinatario.
 * @returns {Promise<void>}
 */
export async function issueVerificationCode(user) {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  // Se invalidan los códigos anteriores: solo el más reciente puede usarse.
  await deleteVerificationCodesForUser(user.id);
  await saveVerificationCode({
    userId: user.id,
    codeHash: hashVerificationCode(code),
    expiresAt,
  });
  const prefs = await getUserPreferences(user.id).catch(() => null);
  await sendVerificationCode({ to: user.email, code, language: prefs?.language || 'es' });
}

/**
 * Emite un código temporal para recuperación de contraseña y lo envía al usuario.
 * @param {Object} user - Usuario solicitante.
 * @returns {Promise<void>}
 */
export async function issuePasswordResetCode(user) {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  // Se invalidan los códigos anteriores: solo el más reciente puede usarse.
  await deleteVerificationCodesForUser(user.id);
  await saveVerificationCode({
    userId: user.id,
    codeHash: hashVerificationCode(code),
    expiresAt,
  });
  const prefs = await getUserPreferences(user.id).catch(() => null);
  await sendPasswordResetCode({ to: user.email, code, language: prefs?.language || 'es' });
}

/**
 * Valida un código introducido por el usuario contra el registro activo en BD.
 * Incrementa intentos fallidos e invalida si supera el límite de seguridad.
 * @param {number} userId - ID del usuario.
 * @param {string} inputCode - Código de 6 dígitos recibido.
 * @param {Function} AuthErrorClass - Clase de error para excepciones de validación.
 * @returns {Promise<Object>} Registro del código consumido.
 * @throws {AuthError} Si el código es inválido, expiró o superó los intentos.
 */
export async function validateAndConsumeCode(userId, inputCode, AuthErrorClass) {
  if (typeof inputCode !== 'string' || !CODE_PATTERN.test(inputCode)) {
    throw new AuthErrorClass('El código debe tener 6 dígitos.', 400);
  }

  const record = await findActiveVerificationCode(userId);
  if (!record) {
    throw new AuthErrorClass(
      'El código ha expirado o no es válido. Pide uno nuevo.',
      400,
      'CODE_EXPIRED',
    );
  }

  const matches = safeCompare(hashVerificationCode(inputCode), record.code_hash);
  if (!matches) {
    await incrementCodeAttempts(record.id);
    if (record.attempts + 1 >= MAX_CODE_ATTEMPTS) {
      await consumeVerificationCode(record.id);
      throw new AuthErrorClass(
        'Demasiados intentos. Pide un código nuevo.',
        400,
        'CODE_EXPIRED',
      );
    }
    throw new AuthErrorClass('El código no es correcto.', 400);
  }

  await consumeVerificationCode(record.id);
  return record;
}
