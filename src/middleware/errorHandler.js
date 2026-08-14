export function errorHandler(err, _req, res, _next) {
  const status = Number(err.status) || 500;

  if (status >= 500) {
    console.error('[errorHandler]', err);
  }

  res.status(status).json({
    error: err.message || 'Error interno del servidor.',
    code: err.code || undefined,
  });
}
