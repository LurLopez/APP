# Funcionalidad: Cribador de resultados (screener) — Backend

> Capa: **backend** · Fecha: 2026-08-13 (base) · Actualizado: 2026-08-15 · Estado: **implementado y probado con datos reales de la SEC**

---

## 1. Objetivo

Consultar la **API oficial de la SEC (EDGAR)** y Yahoo Finance para: (1) buscar empresas por ticker o nombre, (2) obtener sus resultados financieros (10-Q / 10-K) como series anuales y trimestrales de **3 estados financieros completos** con el catálogo de líneas de TIKR, (3) construir el **perfil de la empresa** (cotización, métricas, información), (4) el **gráfico de cotización** con media móvil, y (5) el **histórico de filings** (10-Q/10-K) con documento, vista previa por páginas y análisis con IA. Es el motor de datos del "Cribador de resultados", de la página de empresa y de la búsqueda del topbar.

## 2. Alcance

**Incluido:**
- `GET /api/screener/search?q=` — búsqueda de empresas por ticker o nombre (máx. 8 resultados).
- `GET /api/screener/company/:ticker` — series financieras anuales (10) y trimestrales (8) con catálogo `statements` y **perfil** (`profile` con market, metrics, info, description).
- `GET /api/screener/company/:ticker/chart?range=&ma=` — serie de precios de Yahoo (3M/6M/1Y/3Y/5Y/10Y/ALL) con media móvil de 100 sesiones opcional.
- `GET /api/screener/company/:ticker/filings` — histórico de 10-Q/10-K (submissions de EDGAR, límite 40).
- `GET .../filings/:accession/document` — documento (PDF real de la SEC, PDF generado con Chrome o HTML original) con `?download=1`.
- `GET .../filings/:accession/preview` y `.../preview/pages/:page` — vista previa por imágenes (pdftoppm, 100 DPI).
- `POST .../filings/:accession/analyze` — analiza el filing con el pipeline de IA (misma regla que la subida manual).
- **Rescate de datos faltantes**: instancias XBRL de los filings (`*_htm.xml`) para tags de extensión y conceptos que `companyfacts` no expone; re-derivación de cash; reintentos ante 429.
- **Bloqueo PRO sin sesión**: `getCompanyResults({ authenticated })` marca `authenticated` y el frontend bloquea columnas antiguas.

**Excluido (pendiente):**
- Guardado de filings en la tabla `filings` (sigue preparada y vacía; el histórico se consulta al vuelo).
- Análisis multi-periodo (Fase 4).

## 3. Endpoints

| Método | Ruta | Parámetro | Respuestas |
|---|---|---|---|
| `GET` | `/api/screener/search` | `q` (obligatorio) | 200 · 400 · 502 |
| `GET` | `/api/screener/company/:ticker` | — | 200 `{ ok, authenticated, company, currency, statements, annual, quarterly, profile }` · 400 · 404 · 502 |
| `GET` | `/api/screener/company/:ticker/chart` | `range` (3m/6m/1y/3y/5y/10y/all), `ma` (1) | 200 `{ ok, range, currency, points, maPoints?, source }` · 400 · 502 |
| `GET` | `/api/screener/company/:ticker/filings` | — | 200 `{ ok, company, filings }` · 400 · 404 · 502 |
| `GET` | `.../filings/:accession/document` | `download=1` (adjunto) | 200 (stream PDF/HTML) · 400 · 404 `FILING_NOT_FOUND` · 502 |
| `GET` | `.../filings/:accession/preview` | — | 200 `{ ok, filename, pages }` · 400 · 404 · 502 `PREVIEW_UNAVAILABLE` |
| `GET` | `.../filings/:accession/preview/pages/:page` | — | 200 `image/png` · 400 · 404 `PAGE_NOT_FOUND` |
| `POST` | `.../filings/:accession/analyze` | — | 200 (mismo JSON que `/api/upload`) · 400 · 404 · 422 · 502 |

Validaciones: ticker `^[A-Z0-9.-]{1,10}$`, accession `^\d{10}-\d{2}-\d{6}$`, página `^\d{1,4}$`. `/company/:ticker` resuelve la sesión con `resolveUser` (autenticación opcional) y devuelve `authenticated`.

### Errores

Siempre JSON `{ "error": "<mensaje en español>", "code": "<CODIGO>" }`:

| Código | HTTP | Mensaje |
|---|---|---|
| — | 400 | "Falta el parámetro de búsqueda \"q\"." / "Ticker no válido." / "Parámetros no válidos." |
| `COMPANY_NOT_FOUND` | 404 | "No se encontró la empresa \"<ticker>\" en EDGAR." |
| `FILING_NOT_FOUND` | 404 | "Informe no encontrado." |
| `PAGE_NOT_FOUND` | 404 | "Página no encontrada." |
| `EDGAR_UNAVAILABLE` | 502 | "No se pudo consultar EDGAR: <detalle>" |
| `PREVIEW_UNAVAILABLE` | 502 | "No se pudo generar la vista previa: <detalle>" |
| — | 500 | Error interno no controlado |

## 4. Servicio EDGAR (`src/services/edgar.service.js`)

### Fuentes de datos

| Fuente | Uso | Caché (memoria) |
|---|---|---|
| `company_tickers.json` | Tabla ticker → `{ cik, ticker, name }` | 24 h |
| `companyfacts/CIK##########.json` | Facts XBRL us-gaap/dei por periodo | 6 h |
| `submissions/CIK##########.json` | Perfil (SIC, dirección, bolsa) + filings recientes | 6 h |
| Instancias `*_htm.xml` de los filings | Tags de extensión y conceptos que companyfacts no expone | 24 h |
| `index.json` de cada filing | Resolver el PDF real | 24 h |

### Reglas de acceso a la SEC

- **User-Agent obligatorio**: `Cifra contacto@cifra.local` (también en la generación de PDF con Chrome: la SEC bloqueaba `HeadlessChrome/...`).
- `Accept: application/json`, timeouts de 20–45 s; **reintento ante 429** (2 reintentos, 3–4 s de espera) en `fetchSecJson`/`fetchSecText`.
- Límite de la SEC: 10 peticiones/s por IP; las cachés y la concurrencia de 5 en el rescate XBRL lo mantienen controlado.

### Búsqueda (`searchCompanies(query, limit = 8)`)

Normaliza, ordena: **coincidencia exacta de ticker** → **empieza por la consulta** → **contiene en el nombre**; recorta a 8.

### Series financieras (`getCompanyResults(ticker, { authenticated })`)

1. Resuelve la empresa; 2. descarga `companyfacts`; 3. `buildSeries`; 4. añade `profile`; 5. devuelve las series completas (anuales y trimestrales disponibles desde ~2007 en adelante).

### Construcción de series (`buildSeries`) — fases (revisado 2026-08-15)

1. **Filas desde frames**: `CYyyyy` → anual; `CYyyyyQn` → trimestral; `CYyyyyQnI` → trimestral (instante).
2. **Fallback anual**: entradas sin frame con `fp=FY` y duración ≥ 300 días (excluye los Q4-only, que son trimestres de 3 meses reportados con `fp=FY` en los 10-K); se mapean a la fila anual existente por `periodEnd` igual (evita filas duplicadas en ejercicios fiscales no calendario) o se crean con el año fiscal (año del fin, −1 si enero/febrero).
3. **Conceptos instantáneos a las filas anuales**: frames `CYxxxxQxI` y hechos sin frame con `fp=FY`, emparejados por `periodEnd` (resuelve balance anual y cash sin "—").
4. **Conceptos `dei`** (acciones, empleados): fila anual cuyo `periodEnd` es el más reciente no posterior a la fecha del dato.
5. **`periodEnd` = moda** entre conceptos (no el máximo): evita que un concepto raro ensucie la etiqueta de la fila.
6. **Derivación de Q4 trimestral**: si el Q4 fiscal no tiene valor → Q4 = anual − (Q1+Q2+Q3) para flujos (excluye instantáneos, dei y formatos por acción); si los trimestres son acumulados (YTD) → Q4 = anual − Q3; instantáneos → Q4 = anual.
7. **Respaldo de `cashBeginning`**: si no hay tag, se usa el `cashEnding` del periodo anterior.

### Selector de conceptos (`pickConceptData`)

- **Fusión por frame**: entre tags candidatos se queda con el dato más recientemente presentado **por frame** y **fusiona** todos los tags (antes elegía uno solo, perdiendo años de tags antiguos cuando la empresa migra, ej. KHC 2012→2016).
- **Conceptos combinados** (`combine`): suma por frame dos tags (ej. intangibles finite + indefinite), deduplicando restatement por frame.
- Sin datos para ningún tag → la partida no aparece (el frontend pinta "—").

### Rescate generalizado de datos desde las instancias XBRL

`companyfacts` **excluye los namespaces de extensión** (tags propios de la compañía, ej. KO) y omite algunos conceptos. Para cubrir huecos ("—"):

- `getExtensionFacts` descarga las instancias `*_htm.xml` de los últimos 8 10-K y 8 10-Q (5 en paralelo, reintento 429, caché 24 h) y `mergeInstanceFacts` rellena los conceptos que falten:
  - **Tag exacto** (`conceptByTag`); **tags solo-instancia** (`INSTANCE_ONLY_TAGS`, ej. cash con restricted); **patrones semánticos** (`CONCEPT_EXTENSION`, ej. adquisiciones/desinversiones/inversiones) con exclusión de ruido (`EXTENSION_EXCLUDED`: disposalgroup, stepacquisition, OCI, captive...).
  - Anual = duración ≥ 300 días; trimestral = hecho corto directo (≤ 110 días) o acumulado YTD − acumulado del fin anterior del mismo año fiscal (≤ 370 días).
- `aggregateSegmentedInstants`: suma hechos instantáneos por segmentos (excluyendo Total/All y los que tienen versión consolidada) — KO pensiones 785M = 681+104.
- `rederiveCashValues`: recalcula cashEnding/cashBeginning/cashAndShortTermInvestments/netDebt tras el rescate.
- El rescate **solo se dispara si el tag estándar no aporta valor** (evita peticiones extra en empresas normales).

### Valores derivados por fila

Resultados: beneficio bruto, gastos operativos, beneficio operativo ajustado (`operatingIncomeAdjusted = pretaxIncome + netInterestExpense`), margen operativo ajustado (`operatingIncomeAdjustedMargin`), EBT incl. extraordinarios, EBITDA/EBITDAR, neto a acciones comunes. Balance: efectivo e inversiones a CP, cuentas por cobrar, inmovilizado neto, pasivo/fondos propios, valor contable (tangible), deuda total/neto. Cash flow: CFI/CFF, variación neta, FCF, saldos, flujo por acción. Normalización de signos (`negative: true`, `tone: 'negative'`, `invertSign: true` para ganancias que se restan en la conciliación; `IncreaseDecreaseInOperatingCapital` invertido).

### Catálogo `STATEMENTS` (alineado con las capturas de TIKR)

- **`income`**: ~53 filas (ingresos, desglose de gastos, intereses/inversiones, extraordinarios, beneficio atribuible, BPA, dividendos, EBITDA/EBITDAR, tasa efectiva...).
- **`balance`**: ~58 filas (circulante detallado, inmovilizado bruto/depreciación/neto, impuestos diferidos, deuda/arrendamientos, patrimonio, valor contable, deuda neta, datos físicos...).
- **`cashflow`**: ~46 filas (ajustes operativos, detalle de inversión/financiación, divisas, FCF, saldos de caja, métricas por acción...).
- Partidas de total con `emphasis: true`; formatos `money`/`perShare`/`shares`/`count`; `tone: 'negative'` en costes, gastos, salidas de caja y partidas contra fondos propios. `publicStatements()` exporta el catálogo.

### Perfil de empresa (`buildCompanyProfile`)

Combina EDGAR + Yahoo (`getMarketProfile`):
- **market**: cotización, variación diaria/anual, rango 52 semanas, volumen, dividendo por acción y yield, beta, fecha OPV, sparkline.
- **metrics**: marketCap (precio × acciones reportadas), week52, beta, dividendos, revenue, BPA, PER (si BPA > 0), acciones, yearChange, ipoDate.
- **info**: país (submissions), **sector** (SIC → español), industria traducida, bolsa, fin de ejercicio fiscal, dirección, último filing (formType + periodo + fecha).
- **description**: frase generada (cotización en bolsa, clasificación SEC, domicilio).
- **`getCompanySector(ticker)`**: SIC → sector amplio en español (consumo defensivo, alimentación y bebidas, tabaco, química y farmacéutica, resto por decenas SIC) — usado también por la cartera.

### Filings (`getCompanyFilings`)

- `submissions.filings.recent` normalizado (formato columnar de la SEC → array de objetos), filtrado a 10-Q/10-K con accession y documento primario, límite 40.
- Por filing: `formType`, `period` (reportDate), `periodLabel` (Q2 2026 / FY 2025), `filedAt`, `accession`, `documentUrl` (SEC), `documentName` (`tap-q-2026.pdf` / `tap-q-2026.htm`).

### Documento (`getFilingDocumentStream` / `getFilingPdfPath` / `getFilingContentBuffer`)

1. Busca un **PDF real** en el filing vía `index.json` (empareja por nombre del documento primario; fallback al PDF más largo).
2. Si no existe (los 10-Q/10-K modernos son HTML/XBRL), **genera el PDF con `google-chrome --headless --print-to-pdf`** (binario `CHROME_BIN`, con `--user-agent="Cifra contacto@cifra.local"`), guardado en `uploads/generated/filings/` con caché permanente.
3. Fallback: sirve el HTML original (`text/html`).
- `getFilingContentBuffer` devuelve `{ filing, buffer, kind: 'pdf' | 'html' }` para el analizador.
- El streaming cancela el timeout al recibir cabeceras (fix: antes abortaba a mitad y tumbaba el proceso Node) y maneja errores del stream (502 o corte limpio).

### Vista previa (`getFilingPreview`)

- Renderiza el PDF a PNG por página con **`pdftoppm`** (100 DPI configurable con `PREVIEW_DPI`), caché permanente en `uploads/generated/filings/previews/{accession}/`. Devuelve `{ filename, pages }`; errores → `PREVIEW_UNAVAILABLE`.

## 5. Servicio de mercado (`src/services/market.service.js`)

- `getChartSeries(ticker, range, withMovingAverage)`: rangos 3M/6M (1d), 1Y (1d), 3Y/5Y (1wk), 10Y/ALL (1mo); caché 5 min. **MA 100**: se pide la serie **diaria** para el mismo rango y se calcula la media de 100 cierres diarios (la serie semanal/mensual promediaba 100 semanas/meses — corregido); ante fallo devuelve `maPoints: []`.
- `getMarketQuote(ticker)`: último precio, apertura, máx/mín, var., %, volumen, hora y estado de mercado (caché 60 s; recupera de las velas lo que falte en meta).
- `getMarketProfile(ticker)`: perfil completo con beta (vs SPY, ajustado), dividendo TTM, rango 52 semanas, OPV, sparkline (caché 5 min).
- `getDividendHistory(ticker, { from })`: eventos de dividendos por **tramos de 5 años** (Yahoo trunca con `range=max`), caché 24 h (usado por la cartera).
- Timeouts de 8 s y User-Agent declarado.

## 6. Errores y casos límite

| Caso | Respuesta |
|---|---|
| `q` vacío / ticker inválido / parámetros inválidos | 400 |
| Ticker inexistente en EDGAR | 404 `COMPANY_NOT_FOUND` |
| Filing/accession inexistente | 404 `FILING_NOT_FOUND` |
| Página de preview inexistente | 404 `PAGE_NOT_FOUND` |
| SEC caída, timeout, 429 agotado | 502 `EDGAR_UNAVAILABLE` |
| pdftoppm falla | 502 `PREVIEW_UNAVAILABLE` |
| Empresa sin conceptos en un periodo | Fila con huecos → "—" en el frontend |
| Tag de extensión de la compañía (KO) | Rescatado desde la instancia XBRL (adquisiciones, desinversiones, pensiones...) |
| Año fiscal ≠ año natural (PG cierra en junio) | Alineación por fecha de fin y `periodEnd` |
| 10-K reexpresado sin frames (KO 2025) | Completado con entradas `fp=FY` por fecha de fin |
| Q4 sin frame de la SEC (KHC 2025-Q4) | Derivado: anual − Q1−Q2−Q3 |
| `cashBeginning` sin tag | Respaldo con el `cashEnding` del periodo anterior |
| Intangibles finite + indefinite (PEP) | Concepto combinado |
| CAPEX con tag alternativo (PEP) | Fallback `PaymentsToAcquireProductiveAssets` |
| Pérdidas (TAP) | Negativos tal cual; el frontend los pinta en rojo/paréntesis |
| Bloqueo PRO sin sesión | La API devuelve siempre 10 años/8 trimestres + `authenticated`; el frontend bloquea las columnas antiguas |

## 7. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `src/services/edgar.service.js` | Toda la lógica EDGAR: búsqueda, facts, series (buildSeries), rescate XBRL, perfil, sector, filings, documento/preview, errores con código. |
| `src/services/market.service.js` | Yahoo Finance: chart con MA100, quote, profile, dividendos. |
| `src/api/routes/screener.routes.js` | 8 endpoints con validaciones y mapeo de errores; streaming del documento; preview por páginas; `POST .../analyze`. |
| `src/middleware/auth.middleware.js` | `resolveUser` (opcional) para `authenticated`. |
| `server.js` | Monta el router en `/api/screener` y la ruta `GET /empresa/:ticker` (página de empresa). |

Sin dependencias npm nuevas (fetch nativo; Chrome y pdftoppm como binarios externos).

## 8. Decisiones y motivos

| Decisión | Motivo |
|---|---|
| **Catálogo TIKR ampliado** | Replica las filas visibles en las capturas del usuario (resultados, balance, cash flow). |
| **`emphasis` / `tone` / formatos** | El frontend distingue totales (crema/negrita) y naturaleza (rojo) y formatea sin conocer el contenido. |
| **Fusión de tags por frame (`pickConceptData`)** | Si la empresa cambia de tag, se conservan todos los años (antes desaparecían los del tag antiguo). |
| **`buildSeries` en fases con `periodEnd` moda** | Elimina filas duplicadas, Q4 erróneos y etiquetas sucias en años fiscales no calendario. |
| **Rescate desde instancias XBRL** | `companyfacts` no expone tags de extensión; sin esto, muchas líneas de KO y otras quedaban en "—" para siempre. Solo se dispara si falta algo (evita 36 peticiones extra por empresa). |
| **Ponderación por clases de acciones (`scoreMember`)** | Empresas con múltiples clases de acciones (ej. Constellation Brands `STZ`, Berkshire Hathaway `BRK-B`) reportan sus acciones en circulación y BPA bajo dimensiones XBRL (`StatementClassOfStockAxis`). `mergeInstanceFacts` prioriza la clase principal de la acción cotizada (`CommonClassAMember` o `Class B` para tickers `-B`), evitando descartar métricas per-share y acciones diluidas. |
| **Aislamiento de frames 10-Q en series anuales** | En `buildSeries`, entradas con frames trailing (ej. `CY2026`) procedentes de 10-Q intermedios no crean ni contaminan filas del año fiscal anual. Se filtran también filas con `periodEnd === null`. |
| **Normalización de deterioros e inversiones (`InvestmentIncomeNet`, `OtherAssetImpairmentCharges`)** | En empresas con ajustes no operativos o deterioros masivos de participadas (ej. la inversión en Canopy Growth de Constellation Brands `STZ`), los deterioros se reportan bajo `InvestmentIncomeNet` o `OtherAssetImpairmentCharges`. Se integraron y combinaron en `gainLossOnInvestments` y `assetImpairment`, permitiendo que el beneficio ajustado normalice las pérdidas extraordinarias ($2.04B en 2023, $1.64B en 2022) y el BPA normalizado refleje la capacidad real operativa (~10-12 $ en lugar de 1,44 $). |
| **Propagación de acciones y continuidad TTM (`propagateMissingShares`, `pointInTimeSnapshot`)** | Rellena el número de acciones diluidas en trimestres históricos a partir de los 10-K auditados o trimestres adyacentes para permitir el cálculo de BPA y BPA normalizado en ventanas rodantes de 4 trimestres. Además, `pointInTimeSnapshot` calcula el TTM a partir de los beneficios netos acumulados y aplica propagación hacia adelante/atrás para evitar huecos (`null`) en el gráfico de valoración por sesión. |
| **Mapa de excepciones de CIK y formato ticker** | Resuelve tickers con holding recién constituido en la SEC (ej. `XOM` mapeado a CIK 34088) y normaliza tickers con punto/guión (`BRK.B` / `BRK-B`, `BF.B` / `BF-B`). |
| **PDF real o generado con Chrome (con UA)** | Los filings modernos no traen PDF; la SEC bloqueaba a Chrome headless sin User-Agent declarado. |
| **Preview con pdftoppm** | El visor PDF de Chrome dentro de iframe no renderiza; las imágenes funcionan en cualquier navegador. |
| **Timeout cancelado al recibir cabeceras** | Un fallo a mitad del streaming ya no tumba el proceso Node. |
| **`authenticated` + bloqueo PRO en el frontend** | El límite de la beta se aplica en UI sin recortar los datos (la API devuelve todo). |

## 9. Pruebas realizadas (datos reales)

- Búsquedas `ko`/`coca`; 404 ticker inexistente; 400 sin `q`.
- **STZ (Constellation Brands)**: Rescate completo de acciones diluidas (172,4 M), BPA diluido (9,61 $), BPA normalizado (10,92 $), FCF/acc (10,64 $), EV (32,74 B $), EV/EBITDA (9,84x), PER normalizado (11,85x), P/FCF (12,16x), Dividendo/acc (4,08 $), Yield (3,15 %), Payout ajustado (37,36 %) y serie de múltiplos histórica a 5 años (1254 puntos sin huecos).
- **Pruebas multi-sectoriales**:
  - *Consumo defensivo y bebidas*: STZ (EV/EBITDA 9,8x, PER 11,8x), KO (25,0x, 26,7x), PEP (11,7x, 15,6x), TAP (6,2x, 6,5x), KHC (9,1x, 10,3x).
  - *Tecnología*: AAPL (28,7x, 37,4x), MSFT (18,4x, 28,8x), NVDA (27,1x, 32,6x), GOOGL (24,2x, 16,9x).
  - *Consumo discrecional / E-commerce*: AMZN (16,8x, 20,3x, sin fila anual 2026 prematura).
  - *Financiero / Conglomerado*: BRK-B (5,1x, 40,0x con BPA Clase B de 31,04 $).
  - *Salud / Farmacia*: JNJ (20,4x, 27,6x).
  - *Industrial*: CAT (25,2x, 32,9x).
  - *Energía*: XOM (10,9x, 28,8x con CIK 34088 consolidado), CVX (8,57x), COP (7,29x), SLB (12,17x).
- **KO**: FY2025 ingresos 47.941 M$, B. neto 13.107 M$, BPA 3,04 $, activo 104.816 M$, pretax 15.998 M$, reservas 80.382 M$, autocartera 56.423 M$, variación neta de caja −478 M$; cash anual 10,27B, cashBeginning 10,75B; **adquisiciones −461 M$ y desinversiones 3.567 M$ rescatadas del XBRL**; pensiones 785 M$ (segmentos); trimestral con resta YTD correcta.
- **19 tickers de consumo defensivo** (KHC, WMT, KO, PG, PM, COST, TGT, CL, GIS, MDLZ, PEP, HRL, SYY, KR, MKC, SJM, CPB, HSY, MCD): 0 filas anuales con valores faltantes y 0 Q4 fiscales faltantes (excepto per-share no derivables, "—" a propósito). KHC 2019 revenue 24,9B (antes 6,5B); WMT sin filas duplicadas 2025/2026.
- **PG** (cierre junio) e intangibles agregados; **PEP** combinado finite+indefinite y CAPEX; **TAP** pérdidas y acciones diluidas; TGT/KR sin fx porque sus 10-K no presentan la línea (correcto).
- Perfil: TAP con cotización, capitalización, dividendo y sector; chart con MA100 validada numéricamente contra Yahoo (diferencia 0,0).
- Filings TAP: 40 ordenados, documento PDF (200, application/pdf), preview con 74 páginas (páginas 1/2/74 → 200 image/png), `POST .../analyze` → 200 en 22,8 s con DeepSeek.
- Bloqueo PRO: invitado 6 columnas anuales y 4 trimestrales; con sesión todo completo.

## 10. Relación con otros módulos

- **Frontend**: `empresa.js`/`app.js` consumen todos los endpoints (ver `documentacion/frontend/funcionalidades/screener/`).
- **Análisis IA**: `POST .../analyze` conecta con `analysis.service.js` (regla fundamental).
- **Cartera**: usa `getCompanySector`, `getMarketQuote` y `getDividendHistory`.
- **Watchlists**: `getMarketQuote` para las tablas de listas.
- **Histórico**: el análisis de un filing se guarda en `analyses`.

## 11. Pendientes

- Guardado de filings en la tabla `filings` cuando se decida persistir el histórico.
- Ratios y Segmentos (pestañas placeholder en el clon TIKR; sin fuente en EDGAR por ahora).
- Análisis completo de empresa (Fase 4).
