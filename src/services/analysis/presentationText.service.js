/**
 * @fileoverview Recuperación del texto de los documentos complementarios (8-K / presentación) de
 * un filing, con caché en disco por ticker y accession. Garantiza que todos los análisis del
 * mismo filing reciban exactamente el mismo contexto (el 8-K es la fuente principal del guidance)
 * aunque el rastreo de la web de IR tarde o el servidor se reinicie entre análisis.
 * @module services/analysis/presentationText
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPresentationBuffers } from '../edgar.service.js';
import { getCompanyByTicker, getCompanySubmissions } from '../edgar/companyProfile.js';
import { normalizeRecentFilings, addDaysToDate } from '../edgar/filingPeriods.js';
import { buildPresentationText, extractRelevantPresentationSections } from './presentationExtractor.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'cache', 'presentations');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cacheFileName(ticker, accession) {
  const key = `${ticker ?? ''}-${accession ?? ''}`.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(CACHE_DIR, `${key}.json`);
}

/**
 * Devuelve el texto condensado del comunicado/presentación de resultados del filing, usando la
 * caché en disco cuando existe. Nunca lanza: ante cualquier fallo de red o de archivo devuelve
 * null para que el análisis continúe solo con el informe principal.
 * @param {string} ticker - Símbolo bursátil.
 * @param {string} accession - Número de acceso del filing.
 * @returns {Promise<string|null>} Texto complementario o null si no hay documentos.
 */
export async function getFilingPresentationText(ticker, accession) {
  if (!ticker || !accession) return null;
  const file = cacheFileName(ticker, accession);

  try {
    const cached = JSON.parse(await readFile(file, 'utf8'));
    if (cached?.text && Date.now() - Number(cached.at ?? 0) < CACHE_TTL_MS) {
      return cached.text;
    }
  } catch {
    // Sin caché (o ilegible): se reconstruye desde la SEC.
  }

  try {
    const presentations = await getPresentationBuffers(ticker, accession);
    const text = presentations.length ? await buildPresentationText(presentations) : null;
    if (text) {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, JSON.stringify({ at: Date.now(), documents: presentations.map((p) => p.name), text }));
    }
    return text;
  } catch (error) {
    console.warn('[analysis:presentation]', error.message);
    return null;
  }
}

/**
 * Recupera el guidance del comunicado de resultados inmediatamente anterior (8-K con Item 2.02)
 * al filing indicado, para poder comparar la columna «Guidance anterior» con el guidance actual.
 * Queda en caché en disco por ticker y accession del filing actual. Nunca lanza.
 * @param {string} ticker - Símbolo bursátil.
 * @param {string} accession - Número de acceso del filing actual.
 * @returns {Promise<string|null>} Bloque con el guidance anterior o null si no se encuentra.
 */
export async function getPreviousQuarterPresentationText(ticker, accession) {
  if (!ticker || !accession) return null;
  const file = cacheFileName(ticker, `${accession}-guidance-anterior`);

  try {
    const cached = JSON.parse(await readFile(file, 'utf8'));
    if (cached?.text && Date.now() - Number(cached.at ?? 0) < CACHE_TTL_MS) {
      return cached.text;
    }
  } catch {
    // Sin caché (o ilegible): se reconstruye desde la SEC.
  }

  try {
    const company = await getCompanyByTicker(ticker);
    const submissions = await getCompanySubmissions(company);
    const recent = normalizeRecentFilings(submissions?.filings?.recent);
    const clean = (value) => String(value ?? '').replaceAll('-', '');
    const current = recent.find((entry) => clean(entry.accessionNumber) === clean(accession));
    if (!current?.filingDate) return null;
    // El 8-K de resultados del propio trimestre se presenta con fecha de evento igual o posterior
    // al cierre del periodo del 10-Q; el del trimestre anterior es el más reciente con fecha de
    // evento anterior al cierre. Así se evita confundir el comunicado actual con el anterior.
    const currentPeriod = current.reportDate ? String(current.reportDate).slice(0, 10) : null;
    const oldestFiling = addDaysToDate(current.filingDate, -220);
    const previous = recent.find((entry) => (
      entry.form === '8-K'
      && entry.accessionNumber
      && String(entry.items ?? '').includes('2.02')
      && entry.filingDate
      && entry.filingDate < current.filingDate
      && (!currentPeriod || !entry.reportDate || String(entry.reportDate).slice(0, 10) < currentPeriod)
      && (!oldestFiling || entry.filingDate >= oldestFiling)
      && clean(entry.accessionNumber) !== clean(accession)
    ));
    if (!previous) return null;

    const sourceText = await getFilingPresentationText(ticker, previous.accessionNumber);
    const focused = sourceText ? extractRelevantPresentationSections(sourceText, 12000) : null;
    if (!focused) return null;
    const header = `Comunicado de resultados anterior: 8-K ${previous.accessionNumber} (resultados del ${previous.reportDate ?? 'periodo anterior'}, publicado el ${previous.filingDate}).`;
    const text = `${header}\n${focused}`;
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), accession: previous.accessionNumber, text }));
    return text;
  } catch (error) {
    console.warn('[analysis:previous-guidance]', error.message);
    return null;
  }
}
