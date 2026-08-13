import { query } from '../pool.js';

const USER_COLUMNS = 'id, email, plan, created_at';

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
