/**
 * @fileoverview Middleware global de captura y formateo de errores HTTP en Express.
 * Transforma errores de parsers, multer y excepciones no controladas en respuestas JSON consistentes.
 * @module middleware/errorHandler
 */

import multer from 'multer';

const GENERIC_500_MESSAGE = 'Error interno del servidor. Inténtalo de nuevo más tarde.';

/**
 * Detecta si el error proviene del parser de cuerpo JSON de Express/body-parser.
 * @private
 * @param {any} error - Error capturado.
 * @returns {boolean} Verdadero si es un error sintáctico de payload.
 */
function isBodyParserError(error) {
  if (error?.type === 'entity.parse.failed') return true;
  if (error?.type === 'entity.too.large') return true;
  if (error?.type === 'entity.verify.failed') return true;
  if (error?.type === 'request.aborted') return true;
  if (error?.type === 'parameters.too.many') return true;
  if (error?.type === 'charset.unsupported') return true;
  if (error?.type === 'encoding.unsupported') return true;
  if (error instanceof SyntaxError && (error.status === 400 || error.body === undefined)) return true;
  return false;
}

/**
 * Middleware centralizado de errores para respuestas de la API.
 * @param {any} err - Error propagado por next(err).
 * @param {import('express').Request} _req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} _next - Siguiente middleware.
 * @returns {void}
 */
export function errorHandler(err, _req, res, _next) {
  if (isBodyParserError(err)) {
    const tooLarge = err.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? 'El contenido enviado supera el tamaño máximo permitido (25 MB).'
        : 'El cuerpo de la petición no es un JSON válido.',
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'El archivo supera el límite de 25 MB.',
      LIMIT_FILE_COUNT: 'Se han recibido más archivos de los permitidos.',
      LIMIT_UNEXPECTED_FILE: 'Archivo inesperado. Usa los campos "file" y "presentation".',
    };
    res.status(400).json({
      error: messages[err.code] || 'Error al recibir el archivo.',
    });
    return;
  }

  const status = Number(err?.status) || 500;
  const safeMessage = status < 500 ? err.message || 'Solicitud no válida.' : GENERIC_500_MESSAGE;

  if (status >= 500) {
    console.error('[errorHandler]', err);
  }

  res.status(status).json({
    error: safeMessage,
    code: status < 500 ? (err.code || undefined) : undefined,
  });
}
