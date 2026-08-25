# Arquitectura — Analizador de Resultados Financieros

> Versión: 2.0 · Fecha: 2026-08-15 · Stack: Node.js + Express 5 + PostgreSQL 16 + Frontend puro (migrable a React)

---

## 1. Stack tecnológico (decidido)

| Capa | Tecnología | Por qué |
|---|---|---|
| **Backend** | Node.js + Express 5 (API REST) | Dominado en clase, ecosistema maduro, mismo idioma que el frontend |
| **Base de datos** | PostgreSQL 16 | Se controla SQL; modelo relacional encaja (users, analyses, filings, watchlists, portfolio) |
| **Frontend** | HTML/CSS/JS puro (beta) | Sin curva de aprendizaje; migrable a React (API REST pura) |
| **Extracción PDF** | `pdf-parse` 2.4.5 (API `PDFParse`) | Extrae el texto del informe para los agentes |
| **PDF de informes** | `pdfkit` (informes IA) + Chrome headless (filings SEC) | Generación de PDFs; pdftoppm para previews |
| **Modelos IA** | Capa de abstracción propia (`modelProvider`) | Proveedores: `deepseek` (activo), `opencode-go`, `mock`; cambiar = editar `.env` |
| **Correos** | `nodemailer` vía SMTP (Gmail) | Códigos de verificación y recuperación; fallback consola sin SMTP |
| **Almacenamiento PDFs** | Filesystem local (`uploads/`) | Suficiente para uso local; migrable a S3 |

---

## 2. Visión general de la arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (beta)                      │
│              HTML / CSS / JS puro (carpeta public/)         │
│   index.html (Inicio)  ·  empresa.html (/empresa/:ticker)   │
│   app.js · empresa.js · auth.js · watchlists.js · portfolio.js
└───────────────────────────┬─────────────────────────────────┘
                            │  fetch() / FormData (multipart)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js + Express)              │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │ API Layer  │→ │ Services   │→ │ Sistema de Agentes   │   │
│  │ (routes/)  │  │ (auth, edgar,│ │ (origin → sector →   │   │
│  │            │  │  market,   │  │  analyst)            │   │
│  │            │  │  analysis, │  └──────────┬───────────┘   │
│  │            │  │  report,   │             │               │
│  │            │  │  portfolio)│             ▼               │
│  └────────────┘  └─────┬──────┘  ┌───────────────────┐      │
│                        │         │ Capa de Modelos IA │      │
│                        ▼         │ modelProvider +    │      │
│              ┌──────────────────┐ │ chat/chatJson     │      │
│              │ PostgreSQL       │ │ deepseek·opencode·mock   │
│              │ users, analyses, │ └───────────────────┘      │
│              │ filings,         │                            │
│              │ verification_codes, watchlists,               │
│              │ watchlist_items, portfolio_transactions       │
│              └──────────────────┘                            │
│                                                             │
│   uploads/ (PDFs subidos y generados, previews)             │
│   SEC EDGAR (JSON + XBRL) · Yahoo Finance (chart/quote)     │
└─────────────────────────────────────────────────────────────┘
```

### Principios rectores
1. **API REST pura**: el frontend solo habla con el backend vía endpoints JSON.
2. **Separación en capas**: API → Services → Agents → Models; repositorios como única capa SQL.
3. **Agentes extensibles**: se añaden agentes por país/sector registrándolos, sin modificar el runner.
4. **Modelos intercambiables**: los agentes nunca llaman a una API de IA directamente; solo `modelProvider.chat/chatJson`.

---

## 3. Estructura de carpetas (proyecto)

```
app/
├── server.js                  # Express: estáticos + API + /empresa/:ticker + errorHandler
├── package.json               # Scripts: start, dev, db:migrate, db:seed, test:email
├── .env / .env.example        # PORT, DB_*, JWT_SECRET, SMTP_*, AI_*, CHROME_BIN...
├── config/index.js            # Config central
├── db/
│   ├── pool.js                # Pool PostgreSQL
│   ├── schema.sql             # Todas las tablas (migraciones idempotentes)
│   ├── migrations.js          # npm run db:migrate
│   ├── seed.js                # Datos demo idempotentes
│   └── repositories/
│       ├── analysisRepository.js   # create/list/update analyses (filtros)
│       ├── userRepository.js       # users + verification_codes
│       ├── watchlistRepository.js  # listas de seguimiento (CRUD + upsert)
│       └── portfolioRepository.js  # transacciones de cartera
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.routes.js       # /api/auth/* (8 rutas)
│   │   │   ├── analysis.routes.js   # /api/upload, /api/analyses, /api/reports/:file
│   │   │   ├── screener.routes.js   # /api/screener/* (8 rutas)
│   │   │   ├── watchlists.routes.js # /api/watchlists/*
│   │   │   └── portfolio.routes.js  # /api/portfolio/*
│   │   └── controllers/
│   │       └── auth.controller.js   # JWT + cookie
│   ├── services/
│   │   ├── auth.service.js          # Registro/login/verificación/reset (AuthError)
│   │   ├── email.service.js         # nodemailer; MAIL_TO_OVERRIDE; fallback consola
│   │   ├── edgar.service.js         # SEC: búsqueda, facts, series, rescate XBRL, perfil, filings, documento/preview
│   │   ├── market.service.js        # Yahoo: chart+MA100, quote, profile, dividendos
│   │   ├── analysis.service.js      # Pipeline: texto/PDF/HTML → 3 agentes → PDF → guardado
│   │   ├── pdf.service.js           # pdf-parse
│   │   ├── report.service.js        # PDF del informe (pdfkit)
│   │   ├── portfolio.service.js     # FIFO, dividendos, sector, summary, alocaciones
│   │   └── ai/
│   │       ├── modelProvider.js     # chat/chatJson (reintentos) → proveedor activo
│   │       └── providers/
│   │           ├── mock.provider.js         # heurística local
│   │           ├── deepseek.provider.js     # API directa DeepSeek (activo)
│   │           └── opencode-go.provider.js  # OpenCode Go (alias 'opencode')
│   ├── agents/
│   │   ├── baseAgent.js           # BaseAgent + AgentError
│   │   ├── agentRegistry.js       # registro por nombre
│   │   ├── originAgent.js         # financiero + 10-Q/10-K + EE. UU.
│   │   ├── sectorAgent.js         # consumo defensivo
│   │   ├── analystAgent.js        # 2 fases (extracción + informe) + prompts por sector
│   │   └── prompts/consumo-defensivo.md  # reglas del sector
│   ├── middleware/
│   │   ├── auth.middleware.js     # requireAuth + resolveUser (opcional)
│   │   └── errorHandler.js        # JSON { error, code? }
│   └── utils/validate.js          # email/contraseña
├── public/                        # Frontend puro
│   ├── index.html                 # Inicio: buscador, seguimiento, cartera, análisis, histórico
│   ├── empresa.html               # /empresa/:ticker: perfil, informes, datos financieros
│   ├── styles.css                 # Clon TIKR claro + todo el diseño
│   ├── app.js                     # Inicio: búsqueda, análisis, histórico, secciones
│   ├── empresa.js                 # Empresa: perfil, gráficos, tabla, filings
│   ├── auth.js                    # Sesión + modal (5 pantallas)
│   ├── watchlists.js              # Módulo compartido de listas de seguimiento
│   └── portfolio.js               # Módulo compartido de cartera
├── scripts/test-email.js          # npm run test:email
├── uploads/
│   ├── generated/filings/         # PDFs generados de la SEC (caché)
│   │   └── previews/{accession}/  # PNG por página (pdftoppm)
│   └── generated/                 # PDFs de informes IA (UUID)
├── documentacion/                 # PROYECTO*.md, ARQUITECTURA.md, IMPLEMENTACION.md
│   ├── backend/funcionalidades/   # register, verificacion-informe, screener, listas-seguimiento, cartera, historico-analisis
│   ├── frontend/funcionalidades/  # idem (capa frontend)
│   └── diario/YYYY/MM/YYYY-MM-DD.md
├── agentes/ → ~/.config/opencode/agent/   (enlace, no versionado)
└── PROYECTO.md → documentacion/PROYECTO.md (enlace, no versionado)
```

### Enlaces simbólicos
- **`agentes/`** → enlace a `~/.config/opencode/agent/` (prompts de los agentes de opencode).
- **`PROYECTO.md`** (raíz) → enlace a `documentacion/PROYECTO.md` (resumen inyectado).
- Ambos están en `.gitignore`.

---

## 4. Diseño de la base de datos (PostgreSQL)

```sql
-- Usuarios + verificación
CREATE TABLE users (
    id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free'
      CHECK (plan IN ('free','premium')),
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE verification_codes (
    id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Análisis (histórico por usuario)
CREATE TABLE analyses (
    id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'processing'
      CHECK (status IN ('processing','done','error')),
    error TEXT, origin TEXT, sector TEXT, report JSONB, model_used TEXT,
    ticker TEXT, company_name TEXT, period_end DATE, pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Filings (preparada; hoy se consulta al vuelo desde EDGAR)
CREATE TABLE filings (
    id SERIAL PRIMARY KEY, ticker TEXT NOT NULL, company_name TEXT NOT NULL,
    form_type TEXT NOT NULL CHECK (form_type IN ('10-Q','10-K')), period TEXT,
    accession_no TEXT UNIQUE, filing_url TEXT, filed_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listas de seguimiento (multi-lista; sustituyen a favorites, migrado)
CREATE TABLE watchlists (
    id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (user_id, name)
);
CREATE TABLE watchlist_items (
    id SERIAL PRIMARY KEY, watchlist_id INT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL, company_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (watchlist_id, ticker)
);

-- Cartera (el estado se reconstruye de las transacciones)
CREATE TABLE portfolio_transactions (
    id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL, company_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('buy','sell')),
    shares NUMERIC(18,6) NOT NULL CHECK (shares > 0),
    price NUMERIC(18,6) NOT NULL CHECK (price >= 0),
    trade_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Índices: `idx_analyses_user`, `(user_id, period_end)`, `(user_id, created_at)`, `idx_filings_ticker`, `idx_watchlists_user`, `idx_watchlist_items_watchlist/ticker`, `idx_portfolio_transactions_user (user_id, trade_date, id)` y `(ticker)`, `idx_verification_codes_user`.

**Migraciones**: `schema.sql` usa `CREATE TABLE IF NOT EXISTS` y `ADD COLUMN IF NOT EXISTS`; la migración de favoritos copia los datos a la lista por defecto "Favoritos" y elimina la tabla `favorites`.

---

## 5. Sistema de agentes

```js
// baseAgent.js
export class BaseAgent {
  constructor({ name, description }) { this.name = name; this.description = description; }
  async run(_input) { throw new Error(`El agente ${this.name} no implementa run().`); }
}
export class AgentError extends Error { constructor(message, code='AGENT_ERROR') { super(message); this.code = code; } }
```

| Agente | Archivo | Estado |
|---|---|---|
| `origin` (origen: financiero + EE. UU. + 10-Q/10-K) | `src/agents/originAgent.js` | ✅ Implementado y probado |
| `sector` (consumo defensivo) | `src/agents/sectorAgent.js` | ✅ Implementado y probado |
| `analyst` (analista: extracción + informe + PDF) | `src/agents/analystAgent.js` | ✅ Implementado y probado |

- Reglas por sector en `src/agents/prompts/<sector>.md` (hoy `consumo-defensivo.md`); el analista las carga según `sector` (`NO_SECTOR_RULES` si no existen).
- **Extensión futura**: añadir `OriginAgentCA`, `SectorAgentTech` + `AnalystAgentTech` registrándolos; el runner no cambia.

---

## 6. Capa de abstracción de modelos IA

```js
// modelProvider.js — los agentes llaman SOLO a esta capa
export function chat(messages) { return getProvider().chat(messages); }
export async function chatJson(messages, attempts = 2) { /* reintenta ante vacío/JSON inválido/error transitorio */ }
```

| Proveedor | Cuándo | Notas |
|---|---|---|
| `deepseek.provider.js` | **Activo** (`AI_PROVIDER=deepseek` o por defecto) | `api.deepseek.com/chat/completions`, modelo `deepseek-chat`/`AI_MODEL`, `temperature: 0`, limpieza de ```json```. 22–23 s por análisis, fiable |
| `opencode-go.provider.js` | `AI_PROVIDER=opencode`/`opencode-go` | `opencode.ai/zen/go/v1/chat/completions`, `deepseek-v4-flash`; probado pero intermitente (145–247 s, fallos de JSON) |
| `mock.provider.js` | Solo `AI_PROVIDER=mock` | Heurística local sin coste; respuesta mínima para el analista |

Configuración en `.env`: `AI_PROVIDER`, `DEEPSEEK_API_KEY`, `OPENCODE_GO_API_KEY`, `AI_MODEL`, `OPENCODE_GO_MODEL`, **`AI_MAX_TOKENS=16000`** (el informe supera 8000 tokens), **`AI_REQUEST_TIMEOUT_MS=180000`**.

**Garantía clave**: los agentes nunca importan un proveedor concreto; cambiar de API es editar `.env`. En Fase 5, el proveedor se elegirá según el plan del usuario.

---

## 7. Flujo completo de un análisis (implementado)

```
PDF (subida manual) o filing de la SEC (PDF/HTML)
    │
    ▼
texto (pdf-parse) o htmlToText
    │
    ▼
analysis.service (analyzePdf / analyzeText):
    1. originAgent → NOT_FINANCIAL / NOT_USA / NOT_10Q_10K / { origin:'US', formType }
    2. sectorAgent → NOT_DEFENSIVE_CONSUMER / { sector:'defensive_consumer' }
    3. analystAgent → extracción (chatJson) → informe (chatJson + reglas del sector)
    4. report.service → PDF (uploads/generated/<uuid>.pdf)
    5. saveAnalysis (si hay userId) → analyses (status done, report, pdf_url, ...)
    │
    ▼
200 { ok, origin, formType, sector, report, pdfUrl, saved } (+ error 422 con code si falla un agente)
```

### Endpoints API

| Método | Ruta | Función | Estado |
|---|---|---|---|
| `POST` | `/api/upload` | Sube PDF y ejecuta el pipeline completo | ✅ |
| `GET` | `/api/analyses` | Histórico por usuario con filtros (requireAuth) | ✅ |
| `GET` | `/api/reports/:file` | Sirve el PDF del informe generado | ✅ |
| `GET` | `/api/screener/search?q=` | Busca empresas en EDGAR | ✅ |
| `GET` | `/api/screener/company/:ticker` | Series anuales/trimestrales + statements + perfil (+ `authenticated`) | ✅ |
| `GET` | `/api/screener/company/:ticker/chart` | Precios (3m…all) + MA100 (`ma=1`) | ✅ |
| `GET` | `/api/screener/company/:ticker/filings` | Histórico 10-Q/10-K (máx. 40) | ✅ |
| `GET` | `.../filings/:accession/document` | Documento (PDF/HTML; `download=1`) | ✅ |
| `GET` | `.../filings/:accession/preview` + `/pages/:page` | Vista previa por páginas (PNG) | ✅ |
| `POST` | `.../filings/:accession/analyze` | Analiza el filing (mismo pipeline) | ✅ |
| `POST` | `/api/auth/register` · `/verify` · `/resend-code` | Registro + verificación de correo | ✅ |
| `POST` | `/api/auth/login` · `/logout` · `/me` | Sesión (403 `EMAIL_NOT_VERIFIED` si no verificado) | ✅ |
| `POST` | `/api/auth/forgot-password` · `/reset-password` | Recuperación de contraseña | ✅ |
| `GET/POST/PATCH/DELETE` | `/api/watchlists...` | Listas de seguimiento (CRUD listas + items, requireAuth) | ✅ |
| `GET/POST/DELETE` | `/api/portfolio...` | Cartera (estado, transacciones, borrado protegido, requireAuth) | ✅ |

### Autenticación

- **JWT en cookie httpOnly** (`SameSite=Lax`, 7 días, `secure` solo en producción); sin sesiones en BD.
- `register` no inicia sesión: genera código de 6 dígitos (SHA-256, 15 min, máx. 5 intentos) y lo envía por SMTP (consola sin SMTP). `verify` valida y emite la cookie. `login` bloquea cuentas sin verificar (403 `EMAIL_NOT_VERIFIED`).
- `forgot-password` no filtra cuentas (responde igual si el email no existe); `reset-password` valida código, cambia el hash y marca verificado.
- `requireAuth` (obligatoria) y `resolveUser` (opcional: devuelve usuario o `null` — usada por el screener para `authenticated` y por los análisis para `saved`).

---

## 8. Plan de implementación (estado)

| Paso | Contenido | Estado |
|---|---|---|
| 1 | Scaffolding Express + config | ✅ Hecho |
| 2 | PostgreSQL + repositorios + seed | ✅ Hecho |
| 3 | Capa de modelos IA (deepseek/opencode-go/mock) | ✅ Hecho (DeepSeek activo) |
| 4 | Sistema de agentes (origin, sector, analyst) | ✅ Hecho y probado |
| 5 | PDF (pdf-parse) + `POST /api/upload` | ✅ Hecho |
| 6 | Pipeline completo (3 agentes + PDF + guardado) | ✅ Hecho |
| 7 | Frontend puro (Inicio + Empresa) | ✅ Hecho |
| 8 | Histórico (`GET /api/analyses` + filtros + vista) | ✅ Hecho |
| 9 | Formato del informe (prompt consumo-defensivo) | 🔶 Base en producción; refinar con referencias |
| 10 | Autenticación completa (verificación + recuperación) | ✅ Hecho |
| 11 | Fase 2 completa (filings, preview, descarga, analizar) | ✅ Hecho |
| 12 | Extras: listas de seguimiento + cartera + bloqueo PRO | ✅ Hecho |
| 13 | Fase 4 (multi-periodo) / Fase 5 (planes) / Fase 6 (países/sectores) | ⏳ Pendiente |

> El detalle de todo lo implementado está en `documentacion/IMPLEMENTACION.md`.

---

## 9. Decisiones de arquitectura

| Decisión | Detalle |
|---|---|
| **Stack** | Node.js + Express 5 + PostgreSQL 16 + frontend puro (migrable a React) |
| **Librería de PDF** | `pdf-parse` 2.4.5 (API `PDFParse`/`getText()`, compatible ESM) |
| **PDF de informes IA** | `pdfkit`; PDFs de filings con Chrome headless (`--user-agent` declarado) y previews con `pdftoppm` |
| **Modelo IA activo** | `AI_PROVIDER=deepseek` (directo): 22–23 s, fiable. OpenCode Go probado (intermitente). Revisar a medio plazo |
| **Correos** | `nodemailer` + SMTP Gmail; `MAIL_TO_OVERRIDE` para pruebas; fallback consola |
| **Sesión** | JWT en cookie httpOnly, 7 días, SameSite=Lax |
| **Screener sin huecos** | Rescate desde instancias XBRL (solo si falta algo), `buildSeries` en fases, reintentos 429 |
| **Frontend por páginas** | `/` (Inicio) y `/empresa/:ticker` (Empresa); módulos compartidos `watchlists.js`/`portfolio.js` |
| **Límites plan free** | Campo `plan` ya existe; bloqueo PRO del cribador como primer límite real (Fase 5 pendiente) |

## 10. Mitigación de riesgos

| Riesgo | Mitigación |
|---|---|
| PDF escaneado sin texto | Error claro "No se pudo extraer texto" (`EMPTY_DOCUMENT`) |
| Coste de API de IA | DeepSeek barato; texto limitado a 80.000 caracteres; timeout 180 s |
| Fallos intermitentes del modelo | `chatJson` reintenta; UI con Reintentar; avisos progresivos |
| SEC bloquea/limita | User-Agent declarado, cachés (24 h/6 h), reintentos 429, concurrencia 5 |
| Filings sin PDF | Generación con Chrome (cacheada) + fallback HTML |
| Preview PDF en iframe | Previews por imágenes (pdftoppm) |
| Migrar frontend a React | API REST pura; la lógica de negocio vive en el backend |
| SQL en los prompts | El prompt del analista prohíbe inventar cifras no presentes en el informe |

---

## 11. Entorno de desarrollo: opencode (prompts y agentes)

- `opencode.json` → `"instructions": ["documentacion/PROYECTO.md"]` (resumen inyectado; el detalle en `PROYECTO-detalle.md`).
- `agentes/` → enlace a `~/.config/opencode/agent/` (prompts de los agentes de opencode).
- Optimización de tokens aplicada (documento resumido, prompts condensados, herramientas en `deny`).
- Los cambios en `opencode.json`, prompts o `PROYECTO.md` se aplican al reiniciar opencode.

---

*Documento vivo: se actualiza conforme se avanza en la implementación.*
