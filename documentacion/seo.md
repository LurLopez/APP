# SEO y GEO de Cifra

Implementación integral del sistema de posicionamiento en motores de búsqueda tradicionales (SEO: Google, Bing) y optimización para motores de respuesta generativos (GEO: ChatGPT Search, Perplexity, Claude, Apple Intelligence, Google AI Overviews).

## Qué está implementado

### 1. Metadatos y Social Graph (head completo)

Ambas plantillas (`public/index.html`, `public/empresa.html`) y las páginas servidas dinámicamente incluyen:
- `title` y `description` optimizados con keywords de alta intención financiera en español.
- `keywords` específicas para cada sección y `meta name="rating" content="general"`.
- `robots`: `index, follow, max-image-preview:large, max-snippet:-1`.
- `canonical` canónico dinámico e inyección de `hreflang="es"` y `hreflang="x-default"` autorreferentes (actualizados por página, también en las fichas de empresa).
- Dominio canónico `cifraresearch.com`: `www.cifraresearch.com` redirige con 301 al dominio principal para consolidar señales; `dev.` queda para el entorno de desarrollo.
- Enlaces de descubrimiento para IA: `<link rel="alternate" type="text/plain" href="{{SITE_URL}}/llms.txt">` y `llms-full.txt`.
- Open Graph completo (`og:type`, `og:site_name`, `og:locale`, `og:title`, `og:description`, `og:url`, `og:image` 1200×630 con dimensiones y alt).
- Twitter Card `summary_large_image`.
- Favicon SVG/PNG/apple-touch-icon y PWA manifest (`public/manifest.webmanifest`).

### 2. Formato Markdown y Contenido Nativo para IA (GEO)

Los motores generativos y agentes LLM consumen preferentemente Markdown limpio y estructurado sin ruido HTML:
- **Fichas de empresa en Markdown:** `GET /empresa/<TICKER>.md` o cabecera `Accept: text/markdown` sobre `/empresa/<TICKER>`. Devuelve perfil, CIK, bolsa, resumen ejecutivo, tabla de resultados anuales (5 ejercicios con ingresos, beneficio neto, FCF y EPS), últimos filings enlazados a EDGAR, análisis con IA disponibles y FAQ.
- **Informes públicos en Markdown:** `GET /informe/<TICKER>/<PERIODO>.md` (ej. `/informe/KHC/2025-Q3.md`) o cabecera `Accept: text/markdown` sobre `/informe/<TICKER>/<PERIODO>`. Devuelve la radiografía completa del informe: cuenta de resultados, flujo de caja normal y ajustado, tabla de asignación de capital, rating y conclusiones. Redirección 301 automática desde las rutas heredadas `/informe/<id>(.md)?`.
- **`GET /llms.txt`:** Manifiesto estándar según la especificación llmstxt.org con resumen, ámbito, reglas de citación, guías y directorio de empresas con enlaces directos HTML y Markdown.
- **`GET /llms-full.txt`:** Manifiesto completo para LLMs que integra la metodología de análisis de Cifra (los dos horizontes y tres pilares), el texto íntegro de las 7 guías educativas, el glosario de términos (10-K, 10-Q, 8-K, FCF, CAPEX, etc.) y el directorio exhaustivo de empresas.

### 3. Cobertura del Universo Benchmark de Consumo Defensivo

Cifra define un catálogo de referencia con las 28 principales empresas cotizadas en EE. UU. del sector consumo defensivo (KO, PEP, PG, COST, WMT, MDLZ, PM, MO, CL, KHC, GIS, STZ, HSY, KR, ADM, EL, TAP, CAG, TSN, CLX, CHD, SJM, MKC, CPB, HRL, KVUE, DG, DLTR):
- Todas las empresas se indexan automáticamente en `sitemap.xml` con prioridad 0.8 y frecuencia semanal.
- Aparecen referenciadas en `llms.txt`, `llms-full.txt` y en el hub de `/empresa`.
- Cualquier bot que solicite la ficha de estas empresas recibe SSR dinámico inmediato con datos oficiales de SEC EDGAR cacheados.

### 4. SSR Enriquecido y Datos Estructurados (Schema.org / JSON-LD)

`src/middleware/seo.middleware.js` y `src/services/seo.service.js` gestionan el renderizado server-side:
- **Ficha de empresa (`/empresa/<TICKER>`):**
  - Sustitución limpia de JSON-LD: elimina la etiqueta estática genérica y genera un `@graph` unificado sin colisiones que incluye `Corporation` (CIK, bolsa, sector, industria, `knowsAbout`, enlaces `sameAs` a SEC EDGAR), `WebPage`, `BreadcrumbList` y `FAQPage` con 3 preguntas/respuestas específicas de la empresa.
  - Bloque accesible `<details id="seo-contenido">`: contiene el **Resumen Financiero Ejecutivo** con ventas, beneficio neto, flujo de caja libre, margen FCF (%) y BPA del último año fiscal, tabla anual de 5 ejercicios, listado de filings con enlace primario a sec.gov, análisis de Cifra, FAQ en HTML y enlace a la versión Markdown.
- **Página de empresas (`/empresa`):**
  - Bloque SSR con el directorio de empresas destacadas y enlaces directos a sus fichas y archivos Markdown.
  - JSON-LD con `CollectionPage` y `ItemList` con cada corporación.
- **Portada (`/`):**
  - SSR con cómo funciona, FAQ explicativa y listado de empresas con análisis.
  - JSON-LD con `WebSite` (con `SearchAction`), `Organization` (con `alternateName: "Cifra Research"`), `WebApplication` (con `featureList` y `offers`) e `ItemList`.

### 5. Guías Educativas (Contenido Semántico)

- Hub en `/guias` y 7 guías en `src/content/guias/*.html`:
  1. `que-es-un-informe-10-q`: El informe trimestral y cómo leerlo paso a paso.
  2. `que-es-un-informe-10-k`: El informe anual auditado de la SEC.
  3. **`que-es-un-informe-8-k` (Nueva):** Hechos relevantes, Item 2.02, anexos de notas de prensa (ex-99.1), presentaciones a inversores (ex-99.2) y por qué el guidance se divulga en el 8-K y no en el 10-K.
  4. `diferencias-entre-10-k-y-10-q`: Comparativa completa y cuándo consultar cada uno.
  5. `que-es-el-flujo-de-caja-libre`: Fórmula, cálculo y relevancia frente al beneficio contable.
  6. `que-es-la-asignacion-de-capital`: Dividendos, recompras de acciones, deuda y adquisiciones.
  7. `como-analizar-una-empresa-de-consumo-defensivo`: Rutina fundamental de análisis de productos básicos.
- Cada guía cuenta con `Article` estructurado, `BreadcrumbList`, `FAQPage` en HTML y JSON-LD, interlinking y estilos de marca en `public/guia.css`.

### 6. Rastreo y Control de Indexación

- `public/robots.txt`:
  - Acceso permitido a rutas públicas (`/`, `/empresa`, `/guias`, `/informe/`, `/llms.txt`, `/llms-full.txt`).
  - Bloqueo estricto de rutas privadas y API (`/api/`, `/seguimiento`, `/cartera`, `/analisis`, `/alertas`, `/admin/`, etc.).
  - Directivas explícitas de bienvenida para 17 rastreadores de IA y motores generativos: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Claude-Web`, `anthropic-ai`, `Google-Extended`, `Applebot`, `Applebot-Extended`, `Meta-ExternalAgent`, `Meta-ExternalFetcher`, `Amazonbot`, `cohere-ai`, `Diffbot`, `CCBot`, `Bytespider`.
  - Rutas privadas sirven además cabecera HTTP `X-Robots-Tag: noindex, follow`.
- `GET /sitemap.xml`:
  - 41 URLs indexadas (portada, hub de empresas, hub de guías, 7 guías, 28 empresas de consumo defensivo e informes públicos).
  - Fechas `lastmod` reales y actualizadas para cada tipo de contenido.
  - Declaración de espacio de nombres XML `xmlns:xhtml="http://www.w3.org/1999/xhtml"` y etiquetas `<xhtml:link rel="alternate" hreflang="es" href="..." />`.

## Dónde tocar cada cosa

| Componente | Archivo |
|---|---|
| Reglas de robots y rastreadores de IA | `public/robots.txt` |
| Manifiesto conciso para LLMs | `public/llms.txt` |
| Manifiesto extendido con guías integradas | `src/services/seo.service.js` (`getLlmsFullTxt`) |
| Generación de endpoints Markdown (.md) | `src/services/seo.service.js` (`getCompanyMarkdown`, `getPublicReportMarkdown`) |
| Catálogo benchmark de consumo defensivo | `src/services/seo.service.js` (`BENCHMARK_CONSUMER_DEFENSIVE`) |
| Generación del sitemap XML | `src/services/seo.service.js` (`getSitemapXml`) |
| Resumen ejecutivo y SSR de empresas | `src/services/seo.service.js` (`getCompanyBotContent`) |
| Datos estructurados JSON-LD por empresa | `src/services/seo.service.js` (`buildCompanyJsonLd`) |
| Enrutamiento y negociación de contenido SEO/GEO | `src/middleware/seo.middleware.js` |
| Textos y metadatos de la landing | `public/index.html` + `getHomeBotContent` |
| Textos y metadatos del directorio | `public/empresa.html` + `getCompaniesBotContent` |
| Guías educativas | `src/content/guias/*.html` |
