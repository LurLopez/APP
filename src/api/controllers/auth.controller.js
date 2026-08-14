import jwt from 'jsonwebtoken';
import config from '../../../config/index.js';
import * as authService from '../../services/auth.service.js';
import { toPublicUser } from '../../services/auth.service.js';

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function register(req, res) {
  const user = await authService.register(req.body);
  res.status(201).json({
    user,
    message: 'Revisa tu correo: te hemos enviado un código de verificación.',
  });
}

export async function verify(req, res) {
  const user = await authService.verifyEmail(req.body);
  setAuthCookie(res, user.id);
  res.json({ user });
}

export async function resendCode(req, res) {
  await authService.resendVerificationCode(req.body);
  res.json({ ok: true, message: 'Te hemos enviado un código nuevo.' });
}

export async function login(req, res) {
  const user = await authService.login(req.body);
  setAuthCookie(res, user.id);
  res.json({ user });
}

export function logout(_req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({ user: toPublicUser(req.user) });
}
