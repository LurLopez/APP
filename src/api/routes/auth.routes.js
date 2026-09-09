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

const router = Router();

router.get('/google', googleAuth);
router.get('/google/callback', googleAuthCallback);
router.post('/register', register);
router.post('/verify', verify);
router.post('/resend-code', resendCode);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', requireAuth, me);
router.patch('/username', requireAuth, updateUsername);

export default router;
