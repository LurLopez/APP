import nodemailer from 'nodemailer';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '';
const KEY_FILE = resolve(
  process.env.GA4_SERVICE_ACCOUNT_PATH || '.secrets/ga4-service-account.json',
);
const MAIL_TO = process.env.REPORT_EMAIL_TO || 'lurlopez13@gmail.com';

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

if (!PROPERTY_ID || !smtpConfigured) {
  console.error(
    'Faltan variables: GA4_PROPERTY_ID y SMTP_HOST/SMTP_USER/SMTP_PASS son obligatorias.',
  );
  process.exit(1);
}

const ga4 = new BetaAnalyticsDataClient({
  credentials: JSON.parse(readFileSync(KEY_FILE, 'utf8')),
});

const METRICS = [
  'activeUsers',
  'newUsers',
  'sessions',
  'screenPageViews',
  'engagedSessions',
  'userEngagementDuration',
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function ranges(days) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return [
    { name: 'actual', start: isoDate(start), end: isoDate(end) },
    { name: 'anterior', start: isoDate(prevStart), end: isoDate(prevEnd) },
  ];
}

async function callReport(req) {
  // El cliente Node de GA4 devuelve una tupla [response, ...]; normalizamos.
  const res = await ga4.runReport(req);
  return Array.isArray(res) ? res[0] : res;
}

async function totals(days) {
  const [actual, anterior] = ranges(days);
  const fetchRange = async ({ start, end }) => {
    const res = await callReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: start, endDate: end }],
      metrics: METRICS.map((name) => ({ name })),
    });
    return res.rows?.[0]?.metricValues?.map((m) => Number(m.value)) ?? [0, 0, 0, 0, 0, 0];
  };
  const [valsActual, valsAnterior] = await Promise.all([fetchRange(actual), fetchRange(anterior)]);
  const pick = (vals, i) => vals[i] ?? 0;
  const build = (vals) => {
    const usuarios = pick(vals, 0);
    const nuevos = pick(vals, 1);
    const sesiones = pick(vals, 2);
    const paginas = pick(vals, 3);
    const engaged = pick(vals, 4);
    const duration = pick(vals, 5);
    return {
      usuarios,
      nuevos,
      sesiones,
      paginas,
      engagement: sesiones ? (engaged / sesiones) * 100 : 0,
      duracion: sesiones ? duration / sesiones : 0,
    };
  };
  return { actual: build(valsActual), anterior: build(valsAnterior), rango: actual, rangoAnterior: anterior };
}

async function breakdown(dimension, days, limit = 8) {
  const [actual] = ranges(days);
  const res = await callReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate: actual.start, endDate: actual.end }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    limit,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });
  return (res.rows || []).map((r) => ({
    clave: r.dimensionValues[0].value,
    sesiones: Number(r.metricValues[0].value),
    usuarios: Number(r.metricValues[1].value),
  }));
}

function delta(actual, anterior) {
  if (anterior === 0) return actual > 0 ? 'nuevo' : '—';
  const pct = ((actual - anterior) / anterior) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function arrow(actual, anterior) {
  if (actual > anterior) return '🟢';
  if (actual < anterior) return '🔴';
  return '⚪';
}

function fmtInt(n) {
  return Number(n).toLocaleString('es-ES');
}

function fmtDur(sec) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
}

function compareTable(title, t) {
  const rows = [
    ['Usuarios activos', t.actual.usuarios, t.anterior.usuarios, fmtInt],
    ['Usuarios nuevos', t.actual.nuevos, t.anterior.nuevos, fmtInt],
    ['Sesiones', t.actual.sesiones, t.anterior.sesiones, fmtInt],
    ['Páginas vistas', t.actual.paginas, t.anterior.paginas, fmtInt],
    ['Tasa de engagement', t.actual.engagement, t.anterior.engagement, (v) => `${v.toFixed(0)}%`],
    ['Duración media sesión', t.actual.duracion, t.anterior.duracion, fmtDur],
  ];
  const body = rows
    .map(
      ([label, a, b, fmt]) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${label}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(a)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#777">${fmt(b)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${arrow(a, b)} ${delta(a, b)}</td>
      </tr>`,
    )
    .join('');
  return `
    <h3 style="margin:18px 0 6px">${title}
      <span style="font-weight:normal;color:#777;font-size:13px">
        (${t.rango.start} → ${t.rango.end} vs ${t.rangoAnterior.start} → ${t.rangoAnterior.end})
      </span>
    </h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="color:#777">
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd">Métrica</th>
        <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #ddd">Esta semana</th>
        <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #ddd">Semana anterior</th>
        <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #ddd">Cambio</th>
      </tr>
      ${body}
    </table>`;
}

function listTable(title, rows) {
  if (!rows.length) return '';
  const body = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${r.clave}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmtInt(r.sesiones)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmtInt(r.usuarios)}</td>
      </tr>`,
    )
    .join('');
  return `
    <h3 style="margin:18px 0 6px">${title}</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="color:#777">
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd"></th>
        <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #ddd">Sesiones</th>
        <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #ddd">Usuarios</th>
      </tr>
      ${body}
    </table>`;
}

const semana = await totals(7);
const cuatro = await totals(28);
const [paginas, fuentes, paises] = await Promise.all([
  breakdown('pagePath', 7),
  breakdown('sessionSource', 7),
  breakdown('country', 7),
]);

const fecha = new Date().toLocaleDateString('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#111">Informe semanal — Cifra Research</h2>
    <p style="color:#777;font-size:13px">Datos de GA4 (propiedad ${PROPERTY_ID}) generados el ${fecha}.</p>
    ${compareTable('Últimos 7 días vs 7 días anteriores', semana)}
    ${compareTable('Últimas 4 semanas vs 4 semanas anteriores', cuatro)}
    ${listTable('Páginas más vistas (7 días)', paginas)}
    ${listTable('Fuentes de tráfico (7 días)', fuentes)}
    ${listTable('Países (7 días)', paises)}
    <p style="color:#aaa;font-size:12px;margin-top:24px">
      Enviado automáticamente por el servidor de Cifra. Los datos de GA4 pueden tener 1-2 días de retraso.
    </p>
  </div>`;

const text = [
  `Informe semanal Cifra Research (${fecha})`,
  '',
  `ÚLTIMOS 7 DÍAS (${semana.rango.start} → ${semana.rango.end}) vs anteriores (${semana.rangoAnterior.start} → ${semana.rangoAnterior.end})`,
  `Usuarios: ${semana.actual.usuarios} vs ${semana.anterior.usuarios} (${delta(semana.actual.usuarios, semana.anterior.usuarios)})`,
  `Nuevos: ${semana.actual.nuevos} vs ${semana.anterior.nuevos} (${delta(semana.actual.nuevos, semana.anterior.nuevos)})`,
  `Sesiones: ${semana.actual.sesiones} vs ${semana.anterior.sesiones} (${delta(semana.actual.sesiones, semana.anterior.sesiones)})`,
  `Páginas: ${semana.actual.paginas} vs ${semana.anterior.paginas} (${delta(semana.actual.paginas, semana.anterior.paginas)})`,
  '',
  `ÚLTIMAS 4 SEMANAS vs 4 ANTERIORES`,
  `Usuarios: ${cuatro.actual.usuarios} vs ${cuatro.anterior.usuarios} (${delta(cuatro.actual.usuarios, cuatro.anterior.usuarios)})`,
  `Sesiones: ${cuatro.actual.sesiones} vs ${cuatro.anterior.sesiones} (${delta(cuatro.actual.sesiones, cuatro.anterior.sesiones)})`,
  `Páginas: ${cuatro.actual.paginas} vs ${cuatro.anterior.paginas} (${delta(cuatro.actual.paginas, cuatro.anterior.paginas)})`,
  '',
  'Páginas más vistas (7 días):',
  ...paginas.map((r) => `  ${r.clave}: ${r.sesiones} sesiones`),
  '',
  'Fuentes (7 días):',
  ...fuentes.map((r) => `  ${r.clave}: ${r.sesiones} sesiones`),
].join('\n');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

await transporter.sendMail({
  from: process.env.MAIL_FROM || 'Cifra <no-reply@cifraresearch.com>',
  to: MAIL_TO,
  subject: `📊 Cifra — informe semanal (${semana.rango.start} → ${semana.rango.end})`,
  text,
  html,
});

console.log(
  `Informe enviado a ${MAIL_TO}: 7d usuarios ${semana.actual.usuarios} (vs ${semana.anterior.usuarios}), sesiones ${semana.actual.sesiones} (vs ${semana.anterior.sesiones}).`,
);
