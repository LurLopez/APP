import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { findUserById } from '../../db/repositories/userRepository.js';

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

    req.user = user;
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
    return await findUserById(payload.sub);
  } catch {
    return null;
  }
}
