# Funcionalidad: Cribador de resultados (screener) — Backend

> Capa: **backend** · Fecha: 2026-08-13 · Estado: **implementado y probado con datos reales de la SEC**

---

## 1. Objetivo

Consultar la **API oficial de la SEC (EDGAR)** para: (1) buscar empresas por ticker o nombre, y (2) obtener sus resultados financieros publicados (10-Q / 10-K) como series anuales y trimestrales de **3 estados financieros completos** (cuenta de resultados, balance y cash flow) con las **53 partidas estándar de TIKR**. Es el motor de datos del "Cribador de resultados" de la web y de la búsqueda del topbar.

## 2. Alcance

**Incluido:**
- `GET /api/screener/search?q=` — búsqueda de empresas por ticker o nombre (máx. 8 resultados).
- `GET /api/screener/company/:ticker` — series financieras anuales (últimos 10) y trimestrales (últimos 8) de una empresa, con el catálogo de partidas en `statements` (`{ key, label, format, emphasis }`).
- Caché en memoria de la tabla ticker→CIK (24 h) y de los `companyfacts` XBRL (6 h).
- 3 estados us-gaap con **53 partidas** (`STATEMENTS`, catálogo estándar TIKR): fallbacks de tags, conceptos combinados (`combine`), valores derivados y marcado **`emphasis: true` en las partidas de total**.
- Alineación de periodos por **frame XBRL** y por **fecha de fin** (`fp=FY`), válida para años fiscales no naturales y 10-K reexpresados sin frame.
- Errores controlados con código: `COMPANY_NOT_FOUND` (404) y `EDGAR_UNAVAILABLE` (502).

**Excluido (pendiente):**
- Histórico de filings (lista de 10-Q/10-K publicados con enlace al PDF). El servicio trabaja solo con `companyfacts` agregados, no con el índice de submissions.
- Puerto "Analizar" desde el cribador hacia el pipeline de IA (no depende de este módulo, se conectará en la fase siguiente).
- Guardado de los datos en la tabla `filings` (sigue preparada y vacía).

## 3. Endpoints

| Método | Ruta | Parámetro | Respuestas |
|---|---|---|---|
| `GET` | `/api/screener/search` | query `q` (ticker o nombre, obligatorio) | 200 `{ ok, companies }` · 400 sin `q` · 502 EDGAR caído |
| `GET` | `/api/screener/company/:ticker` | path `ticker` (1–10 caracteres `A-Z0-9.-`) | 200 `{ ok, company, currency, statements, annual, quarterly }` · 400 ticker inválido · 404 no encontrado · 502 EDGAR caído |

### Ejemplos

```bash
# Búsqueda por ticker o nombre
GET /api/screener/search?q=ko
→ 200
{
  "ok": true,
  "companies": [
    { "cik": 21344, "ticker": "KO", "name": "COCA COLA CO" }
  ]
}

# Series de una empresa
GET /api/screener/company/KO
→ 200
{
  "ok": true,
  "company": { "ticker": "KO", "name": "COCA COLA CO", "cik": 21344 },
  "currency": "USD",
  "statements": {
    "income":   [ { "key": "revenue", "label": "Ingresos", "format": "money", "emphasis": false },
                  { "key": "grossProfit", "label": "Beneficio bruto", "format": "money", "emphasis": true },
                  { "key": "epsDiluted", "label": "BPA diluido", "format": "perShare", "emphasis": false },
                  { "key": "weightedSharesDiluted", "label": "Acciones diluidas (millones)", "format": "shares", "emphasis": false }, ... ],
    "balance":  [ { "key": "cash", "label": "Caja y equivalentes", "format": "money", "emphasis": false },
                  { "key": "assets", "label": "Total activo", "format": "money", "emphasis": true }, ... ],
    "cashflow": [ { "key": "cfo", "label": "Cash flow operativo", "format": "money", "emphasis": true },
                  { "key": "netChangeInCash", "label": "Variación neta de caja", "format": "money", "emphasis": true }, ... ]
  },
  "annual": [
    { "period": "2025", "values": { "revenue": 47941000000, "netIncome": 13107000000, "epsDiluted": 3.04, "assets": 104816000000, "liabilities": 72647000000, "assetsNoncurrent": 73772000000, "liabilitiesNoncurrent": 51366000000, ... } },
    ...
  ],
  "quarterly": [
    { "period": "2025-Q4", "values": { ... } },
    ...
  ]
}
```

`statements` describe el catálogo de partidas (clave, etiqueta, formato `money`|`perShare`|`shares` y marcador `emphasis` para las filas de total) para que el frontend pinte la tabla de forma genérica; los valores de cada periodo viven en `values` de `annual`/`quarterly`. `publicStatements()` exporta el catálogo con formato por defecto `money` y `emphasis` siempre booleano.

### Errores

Siempre JSON `{ "error": "<mensaje en español>", "code": "<CODIGO>" }`:

| Código | HTTP | Mensaje |
|---|---|---|
| — | 400 | "Falta el parámetro de búsqueda \"q\"." |
| — | 400 | "Ticker no válido." |
| `COMPANY_NOT_FOUND` | 404 | "No se encontró la empresa \"<ticker>\" en EDGAR." |
| `EDGAR_UNAVAILABLE` | 502 | "No se pudo consultar EDGAR: <detalle>" (timeout, HTTP ≠ 200, red) |
| — | 500 | Error interno no controlado (lo captura el `errorHandler` global) |

## 4. Servicio EDGAR (`src/services/edgar.service.js`)

### Fuentes de datos de la SEC

| Fuente | Uso | Caché (memoria) |
|---|---|---|
| `https://www.sec.gov/files/company_tickers.json` | Tabla ticker → `{ cik, ticker, name }` | 24 h (`TICKER_MAP_TTL`) |
| `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` | Facts XBRL (conceptos us-gaap por periodo) | 6 h por ticker (`FACTS_TTL`) |

### Reglas de acceso a la SEC

- **Cabecera `User-Agent` obligatoria**: `Cifra contacto@cifra.local` (la SEC rechaza peticiones sin User-Agent identificativo).
- `Accept: application/json` y timeout de **20 s** (`AbortSignal.timeout`).
- **Límite de la SEC: 10 peticiones/segundo** por IP. Las cachés de 24 h/6 h mantienen el tráfico real muy por debajo del límite; si se disparara el número de tickers consultados en un día, la caché de facts (6 h) es la primera barrera.

### Búsqueda (`searchCompanies(query, limit = 8)`)

1. Normaliza a mayúsculas + trim; si queda vacío → `[]`.
2. Orden de resultados: **coincidencia exacta de ticker** → **empieza por la consulta** (alfabético) → **contiene en el nombre** (alfabético).
3. Recorta a `limit` (8 por defecto).

### Series financieras (`getCompanyResults(ticker)`)

1. Resuelve la empresa por ticker (si no existe → `COMPANY_NOT_FOUND`).
2. Descarga `companyfacts` (con caché).
3. `buildSeries` recorre las **53 partidas de `STATEMENTS`** (3 estados) y alinea los datos por **frame XBRL**:
   - `CY2025` → fila anual; `CY2025Q3` → fila trimestral; `CY2025Q4I` → fila trimestral (instante de cierre, típico de balances).
   - **Alineación por fecha de fin**: las entradas con `fp = 'FY'` se asocian además a la fila anual del año de su fecha de fin (`end`). Esto coloca bien (a) los balances de cierre fiscal de empresas con **año fiscal distinto del calendario** (p. ej. PG cierra en junio) y (b) los balances de **10-K reexpresados que vienen sin frame** (p. ej. KO, 10-K de 2025).
4. Devuelve **10 periodos anuales** y **8 trimestrales** (los más recientes por `sortKey`).
5. **Valores derivados** por fila (si el tag directo no existe):
   - `grossProfit` = ingresos − coste de ventas;
   - `liabilities` = activo − fondos propios;
   - `assetsNoncurrent` = total activo − activo corriente;
   - `liabilitiesNoncurrent` = total pasivo − pasivo corriente.

### Selector de conceptos (`pickConceptData`)

- Para cada partida, entre sus tags candidatos se elige el que tenga el **dato más reciente** (frame clasificable con mayor `sortKey`), no simplemente el primero con datos.
- **Conceptos combinados** (`combine`): si la partida lo define, se suma por frame el valor de dos tags (p. ej. intangibles = `FiniteLivedIntangibleAssetsNet` + `IndefiniteLivedIntangibleAssetsExcludingGoodwill`). Si existen a la vez suma combinada y tags individuales, gana la que tenga el frame más reciente.
- Una partida sin datos para ningún tag **no aparece** en `values` de ese periodo (el frontend muestra "—").

### Los 3 estados y sus partidas (`STATEMENTS`)

Unidad por defecto **USD**; las BPA en **USD/shares** (formato `perShare`) y las acciones en **millones de acciones** (formato `shares`). Las **partidas de total** llevan `emphasis: true`: el frontend las pinta como filas destacadas (fondo crema, negrita) estilo TIKR.

#### `income` — Cuenta de resultados (15 partidas)

| Clave | Etiqueta | Tags (en orden de fallback) |
|---|---|---|
| `revenue` | Ingresos | `RevenueFromContractWithCustomerExcludingAssessedTax` → `...IncludingAssessedTax` → `Revenues` → `SalesRevenueNet` → `RevenueFromContractWithCustomer` |
| `costOfRevenue` | Coste de ventas | `CostOfRevenue` → `CostOfGoodsAndServicesSold` → `CostOfGoodsSold` |
| `grossProfit` | Beneficio bruto **(emphasis)** | `GrossProfit`; si no existe, **derivado** = ingresos − coste de ventas |
| `sellingGeneralAdmin` | Gastos de venta, generales y administrativos | `SellingGeneralAndAdministrativeExpense` |
| `researchDevelopment` | Investigación y desarrollo | `ResearchAndDevelopmentExpense` |
| `otherIncome` | Otros ingresos (gastos) | `NonoperatingIncomeExpense` → `OtherNonoperatingIncomeExpense` |
| `operatingIncome` | Resultado operativo **(emphasis)** | `OperatingIncomeLoss` |
| `interestExpense` | Gastos por intereses | `InterestExpense` → `InterestExpenseNonoperating` |
| `pretaxIncome` | Resultado antes de impuestos | `IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest` → `...MinorityInterestAndIncomeLossFromEquityMethodInvestments` |
| `incomeTax` | Impuesto sobre beneficios | `IncomeTaxExpenseBenefit` |
| `incomeFromContinuingOps` | Resultado de operaciones continuadas | `IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest` → `IncomeLossFromContinuingOperations` |
| `netIncome` | Beneficio neto **(emphasis)** | `NetIncomeLoss` → `ProfitLoss` |
| `epsDiluted` | BPA diluido | `EarningsPerShareDiluted` (`perShare`) |
| `epsBasic` | BPA básico | `EarningsPerShareBasic` (`perShare`) |
| `weightedSharesDiluted` | Acciones diluidas (millones) | `WeightedAverageNumberOfDilutedSharesOutstanding` (`shares`) |

#### `balance` — Balance (24 partidas)

| Clave | Etiqueta | Tags (en orden de fallback) |
|---|---|---|
| `cash` | Caja y equivalentes | `CashAndCashEquivalentsAtCarryingValue` |
| `shortTermInvestments` | Inversiones a corto plazo | `ShortTermInvestments` → `AvailableForSaleSecuritiesDebtSecuritiesCurrent` |
| `receivables` | Cuentas por cobrar | `AccountsReceivableNetCurrent` |
| `inventory` | Inventario | `InventoryNet` |
| `prepaidExpenses` | Gastos anticipados | `PrepaidExpenseAndOtherAssetsCurrent` |
| `currentAssets` | Activo corriente **(emphasis)** | `AssetsCurrent` |
| `propertyPlantEquipment` | Inmovilizado material | `PropertyPlantAndEquipmentNet` |
| `goodwill` | Fondo de comercio | `Goodwill` |
| `intangibleAssets` | Activos intangibles | **Combinado** (suma por frame): `FiniteLivedIntangibleAssetsNet` + `IndefiniteLivedIntangibleAssetsExcludingGoodwill`. Tags de fallback: `IntangibleAssetsNetExcludingGoodwill` → `FiniteLivedIntangibleAssetsNet` → `IndefiniteLivedTrademarks` |
| `assetsNoncurrent` | Activo no corriente | `AssetsNoncurrent`; si no existe, **derivado** = total activo − activo corriente |
| `assets` | Total activo **(emphasis)** | `Assets` |
| `payables` | Cuentas por pagar | `AccountsPayableCurrent` → `AccountsPayableTradeCurrent` → `AccountsPayableAndAccruedLiabilitiesCurrent` |
| `accruedLiabilities` | Gastos devengados | `AccruedLiabilitiesCurrent` |
| `deferredRevenue` | Ingresos diferidos | `ContractWithCustomerLiabilityCurrent` → `DeferredRevenueCurrent` |
| `longTermDebtCurrent` | Deuda a corto plazo | `LongTermDebtCurrent` → `LongTermDebtAndCapitalLeaseObligationsCurrent` |
| `currentLiabilities` | Pasivo corriente **(emphasis)** | `LiabilitiesCurrent` |
| `longTermDebt` | Deuda a largo plazo | `LongTermDebtNoncurrent` → `LongTermDebtAndCapitalLeaseObligations` → `LongTermDebt` |
| `liabilitiesNoncurrent` | Pasivo no corriente | `LiabilitiesNoncurrent`; si no existe, **derivado** = total pasivo − pasivo corriente |
| `liabilities` | Total pasivo **(emphasis)** | `Liabilities`; si no existe, **derivado** = activo − fondos propios |
| `additionalPaidInCapital` | Capital adicional | `AdditionalPaidInCapital` |
| `retainedEarnings` | Reservas (ganancias retenidas) | `RetainedEarningsAccumulatedDeficit` |
| `treasuryStock` | Autocartera | `TreasuryStockValue` |
| `minorityInterest` | Intereses minoritarios | `MinorityInterest` |
| `equity` | Fondos propios **(emphasis)** | `StockholdersEquity` → `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest` |

#### `cashflow` — Cash flow (14 partidas)

| Clave | Etiqueta | Tags (en orden de fallback) |
|---|---|---|
| `netIncome` | Beneficio neto | `NetIncomeLoss` → `ProfitLoss` |
| `depreciationAmortization` | Depreciación y amortización | `DepreciationDepletionAndAmortization` → `DepreciationAmortizationAndAccretionNet` |
| `stockCompensation` | Retribución en acciones | `ShareBasedCompensation` |
| `workingCapitalChange` | Cambios en el capital circulante | `IncreaseDecreaseInOperatingCapital` |
| `cfo` | Cash flow operativo **(emphasis)** | `NetCashProvidedByUsedInOperatingActivities` → `...ContinuingOperations` |
| `capex` | Inversiones en inmovilizado (CAPEX) | `PaymentsToAcquirePropertyPlantAndEquipment` → `PaymentsToAcquireProductiveAssets` |
| `acquisitions` | Adquisiciones | `PaymentsToAcquireBusinessesNetOfCashAcquired` |
| `cfi` | Cash flow de inversión **(emphasis)** | `NetCashProvidedByUsedInInvestingActivities` → `...ContinuingOperations` |
| `dividendsPaid` | Dividendos pagados | `PaymentsOfDividends` → `PaymentsOfDividendsCommonStock` |
| `buybacks` | Recompra de acciones | `PaymentsForRepurchaseOfCommonStock` |
| `debtIssued` | Emisión de deuda | `ProceedsFromIssuanceOfLongTermDebt` → `ProceedsFromIssuanceOfDebt` |
| `debtPaid` | Amortización de deuda | `RepaymentsOfLongTermDebt` → `RepaymentsOfDebt` → `RepaymentsOfLongTermDebtAndCapitalSecurities` → `RepaymentsOfDebtAndDebtIssuanceCosts` |
| `cff` | Cash flow de financiación **(emphasis)** | `NetCashProvidedByUsedInFinancingActivities` → `...ContinuingOperations` |
| `netChangeInCash` | Variación neta de caja **(emphasis)** | `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect` → `CashAndCashEquivalentsPeriodIncreaseDecrease` |

## 5. Frames XBRL soportados

| Patrón | Significado | Serie |
|---|---|---|
| `CYyyyy` | Acumulado anual completo | anual |
| `CYyyyyQn` | Acumulado/periodo trimestral | trimestral |
| `CYyyyyQnI` | Valor instantáneo a cierre de trimestre (balance) | trimestral |
| `fp=FY` (sin frame) | Dato anual del 10-K; se asigna al año natural de su fecha de fin (`end`) | anual |

Cualquier otro frame (duraciones custom, `Q2YTD`, etc.) se ignora en la clasificación.

> **Nota de cambio**: antes existía una heurística de "copiar el cierre Q4 a la fila anual" para balances. Fallaba en empresas con año fiscal distinto del calendario y en 10-K sin frames; se sustituyó por la alineación por fecha de fin (`fp=FY` → año de `end`).

## 6. Errores y casos límite

| Caso | Respuesta |
|---|---|
| `q` vacío o ausente en `/search` | 400 "Falta el parámetro de búsqueda \"q\"." |
| Ticker con caracteres inválidos o > 10 | 400 "Ticker no válido." |
| Ticker inexistente en EDGAR | 404 `COMPANY_NOT_FOUND` |
| SEC caída, timeout (20 s) o respuesta ≠ 200 | 502 `EDGAR_UNAVAILABLE` con el detalle del fallo |
| Empresa sin conceptos en un periodo | La fila aparece con solo algunos valores; el resto queda `undefined` |
| Empresa con tag solo en ASC 606 (ej. TAP) | Resuelto por el fallback de `revenue` |
| Año fiscal ≠ año natural (ej. PG cierra en junio) | El balance de cierre fiscal se coloca en el año natural correcto por la fecha de fin (`fp=FY`) |
| 10-K reexpresado sin frames de balance (ej. KO 2025) | Los balances anuales se completan con las entradas `fp=FY` por fecha de fin |
| Intangibles publicados por separado (finite + indefinite, ej. PEP) | Resuelto por el concepto **combinado** (suma por frame) |
| Intangibles publicados agregados (ej. PG) | Resuelto por el fallback `IntangibleAssetsNetExcludingGoodwill` |
| CAPEX con tag alternativo (ej. PEP) | Resuelto por el fallback `PaymentsToAcquireProductiveAssets` |
| Empresa con pérdidas (ej. TAP) | Los importes negativos se devuelven tal cual: beneficio neto −2.139,6 M$ y resultado antes de impuestos −2.518 M$ en FY2025 |
| Sin tag de beneficio bruto o de pasivo | **Valores derivados**: ingresos − coste de ventas; activo − fondos propios |
| Sin tag de activo/pasivo no corriente | **Valores derivados**: total activo − activo corriente; total pasivo − pasivo corriente |
| Autocartera (`TreasuryStockValue`) publicada con signo negativo (contra-fondos propios) | Se devuelve tal cual de XBRL; el frontend la muestra entre paréntesis |

## 7. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `src/services/edgar.service.js` | Toda la lógica EDGAR: ticker map, facts, `STATEMENTS` (3 estados, 53 partidas con `emphasis`), selector de conceptos (fallbacks + combinados + derivados), alineación de periodos por frame y fecha de fin, series y errores con código. |
| `src/api/routes/screener.routes.js` | Router `express` con los 2 endpoints; validación de `q` y `ticker`; mapeo de códigos a 404/502. |
| `server.js` | Monta el router en `/api/screener`. |

Sin dependencias npm nuevas (usa `fetch` nativo de Node).

## 8. Decisiones y motivos

| Decisión | Motivo |
|---|---|
| **Catálogo TIKR (53 partidas)** | El rediseño replica las partidas estándar de la terminal TIKR (15 de resultados, 24 de balance, 14 de cash flow) para que el cribador sea comparable con la herramienta de referencia del usuario. |
| **`emphasis` en las partidas de total** | El frontend necesita distinguir los totales (beneficio bruto, operativo, neto, activo/pasivo corriente, totales, cash flows) para pintarlos como filas destacadas sin conocer el contenido de cada estado. |
| **Formato `shares`** | Las acciones diluidas se expresan en millones de acciones, una unidad distinta del dinero y del BPA; el frontend las formatea como número (1 decimal máx.) sin sufijo monetario. |
| **Derivados de no corriente** | Muchas empresas no publican `AssetsNoncurrent`/`LiabilitiesNoncurrent`; derivarlos de los totales y de los corrientes completa el balance estilo TIKR sin huecos. |
| **`companyfacts` en vez del índice de submissions** | Da los datos financieros ya estructurados por frame; suficiente para el cribador sin parsear PDFs. El histórico de filings (10-Q/10-K individuales) necesitará el endpoint de submissions en la fase siguiente. |
| **Fallbacks por concepto** | Las empresas usan tags distintos según el periodo y la normativa contable (ASC 605 vs 606); sin fallbacks aparecerían huecos falsos. |
| **Selector por dato más reciente (`pickConceptData`)** | Entre tags candidatos gana el de frame más reciente, no el primero con datos; evita rellenar con series antiguas cuando la empresa migra de tag. |
| **Conceptos combinados (`combine`)** | Muchas empresas publican los intangibles en dos tags (finite + indefinite); sin la suma por frame quedarían incompletos. |
| **Alineación por fecha de fin (`fp=FY`)** | Los balances anuales llegan de dos formas: frame instantáneo de cierre o entrada `fp=FY` sin frame. La heurística anterior (copiar Q4 → anual) fallaba con años fiscales no naturales y 10-K reexpresados; asociar por `end` resuelve ambos casos. |
| **Cachés 24 h / 6 h en memoria** | El mapa ticker→CIK cambia muy poco; los facts cambian por trimestre. Evita superar el límite de la SEC y acelera las respuestas. |
| **Códigos de error estables** | El frontend y futuras fases pueden reaccionar por código (`COMPANY_NOT_FOUND`, `EDGAR_UNAVAILABLE`). |
| **Sin guardado en BD en esta fase** | El cribador es de consulta al vuelo; `filings` se rellenará cuando se implemente el histórico de filings. |

## 9. Pruebas realizadas (datos reales)

| # | Caso | Resultado |
|---|---|---|
| 1 | `search?q=ko` | 200 con KO (COCA COLA CO, CIK 21344) entre los resultados |
| 2 | `search?q=coca` | 200 con resultados por nombre |
| 3 | `company/KO` | 200: FY2025 ingresos 47.941 M$, B. neto 13.107 M$, BPA 3,04 $, activo 104.816 M$; **resultado antes de impuestos 15.998 M$**, **reservas 80.382 M$**, **autocartera 56.423 M$**, **variación neta de caja −478 M$**. Derivados: **pasivo 72.647 M$** (= activo − fondos propios, 10-K reexpresado sin frame de balance), **activo no corriente 73.772 M$** (= activo − corriente) y **pasivo no corriente 51.366 M$** (= pasivo − corriente) |
| 4 | `company/PG` | 200: balance de cierre fiscal (junio) colocado en el año correcto por fecha de fin; intangibles 21.737 M$ vía tag agregado (`IntangibleAssetsNetExcludingGoodwill`) |
| 5 | `company/PEP` | 200: intangibles 15.066 M$ como suma de finite + indefinite (concepto combinado); CAPEX vía fallback `PaymentsToAcquireProductiveAssets` |
| 6 | `company/TAP` | 200: pérdida neta FY2025 de −2.139,6 M$ y **resultado antes de impuestos −2.518 M$**; **acciones diluidas 199,1 M** (formato `shares`); ingresos resueltos vía tag ASC 606 (`RevenueFromContractWithCustomerExcludingAssessedTax`) |
| 7 | `company/ZZZZ` (ticker inexistente) | 404 `COMPANY_NOT_FOUND` |
| 8 | `search` sin `q` | 400 "Falta el parámetro de búsqueda \"q\"." |

## 10. Relación con otros módulos

- **Frontend**: `public/app.js` consume ambos endpoints y pinta una única tabla por estado mediante pestañas desde `statements` (ver `documentacion/frontend/funcionalidades/screener/`).
- **Fase 2 del roadmap**: cubre el buscador con datos reales; quedan el histórico de filings (tabla `filings` ya definida en el esquema) y el puente "Analizar" hacia el pipeline (`analysis.service.js`).
- **Pipeline de IA**: el puente futuro enviará el PDF del filing elegido al mismo flujo `originAgent → sectorAgent → analystAgent` que la subida manual (regla fundamental del proyecto).

## 11. Pendientes

- Histórico de filings por empresa (lista de 10-Q/10-K con accession number y enlace al PDF; requiere el índice de submissions de EDGAR).
- Endpoint "Analizar" desde el cribador → pipeline de IA (mismo proceso que la subida manual).
- Posible guardado en `filings` cuando llegue el histórico.

## 12. Referencias

- `documentacion/PROYECTO-detalle.md` — sección 3.2 (Forma 2: buscador por empresa) y roadmap (Fase 2).
- `documentacion/ARQUITECTURA.md` — estructura de carpetas y tabla de endpoints.
- `documentacion/IMPLEMENTACION.md` — cronología de lo implementado.
- SEC: <https://www.sec.gov/files/company_tickers.json> y <https://data.sec.gov/api/xbrl/companyfacts/> (requieren User-Agent identificativo; 10 req/s por IP).
