/**
 * @fileoverview Servicio especializado en la emisión, hashing criptográfico y validación de códigos temporales de verificación.
 * @module services/auth/verificationCode
 */

import crypto from 'node:crypto';
import {
  saveVerificationCode,
  findActiveVerificationCode,
  consumeVerificationCode,
  incrementCodeAttempts,
} from '../../../db/repositories/userRepository.js';
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
 * Calcula el hash SHA-256 de un código de verificación para almacenamiento seguro.
 * @param {string} code - Código en texto plano.
 * @returns {string} Digest hexadecimal.
 */
export function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Emite un nuevo código de verificación para activación de cuenta y lo envía por email.
 * @param {Object} user - Usuario destinatario.
 * @returns {Promise<void>}
 */
export async function issueVerificationCode(user) {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await saveVerificationCode({
    userId: user.id,
    codeHash: hashVerificationCode(code),
    expiresAt,
  });
  await sendVerificationCode({ to: user.email, code });
}

/**
 * Emite un código temporal para recuperación de contraseña y lo envía al usuario.
 * @param {Object} user - Usuario solicitante.
 * @returns {Promise<void>}
 */
export async function issuePasswordResetCode(user) {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await saveVerificationCode({
    userId: user.id,
    codeHash: hashVerificationCode(code),
    expiresAt,
  });
  await sendPasswordResetCode({ to: user.email, code });
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

  const matches = hashVerificationCode(inputCode) === record.code_hash;
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
