import { query } from '../pool.js';

// Día natural en horario de Madrid para que el cupo diario cambie a medianoche local.
const MADRID_DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')`;

export async function countAiGenerationsToday(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
     FROM ai_generation_usage
     WHERE user_id = $1 AND created_at >= ${MADRID_DAY_START}`,
    [userId],
  );
  return rows[0]?.count ?? 0;
}

export async function createAiGenerationUsage(userId) {
  const { rows } = await query(
    `INSERT INTO ai_generation_usage (user_id)
     VALUES ($1)
     RETURNING id, user_id, created_at`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function deleteAiGenerationUsage(id) {
  await query(`DELETE FROM ai_generation_usage WHERE id = $1`, [id]);
}
