import { query } from '../db/pool.js';
import * as portfolioRepository from '../db/repositories/portfolioRepository.js';
import { getPortfolio } from '../src/services/portfolio/portfolioAggregator.service.js';
import { getPortfolioChart } from '../src/services/portfolio/portfolioChart.service.js';
import { buildState } from '../src/services/portfolio/portfolioFifo.service.js';

const ADMIN_USER_ID = 53;

const TRANSACTIONS = [
  // 1. AAPL
  { ticker: 'AAPL', companyName: 'Apple Inc.', type: 'buy', shares: 25, price: 173.50, tradeDate: '2024-03-15' },
  { ticker: 'AAPL', companyName: 'Apple Inc.', type: 'buy', shares: 15, price: 228.00, tradeDate: '2024-11-20' },
  { ticker: 'AAPL', companyName: 'Apple Inc.', type: 'sell', shares: 8, price: 252.00, tradeDate: '2025-06-10' },

  // 2. MSFT
  { ticker: 'MSFT', companyName: 'MICROSOFT CORP', type: 'buy', shares: 15, price: 382.00, tradeDate: '2024-01-10' },
  { ticker: 'MSFT', companyName: 'MICROSOFT CORP', type: 'buy', shares: 10, price: 425.00, tradeDate: '2024-09-18' },
  { ticker: 'MSFT', companyName: 'MICROSOFT CORP', type: 'sell', shares: 15, price: 448.00, tradeDate: '2025-08-20' },

  // 3. NVDA
  { ticker: 'NVDA', companyName: 'NVIDIA CORP', type: 'buy', shares: 40, price: 88.00, tradeDate: '2024-04-12' },
  { ticker: 'NVDA', companyName: 'NVIDIA CORP', type: 'buy', shares: 20, price: 125.00, tradeDate: '2024-08-22' },
  { ticker: 'NVDA', companyName: 'NVIDIA CORP', type: 'sell', shares: 15, price: 142.00, tradeDate: '2025-03-25' },

  // 4. GOOGL
  { ticker: 'GOOGL', companyName: 'Alphabet Inc.', type: 'buy', shares: 30, price: 145.00, tradeDate: '2024-02-14' },
  { ticker: 'GOOGL', companyName: 'Alphabet Inc.', type: 'buy', shares: 15, price: 165.00, tradeDate: '2024-10-08' },

  // 5. AMZN
  { ticker: 'AMZN', companyName: 'AMAZON COM INC', type: 'buy', shares: 35, price: 175.00, tradeDate: '2024-03-05' },
  { ticker: 'AMZN', companyName: 'AMAZON COM INC', type: 'buy', shares: 15, price: 205.00, tradeDate: '2024-11-12' },

  // 6. META
  { ticker: 'META', companyName: 'Meta Platforms, Inc.', type: 'buy', shares: 12, price: 475.00, tradeDate: '2024-05-15' },
  { ticker: 'META', companyName: 'Meta Platforms, Inc.', type: 'sell', shares: 4, price: 560.00, tradeDate: '2025-07-18' },

  // 7. KO
  { ticker: 'KO', companyName: 'COCA COLA CO', type: 'buy', shares: 90, price: 59.50, tradeDate: '2024-01-22' },
  { ticker: 'KO', companyName: 'COCA COLA CO', type: 'buy', shares: 50, price: 67.00, tradeDate: '2024-08-14' },
  { ticker: 'KO', companyName: 'COCA COLA CO', type: 'buy', shares: 40, price: 71.50, tradeDate: '2025-04-16' },

  // 8. PEP
  { ticker: 'PEP', companyName: 'PEPSICO INC', type: 'buy', shares: 40, price: 166.00, tradeDate: '2024-02-28' },
  { ticker: 'PEP', companyName: 'PEPSICO INC', type: 'buy', shares: 25, price: 158.00, tradeDate: '2024-12-05' },

  // 9. PG
  { ticker: 'PG', companyName: 'PROCTER & GAMBLE Co', type: 'buy', shares: 35, price: 160.00, tradeDate: '2024-03-20' },
  { ticker: 'PG', companyName: 'PROCTER & GAMBLE Co', type: 'buy', shares: 20, price: 168.00, tradeDate: '2025-01-15' },
  { ticker: 'PG', companyName: 'PROCTER & GAMBLE Co', type: 'sell', shares: 10, price: 176.00, tradeDate: '2025-09-10' },

  // 10. CAG
  { ticker: 'CAG', companyName: 'CONAGRA BRANDS INC.', type: 'buy', shares: 80, price: 28.50, tradeDate: '2024-04-18' },
  { ticker: 'CAG', companyName: 'CONAGRA BRANDS INC.', type: 'buy', shares: 50, price: 26.00, tradeDate: '2025-02-12' },

  // 11. GIS
  { ticker: 'GIS', companyName: 'GENERAL MILLS INC', type: 'buy', shares: 60, price: 68.00, tradeDate: '2024-05-08' },
  { ticker: 'GIS', companyName: 'GENERAL MILLS INC', type: 'buy', shares: 30, price: 64.00, tradeDate: '2025-03-14' },
  { ticker: 'GIS', companyName: 'GENERAL MILLS INC', type: 'sell', shares: 20, price: 72.00, tradeDate: '2025-10-12' },

  // 12. JNJ
  { ticker: 'JNJ', companyName: 'JOHNSON & JOHNSON', type: 'buy', shares: 45, price: 156.00, tradeDate: '2024-02-05' },
  { ticker: 'JNJ', companyName: 'JOHNSON & JOHNSON', type: 'buy', shares: 20, price: 162.00, tradeDate: '2024-10-30' },

  // 13. PFE
  { ticker: 'PFE', companyName: 'PFIZER INC', type: 'buy', shares: 120, price: 28.50, tradeDate: '2024-01-18' },
  { ticker: 'PFE', companyName: 'PFIZER INC', type: 'sell', shares: 40, price: 26.00, tradeDate: '2024-09-25' },
  { ticker: 'PFE', companyName: 'PFIZER INC', type: 'buy', shares: 50, price: 25.50, tradeDate: '2025-02-20' },

  // 14. ABBV
  { ticker: 'ABBV', companyName: 'AbbVie Inc.', type: 'buy', shares: 35, price: 172.00, tradeDate: '2024-04-02' },
  { ticker: 'ABBV', companyName: 'AbbVie Inc.', type: 'buy', shares: 15, price: 185.00, tradeDate: '2025-01-25' },

  // 15. UNH
  { ticker: 'UNH', companyName: 'UNITEDHEALTH GROUP INC', type: 'buy', shares: 16, price: 495.00, tradeDate: '2024-06-12' },
  { ticker: 'UNH', companyName: 'UNITEDHEALTH GROUP INC', type: 'buy', shares: 8, price: 530.00, tradeDate: '2025-02-18' },
  { ticker: 'UNH', companyName: 'UNITEDHEALTH GROUP INC', type: 'sell', shares: 4, price: 580.00, tradeDate: '2025-11-05' },

  // 16. JPM
  { ticker: 'JPM', companyName: 'JPMORGAN CHASE & CO', type: 'buy', shares: 35, price: 172.00, tradeDate: '2024-01-26' },
  { ticker: 'JPM', companyName: 'JPMORGAN CHASE & CO', type: 'buy', shares: 20, price: 215.00, tradeDate: '2024-09-15' },

  // 17. BAC
  { ticker: 'BAC', companyName: 'BANK OF AMERICA CORP /DE/', type: 'buy', shares: 120, price: 36.50, tradeDate: '2024-03-18' },
  { ticker: 'BAC', companyName: 'BANK OF AMERICA CORP /DE/', type: 'buy', shares: 60, price: 43.00, tradeDate: '2024-11-10' },

  // 18. V
  { ticker: 'V', companyName: 'VISA INC.', type: 'buy', shares: 25, price: 278.00, tradeDate: '2024-02-22' },
  { ticker: 'V', companyName: 'VISA INC.', type: 'buy', shares: 15, price: 312.00, tradeDate: '2024-12-08' },

  // 19. HD
  { ticker: 'HD', companyName: 'HOME DEPOT, INC.', type: 'buy', shares: 20, price: 360.00, tradeDate: '2024-04-05' },
  { ticker: 'HD', companyName: 'HOME DEPOT, INC.', type: 'buy', shares: 10, price: 390.00, tradeDate: '2024-10-22' },
  { ticker: 'HD', companyName: 'HOME DEPOT, INC.', type: 'sell', shares: 5, price: 405.00, tradeDate: '2025-07-30' },

  // 20. MCD
  { ticker: 'MCD', companyName: 'MCDONALDS CORP', type: 'buy', shares: 25, price: 265.00, tradeDate: '2024-05-14' },
  { ticker: 'MCD', companyName: 'MCDONALDS CORP', type: 'buy', shares: 15, price: 288.00, tradeDate: '2025-03-08' },

  // 21. WMT
  { ticker: 'WMT', companyName: 'Walmart Inc.', type: 'buy', shares: 70, price: 58.00, tradeDate: '2024-02-08' },
  { ticker: 'WMT', companyName: 'Walmart Inc.', type: 'buy', shares: 40, price: 75.00, tradeDate: '2024-08-28' },

  // 22. COST
  { ticker: 'COST', companyName: 'COSTCO WHOLESALE CORP /NEW', type: 'buy', shares: 12, price: 725.00, tradeDate: '2024-03-11' },
  { ticker: 'COST', companyName: 'COSTCO WHOLESALE CORP /NEW', type: 'buy', shares: 6, price: 880.00, tradeDate: '2024-11-04' },
  { ticker: 'COST', companyName: 'COSTCO WHOLESALE CORP /NEW', type: 'sell', shares: 3, price: 940.00, tradeDate: '2025-06-18' },

  // 23. CAT
  { ticker: 'CAT', companyName: 'CATERPILLAR INC', type: 'buy', shares: 18, price: 335.00, tradeDate: '2024-03-04' },
  { ticker: 'CAT', companyName: 'CATERPILLAR INC', type: 'buy', shares: 10, price: 395.00, tradeDate: '2024-10-18' },

  // 24. HON
  { ticker: 'HON', companyName: 'HONEYWELL INTERNATIONAL INC', type: 'buy', shares: 30, price: 195.00, tradeDate: '2024-04-25' },
  { ticker: 'HON', companyName: 'HONEYWELL INTERNATIONAL INC', type: 'buy', shares: 20, price: 208.00, tradeDate: '2025-02-06' },

  // 25. XOM
  { ticker: 'XOM', companyName: 'EXXON MOBIL CORP', type: 'buy', shares: 50, price: 102.00, tradeDate: '2024-02-16' },
  { ticker: 'XOM', companyName: 'EXXON MOBIL CORP', type: 'buy', shares: 30, price: 118.00, tradeDate: '2024-11-25' },

  // 26. CVX
  { ticker: 'CVX', companyName: 'CHEVRON CORP', type: 'buy', shares: 35, price: 158.00, tradeDate: '2024-04-30' },
  { ticker: 'CVX', companyName: 'CHEVRON CORP', type: 'buy', shares: 20, price: 152.00, tradeDate: '2025-01-22' },

  // 27. DIS
  { ticker: 'DIS', companyName: 'Walt Disney Co', type: 'buy', shares: 60, price: 115.00, tradeDate: '2024-03-28' },
  { ticker: 'DIS', companyName: 'Walt Disney Co', type: 'sell', shares: 20, price: 92.00, tradeDate: '2024-08-12' },
  { ticker: 'DIS', companyName: 'Walt Disney Co', type: 'buy', shares: 35, price: 108.00, tradeDate: '2025-03-20' },
];

async function run() {
  console.log('Testing FIFO state integrity...');
  buildState(TRANSACTIONS);
  console.log('FIFO state valid! Total transactions to populate:', TRANSACTIONS.length);

  // Clear existing portfolio data for admin user (53)
  console.log('Cleaning up existing portfolio transactions, tabs, groups for user', ADMIN_USER_ID);
  await query('DELETE FROM portfolio_transactions WHERE user_id = $1', [ADMIN_USER_ID]);
  await query('DELETE FROM portfolio_tabs WHERE user_id = $1', [ADMIN_USER_ID]);

  // Insert transactions in chronological order
  const sorted = [...TRANSACTIONS].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  console.log('Inserting transactions...');
  for (const t of sorted) {
    await portfolioRepository.addTransaction(ADMIN_USER_ID, t);
  }
  console.log(`Inserted ${sorted.length} transactions.`);

  // Create Tabs and Groups
  console.log('Creating tabs and groups...');
  const tab1 = await portfolioRepository.createTab(ADMIN_USER_ID, { name: 'Estrategia', color: '#2563eb' });
  const g1 = await portfolioRepository.createGroup(ADMIN_USER_ID, { tabId: tab1.id, name: 'Dividend Aristocrats / Growth', color: '#10b981' });
  for (const t of ['KO', 'PEP', 'PG', 'CAG', 'GIS', 'JNJ', 'ABBV', 'XOM', 'CVX']) {
    await portfolioRepository.addTickerRule(ADMIN_USER_ID, g1.id, t);
  }

  const g2 = await portfolioRepository.createGroup(ADMIN_USER_ID, { tabId: tab1.id, name: 'Mega Cap Tech', color: '#6366f1' });
  for (const t of ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META']) {
    await portfolioRepository.addTickerRule(ADMIN_USER_ID, g2.id, t);
  }

  const g3 = await portfolioRepository.createGroup(ADMIN_USER_ID, { tabId: tab1.id, name: 'Valor & Consumo', color: '#f59e0b' });
  for (const t of ['JPM', 'BAC', 'V', 'HD', 'MCD', 'WMT', 'COST', 'CAT', 'HON', 'UNH', 'DIS', 'PFE']) {
    await portfolioRepository.addTickerRule(ADMIN_USER_ID, g3.id, t);
  }

  const tab2 = await portfolioRepository.createTab(ADMIN_USER_ID, { name: 'Convicción', color: '#8b5cf6' });
  const g4 = await portfolioRepository.createGroup(ADMIN_USER_ID, { tabId: tab2.id, name: 'Alta Convicción', color: '#06b6d4' });
  for (const t of ['MSFT', 'AAPL', 'NVDA', 'KO', 'JNJ', 'COST', 'JPM']) {
    await portfolioRepository.addTickerRule(ADMIN_USER_ID, g4.id, t);
  }

  const g5 = await portfolioRepository.createGroup(ADMIN_USER_ID, { tabId: tab2.id, name: 'Seguimiento Táctico', color: '#ec4899' });
  for (const t of ['DIS', 'PFE', 'CAG', 'HON', 'BAC', 'CVX']) {
    await portfolioRepository.addTickerRule(ADMIN_USER_ID, g5.id, t);
  }

  console.log('Tabs and groups created.');

  // Validate portfolio consolidation
  console.log('Calculating consolidated portfolio for user 53...');
  const portfolio = await getPortfolio(ADMIN_USER_ID);
  console.log('Portfolio summary:');
  console.log('  Positions count:', portfolio.positions.length);
  console.log('  Total value:', portfolio.summary.totalValue);
  console.log('  Total cost basis:', portfolio.summary.totalCost);
  console.log('  Total unrealized gain:', portfolio.summary.totalUnrealized);
  console.log('  Total realized gain:', portfolio.summary.totalRealized);
  console.log('  Total dividends:', portfolio.summary.totalDividends);
  console.log('  Total return:', portfolio.summary.totalReturn, `(${portfolio.summary.totalReturnPct}%)`);
  console.log('  Projected annual dividends:', portfolio.summary.projectedAnnualDividends, `(yield: ${portfolio.summary.dividendYield}%)`);
  console.log('  Sectors breakdown count:', portfolio.allocations.bySector.length);
  console.log('  Sectors:', portfolio.allocations.bySector.map(s => `${s.sector}: ${s.percent.toFixed(1)}%`));

  console.log('Testing portfolio chart...');
  const chart = await getPortfolioChart(ADMIN_USER_ID, { ids: ['ticker:AAPL', 'ticker:MSFT', 'ticker:KO', 'ticker:NVDA'], metric: 'gainPct', range: '1y' });
  console.log('Chart points count:', chart?.points?.length ?? 0);
  console.log('Admin portfolio successfully seeded and verified!');

  process.exit(0);
}

run().catch((err) => {
  console.error('Error running portfolio seed:', err);
  process.exit(1);
});
