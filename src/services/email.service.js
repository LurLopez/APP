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

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendCompanyEventAlert({ to, ticker, companyName, eventType, eventTitle, eventDate, details }) {
  const recipient = MAIL_TO_OVERRIDE || to;
  const typeIcons = {
    earnings: '📊',
    exdiv: '⏳',
    payout: '💰',
  };
  const icon = typeIcons[eventType] || '🔔';
  const subject = `${icon} Aviso de ${eventTitle} — ${ticker} (${companyName || ticker})`;

  if (!transporter) {
    console.log('==================================================');
    console.log(`[DEV EMAIL ALERT] Para: ${to} | Asunto: ${subject}`);
    console.log(`[DEV EMAIL ALERT] Detalles: ${details} (${eventDate})`);
    console.log('==================================================');
    return;
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to: recipient,
    subject,
    text: `Aviso para ${companyName} (${ticker}):\n${eventTitle} - ${eventDate}\n\n${details}\n\nPuedes consultar el informe y análisis interactivo en Cifra Terminal.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="margin-bottom: 16px;">
          <span style="font-size: 11px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px;">Cifra · Alertas de Mercado</span>
          <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 18px;">${icon} ${eventTitle}</h2>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">${escapeHtml(companyName || ticker)} (${escapeHtml(ticker)}) · Fecha: <strong>${escapeHtml(eventDate)}</strong></p>
        </div>
        <div style="background: #f8fafc; border-left: 3px solid #2563eb; border-radius: 6px; padding: 12px 14px; margin: 16px 0;">
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #334155;">${escapeHtml(details)}</p>
        </div>
        <p style="font-size: 11.5px; color: #94a3b8; margin-top: 20px; text-align: center;">Has recibido este correo porque tienes activadas las alertas por email para ${escapeHtml(ticker)}. Puedes gestionar tus notificaciones en cualquier momento desde Cifra.</p>
      </div>
    `,
  });
}

export async function sendPriceAlertNotification({ to, ticker, companyName, targetPrice, currentPrice, condition }) {
  const recipient = MAIL_TO_OVERRIDE || to;
  const isGte = condition === 'gte';
  const condText = isGte ? 'igual o superior a' : 'igual o inferior a';
  const condSymbol = isGte ? '≥' : '≤';
  const subject = `🎯 Alerta de precio cumplida: ${ticker} ha tocado los $${Number(currentPrice).toFixed(2)}`;

  if (!transporter) {
    console.log('==================================================');
    console.log(`[DEV PRICE ALERT] Para: ${to} | Asunto: ${subject}`);
    console.log(`[DEV PRICE ALERT] ${ticker} (${companyName}): Actual $${Number(currentPrice).toFixed(2)} ${condSymbol} Objetivo $${Number(targetPrice).toFixed(2)}`);
    console.log('==================================================');
    return;
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to: recipient,
    subject,
    text: `Alerta de precio para ${companyName} (${ticker}):\n`
      + `La cotización ha alcanzado $${Number(currentPrice).toFixed(2)}, cumpliendo tu condición de precio (${condText} $${Number(targetPrice).toFixed(2)}).\n\n`
      + `Tu alerta ha sido marcada como cumplida en Cifra Terminal.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="margin-bottom: 16px;">
          <span style="font-size: 11px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px;">Cifra · Alertas de Precio</span>
          <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px;">🎯 Alerta de precio alcanzada</h2>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">${escapeHtml(companyName || ticker)} (<strong>${escapeHtml(ticker)}</strong>)</p>
        </div>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
          <div style="font-size: 12px; color: #15803d; font-weight: 600; text-transform: uppercase;">Precio actual de mercado</div>
          <div style="font-size: 32px; font-weight: 800; color: #166534; margin: 4px 0;">$${Number(currentPrice).toFixed(2)}</div>
          <div style="font-size: 13px; color: #374151;">Condición: <strong>${condSymbol} $${Number(targetPrice).toFixed(2)}</strong> (${condText} $${Number(targetPrice).toFixed(2)})</div>
        </div>
        <div style="background: #f8fafc; border-left: 3px solid #16a34a; border-radius: 6px; padding: 12px 14px; margin: 16px 0;">
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #334155;">Esta alerta ha pasado de <strong>Pendiente</strong> a <strong>Cumplida</strong> en tu panel de Cifra.</p>
        </div>
        <p style="font-size: 11.5px; color: #94a3b8; margin-top: 20px; text-align: center;">Has recibido este correo porque configuraste una alerta de precio para ${escapeHtml(ticker)} en Cifra.</p>
      </div>
    `,
  });
}
