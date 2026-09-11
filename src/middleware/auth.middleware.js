import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { findUserById } from '../../db/repositories/userRepository.js';

function checkAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Sesión no iniciada.' });
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'La sesión ya no es válida.' });
    }

    const isAdmin = checkAdmin(user);
    req.user = {
      ...user,
      role: isAdmin ? 'admin' : (user.role || 'user'),
      isAdmin,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o ha expirado.' });
  }
}

export async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Sesión no iniciada. Inicia sesión como administrador.' });
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'La sesión ya no es válida.' });
    }

    const isAdmin = checkAdmin(user);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acceso restringido a administradores.' });
    }

    req.user = {
      ...user,
      role: 'admin',
      isAdmin: true,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o ha expirado.' });
  }
}

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

