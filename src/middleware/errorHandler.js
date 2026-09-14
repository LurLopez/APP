import multer from 'multer';

const GENERIC_500_MESSAGE = 'Error interno del servidor. Inténtalo de nuevo más tarde.';

function isBodyParserError(error) {
  // body-parser: SyntaxError con status/body en Express 5
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

export function errorHandler(err, _req, res, _next) {
  // Payload JSON malformado o demasiado grande (body-parser)
  if (isBodyParserError(err)) {
    const tooLarge = err.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? 'El contenido enviado supera el tamaño máximo permitido (25 MB).'
        : 'El cuerpo de la petición no es un JSON válido.',
    });
    return;
  }

  // Errores de subida de archivos (multer): mensajes claros, nunca 500
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
