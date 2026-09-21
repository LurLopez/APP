import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getCompanyCalendar } from '../src/services/market/companyCalendar.service.js';
import { BENCHMARK_CONSUMER_DEFENSIVE } from '../src/services/seo/seoConstants.js';

const args = process.argv.slice(2);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};

const OUT_FILE = resolve(argValue('out') || 'scratch/calendario/resultados-cifra.ics');
const DAYS = Number(argValue('days') || 200);
const CONCURRENCY = Number(argValue('concurrency') || 4);
const TICKERS = argValue('tickers')
  ? argValue('tickers')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .map((ticker) => ({ ticker, name: ticker }))
  : BENCHMARK_CONSUMER_DEFENSIVE;

const today = new Date().toISOString().slice(0, 10);
const limit = new Date();
limit.setUTCDate(limit.getUTCDate() + DAYS);
const LIMIT = limit.toISOString().slice(0, 10);

async function fetchAll(items) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      try {
        const calendar = await getCompanyCalendar(item.ticker);
        results.push({ ...item, ...calendar });
      } catch {
        results.push({ ...item, earningsDate: null, earningsDateEstimate: false, exDividendDate: null, dividendDate: null });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

function icsEscape(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

function icsDate(isoDate) {
  return isoDate.replaceAll('-', '');
}

function icsNextDate(isoDate) {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10).replaceAll('-', '');
}

function stamp() {
  return `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function buildIcs(earnings, exDividends) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cifra Research//Calendario consumo defensivo//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Cifra — Resultados consumo defensivo',
    'X-WR-TIMEZONE:UTC',
  ];

  for (const item of earnings) {
    const url = `https://cifraresearch.com/empresa/${encodeURIComponent(item.ticker)}`;
    const summary = `Resultados ${item.ticker} — ${item.name}${item.earningsDateEstimate ? ' (fecha estimada)' : ''}`;
    const description = `Anuncio de resultados de ${item.name} ($${item.ticker}).${item.earningsDateEstimate ? ' Fecha estimada por Yahoo Finance.' : ''} Análisis y datos: ${url}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:cifra-earnings-${item.ticker}-${item.earningsDate}@cifraresearch.com`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${icsDate(item.earningsDate)}`,
      `DTEND;VALUE=DATE:${icsNextDate(item.earningsDate)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`Mañana publica resultados ${item.ticker} — prepara el análisis`)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT15H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`Resultados de ${item.ticker} en ~9 horas`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  for (const item of exDividends) {
    const url = `https://cifraresearch.com/empresa/${encodeURIComponent(item.ticker)}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:cifra-exdiv-${item.ticker}-${item.exDividendDate}@cifraresearch.com`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${icsDate(item.exDividendDate)}`,
      `DTEND;VALUE=DATE:${icsNextDate(item.exDividendDate)}`,
      `SUMMARY:${icsEscape(`Ex-dividendo ${item.ticker} — ${item.name}`)}`,
      `DESCRIPTION:${icsEscape(`Fecha ex-dividendo de ${item.name} ($${item.ticker}). Ficha: ${url}`)}`,
      `URL:${url}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

console.log(`Consultando Yahoo Finance para ${TICKERS.length} empresas (ventana hasta ${LIMIT})...\n`);
const data = await fetchAll(TICKERS);

const earnings = data
  .filter((item) => item.earningsDate && item.earningsDate >= today && item.earningsDate <= LIMIT)
  .sort((a, b) => a.earningsDate.localeCompare(b.earningsDate));

const exDividends = data
  .filter((item) => item.exDividendDate && item.exDividendDate >= today && item.exDividendDate <= LIMIT)
  .sort((a, b) => a.exDividendDate.localeCompare(b.exDividendDate));

console.log('=== PRÓXIMOS RESULTADOS ===');
if (earnings.length) {
  for (const item of earnings) {
    const estimate = item.earningsDateEstimate ? ' (estimada)' : '';
    console.log(`${item.earningsDate}${estimate}  $${item.ticker.padEnd(6)} ${item.name}`);
  }
} else {
  console.log('(ninguno en la ventana)');
}

console.log('\n=== PRÓXIMOS EX-DIVIDENDOS ===');
if (exDividends.length) {
  for (const item of exDividends) {
    console.log(`${item.exDividendDate}  $${item.ticker.padEnd(6)} ${item.name}`);
  }
} else {
  console.log('(ninguno en la ventana)');
}

const withoutEarnings = data.filter((item) => !item.earningsDate).map((item) => item.ticker);
if (withoutEarnings.length) {
  console.log(`\nSin fecha de resultados publicada por Yahoo: ${withoutEarnings.join(', ')}`);
}

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, buildIcs(earnings, exDividends), 'utf8');
console.log(`\nCalendario .ics escrito en: ${OUT_FILE} (${earnings.length} resultados, ${exDividends.length} ex-dividendos)`);
console.log('Importar en Google Calendar: Configuración → Importar y exportar → Importar.');
