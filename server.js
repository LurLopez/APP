import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config/index.js';
import authRoutes from './src/api/routes/auth.routes.js';
import analysisRoutes from './src/api/routes/analysis.routes.js';
import screenerRoutes from './src/api/routes/screener.routes.js';
import watchlistsRoutes from './src/api/routes/watchlists.routes.js';
import portfolioRoutes from './src/api/routes/portfolio.routes.js';
import { errorHandler } from './src/middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api', analysisRoutes);
app.use('/api/screener', screenerRoutes);
app.use('/api/watchlists', watchlistsRoutes);
app.use('/api/portfolio', portfolioRoutes);

app.get('/empresa/:ticker', (req, res) => {
  const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    res.redirect('/');
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'empresa.html'));
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cifra-api', phase: 1 });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Cifra disponible en http://localhost:${config.port}`);
});
