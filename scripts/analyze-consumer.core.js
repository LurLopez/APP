/**
 * @fileoverview Módulo extraído de analyze-defensive-consumer.js.
 */

import { getFilingContentBuffer, getPresentationBuffers } from '../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../src/services/analysis.service.js';
import { CONSUMER_STAPLES_UNIVERSE } from './data/consumer-staples.js';

const args = process.argv.slice(2);

function getArg(name, defaultValue = null) {
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const flag = `--${name}`;
  if (args.includes(flag)) return true;
  return defaultValue;
}

export const RUN_ONCE = Boolean(getArg('once', false));

export const LIST_ONLY = Boolean(getArg('list', false));

export const SPECIFIC_TICKERS_RAW = getArg('tickers') || getArg('ticker');

export const MAX_QUARTERS = getArg('max-quarters') ? Number(getArg('max-quarters')) : Infinity;

export const PER_FORM = getArg('per-form') ? Math.max(1, Number(getArg('per-form'))) : Infinity;

export const FORCE = Boolean(getArg('force', false));

export const DELAY_MS = Number(getArg('delay', 3000));

export const LOOP_DELAY_MINUTES = Number(getArg('loop-delay', 15));

export const CONCURRENCY = Math.max(1, Number(getArg('concurrency', process.env.WORKER_CONCURRENCY || 1)) || 1);

export const TARGET_PROVIDER = getArg('provider', process.env.WORKER_AI_PROVIDER || 'opencode');

export const UNIVERSE_MODE = String(getArg('universe', process.env.WORKER_UNIVERSE || 'curated')).trim().toLowerCase();

const YEARS_OPTION = getArg('years', process.env.WORKER_YEARS || null);

const FROM_YEAR_ARG = getArg('from-year', null);

export function resolveUniverse(mode) {
  if (['large', 'big', '1000', '1000m'].includes(mode)) {
    return {
      label: 'grandes de EE. UU. (>1.000M $)',
      tickers: CONSUMER_STAPLES_UNIVERSE.filter((u) => u.domestic && u.staples && u.capM >= 1000).map((u) => u.ticker),
    };
  }
  if (['all', 'todas', 'todo', 'todos'].includes(mode)) {
    return {
      label: 'todas las de EE. UU. (sin ADR ni duplicados)',
      tickers: CONSUMER_STAPLES_UNIVERSE.filter((u) => u.domestic && u.staples).map((u) => u.ticker),
    };
  }
  return { label: 'lista curada', tickers: CURATED_DEFENSIVE_CONSUMER_TICKERS };
}

export function resolveYears() {
  if (FROM_YEAR_ARG) {
    const year = Number(FROM_YEAR_ARG);
    return { fromYear: year, label: `desde ${year}` };
  }
  if (!YEARS_OPTION) return { fromYear: 2020, label: 'desde 2020' };

  const value = String(YEARS_OPTION).trim().toLowerCase();
  if (['all', 'todo', 'todas', 'todos'].includes(value)) {
    return { fromYear: null, label: 'todo el histórico disponible' };
  }
  const years = Number(value);
  if (!Number.isFinite(years) || years <= 0) return { fromYear: 2020, label: 'desde 2020' };
  const fromYear = new Date().getFullYear() - years + 1;
  return { fromYear, label: `últimos ${years} años (desde ${fromYear})` };
}

const CURATED_DEFENSIVE_CONSUMER_TICKERS = [
  // Bebidas (Refrescos, Agua, Café, Energéticas)
  'KO',    // The Coca-Cola Company
  'PEP',   // PepsiCo, Inc.
  'MNST',  // Monster Beverage Corporation
  'CELH',  // Celsius Holdings, Inc.
  'KDP',   // Keurig Dr Pepper Inc.
  'FIZZ',  // National Beverage Corp.

  // Cerveceras, Vinos y Licores
  'TAP',   // Molson Coors Beverage Company
  'STZ',   // Constellation Brands, Inc.
  'BF-B',  // Brown-Forman Corporation
  'SAM',   // The Boston Beer Company, Inc.

  // Alimentos Envasados y Snacks
  'KHC',   // The Kraft Heinz Company
  'GIS',   // General Mills, Inc.
  'MDLZ',  // Mondelez International, Inc.
  'HRL',   // Hormel Foods Corporation
  'SJM',   // The J. M. Smucker Company
  'CPB',   // Campbell Soup Company
  'HSY',   // The Hershey Company
  'CAG',   // Conagra Brands, Inc.
  'TSN',   // Tyson Foods, Inc.
  'MKC',   // McCormick & Company, Inc.
  'LW',    // Lamb Weston Holdings, Inc.
  'POST',  // Post Holdings, Inc.
  'FLO',   // Flowers Foods, Inc.
  'INGR',  // Ingredion Incorporated
  'CALM',  // Cal-Maine Foods, Inc.
  'BGS',   // B&G Foods, Inc.
  'HAIN',  // The Hain Celestial Group, Inc.
  'JJSF',  // J & J Snack Foods Corp.

  // Productos de Limpieza, Hogar y Cuidado Personal
  'PG',    // The Procter & Gamble Company
  'CL',    // Colgate-Palmolive Company
  'CHD',   // Church & Dwight Co., Inc.
  'CLX',   // The Clorox Company
  'EL',    // The Estée Lauder Companies Inc.
  'KMB',   // Kimberly-Clark Corporation
  'COTY',  // Coty Inc.
  'EPC',   // Edgewell Personal Care Company
  'IPAR',  // Inter Parfums, Inc.
  'ENR',   // Energizer Holdings, Inc.

  // Tabaco
  'PM',    // Philip Morris International Inc.
  'MO',    // Altria Group, Inc.
  'UVV',   // Universal Corporation
  'TPB',   // Turning Point Brands, Inc.

  // Supermercados, Distribución y Retail de Alimentación
  'WMT',   // Walmart Inc.
  'COST',  // Costco Wholesale Corporation
  'TGT',   // Target Corporation
  'KR',    // The Kroger Co.
  'SYY',   // Sysco Corporation
  'DG',    // Dollar General Corporation
  'DLTR',  // Dollar Tree, Inc.
  'BJ',    // BJ's Wholesale Club Holdings, Inc.
  'SFM',   // Sprouts Farmers Market, Inc.
  'USFD',  // US Foods Holding Corp.
  'PFGC',  // Performance Food Group Company
  'CHEF',  // The Chefs' Warehouse, Inc.
  'CASY',  // Casey's General Stores, Inc.

  // Agronegocios y Materias Primas Alimentarias
  'ADM',   // Archer-Daniels-Midland Company
  'BG',    // Bunge Global SA
  'ANDE',  // The Andersons, Inc.
  'DAR',   // Darling Ingredients Inc.
];

export let shouldStop = false;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWithConcurrency(items, limit, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) || 1 }, async () => {
    while (queue.length && !shouldStop) {
      const item = queue.shift();
      await task(item);
    }
  });
  await Promise.all(workers);
}

export function timestamp() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

export function handleSignals() {
  const shutdown = () => {
    if (shouldStop) {
      console.log(`\n[${timestamp()}] Forzando salida inmediata...`);
      process.exit(1);
    }
    console.log(`\n[${timestamp()}] Señal de interrupción recibida. Finalizando el análisis actual con orden...`);
    shouldStop = true;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export async function analyzeSingleFiling(ticker, filing) {
  const start = Date.now();
  console.log(`[${timestamp()}] [ANALIZANDO] ${ticker} | Periodo: ${filing.periodLabel || filing.period} (${filing.accession})...`);

  const content = await getFilingContentBuffer(ticker, filing.accession);
  if (!content) {
    console.warn(`[${timestamp()}] [AVISO] No se pudo obtener el contenido del informe para ${ticker} (${filing.accession}).`);
    return { ok: false, reason: 'FILING_CONTENT_EMPTY' };
  }

  let presentationText = null;
  try {
    const presentations = await getPresentationBuffers(ticker, filing.accession);
    if (presentations.length) {
      presentationText = await buildPresentationText(presentations);
    }
  } catch (presentationError) {
    console.warn(`[${timestamp()}] [analysis:presentation] ${presentationError.message}`);
  }

  const options = {
    userId: null,
    actor: 'programa',
    isPublic: true,
    filename: `${ticker}-${filing.accession}.pdf`,
    ticker,
    accession: filing.accession,
    sourceUrl: content.filing?.documentUrl ?? null,
    modelUsed: TARGET_PROVIDER,
    formType: filing.formType ?? null,
    presentationText,
  };

  const result = content.kind === 'pdf'
    ? await analyzePdf(content.buffer, options)
    : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[${timestamp()}] [COMPLETADO] ✅ ${ticker} | Periodo: ${filing.periodLabel || filing.period} guardado en BD (${elapsed}s, modelo: ${TARGET_PROVIDER}).`);

  return { ok: true, elapsed, result };
}

export function getFilingYear(filing) {
  if (filing.period && /^\d{4}/.test(filing.period)) {
    return Number(filing.period.slice(0, 4));
  }
  if (filing.filedAt && /^\d{4}/.test(filing.filedAt)) {
    return Number(filing.filedAt.slice(0, 4));
  }
  const match = filing.periodLabel?.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}
