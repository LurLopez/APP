# Funcionalidad: Análisis del informe (10-Q / 10-K de EE. UU.) — Backend

> Capa: **backend** · Fecha: 2026-08-12 (verificadores) · Actualizado: 2026-08-13/14 (pipeline completo) · Estado: **implementado y probado (origen + sector + analista + PDF + guardado)**

---

## 1. Objetivo

Ejecutar el **pipeline completo de análisis** de un informe financiero 10-Q / 10-K de una empresa de EE. UU. del sector de consumo defensivo: **verificar el origen**, **verificar el sector** y **generar el informe estructurado** con su PDF. Si el informe no cumple el alcance, se devuelve un error claro y legible. El mismo pipeline se ejecuta tanto desde la **subida manual de PDF** como desde el **botón "Analizar con IA"** de un filing de la SEC (regla fundamental del proyecto: mismo proceso y mismo resultado).

## 2. Alcance

**Incluido:**
- `POST /api/upload` (multipart, campo `file`, máx. 25 MB) → texto → **3 agentes** → informe JSON + **PDF generado** + guardado opcional.
- `POST /api/screener/company/:ticker/filings/:accession/analyze` → mismo pipeline con el contenido del filing (PDF real, PDF generado o HTML).
- Agente **verificador de origen**: ¿financiero? ¿EE. UU.? ¿10-Q/10-K?
- Agente **verificador de sector**: ¿consumo defensivo? (rechazo seguro sin evidencia).
- Agente **analista principal**: extracción de cifras en dos fases + informe estructurado según `src/agents/prompts/consumo-defensivo.md` (dos horizontes; bloques Ventas / Cash Flow / Asignación de Capital).
- Generador de **PDF** del informe (`report.service.js`, pdfkit) servido en `GET /api/reports/:file`.
- Capa de modelos IA con proveedores `deepseek` (activo), `opencode-go` y `mock`; reintentos (`chatJson`), timeout y límite de tokens configurables.
- Errores controlados con código (`AgentError`) y mensajes en español.
- Guardado en `analyses` si hay sesión (`saved: true/false`) — ver `historico-analisis`.

**Excluido (pendiente):**
- Análisis multi-periodo de empresa completa (Fase 4).
- Formato final del informe "definitivo" (los informes de referencia del usuario siguen guiando el prompt; se refinará).

## 3. Endpoints

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `POST` | `/api/upload` | multipart, campo `file` (PDF, ≤ 25 MB) | 200 `{ ok, origin, formType, sector, report, pdfUrl, saved }` · 400 · 422 · 500 |
| `POST` | `/api/screener/company/:ticker/filings/:accession/analyze` | — | 200 (mismo cuerpo) · 400 · 404 · 422 · 502 |
| `GET` | `/api/reports/:file` | — | 200 `application/pdf` · 404 · 400 (path traversal) |

### Respuesta de éxito

```json
{
  "ok": true,
  "origin": "US",
  "formType": "10-Q",
  "sector": "defensive_consumer",
  "report": { "company": "...", "ticker": "...", "periodTitle": "...", "reportingPeriod": "2026-06-27", "horizons": [...] },
  "pdfUrl": "/api/reports/<uuid>.pdf",
  "saved": true
}
```

### Respuestas de error

Siempre JSON `{ "error": "<mensaje en español>", "code": "<CODIGO>" }` (el `code` solo en errores `AgentError`, es decir 422).

## 4. Flujo

```
POST /api/upload (multipart, campo file)
  → multer en memoria (≤ 25 MB)                        [sin archivo → 400; > 25 MB → 400]
  → ¿es PDF? (mimetype o extensión)                     [no → 422 NOT_PDF]
  → pdf.service: extractTextFromPdf(buffer)
  → analysis.service: analyzeText(text, { userId, filename })
      1. originAgent → ¿isFinancial? [no → NOT_FINANCIAL]
                      → ¿isUsa?      [no → NOT_USA]
                      → ¿10-Q/10-K?  [no → NOT_10Q_10K]
                      → { origin: 'US', formType }
      2. sectorAgent → ¿isDefensiveConsumer? [no → NOT_DEFENSIVE_CONSUMER]
                      → { sector: 'defensive_consumer' }
      3. analystAgent → fase 1: extracción de cifras (JSON)
                      → fase 2: informe estructurado (2 horizontes, 3 bloques)
      → report.service: generateReportPdf(report) → pdfUrl
      → si hay userId: saveAnalysis (status done, ticker, company, period_end, pdf_url, report, model_used)
  → 200 { ok, origin, formType, sector, report, pdfUrl, saved }
```

**Desde un filing de la SEC** (`.../filings/:accession/analyze`): `getFilingContentBuffer` devuelve el PDF (real de la SEC o generado con Chrome) o el HTML primario; PDF → `analyzePdf`, HTML → `htmlToText` + `analyzeText`. El resto es idéntico (misma regla fundamental).

## 5. Capa de modelos IA

### `modelProvider.js`

- Proveedores registrados: `mock`, `deepseek`, `opencode-go` (alias `opencode`).
- Proveedor activo: `process.env.AI_PROVIDER`; por defecto `deepseek`. **Hoy el `.env` usa `deepseek`** (el directo fue ~10× más rápido y fiable que OpenCode Go en las pruebas: 22–23 s vs 145–247 s por análisis).
- `chat(messages)` delega en el proveedor activo; **`chatJson(messages, attempts=2)`** reintenta una vez ante respuesta vacía, JSON inválido o error transitorio (los 3 agentes lo usan).

### Configuración en `.env`

| Variable | Valor actual | Efecto |
|---|---|---|
| `AI_PROVIDER` | `deepseek` | `deepseek` · `opencode`/`opencode-go` · `mock` |
| `DEEPSEEK_API_KEY` / `OPENCODE_GO_API_KEY` | (según proveedor) | Sin key → error visible |
| `AI_MODEL` / `OPENCODE_GO_MODEL` | — | Modelo por defecto `deepseek-chat` / `deepseek-v4-flash` |
| `AI_MAX_TOKENS` | `16000` | Antes 400/8000; el informe superaba 8000 tokens y el modelo devolvía vacío |
| `AI_REQUEST_TIMEOUT_MS` | `180000` | Timeout por llamada; evita paneles colgados para siempre |
| `AI_PROVIDER=mock` | (solo desarrollo) | Heurística local sin coste |

### Proveedores

| Proveedor | Uso | Notas |
|---|---|---|
| `deepseek.provider.js` | Activo | `POST api.deepseek.com/chat/completions`, `temperature: 0`, limpieza de ```json``` |
| `opencode-go.provider.js` | Alternativo | `https://opencode.ai/zen/go/v1/chat/completions` (formato OpenAI-compatible); intermitente en el chat del analista (vacio/JSON inválido) |
| `mock.provider.js` | Solo `AI_PROVIDER=mock` | Heurística por patrones (SEC, FORM 10-Q/10-K, sector); incluye respuesta mínima para el analista |

**Garantía clave**: los agentes nunca importan un proveedor concreto; solo usan `modelProvider.chat`/`chatJson`. Cambiar de API es editar `.env`.

## 6. Agentes

### `originAgent` (origen)

- **Entrada**: `{ text }` (máx. 80.000 caracteres). **Salida**: `{ origin: 'US', formType: '10-Q' | '10-K' }`.

### `sectorAgent` (sector)

- **Entrada**: `{ text }`. Define consumo defensivo (bebidas —incluidas alcohólicas—, alimentos, tabaco, hogar, cuidado personal, retail de alimentación) con contraejemplos (tech, banca, energía, farma...). **Sin evidencia suficiente → rechazo** (filosofía del proyecto). **Salida**: `{ sector: 'defensive_consumer' }`.

### `analystAgent` (analista principal)

- **Entrada**: `{ text, sector }`. Dos fases con `chatJson`:
  1. **Extracción** (`EXTRACTION_PROMPT`): JSON con empresa, ticker, `reportingPeriod` (AAAA-MM-DD), trimestre/acumulado (y comparativos), cash flow y hechos relevantes. La ventana de texto se construye con `buildAnalysisText`: cabecera (30.000) + sección de estados financieros detectada por marcadores (15.000 antes / 50.000 después), recortada a 80.000.
  2. **Informe** (`SYSTEM_PROMPT` + reglas de `src/agents/prompts/consumo-defensivo.md` cargadas por sector): dos horizontes (trimestre y acumulado del año), bloques **Ventas / Cash Flow / Asignación de Capital** con filas ajustadas/normales, notas en español, variaciones %, BPA.
- Validación de la estructura (`horizons` no vacío) → `INVALID_REPORT_STRUCTURE`.
- Errores: `EMPTY_DOCUMENT`, `NO_SECTOR_RULES` (sin reglas para el sector), `INVALID_MODEL_RESPONSE`.

### Errores (`AgentError`)

| Código | Mensaje | Cuándo |
|---|---|---|
| `EMPTY_DOCUMENT` | "No se pudo leer el contenido del documento." | texto vacío |
| `INVALID_MODEL_RESPONSE` | "El modelo no devolvió una respuesta válida..." / "No se pudieron extraer los datos del informe." / "El modelo no devolvió un análisis válido." | JSON inválido o extracción fallida |
| `INVALID_REPORT_STRUCTURE` | "El análisis no contiene bloques válidos de datos." | informe sin `horizons` |
| `NO_SECTOR_RULES` | "No hay reglas de análisis definidas para el sector X." | sector sin fichero de reglas |
| `NOT_FINANCIAL` | "Este documento no es un informe financiero (10-Q / 10-K)." | `isFinancial: false` |
| `NOT_USA` | "Este informe no es de una empresa de EE. UU." | `isUsa: false` |
| `NOT_10Q_10K` | "El documento no es un FORM 10-Q ni un FORM 10-K." | `formType` nulo u otro |
| `NOT_DEFENSIVE_CONSUMER` | "Este informe no corresponde al sector de consumo defensivo." | `isDefensiveConsumer: false` |

## 7. Generación del PDF (`src/services/report.service.js`)

- **pdfkit**: cabecera (empresa, ticker, periodo), dos horizontes, bloques **1. VENTAS / 2. CASH FLOW / 3. ASIGNACIÓN DE CAPITAL** con tablas (cabecera oscura, filas alternas, notas en cursiva gris) y paginación automática.
- Guarda en `uploads/generated/` con nombre UUID; `GET /api/reports/:file` lo sirve validando contra path traversal.

## 8. Errores y casos límite del endpoint

| Caso | Respuesta |
|---|---|
| Sin archivo en `file` | 400 "No se recibió ningún archivo." |
| Archivo > 25 MB | 400 (multer `LIMIT_FILE_SIZE`) |
| Archivo no PDF | 422 `NOT_PDF` |
| PDF no financiero | 422 `NOT_FINANCIAL` |
| Financiero no estadounidense | 422 `NOT_USA` |
| Sin FORM 10-Q/10-K | 422 `NOT_10Q_10K` |
| Sector no defensivo | 422 `NOT_DEFENSIVE_CONSUMER` |
| PDF escaneado sin capa de texto | 422 `EMPTY_DOCUMENT` |
| Filing inexistente en SEC | 404 `FILING_NOT_FOUND` |
| SEC caída al descargar el filing | 502 `EDGAR_UNAVAILABLE` |
| Sin `DEEPSEEK_API_KEY` (con provider deepseek) | 500 "Falta DEEPSEEK_API_KEY en el archivo .env" |
| Timeout de la IA (> 180 s) | 500 "La API de IA tardó más de X s en responder" |
| Respuesta del modelo no parseable (tras reintento) | 422 `INVALID_MODEL_RESPONSE` |
| Guardado en BD falla | El análisis responde OK; solo se loguea |

## 9. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `src/services/pdf.service.js` | `extractTextFromPdf(buffer)` (pdf-parse 2.4.5, `PDFParse`). |
| `src/services/analysis.service.js` | `analyzePdf`/`analyzeText` (pipeline completo), `htmlToText`, `saveAnalysis` (guardado no bloqueante). |
| `src/services/ai/modelProvider.js` | Capa de abstracción; `chat`/`chatJson` (reintentos). |
| `src/services/ai/providers/{deepseek,opencode-go,mock}.provider.js` | Proveedores. |
| `src/agents/baseAgent.js` | `BaseAgent` + `AgentError`. |
| `src/agents/originAgent.js` / `sectorAgent.js` / `analystAgent.js` | Los 3 agentes del pipeline. |
| `src/agents/prompts/consumo-defensivo.md` | Reglas de análisis del sector (derivadas del PDF de referencia del usuario). |
| `src/services/report.service.js` | Generador de PDF (pdfkit). |
| `src/api/routes/analysis.routes.js` | `POST /api/upload`, `GET /api/analyses`, `GET /api/reports/:file`. |
| `src/api/routes/screener.routes.js` | `POST .../filings/:accession/analyze`. |
| `src/services/edgar.service.js` | `getFilingContentBuffer` (PDF real / generado / HTML). |
| `server.js` | Monta las rutas y el `errorHandler`. |

Dependencias: `multer`, `pdf-parse` (2.4.5), `pdfkit`.

## 10. Decisiones y motivos

| Decisión | Motivo |
|---|---|
| **DeepSeek directo como proveedor activo** | Medido con el mismo pipeline y el mismo informe (TAP 10-Q Q2 2026): 22–23 s y 4/4 JSON válidos vs OpenCode Go 145–247 s con fallos intermitentes. |
| **`AI_MAX_TOKENS=16000`** | El informe final supera 8.000 tokens de salida; con menos, el modelo devolvía respuesta vacía. |
| **`chatJson` con reintento** | Absorbe respuestas vacías/JSON inválido transitorias sin reescribir los agentes. |
| **Timeout de 180 s** | Un fallo de la API ya no deja el panel "Procesando" para siempre. |
| **Analista en dos fases** | Extraer primero las cifras (JSON) y luego estructurarlas con las reglas del sector da informes más fiables y permite validar cada paso. |
| **Ventana financiera (`buildAnalysisText`)** | Los estados financieros quedan dentro del texto enviado aunque el 10-K supere los 80.000 caracteres. |
| **HTML→texto para filings** | Los 10-Q/10-K modernos de la SEC son HTML/XBRL; el pipeline funciona igual (regla fundamental). |
| **Guardado no bloqueante** | Un fallo de BD no rompe la respuesta del análisis. |

## 11. Pruebas realizadas

- **Verificadores**: 5/5 casos de origen (10-Q válido, 10-K válido, no financiero, no estadounidense, sin FORM 10-Q/10-K) + sector (Molson Coors ✓, Apple ✗).
- **Pipeline completo end-to-end** (KHC 10-Q real de SEC EDGAR): HTTP 200 ~21 s, formType 10-Q, sector defensive_consumer, informe con 2 horizontes y 3 bloques, PDF descargable (200, application/pdf).
- **Desde el botón del screener** (TAP): HTTP 200 en 22,8 s con DeepSeek; origen ✓, sector ✓, analista ✓, informe completo, `saved: true` con sesión.
- **Regla fundamental**: la subida manual del mismo PDF falla/éxito exactamente igual que el endpoint del filing.
- Comparativa de proveedores medida (DeepSeek vs OpenCode Go) documentada en el diario del 14/08.
- `node --check` y `git diff --check` correctos.

## 12. Relación con otros módulos

- **Frontend**: panel de agentes y resultado en `public/app.js` (ver `documentacion/frontend/funcionalidades/verificacion-informe/`).
- **Histórico**: `analysis.service.js` guarda en `analyses` (ver `historico-analisis`).
- **Screener**: `POST .../analyze` conecta el filing con este pipeline.
- **Auth**: `resolveUser` decide si se guarda (`saved`).
- **Fase 5 (planes)**: el proveedor de IA se elegirá por plan (la capa ya lo permite).

## 13. Pendientes

- Decidir el modelo final a medio plazo (DeepSeek vs OpenCode Go; hoy funciona DeepSeek directo).
- Refinar las reglas del prompt del analista con los informes de referencia del usuario.
- Fase 4: análisis completo de empresa (multi-periodo).
