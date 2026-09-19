import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  missingLanguagesFor,
  translationKey,
  ensureLanguageVariants,
  joinAutoTranslation,
  waitForAutoTranslations,
} from '../../src/services/translation/autoTranslate.service.js';

function makeAnalysis(overrides = {}) {
  return {
    id: 1,
    ticker: 'KHC',
    accession: '0001234567-25-000001',
    filename: 'KHC-0001234567-25-000001.pdf',
    language: 'es',
    is_public: true,
    report: { ticker: 'KHC', formType: '10-Q', language: 'es' },
    ...overrides,
  };
}

test('missingLanguagesFor devuelve los idiomas soportados distintos del origen', () => {
  assert.deepEqual(missingLanguagesFor('es'), ['en']);
  assert.deepEqual(missingLanguagesFor('en'), ['es']);
  assert.deepEqual(missingLanguagesFor(null), ['en']);
  assert.deepEqual(missingLanguagesFor('fr'), ['en']);
});

test('translationKey es estable por filing y idioma destino', () => {
  assert.equal(
    translationKey({ ticker: 'KHC', accession: '0001', targetLanguage: 'en' }),
    translationKey({ ticker: 'KHC', accession: '0001', targetLanguage: 'en' }),
  );
  assert.notEqual(
    translationKey({ ticker: 'KHC', accession: '0001', targetLanguage: 'en' }),
    translationKey({ ticker: 'KHC', accession: '0001', targetLanguage: 'es' }),
  );
});

test('ensureLanguageVariants traduce la variante que falta y no repite las existentes', async () => {
  const source = makeAnalysis();
  const translatedCalls = [];
  const saved = {};

  const results = await ensureLanguageVariants(
    { ticker: 'KHC', accession: source.accession, language: 'es', userId: 7 },
    {
      findDoneAnalysisByFilename: async ({ language }) => {
        if (language === 'es') return source;
        return saved[language] ?? null;
      },
      translateAnalysisVariant: async ({ targetLanguage }) => {
        translatedCalls.push(targetLanguage);
        saved[targetLanguage] = makeAnalysis({ id: 2, language: targetLanguage });
        return { analysisId: 2, language: targetLanguage, report: saved[targetLanguage].report };
      },
    },
  );

  assert.deepEqual(translatedCalls, ['en']);
  assert.equal(results.length, 1);
  assert.equal(results[0].language, 'en');
});

test('ensureLanguageVariants no traduce si la variante ya existe', async () => {
  let translated = 0;
  const results = await ensureLanguageVariants(
    { ticker: 'KHC', accession: '0001', language: 'es' },
    {
      findDoneAnalysisByFilename: async ({ language }) => makeAnalysis({ language }),
      translateAnalysisVariant: async () => { translated += 1; return null; },
    },
  );

  assert.equal(translated, 0);
  assert.deepEqual(results, []);
});

test('ensureLanguageVariants no hace nada sin análisis origen ni identificadores', async () => {
  const deps = {
    findDoneAnalysisByFilename: async () => null,
    translateAnalysisVariant: async () => { throw new Error('no debería traducir'); },
  };
  assert.deepEqual(await ensureLanguageVariants({ ticker: 'KHC', accession: '0001', language: 'es' }, deps), []);
  assert.deepEqual(await ensureLanguageVariants({ language: 'es' }, deps), []);
});

test('ensureLanguageVariants propaga isPublic y userId a la traducción', async () => {
  const calls = [];
  await ensureLanguageVariants(
    { ticker: 'KHC', accession: '0001', language: 'es', isPublic: false, userId: 42 },
    {
      findDoneAnalysisByFilename: async ({ language }) => (language === 'es' ? makeAnalysis({ is_public: false }) : null),
      translateAnalysisVariant: async (params) => { calls.push(params); return null; },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 42);
  assert.equal(calls[0].isPublic, false);
  assert.equal(calls[0].actor, 'auto');
});

test('joinAutoTranslation espera la traducción en curso y devuelve la variante guardada', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const stored = {};

  const scheduled = ensureLanguageVariants(
    { ticker: 'PEP', accession: '0009', language: 'es' },
    {
      findDoneAnalysisByFilename: async ({ language }) => {
        if (language === 'es') return makeAnalysis({ ticker: 'PEP', accession: '0009' });
        return stored[language] ?? null;
      },
      translateAnalysisVariant: async ({ targetLanguage }) => {
        await gate;
        stored[targetLanguage] = makeAnalysis({ ticker: 'PEP', accession: '0009', language: targetLanguage });
        return { language: targetLanguage };
      },
    },
  );

  await new Promise((resolve) => setImmediate(resolve));
  const joinPromise = joinAutoTranslation(
    { ticker: 'PEP', accession: '0009', targetLanguage: 'en' },
    { findDoneAnalysisByFilename: async ({ language }) => stored[language] ?? null },
  );

  release();
  await scheduled;
  const joined = await joinPromise;

  assert.equal(joined?.language, 'en');
  await waitForAutoTranslations();
});
