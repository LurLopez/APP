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
import priceAlertsRoutes from './src/api/routes/priceAlerts.routes.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { startAlertScanner } from './src/services/alertScanner.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.warn(`[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${Date.now() - start}ms)`);
    }
  });
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api', analysisRoutes);
app.use('/api/screener', screenerRoutes);
app.use('/api/watchlists', watchlistsRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/price-alerts', priceAlertsRoutes);

app.get(['/', '/seguimiento', '/cartera', '/analisis', '/análisis', '/alertas', '/alertas-precio'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
  const scanInterval = Number(process.env.ALERT_SCAN_INTERVAL_MINUTES || 30);
  startAlertScanner(scanInterval);
});
