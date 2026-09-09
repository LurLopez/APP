import { query } from '../pool.js';

const MESSAGE_FIELDS = `
  m.id,
  m.ticker,
  m.user_id,
  COALESCE(u.username, split_part(u.email, '@', 1)) AS user_name,
  m.parent_id,
  m.message,
  m.created_at,
  m.updated_at
`;

export async function createMessage({ ticker, userId, message, parentId = null }) {
  if (parentId !== null && parentId !== undefined) {
    const { rows: parentRows } = await query(
      `SELECT id, ticker FROM forum_messages WHERE id = $1`,
      [parentId],
    );
    if (parentRows.length === 0) {
      const error = new Error('El mensaje al que intentas responder no existe.');
      error.statusCode = 404;
      throw error;
    }
    if (parentRows[0].ticker !== ticker) {
      const error = new Error('El mensaje pertenece a otra empresa.');
      error.statusCode = 400;
      throw error;
    }
  }

  const { rows } = await query(
    `INSERT INTO forum_messages (ticker, user_id, parent_id, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, ticker, user_id, parent_id, message, created_at, updated_at`,
    [ticker, userId, parentId, message],
  );

  const created = rows[0];

  const { rows: userRows } = await query(
    `SELECT COALESCE(username, split_part(email, '@', 1)) AS user_name FROM users WHERE id = $1`,
    [userId],
  );

  return {
    ...created,
    user_name: userRows[0]?.user_name ?? 'Inversor',
  };
}

export async function getMessagesByTicker(ticker) {
  const { rows } = await query(
    `SELECT ${MESSAGE_FIELDS}
     FROM forum_messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.ticker = $1
     ORDER BY m.created_at ASC`,
    [ticker],
  );

  const threadMap = new Map();
  const threads = [];
  const replies = [];

  for (const row of rows) {
    if (!row.parent_id) {
      row.replies = [];
      threadMap.set(row.id, row);
      threads.push(row);
    } else {
      replies.push(row);
    }
  }

  for (const reply of replies) {
    const parent = threadMap.get(reply.parent_id);
    if (parent) {
      parent.replies.push(reply);
    } else {
      let target = null;
      for (const t of threads) {
        if (t.id === reply.parent_id || t.replies.some((r) => r.id === reply.parent_id)) {
          target = t;
          break;
        }
      }
      if (target) {
        target.replies.push(reply);
      } else {
        reply.replies = [];
        threads.push(reply);
      }
    }
  }

  // Hilos principales ordenados de más reciente a más antiguo
  threads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    raw: rows,
    threads,
  };
}

export async function getMessageById(id) {
  const { rows } = await query(
    `SELECT ${MESSAGE_FIELDS}
     FROM forum_messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function deleteMessage(userId, messageId) {
  const { rowCount } = await query(
    `DELETE FROM forum_messages WHERE id = $1 AND user_id = $2`,
    [messageId, userId],
  );
  return rowCount > 0;
}
