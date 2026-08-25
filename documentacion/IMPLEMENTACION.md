# Implementación — Todo lo construido hasta ahora

> Versión: 2.0 · Fecha: 2026-08-15 · Este documento es el registro detallado de todo lo implementado en el proyecto hasta la fecha. Se actualiza cuando se añade o cambia algo relevante.

---

## 1. Resumen del estado actual

| Área | Estado |
|---|---|
| Documentación (visión + arquitectura) | ✅ Completada |
| Scaffolding Node/Express + PostgreSQL | ✅ Completado |
| Autenticación completa (backend + frontend) | ✅ Registro + verificación por correo + recuperación de contraseña; probado |
| Pipeline de análisis IA (3 agentes) | ✅ Origen + sector + analista (2 fases) + informe + PDF; probado end-to-end |
| Subida de PDF real (`POST /api/upload`) | ✅ Funcional y guarda por usuario |
| Histórico de análisis (`GET /api/analyses`) | ✅ Con filtros (empresa, fecha resultados/análisis) + apertura del PDF |
| Buscador de empresas (Fase 2) | ✅ Búsqueda EDGAR + página de empresa + perfil + gráfico |
| Cribador sin huecos | ✅ Series anuales (10) / trimestrales (8) con 3 estados estilo TIKR y rescate XBRL |
| Filings (histórico + ver PDF + preview + analizar) | ✅ 10-Q/10-K con documento, preview por páginas y botón "Analizar con IA" |
| Listas de seguimiento (multi-lista) | ✅ Sustituyen a los favoritos (migración incluida) |
| Cartera de inversión | ✅ FIFO, dividendos estimados, rentabilidad con/sin dividendos, donuts |
| Suscripciones y planes (Fase 5) | ⏳ Pendiente (campo `plan` existe; bloqueo PRO del cribador como primer límite) |

---

## 2. Cronología de lo realizado

### 2.1. Documento de visión y decisiones de stack

- `documentacion/PROYECTO.md` (resumen inyectado) y `documentacion/PROYECTO-detalle.md` (visión completa).
- Stack decidido: Node.js + Express 5 + PostgreSQL 16 + HTML/CSS/JS puro; JWT en cookie httpOnly; bcryptjs; nodemailer.
- Regla del **diario de cambios obligatorio** (`documentacion/diario/YYYY/MM/YYYY-MM-DD.md`).
- Enlaces simbólicos `agentes/` y `PROYECTO.md` (no versionados).

### 2.2. Scaffolding y base de datos

- `package.json` (`type: module`; scripts `start`, `dev`, `db:migrate`, `db:seed`, `test:email`); `config/index.js`; `.env.example`.
- `db/schema.sql`: tablas `users` (con `email_verified`), `verification_codes`, `analyses` (ampliada: `ticker`, `company_name`, `period_end`, `pdf_url`), `filings`, `watchlists` + `watchlist_items`, `portfolio_transactions`; migración de `favorites` → lista por defecto.
- Repositorios: `analysisRepository`, `userRepository`, `watchlistRepository`, `portfolioRepository`.
- `seed.js` idempotente (usuario demo + 3 análisis con report provisional).

### 2.3. Autenticación (Fase 3, completa)

**Backend**: `auth.service.js` (register con código 6 dígitos SHA-256 15 min/5 intentos; verify; resend; login con 403 `EMAIL_NOT_VERIFIED`; forgot/reset password; `AuthError`; `toPublicUser`), `email.service.js` (nodemailer SMTP, `MAIL_TO_OVERRIDE`, fallback consola, `sendVerificationCode`/`sendPasswordResetCode`), `auth.controller.js` (cookie JWT 7 días), `auth.routes.js` (8 rutas), middleware `requireAuth` + `resolveUser` (opcional), `errorHandler`, `utils/validate.js`, `scripts/test-email.js`.

**Frontend**: `auth.js` con modal de 5 pantallas (login, registro, verificación, reset 1 y 2), `renderAuth`, chip de usuario, evento `auth:change`, `openModal` expuesto en `window` (fix), validaciones cliente.

**Configuración real**: SMTP de Gmail configurado con contraseña de aplicación; `MAIL_TO_OVERRIDE` para pruebas; envíos reales verificados.

### 2.4. Sistema de agentes IA y pipeline

- Capa de modelos: `modelProvider.js` con `chat` y **`chatJson` (reintentos)**; proveedores **`deepseek`** (activo), **`opencode-go`** (alias `opencode`) y `mock`; `AI_MAX_TOKENS=16000`; `AI_REQUEST_TIMEOUT_MS=180000`.
- Agentes: `originAgent` (financiero + EE. UU. + 10-Q/10-K), `sectorAgent` (consumo defensivo, rechazo seguro), **`analystAgent`** (2 fases: extracción de cifras JSON + informe estructurado con `prompts/consumo-defensivo.md`; ventana financiera `buildAnalysisText`; validación `horizons`).
- `analysis.service.js`: `analyzePdf`/`analyzeText`/`htmlToText`; pipeline completo; `saveAnalysis` no bloqueante (status done, ticker, company, period_end, pdf_url, report, model_used).
- `report.service.js`: PDF con pdfkit (cabecera, 2 horizontes, bloques VENTAS/CASH FLOW/ASIGNACIÓN DE CAPITAL, notas, paginación); `GET /api/reports/:file`.
- Decisión: **DeepSeek directo** como proveedor activo (22–23 s, 4/4 JSON válidos; OpenCode Go 145–247 s intermitente — comparativa medida).

### 2.5. Frontend general (dos páginas)

- **Inicio** (`index.html` + `app.js`): buscador real del topbar (debounce 250 ms, logos con fallback de inicial), hero con logo + insignia Beta, tarjetas de empresas destacadas, subida de PDF con panel de agentes (cronómetro mm:ss, avisos 45 s/240 s), resultado con informe + descarga, **histórico "Mis análisis"** con filtros, secciones "Acciones en seguimiento" y "Cartera", modal de auth, toasts.
- **Empresa** (`empresa.html` + `empresa.js`, ruta `GET /empresa/:ticker` validada): menú lateral en 2 bloques (fijos + cabecera de empresa + apartados), cabecera con logo real y ojo de seguimiento, cotización clicable, perfil (tarjeta Informe, gráfico de precios, información, descripción), informes trimestrales, datos financieros, panel de cartera; drawer en móvil.
- Rutas absolutas de assets (fix: `/empresa/styles.css` capturado por la ruta dinámica).

### 2.6. Cribador (screener) con datos de la SEC

- `edgar.service.js`: búsqueda (ticker→CIK), `companyfacts` (caché 6 h), `buildSeries` en fases (frames → fallback anual por fecha de fin → instantáneos a anuales → dei → Q4 derivado → `cashBeginning` respaldo; `periodEnd` moda), `pickConceptData` **fusiona tags por frame** + conceptos combinados, catálogo `STATEMENTS` (income ~53 / balance ~58 / cashflow ~46 filas) con `emphasis`, `tone: 'negative'`, formatos `money|perShare|shares|count`, valores derivados y normalización de signos (incl. inversión de `IncreaseDecreaseInOperatingCapital`).
- **Rescate sin huecos**: `getExtensionFacts`/`mergeInstanceFacts` desde las instancias `*_htm.xml` (8 10-K + 8 10-Q, 5 en paralelo, caché 24 h, solo si falta algo): tags exactos, `INSTANCE_ONLY_TAGS`, patrones `CONCEPT_EXTENSION` con exclusión de ruido, `aggregateSegmentedInstants`, `rederiveCashValues`; reintentos 429.
- **Perfil**: `buildCompanyProfile` (market de Yahoo + metrics + info + description), `getCompanySector` (SIC → español).
- **Filings**: `getCompanyFilings` (submissions, 40), `getFilingDocumentStream`/`getFilingPdfPath` (PDF real vía `index.json` o generado con Chrome headless con UA declarado; fallback HTML), `getFilingPreview` (pdftoppm 100 DPI), `getFilingContentBuffer` (pdf/html), `getFilingIndexItems` reutilizable.
- `market.service.js`: `getChartSeries` (rangos + **MA100 diaria**), `getMarketQuote` (caché 60 s), `getMarketProfile` (beta vs SPY, dividendo TTM, OPV), `getDividendHistory` (tramos de 5 años, caché 24 h).
- `screener.routes.js`: 8 endpoints (search, company, chart, filings, document, preview, preview/pages, analyze); `resolveUser` → `authenticated`; bloqueo PRO gestionado en el frontend.
- Fix crítico: timeout cancelado al recibir cabeceras + manejo de errores del stream (ya no tumba el proceso Node).

### 2.7. Favoritos → Listas de seguimiento (watchlists)

- Tablas `watchlists` + `watchlist_items`; migración de `favorites` (copia a "Favoritos" + DROP).
- `watchlistRepository.js` (ensureDefaultWatchlist perezosa, listado con `json_agg`, CRUD, upsert de items, `removeItemFromAllLists`) y `watchlists.routes.js` (7 endpoints con `requireAuth`; nombre 1–40, 409 duplicado, por defecto inmutable, resolución de nombre en EDGAR).
- `public/watchlists.js`: módulo compartido `Watchlists` (estado + `watchlists:change`), popover con checkmarks (creación inline, borrado de 2 pasos, cierre robusto con scroll preservado), sección montable (`mountSection`) con chips + tabla estilo Investing; integrado en Inicio y Empresa (ojo de seguimiento con estado activo).

### 2.8. Cartera de inversión (portfolio)

- Tabla `portfolio_transactions` (sin tabla de estado: se reconstruye).
- `portfolio.service.js`: `buildState` FIFO (lotes por compra, ventas contra los lotes más antiguos, `realizedGross` por venta), `addBuy`/`addSell` (validación de disponibilidad `NOT_ENOUGH_SHARES`), `removeTransaction` (protección `INVALID_STATE`), `getPortfolio` (dividendos por porción de lote con fechas reales de pago, sector SIC, cotización, 6 columnas de rentabilidad por posición, summary, alocaciones por empresa/sector, `realizedGain` por venta).
- `portfolioRepository.js` (fechas ISO local), `portfolio.routes.js` (GET/POST/DELETE con validaciones).
- `public/portfolio.js`: módulo `Portfolio` (resumen 6 tarjetas, tabla de posiciones, donuts SVG por empresa/sector, historial de operaciones con borrado, formulario compra/venta con autocompletar EDGAR); sección `#cartera` en Inicio y panel en Empresa (posición + formulario prefijado + `/?cartera=1`).
- Decisiones de producto: FIFO, sin comisiones, una cartera por usuario, dividendos estimados por fecha real de pago.

### 2.9. Histórico de análisis por usuario

- Columnas `ticker`, `company_name`, `period_end`, `pdf_url` en `analyses` + índices; `analysisRepository.listAnalyses` con filtros (ILIKE por empresa; `period_*`; `created_*` en UTC).
- `analystAgent` incluye `reportingPeriod`; `analysis.service.js` guarda tras el pipeline (`saved`).
- `GET /api/analyses` (requireAuth) con `periodTitle`; `POST /api/upload` y `POST .../analyze` responden `saved`.
- Frontend: sección "Mis análisis" con filtros (empresa, tipo de fecha resultados/análisis, desde/hasta, Limpiar), tabla real y apertura del PDF; CTA de login; refresh tras análisis; fix `openModal` en `auth.js`.

### 2.10. Mejoras del cribador en pantalla (frontend)

- **Cotización clicable** → abre el gráfico de Precio a pantalla completa (`toggleFullscreen` reutilizable).
- **Gráfico de métricas interactivo**: clic en fila → barras/líneas con doble escala, paleta de 16 colores, tooltip, **CAGR como línea negra + caja arrastrable** (media anual lineal si hay cambio de signo; "—" solo si el inicial es 0).
- **Control de historial por años** (doble asa): filtra tabla + gráfico; derivados sobre el historial completo.
- **Rojo por naturaleza**: `tone: 'negative'` pinta en rojo costes/gastos/salidas aunque sean positivos; negativos en paréntesis.
- **Bloqueo PRO sin sesión** (6 anuales + 4 trimestrales; recarga en silencio al cambiar de sesión).
- **Filings**: preview por imágenes en modal, descarga, botón "Analizar con IA" → `/?analizar=...`.

### 2.11. Otros arreglos y decisiones relevantes

- Fix modal `[hidden] { display: none !important; }`.
- Fix descarga del PDF del análisis (`currentPdfUrl`).
- Fix valores "—" del screener (4 causas: tags únicos, filas duplicadas por fallback FY, Q4-only con `fp=FY`, Q4 sin frames) — 19 tickers verificados sin huecos.
- Fix SEC bloqueaba Chrome headless (User-Agent declarado).
- Fix crash del servidor al hacer streaming (timeout cancelado al recibir cabeceras).
- Comparativa de proveedores IA (DeepSeek vs OpenCode Go) documentada.

---

## 3. Cómo se ejecuta

```bash
# Requisitos: Node ≥ 20.6, PostgreSQL 16, Google Chrome y poppler-utils (pdftoppm) para filings
cp .env.example .env          # y edita credenciales (BD, JWT_SECRET, SMTP_*, AI_PROVIDER...)
npm install
npm run db:migrate            # crea las tablas (+ migración de favoritos)
npm run db:seed               # (opcional) datos demo
npm run dev                   # servidor en http://localhost:3000
npm run test:email            # prueba el envío de correos
```

Endpoints disponibles:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servicio |
| POST | `/api/auth/register` · `/verify` · `/resend-code` | Registro + verificación de correo |
| POST | `/api/auth/login` · `/logout` | Sesión (403 `EMAIL_NOT_VERIFIED` sin verificar) |
| GET | `/api/auth/me` | Usuario actual |
| POST | `/api/auth/forgot-password` · `/reset-password` | Recuperación de contraseña |
| POST | `/api/upload` | PDF → pipeline completo (origen + sector + analista + PDF) |
| GET | `/api/analyses` | Histórico por usuario con filtros (requireAuth) |
| GET | `/api/reports/:file` | PDF del informe generado |
| GET | `/api/screener/search?q=` | Búsqueda en EDGAR |
| GET | `/api/screener/company/:ticker` | Series + statements + perfil |
| GET | `/api/screener/company/:ticker/chart` | Precios + MA100 |
| GET | `/api/screener/company/:ticker/filings` | Histórico 10-Q/10-K |
| GET | `.../filings/:accession/document` | Documento (PDF/HTML; `download=1`) |
| GET | `.../filings/:accession/preview` y `/pages/:page` | Preview por páginas |
| POST | `.../filings/:accession/analyze` | Analizar el filing |
| GET/POST/PATCH/DELETE | `/api/watchlists...` | Listas de seguimiento (requireAuth) |
| GET/POST/DELETE | `/api/portfolio...` | Cartera (requireAuth) |
| GET | `/empresa/:ticker` | Página de empresa (HTML) |

---

## 4. Decisiones técnicas tomadas (y por qué)

| Decisión | Detalle |
|---|---|
| **PostgreSQL nativo local** | Sin Docker; solo `DATABASE_URL`. |
| **Sesión JWT en cookie httpOnly** | Sin tablas de sesión; menos superficie XSS; 7 días, SameSite=Lax. |
| **bcryptjs** | Puro JS, sin compilación nativa. |
| **Errores 401 genéricos + forgot-password sin filtrar** | Evita enumeración de cuentas. |
| **`--env-file=.env` de Node** | Sin dotenv. |
| **Repositorios como única capa SQL** | Facilita cambios de BD. |
| **DeepSeek directo (AI_PROVIDER=deepseek)** | 22–23 s y fiable frente a OpenCode Go (intermitente). |
| **`chatJson` con reintentos + timeout 180 s + `AI_MAX_TOKENS=16000`** | Absorbe fallos del modelo; nunca queda colgado; el informe no se trunca. |
| **Analista en 2 fases** | Extracción JSON → estructuración con reglas del sector: informes fiables y validables. |
| **Rescate desde instancias XBRL** | `companyfacts` no expone tags de extensión; sin él, líneas en "—" para siempre. Solo si falta algo. |
| **PDF de filings con Chrome (UA declarado) + preview con pdftoppm** | Los filings modernos no traen PDF; la SEC bloquea headless sin UA; el visor PDF no renderiza en iframes. |
| **FIFO en la cartera** | Estándar de brokers; confirmado por el usuario (pidió "FILO"). |
| **Estado de cartera reconstruido de las transacciones** | Sin redundancia; consistencia garantizada. |
| **Listas de seguimiento multi-lista** | Sustituyen a los favoritos con migración automática. |
| **Diseño clon de TIKR** | Decisión del usuario (topbar oscura + panel claro + datos). |

---

## 5. Pendiente (próximos pasos)

1. **Fase 4**: análisis completo de empresa (multi-periodo) usando el histórico de filings ya implementado.
2. **Fase 5**: suscripciones y planes (campo `plan` existe; el proveedor de IA se elegirá por plan; el bloqueo PRO del cribador es el primer límite real).
3. **Fase 6**: nuevos países y sectores (agentes + prompts).
4. Refinar el prompt del analista con los informes de referencia del usuario.
5. Decidir el modelo final a medio plazo (DeepSeek vs OpenCode Go) y el despliegue (VPS vs PaaS).
6. Vista de detalle del análisis dentro de la web (hoy se abre el PDF).
7. Pestañas Ratios y Segmentos del clon TIKR; Valoración y Accionariado (placeholders).
8. Alertas de precio (roadmap) y "iniciar sesión con Google".

---

## 6. Archivos del proyecto (estado actual)

```
app/
├── server.js                     # Express: estáticos + API + /empresa/:ticker + errores
├── package.json                  # Scripts: start, dev, db:migrate, db:seed, test:email
├── config/index.js               # Config centralizada
├── db/
│   ├── schema.sql                # Todas las tablas + migraciones idempotentes
│   ├── migrations.js · seed.js
│   └── repositories/             # analysis, user, watchlist, portfolio
├── src/
│   ├── api/routes/               # auth, analysis, screener, watchlists, portfolio
│   │   └── controllers/auth.controller.js
│   ├── services/                 # auth, email, edgar, market, analysis, pdf, report, portfolio
│   │   └── ai/                   # modelProvider + providers (deepseek, opencode-go, mock)
│   ├── agents/                   # base, registry, origin, sector, analyst + prompts/
│   ├── middleware/               # auth (requireAuth + resolveUser), errorHandler
│   └── utils/validate.js
├── public/                       # index.html, empresa.html, styles.css, app.js, empresa.js, auth.js, watchlists.js, portfolio.js
├── scripts/test-email.js
├── uploads/generated/            # PDFs IA + filings + previews
├── documentacion/                # PROYECTO*.md, ARQUITECTURA.md, IMPLEMENTACION.md
│   ├── backend/funcionalidades/{register, verificacion-informe, screener, listas-seguimiento, cartera, historico-analisis}/
│   ├── frontend/funcionalidades/{idem}/
│   └── diario/YYYY/MM/YYYY-MM-DD.md
├── agentes/ → ~/.config/opencode/agent/   (enlace, no versionado)
└── PROYECTO.md → documentacion/PROYECTO.md (enlace, no versionado)
```
