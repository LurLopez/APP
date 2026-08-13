import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cifra-api', phase: 1 });
});

app.listen(config.port, () => {
  console.log(`Cifra disponible en http://localhost:${config.port}`);
});
