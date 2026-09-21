/**
 * @fileoverview Módulo extraído de analyze-defensive-consumer.js.
 */

import { getCompanyFilings } from '../src/services/edgar.service.js';
import { findLatestDoneAnalysis } from '../db/repositories/analysisRepository.js';
import { isAnalysisOutdated } from '../src/agents/sectorAgent.js';
import { pool } from '../db/pool.js';
import { RUN_ONCE, LIST_ONLY, SPECIFIC_TICKERS_RAW, MAX_QUARTERS, PER_FORM, FORCE, DELAY_MS, LOOP_DELAY_MINUTES, CONCURRENCY, TARGET_PROVIDER, UNIVERSE_MODE, SECTOR_LABEL, FROM_YEAR, YEARS_LABEL, resolveUniverse, shouldStop, sleep, runWithConcurrency, timestamp, handleSignals, analyzeSingleFiling, getFilingYear } from './analyze-consumer.core.js';

async function processCompany(ticker, stats) {
  if (shouldStop) return;

  try {
    const filingsData = await getCompanyFilings(ticker, { limit: 120 });
    const allFilings = filingsData?.filings ?? [];

    // Informes 10-Q (trimestrales) y 10-K (anuales) según el rango de años elegido
    let reportFilings = allFilings
      .filter((f) => ['10-Q', '10-K'].includes(f.formType))
      .filter((f) => {
        if (FROM_YEAR === null) return true;
        const year = getFilingYear(f);
        return year !== null && year >= FROM_YEAR;
      })
      .sort((a, b) => {
        const dateA = a.period || a.filedAt || '';
        const dateB = b.period || b.filedAt || '';
        return dateB.localeCompare(dateA); // Más recientes primero: Q2 2026, Q1 2026, 10-K 2025, Q3 2025... hasta 2020
      });

    if (MAX_QUARTERS !== Infinity) {
      reportFilings = reportFilings.slice(0, MAX_QUARTERS);
    }

    // Limitar a los N informes más recientes de cada tipo (10-Q y 10-K) por empresa.
    if (PER_FORM !== Infinity) {
      const perTypeCount = new Map();
      reportFilings = reportFilings.filter((f) => {
        const count = perTypeCount.get(f.formType) || 0;
        if (count >= PER_FORM) return false;
        perTypeCount.set(f.formType, count + 1);
        return true;
      });
    }

    if (!reportFilings.length) {
      console.log(`[${timestamp()}] [INFO] ${ticker}: sin informes 10-Q/10-K (${YEARS_LABEL}) para procesar.`);
      return;
    }

    const firstLabel = reportFilings[0]?.periodLabel || reportFilings[0]?.period;
    const lastLabel = reportFilings[reportFilings.length - 1]?.periodLabel || reportFilings[reportFilings.length - 1]?.period;
    console.log(`[${timestamp()}] [INFO] ${ticker}: ${reportFilings.length} informes 10-Q/10-K (${YEARS_LABEL}: ${firstLabel} → ${lastLabel}).`);

    for (const filing of reportFilings) {
      if (shouldStop) break;

      // 1. Comprobar si ya está analizado en la base de datos
      const existing = await findLatestDoneAnalysis({ ticker, accession: filing.accession });
      if (existing && existing.status === 'done' && existing.report) {
        if (existing.is_reviewed) {
          console.log(`[${timestamp()}] [SKIP] 🛡️  ${ticker} | ${filing.periodLabel || filing.period} está revisado por un humano. No se regenera automáticamente.`);
          stats.skipped += 1;
          continue;
        }
        if (!FORCE) {
          const versionOptions = {
            sector: existing.sector ?? 'defensive_consumer',
            subsector: existing.subsector ?? null,
            ticker,
            formType: filing.formType,
          };
          const outdated = await isAnalysisOutdated({
            version: existing.version,
            ...versionOptions,
          });
          if (!outdated) {
            console.log(`[${timestamp()}] [SKIP] ⏭️  ${ticker} | ${filing.periodLabel || filing.period} ya analizado previamente en la versión vigente.`);
            stats.skipped += 1;
            continue;
          }
          console.log(`[${timestamp()}] [UPGRADE] 🔄 ${ticker} | ${filing.periodLabel || filing.period} tiene nueva versión (v${existing.version ?? 'desconocida'}). Regenerando...`);
        }
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

export async function runWorker() {
  handleSignals();

  console.log('='.repeat(70));
  console.log(` 🚀 TRABAJADOR DE PRE-ANÁLISIS CONTINUO - ${SECTOR_LABEL} (EE. UU.)`);
  console.log('='.repeat(70));
  console.log(` • Proveedor IA activo:   ${TARGET_PROVIDER}`);
  console.log(` • Clave OpenCode Go:     ${process.env.OPENCODE_GO_API_KEY ? 'Configurada (OK)' : 'NO ENCONTRADA EN .ENV'}`);
  console.log(` • Modo de ejecución:     ${RUN_ONCE ? 'Una sola pasada (--once)' : 'Continuo sin parar'}`);
  console.log(` • Alcance temporal:      ${YEARS_LABEL}`);
  console.log(` • Orden:                 Descendente (más recientes primero)`);
  console.log(` • Análisis simultáneos:  ${CONCURRENCY}`);
  console.log(` • Pausa entre filings:   ${DELAY_MS} ms`);
  console.log('='.repeat(70));

  if (!process.env.OPENCODE_GO_API_KEY && TARGET_PROVIDER.includes('opencode')) {
    console.error(`\n[ERROR] Falta OPENCODE_GO_API_KEY en tu archivo .env.`);
    console.error(`Para gastar tu suscripción de OpenCode Go, introduce tu clave en .env:`);
    console.error(`OPENCODE_GO_API_KEY=tu-clave-aqui\n`);
    process.exit(1);
  }

  // Determinar lista de tickers: manual (--tickers) o el universo elegido
  const universe = resolveUniverse(UNIVERSE_MODE);
  let targetTickers = universe.tickers;
  if (SPECIFIC_TICKERS_RAW) {
    targetTickers = SPECIFIC_TICKERS_RAW.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    console.log(` • Empresas especificadas (${targetTickers.length}): ${targetTickers.join(', ')}`);
  } else {
    console.log(` • Universo:              ${universe.label} (${targetTickers.length} empresas)`);
  }

  if (LIST_ONLY) {
    console.log(targetTickers.join(', '));
    await pool.end();
    return;
  }

  let round = 1;

  while (!shouldStop) {
    const roundStart = Date.now();
    console.log(`\n[${timestamp()}] ── INICIANDO RONDA #${round} (${targetTickers.length} empresas) ──\n`);

    const stats = { analyzed: 0, skipped: 0, failed: 0 };

    let reviewed = 0;
    await runWithConcurrency(targetTickers, CONCURRENCY, async (ticker) => {
      if (shouldStop) return;
      reviewed += 1;
      console.log(`[${timestamp()}] [${reviewed}/${targetTickers.length}] Revisando ${ticker}...`);
      await processCompany(ticker, stats);
    });

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
