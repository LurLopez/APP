import nodemailer from 'nodemailer';

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

const MAIL_FROM = process.env.MAIL_FROM || 'Cifra <no-reply@cifra.app>';
const MAIL_TO_OVERRIDE = process.env.MAIL_TO_OVERRIDE || '';

export function emailServiceEnabled() {
  return Boolean(transporter);
}

async function sendCode({ to, code, kind, subject, title, message }) {
  const recipient = MAIL_TO_OVERRIDE || to;
  const overridden = Boolean(MAIL_TO_OVERRIDE && MAIL_TO_OVERRIDE !== to);

  if (!transporter) {
    console.log('==================================================');
    console.log(`[DEV] ${kind} para ${to}: ${code}`);
    console.log('==================================================');
    return;
  }

  if (overridden) {
    console.log(`[MAIL] Override de pruebas: el correo para ${to} se envía a ${recipient}`);
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to: recipient,
    subject,
    text: `${message} ${code}\nVálido durante 15 minutos.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#111">${title}</h2>
        <p>${message}</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px;background:#f5f5f5;padding:12px;text-align:center">${code}</p>
        <p>Es válido durante 15 minutos. Si no has solicitado este código, ignora este correo.</p>
      </div>
    `,
  });
}

export async function sendVerificationCode({ to, code }) {
  await sendCode({
    to,
    code,
    kind: 'Código de verificación',
    subject: 'Tu código de verificación — Cifra',
    title: 'Verifica tu correo',
    message: 'Tu código de verificación de Cifra es:',
  });
}

export async function sendPasswordResetCode({ to, code }) {
  await sendCode({
    to,
    code,
    kind: 'Código de restablecimiento de contraseña',
    subject: 'Restablece tu contraseña — Cifra',
    title: 'Restablece tu contraseña',
    message: 'Tu código para restablecer la contraseña de Cifra es:',
  });
}
