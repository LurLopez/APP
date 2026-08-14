# Funcionalidad: Verificación del informe (10-Q / 10-K de EE. UU.) — Backend

> Capa: **backend** · Fecha: 2026-08-12 · Estado: **implementado y probado (origen + sector); analista pendiente**

---

## 1. Objetivo

Verificar que el PDF subido es un informe financiero **10-Q o 10-K de una empresa de EE. UU. del sector de consumo defensivo** antes de continuar con el análisis. Si no lo es, la API devuelve un error claro y legible que el frontend muestra en pantalla. Son los dos primeros eslabones del pipeline de análisis (agentes *verificador de origen* y *verificador de sector*).

## 2. Alcance

**Incluido:**
- Subida de PDF vía `POST /api/upload` (multipart, campo `file`, máx. 25 MB).
- Extracción de texto del PDF (pdf-parse 2.4.5).
- **Agente verificador de origen**: ¿es financiero? ¿es de EE. UU.? ¿es 10-Q o 10-K?
- **Agente verificador de sector**: ¿es consumo defensivo? (bebidas, alimentos, tabaco, hogar, cuidado personal, retail de alimentación; con contraejemplos y rechazo seguro si no hay evidencia).
- Capa de abstracción de modelos IA con dos proveedores: `deepseek` (real) y `mock` (heurística local, solo con `AI_PROVIDER=mock`).
- Errores controlados con código (`AgentError`) y mensajes en español.
- Sin `DEEPSEEK_API_KEY` el análisis **no funciona**: error visible "Falta DEEPSEEK_API_KEY en el archivo .env" (comportamiento pedido por el usuario para poder comprobar la API real).

**Excluido (pendiente):**
- Agente analista principal (informe final).
- Guardar el análisis en `analyses` (histórico) y el PDF en `uploads/`.
- Asociar el análisis al usuario conectado (`requireAuth`).
- Guardar el texto extraído o el resultado parcial en BD.

## 3. Endpoints

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `POST` | `/api/upload` | multipart, campo `file` (PDF, ≤ 25 MB) | 200 `{ ok, origin, formType }` · 400 · 422 · 500 |

### Respuesta de éxito

```json
{ "ok": true, "origin": "US", "formType": "10-Q", "sector": "defensive_consumer" }
```

### Respuestas de error

Siempre JSON: `{ "error": "<mensaje en español>", "code": "<CODIGO>" }` (el `code` solo en errores `AgentError`, es decir 422).

## 4. Flujo

```
POST /api/upload (multipart, campo file)
  → multer recibe el archivo en memoria (≤ 25 MB)      [sin archivo → 400]
  → ¿es PDF? (mimetype o extensión)                     [no → 422 NOT_PDF]
  → pdf.service: extractTextFromPdf(buffer)             [texto extraído]
  → analysis.service: analyzePdf(buffer)
      → originAgent.run({ text })                       (texto truncado a 80.000 caracteres)
          → capa de modelos (chat) con prompt system + documento
          → ¿isFinancial?                               [no → 422 NOT_FINANCIAL]
          → ¿isUsa?                                     [no → 422 NOT_USA]
          → ¿formType es '10-Q' o '10-K'?               [no → 422 NOT_10Q_10K]
      → { origin: 'US', formType }
      → sectorAgent.run({ text })
          → ¿isDefensiveConsumer?                       [no → 422 NOT_DEFENSIVE_CONSUMER]
      → { sector: 'defensive_consumer' }
  → 200 { ok: true, origin, formType, sector }
```

## 5. Capa de modelos IA

### `modelProvider.js` (los agentes solo conocen esta capa)

- Registro de proveedores: `mock`, `deepseek`.
- Proveedor activo: `process.env.AI_PROVIDER` si está definido; si no, `deepseek`.
- `chat(messages)` delega en el proveedor activo.

### `providers/mock.provider.js` (desarrollo, sin coste)

Detecta la tarea por el prompt `system` del agente y aplica heurística sobre el texto del documento (solo mensajes `role: user`):

| Tarea | Decisión | Regla |
|---|---|---|
| Origen (`isFinancial`, `isUsa`, `formType`) | `isFinancial` | ≥ 2 patrones financieros presentes (balance, cuenta de resultados, flujos de caja, totales...) |
| | `isUsa` | ≥ 1 patrón de EE. UU. (SEC, Washington D.C., Exchange Act of 1934...) |
| | `formType` | `FORM 10-Q` → `10-Q` · `FORM 10-K` → `10-K` · ninguno → `null` |
| Sector (`isDefensiveConsumer`) | defensivo | ≥ 1 patrón defensivo (bebidas, alimentos, tabaco, hogar, cuidado personal, supermercados...) y 0 patrones contrarios (tech, automoción, banca, energía, farma...) |

Devuelve `JSON.stringify(...)`, igual que lo haría un modelo real.

### `providers/deepseek.provider.js` (real)

- `POST https://api.deepseek.com/chat/completions` con fetch nativo (sin dependencias).
- Modelo: `deepseek-chat` (configurable con `AI_MODEL`), `temperature: 0`, `max_tokens: 400`.
- Limpia la respuesta si viene envuelta en bloque ```json```.
- Sin `DEEPSEEK_API_KEY` lanza error claro. Errores HTTP de DeepSeek se propagan con detalle (≤ 300 caracteres).

## 6. Agentes verificadores

### `originAgent` (origen)

- **Entrada**: `{ text }` (texto extraído del PDF).
- **Prompt**: instrucciones (system) + documento (user, truncado a `MAX_CHARS = 80000`).
- **Respuesta del modelo esperada**: `{"isFinancial": bool, "isUsa": bool, "formType": "10-Q"|"10-K"|null}`.
- **Salida**: `{ origin: 'US', formType: '10-Q' | '10-K' }`.

### `sectorAgent` (sector)

- **Entrada**: `{ text }`.
- **Prompt**: define qué es consumo defensivo (bebidas —incluidas alcohólicas—, alimentos y aperitivos, tabaco, productos de hogar, cuidado personal, retail de alimentación) y contraejemplos (tech, semiconductores, telecom, automoción, moda, comida rápida, aerolíneas, banca/seguros, energía, farma/biotec, industriales). **Sin evidencia suficiente → `false`** (rechazo seguro, filosofía del proyecto).
- **Respuesta del modelo esperada**: `{"isDefensiveConsumer": bool}`.
- **Salida**: `{ sector: 'defensive_consumer' }`.

### Errores (`AgentError`)

| Código | Mensaje | Agente | Cuándo |
|---|---|---|---|
| `EMPTY_DOCUMENT` | "No se pudo leer el contenido del documento." | ambos | texto vacío |
| `INVALID_MODEL_RESPONSE` | "El modelo no devolvió una respuesta válida..." | ambos | JSON inválido |
| `NOT_FINANCIAL` | "Este documento no es un informe financiero (10-Q / 10-K)." | origin | `isFinancial: false` |
| `NOT_USA` | "Este informe no es de una empresa de EE. UU." | origin | `isUsa: false` |
| `NOT_10Q_10K` | "El documento no es un FORM 10-Q ni un FORM 10-K." | origin | `formType` nulo u otro |
| `NOT_DEFENSIVE_CONSUMER` | "Este informe no corresponde al sector de consumo defensivo." | sector | `isDefensiveConsumer: false` |

## 7. Errores y casos límite del endpoint

| Caso | Respuesta |
|---|---|
| Sin archivo en el campo `file` | 400 "No se recibió ningún archivo." |
| Archivo > 25 MB | 400 "El archivo supera el límite de 25 MB." (multer `LIMIT_FILE_SIZE`) |
| Archivo no PDF (txt, docx...) | 422 `NOT_PDF` "Solo se admiten archivos PDF." |
| PDF no financiero (informe de marketing, tesis...) | 422 `NOT_FINANCIAL` |
| PDF financiero de empresa no estadounidense | 422 `NOT_USA` |
| PDF financiero sin FORM 10-Q/10-K (informe semestral...) | 422 `NOT_10Q_10K` |
| PDF financiero de EE. UU. de sector no defensivo (tech, banca...) | 422 `NOT_DEFENSIVE_CONSUMER` |
| PDF escaneado sin capa de texto | Texto vacío → 422 `EMPTY_DOCUMENT` |
| Sin `DEEPSEEK_API_KEY` en `.env` | 500 "Falta DEEPSEEK_API_KEY en el archivo .env" |
| Key inválida / error de DeepSeek | 500 con el detalle de la API (logueado por consola) |
| Respuesta del modelo no parseable | 422 `INVALID_MODEL_RESPONSE` |

## 8. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `src/services/pdf.service.js` | `extractTextFromPdf(buffer)` con `PDFParse` de pdf-parse; destruye el parser en `finally`. |
| `src/services/analysis.service.js` | Pipeline: texto → `originAgent.run` → `{ text, origin, formType }`. Aquí se encadenarán sector y analista. |
| `src/services/ai/modelProvider.js` | Capa de abstracción: registro de proveedores + `chat(messages)`. |
| `src/services/ai/providers/mock.provider.js` | Heurística local (regex). |
| `src/services/ai/providers/deepseek.provider.js` | Llamada real a la API de DeepSeek. |
| `src/agents/baseAgent.js` | `BaseAgent` (name, description, run) + `AgentError` (mensaje + código). |
| `src/agents/originAgent.js` | Agente verificador de origen/tipo. |
| `src/agents/sectorAgent.js` | Agente verificador de sector (consumo defensivo). |
| `src/agents/agentRegistry.js` | `registerAgent`, `getAgent`, `listAgents`; registra origin y sector al importar. |
| `src/api/routes/analysis.routes.js` | `POST /api/upload` con multer (memoria) y manejo de errores (400/422/500). |
| `server.js` | Monta `/api` (analysisRoutes) y el `errorHandler`. |

Dependencias nuevas: `multer`, `pdf-parse` (2.4.5).

## 9. Decisiones y motivos

| Decisión | Motivo |
|---|---|
| **multer en memoria** (no a disco) | El PDF se procesa al vuelo; aún no se guarda en `uploads/` (pendiente). |
| **pdf-parse 2.4.5** | API moderna `PDFParse` + `getText()`; compatible con ESM (la 1.x requería workarounds). |
| **Truncado a 80.000 caracteres** | Los 10-K superan ese tamaño; limita coste y tokens de la API. |
| **`temperature: 0`** | La verificación es una clasificación: determinista, sin creatividad. |
| **Sin key → error (no mock)** | Decisión del usuario: comprobar que DeepSeek funciona de verdad; el mock queda solo con `AI_PROVIDER=mock`. |
| **Validación de PDF en el controller** | El `fileFilter` de multer envolvía el error y devolvía 500; validando en el controller se controla el 422. |
| **Códigos `AgentError` estables** | El frontend (o futuro guardado en BD) puede reaccionar por código, no solo por texto. |

## 10. Pruebas realizadas

| # | Caso | Resultado |
|---|---|---|
| 1 | Agente con 10-Q válido (texto) | `{ origin: 'US', formType: '10-Q' }` |
| 2 | Agente con 10-K válido (texto) | `{ origin: 'US', formType: '10-K' }` |
| 3 | Texto no financiero | `AgentError NOT_FINANCIAL` |
| 4 | Financiero no estadounidense | `AgentError NOT_USA` |
| 5 | Financiero sin FORM 10-Q/10-K | `AgentError NOT_10Q_10K` |
| 6 | Endpoint con PDF normal | 422 `NOT_FINANCIAL` |
| 7 | Endpoint con PDF 10-Q defensivo (Molson Coors) | 200 `{ ok: true, origin: 'US', formType: '10-Q', sector: 'defensive_consumer' }` |
| 8 | Endpoint con PDF 10-Q tech (Apple) | 422 `NOT_DEFENSIVE_CONSUMER` |
| 9 | Endpoint sin archivo | 400 |
| 10 | Endpoint con .txt | 422 `NOT_PDF` |
| 11 | Endpoint sin API key | 500 "Falta DEEPSEEK_API_KEY en el archivo .env" |

> Nota: los PDFs de prueba se generaron a mano (contenido en literales de texto PDF de ≤ 70 caracteres por línea, porque pdf.js corta operaciones de texto largas).

## 11. Relación con otros módulos

- **Frontend**: `public/app.js` consume `POST /api/upload` (ver `documentacion/frontend/funcionalidades/verificacion-informe/`).
- **Pipeline futuro**: `analysis.service.js` encadenará `analystAgent` tras sector; luego guardará en `analyses` (`analysisRepository.updateAnalysis` ya soporta `status`, `error`, `origin`, `sector`, `report`, `model_used`).
- **Auth (Fase 3)**: `requireAuth` protegerá `/api/upload` para asociar `analyses.user_id`.
- **Fase 5 (planes)**: el proveedor de IA se elegirá por plan (la capa ya lo permite: `AI_PROVIDER`).

## 12. Pendientes

- Probar con una key real de DeepSeek (usuario la añadirá en `.env`).
- `analystAgent` (informe final).
- Guardar análisis en `analyses` + PDF en `uploads/`.
- Proteger el endpoint con `requireAuth`.
- Decidir el modelo final (DeepSeek vs GPT) y el formato del informe.

## 13. Referencias

- `documentacion/PROYECTO-detalle.md` — secciones 4 (alcance beta), 5 (agentes) y 6.3 (capa de modelos).
- `documentacion/ARQUITECTURA.md` — secciones 5 (agentes), 6 (capa IA) y 7 (flujo).
- `documentacion/IMPLEMENTACION.md` — secciones 2.6 y 2.7 (cronología).
