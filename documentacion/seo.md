# SEO y GEO de Cifra

Implementación integral del sistema de posicionamiento en motores de búsqueda tradicionales (SEO: Google, Bing) y optimización para motores de respuesta generativos (GEO: ChatGPT Search, Perplexity, Claude, Apple Intelligence, Google AI Overviews, DeepSeek, You.com).

## Qué está implementado

### 1. Metadatos y Social Graph (head completo)

Ambas plantillas (`public/index.html`, `public/empresa.html`), guías y páginas servidas dinámicamente incluyen:
- `title` y `description` optimizados con keywords de alta intención financiera en español e inglés.
- `keywords` específicas para cada sección y `meta name="rating" content="general"`.
- `robots`: `index, follow, max-image-preview:large, max-snippet:-1`.
- `canonical` canónico dinámico e inyección de `hreflang="es"`, `hreflang="en"` y `hreflang="x-default"` recíprocos y autorreferentes (actualizados por página, también en las fichas de empresa y guías).
- Dominio canónico `cifraresearch.com`: `www.cifraresearch.com` redirige con 301 al dominio principal para consolidar señales; `dev.` queda para el entorno de desarrollo.
- Enlaces de descubrimiento para IA: `<link rel="alternate" type="text/plain" href="{{SITE_URL}}/llms.txt">` y `llms-full.txt`.
- Open Graph completo (`og:type`, `og:site_name`, `og:locale`, `og:locale:alternate`, `og:title`, `og:description`, `og:url`, `og:image` 1200×630 con dimensiones y `og:image:alt` localizado).
- Twitter Card `summary_large_image` con títulos y descripciones adaptados.
- Favicon SVG/PNG/apple-touch-icon y PWA manifest (`public/manifest.webmanifest`).

### 2. Formato Markdown y Contenido Nativo para IA (GEO)

Los motores generativos y agentes LLM consumen preferentemente Markdown limpio y estructurado sin ruido HTML:
- **Fichas de empresa en Markdown:** `GET /empresa/<TICKER>.md` (español) y `GET /en/empresa/<TICKER>.md` (inglés), o cabecera `Accept: text/markdown` sobre `/empresa/<TICKER>`. Devuelve perfil, CIK, bolsa, resumen ejecutivo, tabla de resultados anuales (5 ejercicios con ingresos, beneficio operativo, beneficio neto, FCF y EPS), últimos filings enlazados a EDGAR, análisis con IA disponibles y FAQ.
- **Informes públicos en Markdown:** `GET /informe/<TICKER>/<PERIODO>.md` (ej. `/informe/KHC/2025-Q3.md`) o cabecera `Accept: text/markdown` sobre `/informe/<TICKER>/<PERIODO>`. Devuelve la radiografía completa del informe: cuenta de resultados, flujo de caja normal y ajustado, tabla de asignación de capital, rating y conclusiones. Redirección 301 automática desde las rutas heredadas `/informe/<id>(.md)?`. Cada informe se renderiza íntegro en el idioma del análisis (etiquetas, narrativa y URL canónica incluidas).
- **Informes públicos en HTML:** la página de un informe usa el idioma del análisis para `title`, `description`, `<html lang>`, `og:locale`, `inLanguage` (JSON-LD) y `hreflang`; el idioma de la URL solo determina el idioma de la interfaz. La plantilla base se sirve traducida en inglés si el contenido es en inglés. El `sitemap.xml` incluye cada informe en su idioma de contenido, con `hreflang` de ese idioma y `x-default`.
- **`GET /llms.txt`:** Manifiesto estándar según la especificación llmstxt.org con resumen, ámbito multi-idioma (ES/EN), reglas de citación, las 9 guías y directorio de empresas con enlaces directos HTML, Markdown y versiones en inglés.
- **`GET /llms-full.txt`:** Manifiesto completo para LLMs que integra la metodología de análisis de Cifra (los dos horizontes y tres pilares), el texto íntegro de las 9 guías educativas (con títulos y URLs en español e inglés), el glosario de términos y el directorio exhaustivo de empresas cubiertas.

### 3. Cobertura del Universo Benchmark de Consumo Defensivo

Cifra define un catálogo de referencia con las 28 principales empresas cotizadas en EE. UU. del sector consumo defensivo (KO, PEP, PG, COST, WMT, MDLZ, PM, MO, CL, KHC, GIS, STZ, HSY, KR, ADM, EL, TAP, CAG, TSN, CLX, CHD, SJM, MKC, CPB, HRL, KVUE, DG, DLTR):
- Todas las empresas se indexan automáticamente en `sitemap.xml` con prioridad 0.8 y frecuencia semanal, tanto en español (`/empresa/...`) como en inglés (`/en/empresa/...`), con etiquetas recíprocas `<xhtml:link>`.
- Aparecen referenciadas en `llms.txt`, `llms-full.txt` y en el hub de `/empresa`.
- Cualquier bot que solicite la ficha de estas empresas recibe SSR dinámico inmediato con datos oficiales de SEC EDGAR cacheados.

### 4. SSR Enriquecido y Datos Estructurados (Schema.org / JSON-LD)

`src/middleware/seoHandlers.js` y los servicios de `src/services/seo/` gestionan el renderizado server-side seguro (con serialización blindada mediante `safeJsonForScript`):
- **Ficha de empresa (`/empresa/<TICKER>`):**
  - Sustitución limpia de JSON-LD: genera un `@graph` unificado sin colisiones que incluye `Corporation` (CIK, bolsa, sector, industria, `knowsAbout`, enlaces `sameAs` a SEC EDGAR), `WebPage`, `BreadcrumbList` y `FAQPage` con 3 preguntas/respuestas específicas de la empresa.
  - Bloque accesible `<details id="seo-contenido">`: contiene el **Resumen Financiero Ejecutivo** con ventas, beneficio operativo, beneficio neto, flujo de caja libre, margen FCF (%) y BPA del último año fiscal, tabla anual de 5 ejercicios, listado de filings con enlace primario a sec.gov, análisis de Cifra, FAQ en HTML y enlace a la versión Markdown.
- **Página de empresas (`/empresa`):**
  - Bloque SSR con el directorio de empresas destacadas y enlaces directos a sus fichas y archivos Markdown.
  - JSON-LD con `CollectionPage` y `ItemList` con cada corporación.
- **Portada (`/`):**
  - SSR con cómo funciona, FAQ explicativa y listado de empresas con análisis.
  - JSON-LD con `WebSite` (con `SearchAction`), `Organization` (con `alternateName: "Cifra Research"`), `WebApplication` (con `featureList` y `offers`), `ItemList` y `FAQPage` con las mismas 6 preguntas y respuestas que el bloque visible (fuente única `HOME_FAQS`).
- **Hub de guías (`/guias`):** JSON-LD `WebPage` + `BreadcrumbList` + `Organization` + `ItemList` con las 9 guías.
- **Guías y páginas legales:** JSON-LD localizado dinámicamente en inglés cuando se sirven en `/en/guias/*` o `/en/legal/*` (`inLanguage: "en"`, headline, description, canonical `mainEntityOfPage` y breadcrumbs en inglés).

### 5. Guías Educativas (Contenido Semántico)

- Hub en `/guias` y 9 guías completas en `src/content/guias/*.html`:
  1. `que-es-un-informe-10-q`: El informe trimestral y cómo leerlo paso a paso.
  2. `que-es-un-informe-10-k`: El informe anual auditado de la SEC.
  3. `que-es-un-informe-8-k`: Hechos relevantes, Item 2.02, notas de prensa y presentaciones con guidance.
  4. `diferencias-entre-10-k-y-10-q`: Comparativa completa y cuándo consultar cada uno.
  5. `que-es-el-flujo-de-caja-libre`: Fórmula, cálculo y relevancia frente al beneficio contable.
  6. `que-es-la-asignacion-de-capital`: Dividendos, recompras de acciones, deuda y adquisiciones.
  7. `como-analiza-la-ia-por-sectores`: Metodología multi-agente, dos horizontes y adaptación sectorial.
  8. `que-es-el-bpa-ajustado`: BPA GAAP vs Non-GAAP, partidas excluidas y normalización de Cifra.
  9. `como-analizar-una-empresa-de-consumo-defensivo`: Rutina fundamental de análisis de productos básicos.
- El hub `/guias` (y `/en/guias`) sirve SSR con el contenido íntegro de la pestaña «Guías» de la aplicación (apartados Aviso y Proyecto, Datos Financieros y Análisis con IA, con sus sub-pestañas completas), reutilizando la misma fuente que la interfaz (`public/js/guias/guiasContent.js`).
- Cada guía cuenta con `Article` estructurado, `BreadcrumbList`, `FAQPage` en HTML y JSON-LD, interlinking y estilos de marca en `public/guia.css`.

### 6. Rastreo y Control de Indexación

- `public/robots.txt`:
  - Acceso permitido a rutas públicas en español e inglés (`/`, `/en`, `/empresa`, `/en/empresa`, `/guias`, `/en/guias`, `/legal`, `/en/legal`, `/informe/`, `/en/informe/`, `/llms.txt`, `/llms-full.txt`).
  - Bloqueo estricto de rutas privadas y API (`/api/`, `/seguimiento`, `/cartera`, `/calendario`, `/analisis`, `/alertas`, `/alertas-precio`, `/novedades`, `/reportes`, `/admin/`, `/logout`, y sus variantes `/en/*`).
  - Directivas explícitas de bienvenida para 26 rastreadores de IA y motores generativos: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `ClaudeBot`, `Claude-Web`, `anthropic-ai`, `Google-Extended`, `GoogleOther`, `GoogleOther-Image`, `GoogleOther-Video`, `Applebot`, `Applebot-Extended`, `Meta-ExternalAgent`, `Meta-ExternalFetcher`, `Amazonbot`, `cohere-ai`, `cohere-training-data-crawler`, `Diffbot`, `CCBot`, `Bytespider`, `DeepSeekBot`, `DuckAssistBot`, `YouBot`, `searchgpt`.
  - Rutas privadas sirven además cabecera HTTP `X-Robots-Tag: noindex, follow`.
- `GET /sitemap.xml`:
  - URLs indexadas con enlaces bidireccionales recíprocos `<xhtml:link>` (`es`, `en`, `x-default`).
  - Fechas `lastmod` reales y actualizadas en formato ISO 8601 para cada tipo de contenido.
  - Prioridades diferenciadas (1.0 portada, 0.8 empresas y guías hub, 0.7 guías e informes, 0.3 legales).

## Dónde tocar cada cosa

| Componente | Archivo |
|---|---|
| Reglas de robots y rastreadores de IA | `public/robots.txt` |
| Manifiesto conciso para LLMs | `public/llms.txt` |
| Manifiesto extendido con guías integradas | `src/services/seo/sitemapAndLlms.service.js` (`getLlmsFullTxt`) |
| Generación de endpoints Markdown (.md) | `src/services/seo/markdownSeo.service.js` (`getCompanyMarkdown`, `getPublicReportMarkdown`) |
| Catálogo benchmark de consumo defensivo | `src/services/seo/seoConstants.js` (`BENCHMARK_CONSUMER_DEFENSIVE`) |
| Generación del sitemap XML | `src/services/seo/sitemapAndLlms.service.js` (`getSitemapXml`) |
| Resumen ejecutivo y SSR de empresas | `src/services/seo/botContent.service.js` (`getCompanyBotContent`) |
| Datos estructurados JSON-LD por empresa | `src/services/seo/jsonLd.service.js` (`buildCompanyJsonLd`) |
| Enrutamiento y negociación de contenido SEO/GEO | `src/middleware/seo.middleware.js` + `seoHandlers.js` |
| Textos y metadatos de la landing | `public/index.html` + `getHomeBotContent` |
| Textos y metadatos del directorio | `public/empresa.html` + `getCompaniesBotContent` |
| Contenido de la pestaña Guías (ES/EN) | `public/js/guias/guiasContent.js` |
| SSR de `/guias` para buscadores y LLMs | `src/services/seo/guidesSeo.service.js` |
| Guías educativas | `src/content/guias/*.html` |

