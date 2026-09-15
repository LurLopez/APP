import { query } from '../pool.js';

const USER_COLUMNS = 'id, email, username, plan, role, email_verified, google_id, created_at, token_version';

export async function createUser({ email, passwordHash, plan = 'free', username = null, role = 'user' }) {
  const defaultUsername = username || email.split('@')[0];
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, plan, username, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [email, passwordHash, plan, defaultUsername, role],
  );
  return rows[0];
}

export async function createGoogleUser({ email, googleId, plan = 'free', username = null }) {
  const defaultUsername = username || email.split('@')[0];
  const { rows } = await query(
    `INSERT INTO users (email, google_id, email_verified, plan, username)
     VALUES ($1, $2, true, $3, $4)
     RETURNING ${USER_COLUMNS}`,
    [email, googleId, plan, defaultUsername],
  );
  return rows[0];
}

export async function findUserById(id) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserByGoogleId(googleId) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE google_id = $1`,
    [googleId],
  );
  return rows[0] ?? null;
}

export async function findUserByUsername(username) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rows[0] ?? null;
}

export async function linkGoogleAccount(userId, googleId) {
  const { rows } = await query(
    `UPDATE users
     SET google_id = $2, email_verified = true
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, googleId],
  );
  return rows[0] ?? null;
}

export async function updateUsername(userId, username) {
  const { rows } = await query(
    `UPDATE users
     SET username = $2
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, username],
  );
  return rows[0] ?? null;
}

export async function markEmailVerified(userId) {
  await query(`UPDATE users SET email_verified = true WHERE id = $1`, [userId]);
}

export async function updatePassword(userId, passwordHash) {
  // Incrementa token_version para invalidar todas las sesiones JWT anteriores
  // (los tokens antiguos llevan una versión distinta y dejan de ser válidos).
  await query(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1`,
    [userId, passwordHash],
  );
}

export async function saveVerificationCode({ userId, codeHash, expiresAt }) {
  await query(
    `INSERT INTO verification_codes (user_id, code_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, codeHash, expiresAt],
  );
}

export async function findActiveVerificationCode(userId) {
  const { rows } = await query(
    `SELECT id, code_hash, attempts, expires_at
     FROM verification_codes
     WHERE user_id = $1 AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function deleteVerificationCodesForUser(userId) {
  await query(`DELETE FROM verification_codes WHERE user_id = $1`, [userId]);
}

export async function consumeVerificationCode(codeId) {
  await query(`DELETE FROM verification_codes WHERE id = $1`, [codeId]);
}

export async function incrementCodeAttempts(codeId) {
  await query(
    `UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`,
    [codeId],
  );
}

export async function updateUserRole(userId, role) {
  const { rows } = await query(
    `UPDATE users
     SET role = $2
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, role],
  );
  return rows[0] ?? null;
}

