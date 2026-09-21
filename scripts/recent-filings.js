import { getCompanyFilings } from '../src/services/edgar/filingPeriods.js';
import { BENCHMARK_CONSUMER_DEFENSIVE } from '../src/services/seo/seoConstants.js';

const args = process.argv.slice(2);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};

const DAYS = Number(argValue('days') || 90);
const PER_COMPANY = Number(argValue('limit') || 6);
const TICKERS = argValue('tickers')
  ? argValue('tickers')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .map((ticker) => ({ ticker, name: ticker }))
  : BENCHMARK_CONSUMER_DEFENSIVE;

const since = new Date();
since.setUTCDate(since.getUTCDate() - DAYS);
const SINCE = argValue('since') || since.toISOString().slice(0, 10);

async function fetchAll(items) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      try {
        const { filings } = await getCompanyFilings(item.ticker, { limit: PER_COMPANY });
        results.push({ ...item, filings });
      } catch (error) {
        results.push({ ...item, filings: [], error: error.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
  return results;
}

console.log(`Últimos 10-Q/10-K de ${TICKERS.length} empresas (presentados desde ${SINCE})...\n`);
const data = await fetchAll(TICKERS);

const recent = data
  .flatMap((company) =>
    company.filings
      .filter((filing) => filing.filedAt && filing.filedAt >= SINCE)
      .map((filing) => ({ ...filing, ticker: company.ticker, companyName: company.name })),
  )
  .sort((a, b) => b.filedAt.localeCompare(a.filedAt) || a.ticker.localeCompare(b.ticker));

console.log('=== PRESENTADOS ===');
if (recent.length) {
  for (const filing of recent) {
    console.log(
      `${filing.filedAt}  ${filing.formType}  ${String(filing.periodLabel).padEnd(12)}  $${filing.ticker.padEnd(6)} ${filing.companyName}\n            ${filing.documentUrl}`,
    );
  }
} else {
  console.log('(ninguno en el periodo)');
}

const errors = data.filter((company) => company.error);
if (errors.length) {
  console.log(`\nErrores al consultar EDGAR: ${errors.map((c) => `${c.ticker} (${c.error})`).join(', ')}`);
}

const sinFilingsRecientes = data
  .filter((company) => !company.error && !company.filings.some((f) => f.filedAt >= SINCE))
  .map((company) => company.ticker);
if (sinFilingsRecientes.length) {
  console.log(`\nSin presentaciones en el periodo: ${sinFilingsRecientes.join(', ')}`);
}
