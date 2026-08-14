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

export function emailServiceEnabled() {
  return Boolean(transporter);
}

export async function sendVerificationCode({ to, code }) {
  if (!transporter) {
    console.log('==================================================');
    console.log(`[DEV] Código de verificación para ${to}: ${code}`);
    console.log('==================================================');
    return;
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject: 'Tu código de verificación — Cifra',
    text: `Tu código de verificación es: ${code}\nVálido durante 15 minutos.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#111">Verifica tu correo</h2>
        <p>Tu código de verificación de Cifra es:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px;background:#f5f5f5;padding:12px;text-align:center">${code}</p>
        <p>Es válido durante 15 minutos. Si no has creado una cuenta, ignora este correo.</p>
      </div>
    `,
  });
}
