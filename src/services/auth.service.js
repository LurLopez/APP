/**
 * @fileoverview Servicio principal de autenticación, registro de usuarios, login tradicional y OAuth con Google.
 * @module services/auth
 */

export {
  AuthError,
  toPublicUser,
  register,
  verifyEmail,
  resetPassword,
  login,
  loginOrRegisterGoogle,
  changeUsername,
  resendVerificationCode,
  requestPasswordReset,
  verificationEmailConfigured,
} from './auth.service.core.js';
export { ensureAdminUser, checkIsAdmin } from './auth/adminBootstrap.service.js';
