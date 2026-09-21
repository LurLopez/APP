import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeLanguage,
  t,
  translatorFor,
  interpolate,
  localeFor,
  formatPercent,
  isSpanishOfficialCountry,
  isSpanishOfficialTimezone,
  detectPriorityLanguage,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from '../../src/utils/i18n.js';
import { getLanguageDirective } from '../../src/agents/analyst/languageDirective.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES_PATH = path.join(ROOT, 'public/locales/_sources.json');
const EN_PATH = path.join(ROOT, 'public/locales/en.json');

test('normaliza códigos de idioma regionales al idioma base soportado', () => {
  assert.equal(normalizeLanguage('es-ES'), 'es');
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('EN'), 'en');
  assert.equal(normalizeLanguage('fr'), 'es');
  assert.equal(normalizeLanguage(''), 'es');
  assert.equal(normalizeLanguage(undefined), 'es');
});

test('el idioma fuente devuelve el texto original y el destino traduce', () => {
  assert.equal(t('Guardar', null, 'es'), 'Guardar');
  assert.equal(t('Guardar', null, 'en'), 'Save');
  assert.equal(t('esta clave no existe', null, 'en'), 'esta clave no existe');
});

test('interpola parámetros en el idioma correcto', () => {
  assert.equal(interpolate('Hola {name}', { name: 'Lur' }), 'Hola Lur');
  assert.equal(t('NOTA DE RESULTADOS: {score}', { score: 7 }, 'es'), 'NOTA DE RESULTADOS: 7');
  assert.equal(t('NOTA DE RESULTADOS: {score}', { score: 7 }, 'en'), 'RESULTS SCORE: 7');
});

test('translatorFor fija el idioma', () => {
  const en = translatorFor('en');
  const es = translatorFor('es-ES');
  assert.equal(en('Guardar'), 'Save');
  assert.equal(es('Guardar'), 'Guardar');
});

test('localeFor y formatPercent usan la convención regional', () => {
  assert.equal(localeFor('en'), 'en-US');
  assert.equal(localeFor('es'), 'es-ES');
  assert.equal(formatPercent(12.5, { lang: 'es', digits: 2 }), '+12,5 %');
  assert.equal(formatPercent(12.5, { lang: 'en', digits: 2 }), '+12.5 %');
});

test('la directiva de idioma inglés exige redacción en inglés', () => {
  const directive = getLanguageDirective('en');
  assert.match(directive, /OUTPUT LANGUAGE \(MANDATORY\): English/);
  assert.match(directive, /LAST 3 MONTHS/);
  assert.match(directive, /Debt balance/);
  const spanish = getLanguageDirective('es');
  assert.match(spanish, /IDIOMA DEL INFORME \(OBLIGATORIO\): español/);
});

test('el diccionario inglés cubre todos los textos fuente extraídos', () => {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  const dictionary = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
  const missing = sources.filter((text) => !dictionary[text]);
  assert.deepEqual(missing, [], `Faltan traducciones: ${missing.slice(0, 10).join(' | ')}`);
});

test('las traducciones conservan los marcadores de interpolación', () => {
  const dictionary = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  const broken = [];
  for (const [source, translation] of Object.entries(dictionary)) {
    const expected = placeholders(source);
    if (!expected.length) continue;
    const got = placeholders(translation);
    if (JSON.stringify(expected) !== JSON.stringify(got)) broken.push(source);
  }
  assert.deepEqual(broken, [], `Traducciones con marcadores alterados: ${broken.slice(0, 5).join(' | ')}`);
});

test('los idiomas soportados y por defecto son los esperados', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ['es', 'en']);
  assert.equal(DEFAULT_LANGUAGE, 'es');
});

test('isSpanishOfficialCountry identifica correctamente países hispanohablantes', () => {
  assert.equal(isSpanishOfficialCountry('ES'), true);
  assert.equal(isSpanishOfficialCountry('MX'), true);
  assert.equal(isSpanishOfficialCountry('AR'), true);
  assert.equal(isSpanishOfficialCountry('CO'), true);
  assert.equal(isSpanishOfficialCountry('US'), false);
  assert.equal(isSpanishOfficialCountry('FR'), false);
  assert.equal(isSpanishOfficialCountry('DE'), false);
  assert.equal(isSpanishOfficialCountry('GB'), false);
  assert.equal(isSpanishOfficialCountry(''), false);
  assert.equal(isSpanishOfficialCountry(null), false);
});

test('isSpanishOfficialTimezone identifica zonas horarias oficiales de países hispanohablantes', () => {
  assert.equal(isSpanishOfficialTimezone('Europe/Madrid'), true);
  assert.equal(isSpanishOfficialTimezone('America/Mexico_City'), true);
  assert.equal(isSpanishOfficialTimezone('America/Buenos_Aires'), true);
  assert.equal(isSpanishOfficialTimezone('America/Bogota'), true);
  assert.equal(isSpanishOfficialTimezone('America/New_York'), false);
  assert.equal(isSpanishOfficialTimezone('Europe/Paris'), false);
  assert.equal(isSpanishOfficialTimezone('Europe/London'), false);
  assert.equal(isSpanishOfficialTimezone(''), false);
  assert.equal(isSpanishOfficialTimezone(null), false);
});

test('detectPriorityLanguage prioriza inglés cuando el país no tiene español como oficial', () => {
  // Ruta explícita /en
  assert.equal(detectPriorityLanguage({ urlPath: '/en' }), 'en');
  assert.equal(detectPriorityLanguage({ urlPath: '/en/empresa/KO' }), 'en');

  // País donde el español NO es oficial -> prioridad inglés
  assert.equal(detectPriorityLanguage({ country: 'US' }), 'en');
  assert.equal(detectPriorityLanguage({ country: 'FR' }), 'en');
  assert.equal(detectPriorityLanguage({ country: 'DE' }), 'en');
  assert.equal(detectPriorityLanguage({ country: 'JP' }), 'en');

  // País donde el español SÍ es oficial -> español
  assert.equal(detectPriorityLanguage({ country: 'ES' }), 'es');
  assert.equal(detectPriorityLanguage({ country: 'MX' }), 'es');
  assert.equal(detectPriorityLanguage({ country: 'CO' }), 'es');

  // Zona horaria fuera del ámbito hispanohablante -> prioridad inglés
  assert.equal(detectPriorityLanguage({ timezone: 'America/New_York' }), 'en');
  assert.equal(detectPriorityLanguage({ timezone: 'Europe/London' }), 'en');

  // Zona horaria hispanohablante -> español
  assert.equal(detectPriorityLanguage({ timezone: 'Europe/Madrid' }), 'es');

  // Accept-Language: usuario con español pero en EE. UU. (es-US) -> inglés (país no hispanohablante)
  assert.equal(detectPriorityLanguage({ acceptLanguage: 'es-US,es;q=0.9,en;q=0.8' }), 'en');

  // Accept-Language: usuario en España (es-ES) -> español
  assert.equal(detectPriorityLanguage({ acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8' }), 'es');

  // Accept-Language: usuario angloparlante (en-US) -> inglés
  assert.equal(detectPriorityLanguage({ acceptLanguage: 'en-US,en;q=0.9' }), 'en');

  // Sin señales -> idioma por defecto (es)
  assert.equal(detectPriorityLanguage({}), 'es');
});

test('translateHtmlToEnglish traduce correctamente la plantilla HTML eliminando textos en español', async () => {
  const { translateHtmlToEnglish, readTemplate } = await import('../../src/services/seo/seoConstants.js');
  
  const sample = `
    <html lang="es">
      <head><title>Cifra</title></head>
      <body>
        <div class="sidebar-footer">
          <span class="report-btn-text">Reportes</span>
          <span class="donations-btn-text">Donaciones</span>
          <span class="donations-btn-badge">Apoyar</span>
          <strong id="account-name">Invitado</strong>
          <small id="account-plan">Beta privada</small>
          <button class="account-action">Entrar</button>
          <div class="sidebar-legal-links">
            <a href="/legal/aviso-legal">Aviso legal</a>
            <a href="/legal/privacidad">Privacidad</a>
            <a href="/legal/cookies">Cookies</a>
            <a href="/legal/terminos">Términos</a>
          </div>
        </div>
      </body>
    </html>
  `;

  const translated = translateHtmlToEnglish(sample);
  assert.ok(translated.includes('<html lang="en">'));
  assert.ok(translated.includes('>Reports<'));
  assert.ok(translated.includes('>Donations<'));
  assert.ok(translated.includes('>Support<'));
  assert.ok(translated.includes('>Guest<'));
  assert.ok(translated.includes('>Private Beta<'));
  assert.ok(translated.includes('>Sign in<'));
  assert.ok(translated.includes('>Legal notice<'));
  assert.ok(translated.includes('>Privacy<'));
  assert.ok(translated.includes('>Cookies<'));
  assert.ok(translated.includes('>Terms<'));
  assert.ok(translated.includes('href="/en/legal/aviso-legal"'));
  assert.ok(!translated.includes('>Reportes<'));
  assert.ok(!translated.includes('>Donaciones<'));
  assert.ok(!translated.includes('>Apoyar<'));
  assert.ok(!translated.includes('>Invitado<'));

  // Verificar que readTemplate('index.html', 'en') devuelve HTML traducido
  const enTemplate = readTemplate('index.html', 'en');
  assert.ok(enTemplate.includes('>Reports<'));
  assert.ok(enTemplate.includes('>Donations<'));
  assert.ok(!enTemplate.includes('>Reportes<'));
  assert.ok(!enTemplate.includes('>Donaciones<'));
});

test('las claves añadidas cubren modales de alertas, contadores y dividendos', () => {
  assert.equal(t('Buscar Acción / Empresa', null, 'en'), 'Search Stock / Company');
  assert.equal(t('Condición', null, 'en'), 'Condition');
  assert.equal(t('Precio objetivo ($)', null, 'en'), 'Target price ($)');
  assert.equal(t('≥ Igual o superior a ($)', null, 'en'), '≥ Greater than or equal to ($)');
  assert.equal(t('≤ Igual o inferior a ($)', null, 'en'), '≤ Less than or equal to ($)');
  assert.equal(t('Acción seleccionada:', null, 'en'), 'Selected stock:');
  assert.equal(t('Precio actual:', null, 'en'), 'Current price:');
  assert.equal(t('Consultando…', null, 'en'), 'Querying…');
  assert.equal(t('⇩ Exportar CSV', null, 'en'), '⇩ Export CSV');
  assert.equal(t('1 acción', null, 'en'), '1 stock');
  assert.equal(t('{n} acción', { n: 1 }, 'en'), '1 stock');
  assert.equal(t('{n} acciones', { n: 5 }, 'en'), '5 stocks');
  assert.equal(
    t('Distribución de tus dividendos de los últimos 12 meses (TTM).', null, 'en'),
    'Your dividend distribution of the last 12 months (TTM).'
  );
  assert.equal(
    t('Has recibido dividendos brutos de {0} en los últimos 12 meses, distribuidos en {1} pagos y {2} fechas de pago.', {
      0: '2.45 €',
      1: 4,
      2: 3,
    }, 'en'),
    'You have received gross dividends of 2.45 € in the last 12 months, distributed across 4 payments and 3 payment dates.'
  );
});

test('el nombre de la marca Cifra nunca se traduce', () => {
  assert.equal(t('Cifra', null, 'en'), 'Cifra');
  assert.equal(t('CIFRA', null, 'en'), 'CIFRA');
  assert.equal(t('cifra', null, 'en'), 'cifra');
  assert.equal(t('Calificación Cifra', null, 'en'), 'Cifra Rating');
  assert.equal(t('Apoyar a Cifra', null, 'en'), 'Support Cifra');
  assert.equal(t('Cuenta de resultados | Cifra', null, 'en'), 'Income Statement | Cifra');
});

test('todas las claves t() de src y la interfaz tienen traducción en en.json', () => {
  const dictionary = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
  const excluded = new Set([
    'i18n.js', 'analystSystemPrompt.js', 'analystAnnualSystemPrompt.js',
    'analystExtractionPrompt.js', 'analystExtractionSchema.js', 'analystAnnualSchema.js',
    'languageDirective.js', 'debtMaturityPrompt.js', 'debtRefinancingPrompt.js', 'translationPrompt.js',
  ]);
  const patterns = [
    /\bt\(\s*'((?:[^'\\]|\\.)*)'/g,
    /\btr\(\s*'((?:[^'\\]|\\.)*)'/g,
    /\bt\(\s*"((?:[^"\\]|\\.)*)"/g,
    /\btr\(\s*"((?:[^"\\]|\\.)*)"/g,
    /\bt\(\s*`([^`]*)`/g,
    /\btr\(\s*`([^`]*)`/g,
  ];
  const missing = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js') || excluded.has(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const regex of patterns) {
        let match;
        while ((match = regex.exec(text)) !== null) {
          const key = match[1].replace(/\\'/g, "'").replace(/\\n/g, '\n');
          if (key.includes('${') || dictionary[key] != null) continue;
          missing.push(`${entry.name}: ${key}`);
        }
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'public/js'));
  assert.deepEqual(missing, [], `Claves t()/tr() sin traducción en en.json:\n${missing.join('\n')}`);
});
