import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGuidesSeoContent, getGuidesSeoMeta } from '../../src/services/seo/guidesSeo.service.js';
import { serveHtml } from '../../src/services/seo/pageRenderer.service.js';
import { APARTADOS_VISIBLES } from '../../public/js/guias/guiasContent.js';

test('el contenido SSR de /guias incluye los tres apartados de la pestaña', () => {
  const html = getGuidesSeoContent('es');
  assert.match(html, /<h1>Guías<\/h1>/);
  for (const apartado of APARTADOS_VISIBLES) {
    assert.ok(html.includes(apartado.nombre), `Falta el apartado ${apartado.nombre}`);
    assert.ok(html.includes(apartado.descripcion), `Falta la descripción de ${apartado.nombre}`);
  }
});

test('el contenido SSR reutiliza el texto íntegro de los paneles de la interfaz', () => {
  const html = getGuidesSeoContent('es');
  const phrases = [
    'Aviso de Inversor Particular y Exención de Responsabilidad',
    'sintetiza la actividad económica y comercial de la empresa durante un período determinado',
    'Ejemplo real — Cash Flow (Molson Coors, 10-K 2025)',
  ];
  for (const phrase of phrases) assert.ok(html.includes(phrase), `Falta: ${phrase}`);
  assert.ok(html.includes('Balance de situación'));
  assert.ok(html.includes('Informe Anual (10-K)'));
});

test('el contenido SSR elimina ids y estados ocultos para no duplicar la SPA', () => {
  const html = getGuidesSeoContent('es');
  const body = html.slice(html.indexOf('seo-content-body'));
  assert.equal((body.match(/\sid="/g) || []).length, 0);
  assert.equal((body.match(/\shidden(?=[\s>])/g) || []).length, 0);
  assert.equal((body.match(/\saria-[a-z-]+="/g) || []).length, 0);
  assert.equal((body.match(/\sdata-[a-z-]+="/g) || []).length, 0);
});

test('las imágenes del contenido se cargan en diferido', () => {
  const html = getGuidesSeoContent('es');
  const images = html.match(/<img\b[^>]*>/g) || [];
  assert.ok(images.length > 0);
  for (const image of images) assert.match(image, /\bloading="lazy"/);
});

test('la versión inglesa traduce el contenido y el resumen', () => {
  const html = getGuidesSeoContent('en');
  assert.ok(html.includes('Notice and Project'));
  assert.ok(html.includes('Financial Data'));
  assert.ok(html.includes('AI analysis'));
  assert.ok(!html.includes('Aviso y Proyecto'));
  assert.ok(!html.includes('Datos Financieros'));
});

test('la inyección del contenido SSR conserva las cifras con $', () => {
  const res = { set() {}, send() {} };
  let sent = '';
  res.send = (html) => { sent = html; };
  serveHtml(res, 'empresa.html', {
    pathname: '/guias',
    lang: 'es',
    title: 'Guías | Cifra',
    description: 'Prueba',
    botContent: '<p>Importe: $11.030M y $1.252M</p>',
  });
  assert.match(sent, /Importe: \$11\.030M y \$1\.252M/);
  assert.match(sent, /<title>Guías \| Cifra<\/title>/);
  assert.match(sent, /<meta name="description" content="Prueba">/);
});

test('los metadatos de la página cambian según el idioma', () => {
  const es = getGuidesSeoMeta('es');
  const en = getGuidesSeoMeta('en');
  assert.match(es.title, /^Guías para leer informes 10-Q y 10-K de la SEC/);
  assert.match(en.title, /^Guides to read 10-Q and 10-K SEC filings/);
  assert.notEqual(es.description, en.description);
  assert.equal(getGuidesSeoMeta('fr').title, es.title);
});
