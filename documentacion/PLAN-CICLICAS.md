# Plan del tipo Cíclica (`cyclical`) — dimensión ortogonal al sector

> Versión: 2.0 · Fecha: 2026-10-09 · Estado: **Planificado** — pendiente de cerrar las decisiones de producto (§11) antes de implementar.
> Sustituye a la v1.0 (2026-09-20), que planteaba `cyclical` como cuarto sector. **Corrección de modelo:** ser cíclica no es un sector, es un **tipo de empresa**. Una empresa puede ser tecnológica **y** cíclica (p. ej. MU) y debe recibir las características de **ambas** dimensiones.

---

## 1. Modelo conceptual

Una empresa se describe con dos dimensiones independientes:

| Dimensión | Valores | Qué aporta |
|---|---|---|
| **Sector** (existente) | `defensive_consumer`, `technology`, `consumer_discretionary` (+ posible sector base nuevo, §7) | Estructura y **política contable**: ajustes de intangibles, deuda, capital allocation, bloques del informe |
| **Tipo** (nueva) | `cyclical` (primero; la dimensión queda abierta a más tipos) | **Ejes analíticos extra**: columna «Normalizado» (año normal) en la cuenta de resultados, gráfico de ciclo (cotización + margen operativo), posición en el ciclo, pruebas de supervivencia y alertas |

**Composición:** el análisis de una empresa con tipo se construye con las reglas de los dos:

```
Nivel 1 (general: financiero/general.md + notas/trimestral.md | notas/anual.md)
Nivel 2 (sector:         <sector>/sector.md)
Nivel tipo (nuevo:       tipos/ciclicas/tipo.md)          ← solo si es cíclica
Nivel 3 (subsector:      <sector>/subsectores/<slug>/subsector.md)
Nivel empresa:           <sector>/empresas/<ticker>/empresa.md
```

Ejemplos:

| Empresa | Sector | Tipo | Reglas que recibe |
|---|---|---|---|
| KO | defensivo | — | general + consumo defensivo |
| MU | tecnología | cíclica | general + tecnología + tipo cíclico |
| APTV | discrecional | cíclica | general + discrecional + tipo cíclico |
| Dow (si entra, §7) | sector base nuevo | cíclica | general + sector base + tipo cíclico |

---

## 2. Alcance

| Formulario | Qué hace el tipo cíclico |
|---|---|
| 10-Q | Mismos bloques (Ventas / Cash Flow / Asignación de capital) **+ columna «Normalizado»** (§6.2) **+ gráfico de ciclo** (§6.3) y directiva de lectura de ciclo en prompts/notas. |
| 10-K | Bloques anuales actuales **+ columna «Normalizado»** (§6.2) **+ gráfico de ciclo** (§6.3) **+ sección «Posición en el ciclo»** (§6.4). Todo sale también en el PDF exportado. |

El tipo **no cambia la estructura del informe**: añade columna, sección y criterios. La estructura (bloques y filas obligatorias) sigue mandando por sector/formulario.

---

## 3. Clasificación (el `sectorAgent` pasa a devolver sector + tipos)

El mismo agente del filtro actual (`src/agents/sectorAgent.js`) devuelve `{ sector, tipos[] }` en una sola pasada, sin agente nuevo:

1. **Ticker curado** (0 tokens): `KNOWN_CYCLICAL_TICKERS` por sector — p. ej. semis/analógicos en tecnología (MU, WDC, TXN, ADI, NXPI…); vivienda, autopartes, concesionarios en discrecional. Propuesta inicial en §11.2.
2. **Reglas de subsector**: un subsector puede declararse cíclico por defecto (p. ej. `vivienda`).
3. **IA** (fallback, misma llamada): el prompt añade `"cyclical": true|false` con evidencia del negocio. **Por defecto NO cíclica**: la duda no etiqueta (y nunca rechaza el informe; el tipo no afecta a la admisión).

El tipo se guarda con el análisis y viaja por todo el pipeline (resultado → guardado → API → regeneración).

---

## 4. Composición de reglas y conflictos (la parte crítica)

**Principio:** el sector manda en **contabilidad y cálculo**; el tipo añade **análisis**. Así una tecnológica cíclica no pierde la política de intangibles de tecnología y una discrecional cíclica mantiene la suya.

| Ámbito | Quién manda | Cómo se combina |
|---|---|---|
| Política de ajustes (intangibles, deterioros), filas y cuadres | **Sector** | El tipo no la modifica. Excepción: si un tipo declara un *override* explícito, se registra en una tabla determinista en `sectorPolicy.js` (no en prompt) y se documenta aquí. Hoy: sin overrides previstos. |
| Secciones anuales | Aditivo | Las secciones del sector se mantienen; el tipo **añade** «Posición en el ciclo» al final. |
| Notas y directiva de redacción | Aditivo | La directiva del tipo (`buildTypeDirective(tipos)`) se inyecta al final del bloque de reglas, después del sector, con orden de prioridad en conflicto: **empresa > subsector > tipo > sector > general**. |
| Admisión de la empresa | Sector | El tipo no admite ni rechaza. |

En prompts y en `loadKnowledgeRules` el bloque nuevo va titulado `### REGLAS DEL TIPO (cíclica)` y separado del de sector, para que el analista y el auditor sepan qué dimensión aporta cada regla.

---

## 5. Versionado y datos

**Versión compuesta:** `general.sector.tipo[.subsector][.empresa]`
(p. ej. MU con subsector y reglas de empresa: `1.1.1.1.1`; KO: `1.1`).

- `src/agents/versionRegistry.js`: nuevo parámetro `tipos`, mapa `TIPO_SLUGS` (`cyclical` → `ciclicas`) y lectura de `tipos/ciclicas/tipo.md` (+ variante `anual/tipos/ciclicas/tipo.md`). Devuelve `tipoVersion` en `resolveAnalysisVersionInfo`. Si hay varios tipos, se ordenan alfabéticamente para componer la versión.
- `isAnalysisOutdated` incluye los tipos: cuando una empresa pasa a ser cíclica, su versión gana un nivel → regenerable (comportamiento deseado: el informe anterior no tenía la sección de ciclo).
- **BD** (`db/schema.sql` + migración idempotente en `db/migrations.js`):
  - `analyses.tipos TEXT[] NOT NULL DEFAULT '{}'`
  - `analyses.tipos_version TEXT`
  - Los análisis existentes quedan con `tipos = '{}'` (no vencen solos).
- API/SSR/PDF: devolver y pintar el tipo donde ya se devuelve `sector`/`subsector` (detalle de análisis, versiones del filing, screener).

---

## 6. Qué añade el tipo cíclico al análisis

### 6.1 Reglas del tipo (`knowledge/tipos/ciclicas/tipo.md`, Nivel tipo, `> Versión: 1`)

- Lectura cíclica de los ajustes: un deterioro de intangible/marca en la parte alta del ciclo es señal de sobreprecio; se mantiene como coste y se explica en nota (coherente con tecnología y con el futuro sector base).
- Vocabulario de ciclo: máximos/mínimos, normalización, capacidad, precios de materias primas; nada de predicción (siempre condicional: «si los márgenes vuelven a X, el valor sería Y»).
- Regla transversal: cuando el histórico esté disponible, situar el margen actual respecto a su mediana de 10 años.

### 6.2 Columna «Normalizado» en la cuenta de resultados (Bloque 1 — Ventas)

La tabla de Ventas de los análisis con tipo cíclico incorpora una **columna nueva, «Normalizado»**, que responde: *¿qué hubiera ganado la empresa en un año normal?*. Muestra la cuenta de resultados con **ingresos normalizados** y los beneficios que se derivan de ellos:

| Fila | Cálculo (determinista en JS) |
|---|---|
| **Ventas** | **Ingresos normalizados** = mediana de los ingresos de los últimos 10 años |
| **Beneficio Bruto** | Ingresos normalizados × mediana de los **márgenes brutos anuales** de 10 años |
| **Beneficio Operativo** | Ingresos normalizados × mediana de los **márgenes operativos anuales** de 10 años |
| **EBT** | Beneficio Operativo normalizado − intereses de la deuda **actual** |
| **Beneficio Neto** | EBT normalizado × 0,77 (impuestos al 23 %, como en el resto del sistema) |
| **BPA** (pie de tabla) | Beneficio Neto normalizado / acciones actuales |

- **Método A (decidido):** se calcula el margen de cada uno de los 10 años (beneficio ÷ ventas), se toma su mediana y se aplica a los ingresos normalizados. Responde a «con esos ingresos normales, ¿qué habría ganado con márgenes normales?». La alternativa de tomar la mediana directa de los beneficios históricos queda descartada: no liga la cifra a los ingresos normalizados.
- Los márgenes históricos se toman del XBRL **as-reported** (no hay ajustes año a año); la propia mediana neutraliza los años con cargos puntuales.
- La deuda y los impuestos son **actuales**: la media histórica de márgenes no refleja la deuda de hoy.
- Cálculo íntegramente determinista con el XBRL de 10 años (`valuationSeries.core.js`); la IA solo interpreta.
- Si el histórico es insuficiente o la mediana de un margen no es utilizable (p. ej. margen operativo mediano negativo), la celda se marca «—» con nota; nunca se inventa la cifra (§12).
- **Alcance (decidido): 10-Q y 10-K.** En el 10-Q los dos horizontes comparten la misma columna (es un «año normal», no un periodo); se pintará en ambas tablas o solo en la primera (detalle de Fase 3). La sección de ciclo (§6.4) sigue siendo solo anual; el gráfico de ciclo (§6.3) acompaña a la columna en ambos formularios.

### 6.3 Gráfico de ciclo: cotización + margen operativo (10 años) — 10-Q y 10-K

Justo debajo de la cuenta de resultados, un gráfico de **doble eje** para ver de un vistazo en qué punto del ciclo está la empresa:

- **Eje X:** tiempo (últimos 10 años).
- **Eje Y izquierdo:** precio, con la **cotización exacta** de cierre ($).
- **Eje Y derecho:** **margen operativo** (%).
- **Dos líneas:** (1) cotización y (2) margen operativo, más una línea discontinua de referencia con la **mediana del margen de 10 años**.
- El margen se dibuja **TTM** (4 trimestres móviles) al cierre de cada trimestre: línea continua y alineada con los precios.
- Lectura buscada: precio en máximos con margen hundido (final del ciclo a la baja), precio castigado con margen ya recuperado, etc.
- Se pinta en web, PDF y exportaciones: en web reutiliza los módulos de gráficos del análisis (`public/js/analisis/analisisCharts*.js`); en PDF, los generadores `src/services/report/pdf*Charts.js`.
- Con histórico parcial, muestra la ventana disponible con nota; sin datos suficientes, se oculta.

### 6.4 Sección anual «Posición en el ciclo» (solo 10-K + tipo)

1. **Cotización vs media móvil** (por debajo / por encima). Futuro opcional: mediana de 10 años.
2. **Comprobaciones deterministas:**
   - Reversión: media del margen de los 5 primeros años vs los 5 últimos (si baja sostenidamente, declive estructural, no ciclo).
   - Supervivencia: cobertura de intereses y dividendo pagable con el beneficio normalizado.
   - Dilución: acciones actuales vs 10 años atrás.
3. **Alertas:** margen operativo TTM < 0 % (leer con liquidez y vencimientos a 12–24 meses: valle normal vs alerta roja) · margen por debajo de su mediana histórica.
4. **Valoración condicional:** BPA normalizado (columna de §6.2) frente a la cotización viva y rango de valor condicional (múltiplo a decidir; propuesta 12–15× o P/E medio histórico).
5. **Histórico mínimo:** propuesta 7 años; por debajo, columna/sección se ocultan con nota «histórico insuficiente» (§11.3); el gráfico de §6.3 muestra lo disponible.
6. **Datos:** reutilizar `valuationSeries.core.js` (XBRL) y el servicio de mercado; el beneficio normalizado se guarda con el análisis; la cotización se consulta en vivo (el análisis no caduca por precio).
7. **Legal:** referencia de valoración condicional, nunca precio objetivo ni recomendación.

---

## 7. Industrias hoy rechazadas (química, minería, papel/packaging, transporte, maquinaria, staffing)

El tipo por sí solo no resuelve estas industrias: no pertenecen a ningún sector curado y **el sector sigue siendo obligatorio** en el pipeline (versionado, perfil, BD). Decisión de Fase 0 (§11.1):

- **Opción A (recomendada):** crear un **sector base nuevo** `industrials_materials` («Industriales y materiales») con Nivel 2 mínimo (`knowledge/industriales-materiales/sector.md`, política contable propia: sin ajustes de intangibles, deterioros visibles) al que se aplica el tipo cíclico por defecto. Encaja sin romper la arquitectura; el Nivel 3 por subsector llega después (§9, fase 5).
- **Opción B:** permitir análisis «general + tipo» sin sector (`sector: generic`). Rompe el modelo actual (DB, versionado, perfil) y deja estas empresas con reglas base más pobres.

Las industrias tradicionalmente cíclicas de los 3 sectores ya curados (semis en tecnología; vivienda/autopartes/concesionarios en discrecional) entran con la opción que se elija.

---

## 8. Ficheros afectados (previsto)

| Pieza | Fichero |
|---|---|
| Clasificación (sector + tipos) | `src/agents/sectorAgent.js` |
| Versionado | `src/agents/versionRegistry.js` |
| Carga de reglas | `src/agents/analyst/filingExtractor.js` (`loadKnowledgeRules` con `tipos`) |
| Política/overrides | `src/agents/analyst/sectorPolicy.js` (tabla de overrides si llega a haberlos) |
| Directiva del tipo | nuevo `src/agents/analyst/typePolicy.js` + inyección en `analystRunSteps.js` |
| Reglas del tipo | nuevos `src/agents/knowledge/tipos/ciclicas/tipo.md` y `anual/tipos/ciclicas/tipo.md` |
| Columna «Normalizado» (cuenta de resultados) | `analystSalesProcessor.js` (`normalizeSalesBlock`), prompts trimestral/anual, renderers web (`analisisTables*.js`), SSR (`reportSsrHtml.js`), PDF (`pdfTableDrawer.js`) y exportadores HTML/DOCX/ODT (`reportSections.js`) |
| Gráfico de ciclo (cotización + margen) | `src/services/market.service.js` (`getHistoricalPrices`), `src/services/edgar/valuationSeries.core.js`, `public/js/analisis/analisisCharts*.js`, `src/services/report/pdf*Charts.js` |
| Sección anual + extracción | `analystAnnualSystemPrompt.js`, `annualConclusionSections.js`, `annualConclusionProcessor.js`, `analystExtractionPrompt.js`/`Schema.js` (hechos nuevos si hacen falta) |
| Datos de ciclo | `src/services/edgar/valuationSeries.core.js`, `src/services/market.service.js` |
| BD | `db/schema.sql`, `db/migrations.js` |
| Pipeline/guardado | `src/services/analysis.service.js` (`saveAnalysis`, `runAnalysis`), controladores (`analysis.detail`, `filing.versions`, `screener.*`, `adminReports`) |
| Perfil/SEO/mock/i18n | `companyProfileData.js`, `empresaFormatting.js`, `seoConstants.js`, `mock.provider.js`, `public/locales/*.json`, `_sources.json` |
| Exportación | `src/services/pdf.service.js` + exportadores HTML/DOCX/ODT |
| Pregeneración | `scripts/analyze-consumer.core.js` / `worker.js` → `npm run analyze:cyclical` |
| Portada/guías | `public/index.html`, `public/empresa.html`, `guiasAnalisisIaContent.js` |

---

## 9. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Decisiones de producto: sector base para industrias rechazadas (§7/§11.1), listas cíclicas iniciales (§11.2), histórico mínimo (§11.3), etiqueta visible (§11.4) | Pendiente |
| 1 | Dimensión tipo en el pipeline: clasificación (`sectorAgent` → `tipos`), versionado compuesto, BD (`tipos`, `tipos_version`), API/SSR, regeneración | Pendiente |
| 2 | Reglas del tipo (`tipos/ciclicas/tipo.md`), directiva (`typePolicy.js`), composición con sector, pruebas de paridad (el tipo no altera el motor numérico) | Pendiente |
| 3 | Sección anual determinista (media móvil, márgenes 10 años, tabla normalizada, comprobaciones, alertas) + PDF + i18n | Pendiente |
| 4 | Experiencia: perfil/portada/SEO/mock, textos de cobertura, pregeneración `analyze:cyclical` | Pendiente |
| 5 | Nivel 3 por subsector (sector base e industrias curadas) y ampliación de listas cíclicas | Pendiente |

---

## 10. Pruebas previstas

- `tests/unit/typeCyclical.test.js`: ticker directo, subsector por defecto, fallback IA (sí/no), combinaciones sector+tipo (tecnológica cíclica, discrecional cíclica, defensiva sin tipo), rechazo intacto.
- Versionado: versión compuesta `general.sector.tipo[...]`, `isAnalysisOutdated` al ganar/perder tipo, compatibilidad con análisis antiguos (`tipos='{}'`).
- Reglas: `loadKnowledgeRules` inyecta el bloque del tipo solo cuando aplica y en el orden correcto.
- Columna «Normalizado»: ingresos normalizados (mediana 10 años), medianas de márgenes bruto y operativo aplicadas, EBT con intereses de deuda actual, neto al 23 %, BPA, histórico insuficiente y margen mediano negativo (celdas «—»). Presente en 10-Q y 10-K.
- Gráfico de ciclo: alineación precio–margen TTM, línea de mediana, histórico parcial (muestra lo disponible) y ausencia de datos (se oculta).
- Sección anual: mediana de márgenes, alerta de margen < 0, dilución, histórico insuficiente, valoración condicional.
- Paridad (`sectorCalculationParity.test.js`): el tipo no cambia ningún cálculo del motor salvo lo explícitamente definido (hoy: nada).

---

## 11. Decisiones abiertas (cerrar antes de Fase 1)

1. **Industrias hoy rechazadas:** ¿sector base nuevo `industrials_materials` (recomendado) o análisis solo general+tipo sin sector?
2. **Lista inicial de cíclicas por sector** (propuesta): tecnología → semis de memoria/analógicos (MU, WDC, TXN, ADI, NXPI, ON, MCHP); discrecional → vivienda, autopartes, concesionarios y distribución de materiales (DHI, LEN, PHM, TOL, APTV, BWA, LEA, KMX, CVNA, BECN, GMS…); defensivo → ninguna por ahora. ¿Se marca todo `consumer_discretionary` o solo los subsectores más cíclicos?
3. **Histórico mínimo** de la sección anual: 7 años (propuesta) o 10.
4. **Etiqueta visible:** ¿badge/discreto «Empresa cíclica» en perfil y ficha de análisis, o solo uso interno del análisis? (recomendado: visible y discreto).

### Decisiones cerradas (2026-10-09)

- **Mediana** (no media) de los últimos 10 años, para ingresos y márgenes.
- **Método A:** mediana de los márgenes anuales aplicada a los ingresos normalizados (no la mediana directa de beneficios).
- **Columna «Normalizado» en 10-Q y 10-K**; la sección «Posición en el ciclo» sigue siendo solo anual (10-K).
- **Gráfico de ciclo:** cotización exacta + margen operativo **TTM**, doble eje (precio | %), 10 años, con la mediana del margen como línea de referencia; en 10-Q y 10-K.

---

## 12. Riesgos y avisos

- **Explosión de combinaciones:** contener la matriz con tipos pocos, reglas modulares y la regla «el tipo no toca la contabilidad». Cada tipo nuevo debe justificar su Nivel propio.
- **Heterogeneidad:** ETT = ciclo laboral; química = spreads; minería = precio del commodity. El Nivel del tipo cubre los ejes comunes; el detalle por subsector es Nivel 3 (fase 5).
- **Normalizar con ingresos actuales** puede sobreestimar en picos (típico en materias primas): mostrar también la posición de ingresos/márgenes respecto a su rango de 10 años.
- **Márgenes normales no utilizables:** mediana de margen operativo negativa o histórico corto → celdas «—» con nota; nunca inventar la cifra de un año normal.
- **Empresas jóvenes:** sin histórico suficiente la sección se oculta (no se inventa).
- **Legal:** valoración condicional, nunca precio objetivo.
