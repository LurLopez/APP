import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config/index.js';
import authRoutes from './src/api/routes/auth.routes.js';
import analysisRoutes from './src/api/routes/analysis.routes.js';
import { errorHandler } from './src/middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api', analysisRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cifra-api', phase: 1 });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Cifra disponible en http://localhost:${config.port}`);
});
