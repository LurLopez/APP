#!/usr/bin/env node
/**
 * Auditoría de cobertura de traducciones: carga páginas reales con Chrome headless
 * (idioma inglés), extrae los textos visibles que siguen en español y los compara
 * con el diccionario. Salida: public/locales/_missing.json (candidatos a añadir).
 *
 * Uso: node scripts/i18n/audit.js [url1 url2 ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EN_PATH = path.join(ROOT, 'public/locales/en.json');
const OUTPUT = path.join(ROOT, 'public/locales/_missing.json');

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/en', '/en/empresa/KHC', '/en/guias', '/en/guias/que-es-un-informe-10-k', '/en/legal/aviso-legal', '/en/legal/privacidad', '/en/legal/cookies', '/en/legal/terminos'];

const SPANISH_WORDS = ['el', 'la', 'los', 'las', 'un', 'una', 'del', 'que', 'con', 'para', 'por', 'sin', 'más', 'está', 'hay', 'como', 'muy', 'este', 'esta', 'todo', 'todos', 'otro', 'nuevo', 'desde', 'hasta', 'cuando', 'porque', 'también', 'solo', 'sobre', 'entre'];
const SPANISH_WORD_RE = new RegExp(`\\b(${SPANISH_WORDS.join('|')})\\b`, 'i');

const HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—',
  ndash: '–', laquo: '«', raquo: '»', times: '×', minus: '−', le: '≤', ge: '≥', middot: '·',
  bull: '•', check: '✓', euro: '€', deg: '°', copy: '©', reg: '®', trade: '™',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓',
};

/**
 * Decodifica entidades HTML para que el texto extraído coincida con el diccionario,
 * que usa los caracteres reales y no sus entidades (`&amp;`, `&lt;`, `&#39;`...).
 * @param {string} text
 * @returns {string}
 */
function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

function looksSpanish(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length < 3 || clean.length > 1500) return false;
  if (!/[a-záéíóúüñ]/i.test(clean)) return false;
  if (/^[#./]|=>|===|\$\{|<|>/.test(clean)) return false;
  if (/[áéíóúüñ¿¡]/i.test(clean)) return true;
  return SPANISH_WORD_RE.test(clean);
}

function extractTexts(html) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // El motor i18n de cliente no traduce los bloques `data-i18n-skip`: los pinta
    // el servidor en el idioma de la ruta, así que no son candidatos de auditoría.
    .replace(/<details[^>]*data-i18n-skip[\s\S]*?<\/details>/gi, ' ');
  const texts = [];
  const re = />([^<>]+)</g;
  let match;
  while ((match = re.exec(withoutScripts)) !== null) {
    const text = decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim());
    if (looksSpanish(text)) texts.push(text);
  }
  return texts;
}

function dumpDom(url) {
  try {
    return execFileSync('google-chrome', [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--lang=en-US', '--accept-lang=en-US,en',
      '--virtual-time-budget=7000', '--dump-dom', url,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 45000 });
  } catch (error) {
    console.warn(`[audit] No se pudo cargar ${url}: ${error.message}`);
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const dictionary = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
const patternSources = Object.keys(dictionary).filter((key) => /\{\d+\}/.test(key));
const patternRegexes = patternSources.map((source) => ({
  source,
  regex: new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\d+)\\\}/g, '(.+?)')}$`),
}));

const missing = new Map();
for (const url of urls) {
  const html = dumpDom(`${BASE}${url}`);
  const texts = extractTexts(html);
  for (const text of texts) {
    if (dictionary[text]) continue;
    if (patternRegexes.some((entry) => entry.regex.test(text))) continue;
    if (!missing.has(text)) missing.set(text, url);
  }
  console.log(`[audit] ${url}: ${texts.length} textos visibles · ${texts.filter((t) => !dictionary[t]).length} sin coincidencia exacta`);
  await sleep(1500);
}

const result = [...missing.entries()].map(([text, url]) => ({ text, url }));
fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`\nCandidatos sin traducir: ${result.length} → ${path.relative(ROOT, OUTPUT)}`);
for (const item of result.slice(0, 40)) console.log(`  [${item.url}] ${item.text}`);
