const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return EMAIL_PATTERN.test(email);
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

// ID estricto de ruta: solo enteros positivos sin exponentes, signos ni basura
export function parseIdParam(value) {
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value.trim())) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Categoría en lista blanca; si no pertenece, devuelve el valor por defecto
export function pickCategory(raw, allowed, fallback) {
  const candidate = String(raw ?? '').trim().toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
}

// Imágenes adjuntas: solo data:image/ o https://, máx. 5 y tamaño limitado por imagen
export function sanitizeReportImages(raw, { max = 5, maxChars = 7 * 1024 * 1024 } = {}) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((img) => typeof img === 'string'
      && img.length > 0
      && img.length <= maxChars
      && (img.startsWith('data:image/') || img.startsWith('https://')))
    .slice(0, max);
}
