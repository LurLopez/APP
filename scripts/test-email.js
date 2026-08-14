import { sendVerificationCode } from '../src/services/email.service.js';

const to = process.argv[2] || process.env.MAIL_TO_OVERRIDE || '';

if (!to) {
  console.error('Uso: node --env-file=.env scripts/test-email.js [destinatario]');
  process.exit(1);
}

const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
await sendVerificationCode({ to, code });
console.log('Correo de prueba enviado correctamente.');
