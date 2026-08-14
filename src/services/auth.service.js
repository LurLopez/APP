import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {
  createUser,
  findUserByEmail,
  markEmailVerified,
  saveVerificationCode,
  findActiveVerificationCode,
  consumeVerificationCode,
  incrementCodeAttempts,
  updatePassword,
} from '../../db/repositories/userRepository.js';
import { normalizeEmail, isValidEmail, isValidPassword } from '../utils/validate.js';
import {
  sendVerificationCode,
  sendPasswordResetCode,
  emailServiceEnabled,
} from './email.service.js';

const SALT_ROUNDS = 10;
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const CODE_PATTERN = /^\d{6}$/;

export class AuthError extends Error {
  constructor(message, status = 400, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    email_verified: user.email_verified,
    created_at: user.created_at,
  };
}

function generateCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function codeHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function issueVerificationCode(user) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await saveVerificationCode({
    userId: user.id,
    codeHash: codeHash(code),
    expiresAt,
  });
  await sendVerificationCode({ to: user.email, code });
}

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

export async function verifyEmail({ email, code }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new AuthError('No existe una cuenta con ese correo.', 404);
  }
  if (user.email_verified) {
    throw new AuthError('Este correo ya está verificado.', 400);
  }
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    throw new AuthError('El código debe tener 6 dígitos.', 400);
  }

  const record = await findActiveVerificationCode(user.id);
  if (!record) {
    throw new AuthError(
      'El código ha expirado o no es válido. Pide uno nuevo.',
      400,
      'CODE_EXPIRED',
    );
  }

  const matches = codeHash(code) === record.code_hash;
  if (!matches) {
    await incrementCodeAttempts(record.id);
    if (record.attempts + 1 >= MAX_CODE_ATTEMPTS) {
      await consumeVerificationCode(record.id);
      throw new AuthError(
        'Demasiados intentos. Pide un código nuevo.',
        400,
        'CODE_EXPIRED',
      );
    }
    throw new AuthError('El código no es correcto.', 400);
  }

  await consumeVerificationCode(record.id);
  await markEmailVerified(user.id);
  user.email_verified = true;

  return toPublicUser(user);
}

export async function resendVerificationCode({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new AuthError('No existe una cuenta con ese correo.', 404);
  }
  if (user.email_verified) {
    throw new AuthError('Este correo ya está verificado.', 400);
  }

  await issueVerificationCode(user);
}

export async function requestPasswordReset({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) return;

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await saveVerificationCode({
    userId: user.id,
    codeHash: codeHash(code),
    expiresAt,
  });
  await sendPasswordResetCode({ to: user.email, code });
}

export async function resetPassword({ email, code, newPassword }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new AuthError('No existe una cuenta con ese correo.', 404);
  }
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    throw new AuthError('El código debe tener 6 dígitos.', 400);
  }
  if (!isValidPassword(newPassword)) {
    throw new AuthError('La contraseña debe tener al menos 8 caracteres.', 400);
  }

  const record = await findActiveVerificationCode(user.id);
  if (!record) {
    throw new AuthError(
      'El código ha expirado o no es válido. Pide uno nuevo.',
      400,
      'CODE_EXPIRED',
    );
  }

  const matches = codeHash(code) === record.code_hash;
  if (!matches) {
    await incrementCodeAttempts(record.id);
    if (record.attempts + 1 >= MAX_CODE_ATTEMPTS) {
      await consumeVerificationCode(record.id);
      throw new AuthError(
        'Demasiados intentos. Pide un código nuevo.',
        400,
        'CODE_EXPIRED',
      );
    }
    throw new AuthError('El código no es correcto.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await consumeVerificationCode(record.id);
  await updatePassword(user.id, passwordHash);
  await markEmailVerified(user.id);

  return { ok: true };
}

export async function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new AuthError('Correo o contraseña incorrectos.', 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new AuthError('Correo o contraseña incorrectos.', 401);
  }

  if (!user.email_verified) {
    throw new AuthError(
      'Debes verificar tu correo antes de entrar.',
      403,
      'EMAIL_NOT_VERIFIED',
    );
  }

  return toPublicUser(user);
}

export function verificationEmailConfigured() {
  return emailServiceEnabled();
}
