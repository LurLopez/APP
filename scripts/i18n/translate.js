#!/usr/bin/env node
/**
 * Traduce los textos extraídos (español → idioma destino) con el proveedor de IA
 * configurado y los guarda en `public/locales/<codigo>.json`.
 *
 * Uso: node --env-file=.env scripts/i18n/translate.js [--lang=en] [--batch=30] [--concurrency=2] [--limit=0]
 * Es reanudable: solo traduce las claves que faltan en el fichero destino.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatJson } from '../../src/services/ai/modelProvider.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES_FILE = path.join(ROOT, 'public/locales/_sources.json');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? 'true'];
}));

const LANG = args.lang || 'en';
const BATCH_SIZE = Number(args.batch || 30);
const CONCURRENCY = Number(args.concurrency || 2);
const LIMIT = Number(args.limit || 0);

const OUTPUT_FILE = path.join(ROOT, `public/locales/${LANG}.json`);

const GLOSSARY = `
GLOSARIO OBLIGATORIO (usa estas traducciones exactas cuando aparezcan):
- Ventas → Sales; Beneficio Bruto → Gross Profit; Beneficio Operativo → Operating Income; Beneficio Neto → Net Income
- Anterior Aj. → Prev. Adj.; Anterior N. → Prev. N.; % Ajustado → % Adjusted; % Normal → % Normal
- Ajustado → Adjusted; Normal → Normal; Métrica → Metric; Asignación de capital → Capital Allocation
- Recompras → Buybacks; Desinversiones → Divestitures; Adquisiciones → Acquisitions; En total → Total
- Efectivo restringido → Restricted cash; Inversiones a corto plazo → Short-term investments
- FCF/Acción → FCF/Share; Dividendo → Dividend; Libres/Libre → Free; Caja → Cash; Deuda → Debt
- Cash Flow → Cash Flow; Outlook → Outlook; BPA → EPS; Acciones → Shares
- Trimestre → quarter; Anual → annual; Ejercicio → fiscal year; Periodo → period; Año anterior → Prior year
- Guardar → Save; Cancelar → Cancel; Cerrar → Close; Aceptar → Accept; Buscar → Search; Descargar → Download
- Subir → Upload; Analizar → Analyze; Iniciar sesión → Sign in; Registrarse → Sign up; Salir → Sign out
- Cartera → Portfolio; Listas de seguimiento → Watchlists; Comunidad → Community; Foro → Forum
- Nota de resultados → Results score; Calificación → Rating; Vencimientos → Maturities; Refinanciación → Refinancing
`;

const SYSTEM_PROMPT = `Eres un traductor profesional de español a ${LANG === 'en' ? 'inglés' : LANG} para la interfaz y los informes de una aplicación web de análisis financiero (SEC 10-Q/10-K).

Reglas:
- Traduce cada entrada de la lista de forma natural y concisa, manteniendo el sentido exacto.
- Conserva intactos los marcadores entre llaves ({n}, {value}, {amount}...), los símbolos ($, %, M), el markdown (**negrita**) y los números.
- Mantén un tono profesional financiero; usa terminología contable estándar en inglés de EE. UU.
- No traduzcas nombres propios de empresas, tickers ni URLs.
- Si una entrada ya está en inglés, devuélvela igual.
${GLOSSARY}
Devuelve ÚNICAMENTE un objeto JSON válido con la forma { "traducciones": ["<traducción 1>", "<traducción 2>", ...] } con EXACTAMENTE el mismo número de elementos que la lista recibida y en el mismo orden.`;

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const sources = loadJson(SOURCES_FILE, []);
const translations = loadJson(OUTPUT_FILE, {});

const missing = sources.filter((text) => !translations[text]);
const selected = LIMIT > 0 ? missing.slice(0, LIMIT) : missing;

console.log(`Idioma destino: ${LANG}`);
console.log(`Textos fuente: ${sources.length} · ya traducidos: ${sources.length - missing.length} · pendientes: ${missing.length} · en esta ejecución: ${selected.length}`);

const batches = [];
for (let i = 0; i < selected.length; i += BATCH_SIZE) {
  batches.push(selected.slice(i, i + BATCH_SIZE));
}

function save() {
  const sorted = {};
  for (const key of Object.keys(translations).sort((a, b) => a.localeCompare(b, 'es'))) {
    sorted[key] = translations[key];
  }
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

let done = 0;
let failed = 0;

async function translateBatch(batch, index) {
  const payload = batch.map((text, i) => `[${i + 1}] ${text}`).join('\n');
  try {
    const result = await chatJson([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Traduce estas ${batch.length} entradas en orden (devuelve un array de ${batch.length} traducciones):\n\n${payload}` },
    ], 2);
    const list = result?.traducciones ?? result?.translations ?? null;
    let applied = 0;
    if (Array.isArray(list)) {
      batch.forEach((text, i) => {
        const value = list[i];
        if (typeof value === 'string' && value.trim()) {
          translations[text] = value;
          applied += 1;
        }
      });
    } else if (list && typeof list === 'object') {
      for (const text of batch) {
        const value = list[text];
        if (typeof value === 'string' && value.trim()) {
          translations[text] = value;
          applied += 1;
        }
      }
    }
    if (applied === 0) throw new Error('Respuesta sin traducciones utilizables');
    done += applied;
    save();
    console.log(`  lote ${index + 1}/${batches.length}: ${applied}/${batch.length} traducidas`);
  } catch (error) {
    failed += batch.length;
    console.warn(`  lote ${index + 1}/${batches.length} falló: ${error.message}`);
  }
}

async function run() {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
    while (cursor < batches.length) {
      const index = cursor;
      cursor += 1;
      await translateBatch(batches[index], index);
    }
  });
  await Promise.all(workers);
  save();
  console.log(`Traducciones nuevas: ${done} · fallidas: ${failed} · total en ${OUTPUT_FILE}: ${Object.keys(translations).length}`);
}

run().catch((error) => {
  console.error('Error general:', error.message);
  process.exitCode = 1;
});
