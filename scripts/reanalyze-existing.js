#!/usr/bin/env node

import { PROVIDER, state, logEvent, main } from './reanalyze.core.js';

/**
 * Reanálisis continuo de informes que YA tienen versiones anteriores.
 *
 * Regenera con IA (OpenCode Go, thinking desactivado vía AI_THINKING=disabled)
 * cada par ticker+filing que ya existe en la base de datos, en pasadas sucesivas,
 * para poder comparar la versión anterior con la nueva. Se detiene al alcanzar
 * el límite de la API (AI_RATE_LIMIT) o tras varios fallos consecutivos.
 *
 * Uso:
 *   node --env-file=.env scripts/reanalyze-existing.js
 *   node --env-file=.env scripts/reanalyze-existing.js --provider=opencode --delay=2000
 *
 * Opciones CLI:
 *   --provider=opencode   Proveedor IA (por defecto: opencode).
 *   --tickers=KO,PEP      Limita a una lista de tickers.
 *   --concurrency=4       Análisis simultáneos en paralelo (por defecto: 1).
 *   --delay=2000          Pausa en ms entre análisis de cada worker (por defecto: 2000).
 *   --rate-limit-wait=45  Segundos de espera tras una saturación antes de reintentar.
 *   --max-rate-limits=12  Saturaciones seguidas (compartidas) antes de detenerse.
 *   --run-minutes=55      Duración máxima en minutos; 0 = sin límite (por defecto: 0).
 *   --max-passes=0        Pasadas máximas; 0 = sin límite (por defecto: 0).
 */

import { getCompanyFilings, getFilingContentBuffer, getPresentationBuffers } from '../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../src/services/analysis.service.js';
import { AiProviderError } from '../src/services/ai/modelProvider.js';
import { getPublicReportMarkdown, buildReportSlug, loadPublicReportRow } from '../src/services/seo.service.js';
import { pool } from '../db/pool.js';
import { mkdirSync, writeFileSync } from 'node:fs';

process.env.AI_PROVIDER = PROVIDER;

main().catch(async (error) => {
  state.stopReason = `error fatal: ${error.message}`;
  logEvent(`[FATAL] ${error.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
