/**
 * @fileoverview Middlewares para autenticación, autorización y resolución de sesión de usuario mediante JWT en cookies.
 * @module middleware/auth
 */

import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { findUserById } from '../../db/repositories/userRepository.js';

/**
 * Comprueba si un registro de usuario cuenta con rol de administrador.
 * @private
 * @param {Object|null} user - Registro del usuario.
 * @returns {boolean} Verdadero si es admin.
 */
function checkAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

/**
 * Middleware que exige sesión autenticada válida; rechaza con 401 si no hay token o expiró.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Siguiente middleware.
 * @returns {Promise<void>}
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      res.status(401).json({ error: 'Sesión no iniciada.', code: 'AUTH_REQUIRED' });
      return;
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.sub);

    if (!user) {
      res.status(401).json({ error: 'La sesión ya no es válida.', code: 'AUTH_REQUIRED' });
      return;
    }

    const isAdmin = checkAdmin(user);
    req.user = {
      ...user,
      role: isAdmin ? 'admin' : (user.role || 'user'),
      isAdmin,
    };
    next();
  } catch {
    res.status(401).json({ error: 'La sesión no es válida o ha expirado.', code: 'AUTH_REQUIRED' });
  }
}

/**
 * Middleware que restringe el acceso exclusivamente a usuarios con rol de administrador.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Siguiente middleware.
 * @returns {Promise<void>}
 */
export async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      res.status(401).json({ error: 'Sesión no iniciada. Inicia sesión como administrador.' });
      return;
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.sub);

    if (!user) {
      res.status(401).json({ error: 'La sesión ya no es válida.' });
      return;
    }

    const isAdmin = checkAdmin(user);
    if (!isAdmin) {
      res.status(403).json({ error: 'Acceso restringido a administradores.' });
      return;
    }

    req.user = {
      ...user,
      role: 'admin',
      isAdmin: true,
    };
    next();
  } catch {
    res.status(401).json({ error: 'La sesión no es válida o ha expirado.' });
  }
}

/**
 * Resuelve de forma no bloqueante el usuario autenticado a partir de la cookie de sesión.
 * Si no hay sesión o es inválida, retorna null sin lanzar errores ni interrumpir la petición.
 * @param {import('express').Request} req - Petición HTTP.
 * @returns {Promise<Object|null>} Objeto de usuario autenticado o null.
 */
export async function resolveUser(req) {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.sub);
    if (!user) return null;
    const isAdmin = checkAdmin(user);
    return {
      ...user,
      role: isAdmin ? 'admin' : (user.role || 'user'),
      isAdmin,
    };
  } catch {
    return null;
  }
}
