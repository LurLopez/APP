import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = process.env.GSC_SITE || 'sc-domain:cifraresearch.com';
const KEY_FILE = resolve(
  process.env.GSC_SERVICE_ACCOUNT_PATH ||
    process.env.GA4_SERVICE_ACCOUNT_PATH ||
    '.secrets/ga4-service-account.json',
);
const days = Number(process.argv[2] || 28);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const end = new Date();
end.setUTCDate(end.getUTCDate() - 1);
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - (days - 1));
const START = isoDate(start);
const END = isoDate(end);

const auth = new GoogleAuth({
  credentials: JSON.parse(readFileSync(KEY_FILE, 'utf8')),
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});
const client = await auth.getClient();
const token = await client.getAccessToken();

async function query(body) {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: START, endDate: END, ...body }),
    },
  );
  const json = await res.json();
  if (res.status !== 200) throw new Error(`Search Console API ${res.status}: ${JSON.stringify(json)}`);
  return json.rows || [];
}

const fmt = (n) => Number(n).toLocaleString('es-ES');
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const pos = (n) => n.toFixed(1);

console.log(`Search Console — ${SITE}`);
console.log(`Periodo: ${START} → ${END} (${days} días; Google publica con 2-3 días de retraso)\n`);

const totals = await query({ dimensions: [], rowLimit: 1 });
if (totals.length) {
  const t = totals[0];
  console.log('=== TOTALES ===');
  console.log(
    `Clics: ${fmt(t.clicks)} | Impresiones: ${fmt(t.impressions)} | CTR: ${pct(t.ctr)} | Posición media: ${pos(t.position)}\n`,
  );
} else {
  console.log('=== TOTALES === (sin datos)\n');
}

const daily = await query({ dimensions: ['date'], rowLimit: 100 });
console.log('=== POR DÍA ===');
for (const r of daily) {
  console.log(
    `${r.keys[0]}  clics=${fmt(r.clicks)}  impresiones=${fmt(r.impressions)}  ctr=${pct(r.ctr)}  pos=${pos(r.position)}`,
  );
}
if (!daily.length) console.log('(sin datos)');

const queries = await query({ dimensions: ['query'], rowLimit: 100 });
console.log('\n=== CONSULTAS (todas) ===');
for (const r of queries) {
  console.log(
    `"${r.keys[0]}"  → clics=${fmt(r.clicks)} impresiones=${fmt(r.impressions)} ctr=${pct(r.ctr)} pos=${pos(r.position)}`,
  );
}
if (!queries.length) console.log('(ninguna)');

const pages = await query({ dimensions: ['page'], rowLimit: 100 });
console.log('\n=== PÁGINAS (todas) ===');
for (const r of pages) {
  console.log(
    `${r.keys[0]}  → clics=${fmt(r.clicks)} impresiones=${fmt(r.impressions)} ctr=${pct(r.ctr)} pos=${pos(r.position)}`,
  );
}
if (!pages.length) console.log('(ninguna)');

const countries = await query({ dimensions: ['country'], rowLimit: 50 });
console.log('\n=== PAÍSES ===');
for (const r of countries) {
  console.log(`${r.keys[0]}  → clics=${fmt(r.clicks)} impresiones=${fmt(r.impressions)}`);
}
if (!countries.length) console.log('(ninguno)');

const devices = await query({ dimensions: ['device'], rowLimit: 5 });
console.log('\n=== DISPOSITIVOS ===');
for (const r of devices) {
  console.log(`${r.keys[0]}  → clics=${fmt(r.clicks)} impresiones=${fmt(r.impressions)}`);
}
if (!devices.length) console.log('(ninguno)');

const sitemapsRes = await fetch(
  `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps`,
  { headers: { Authorization: `Bearer ${token.token}` } },
);
const sitemaps = await sitemapsRes.json();
console.log('\n=== SITEMAPS ===');
for (const s of sitemaps.sitemap || []) {
  const c = s.contents?.[0] || {};
  console.log(
    `${s.path}  → enviadas=${c.submitted || 0} indexadas=${c.indexed || 0} errores=${s.errors || 0} avisos=${s.warnings || 0} últimaDescarga=${s.lastDownloaded || '-'}`,
  );
}
if (!sitemaps.sitemap?.length) console.log('(ninguno)');
