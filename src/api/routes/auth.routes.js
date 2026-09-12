import { Router } from 'express';
import {
  forgotPassword,
  googleAuth,
  googleAuthCallback,
  login,
  logout,
  me,
  register,
  resendCode,
  resetPassword,
  updateUsername,
  verify,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  scope: 'auth:login',
  message: 'Demasiados intentos de inicio de sesión. Espera unos minutos antes de volver a intentarlo.',
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  scope: 'auth:register',
  message: 'Se han creado demasiadas cuentas desde tu conexión. Inténtalo más tarde.',
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  scope: 'auth:verify',
  message: 'Demasiados intentos de verificación. Espera unos minutos antes de volver a intentarlo.',
});
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  scope: 'auth:resend',
  message: 'Has solicitado demasiados códigos de verificación. Espera unos minutos.',
});
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  scope: 'auth:forgot',
  message: 'Has solicitado demasiadas recuperaciones de contraseña. Espera unos minutos.',
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  scope: 'auth:reset',
  message: 'Demasiados intentos de restablecimiento. Espera unos minutos antes de volver a intentarlo.',
});

router.get('/google', googleAuth);
router.get('/google/callback', googleAuthCallback);
router.post('/register', registerLimiter, register);
router.post('/verify', verifyLimiter, verify);
router.post('/resend-code', resendLimiter, resendCode);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);
router.get('/me', requireAuth, me);
router.patch('/username', requireAuth, updateUsername);

export default router;
