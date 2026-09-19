# Plan de multi-idioma (i18n): interfaz y análisis en español e inglés

> Versión: 1.0 · Fecha: 2026-09-15 · Estado: ✅ **Implementado el núcleo (ES/EN)** — ver «Estado de implementación» al final

Plan específico para que Cifra funcione en **español e inglés** con dos preferencias independientes: el **idioma de la interfaz** y el **idioma de los análisis**. La arquitectura queda preparada para añadir más idiomas en el futuro.

---

## 1. Objetivo y alcance

| Preferencia | Qué controla | Valores | Dónde se elige |
|---|---|---|---|
| `language` (ya existe) | Textos de la interfaz, formatos de fecha/número de la app, correos y avisos | `es`, `en` | Ajustes → Apariencia |
| `analysis_language` (nueva) | Idioma en que la IA redacta los informes | `es`, `en` | Ajustes → nuevo apartado "Análisis" |

- En la primera visita, si no hay preferencia guardada, se detecta el idioma del navegador (`navigator.language` / `Accept-Language`); la preferencia guardada siempre manda.
- La misma infraestructura servirá para más idiomas: añadir uno = soltar un `xx.json` y registrarlo.

**Dentro del alcance**

- Interfaz ES/EN en ambas páginas y en todas las secciones.
- Análisis ES/EN (web, PDF y exportaciones HTML/DOCX/ODT) con caché por idioma.
- Correos y notificaciones en el idioma de la cuenta.

**Fuera del alcance (fases posteriores)**

- Rutas `/en` + `hreflang` para SEO internacional (Fase 5, después de validar el producto).
- Traducción retroactiva de análisis ya guardados (se regeneran si el usuario quiere la otra variante).
- Geolocalización por IP (poco fiable, coste y GDPR; el idioma del navegador es suficiente).
- Traducción de las 7 guías y textos legales sin revisión humana (Fase 5).

---

## 2. Estado actual (puntos de partida)

| Pieza | Estado | Dónde |
|---|---|---|
| Preferencia `language` | ✅ Se guarda, ❌ no se aplica (nota "próximamente") | `db/schema.sql:244`, `db/repositories/watchlistRepositoryPrefs.js:65,99,131`, `public/index.html:1228`, `public/empresa.html:1166` |
| Carga/guardado de preferencias | ✅ Funciona | `public/settings.js`, `public/js/settings/settingsForm.js` |
| Textos de interfaz | Incrustados en español | `public/index.html` (1.773 líneas), `public/empresa.html` (1.711) + **152 módulos JS** de `public/js/` y `public/*.js` (26.553 líneas), de los que 76 escriben texto en el DOM |
| Prompts de análisis | Solo español | `src/agents/analyst/analystSystemPrompt.js` (regla de formato en :124), `analystAnnualSystemPrompt.js`, `analystExtractionPrompt.js`; montaje en `analystAgentCore.js:375-390` |
| Detección de tablas por cabeceras en español | Acoplada al texto | `public/js/analisis/analisisTablesCore.js:36,47,48`, `src/services/report/pdfTableDrawer.js`, `pdfHorizonsDrawer.js`, `src/services/reportExport/reportSections.js:63,105,128` |
| Textos generados por código (fallbacks) | Solo español | `src/agents/analyst/analystCashCapitalProcessor.js:289-290`, `annualConclusionSections.js`, `capitalAllocationHelpers.js` |
| Caché de análisis | Un único `report` por análisis; se sirve el último `done` del filing | `db/schema.sql:33-51`, `findLatestDoneAnalysis` en `db/repositories/analysisRepositoryQueries.js:12`, uso en `filing.analysis.controller.js:50,58` |
| Exportadores | Etiquetas en español | `src/services/report/*.js` (PDF), `src/services/reportExport/{htmlExporter,docxExporter,odtExporter,reportSections}.js` |
| Correos | Textos en español | `src/services/email.service.js`, alertas en `src/services/alerts/` |
| SEO/SSR y contenido | Español + `hreflang="es"` | `src/services/seo/*`, `src/middleware/seo.middleware.js`, `src/content/**` |

---

## 3. Decisiones de diseño

### 3.1. Módulo i18n propio (sin librería)

`public/js/shared/i18n.js` expone `window.I18n`:

| Función | Uso |
|---|---|
| `I18n.init()` | Detecta el idioma (preferencia → navegador → `es`), carga el diccionario y aplica traducciones |
| `I18n.t(clave, params)` | Traduce una clave con interpolación `{n}` y plurales `.one`/`.other` |
| `I18n.apply(root)` | Recorre `[data-i18n]`, `[data-i18n-placeholder]`, `[data-i18n-title]`, `[data-i18n-aria-label]` |
| `I18n.setLanguage(lang)` | Cambia el idioma, actualiza `<html lang>`, persiste y emite `i18n:change` |
| `I18n.formatNumber/Percent/Date/Currency` | Formatos localizados con `Intl` |

- Los textos dinámicos se traducen **en el momento de renderizar** (no se cachean cadenas ya traducidas).
- Al cambiar de idioma se emite `i18n:change`; cada módulo con texto generado se vuelve a pintar (misma mecánica que `settings:change`).
- Sin librería externa: con 2 idiomas un módulo propio (~80 líneas) cubre todo. Si algún día hay 3+ idiomas con plurales complejos, migrar a i18next será casi mecánico porque las claves ya estarán extraídas.

### 3.2. Diccionarios y claves

- `public/locales/es.json` y `public/locales/en.json` (los mismos ficheros para frontend y servidor; el backend los lee de `public/locales/`).
- Claves por área con notación de puntos: `nav.*`, `auth.*`, `upload.*`, `analysis.*`, `company.*`, `portfolio.*`, `watchlists.*`, `forum.*`, `settings.*`, `errors.*`, `emails.*`.
- Reglas: nunca usar el texto como clave; sin HTML dentro de las traducciones; plurales con `.one`/`.other`; toda clave nueva se añade a los dos idiomas (un test lo verifica).

### 3.3. Detección y persistencia

Orden de prioridad:

1. Preferencia de la cuenta (`/api/watchlists/preferences`) si hay sesión.
2. `localStorage` (`cifra_language`) para anónimos; al iniciar sesión manda la cuenta.
3. `navigator.language` / `navigator.languages` (`es-*` → `es`; `en-*` → `en`; resto → `es`).
4. Actualiza `<html lang>` y `<meta og:locale>`.

### 3.4. Idioma de los análisis: prompts

- Nueva opción `language` que viaja: controlador → `analyzeText/analyzePdf` (`src/services/analysis.service.js:75-186`) → `analystAgent.run({ ..., language })` (`analystAgentCore.js`) → prompts.
- En `analystAgentCore.js:375-390` se inyecta una **directiva de idioma** (nueva constante `LANGUAGE_DIRECTIVES` en un módulo aparte, p. ej. `src/agents/analyst/languageDirective.js`):
  - ES: comportamiento actual (redacción en español, coma decimal, `+16,67 %`).
  - EN: "Write ALL textual content (titles, labels, notes, narrative) in English; use en-US number formatting (`+16.67%`, `1,234.5M`)"; el esquema JSON no cambia de forma.
- La fase de extracción (`EXTRACTION_PROMPT`) mantiene el idioma de la fuente (el 10-K está en inglés) para no perder fidelidad de citas; las descripciones que se usen como texto final (`acquisitionDescription`, `divestitureDescription`, `executiveChanges`) se piden **en el idioma del análisis**.
- Los fallbacks deterministas (`analystCashCapitalProcessor.js`, `annualConclusionSections.js`, `capitalAllocationHelpers.js`) pasan de cadenas españolas a `t('analysis.fallback...')` con el `t()` de servidor.

### 3.5. Informe con identificadores estables

Para que el render y los exportadores no dependan del texto en español se añaden al JSON del informe campos estables (el LLM los rellena junto a las etiquetas):

| Campo nuevo | Valores | Sustituye a |
|---|---|---|
| `horizons[].type` | `quarter` \| `ytd` \| `annual` | Comparar `label` con "ÚLTIMOS 3 MESES" |
| `horizons[].blocks[].type` | `sales` \| `cashFlow` \| `capitalAllocation` | Orden/nombre fijo |
| `cashFlow.scenarios[].type` | `normal` \| `adjusted` | Comparar con "Normal"/"Ajustado" |
| `capitalAllocation.rows[].type` | `free`, `shortTermInvestments`, `divestitures`, `acquisitions`, `debt`, `cash`, `repurchases`, `restrictedCash`, `preferredIssuance`, `equitySales`, `assumedDebt`, `total` | Comparar `name` |

- **Retrocompatibilidad**: si el informe guardado no trae identificadores, se mantiene la heurística actual por cabeceras en español (los análisis viejos siguen pintándose igual).
- Las etiquetas visibles (`label`, `name`, títulos) siguen viniendo del informe en su idioma; el render solo las muestra.

### 3.6. Caché por idioma y cupo

- `analyses.language` (`'es'`/`'en'`); `findLatestDoneAnalysis({ ticker, accession, language, userId })` filtra por idioma.
- Flujo del botón "Analizar" sobre un filing:
  1. ¿Hay variante en el idioma pedido? → se sirve (gratis).
  2. ¿Hay una **traducción automática en curso** hacia ese idioma (recién generado el análisis original)? → se espera a que termine y se sirve (gratis, sin diálogo).
  3. ¿Solo hay variante en el otro idioma? → respuesta `LANGUAGE_VARIANT_REQUIRED` con `availableLanguages` y `requestedLanguage`; la UI avisa: *"Este análisis ya existe en español. Se traducirá al inglés en unos segundos, con las mismas cifras, y consume 1 análisis de tu cupo diario"*. Si el usuario confirma, **se traduce el informe ya existente** (no se reanaliza el filing): etiquetas y tablas por diccionario/código, narrativa por IA con validación anti-cambio de cifras, PDF/DOCX/ODT regenerados en el idioma destino y variante cacheada y pública para todos. Si la traducción falla, se cae al flujo de generación completa.
  4. No hay ninguna variante → flujo actual (cupo y generación).
- **Traducción automática del análisis nuevo**: al guardar un análisis nuevo (filing por ticker, subida manual o regeneración del admin) se lanza en segundo plano `autoTranslate.service.js`, que traduce y guarda la variante del otro idioma **sin consumir cupo**; un único proceso por filing (`inFlight`) y `joinAutoTranslation` para que cualquier petición concurrente espere y reciba la misma variante. Así un análisis nuevo queda disponible en ambos idiomas a los pocos segundos.
- Implementación de la traducción en `src/services/translation/` (`reportTranslator.service.js` orquesta; `reportLabels.js` diccionario; `reportNumbers.js` formato numérico; `reportTextFields.js` inventario de campos 10-Q/10-K; `analysisTranslation.service.js` guarda la variante; `autoTranslate.service.js` planifica y deduplica las automáticas). Coste medido en pruebas: ~3.700 tokens de entrada / ~3.000 de salida (~0,002 $ con tarifas DeepSeek) frente a ~100.000 tokens de un reanálisis completo.
- La subida manual no consulta caché (como ahora): se genera directamente en el idioma preferido.
- El administrador puede forzar la regeneración en cualquier idioma desde la administración.

### 3.7. Formato de números y fechas

- Backend y frontend usan `Intl` según el idioma del informe (números) y de la interfaz (fechas de la app).
- El LLM recibe la instrucción de formato correcta; el render no "corrige" sus cifras.
- Ojo: los prompts actuales exigen coma decimal (`analystSystemPrompt.js:124`); la directiva EN lo invierte.

### 3.7 bis. Idioma de la vista del informe

- Las etiquetas de la vista del informe (cabeceras de tablas, títulos de sección, gráficos, badges, extractos SEC) se pintan en el **idioma del informe**, no en el de la interfaz: el contenedor `#report-body` lleva `data-report-language` y el motor i18n de cliente (`I18n.tIn`, `I18n.ensureLanguage`) traduce sus nodos a ese idioma. El resto de la web (botones, menús, avisos) sigue en el idioma de interfaz.
- Consecuencia: un informe EN se lee íntegro en inglés aunque la interfaz esté en español, y viceversa.
- El traductor de servidor desambigua etiquetas financieras frente a las de interfaz con una lista prioritaria («Free» → «Libre», «Total» → «En total», «Cash» → «Caja»).

### 3.8. Mensajes del servidor y correos

- Los errores de API llevan `code`; el frontend traduce por `code` (`errors.*`) con fallback al `message` del servidor. Se revisan los códigos que hoy solo devuelven texto en español.
- Correos y notificaciones (`email.service.js`, alertas, calendario) usan el `t()` de servidor con el `language` de la cuenta del destinatario.

---

## 4. Cambios de base de datos

```sql
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS analysis_language TEXT NOT NULL DEFAULT 'es';
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es';
CREATE INDEX IF NOT EXISTS idx_analyses_filing_lang ON analyses (ticker, accession, language);
```

- `watchlistRepositoryPrefs.js`: `ALLOWED_LANGUAGES` se reutiliza para `analysis_language`; la API `GET/PUT /api/watchlists/preferences` devuelve y acepta ambos campos.
- No se renombra la ruta de preferencias (usar `/api/watchlists/preferences` es feo, pero ya está en producción; renombrar sería un cambio aparte con alias).

---

## 5. Fases

### Fase 0 — Inventario y convención (0,5 día)

- Generar inventario de textos por área (script `scripts/i18n/inventory.js`): fichero, línea y texto candidato.
- Fijar la convención de claves y crear `public/locales/es.json` (se irá vaciando) y `en.json`.
- **Criterio**: inventario versionado (anexo de este plan) y convención acordada.

### Fase 1 — Infraestructura i18n (1 día)

- `public/js/shared/i18n.js` (API de la tabla 3.1) + `public/locales/{es,en}.json`.
- `src/utils/i18n.js`: `t()` de servidor (correos, fallbacks, SSR) leyendo los mismos JSON; tests unitarios de interpolación, plurales, detección y fallback de claves.
- `public/settings.js` y `settingsForm.js`: al cargar preferencias se llama a `I18n.setLanguage`; el selector existente pasa a aplicar de inmediato y se retira la nota "próximamente".
- `index.html` y `empresa.html`: `<script src="/js/shared/i18n.js">` antes del resto; `data-i18n` en cabecera, navegación y modales globales.
- El script de arranque espera a `I18n.init()` antes de pintar.
- **Criterio**: un usuario anónimo con navegador en inglés ve el shell en inglés; con navegador en español, en español; al cambiar el selector, la página cambia sin recargar; la elección persiste (localStorage y cuenta).

### Fase 2 — Cobertura de la interfaz por áreas (3-5 días)

Orden recomendado (de más a menos visible):

1. **Auth**: `public/js/auth/*`, `public/auth.js`, `public/authFlow.js`.
2. **Inicio**: `public/index.html`, parte de subida de `public/js/analisis/*`, y `public/*.js` (cookies, novedades, foro, guías).
3. **Análisis**: visor completo (`public/js/analisis/*`, tablas, gráficos, historial).
4. **Empresa**: `public/empresa.html`, `public/js/empresa/*` (~47 ficheros).
5. **Cartera y listas**: `public/js/portfolio/*` (~63 ficheros), `public/js/watchlists/*`, `public/js/alerts/*`.
6. **Ajustes, perfil y legales**: resto de `settings` y `src/content/legal/*`.

Reglas por área: traducir solo lo visible; no tocar lógica; actualizar `?v=N` de los ficheros modificados (cache-busting).
- **Criterio por área**: sin literales visibles en español en el área, QA en ES y EN, y `npm test` en verde.

### Fase 3 — Idioma de los análisis (2-3 días)

- DB + API de preferencias (`analysis_language`).
- Selector nuevo en Ajustes: "Idioma de los análisis" (independiente del de la interfaz) con ayuda: *"Los informes se generarán en este idioma"*.
- Pipeline: `analysis.service.js` → `analystAgentCore.js` → `languageDirective.js` + prompts; `saveAnalysis` guarda `language` y el `pdf_url` de cada variante.
- Esquemas de salida: añadir `type` a horizontes/bloques/escenarios/filas (3.5) manteniendo las etiquetas.
- Fallbacks deterministas del backend con el `t()` de servidor (3.8).
- Render web: `analisisTablesCore.js` y afines detectan por `type` con fallback por cabeceras.
- Exportadores PDF/HTML/DOCX/ODT: etiquetas con `t()` y formatos con `Intl`; un PDF por variante.
- **Criterio**: análisis completo de un 10-K real en EN (web + PDF + DOCX + ODT) sin ningún texto en español; el mismo análisis en ES sale como hasta ahora; los informes guardados (sin `type`) siguen renderizando.

### Fase 4 — Caché por idioma, cupo y administración (1 día)

- `findLatestDoneAnalysis` con `language`; actualizar los puntos de uso (`filing.analysis.controller.js:50,58`, `filingAnalysis.controller.js`, `filing.versions.controller.js`).
- Respuesta `needsLanguageVariant` + diálogo de confirmación en la UI (el `quota` ya se devuelve en las respuestas de análisis).
- Vista de versiones del análisis: mostrar idioma y permitir abrir la otra variante si existe.
- Panel de administración: regenerar/forzar por idioma.
- **Criterio**: pedir EN de un análisis que solo está en ES no gasta cupo hasta confirmar; la variante generada se sirve a todos y no vuelve a gastar cupo; el admin puede regenerar cada idioma.

### Fase 5 — SEO, guías y legales (opcional, 2-3 días)

- Rutas `/en/...`, `hreflang` recíproco, `sitemap.xml` con ambas versiones, `og:locale` por página.
- Markdown para IA (`/informe/...md`, `llms.txt`) con secciones según el idioma del informe.
- Guías (`src/content/guias/*`) y legales (`src/content/legal/*`) traducidos; **los legales requieren revisión del usuario**.
- **Criterio**: Google recibe ambas versiones sin señales de contenido duplicado; los legales EN están revisados.

---

## 6. Riesgos y decisiones abiertas

| # | Riesgo / decisión | Detalle | Propuesta |
|---|---|---|---|
| 1 | Coste de las variantes | Cada idioma nuevo de un filing es una llamada completa a IA (~25 s) | Generar solo bajo confirmación, con cupo; queda cacheada y pública después |
| 2 | Render acoplado a textos ES | `analisisTablesCore.js:36,47,48` y exportadores comparan cabeceras | Identificadores estables (3.5) + fallback retrocompatible |
| 3 | Formatos numéricos | Los prompts exigen coma decimal ES | Directiva de idioma + `Intl` |
| 4 | Mensajes de error del servidor | Hoy son texto español | Códigos + `errors.*` en el frontend |
| 5 | Análisis públicos en el otro idioma | Un visitante EN puede acabar viendo un informe ES | Aviso + botón "Generate in English" (3.6) |
| 6 | Correos/notificaciones | Muchos textos y dos idiomas | `t()` de servidor con el `language` del destinatario (3.8) |
| 7 | Volumen de la Fase 2 | 152 ficheros JS con texto + 3.484 líneas de HTML | Hacerlo por áreas, priorizando lo que ve el usuario inglés |
| 8 | SEO | `hreflang` y rutas `/en` | Fase 5; no bloquea el lanzamiento ES/EN de producto |
| 9 | Legales | Traducción jurídica | Revisión humana del usuario antes de publicar |

---

## 7. Estimación

| Fase | Estimación |
|---|---|
| 0 — Inventario | 0,5 día |
| 1 — Infraestructura i18n | 1 día |
| 2 — Interfaz por áreas | 3-5 días |
| 3 — Idioma de los análisis | 2-3 días |
| 4 — Caché por idioma | 1 día |
| 5 — SEO, guías y legales (opcional) | 2-3 días |
| **Total núcleo (0-4)** | **~8-11 días de trabajo** |

---

## 8. Validación

- `npm test` (54/54 a fecha de este plan) en verde en cada fase; nuevos tests unitarios:
  - `tests/unit/i18n.test.js`: interpolación, plurales, fallback de claves y detección de locale.
  - `tests/unit/analysisLanguage.test.js`: la directiva de idioma se inyecta; `findLatestDoneAnalysis` filtra por idioma.
  - Test que verifica que `es.json` y `en.json` tienen exactamente las mismas claves.
- `node --check` de todo fichero tocado.
- QA manual con Chrome headless (como se viene haciendo): cambiar idioma, analizar un filing en ES y EN, abrir PDF y exportaciones, comprobar caché y cupo.
- Actualizar `?v=N` de los assets modificados.

---

## 9. Orden recomendado

**Fase 1 → Fase 3 → Fase 4 → Fase 2 → Fase 5**, por valor entregado: primero el idioma de los análisis (lo que ningún competidor hace y sirve para GEO/inglés) con la infraestructura i18n mínima, luego la caché por idioma, y después la cobertura completa de la interfaz (la parte larga y mecánica). La Fase 2 puede solaparse con el resto y hacerse por áreas.

---

## 10. Anexo: superficies a traducir

| Área | Ficheros | Volumen aprox. |
|---|---|---|
| Hojas HTML | `public/index.html`, `public/empresa.html` | 3.484 líneas |
| Inicio y globales | `public/*.js` (auth, cookies, novedades, foro, guías, settings) | ~2.475 líneas |
| Análisis | `public/js/analisis/*` | 16 ficheros, 2.920 líneas |
| Empresa | `public/js/empresa/*` | 47 ficheros, 8.672 líneas |
| Cartera | `public/js/portfolio/*` | 63 ficheros, 9.716 líneas |
| Listas y alertas | `public/js/watchlists/*`, `public/js/alerts/*`, `public/watchlists*.js`, `public/priceAlerts.js` | ~1.500 líneas |
| Backend (errores, correos, fallbacks) | `src/api/controllers/*`, `src/services/**`, `src/agents/analyst/*` | 160 ficheros con texto ES (mayoría mensajes de error) |
| Exportadores | `src/services/report/*`, `src/services/reportExport/*` | ~2.700 líneas |
| Contenido | `src/content/guias/*`, `src/content/legal/*` | 11 HTML |

---

## 11. Estado de implementación (2026-09-15)

Implementado el **núcleo ES/EN** con las siguientes desviaciones y concreciones respecto al plan original:

| Pieza | Implementación real |
|---|---|
| Diccionarios | El **texto español es la clave** (estilo gettext) en `public/locales/en.json` (2.710 entradas). El inventario vive en `public/locales/_sources.json` (2.662 textos) y `_sources-dynamic.json` (154 plantillas). No hay `es.json`: el idioma fuente es el propio código. |
| Traducción | Scripts reanudables: `scripts/i18n/extract.js` (extrae también texto interno de literales HTML), `scripts/i18n/translate.js` (traduce por lotes con DeepSeek y glosario financiero) y `scripts/i18n/audit.js` (audita páginas reales con Chrome headless y detecta textos sin traducir). Añadir un idioma = `--lang=xx` + revisar. |
| Motor cliente | `public/js/shared/i18n.js`: `t()`, `tp()`, `apply()`, `setLanguage()`, formatos `Intl`, `MutationObserver` que traduce también el DOM generado por JS y **patrones automáticos** para plantillas con interpolación (`{0}`, `{1}`…), sin tocar el código que las crea. |
| Motor servidor | `src/utils/i18n.js`: `t()`, `translatorFor()`, `formatPercent()`; usado en PDF/HTML/DOCX/ODT, correos, alertas, fallbacks del analista y SEO. |
| Preferencias | `user_preferences.language` + `user_preferences.analysis_language`, API `GET/PUT /api/watchlists/preferences`, dos selectores en Ajustes. Detección inicial: preferencia → `localStorage` → navegador → `es`. |
| Análisis | `analyses.language` + índice; directiva de idioma en los prompts (`languageDirective.js`) que fija etiquetas y formato numérico en-US; caché por idioma con respuesta `LANGUAGE_VARIANT_REQUIRED` y confirmación explícita antes de gastar cupo; **traducción automática del análisis nuevo al otro idioma en segundo plano (sin cupo, deduplicada por filing con join para peticiones concurrentes)**; fallbacks y notas deterministas localizados; badge de idioma (ES/EN) en el historial. |
| Render del informe | Web, PDF, HTML, DOCX, ODT, SSR y Markdown detectan por estructura (no por cabeceras en español) y usan `t()` para etiquetas fijas; los informes guardados sin `language` siguen renderizándose en español. |
| Correos y alertas | `email.service.js` y escáneres de alertas usan el idioma de la cuenta (`language`); los códigos de verificación y recuperación también. |
| Guías y legales | Las páginas standalone inyectan `i18n.js` y se traducen en el navegador con el diccionario (auditadas); en las rutas `/en/legal/*` se inyecta un banner informativo de cortesía indicando que prevalece la versión en español hasta la firma jurídica oficial. |
| Formatos | `Intl` para números/fechas en empresa, cartera y análisis; el LLM usa coma decimal en ES y punto en EN. |
| Fase 5 (SEO y SSR bilingüe) | **Completada**: Rutas `/en` con `hreflang` recíproco (`es`, `en`, `x-default`) en todas las páginas públicas (portada, empresas, guías, legales); sitemap bilingüe con enlaces recíprocos `<xhtml:link>`; fichas de empresa SSR en inglés (`getCompanyBotContent`, `companyMeta.service.js`, `markdownSeo.service.js`); metatags, títulos y Open Graph traducidos en SSR y cliente (`empresaFormatting.js`). Refinamiento posterior: los informes públicos (HTML y Markdown) se sirven íntegros en el idioma del análisis, con canónica y `hreflang`/sitemap de una sola lengua, porque la interfaz y el análisis tienen idiomas independientes. |
| Prioridad por país | Si un usuario procede de un país donde el español no es idioma oficial (21 países hispanohablantes reconocidos) según región del navegador, cabeceras de país o zona horaria, el idioma prioritario por defecto es el inglés (`'en'`), con recomendaciones y descripciones de empresa generadas en inglés. |

**Validación**: `npm test` 70/70 pasando (incluye tests de i18n, detección de países oficiales, zonas horarias prioritarias y cobertura del diccionario). Auditoría exhaustiva con Chrome headless en inglés de todas las rutas (`/en`, `/en/empresa/KHC`, `/en/guias`, `/en/guias/*`, `/en/legal/*`): 0 candidatos sin traducir en `public/locales/_missing.json`.
