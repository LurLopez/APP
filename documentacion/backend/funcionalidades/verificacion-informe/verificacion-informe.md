# Funcionalidad: Análisis del informe (10-Q / 10-K de EE. UU.) — Backend

> Capa: **backend** · Fecha: 2026-08-12 (verificadores) · Actualizado: 2026-09-21 (auditor + corrección, nota visible y registro por fases) · Estado: **implementado y probado (origen + sector + analista + auditor + PDF + guardado)**

---

## 1. Objetivo

Ejecutar el **pipeline completo de análisis** de un informe financiero 10-Q / 10-K de una empresa de EE. UU. del sector de consumo defensivo: **verificar el origen**, **verificar el sector**, **generar el informe estructurado** con su PDF y **auditarlo** contra el texto completo del filing (el auditor corrige los fallos que encuentra). Si el informe no cumple el alcance, se devuelve un error claro y legible. El mismo pipeline se ejecuta tanto desde la **subida manual de PDF** como desde el **botón "Analizar con IA"** de un filing de la SEC (regla fundamental del proyecto: mismo proceso y mismo resultado).

## 2. Alcance

**Incluido:**
- `POST /api/upload` (multipart, campo `file`, máx. 25 MB) → texto → **4 agentes** → informe JSON + **PDF generado** + guardado opcional.
- `POST /api/screener/company/:ticker/filings/:accession/analyze` → mismo pipeline con el contenido del filing (PDF real, PDF generado o HTML).
- Agente **verificador de origen**: ¿financiero? ¿EE. UU.? ¿10-Q/10-K?
- Agente **verificador de sector**: ¿consumo defensivo? (rechazo seguro sin evidencia).
- Agente **analista principal**: extracción de cifras en dos fases + informe estructurado con las reglas `.md` del sector (dos horizontes; bloques Ventas / Cash Flow / Asignación de Capital).
- Agente **auditor**: nota 1-10, errores probados y comprobaciones deterministas contra el **texto completo** del filing y las **mismas reglas `.md`** que el analista; si hay errores graves o menores, el mismo agente genera el informe corregido y se publica esa versión. Interruptores `AI_AUDIT_ENABLED` / `AI_AUDIT_FIX_ENABLED`.
- **Nota de la auditoría** guardada en `analyses.audit` y devuelta por la API (`audit`), sin mostrarse al usuario en la interfaz (se conserva en el registro interno y para los agentes admin).
- Generador de **PDF** del informe (`report.service.js`, pdfkit) servido en `GET /api/reports/:file`.
- Capa de modelos IA con proveedores `deepseek` (activo), `opencode-go` y `mock`; reintentos (`chatJson`), timeout y límite de tokens configurables.
- Errores controlados con código (`AgentError`) y mensajes en español.
- Guardado en `analyses` si hay sesión (`saved: true/false`) — ver `historico-analisis`.
- **Registro exacto por análisis** en `logs/analisis.log` (JSONL) y `analysis_logs`: tipo y año, tiempo/coste del análisis y de la revisión+corrección, nota, cambios aplicados y coste total (sección 13).

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
  "audit": { "nota": 6.5, "veredicto": "correcto_con_reservas", "errores": 5, "corregibles": 5, "corregido": true, "revertido": false, "fuenteRecortada": false, "cambios": 6 },
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
      4. auditorAgent → audita contra el texto completo del filing y las mismas reglas .md
                      → { nota 1-10, veredicto, errores, comprobaciones deterministas }
                      → si hay errores graves/menores: corrige el informe (si AI_AUDIT_FIX_ENABLED)
                      → si la corrección no valida (estructura/horizontes/deterministas), conserva el original
      → report.service: generateReportPdf(report) → pdfUrl
      → si hay userId: saveAnalysis (status done, ticker, company, period_end, pdf_url, report, audit, model_used)
  → 200 { ok, origin, formType, sector, report, audit, pdfUrl, saved }
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
| `AI_MODEL` / `OPENCODE_GO_MODEL` | `deepseek-flash` / — | `deepseek-flash` = DeepSeek-V4.1-Flash (por defecto) · `deepseek-v4-pro` |
| `AI_THINKING` | `disabled` | `enabled` activa el razonamiento de DeepSeek (más lento y caro) |
| `AI_MAX_TOKENS` | `16000` | Antes 400/8000; el informe superaba 8000 tokens y el modelo devolvía vacío |
| `AI_REQUEST_TIMEOUT_MS` | `180000` | Timeout por llamada; evita paneles colgados para siempre |
| `AI_PROVIDER=mock` | (solo desarrollo) | Heurística local sin coste |

### Proveedores

| Proveedor | Uso | Notas |
|---|---|---|
| `deepseek.provider.js` | Activo | `POST api.deepseek.com/chat/completions`, modelo `deepseek-flash` (DeepSeek-V4.1-Flash), `temperature: 0`, limpieza de ```json``` |
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
  1. **Extracción** (`EXTRACTION_PROMPT`): JSON con empresa, ticker, `reportingPeriod` (AAAA-MM-DD), trimestre/acumulado (y comparativos), cash flow, hechos relevantes y, en 10-Q, `quarterDetails` (estado del guidance y notas relevantes del trimestre). La ventana de texto se construye con `buildAnalysisText`: cabecera (30.000) + sección de estados financieros detectada por marcadores (15.000 antes / 50.000 después), recortada a 80.000.
  2. **Informe** (`SYSTEM_PROMPT` + reglas cargadas por sector desde `src/agents/knowledge/`): parte financiera común (`financiero/general.md`), parte cualitativa según formulario (`notas/trimestral.md` en 10-Q y `notas/anual.md` en 10-K) y reglas de sector (`consumo-defensivo.md`). Dos horizontes en 10-Q (trimestre y acumulado del año) o uno de 12 meses en 10-K, bloques **Ventas / Cash Flow / Asignación de Capital** con filas ajustadas/normales, notas en español, variaciones %, BPA y, en 10-Q, la sección `quarterNotes` (**notas del trimestre**: estado del guidance mantenido/al alza/a la baja/retirado/nuevo y hechos relevantes de los últimos 3 meses; `applyQuarterNotes` la completa desde la extracción).
- Validación de la estructura (`horizons` no vacío) → `INVALID_REPORT_STRUCTURE`.
- Errores: `EMPTY_DOCUMENT`, `NO_SECTOR_RULES` (sin reglas para el sector), `INVALID_MODEL_RESPONSE`.

### `auditorAgent` (auditor + corrector)

- **Entrada**: `{ report, sourceText, filingMeta, rules }`, donde `sourceText` es el **texto completo** del filing (recortado a `AI_AUDIT_MAX_SOURCE_CHARS`, 200.000 por defecto, conservando inicio y final; el presupuesto se reduce con las reglas `.md`, así que el filing enviado queda en ~150.000 caracteres) y `rules` son las **mismas reglas** que recibe el analista (`loadKnowledgeRules`: generales, sector, subsector y empresa).
- **Contexto compartido y caché de prefijo**: las reglas `.md` y las comprobaciones deterministas viajan en un bloque idéntico al inicio del mensaje de sistema de la auditoría y de la corrección (`buildSharedAuditContext`), de modo que el proveedor reutiliza su caché de prefijo y la corrección paga el contexto a precio de cache-hit.
- **Fase 1 (auditoría)**: `chatJson` con la rúbrica (`auditorPrompt.js`) + comprobaciones deterministas (`deterministicChecks.js`: aritmética de porcentajes, sumas, umbrales, estructura, coherencia de notas). Devuelve `{ score 1-10, veredicto, resumen, errores[], aciertos[], bloques, cifrasClave[], dudas[] }`.
- **Fase 2 (corrección, `fix`)**: si hay errores graves o menores, `correctorPrompt.js` devuelve el informe completo corregido (en cascada: porcentajes, sumas, notas y textos afectados). El corrector **no recibe el filing completo**: cada error de la auditoría ya incluye el valor correcto (`esperado`) y su prueba (`evidencia`), y las reglas viajan en el contexto compartido. La corrección solo sustituye al original si `validateCorrectedReport` conserva estructura/horizontes/metadatos y `runDeterministicChecks` no empeora; si no, se conserva el original. `diffReports` registra los cambios aplicados.
- **Degradación segura**: cualquier fallo del auditor o del corrector (IA no disponible, JSON inválido, contexto excedido) no interrumpe el análisis: se publica el informe del analista y el error queda en el log.
- **Desactivación**: `AI_AUDIT_ENABLED=false` (o `0/no/off/disabled/desactivado`) desactiva la revisión; `AI_AUDIT_FIX_ENABLED=false` audita sin corregir.

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

- **pdfkit**: cabecera (empresa, ticker, periodo), dos horizontes, bloques **1. VENTAS / 2. CASH FLOW / 3. ASIGNACIÓN DE CAPITAL** con tablas (cabecera oscura, filas alternas, notas en cursiva gris), sección **NOTAS DEL TRIMESTRE E INFORMACIÓN RELEVANTE** en los 10-Q (`pdfQuarterNotesDrawer.js`) y paginación automática.
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
| `src/agents/originAgent.js` / `sectorAgent.js` / `analystAgent.js` | Los 3 agentes de verificación y análisis del pipeline. |
| `src/agents/auditor/{auditorAgent,auditorPrompt,correctorPrompt,deterministicChecks,auditPolicy}.js` | Auditor: rúbrica, corrección, comprobaciones deterministas y reglas de decisión/validación. |
| `src/services/analysis/analysisLogger.service.js` | Registro exacto del análisis en `logs/analisis.log` y `analysis_logs`. |
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

## 13. Registro exacto de cada análisis

Cada análisis escribe una línea JSON en `logs/analisis.log` (`ANALYSIS_LOG_DIR` configurable) y una fila en la tabla `analysis_logs` (misma información, consultable con SQL). Campos:

| Campo | Contenido |
|---|---|
| `fechaHora` | Fecha y hora ISO del análisis. |
| `ticker`, `accession`, `filename`, `tipo`, `periodo`, `anio` | Empresa e informe: tipo (`10-Q`/`10-K`), periodo (`2025-12-31`) y ejercicio (`2025`). |
| `fases.analisis` | **Primer análisis** (origen + sector + analista): `segundos`, `llamadas`, tokens y `costeUsd`. |
| `fases.revision` | **Revisión + corrección** (auditor + corrector): `segundos`, `llamadas`, tokens, `costeUsd`, `nota`, `veredicto`, `errores`, `corregido` y número de `cambios`. Es `null` si la auditoría está desactivada. |
| `fases.pdf` | Generación del PDF: `segundos` (sin coste de IA). |
| `auditoria` | Resumen de la auditoría: `nota`, `veredicto`, `errores`, `corregibles`, `corregido`, `revertido`, `motivo`, `fuenteRecortada`, `cambios`, `fallosDeterministas` (`antes`/`despues`). |
| `cambiosAuditoria` | **Detalle de los cambios del segundo agente**: lista `{ ruta, antes, despues }` (máx. 80, valores recortados a 400 caracteres). `null` si no hubo corrección. |
| `proveedores`, `modelos`, `llamadas`, `tokens`, `costeUsd`, `costeConocido`, `duracionSegundos` | Totales del análisis completo (la suma de las fases coincide con el total). |

Columnas equivalentes en `analysis_logs`: `form_type`, `fiscal_year`, `period_end`, `analysis_seconds`, `analysis_cost_usd`, `audit_seconds`, `audit_cost_usd`, `audit_score`, `audit_corrected` y `audit_changes` (JSONB), además de las ya existentes (`cost_usd` y `duration_seconds` son los totales).

### Instantáneas HTML antes y después de los ajustes

Cuando la auditoría está activa, cada análisis guarda dos versiones HTML del informe con el mismo UUID base:

- `uploads/generated/<uuid>-antes.html` — el informe tal y como lo generó el analista, **antes** de la corrección (instantánea histórica, no se regenera).
- `uploads/generated/<uuid>.html` — el informe **final** (corregido si hubo fallos), junto al PDF/DOCX/ODT.

Las URLs viajan en `audit.htmlAntes` y `audit.htmlDespues` y se pueden descargar con la misma protección que el resto del informe: `GET /api/reports/<uuid>-antes.html` (público/owner/admin, igual que el PDF). En la web aparecen en el menú «Descargar → Web antes de ajustes (.html)». `cleanupGeneratedReports` borra también la instantánea previa al eliminar el análisis.

## 14. Pendientes

- Decidir el modelo final a medio plazo (DeepSeek vs OpenCode Go; hoy funciona DeepSeek directo).
- Refinar las reglas del prompt del analista con los informes de referencia del usuario.
- Fase 4: análisis completo de empresa (multi-periodo).
