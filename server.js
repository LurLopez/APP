import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
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
import { rateLimit } from './src/middleware/rateLimit.middleware.js';
import { seoHtmlMiddleware } from './src/middleware/seo.middleware.js';
import { startAlertScanner } from './src/services/alertScanner.service.js';
import { ensureAdminUser } from './src/services/auth.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');

// Cabeceras de seguridad. La CSP permite scripts inline porque la plantilla usa
// un script de tema y Google Analytics; el resto de directivas es restrictiva.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://www.google-analytics.com', 'https://region1.google-analytics.com', 'https://www.googletagmanager.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: config.production ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.warn(`[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// Límite global de peticiones por IP (mitiga scraping y abusos sobre SSR/EDGAR).
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  scope: 'global',
  message: 'Demasiadas solicitudes desde tu conexión. Espera un momento e inténtalo de nuevo.',
}));

app.use(compression());
// Los cuerpos JSON contienen, como máximo, 3 imágenes (~2,5 MB cada una).
app.use(express.json({ limit: '12mb' }));
// No hay formularios HTML en la aplicación: se desactiva el parser extendido (qs).
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

app.use(seoHtmlMiddleware);

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const ext = path.extname(filePath);
    if (!config.production) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
      return;
    }
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
  res.json({ status: 'ok', service: 'cifra-api' });
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
