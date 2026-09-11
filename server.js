import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config/index.js';
import authRoutes from './src/api/routes/auth.routes.js';
import analysisRoutes from './src/api/routes/analysis.routes.js';
import screenerRoutes from './src/api/routes/screener.routes.js';
import watchlistsRoutes from './src/api/routes/watchlists.routes.js';
import portfolioRoutes from './src/api/routes/portfolio.routes.js';
import priceAlertsRoutes from './src/api/routes/priceAlerts.routes.js';
import forumRoutes from './src/api/routes/forum.routes.js';
import reportsRoutes from './src/api/routes/reports.routes.js';
import adminReportsRoutes from './src/api/routes/adminReports.routes.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { seoHtmlMiddleware } from './src/middleware/seo.middleware.js';
import { startAlertScanner } from './src/services/alertScanner.service.js';
import { ensureAdminUser } from './src/services/auth.service.js';

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

app.use(compression());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

app.use(seoHtmlMiddleware);

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const ext = path.extname(filePath);
    if (ext === '.css' || ext === '.js') {
      res.set('Cache-Control', 'public, max-age=604800');
    } else if (ext === '.png' || ext === '.svg' || ext === '.ico' || ext === '.jpg' || ext === '.webp') {
      res.set('Cache-Control', 'public, max-age=2592000');
    }
  },
}));

app.use('/api/auth', authRoutes);
app.use('/api', analysisRoutes);
app.use('/api', adminReportsRoutes);
app.use('/api/screener', screenerRoutes);
app.use('/api/watchlists', watchlistsRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/price-alerts', priceAlertsRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/reports', reportsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cifra-api', phase: 1 });
});

app.use(errorHandler);

app.listen(config.port, async () => {
  console.log(`Cifra disponible en http://localhost:${config.port}`);
  try {
    await ensureAdminUser();
  } catch (err) {
    console.error('[auth] Error asegurando usuario admin:', err.message);
  }
  const scanInterval = Number(process.env.ALERT_SCAN_INTERVAL_MINUTES || 30);
  startAlertScanner(scanInterval);
});
