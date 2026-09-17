import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadValueChart() {
  const code = readFileSync(new URL('../../public/js/portfolio/portfolioValueChart.js', import.meta.url), 'utf8');
  const context = { window: { PortfolioState: {}, computeNiceStep: (value) => value } };
  vm.runInNewContext(code, context);
  return context.window.PortfolioValueChart;
}

test('el módulo registra la API de gráfico de valor de cartera en window', () => {
  const mod = loadValueChart();
  assert.equal(typeof mod.valueChartPanelHtml, 'function');
  assert.equal(typeof mod.wireValueChart, 'function');
  assert.equal(typeof mod.pointsForRange, 'function');
  assert.equal(typeof mod.computeValueScale, 'function');
  assert.equal(typeof mod.formatCompactMoney, 'function');
  assert.equal(typeof mod.plusvaliaForPoint, 'function');
});

test('pointsForRange filtra por el rango solicitado y conserva todo con "all"', () => {
  const mod = loadValueChart();
  const now = new Date('2026-09-17T00:00:00Z');
  const points = [
    { date: '2023-01-10', series: [100, 90] },
    { date: '2026-01-15', series: [200, 150] },
    { date: '2026-09-17', series: [300, 200] },
  ];

  assert.equal(JSON.stringify(mod.pointsForRange(points, 'all', now)), JSON.stringify(points));
  const oneYear = mod.pointsForRange(points, '1y', now);
  assert.equal(JSON.stringify(oneYear.map((point) => point.date)), JSON.stringify(['2026-01-15', '2026-09-17']));
});

test('pointsForRange devuelve la serie completa si el rango deja menos de dos puntos', () => {
  const mod = loadValueChart();
  const now = new Date('2026-09-17T00:00:00Z');
  const points = [
    { date: '2023-08-01', series: [100, 90] },
    { date: '2026-09-17', series: [300, 200] },
  ];
  assert.equal(JSON.stringify(mod.pointsForRange(points, '1y', now)), JSON.stringify(points));
});

test('computeValueScale arranca en cero y cubre el máximo con ticks limpios', () => {
  const mod = loadValueChart();
  const scale = mod.computeValueScale([0, 1234, 45678, 288874.69]);
  assert.equal(scale.min, 0);
  assert.ok(scale.max >= 288874.69);
  assert.equal(scale.ticks[0], 0);
  assert.ok(scale.ticks[scale.ticks.length - 1] >= 288874.69);
  assert.equal(scale.ticks.length, Math.round(scale.max / scale.step) + 1);
});

test('computeValueScale usa un rango por defecto sin datos válidos', () => {
  const mod = loadValueChart();
  const scale = mod.computeValueScale([]);
  assert.equal(scale.min, 0);
  assert.equal(scale.max, 100);
  assert.equal(JSON.stringify(scale.ticks), JSON.stringify([0, 25, 50, 75, 100]));
});

test('formatCompactMoney abrevia miles y millones para el eje Y', () => {
  const mod = loadValueChart();
  assert.equal(mod.formatCompactMoney(0), '$0');
  assert.equal(mod.formatCompactMoney(850), '$850');
  assert.equal(mod.formatCompactMoney(1500), '$1.5k');
  assert.equal(mod.formatCompactMoney(45200), '$45.2k');
  assert.equal(mod.formatCompactMoney(50000), '$50k');
  assert.equal(mod.formatCompactMoney(288874.69), '$289k');
  assert.equal(mod.formatCompactMoney(2500000), '$2.5M');
  assert.equal(mod.formatCompactMoney(-1500), '−$1.5k');
});

test('plusvaliaForPoint calcula la diferencia entre valor y aportaciones', () => {
  const mod = loadValueChart();
  const result = mod.plusvaliaForPoint({ date: '2026-09-17', series: [288874.69, 232844.78] });
  assert.ok(result);
  assert.equal(Math.round(result.diff), 56030);
  assert.ok(Math.abs(result.pct - 24.06) < 0.05);
  assert.equal(result.diff > 0, true);
});

test('plusvaliaForPoint devuelve null si faltan series', () => {
  const mod = loadValueChart();
  assert.equal(mod.plusvaliaForPoint(null), null);
  assert.equal(mod.plusvaliaForPoint({ series: [100] }), null);
  assert.equal(mod.plusvaliaForPoint({ series: [100, null] }), null);
});

test('plusvaliaForPoint no divide por cero cuando no hay aportaciones', () => {
  const mod = loadValueChart();
  const result = mod.plusvaliaForPoint({ series: [120, 0] });
  assert.ok(result);
  assert.equal(result.diff, 120);
  assert.equal(result.pct, 0);
});
