import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

try {
  const schema = await fs.readFile(schemaPath, 'utf8');
  await pool.query(schema);
  console.log('Base de datos preparada correctamente.');
} catch (error) {
  console.error('No se pudo preparar la base de datos:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
