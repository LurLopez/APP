/**
 * Verificación manual de la promoción de MU a producción (cifra_prod + ficheros).
 * Uso: node scratch/verify-prod-mu.js
 */
import { execFileSync } from 'node:child_process';

const SSH = 'cifra-vps';
const REMOTE_PSQL = `cd /var/www/cifra-prod && psql "$(node --env-file=.env -p 'process.env.DATABASE_URL')" -v ON_ERROR_STOP=1 -tA -f -`;

const sql = `SELECT id, ticker, language, is_reviewed, is_public,
       to_char(reviewed_at, 'YYYY-MM-DD HH24:MI') AS reviewed, pdf_url
  FROM analyses
 WHERE accession = '0000723125-26-000023'
 ORDER BY id;`;

console.log('=== filas en cifra_prod ===');
console.log(execFileSync('ssh', [SSH, REMOTE_PSQL], { input: sql, encoding: 'utf8' }));

console.log('=== ficheros en producción ===');
console.log(execFileSync('ssh', [SSH,
  'ls -l /var/www/cifra-prod/uploads/generated/0f870e28-d4e3-4631-b50b-6155fc4ec586.pdf '
  + '/var/www/cifra-prod/uploads/generated/1f47c15d-8e56-4d8e-be60-51e5d21ccb2d.pdf '
  + '/var/www/cifra-prod/uploads/generated/0f870e28-d4e3-4631-b50b-6155fc4ec586.html '
  + '/var/www/cifra-prod/uploads/generated/1f47c15d-8e56-4d8e-be60-51e5d21ccb2d.html',
], { encoding: 'utf8' }));
