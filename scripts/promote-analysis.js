#!/usr/bin/env node
/**
 * @fileoverview Promociona a producción (cifra_prod) un análisis verificado en local.
 *
 * Lee la fila del análisis en la BD local, regenera sus formatos (PDF/HTML/DOCX/ODT),
 * inserta o actualiza de forma idempotente el análisis en cifra_prod con is_public=true
 * e is_reviewed=true (sello de verificado), copia los ficheros generados al VPS y
 * reinicia el servicio para invalidar la caché SEO.
 *
 * Uso:
 *   node --env-file=.env scripts/promote-analysis.js --id=713 [--dry-run] [--with-translations]
 *   node --env-file=.env scripts/promote-analysis.js --ticker=KDP --accession=0001418135-26-000026
 *
 * Opciones:
 *   --id=<n>               Identificador del análisis en la BD local.
 *   --ticker=<T>           Ticker (junto con --accession) para localizar el último análisis.
 *   --accession=<acc>      Accession del filing (junto con --ticker).
 *   --with-translations    Promueve también las variantes de otros idiomas del mismo filing.
 *   --dry-run              Muestra lo que haría sin tocar producción (solo lectura).
 *   --ssh=<host>           Host SSH de producción (por defecto: cifra-vps).
 *   --prod-dir=<ruta>      Directorio del proyecto en producción (por defecto: /var/www/cifra-prod).
 *   --help                 Muestra esta ayuda.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { query, pool } from '../db/pool.js';
import { GENERATED_DIR } from '../src/services/report.service.js';
import { regenerateAllReportFormats } from '../src/api/controllers/reportDownload.controller.js';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const ANALYSIS_ID = getArg('id');
const TICKER = getArg('ticker');
const ACCESSION = getArg('accession');
const DRY_RUN = hasFlag('dry-run');
const WITH_TRANSLATIONS = hasFlag('with-translations');
const SSH_TARGET = getArg('ssh', 'cifra-vps');
const PROD_DIR = getArg('prod-dir', '/var/www/cifra-prod');
const HELP = hasFlag('help') || args.length === 0;

const FORMAT_EXTENSIONS = ['pdf', 'html', 'docx', 'odt'];

const USAGE = `Promociona a producción un análisis verificado en local.

Uso:
  node --env-file=.env scripts/promote-analysis.js --id=<n> [--dry-run] [--with-translations]
  node --env-file=.env scripts/promote-analysis.js --ticker=<T> --accession=<acc> [--dry-run]

Opciones:
  --id=<n>               Identificador del análisis en la BD local.
  --ticker=<T>           Ticker (junto con --accession) para localizar el último análisis.
  --accession=<acc>      Accession del filing (junto con --ticker).
  --with-translations    Promueve también las variantes de otros idiomas del mismo filing.
  --dry-run              Muestra lo que haría sin tocar producción (solo lectura).
  --ssh=<host>           Host SSH de producción (por defecto: cifra-vps).
  --prod-dir=<ruta>      Directorio del proyecto en producción (por defecto: /var/www/cifra-prod).
  --help                 Muestra esta ayuda.`;

const ANALYSIS_COLUMNS = `id, filename, status, origin, sector, report, model_used, version, ticker,
    company_name, period_end::text AS period_end, pdf_url, source_url, accession, subsector,
    sector_version, language, created_at`;

// Comando remoto: resuelve DATABASE_URL del .env de producción con el propio Node
// (el .env no es "sourceable" porque MAIL_FROM contiene espacios) y ejecuta psql
// leyendo el SQL por stdin, sin problemas de comillas.
const REMOTE_PSQL = `cd ${PROD_DIR} && psql "$(node --env-file=.env -p 'process.env.DATABASE_URL')" -v ON_ERROR_STOP=1 -tA -f -`;

function step(index, message) {
  console.log(`[${index}/6] ${message}`);
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

function sqlJsonb(value) {
  const base64 = Buffer.from(JSON.stringify(value ?? null), 'utf8').toString('base64');
  return `convert_from(decode('${base64}', 'base64'), 'UTF8')::jsonb`;
}

function runRemote(sql) {
  return execFileSync('ssh', [SSH_TARGET, REMOTE_PSQL], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

async function loadAnalysis() {
  if (ANALYSIS_ID) {
    const id = Number(ANALYSIS_ID);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`--id no válido: ${ANALYSIS_ID}`);
    const { rows } = await query(
      `SELECT ${ANALYSIS_COLUMNS} FROM analyses WHERE id = $1 AND status = 'done' AND report IS NOT NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  if (!TICKER || !ACCESSION) {
    throw new Error('Indica --id=<n> o bien --ticker=<T> --accession=<acc>.');
  }

  const { rows } = await query(
    `SELECT ${ANALYSIS_COLUMNS} FROM analyses
      WHERE UPPER(ticker) = UPPER($1) AND accession = $2 AND status = 'done' AND report IS NOT NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [TICKER, ACCESSION],
  );
  return rows[0] ?? null;
}

async function loadTranslations(analysis) {
  const { rows } = await query(
    `SELECT DISTINCT ON (language) ${ANALYSIS_COLUMNS} FROM analyses
      WHERE UPPER(ticker) = UPPER($1) AND accession = $2 AND language <> $3
        AND status = 'done' AND report IS NOT NULL
      ORDER BY language, created_at DESC, id DESC`,
    [analysis.ticker, analysis.accession, analysis.language],
  );
  return rows;
}

function prodAnalysisId(pdfUrl) {
  const out = runRemote(
    `SELECT COALESCE(MAX(id), 0) FROM analyses WHERE pdf_url = ${sqlLiteral(pdfUrl)} AND report IS NOT NULL;`,
  );
  const lastLine = out.split('\n').filter(Boolean).pop() ?? '0';
  return Number(lastLine) || 0;
}

export function buildUpsertSql(analysis) {
  const columns = `(user_id, is_public, filename, status, origin, sector, report, model_used, version,
    ticker, company_name, period_end, pdf_url, source_url, accession, subsector, sector_version,
    language, created_at, is_reviewed, reviewed_at, reviewed_by)`;

  const values = `(NULL, true, ${sqlLiteral(analysis.filename)}, 'done', ${sqlLiteral(analysis.origin)},
    ${sqlLiteral(analysis.sector)}, ${sqlJsonb(analysis.report)}, ${sqlLiteral(analysis.model_used)},
    ${sqlLiteral(analysis.version)}, ${sqlLiteral(analysis.ticker)}, ${sqlLiteral(analysis.company_name)},
    ${sqlLiteral(analysis.period_end)}::date, ${sqlLiteral(analysis.pdf_url)}, ${sqlLiteral(analysis.source_url)},
    ${sqlLiteral(analysis.accession)}, ${sqlLiteral(analysis.subsector)}, ${sqlLiteral(analysis.sector_version)},
    ${sqlLiteral(analysis.language)}, ${sqlLiteral(analysis.created_at)}::timestamptz, true, now(),
    (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1))`;

  const assignments = [
    'is_public = true',
    "status = 'done'",
    `filename = ${sqlLiteral(analysis.filename)}`,
    `origin = ${sqlLiteral(analysis.origin)}`,
    `sector = ${sqlLiteral(analysis.sector)}`,
    `report = ${sqlJsonb(analysis.report)}`,
    `model_used = ${sqlLiteral(analysis.model_used)}`,
    `version = ${sqlLiteral(analysis.version)}`,
    `ticker = ${sqlLiteral(analysis.ticker)}`,
    `company_name = ${sqlLiteral(analysis.company_name)}`,
    `period_end = ${sqlLiteral(analysis.period_end)}::date`,
    `pdf_url = ${sqlLiteral(analysis.pdf_url)}`,
    `source_url = ${sqlLiteral(analysis.source_url)}`,
    `accession = ${sqlLiteral(analysis.accession)}`,
    `subsector = ${sqlLiteral(analysis.subsector)}`,
    `sector_version = ${sqlLiteral(analysis.sector_version)}`,
    `language = ${sqlLiteral(analysis.language)}`,
    `created_at = ${sqlLiteral(analysis.created_at)}::timestamptz`,
    'is_reviewed = true',
    'reviewed_at = now()',
    "reviewed_by = (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1)",
  ].join(',\n      ');

  return `DO $$
DECLARE
  target_id INT;
BEGIN
  SELECT id INTO target_id FROM analyses
   WHERE pdf_url = ${sqlLiteral(analysis.pdf_url)} AND report IS NOT NULL
   ORDER BY id DESC LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO analyses ${columns}
    VALUES ${values};
  ELSE
    UPDATE analyses SET
      ${assignments}
    WHERE id = target_id;
  END IF;
END $$;`;
}

async function promoteOne(analysis) {
  const baseId = path.basename(String(analysis.pdf_url ?? ''), '.pdf');
  if (!/^[A-Za-z0-9-]+$/.test(baseId)) {
    throw new Error(`pdf_url no válido para el análisis #${analysis.id}: ${analysis.pdf_url}`);
  }

  step(1, `Análisis local #${analysis.id} · ${analysis.ticker} ${analysis.accession} · idioma ${analysis.language}`);
  step(2, `Informe base: ${baseId} · pdf_url ${analysis.pdf_url}`);

  const existingId = prodAnalysisId(analysis.pdf_url);
  step(3, existingId
    ? `Producción ya tiene este informe (id ${existingId}): se actualizará.`
    : 'Producción no tiene este informe: se insertará.');

  if (DRY_RUN) {
    step(4, 'Se regenerarían los formatos locales (PDF/HTML/DOCX/ODT).');
    step(5, `Se copiarían los formatos a ${SSH_TARGET}:${PROD_DIR}/uploads/generated/.`);
    step(6, 'Se reiniciaría cifra-prod para invalidar la caché SEO.');
    console.log(`\n[DRY-RUN] Sin cambios en producción. Análisis listo para promover: #${analysis.id}.`);
    return null;
  }

  step(4, 'Regenerando formatos locales...');
  await regenerateAllReportFormats(baseId, analysis.report);
  const files = FORMAT_EXTENSIONS
    .map((ext) => path.join(GENERATED_DIR, `${baseId}.${ext}`))
    .filter((file) => fs.existsSync(file));
  if (!files.length) throw new Error(`No se generó ningún formato para ${baseId}.`);

  step(5, 'Escribiendo en cifra_prod...');
  runRemote(buildUpsertSql(analysis));

  step(6, `Copiando ${files.length} fichero(s) a ${SSH_TARGET}:${PROD_DIR}/uploads/generated/ ...`);
  execFileSync('scp', ['-q', ...files, `${SSH_TARGET}:${PROD_DIR}/uploads/generated/`], { encoding: 'utf8' });

  try {
    execFileSync('ssh', [SSH_TARGET, 'sudo -n systemctl restart cifra-prod'], { encoding: 'utf8' });
    console.log('      Servicio cifra-prod reiniciado (caché SEO invalidada).');
  } catch {
    console.warn('      Aviso: no se pudo reiniciar cifra-prod; la caché se refrescará por TTL.');
  }

  const verification = runRemote(
    `SELECT id, ticker, is_reviewed, to_char(reviewed_at, 'YYYY-MM-DD HH24:MI') AS reviewed,
            pdf_url
       FROM analyses
      WHERE pdf_url = ${sqlLiteral(analysis.pdf_url)} AND report IS NOT NULL
      ORDER BY id DESC LIMIT 1;`,
  );
  const remoteFile = runRemote(`ls -l ${PROD_DIR}/uploads/generated/${baseId}.pdf`);

  console.log('\nVerificación en producción:');
  console.log(`  ${verification}`);
  console.log(`  ${remoteFile}`);
  return verification;
}

async function main() {
  if (HELP) {
    console.log(USAGE);
    return 0;
  }

  if (DRY_RUN) console.log('*** MODO DRY-RUN: no se tocará producción ***\n');

  const analysis = await loadAnalysis();
  if (!analysis) {
    console.error('No se encontró el análisis en la BD local (status=done y report no nulo).');
    return 1;
  }

  await promoteOne(analysis);

  if (WITH_TRANSLATIONS) {
    const translations = await loadTranslations(analysis);
    if (!translations.length) {
      console.log('\nNo hay variantes en otros idiomas para este filing.');
    }
    for (const translation of translations) {
      console.log('');
      await promoteOne(translation);
    }
  }

  console.log('\nListo.');
  return 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`\nError: ${error.stderr?.toString().trim() || error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
