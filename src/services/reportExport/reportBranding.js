/**
 * @fileoverview Constantes de marca para los pies de página de los informes exportados.
 * @module services/reportExport/reportBranding
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BRAND_URL = 'https://cifraresearch.com';
export const BRAND_LABEL = 'cifraresearch.com';
export const BRAND_LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-cifra.png');
export const BRAND_LOGO_RATIO = 304 / 395;

/**
 * Lee el buffer PNG del logotipo de Cifra para incrustarlo en los exportadores ZIP (DOCX/ODT).
 * Si el asset no está disponible, devuelve null y el informe se genera solo con el enlace.
 * @returns {Promise<Buffer|null>} Buffer binario del logotipo o null.
 */
export async function readBrandLogo() {
  try {
    return await fs.promises.readFile(BRAND_LOGO_PATH);
  } catch (error) {
    console.warn('[reportBranding] No se pudo leer el logotipo de Cifra:', error.message);
    return null;
  }
}

/**
 * Indica si el asset del logotipo está disponible en disco (uso síncrono en PDFKit).
 * @returns {boolean} Verdadero si el archivo existe.
 */
export function hasBrandLogo() {
  return fs.existsSync(BRAND_LOGO_PATH);
}
