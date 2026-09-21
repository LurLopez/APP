#!/usr/bin/env node

import { TARGET_PROVIDER } from './analyze-consumer.core.js';
import { runWorker } from './analyze-consumer.worker.js';

/**
 * Worker continuo para análisis de empresas de Consumo Defensivo (EE. UU.)
 *
 * Utiliza la suscripción de OpenCode Go para pregenerar los análisis de informes
 * trimestrales (10-Q) y anuales (10-K) de forma continua y guardarlos en la base
 * de datos. Cuando un usuario hace clic en "Analizar con IA" en la web, el análisis
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
 *   --sector=discretionary  Trabaja el universo de consumo discrecional (por defecto: staples).
 *   --universe=large        curated | large (EE. UU. >1.000M $) | all (todas las de EE. UU.).
 *   --years=5               Últimos N años de informes (3, 5, 10...); all = todo el histórico.
 *   --list                  Solo muestra el universo seleccionado y termina.
 *   --max-quarters=2        Máximo número de informes recientes por empresa (por defecto: todos).
 *   --all-quarters          Analiza todos los 10-Q/10-K disponibles.
 *   --per-form=1            Máximo de informes por tipo (10-Q y 10-K) por empresa; 1 = último de cada tipo.
 *   --force                 Reanaliza aunque ya exista un análisis previo (crea una versión nueva).
 *   --provider=opencode     Proveedor IA a usar (por defecto: opencode).
 *   --concurrency=3         Análisis simultáneos, en empresas distintas (por defecto: 1).
 *   --delay=3000            Retardo en ms entre filings (por defecto: 3000 ms).
 *   --loop-delay=15         Minutos de espera entre rondas completas en modo continuo (por defecto: 15).
 *
 * Variables de entorno equivalentes:
 *   WORKER_UNIVERSE=curated|large|all · WORKER_YEARS=3|5|10|all
 *   WORKER_SECTOR=staples|discretionary · WORKER_AI_PROVIDER=opencode · WORKER_CONCURRENCY=3
 */

import { getCompanyFilings, getFilingContentBuffer, getPresentationBuffers } from '../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../src/services/analysis.service.js';
import { findLatestDoneAnalysis } from '../db/repositories/analysisRepository.js';
import { isAnalysisOutdated } from '../src/agents/sectorAgent.js';
import { CONSUMER_STAPLES_UNIVERSE } from './data/consumer-staples.js';
import { pool } from '../db/pool.js';

// Parsear argumentos de línea de comandos

// Configurar el proveedor para este proceso
process.env.AI_PROVIDER = TARGET_PROVIDER;

// Universo de empresas: lista curada (por defecto), grandes (>1.000M $) o todas
// las de EE. UU. sin ADR ni duplicados. El alcance temporal y el sector se
// configuran en analyze-consumer.core.js (--years, --sector).

// Ejecuta las tareas con un máximo de `limit` en paralelo.

runWorker().catch((error) => {
  console.error(`[FATAL] Error crítico en el trabajador:`, error);
  process.exit(1);
});
