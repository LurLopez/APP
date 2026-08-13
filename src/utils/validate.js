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
