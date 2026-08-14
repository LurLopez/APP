import { query } from '../pool.js';

const USER_COLUMNS = 'id, email, plan, email_verified, created_at';

export async function createUser({ email, passwordHash, plan = 'free' }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, plan)
     VALUES ($1, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [email, passwordHash, plan],
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

export async function markEmailVerified(userId) {
  await query(`UPDATE users SET email_verified = true WHERE id = $1`, [userId]);
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

export async function consumeVerificationCode(codeId) {
  await query(`DELETE FROM verification_codes WHERE id = $1`, [codeId]);
}

export async function incrementCodeAttempts(codeId) {
  await query(
    `UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`,
    [codeId],
  );
}
