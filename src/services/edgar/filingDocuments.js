/**
 * @fileoverview Descarga, generación en PDF, vista previa con imágenes y streaming de documentos de la SEC.
 * @module services/edgar/filingDocuments
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { USER_AGENT } from './statementConcepts.js';
import { getCompanyFilings } from './filingPeriods.js';
import { assertPublicUrl } from '../../utils/ssrfGuard.js';

const execFileAsync = promisify(execFile);

export const FILINGS_DIR = new URL('../../../uploads/generated/filings/', import.meta.url).pathname;
export const PREVIEWS_DIR = new URL('../../../uploads/generated/filings/previews/', import.meta.url).pathname;

const CHROME_BIN = process.env.CHROME_BIN || 'google-chrome';
// Sandbox activo por defecto; definir CHROME_NO_SANDBOX=1 solo si el servidor lo requiere.
const CHROME_NO_SANDBOX = /^(1|true|yes)$/i.test(String(process.env.CHROME_NO_SANDBOX || '').trim());
const CHROME_SANDBOX_ARGS = CHROME_NO_SANDBOX ? ['--no-sandbox'] : [];
const PDFTOPPM_BIN = process.env.PDFTOPPM_BIN || 'pdftoppm';
const PREVIEW_DPI = Number(process.env.PREVIEW_DPI) || 100;
const FILING_INDEX_TTL = 60 * 60 * 1000;
const filingIndexCache = new Map();

/**
 * Sanea el nombre de un documento remoto para usarlo como nombre de archivo local.
 * @param {unknown} value - Nombre en bruto.
 * @returns {string} Nombre seguro (sin rutas ni caracteres raros).
 */
function safeDocumentStem(value) {
  return path.basename(String(value ?? 'informe')).replace(/[^\w.-]/g, '_').slice(0, 150) || 'informe';
}

/**
 * Asegura la existencia del directorio de almacenamiento local para PDFs de filings.
 */
export async function ensureFilingsDir() {
  try {
    fs.mkdirSync(FILINGS_DIR, { recursive: true });
  } catch {
    // Si no se puede crear, la generación de PDFs fallará con fallback a HTML.
  }
}

/**
 * Genera el nombre de archivo amigable para el PDF de un filing.
 * @param {object} filing - Objeto filing.
 * @returns {string} Nombre del archivo.
 */
export function filingPdfFilename(filing) {
  const stem = safeDocumentStem(filing.documentName ?? 'informe').replace(/\.html?$/, '');
  const period = filing.period ? String(filing.period).slice(0, 10) : null;
  return period ? `${stem}-${period}.pdf` : `${stem}.pdf`;
}

/**
 * Ruta de caché en disco para el PDF generado de un filing.
 * @param {object} filing - Objeto filing.
 * @returns {string} Ruta absoluta del archivo PDF en caché.
 */
export function filingPdfCachePath(filing) {
  const stem = safeDocumentStem(filing.documentName ?? 'informe').replace(/\.html?$/, '');
  const accessionNoDashes = String(filing.accession ?? '').replace(/[^\d-]/g, '').replaceAll('-', '');
  return `${FILINGS_DIR}${stem}-${accessionNoDashes}.pdf`;
}

/**
 * Obtiene el índice de archivos asociados al accession number de un filing en la SEC.
 * @param {object} company - Empresa con CIK.
 * @param {object} filing - Filing con accession.
 * @returns {Promise<Array<{name: string}>|null>} Lista de archivos o null.
 */
export async function getFilingIndexItems(company, filing) {
  const accessionNoDashes = filing.accession.replaceAll('-', '');
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/index.json`;
  const cached = filingIndexCache.get(indexUrl);
  if (cached && Date.now() - cached.at <= FILING_INDEX_TTL) return cached.data;
  let items = null;
  try {
    await assertPublicUrl(indexUrl);
    const response = await fetch(indexUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const data = await response.json();
      items = data?.directory?.item ?? null;
    }
  } catch {
    items = null;
  }
  filingIndexCache.set(indexUrl, { data: items, at: Date.now() });
  return items;
}

/**
 * Busca si la SEC ya provee un PDF oficial del informe.
 * @param {object} company - Empresa.
 * @param {object} filing - Filing.
 * @returns {Promise<string|null>} Nombre del archivo PDF o null.
 */
async function findFilingPdfUrl(company, filing) {
  const items = await getFilingIndexItems(company, filing);
  if (!Array.isArray(items)) return null;
  const pdfs = items
    .filter((item) => typeof item.name === 'string' && item.name.toLowerCase().endsWith('.pdf'))
    .map((item) => item.name);
  if (!pdfs.length) return null;
  const stem = filing.documentName.replace(/\.html?$/, '').toLowerCase();
  const match = pdfs.find((name) => name.toLowerCase().replace(/\.pdf$/, '') === stem);
  if (match) return match;
  return pdfs.sort((a, b) => b.length - a.length)[0];
}

/**
 * Renderiza el HTML del filing a PDF mediante Chromium headless.
 * @param {string} documentUrl - URL pública del documento.
 * @param {string} outPath - Ruta destino local.
 */
async function generateFilingPdf(documentUrl, outPath) {
  await assertPublicUrl(documentUrl);
  await execFileAsync(CHROME_BIN, [
    '--headless=new',
    '--disable-gpu',
    ...CHROME_SANDBOX_ARGS,
    '--disable-extensions',
    '--no-pdf-header-footer',
    `--user-agent=${USER_AGENT}`,
    `--print-to-pdf=${outPath}`,
    documentUrl,
  ], { timeout: 90000 });
}

/**
 * Obtiene la ruta al PDF local del filing (descargándolo o generándolo).
 * @param {object} company - Empresa.
 * @param {object} filing - Filing.
 * @returns {Promise<string|null>} Ruta del archivo o null.
 */
export async function getFilingPdfPath(company, filing) {
  const filePath = filingPdfCachePath(filing);
  try {
    const stat = fs.statSync(filePath);
    if (stat.isFile() && stat.size > 0) return filePath;
  } catch {
    // Generar o descargar
  }
  await ensureFilingsDir();

  const realPdf = await findFilingPdfUrl(company, filing);
  if (realPdf) {
    const pdfUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${filing.accession.replaceAll('-', '')}/${encodeURIComponent(realPdf)}`;
    try {
      await assertPublicUrl(pdfUrl);
      const response = await fetch(pdfUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' },
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) {
        fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
        return filePath;
      }
    } catch {
      // Continuar con Chrome
    }
  }

  try {
    await generateFilingPdf(filing.documentUrl, filePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return filePath;
  } catch {
    // Fallback a HTML
  }
  return null;
}

/**
 * Retorna un flujo de lectura (Stream) del documento del filing para descarga HTTP directa.
 * @param {string} ticker - Ticker.
 * @param {string} accession - Número de registro de la SEC.
 * @returns {Promise<object|null>} Descriptor de descarga con stream.
 */
export async function getFilingDocumentStream(ticker, accession) {
  const { company, filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return null;
  const filename = filingPdfFilename(filing);

  const filePath = await getFilingPdfPath(company, filing);
  if (filePath) {
    const stat = fs.statSync(filePath);
    return {
      filename,
      stream: Readable.toWeb(fs.createReadStream(filePath)),
      contentType: 'application/pdf',
      contentLength: String(stat.size),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    await assertPublicUrl(filing.documentUrl);
    const response = await fetch(filing.documentUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/pdf',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`EDGAR respondió ${response.status}`);
    }
    return {
      url: filing.documentUrl,
      filename: filing.documentName,
      stream: response.body,
      contentType: response.headers.get('content-type') ?? 'application/pdf',
      contentLength: response.headers.get('content-length'),
    };
  } catch (error) {
    clearTimeout(timeout);
    const wrapped = new Error(`No se pudo obtener el documento de EDGAR: ${error.message}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
}

/**
 * Descarga el contenido completo del documento en memoria (Buffer) para procesamiento de IA.
 * @param {string} ticker - Ticker.
 * @param {string} accession - Número de registro.
 * @returns {Promise<{filing: object, buffer: Buffer, kind: string}|null>} Buffer del documento.
 */
export async function getFilingContentBuffer(ticker, accession) {
  const { company, filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return null;
  const filePath = await getFilingPdfPath(company, filing);
  if (filePath) {
    return { filing, buffer: fs.readFileSync(filePath), kind: 'pdf' };
  }
  await assertPublicUrl(filing.documentUrl);
  const response = await fetch(filing.documentUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/pdf' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const wrapped = new Error(`No se pudo obtener el documento de EDGAR: ${response.status}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
  const contentType = response.headers.get('content-type') ?? '';
  return {
    filing,
    buffer: Buffer.from(await response.arrayBuffer()),
    kind: contentType.includes('pdf') ? 'pdf' : 'html',
  };
}

/**
 * Obtiene o genera las imágenes de previsualización PNG del filing.
 * @param {string} ticker - Símbolo bursátil.
 * @param {string} accession - Accession number.
 * @returns {Promise<{filename: string, pages: number}|null>} Resumen de previsualización.
 */
export async function getFilingPreview(ticker, accession) {
  const { company, filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return null;
  const filename = filingPdfFilename(filing);

  const pdfPath = await getFilingPdfPath(company, filing);
  if (!pdfPath) return { filename, pages: 0 };

  const previewDir = `${PREVIEWS_DIR}${filing.accession.replaceAll('-', '')}/`;
  fs.mkdirSync(previewDir, { recursive: true });

  let pages = fs.readdirSync(previewDir).filter((name) => name.endsWith('.png'));
  if (!pages.length) {
    try {
      await execFileAsync(PDFTOPPM_BIN, ['-png', '-r', String(PREVIEW_DPI), pdfPath, `${previewDir}page`], { timeout: 180000 });
      pages = fs.readdirSync(previewDir).filter((name) => name.endsWith('.png'));
    } catch (error) {
      const wrapped = new Error(`No se pudo generar la vista previa: ${error.message}`);
      wrapped.code = 'PREVIEW_UNAVAILABLE';
      throw wrapped;
    }
  }
  return { filename, pages: pages.length };
}
