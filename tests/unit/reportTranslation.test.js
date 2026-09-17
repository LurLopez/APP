import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertNumbersToLanguage,
  convertNumbersAligned,
  canonicalNumberToken,
  numbersPreserved,
} from '../../src/services/translation/reportNumbers.js';
import { resolveLocalLabel, resolveLocalScenario } from '../../src/services/translation/reportLabels.js';
import {
  collectTranslatableTexts,
  applyTranslations,
  applyLocalLabels,
  pathKey,
} from '../../src/services/translation/reportTextFields.js';
import { translateReport } from '../../src/services/translation/reportTranslator.service.js';

function quarterlyReport() {
  return {
    company: 'The Kraft Heinz Company',
    ticker: 'KHC',
    formType: '10-Q',
    language: 'es',
    periodTitle: '2025 Q2 resultados — KHC',
    reportingPeriod: '2025-06-28',
    isAnnual: false,
    horizons: [
      {
        label: 'ÚLTIMOS 3 MESES',
        sales: {
          rows: [
            { name: 'Ventas', normal: '6352M', adjusted: '6352M', prevNormal: '6476M', prevAdjusted: '6476M', pctNormal: '-1,91 %', pctAdjusted: '-1,91 %' },
            { name: 'Beneficio Operativo', normal: '-7974M', adjusted: '1415M', prevNormal: '522M', prevAdjusted: '1376M', pctNormal: '-1627,59 %', pctAdjusted: '+2,83 %', isAdjusted: true, adjustedNote: '*1' },
          ],
          notes: ['*1: Se excluyen 9266M de deterioros no monetarios y 123M de amortización de intangibles.'],
          shares: '1184M',
          eps: '0,79 $',
        },
        cashFlow: {
          scenarios: ['Normal (WC=-117)', 'Ajustado*1 (WC=-23)'],
          rows: [
            { name: 'Cash Flow', values: ['1929', '1997,7'] },
            { name: 'FCF/Acción', values: ['1,27 $', '1,33 $'] },
          ],
          notes: ['*1: WK = (4340 - 3567 - 2344) × (3 % + 0 %) = -47,1M en todo el año -> en 3 meses = -11,8M.'],
        },
        capital: {
          rows: [
            { name: 'Libre', value: '553' },
            { name: 'Caja*1', value: '-233' },
            { name: 'En total', value: '1662' },
          ],
          notes: ['*1: Caja balance: 1334M (2024) -> 1567M (2025) (+233M); fila Caja = -233M.'],
          verification: 'No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados.',
        },
      },
    ],
  };
}

function annualReport() {
  return {
    company: 'PepsiCo, Inc.',
    ticker: 'PEP',
    formType: '10-K',
    language: 'es',
    isAnnual: true,
    periodTitle: '2018 ANNUAL results — PEP',
    reportingPeriod: '2018-12-29',
    horizons: [
      {
        label: 'EN TODO EL AÑO (12 MESES)',
        sales: {
          rows: [{ name: 'Ventas', normal: '64661M', adjusted: '64661M', prevNormal: '63525M', prevAdjusted: '63525M', pctNormal: '+1,79 %', pctAdjusted: '+1,79 %' }],
          notes: ['*1: En 2018 se registraron deterioros por 308M (frente a 295M en 2017).'],
          shares: '1409M (al final del 2018, no el promedio) -> %0,77 menos (1420M)',
          eps: '5,19 $ -> %3,35 menos (5,37 $)',
        },
        cashFlow: {
          scenarios: ['Normal (WC=882)', 'Ajustado (WC=235)'],
          rows: [{ name: 'Libre', values: ['1203', '1211'] }],
          notes: ['*2: La empresa debería haber pagado 2.184,3M en impuestos.'],
        },
        capital: {
          rows: [{ name: 'Libre', value: '1203' }, { name: 'Efectivo restringido*2', value: '-1997' }],
          notes: ['*1: Deuda balance: 39281M -> 32321M (-6960M).'],
          verification: 'Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.',
        },
      },
    ],
    conclusion: {
      repurchases: {
        title: '1: Recompras',
        text: 'Durante 2018 la compañía destinó 2000M a la recompra de acciones.',
        authorizationRemaining: 'Unos 14084M de $ pendientes de ejecución',
        secSnippet: {
          title: 'Share Repurchase Program (Form 10-K)',
          summary: 'Tabla oficial de recompras anuales del Form 10-K',
          headers: ['', 'December 29, 2018', 'December 30, 2017'],
          rows: [
            ['Shares repurchased', '18,000,000', '18,000,000'],
            ['Aggregate cost (in millions)', '$2,000', '$2,000'],
          ],
        },
        sharesHistory: [{ year: 2017, shares: 1420 }],
      },
      executiveChanges: {
        title: '2: Cambios en la dirección',
        disclaimer: 'La trayectoria de los directivos combina los hechos del informe con contexto público general.',
        changes: [
          {
            role: 'CEO',
            text: 'El 1 de octubre de 2018 se produjo una sucesión planificada.',
            reason: 'Sucesión planificada',
            source: '10-K, 8-K/presentación complementaria',
            oldExecutive: { name: 'Indra K. Nooyi', role: 'Chief Executive Officer y Presidenta del Consejo (2006-2018)', whereTheyGo: 'Presidencia del Consejo hasta febrero de 2019' },
            newExecutive: { name: 'Ramon Laguarta', origin: 'PepsiCo; Presidente de PepsiCo (2017-2018)', commitments: 'Capitalizar el impulso del negocio.' },
          },
        ],
      },
      outlook: {
        title: '3: Outlook',
        text: 'La dirección proyecta para 2019 un crecimiento orgánico de ingresos del 4 %.',
        fcfAnalysis: 'El guidance de Free Cash Flow es de aproximadamente 5.000M$.',
        secSnippet: {
          title: '2019 Guidance / Full Year Outlook',
          summary: 'Metas cuantitativas oficiales para el próximo ejercicio',
          headers: ['Métrica', '2018 (Año anterior)', 'Guidance 2019E*'],
          rows: [
            ['Crecimiento orgánico de ingresos', '$64.661M', '4%'],
            ['Free Cash Flow', '—', '~$5.000M'],
          ],
        },
      },
      debt: {
        title: '4: Deuda',
        text: 'La deuda neta se sitúa en 23.328M$ (+3.557M$ vs ejercicio anterior).',
        secTable: {
          headers: ['Obligación', 'Vencimiento', 'December 29, 2018'],
          rows: [
            ['Short-term debt obligations', 'Corriente', '$4,026'],
            ['Long-Term Debt Obligations', 'Largo plazo', '$28,295'],
          ],
        },
      },
      acquisitions: { title: '5: Adquisiciones', text: 'En 2018 la compañía completó la adquisición de SodaStream International Ltd.' },
      dividends: { title: '6: Dividendos', text: 'El dividendo por acción aumentó un 13,3 % en 2018.' },
      watchlist: {
        title: 'Cosas a tener en cuenta en 2019',
        items: ['1: Evolución del crecimiento orgánico de ingresos y del EPS core frente al guidance del 4 %.'],
      },
    },
    rating: {
      score: 6,
      label: 'NOTA DE RESULTADOS: 6',
      rationale: 'Calificación puramente financiera basada exclusivamente en la realidad de las cuentas del año.',
    },
  };
}

test('convierte el formato numérico español ↔ inglés sin tocar los valores', () => {
  assert.equal(convertNumbersToLanguage('5,19 $', 'es', 'en'), '5.19 $');
  assert.equal(convertNumbersToLanguage('23.328M$', 'es', 'en'), '23,328M$');
  assert.equal(convertNumbersToLanguage('1.197M', 'es', 'en'), '1,197M');
  assert.equal(convertNumbersToLanguage('+157,67 %', 'es', 'en'), '+157.67 %');
  assert.equal(convertNumbersToLanguage('$4,026', 'en', 'es'), '$4.026');
  assert.equal(convertNumbersToLanguage('1.79 %', 'en', 'es'), '1,79 %');
  assert.equal(convertNumbersToLanguage('3.5875', 'en', 'es'), '3,5875');
  assert.equal(convertNumbersToLanguage('18,000,000', 'es', 'en'), '18,000,000');
  assert.equal(convertNumbersToLanguage('sin cifras', 'es', 'en'), 'sin cifras');
});

test('canonicaliza números con cualquier separador', () => {
  assert.equal(canonicalNumberToken('1.197'), canonicalNumberToken('1,197'));
  assert.equal(canonicalNumberToken('1.197'), canonicalNumberToken('1197'));
  assert.equal(canonicalNumberToken('5,19'), canonicalNumberToken('5.19'));
});

test('respeta los números que la IA ya reformateó y convierte los que dejó igual', () => {
  assert.equal(convertNumbersAligned('23.328M$', '23,328M$', 'es', 'en'), '23,328M$');
  assert.equal(convertNumbersAligned('23.328M$', '23.328M$', 'es', 'en'), '23,328M$');
  assert.equal(convertNumbersAligned('5,19 %', '5.19 %', 'es', 'en'), '5.19 %');
  assert.equal(convertNumbersAligned('5,19 %', '5,19 %', 'es', 'en'), '5.19 %');
  assert.equal(
    convertNumbersAligned('23.328M$ (+5,4 %)', '23,328M$ (+5,4 %)', 'es', 'en'),
    '23,328M$ (+5.4 %)',
  );
  assert.equal(convertNumbersAligned('1.197M', '1197M', 'es', 'en'), '1197M');
});

test('detecta cambios de cifras entre el original y la traducción', () => {
  assert.equal(numbersPreserved(
    'El FCF fue 1.197M (+5,4 %) y el BPA 5,19 $.',
    'FCF was 1,197M (+5.4%) and EPS 5.19$.',
  ), true);
  assert.equal(numbersPreserved('El FCF fue 1.197M.', 'FCF was 1,198M.'), false);
  assert.equal(numbersPreserved('El BPA fue 5,19 $.', 'EPS was 5.19 $.'), true);
  assert.equal(numbersPreserved('Sin números.', 'No numbers.'), true);
});

test('traduce etiquetas estructurales por diccionario y respeta las desconocidas', () => {
  assert.equal(resolveLocalLabel('Ventas', 'es', 'en'), 'Sales');
  assert.equal(resolveLocalLabel('Beneficio Operativo', 'es', 'en'), 'Operating Income');
  assert.equal(resolveLocalLabel('En total', 'es', 'en'), 'Total');
  assert.equal(resolveLocalLabel('Caja*1', 'es', 'en'), 'Cash*1');
  assert.equal(resolveLocalLabel('Efectivo restringido*2', 'es', 'en'), 'Restricted cash*2');
  assert.equal(resolveLocalLabel('ÚLTIMOS 3 MESES', 'es', 'en'), 'LAST 3 MONTHS');
  assert.equal(resolveLocalLabel('EN TODO EL AÑO (6 MESES)', 'es', 'en'), 'FULL YEAR TO DATE (6 MONTHS)');
  assert.equal(resolveLocalLabel('NOTA DE RESULTADOS: 6', 'es', 'en'), 'RESULTS SCORE: 6');
  assert.equal(resolveLocalLabel('1: Recompras', 'es', 'en'), '1: Buybacks');
  assert.equal(resolveLocalLabel('Sales', 'en', 'es'), 'Ventas');
  assert.equal(resolveLocalLabel('Gross Profit', 'en', 'es'), 'Beneficio bruto');
  assert.equal(resolveLocalLabel('Net Income', 'en', 'es'), 'Beneficio neto');
  assert.equal(resolveLocalLabel('Free', 'en', 'es'), 'Libre');
  assert.equal(resolveLocalLabel('Free*1', 'en', 'es'), 'Libre*1');
  assert.equal(resolveLocalLabel('Total', 'en', 'es'), 'En total');
  assert.equal(resolveLocalLabel('Buybacks', 'en', 'es'), 'Recompras');
  assert.equal(resolveLocalLabel('Cash*1', 'en', 'es'), 'Caja*1');
  assert.equal(resolveLocalLabel('Etiqueta inventada', 'es', 'en'), null);
  assert.equal(resolveLocalScenario('Ajustado*1 (WC=-23)', 'es', 'en'), 'Adjusted*1 (WC=-23)');
  assert.equal(resolveLocalScenario('Normal (WC=882)', 'es', 'en'), 'Normal (WC=882)');
  assert.equal(resolveLocalScenario('Adjusted (WC=235)', 'en', 'es'), 'Ajustado (WC=235)');
});

function canResolveLocally(text, key) {
  return Boolean(key && key.endsWith('scenarios.*')
    ? resolveLocalScenario(text, 'es', 'en')
    : resolveLocalLabel(text, 'es', 'en'));
}

test('extrae textos libres del 10-Q y no las celdas numéricas', () => {
  const entries = collectTranslatableTexts(quarterlyReport(), canResolveLocally);
  const keys = entries.map((entry) => pathKey(entry.path));
  assert.ok(keys.includes('horizons.*.sales.notes.*'));
  assert.ok(keys.includes('horizons.*.capital.verification'));
  assert.ok(keys.includes('horizons.*.sales.eps'));
  assert.ok(keys.includes('horizons.*.sales.shares'));
  assert.ok(!keys.includes('horizons.*.sales.rows.*.name'));
  assert.ok(!keys.includes('horizons.*.sales.rows.*.normal'));
  assert.ok(!keys.includes('horizons.*.cashFlow.rows.*.values.*'));
});

test('extrae textos libres del 10-K y los extractos SEC solo con letras', () => {
  const entries = collectTranslatableTexts(annualReport(), canResolveLocally);
  const keys = entries.map((entry) => pathKey(entry.path));
  assert.ok(keys.includes('conclusion.repurchases.text'));
  assert.ok(keys.includes('conclusion.executiveChanges.changes.*.oldExecutive.role'));
  assert.ok(keys.includes('conclusion.watchlist.items.*'));
  assert.ok(keys.includes('rating.rationale'));
  assert.ok(keys.includes('conclusion.repurchases.secSnippet.title'));
  assert.ok(keys.includes('conclusion.repurchases.secSnippet.summary'));
  assert.ok(keys.includes('conclusion.repurchases.secSnippet.headers.*'));
  assert.ok(keys.includes('conclusion.repurchases.secSnippet.rows.*.*'));
  assert.ok(keys.includes('conclusion.outlook.secSnippet.rows.*.*'));
  assert.ok(!keys.includes('conclusion.repurchases.sharesHistory.*.year'));
  assert.ok(!keys.includes('conclusion.repurchases.secSnippet.rows.*.1'));
  assert.ok(!keys.includes('conclusion.executiveChanges.changes.*.oldExecutive.name'));
});

test('aplica traducciones y etiquetas locales sin mutar el informe original', () => {
  const report = annualReport();
  const snapshot = structuredClone(report);
  const entries = collectTranslatableTexts(report, canResolveLocally);
  const translations = entries.map((entry) => (entry.text.startsWith('*') ? entry.text.replace('deterioros', 'impairments') : `EN:${entry.text}`));

  applyTranslations(report, entries, translations);
  applyLocalLabels(report, 'es', 'en', (text, key) => (
    key.endsWith('scenarios.*') ? resolveLocalScenario(text, 'es', 'en') : resolveLocalLabel(text, 'es', 'en')
  ));

  assert.equal(report.horizons[0].sales.rows[0].name, 'Sales');
  assert.equal(report.conclusion.repurchases.title, '1: Buybacks');
  assert.equal(report.conclusion.watchlist.title, 'EN:Cosas a tener en cuenta en 2019');
  assert.equal(report.horizons[0].cashFlow.scenarios[1], 'Adjusted (WC=235)');
  assert.equal(report.rating.label, 'RESULTS SCORE: 6');
  assert.deepEqual(snapshot, annualReport());
});

test('translateReport traduce el informe completo con el traductor inyectado', async () => {
  const report = annualReport();
  const translated = await translateReport(report, 'en', {
    sourceLanguage: 'es',
    translator: async (entries) => entries.map((entry) => `EN:${entry.text}`),
  });

  assert.equal(translated.language, 'en');
  assert.equal(translated.horizons[0].label, 'FOR THE FULL YEAR (12 MONTHS)');
  assert.equal(translated.horizons[0].sales.rows[0].name, 'Sales');
  assert.equal(translated.horizons[0].sales.eps, 'EN:5.19 $ -> %3.35 menos (5.37 $)');
  assert.equal(translated.conclusion.repurchases.title, '1: Buybacks');
  assert.equal(translated.rating.label, 'RESULTS SCORE: 6');
  assert.equal(translated.conclusion.repurchases.secSnippet.rows[0][1], '18,000,000');
  assert.equal(translated.conclusion.debt.secTable.rows[0][2], '$4,026');
  assert.equal(report.language, 'es');
  assert.equal(report.horizons[0].label, 'EN TODO EL AÑO (12 MESES)');
});

test('translateReport valida que la IA no altere ninguna cifra', async () => {
  const report = quarterlyReport();
  await assert.rejects(
    () => translateReport(report, 'en', {
      sourceLanguage: 'es',
      translator: async (entries) => entries.map((entry) => entry.text.replace('9266M', '9300M')),
    }),
    (error) => error.code === 'TRANSLATION_NUMBER_MISMATCH',
  );
});

test('translateReport devuelve una copia intacta si el idioma ya es el destino', async () => {
  const report = quarterlyReport();
  const translated = await translateReport(report, 'es', { sourceLanguage: 'es' });
  assert.equal(translated.language, 'es');
  assert.deepEqual(translated, report);
  assert.notEqual(translated, report);
});
