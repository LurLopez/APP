import fs from 'node:fs/promises';
import path from 'node:path';

// Log acumulativo (JSON Lines) con cada análisis generado: usuario, tokens,
// coste, duración, modelo y fecha/hora. Se puede cambiar de ruta con
// ANALYSIS_LOG_DIR (por defecto, ./logs/analisis.log).
function resolveLogFile() {
  const dir = process.env.ANALYSIS_LOG_DIR
    ? path.resolve(process.env.ANALYSIS_LOG_DIR)
    : path.join(process.cwd(), 'logs');
  return path.join(dir, 'analisis.log');
}

export async function appendAnalysisLog(entry) {
  const file = resolveLogFile();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('[analysis-log]', error.message);
  }
}
