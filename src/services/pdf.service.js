import { PDFParse } from 'pdf-parse';
import { AgentError } from '../agents/baseAgent.js';

export async function extractTextFromPdf(buffer) {
  if (!buffer || typeof buffer.length !== 'number' || buffer.length < 5) {
    throw new AgentError('El archivo PDF está vacío o no es válido.', 'EMPTY_DOCUMENT');
  }
  const pdf = new PDFParse({ data: buffer });
  try {
    const result = await pdf.getText();
    return result.text ?? '';
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/password|encrypt/i.test(message)) {
      throw new AgentError('El PDF está protegido con contraseña y no se puede leer.', 'PDF_PROTECTED');
    }
    if (/invalid|structure|corrupt|damaged|malformed/i.test(message)) {
      throw new AgentError('El PDF está dañado o no es un informe válido. Descarga el PDF original desde SEC EDGAR e inténtalo de nuevo.', 'PDF_CORRUPT');
    }
    throw new AgentError('No se pudo leer el contenido del PDF. Inténtalo de nuevo o usa el PDF oficial de SEC EDGAR.', 'PDF_READ_FAILED');
  } finally {
    try {
      await pdf.destroy();
    } catch {
      // El fallo al liberar el parser no debe ocultar el resultado o el error real.
    }
  }
}

/**
 * Verifica si el texto extraído de un PDF es legible y contiene texto real (no fuentes corruptas,
 * texto escaneado sin OCR o glifos con CMaps rotos).
 * @param {string} text - Texto extraído del PDF.
 * @returns {boolean} True si el texto es legible.
 */
export function isReadablePdfText(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (clean.length < 100) return false;

  // Si más del 5% de los caracteres son de control no imprimibles (excluyendo \t, \n, \r), la fuente está corrupta.
  const nonPrintable = (clean.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  if (nonPrintable / clean.length > 0.05) return false;

  // En documentos de más de 1000 caracteres, comprobar que contenga palabras clave habituales de informes
  if (clean.length > 1000) {
    const secKeywords = [
      'securities', 'commission', 'form', 'fiscal', 'operating',
      'income', 'cash', 'flows', 'balance', 'sheet', 'assets',
      'liabilities', 'revenue', 'sales', 'item', 'notes', 'consolidated',
      'annual', 'quarterly', 'report', 'december', 'november', 'january'
    ];
    let matches = 0;
    for (const kw of secKeywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(clean)) {
        matches += 1;
        if (matches >= 2) return true;
      }
    }
    return false;
  }

  return true;
}

