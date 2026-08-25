# Funcionalidad: Histórico de análisis por usuario — Backend

> Capa: **backend** · Fecha: 2026-08-14 (guardado + filtros) · Estado: **implementado y probado**

---

## 1. Objetivo

Que cada análisis completado (subida manual o desde la SEC) se **guarde en la base de datos asociado al usuario** que lo hizo, y que exista un endpoint para **listarlo y filtrarlo por empresa y por fecha** (fecha de los resultados o fecha del análisis). Cumple el requisito 6.5 del proyecto (histórico de análisis por usuario).

## 2. Alcance

**Incluido:**
- Guardado automático tras un análisis con éxito (origen, sector, informe, modelo, ticker, empresa, fecha de fin de periodo, URL del PDF).
- `GET /api/analyses` (protegido) con filtros por empresa y rangos de fechas.
- Sin sesión **no se guarda nada** (decisión de producto); los endpoints de análisis devuelven `saved: true/false`.
- `periodTitle` legible derivado del informe (con fallback para datos demo del seed).

**Excluido:**
- Vista de detalle del informe dentro de la web (se abre el PDF en otra pestaña; decisión del usuario).
- Análisis anónimos guardados (no se guardan).

## 3. Base de datos (`db/schema.sql`)

La tabla `analyses` se amplía (migraciones `ADD COLUMN IF NOT EXISTS` idempotentes):

```sql
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ticker TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS pdf_url TEXT;

CREATE INDEX IF NOT EXISTS idx_analyses_user_period ON analyses (user_id, period_end);
CREATE INDEX IF NOT EXISTS idx_analyses_user_created ON analyses (user_id, created_at);
```

## 4. Repositorio (`db/repositories/analysisRepository.js`)

- `createAnalysis({ userId, filename, ... })`: acepta los campos nuevos (`ticker`, `companyName`, `periodEnd`, `pdfUrl`); `status` por defecto `processing`, luego se actualiza.
- `updateAnalysis(id, fields)`: whitelist de columnas (incluye `origin`, `sector`, `report`, `model_used`).
- `listAnalyses({ userId, limit, ticker, periodFrom, periodTo, createdFrom, createdTo })`:
  - Filtro de empresa: `ticker` **o** nombre con `ILIKE` (búsqueda parcial).
  - Filtro por fecha de resultados: `period_end BETWEEN periodFrom AND periodTo`.
  - Filtro por fecha del análisis: `(created_at AT TIME ZONE 'UTC')::date BETWEEN ...` — cast a fecha **en UTC** para no depender de la zona horaria de la sesión de BD (bug detectado y corregido).

## 5. Guardado del análisis (`src/services/analysis.service.js`)

- `analyzeText(text, { userId, filename })` / `analyzePdf(buffer, { userId, filename })`: tras ejecutar el pipeline completo (origen → sector → analista → PDF), si hay `userId` crea el registro:
  - `status: 'done'`, `ticker`/`company` desde el informe (`report.ticker`, `report.company`), `periodEnd` desde `report.reportingPeriod` (formato `AAAA-MM-DD`; si no cumple → `null`), `pdfUrl` del PDF generado.
  - Después actualiza con `origin`, `sector`, `report` completo y `model_used` (`AI_PROVIDER`).
- Si el guardado falla, se registra en consola **sin romper la respuesta** del análisis.
- Sin `userId` → no se guarda y se responde igualmente.

### `analystAgent`

El informe final incluye `reportingPeriod` (fecha fin de periodo en `AAAA-MM-DD`, copiada de la extracción), que alimenta la columna `period_end` y el filtro "fecha de los resultados".

## 6. Endpoints

### `GET /api/analyses` (requireAuth)

| Parámetro | Uso |
|---|---|
| `ticker` | Empresa (ticker o nombre, ILIKE) |
| `periodFrom` / `periodTo` | Rango de fecha de resultados (`period_end`) |
| `createdFrom` / `createdTo` | Rango de fecha del análisis (`created_at` UTC) |
| `limit` | Máx. filas (por defecto del repositorio) |

Respuesta: `{ ok, analyses: [{ id, filename, ticker, companyName, periodEnd, periodTitle, status, error, createdAt, pdfUrl }] }`. `periodTitle` se deriva del `report` (con fallback a `period` para los datos demo del seed).

### Análisis que guardan (respuesta con `saved`)

- `POST /api/upload` (subida manual) — resuelve el usuario por cookie y pasa `filename` original.
- `POST /api/screener/company/:ticker/filings/:accession/analyze` (desde la SEC) — `filename` = `TICKER-ACCESSION.pdf`.

Ambos responden `{ ok, origin, formType, sector, report, pdfUrl, saved: Boolean(user) }`.

## 7. Errores y casos límite

| Caso | Respuesta |
|---|---|
| `GET /api/analyses` sin sesión | 401 |
| Sin coincidencias | 200 `{ ok, analyses: [] }` |
| Guardado con BD caída | El análisis responde OK; el fallo solo se loguea en consola |
| `reportingPeriod` inválido | `period_end` queda `null` (el análisis se guarda igualmente) |

## 8. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `db/schema.sql` | Columnas nuevas + índices. |
| `db/repositories/analysisRepository.js` | `createAnalysis` ampliado y `listAnalyses` con filtros (fechas en UTC). |
| `src/agents/analystAgent.js` | Informe con `reportingPeriod`. |
| `src/services/analysis.service.js` | `saveAnalysis` tras el pipeline; `htmlToText` para documentos HTML. |
| `src/api/routes/analysis.routes.js` | `POST /api/upload`, `GET /api/analyses`, `GET /api/reports/:file`. |
| `src/api/routes/screener.routes.js` | `POST .../analyze` (guarda con `userId`). |

## 9. Decisiones y motivos

| Decisión | Motivo |
|---|---|
| **Sin sesión no se guarda** | Beta local: el anónimo ve el resultado pero no genera ruido en BD; el frontend avisa "inicia sesión para guardar". |
| **Abrir el PDF en otra pestaña** | Decisión del usuario: el PDF generado ya contiene el informe completo; la vista de detalle en web queda para más adelante. |
| **Filtro de fecha de resultados con `period_end`** | Usa el `reportDate` de la SEC / `reportingPeriod` del informe (fecha de fin de periodo), no la fecha de presentación. |
| **Fechas en UTC** | El cast `(created_at AT TIME ZONE 'UTC')::date` evita desfases según la zona de la sesión de BD. |
| **Guardado no bloqueante** | Un fallo de BD no debe tumbar el resultado del análisis. |

## 10. Pruebas realizadas

- Migración aplicada; `GET /api/analyses` verificado de extremo a extremo con usuario temporal (registro → verificación → login → guardado → listado con filtros por ticker y rango de fechas).
- Casos sin sesión (401) y sin coincidencias.
- `node --check` correcto en todos los JS.

## 11. Relación con otros módulos

- **Frontend**: sección "Mis análisis" (ver `documentacion/frontend/funcionalidades/historico-analisis/`).
- **Verificación/análisis**: el guardado ocurre al final del pipeline (`analysis.service.js`).
- **Screener**: el botón "Analizar con IA" de un filing también guarda (mismo flujo).

## 12. Pendientes

- Vista de detalle del análisis dentro de la web (por ahora se abre el PDF).
- Asociar también las subidas fallidas (status `error`) al histórico si el usuario lo pide.
