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
