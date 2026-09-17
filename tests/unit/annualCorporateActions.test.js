import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAcquisitionsDividendsAndWatchlist } from '../../src/agents/analyst/annualConclusionSections.js';
import { buildAcquisitionsModel } from '../../src/services/reportExport/dividendsAndAcquisitionsModel.js';

function processSection(rawAnn, extracted = {}) {
  const conclusion = {};
  processAcquisitionsDividendsAndWatchlist(conclusion, rawAnn, extracted, {}, 2025, 'es');
  return conclusion.acquisitions;
}

test('sin adquisiciones pero con desinversión, spin-off y reestructuración se explican en Operaciones corporativas', () => {
  const section = processSection({
    divestitures: {
      items: [{
        name: 'Marca X',
        description: 'negocio de salsas en EE. UU.',
        stakePct: 20,
        revenuePct: 6.5,
        proceeds: 649,
        rationale: 'concentrar recursos en las marcas principales',
        expectedImpact: 'entrada de caja de 649M y reclasificación a resultados discontinuados',
      }],
    },
    spinOffs: {
      items: [{
        name: 'División Y',
        description: 'negocio de snacks internacionales',
        status: 'announced',
        announcementDate: '2026-01-15',
        expectedDate: '2026-12-31',
        structure: 'distribución a accionistas libre de impuestos',
        revenuePct: 25,
        rationale: 'permitir a cada negocio centrarse en su estrategia',
      }],
    },
    restructurings: {
      items: [{
        name: 'Plan 2025',
        description: 'cierre de dos plantas y reducción de plantilla',
        totalCost: 250,
        chargesRecognized: 180,
        annualSavings: 450,
        savingsTimeline: '3 años (2026-2028)',
        jobsAffected: 1200,
        rationale: 'mejorar la eficiencia industrial',
      }],
    },
  }, { facts: { acquisitionsYtd: 0 } });

  assert.equal(section.title, 'Operaciones corporativas');
  assert.ok(section.text.startsWith('No se realizaron adquisiciones materiales durante el ejercicio.'));
  assert.ok(section.text.includes('**Desinversiones y ventas de participaciones:**'));
  assert.ok(section.text.includes('Se vendió **Marca X**'));
  assert.ok(section.text.includes('**Spin-offs:**'));
  assert.ok(section.text.includes('Se trata de la separación (spin-off) de **División Y**'));
  assert.ok(section.text.includes('**Reestructuraciones:**'));
  assert.ok(section.text.includes('Ahorro anual esperado: **450M$**'));
  assert.equal(section.hasDivestitures, true);
  assert.equal(section.hasSpinOffs, true);
  assert.equal(section.hasRestructurings, true);

  assert.equal(buildAcquisitionsModel({ conclusion: { acquisitions: section }, horizons: [] }).material, true);
});

test('el texto de la IA se conserva y se completan los bloques que faltan', () => {
  const conclusion = { acquisitions: { text: 'En 2025 se adquirió **Negocio A** por **500M$**.' } };
  processAcquisitionsDividendsAndWatchlist(conclusion, {
    divestitures: { items: [{ name: 'Marca Z', proceeds: 300, rationale: 'simplificar el portfolio' }] },
  }, { facts: { acquisitionsYtd: 500 } }, {}, 2025, 'es');
  assert.ok(conclusion.acquisitions.text.startsWith('En 2025 se adquirió **Negocio A** por **500M$**.'));
  assert.ok(conclusion.acquisitions.text.includes('**Desinversiones y ventas de participaciones:**'));
  assert.equal(conclusion.acquisitions.hasDivestitures, true);
});

test('sin operaciones corporativas el texto lo confirma y no se marca material', () => {
  const section = processSection({}, { facts: { acquisitionsYtd: 0 } });
  assert.equal(section.text, 'No se realizaron adquisiciones materiales durante el ejercicio.');
  assert.equal(section.hasDivestitures, false);
  assert.equal(section.hasSpinOffs, false);
  assert.equal(section.hasRestructurings, false);
  assert.equal(buildAcquisitionsModel({ conclusion: { acquisitions: section }, horizons: [] }).material, false);
});

test('una desinversión detectada solo por cifras oficiales se resume en una frase', () => {
  const section = processSection({}, {
    facts: {
      acquisitionsYtd: 0,
      brandDivestitures: 649,
      divestitureDescription: 'la marca de quesos envasados',
    },
  });
  assert.equal(section.text, 'No se realizaron adquisiciones materiales durante el ejercicio. Se completó la desinversión de la marca de quesos envasados por 649M.');
  assert.equal(section.hasDivestitures, true);
  assert.equal(buildAcquisitionsModel({ conclusion: { acquisitions: section }, horizons: [] }).material, true);
});

test('una reestructuración sin adquisiciones genera su bloque con la cifra de ahorro', () => {
  const section = processSection({
    restructurings: {
      items: [{ name: 'Plan de eficiencia', description: 'optimización de la red logística', annualSavings: 120 }],
    },
  }, { facts: { acquisitionsYtd: 0 } });
  assert.ok(section.text.includes('**Reestructuraciones:**'));
  assert.ok(section.text.includes('Ahorro anual esperado: **120M$**'));
  assert.equal(section.hasRestructurings, true);
});
