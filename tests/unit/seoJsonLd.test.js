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
