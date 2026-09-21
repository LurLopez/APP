const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';

const defaultSiteUrl = production ? 'https://cifraresearch.com' : `http://localhost:${port}`;
let siteUrl = String(process.env.PUBLIC_SITE_URL || defaultSiteUrl).trim();
try {
  const parsedSiteUrl = new URL(siteUrl);
  if (!['http:', 'https:'].includes(parsedSiteUrl.protocol)) throw new Error('Unsupported protocol');
  siteUrl = parsedSiteUrl.toString().replace(/\/+$/, '');
} catch {
  siteUrl = defaultSiteUrl;
}

const database = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'cifra',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };

// Secretos JWT de desarrollo conocidos: nunca deben usarse en producción.
const DEV_JWT_SECRETS = new Set(['cifra-dev-secret-cambiar', 'cifra-dev-secret-local']);
const configuredJwtSecret = String(process.env.JWT_SECRET ?? '').trim();
const jwtSecret = configuredJwtSecret || 'cifra-dev-secret-cambiar';

if (production) {
  if (!configuredJwtSecret || DEV_JWT_SECRETS.has(jwtSecret)) {
    console.error(
      '[config] ERROR CRÍTICO: JWT_SECRET no está configurado o usa un valor de desarrollo. '
      + 'Genera uno con "openssl rand -hex 32" en el .env de producción. El servidor se detiene para proteger las sesiones.',
    );
    process.exit(1);
  }
  if (jwtSecret.length < 32) {
    console.warn('[config] AVISO: JWT_SECRET tiene menos de 32 caracteres; usa "openssl rand -hex 32".');
  }
}

const trustedProxyIps = String(process.env.TRUSTED_PROXY_IPS || '127.0.0.1,::1')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export default {
  port,
  database,
  siteUrl,
  jwtSecret,
  codePepper: String(process.env.VERIFICATION_CODE_PEPPER || jwtSecret),
  trustedProxyIps,
  production,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/api/auth/google/callback`,
  },
  adminUser: {
    username: (process.env.ADMIN_USERNAME || process.env.ADMIN_USER || '').trim(),
    password: String(process.env.ADMIN_PASSWORD ?? ''),
    email: (process.env.ADMIN_EMAIL || 'admin@cifra.local').trim().toLowerCase(),
  },
  dailyAiAnalysesLimit: Math.max(1, Number(process.env.DAILY_AI_ANALYSES_LIMIT) || 3),
  };
