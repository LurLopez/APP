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
const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  scope: 'auth:session',
  message: 'Demasiadas operaciones de sesión. Espera unos minutos antes de volver a intentarlo.',
});
const profileLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  scope: 'auth:profile',
  message: 'Has actualizado tu perfil demasiadas veces. Inténtalo más tarde.',
});

router.get('/google', sessionLimiter, googleAuth);
router.get('/google/callback', sessionLimiter, googleAuthCallback);
router.post('/register', registerLimiter, register);
router.post('/verify', verifyLimiter, verify);
router.post('/resend-code', resendLimiter, resendCode);
router.post('/login', loginLimiter, login);
router.post('/logout', sessionLimiter, logout);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);
router.get('/me', requireAuth, me);
router.patch('/username', requireAuth, profileLimiter, updateUsername);

export default router;
