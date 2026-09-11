#!/usr/bin/env node

/**
 * Worker continuo para análisis de empresas de Consumo Defensivo (EE. UU.)
 *
 * Utiliza la suscripción de OpenCode Go para pregenerar los análisis de informes
 * trimestrales (10-Q) de forma continua y guardarlos en la base de datos.
 * Cuando un usuario hace clic en "Analizar con IA" en la web, el análisis
 * se sirve al instante sin consumir la API de DeepSeek ni hacer esperar al usuario.
 *
 * Uso:
 *   node --env-file=.env scripts/analyze-defensive-consumer.js
 *   npm run analyze:consumer
 *
 * Opciones CLI:
 *   --once                  Ejecuta una sola pasada por la lista y termina.
 *   --ticker=KO             Analiza un ticker específico.
 *   --tickers=KO,PEP,PG     Analiza una lista separada por comas de tickers.
 *   --max-quarters=2        Máximo número de trimestres recientes por empresa (por defecto: 3).
 *   --all-quarters          Analiza todos los 10-Q disponibles.
 *   --provider=opencode     Proveedor IA a usar (por defecto: opencode).
 *   --delay=3000            Retardo en ms entre filings (por defecto: 3000 ms).
 *   --loop-delay=15         Minutos de espera entre rondas completas en modo continuo (por defecto: 15).
 */

import { getCompanyFilings, getFilingContentBuffer } from '../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText } from '../src/services/analysis.service.js';
import { findLatestDoneAnalysis } from '../db/repositories/analysisRepository.js';
import { pool } from '../db/pool.js';

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
function getArg(name, defaultValue = null) {
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const flag = `--${name}`;
  if (args.includes(flag)) return true;
  return defaultValue;
}

const RUN_ONCE = Boolean(getArg('once', false));
const SPECIFIC_TICKERS_RAW = getArg('tickers') || getArg('ticker');
const FROM_YEAR = Number(getArg('from-year', 2020));
const MAX_QUARTERS = getArg('max-quarters') ? Number(getArg('max-quarters')) : Infinity;
const DELAY_MS = Number(getArg('delay', 3000));
const LOOP_DELAY_MINUTES = Number(getArg('loop-delay', 15));
const TARGET_PROVIDER = getArg('provider', process.env.WORKER_AI_PROVIDER || 'opencode');

// Configurar el proveedor para este proceso
process.env.AI_PROVIDER = TARGET_PROVIDER;

// Lista curada y exhaustiva de empresas estadounidenses de consumo defensivo
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

let shouldStop = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

function handleSignals() {
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

async function analyzeSingleFiling(ticker, filing) {
  const start = Date.now();
  console.log(`[${timestamp()}] [ANALIZANDO] ${ticker} | Periodo: ${filing.periodLabel || filing.period} (${filing.accession})...`);

  const content = await getFilingContentBuffer(ticker, filing.accession);
  if (!content) {
    console.warn(`[${timestamp()}] [AVISO] No se pudo obtener el contenido del informe para ${ticker} (${filing.accession}).`);
    return { ok: false, reason: 'FILING_CONTENT_EMPTY' };
  }

  const options = {
    userId: null,
    filename: `${ticker}-${filing.accession}.pdf`,
    ticker,
    accession: filing.accession,
    sourceUrl: content.filing?.documentUrl ?? null,
    modelUsed: TARGET_PROVIDER,
  };

  const result = content.kind === 'pdf'
    ? await analyzePdf(content.buffer, options)
    : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[${timestamp()}] [COMPLETADO] ✅ ${ticker} | Periodo: ${filing.periodLabel || filing.period} guardado en BD (${elapsed}s, modelo: ${TARGET_PROVIDER}).`);

  return { ok: true, elapsed, result };
}

function getFilingYear(filing) {
  if (filing.period && /^\d{4}/.test(filing.period)) {
    return Number(filing.period.slice(0, 4));
  }
  if (filing.filedAt && /^\d{4}/.test(filing.filedAt)) {
    return Number(filing.filedAt.slice(0, 4));
  }
  const match = filing.periodLabel?.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

async function processCompany(ticker, stats) {
  if (shouldStop) return;

  try {
    const filingsData = await getCompanyFilings(ticker, { limit: 120 });
    const allFilings = filingsData?.filings ?? [];

    // Solo informes 10-Q a partir de FROM_YEAR (2020 por defecto)
    let quarterFilings = allFilings
      .filter((f) => f.formType === '10-Q')
      .filter((f) => {
        const year = getFilingYear(f);
        return year !== null && year >= FROM_YEAR;
      })
      .sort((a, b) => {
        const dateA = a.period || a.filedAt || '';
        const dateB = b.period || b.filedAt || '';
        return dateB.localeCompare(dateA); // Más recientes primero: Q2 2026, Q1 2026, Q3 2025... hasta Q1 2020
      });

    if (MAX_QUARTERS !== Infinity) {
      quarterFilings = quarterFilings.slice(0, MAX_QUARTERS);
    }

    if (!quarterFilings.length) {
      console.log(`[${timestamp()}] [INFO] ${ticker}: sin informes 10-Q desde ${FROM_YEAR} para procesar.`);
      return;
    }

    const firstLabel = quarterFilings[0]?.periodLabel || quarterFilings[0]?.period;
    const lastLabel = quarterFilings[quarterFilings.length - 1]?.periodLabel || quarterFilings[quarterFilings.length - 1]?.period;
    console.log(`[${timestamp()}] [INFO] ${ticker}: ${quarterFilings.length} trimestres 10-Q desde ${FROM_YEAR} (${firstLabel} → ${lastLabel}).`);

    for (const filing of quarterFilings) {
      if (shouldStop) break;

      // 1. Comprobar si ya está analizado en la base de datos
      const existing = await findLatestDoneAnalysis({ ticker, accession: filing.accession });
      if (existing && existing.status === 'done' && existing.report) {
        console.log(`[${timestamp()}] [SKIP] ⏭️  ${ticker} | ${filing.periodLabel || filing.period} ya analizado previamente.`);
        stats.skipped += 1;
        continue;
      }

      // 2. Ejecutar análisis
      try {
        const res = await analyzeSingleFiling(ticker, filing);
        if (res.ok) {
          stats.analyzed += 1;
        } else {
          stats.failed += 1;
        }
      } catch (err) {
        stats.failed += 1;
        console.error(`[${timestamp()}] [ERROR] ❌ ${ticker} (${filing.accession}): ${err.message}`);
      }

      // Pequeño retardo entre informes para respetar la API y los límites de SEC EDGAR
      if (DELAY_MS > 0 && !shouldStop) {
        await sleep(DELAY_MS);
      }
    }
  } catch (err) {
    console.error(`[${timestamp()}] [ERROR] ❌ Error procesando filings de ${ticker}: ${err.message}`);
    stats.failed += 1;
  }
}

async function runWorker() {
  handleSignals();

  console.log('='.repeat(70));
  console.log(' 🚀 TRABAJADOR DE PRE-ANÁLISIS CONTINUO - CONSUMO DEFENSIVO (EE. UU.)');
  console.log('='.repeat(70));
  console.log(` • Proveedor IA activo:   ${TARGET_PROVIDER}`);
  console.log(` • Clave OpenCode Go:     ${process.env.OPENCODE_GO_API_KEY ? 'Configurada (OK)' : 'NO ENCONTRADA EN .ENV'}`);
  console.log(` • Modo de ejecución:     ${RUN_ONCE ? 'Una sola pasada (--once)' : 'Continuo sin parar'}`);
  console.log(` • Alcance temporal:      Todos los 10-Q desde ${FROM_YEAR} hasta la fecha`);
  console.log(` • Orden de trimestres:   Descendente (más recientes primero hasta Q1 ${FROM_YEAR})`);
  console.log(` • Pausa entre filings:   ${DELAY_MS} ms`);
  console.log('='.repeat(70));

  if (!process.env.OPENCODE_GO_API_KEY && TARGET_PROVIDER.includes('opencode')) {
    console.error(`\n[ERROR] Falta OPENCODE_GO_API_KEY en tu archivo .env.`);
    console.error(`Para gastar tu suscripción de OpenCode Go, introduce tu clave en .env:`);
    console.error(`OPENCODE_GO_API_KEY=tu-clave-aqui\n`);
    process.exit(1);
  }

  // Determinar lista de tickers
  let targetTickers = CURATED_DEFENSIVE_CONSUMER_TICKERS;
  if (SPECIFIC_TICKERS_RAW) {
    targetTickers = SPECIFIC_TICKERS_RAW.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    console.log(` • Empresas especificadas (${targetTickers.length}): ${targetTickers.join(', ')}`);
  } else {
    console.log(` • Total empresas en catálogo curado: ${targetTickers.length}`);
  }

  let round = 1;

  while (!shouldStop) {
    const roundStart = Date.now();
    console.log(`\n[${timestamp()}] ── INICIANDO RONDA #${round} (${targetTickers.length} empresas) ──\n`);

    const stats = { analyzed: 0, skipped: 0, failed: 0 };

    for (let i = 0; i < targetTickers.length; i += 1) {
      if (shouldStop) break;
      const ticker = targetTickers[i];
      console.log(`[${timestamp()}] [${i + 1}/${targetTickers.length}] Revisando ${ticker}...`);
      await processCompany(ticker, stats);
    }

    const roundDuration = ((Date.now() - roundStart) / 1000 / 60).toFixed(1);
    console.log(`\n[${timestamp()}] ── RESUMEN RONDA #${round} ──`);
    console.log(` • Analizados nuevos: ${stats.analyzed}`);
    console.log(` • Ya analizados (omitidos): ${stats.skipped}`);
    console.log(` • Fallidos/no disponibles: ${stats.failed}`);
    console.log(` • Duración total de la ronda: ${roundDuration} minutos`);

    if (RUN_ONCE || shouldStop) {
      console.log(`[${timestamp()}] Ejecución completada.`);
      break;
    }

    round += 1;
    console.log(`\n[${timestamp()}] Esperando ${LOOP_DELAY_MINUTES} minutos antes de comprobar nuevos filings... (Presiona Ctrl+C para detener)`);
    const waitMs = LOOP_DELAY_MINUTES * 60 * 1000;
    const intervalCheck = 1000;
    let waited = 0;
    while (waited < waitMs && !shouldStop) {
      await sleep(intervalCheck);
      waited += intervalCheck;
    }
  }

  await pool.end();
  console.log(`[${timestamp()}] Programa finalizado con éxito.`);
}

runWorker().catch((error) => {
  console.error(`[FATAL] Error crítico en el trabajador:`, error);
  process.exit(1);
});
