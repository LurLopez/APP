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
import { seedDefaultMetricFavorites, countMetricFavorites } from '../../../db/repositories/metricFavoriteRepository.js';
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
 * Aplica las métricas favoritas por defecto a la cuenta admin cuando todavía
 * no tiene ninguna (instalaciones nuevas o cuenta recién creada).
 * @private
 * @param {number} userId - Identificador del administrador.
 * @returns {Promise<void>}
 */
async function applyDefaultMetricFavoritesIfEmpty(userId) {
  try {
    if (await countMetricFavorites(userId) > 0) return;
    const inserted = await seedDefaultMetricFavorites(userId);
    if (inserted > 0) {
      console.log(`[auth] Favoritos por defecto aplicados al admin (${inserted} métricas).`);
    }
  } catch (error) {
    console.error('[auth:default-favorites]', error.message);
  }
}

/**
 * Asegura la existencia del usuario administrador exclusivo definido en la configuración.
 * Degrada cualquier otro usuario que tuviera rol admin para evitar escaladas de privilegios.
 * @returns {Promise<Object|null>} Registro del usuario administrador.
 */
export async function ensureAdminUser() {
  const { username, password, email } = config.adminUser || {};
  if (!username || !password) return null;

  if (password.length < 12) {
    console.warn('[auth] AVISO: ADMIN_PASSWORD tiene menos de 12 caracteres; usa una contraseña más larga y aleatoria.');
  }

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

  await applyDefaultMetricFavoritesIfEmpty(adminUser.id);

  const { rowCount } = await query(
    `UPDATE users SET role = 'user' WHERE role = 'admin' AND id <> $1`,
    [adminUser.id],
  );
  if (rowCount > 0) {
    console.log(`[auth] Retirado el rol admin a ${rowCount} cuenta(s) no autorizada(s).`);
  }

  console.log(`[auth] Usuario admin asegurado: username='${adminUser.username}' (rol: admin)`);
  return adminUser;
}
