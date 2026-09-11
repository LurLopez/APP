const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';

const defaultSiteUrl = production ? 'https://cifra.app' : `http://localhost:${port}`;
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

export default {
  port,
  database,
  siteUrl,
  jwtSecret: process.env.JWT_SECRET || 'cifra-dev-secret-cambiar',
  production,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/api/auth/google/callback`,
  },
  adminUser: {
    username: (process.env.ADMIN_USERNAME || process.env.ADMIN_USER || 'admin').trim(),
    password: String(process.env.ADMIN_PASSWORD ?? 'admin'),
    email: (process.env.ADMIN_EMAIL || 'admin@cifra.local').trim().toLowerCase(),
  },
  };
