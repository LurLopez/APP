#!/usr/bin/env node
/**
 * Extrae los textos visibles en español de la interfaz y de los servicios para
 * construir los diccionarios de idioma (`public/locales/<codigo>.json`).
 *
 * Uso: node scripts/i18n/extract.js
 * Salida:
 *   public/locales/_sources.json           → textos estáticos únicos
 *   public/locales/_sources-dynamic.json   → plantillas con interpolación ${} (revisión manual)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_STATIC = path.join(ROOT, 'public/locales/_sources.json');
const OUTPUT_DYNAMIC = path.join(ROOT, 'public/locales/_sources-dynamic.json');

const SCAN_ROOTS = ['public', 'src'];
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'locales', '.agents', 'scratch', 'tests']);
const EXCLUDED_FILES = new Set([
  'i18n.js',
  'analystSystemPrompt.js',
  'analystAnnualSystemPrompt.js',
  'analystExtractionPrompt.js',
  'analystExtractionSchema.js',
  'analystAnnualSchema.js',
  'languageDirective.js',
  'debtMaturityPrompt.js',
  'debtRefinancingPrompt.js',
  'translationPrompt.js',
]);

const SPANISH_WORDS = [
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'del', 'que', 'con', 'para', 'por', 'sin',
  'más', 'está', 'están', 'hay', 'como', 'muy', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
  'esos', 'esas', 'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras', 'nuevo', 'nueva',
  'nuevos', 'nuevas', 'cada', 'entre', 'desde', 'hasta', 'cuando', 'donde', 'porque', 'aunque',
  'también', 'solo', 'menos', 'igual', 'sobre', 'bajo', 'tras', 'ante', 'según', 'durante', 'mediante',
  'tiene', 'tienen', 'hacer', 'ver', 'ser', 'estar', 'puede', 'pueden', 'debe', 'deben', 'quiero',
  'tus', 'sus', 'nuestro', 'nuestra', 'vuestro', 'tu', 'mi', 'mis', 'nos', 'les',
  'guardar', 'cancelar', 'cerrar', 'aceptar', 'buscar', 'descargar', 'subir', 'analizar', 'iniciar',
  'entrar', 'salir', 'añadir', 'eliminar', 'editar', 'cargando', 'datos', 'resultado', 'resultados',
  'fecha', 'importe', 'total', 'media', 'cambio', 'error', 'aviso', 'usuario', 'contraseña',
  'correo', 'cuenta', 'empresa', 'empresas', 'análisis', 'informe', 'informes', 'ventas', 'beneficio',
  'deuda', 'caja', 'acciones', 'dividendo', 'dividendos', 'recompras', 'recompra', 'compras',
  'adquisiciones', 'desinversiones', 'trimestre', 'anual', 'año', 'años', 'mes', 'meses', 'día',
  'días', 'hoy', 'ayer', 'mañana', 'precio', 'valor', 'mercado', 'cartera', 'lista', 'listas',
  'seguimiento', 'comunidad', 'foro', 'gratis', 'próximamente', 'atención', 'importante', 'ejemplo',
  'nota', 'notas', 'periodo', 'métrica', 'ajustado', 'ajustada', 'normal', 'libre', 'deuda', 'efectivo',
  'restringido', 'pasivo', 'patrimonio', 'margen', 'crecimiento', 'riesgo', 'resumen', 'detalle',
  'mostrar', 'ocultar', 'activar', 'desactivar', 'confirmar', 'enviar', 'copiar', 'compartir',
  'volver', 'continuar', 'cerrar', 'abrir', 'seleccionar', 'introducir', 'escribe', 'elige',
];

const SPANISH_CHARS = /[áéíóúüñ¿¡]/i;
const SPANISH_WORD_RE = new RegExp(`\\b(${SPANISH_WORDS.join('|')})\\b`, 'i');
const CODEY_RE = /^(?:[a-z][\w-]*|[\w./-]+\.(?:js|css|png|svg|json|html|md)|https?:\/\/|mailto:|tel:|#[\w-]+|[\w-]+(?:__|--)[\w-]+)$/i;

/**
 * Carga listas de palabras (español e inglés) para clasificar textos con precisión.
 * Si no existen en el sistema, se usan solo las heurísticas.
 * @returns {{ spanish: Set<string>, english: Set<string> }}
 */
function loadWordLists() {
  const spanish = new Set();
  const spanishBare = new Set();
  const english = new Set();
  const read = (file, target) => {
    try {
      for (const word of fs.readFileSync(file, 'utf8').split(/\s+/)) {
        const clean = word.trim().toLowerCase();
        if (clean.length >= 3) target.add(clean);
      }
    } catch {
      // Lista no disponible
    }
  };
  read('/usr/share/dict/spanish', spanish);
  read('/usr/share/dict/american-english', english);
  for (const word of spanish) spanishBare.add(stripAccents(word));
  return { spanish, spanishBare, english };
}

const WORD_LISTS = loadWordLists();

function stripAccents(word) {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * ¿El texto contiene alguna palabra claramente española (no inglesa)?
 * Los diccionarios del sistema vienen en forma base: se prueban plurales y variantes sin tilde.
 * @param {string} text
 * @returns {boolean}
 */
function hasSpanishWord(text) {
  if (!WORD_LISTS.spanish.size) return false;
  const words = String(text).toLowerCase().match(/[a-záéíóúüñ]{3,}/g) || [];
  let spanishOnly = 0;
  for (const word of words) {
    const bare = stripAccents(word);
    const candidates = new Set([word, bare]);
    for (const variant of [word, bare]) {
      if (variant.endsWith('es')) candidates.add(variant.slice(0, -2));
      if (variant.endsWith('s')) candidates.add(variant.slice(0, -1));
    }
    const isSpanish = [...candidates].some((candidate) => WORD_LISTS.spanish.has(candidate) || WORD_LISTS.spanishBare.has(candidate));
    if (!isSpanish) continue;
    const isEnglish = WORD_LISTS.english.has(word) || WORD_LISTS.english.has(bare);
    if (!isEnglish) spanishOnly += 1;
  }
  return spanishOnly >= 1 && (words.length === 1 || spanishOnly >= 2 || /\s/.test(String(text).trim()));
}

function looksSpanish(text) {
  const clean = String(text ?? '').trim();
  if (clean.length < 2 || clean.length > 4000) return false;
  if (!/[a-záéíóúüñ]/i.test(clean)) return false;
  if (/[\n\r\t]/.test(clean)) return false;
  if (/[<>]|\\n|\\t|\\u|=>|===|!==|\$\{|^[\w./-]+@[\w./-]+$/.test(clean)) return false;
  if (/^[#./]/.test(clean)) return false;
  if (/^[\^/]|\|.*\||\(\?:|\\[bdsw]/.test(clean)) return false;
  if (SPANISH_CHARS.test(clean)) return true;
  if (SPANISH_WORD_RE.test(clean)) return true;
  if (/\b[a-záéíóúüñ]{6,}(?:ado|ada|ados|adas|ido|ida|idos|idas|ción|ciones|mente|dad|dades|eza|ífico|ífica|ario|aria|ería|ista|istas|ible|ables|ación)\b/i.test(clean)) return true;
  if (hasSpanishWord(clean)) return true;
  // Descartar claves técnicas una vez comprobado que no parecen español
  if (CODEY_RE.test(clean)) return false;
  return false;
}

/**
 * Términos semilla imprescindibles para la interfaz (garantiza su presencia en el diccionario).
 * @returns {string[]}
 */
function loadSeeds() {
  const seedsFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seeds.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Elimina comentarios de un fichero JS conservando cadenas.
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  let out = '';
  let quote = null;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Recorre una fuente JS y ejecuta un callback por cada plantilla backtick,
 * saltando correctamente las expresiones `${...}` (incluidas las anidadas).
 * @param {string} source
 * @param {(content: string) => void} onTemplate
 */
function scanTemplates(source, onTemplate) {
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '`') {
      i += 1;
      continue;
    }
    let j = i + 1;
    let depth = 0;
    let dirty = false;
    let content = '';
    while (j < source.length) {
      const ch = source[j];
      if (ch === '\\') {
        content += ch + (source[j + 1] ?? '');
        j += 2;
        continue;
      }
      if (ch === '`') {
        if (depth === 0) break;
        // Plantilla anidada dentro de una expresión: clave no fiable, se descarta.
        dirty = true;
        content += ch;
        j += 1;
        continue;
      }
      if (ch === '$' && source[j + 1] === '{') {
        depth += 1;
        content += '${';
        j += 2;
        continue;
      }
      if (ch === '}' && depth > 0) {
        depth -= 1;
        content += '}';
        j += 1;
        continue;
      }
      content += ch;
      j += 1;
    }
    if (!dirty) onTemplate(content);
    i = j + 1;
  }
}

function collectJsStrings(source, { dynamic }) {
  const clean = stripComments(source);
  const results = [];
  // Comillas simples y dobles (también anidadas dentro de plantillas).
  const quotedRe = /(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = quotedRe.exec(clean)) !== null) {
    const raw = match[2];
    const hasInterpolation = raw.includes('${');
    if (hasInterpolation === dynamic) results.push(raw);
  }
  // Plantillas backtick.
  scanTemplates(clean, (content) => {
    const hasInterpolation = content.includes('${');
    if (hasInterpolation === dynamic) results.push(content);
  });
  return results;
}

/**
 * Convierte una plantilla JS con `${...}` en clave de diccionario con marcadores `{0}`, `{1}`...
 * @param {string} raw
 * @returns {string}
 */
function normalizeTemplate(raw) {
  let index = 0;
  return String(raw).replace(/\$\{[^}]*\}/g, () => `{${index++}}`);
}

/**
 * ¿La clave normalizada es utilizable como texto traducible?
 * @param {string} key
 * @returns {boolean}
 */
function isUsableKey(key) {
  const clean = String(key ?? '').trim();
  if (!clean || clean.length < 2 || clean.length > 4000) return false;
  if (/^\{\w*\}$/.test(clean)) return false;
  if (/`|\$\{/.test(clean)) return false;
  if (/^\{\d+\}/.test(clean)) return false;
  return true;
}

function collectHtmlStrings(source, { dynamic }) {
  if (dynamic) return [];
  const results = [];
  const textRe = />([^<>]+)</g;
  let match;
  while ((match = textRe.exec(source)) !== null) {
    const raw = match[1].replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const candidate = raw.includes('${') ? normalizeTemplate(raw) : raw;
    if (isUsableKey(candidate) && looksSpanish(candidate.replace(/\{\d+\}/g, ' '))) results.push(candidate);
  }
  const attrRe = /(?:placeholder|aria-label|title|alt)="([^"]+)"/g;
  while ((match = attrRe.exec(source)) !== null) {
    const raw = match[1].trim();
    const candidate = raw.includes('${') ? normalizeTemplate(raw) : raw;
    if (isUsableKey(candidate) && looksSpanish(candidate.replace(/\{\d+\}/g, ' '))) results.push(candidate);
  }
  return results;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(?:js|html)$/.test(entry.name) && !EXCLUDED_FILES.has(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const staticTexts = new Set();
const dynamicTexts = new Set();
let scanned = 0;

for (const scanRoot of SCAN_ROOTS) {
  const base = path.join(ROOT, scanRoot);
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    const source = fs.readFileSync(file, 'utf8');
    scanned += 1;
    const isHtml = file.endsWith('.html');
    const collector = isHtml ? collectHtmlStrings : collectJsStrings;
    collector(source, { dynamic: false }).forEach((text) => {
      if (isUsableKey(text) && looksSpanish(text)) staticTexts.add(text);
      // Literales JS que construyen HTML: extraer también el texto interno de las etiquetas.
      if (!isHtml && /<[a-z][^>]*>/i.test(text)) {
        collectHtmlStrings(text, { dynamic: false }).forEach((inner) => staticTexts.add(inner));
      }
    });
    if (!isHtml) {
      collectJsStrings(source, { dynamic: true }).forEach((text) => {
        const normalized = normalizeTemplate(text);
        if (isUsableKey(normalized) && looksSpanish(normalized.replace(/\{\d+\}/g, ' '))) {
          dynamicTexts.add(text);
          staticTexts.add(normalized);
        }
        if (/<[a-z][^>]*>/i.test(text)) {
          collectHtmlStrings(text, { dynamic: false }).forEach((inner) => staticTexts.add(inner));
        }
      });
    }
  }
}

loadSeeds().forEach((text) => {
  if (typeof text === 'string' && isUsableKey(text)) staticTexts.add(text.trim());
});

const sortedStatic = [...staticTexts].sort((a, b) => a.localeCompare(b, 'es'));
const sortedDynamic = [...dynamicTexts].sort((a, b) => a.localeCompare(b, 'es'));
fs.mkdirSync(path.dirname(OUTPUT_STATIC), { recursive: true });
fs.writeFileSync(OUTPUT_STATIC, `${JSON.stringify(sortedStatic, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUTPUT_DYNAMIC, `${JSON.stringify(sortedDynamic, null, 2)}\n`, 'utf8');

console.log(`Ficheros escaneados: ${scanned}`);
console.log(`Textos estáticos únicos: ${sortedStatic.length} → ${path.relative(ROOT, OUTPUT_STATIC)}`);
console.log(`Plantillas dinámicas únicas: ${sortedDynamic.length} → ${path.relative(ROOT, OUTPUT_DYNAMIC)}`);
