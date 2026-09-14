/**
 * @fileoverview Servicio para el aprovisionamiento y blindaje del usuario administrador del sistema desde variables de entorno.
 * @module services/auth/adminBootstrap
 */

import bcrypt from 'bcryptjs';
import { query } from '../../../db/pool.js';
import {
  findUserByEmail,
  findUserByUsername,
} from '../../../db/repositories/userRepository.js';
import { normalizeEmail } from '../../utils/validate.js';
import config from '../../../config/index.js';

const SALT_ROUNDS = 10;

/**
 * Comprueba si un registro de usuario posee permisos de administración.
 * @param {Object|null} user - Registro del usuario.
 * @returns {boolean}
 */
export function checkIsAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

/**
 * Asegura la existencia del usuario administrador exclusivo definido en la configuración.
 * Degrada cualquier otro usuario que tuviera rol admin para evitar escaladas de privilegios.
 * @returns {Promise<Object|null>} Registro del usuario administrador.
 */
export async function ensureAdminUser() {
  const { username, password, email } = config.adminUser || {};
  if (!username || !password) return null;

  const normalizedEmail = normalizeEmail(email || `${username}@cifra.local`);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const existingByUsername = await findUserByUsername(username);
  const existingByEmail = await findUserByEmail(normalizedEmail);
  const existing = existingByUsername || existingByEmail;

  let adminUser = null;

  if (existing) {
    const { rows } = await query(
      `UPDATE users
       SET password_hash = $1,
           role = 'admin',
           email_verified = true,
           username = $2,
           email = COALESCE(email, $3)
       WHERE id = $4
       RETURNING id, email, username, role, plan, email_verified`,
      [passwordHash, username, normalizedEmail, existing.id],
    );
    adminUser = rows[0];
  } else {
    const { rows } = await query(
      `INSERT INTO users (email, username, password_hash, role, plan, email_verified)
       VALUES ($1, $2, $3, 'admin', 'premium', true)
       RETURNING id, email, username, role, plan, email_verified`,
      [normalizedEmail, username, passwordHash],
    );
    adminUser = rows[0];
  }

  const { rowCount } = await query(
    `UPDATE users SET role = 'user' WHERE role = 'admin' AND id <> $1`,
    [adminUser.id],
  );
  if (rowCount > 0) {
    console.log(`[auth] Retirado el rol admin a ${rowCount} cuenta(s) no autorizada(s).`);
  }

  console.log(`[auth] Usuario admin asegurado: username='${adminUser.username}', email='${adminUser.email}' (rol: admin)`);
  return adminUser;
}
