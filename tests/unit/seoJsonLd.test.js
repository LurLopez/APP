import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSiteGraph,
  getHomeJsonLd,
  getHomeFaqJsonLd,
  getCompaniesJsonLd,
  getGuidesJsonLd,
  buildReportJsonLd,
} from '../../src/services/seo/jsonLd.service.js';
import { GUIDES } from '../../src/services/seo/seoConstants.js';

test('el grafo del sitio se localiza y comparte identificadores', () => {
  const es = buildSiteGraph('es');
  const en = buildSiteGraph('en');
  assert.deepEqual(es.map((node) => node['@type']), ['WebSite', 'Organization', 'WebApplication']);
  assert.equal(es[0].inLanguage, 'es');
  assert.equal(en[0].inLanguage, 'en');
  assert.equal(es[0]['@id'], en[0]['@id']);
  assert.match(en[0].description, /AI analysis/);
  assert.ok(en[2].featureList.every((item) => !/[áéíóúñ¿]/i.test(item)));
});

test('la FAQ de portada se traduce al inglés y coincide con el contenido visible', async () => {
  const es = getHomeFaqJsonLd('es');
  const en = getHomeFaqJsonLd('en');
  assert.equal(es.mainEntity.length, 6);
  assert.equal(en.mainEntity.length, 6);
  assert.equal(en.mainEntity[0].name, 'What is a 10-Q report?');
  assert.match(en.mainEntity[0].acceptedAnswer.text, /quarterly financial report/);
  assert.match(es.mainEntity[0].name, /10-Q/);
});

test('el JSON-LD de portada combina el grafo del sitio y el listado', async () => {
  const home = await getHomeJsonLd('en');
  const types = home['@graph'].map((node) => node['@type']);
  assert.deepEqual(types, ['WebSite', 'Organization', 'WebApplication', 'ItemList']);
});

test('el JSON-LD del directorio y de guías usan la URL del idioma', async () => {
  const companies = await getCompaniesJsonLd('en');
  const collection = companies['@graph'].find((node) => node['@type'] === 'CollectionPage');
  assert.match(collection.url, /\/en\/empresa$/);
  assert.equal(collection.inLanguage, 'en');

  const guides = getGuidesJsonLd('en');
  const webPage = guides['@graph'].find((node) => node['@type'] === 'WebPage');
  const itemList = guides['@graph'].find((node) => node['@type'] === 'ItemList');
  assert.match(webPage.url, /\/en\/guias$/);
  assert.equal(itemList.numberOfItems, GUIDES.length);
  assert.ok(itemList.itemListElement[0].item.headline.length > 0);
});

test('el JSON-LD de un informe usa el idioma del análisis', () => {
  const row = {
    created_at: new Date('2026-01-02T00:00:00Z'),
    source_url: 'https://www.sec.gov/example',
  };
  const base = {
    url: 'https://cifraresearch.com/en/informe/KHC/2025-Q1',
    title: 'KHC Form 10-Q report — Q1 2025 | Cifra',
    description: 'Results',
    formType: '10-Q',
    name: 'Kraft Heinz Co',
    company: 'Kraft Heinz Co',
    ticker: 'KHC',
  };
  const en = buildReportJsonLd({ ...base, language: 'en' }, row);
  const article = en['@graph'].find((node) => node['@type'] === 'Article');
  assert.equal(article.inLanguage, 'en');
  assert.match(article.isBasedOn.name, /Official Form 10-Q/);

  const es = buildReportJsonLd({ ...base, language: 'es' }, row);
  const articleEs = es['@graph'].find((node) => node['@type'] === 'Article');
  assert.equal(articleEs.inLanguage, 'es');
  assert.match(articleEs.isBasedOn.name, /^Informe oficial/);
});

test('serveStandalone localiza el JSON-LD en inglés para guías y legales', async () => {
  const { default: config } = await import('../../config/index.js');
  const { serveStandalone } = await import('../../src/services/seo/pageRenderer.service.js');
  const sampleHtml = `<!doctype html><html lang="es"><head><title>Test</title><link rel="canonical" href="{{SITE_URL}}/guias/test"><link rel="alternate" hreflang="es" href="{{SITE_URL}}/guias/test"><script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "¿Qué es un 10-Q?",
      "description": "Descripción",
      "url": "{{SITE_URL}}/guias/test",
      "mainEntityOfPage": "{{SITE_URL}}/guias/test",
      "inLanguage": "es"
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Cifra", "item": "{{SITE_URL}}/" },
        { "@type": "ListItem", "position": 2, "name": "Guías", "item": "{{SITE_URL}}/guias" },
        { "@type": "ListItem", "position": 3, "name": "¿Qué es un 10-Q?" }
      ]
    }
  ]
}
</script></head><body><main>Contenido</main></body></html>`;

  const res = {
    headers: {},
    body: '',
    statusCode: 200,
    set(name, val) { this.headers[name] = val; return this; },
    send(data) { this.body = data; return this; },
  };

  serveStandalone(res, sampleHtml, {
    lang: 'en',
    pathname: '/en/guias/test',
    title: 'What is a 10-Q?',
    description: 'English description',
    slug: 'test',
  });

  const jsonMatch = res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonMatch, 'Debe incluir script JSON-LD');
  const parsed = JSON.parse(jsonMatch[1]);
  const article = parsed['@graph'].find((n) => n['@type'] === 'Article');
  assert.equal(article.inLanguage, 'en');
  assert.equal(article.headline, 'What is a 10-Q?');
  assert.equal(article.description, 'English description');
  assert.equal(article.mainEntityOfPage, `${config.siteUrl}/en/guias/test`);

  const breadcrumb = parsed['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
  assert.equal(breadcrumb.itemListElement[0].item, `${config.siteUrl}/en`);
  assert.equal(breadcrumb.itemListElement[1].name, 'Guides');
  assert.equal(breadcrumb.itemListElement[1].item, `${config.siteUrl}/en/guias`);
  assert.equal(breadcrumb.itemListElement[2].name, 'What is a 10-Q?');
});

test('robots.txt cubre rutas privadas completas en ES y EN, y rastreadores modernos', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const robots = fs.readFileSync(path.resolve('public/robots.txt'), 'utf8');

  assert.match(robots, /Disallow: \/calendario/);
  assert.match(robots, /Disallow: \/en\/calendario/);
  assert.match(robots, /Disallow: \/en\/cartera/);
  assert.match(robots, /Disallow: \/en\/seguimiento/);
  assert.match(robots, /Disallow: \/en\/analisis/);
  assert.match(robots, /Allow: \/en\/guias/);
  assert.match(robots, /Allow: \/en\/empresa/);
  assert.match(robots, /User-agent: DeepSeekBot/);
  assert.match(robots, /User-agent: GoogleOther/);
  assert.match(robots, /User-agent: YouBot/);
});

test('llms.txt referencia todas las 9 guías y endpoints bilingües', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const llms = fs.readFileSync(path.resolve('public/llms.txt'), 'utf8');

  for (const g of GUIDES) {
    assert.match(llms, new RegExp(g.slug), `Falta la guía ${g.slug} en llms.txt`);
  }
  assert.match(llms, /\/en\/empresa/);
  assert.match(llms, /\/en\/guias/);
  assert.match(llms, /español e inglés/);
});

