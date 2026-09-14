/**
 * @fileoverview Fachada del servicio SEO, metadatos, Schema.org, SSR y exportación para IA (LLMs).
 * Centraliza la provisión de metatags, renderizado público y respuestas estructuradas.
 * @module services/seo.service
 */

export {
  GUIDES,
  LEGAL_PAGES,
  BENCHMARK_CONSUMER_DEFENSIVE,
  SITE_NAME,
  GA_MEASUREMENT_ID,
  DEFAULT_OG_IMAGE,
  PUBLIC_DIR,
  GUIDES_DIR,
  LEGAL_DIR,
} from './seo/seoConstants.js';

export {
  getFeaturedCompanies,
} from './seo/featuredCompanies.service.js';

export {
  jsonLdScript,
  buildFeaturedItemList,
  getHomeJsonLd,
  getCompaniesJsonLd,
  buildCompanyJsonLd,
  buildReportJsonLd,
} from './seo/jsonLd.service.js';

export {
  buildCompanyDescription,
  buildCompanyMeta,
  resolveCompanyMeta,
  injectCompanyMeta,
  applyNoIndex,
} from './seo/companyMeta.service.js';

export {
  secDocumentUrl,
  loadPublicReportsForTicker,
  getCompanySeoContent,
  botContentWrap,
  guideListLinks,
  getCompanyBotContent,
  getHomeBotContent,
  getCompaniesBotContent,
} from './seo/botContent.service.js';

export {
  isPrivatePath,
  serveHtml,
  serveStandalone,
  serveGuide,
  serveGuideHub,
  serveLegal,
  serve404Page,
} from './seo/pageRenderer.service.js';

export {
  buildReportSlug,
  loadPublicReportRow,
  loadPublicReportBySlug,
  getReportSlugById,
  invalidateReportCache,
  getPublicReportHtmlBySlug,
  getPublicReportHtml,
  loadPublicReportsForSitemap,
} from './seo/reportSeo.service.js';

export {
  getCompanyMarkdown,
  buildReportMarkdown,
  getPublicReportMarkdown,
  getPublicReportMarkdownBySlug,
} from './seo/markdownSeo.service.js';

export {
  getGuideLastmod,
  getLegalLastmod,
  getLlmsTxt,
  getLlmsFullTxt,
  getSitemapXml,
} from './seo/sitemapAndLlms.service.js';
