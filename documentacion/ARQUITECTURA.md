# Arquitectura — Analizador de Resultados Financieros

> Versión: 1.3 · Fecha: 2026-08-12 · Stack: Node.js + Express + PostgreSQL + Frontend puro (migrable a React)

---

## 1. Stack tecnológico (decidido)

| Capa | Tecnología | Por qué |
|---|---|---|
| **Backend** | Node.js + Express (API REST) | Dominado en clase, ecosistema maduro, mismo idioma que el frontend |
| **Base de datos** | PostgreSQL | Se controla SQL; modelo relacional encaja (users, filings, analyses) |
| **Frontend** | HTML/CSS/JS puro (beta) | Sin curva de aprendizaje; se migrará a React en la Fase 2 |
| **Extracción PDF** | Librería de texto de PDF (ej. `pdf-parse`) | Extrae el texto del informe para los agentes |
| **Modelos IA** | Capa de abstracción propia (DeepSeek / GPT intercambiables) | Modelo final por decidir; la capa permite cambiar sin tocar agentes |
| **Almacenamiento PDFs** | Filesystem local (carpeta `uploads/`) | Suficiente para uso local; migrable a S3 |

---

## 2. Visión general de la arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (beta)                      │
│              HTML / CSS / JS puro (carpeta public/)         │
│         Vista: subir PDF · Vista: resultado del análisis    │
└───────────────────────────┬─────────────────────────────────┘
                            │  fetch() / FormData (multipart)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js + Express)              │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │ API Layer  │→ │ Services   │→ │ Sistema de Agentes   │   │
│  │ (routes/   │  │ (analysis, │  │ (registro + runner)  │   │
│  │ controllers│  │  pdf, auth │  │  Origin → Sector →   │   │
│  │            │  │  filing…)  │  │  Analyst             │   │
│  └────────────┘  └─────┬──────┘  └──────────┬───────────┘   │
│                        │                    │               │
│                        ▼                    ▼               │
│              ┌──────────────────┐  ┌───────────────────┐    │
│              │ PostgreSQL       │  │ Capa de Modelos IA │   │
│              │ (users,          │  │ (interfaz común:   │   │
│              │  analyses,       │  │  generate() →      │   │
│              │  filings)        │  │  DeepSeek / GPT)   │   │
│              └──────────────────┘  └───────────────────┘    │
│                                                             │
│              uploads/ (PDFs subidos, filesystem local)      │
└─────────────────────────────────────────────────────────────┘
```

### Principios rectores
1. **API REST pura**: el frontend solo habla con el backend vía endpoints JSON. El frontend es un detalle reemplazable (facilita migrar a React sin tocar nada más).
2. **Separación en capas**: API → Services → Agents → Models. Cada capa solo conoce a la inferior.
3. **Agentes extensibles**: se añaden agentes por país/sector registrándolos, sin modificar el runner.
4. **Modelos intercambiables**: los agentes nunca llaman a una API de IA directamente; siempre a través de la capa de modelos.

---

## 3. Estructura de carpetas (proyecto)

```
app/
├── server.js                  # Arranque de Express + estáticos + rutas + errorHandler
├── package.json               # Scripts: start, dev, db:migrate, db:seed
├── .env                       # Variables (no versionar): PORT, JWT_SECRET, DATABASE_URL/DB_*
├── config/
│   └── index.js               # Config central: port, database, jwtSecret, production
├── db/
│   ├── pool.js                # Pool de conexiones PostgreSQL
│   ├── schema.sql             # Esquema de la BD (users, analyses, filings)
│   ├── migrations.js          # Ejecutor sencillo de schema (npm run db:migrate)
│   ├── seed.js                # Datos demo idempotentes (npm run db:seed)
│   └── repositories/
│       ├── analysisRepository.js  # create/get/list/update de analyses
│       └── userRepository.js      # create/find de users
├── src/
│   ├── api/                   # Capa HTTP
│   │   ├── routes/
│   │   │   ├── auth.routes.js       # POST /api/auth/register|login|logout, GET /me
│   │   │   ├── analysis.routes.js   # POST /api/upload (multer, memoria)
│   │   │   └── analyses.routes.js   # (futuro) GET /api/analyses, GET /api/analyses/:id
│   │   └── controllers/
│   │       └── auth.controller.js   # Firma JWT y gestiona la cookie de sesión
│   ├── services/              # Lógica de negocio
│   │   ├── auth.service.js         # Registro/login (bcrypt, validaciones, AuthError)
│   │   ├── analysis.service.js     # Orquesta: PDF → agentes → resultado
│   │   ├── pdf.service.js          # Extracción de texto del PDF (pdf-parse)
│   │   ├── ai/                     # Capa de modelos IA
│   │   │   ├── modelProvider.js        # chat(messages) → proveedor activo
│   │   │   └── providers/
│   │   │       ├── mock.provider.js       # Heurística local (solo AI_PROVIDER=mock)
│   │   │       └── deepseek.provider.js   # API real de DeepSeek
│   │   └── (futuro) filing, subscription
│   ├── agents/                # Sistema de agentes
│   │   ├── baseAgent.js           # BaseAgent + AgentError
│   │   ├── agentRegistry.js       # Registro por nombre (origin registrado)
│   │   └── originAgent.js         # ¿Financiero + 10-Q/10-K + EE. UU.? (implementado)
│   ├── middleware/
│   │   ├── auth.middleware.js  # requireAuth: valida JWT de la cookie y carga req.user
│   │   └── errorHandler.js     # Errores uniformes JSON { error }
│   └── utils/
│       └── validate.js         # normalizeEmail, isValidEmail, isValidPassword
├── public/                    # Frontend (beta, JS puro)
│   ├── index.html             # Web "Terminal Cifra" (topbar + sidebar + secciones)
│   ├── styles.css             # Diseño clon TIKR (claro)
│   ├── app.js                 # Subida real → /api/upload, estados de agentes, errores
│   └── auth.js                # Modal login/registro, estado de sesión, logout
├── uploads/                   # PDFs subidos (pendiente: guardarlos aquí)
├── documentacion/             # PROYECTO*.md, ARQUITECTURA.md, IMPLEMENTACION.md
│   ├── backend/funcionalidades/<nombre>/    # Doc por funcionalidad (capa backend)
│   │   ├── register/                        # ✅ Registro/login
│   │   └── verificacion-informe/            # ✅ Verificación 10-Q/10-K
│   ├── frontend/funcionalidades/<nombre>/   # Doc por funcionalidad (capa frontend)
│   │   ├── register/                        # ✅ Registro/login
│   │   └── verificacion-informe/            # ✅ Verificación 10-Q/10-K
│   └── diario/YYYY/MM/YYYY-MM-DD.md         # Registro diario de cambios
├── agentes/                   # ENLACE → ~/.config/opencode/agent/ (tus agentes de opencode)
└── PROYECTO.md                # ENLACE → documentacion/PROYECTO.md (resumen inyectado)
```

### Enlaces simbólicos (acceso directo, no copias)

- **`agentes/`** → enlace a `~/.config/opencode/agent/`, la carpeta global con los agentes de opencode (`documentacion.md`, `agentes.md`). Es un **enlace, no una copia**: editar un archivo a través de `agentes/` modifica el archivo real del prompt. Los agentes integrados (`build`, `plan`, `explore`, `general`) no aparecen ahí porque vienen dentro del propio opencode.
- **`PROYECTO.md`** (raíz) → enlace a `documentacion/PROYECTO.md`, el resumen del proyecto que se inyecta en el prompt de todos los agentes (ver sección 11).
- Ambos enlaces están en `.gitignore`: existen solo en tu máquina, no se versionan.

---

## 4. Diseño de la base de datos (PostgreSQL)

### Tablas (beta)

```sql
-- Usuarios: se crea ahora aunque el registro llegue en Fase 3
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- bcrypt
    plan          TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'premium' (Fase 5)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Análisis realizados (histórico por usuario)
CREATE TABLE analyses (
    id           SERIAL PRIMARY KEY,
    user_id      INT REFERENCES users(id) ON DELETE CASCADE,  -- NULL = anónimo (beta)
    filename     TEXT NOT NULL,            -- nombre del PDF subido
    status       TEXT NOT NULL DEFAULT 'processing',  -- processing|done|error
    error        TEXT,                     -- mensaje de error si falla
    origin       TEXT,                     -- 'US' | error de origen
    sector       TEXT,                     -- 'defensive_consumer' | error de sector
    report       JSONB,                    -- informe final estructurado (formato por definir)
    model_used   TEXT,                     -- qué proveedor/modelo se usó
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Filings: histórico de resultados por empresa (Fase 2)
CREATE TABLE filings (
    id             SERIAL PRIMARY KEY,
    ticker         TEXT NOT NULL,
    company_name   TEXT NOT NULL,
    form_type      TEXT NOT NULL,          -- '10-Q' | '10-K'
    period         TEXT,                   -- ej. 'Q2 2025'
    accession_no   TEXT UNIQUE,            -- identificador del filing en SEC
    filing_url     TEXT,                   -- enlace al PDF oficial
    filed_at       DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_filings_ticker ON filings (ticker);
CREATE INDEX idx_analyses_user ON analyses (user_id);
```

### Observaciones
- `users.plan` y la tabla `users` completa: preparadas para **suscripciones (Fase 5)** sin migraciones traumáticas. La tabla ya se usa para registro/login (Fase 3).
- `analyses.user_id` nullable: la beta local funciona sin login; la auth ya existe, falta asociar el historial al usuario conectado.
- `report JSONB`: flexible para el formato final del informe (se fijará con los informes de referencia del usuario); el seed ya guarda un formato provisional.
- La tabla `filings` se rellena en la **Fase 2** (llamadas a la API de EDGAR/SEC); en beta no se usa, pero ya está definida.

---

## 5. Sistema de agentes

### Interfaz de agente (`src/agents/baseAgent.js`)

```js
export class BaseAgent {
  constructor({ name, description }) {
    this.name = name;         // ej. 'origin'
    this.description = description;
  }
  async run(_input) { throw new Error(`El agente ${this.name} no implementa run().`); }
}

export class AgentError extends Error {
  constructor(message, code = 'AGENT_ERROR') { super(message); this.code = code; }
}
```

### Registro (`agentRegistry.js`)

```js
const agents = new Map();
registerAgent(agent);   // agents.set(agent.name, agent)
getAgent(name);         // → agente o null
listAgents();           // → array de agentes
```

### Agentes actuales y futuros

| Agente | Archivo | Estado |
|---|---|---|
| `origin` (verificador de origen) | `src/agents/originAgent.js` | ✅ Implementado y probado |
| `sector` (verificador de sector) | `src/agents/sectorAgent.js` | ⏳ Pendiente |
| `analyst` (analista principal) | `src/agents/analystAgent.js` | ⏳ Pendiente |

### Comportamiento del pipeline

- El agente `origin` devuelve `{ origin: 'US', formType: '10-Q' | '10-K' }` o lanza `AgentError` con mensaje claro (códigos: `EMPTY_DOCUMENT`, `INVALID_MODEL_RESPONSE`, `NOT_FINANCIAL`, `NOT_USA`, `NOT_10Q_10K`).
- Si un agente falla → **el pipeline se detiene** y el error llega al frontend (y en el futuro a `analyses.error`).
- **Extensión futura**: para añadir Canadá se registra `OriginAgentCA`; para añadir tecnología, `SectorAgentTech` + `AnalystAgentTech`. El runner no cambia.

---

## 6. Capa de abstracción de modelos IA

### Interfaz común (`src/services/ai/modelProvider.js`)

```js
// Todos los proveedores implementan esta misma firma.
// Los agentes llaman SOLO a esta capa, nunca a la API de un proveedor.
export function chat(messages) { return getProvider().chat(messages); }
// messages: [{ role: 'system'|'user', content }] → string
```

### Implementaciones (`src/services/ai/providers/`)

| Proveedor | Cuándo se usa | Notas |
|---|---|---|
| `deepseek.provider.js` | Por defecto (o `AI_PROVIDER=deepseek`) | `POST api.deepseek.com/chat/completions` con fetch nativo; modelo `deepseek-chat` (o `AI_MODEL`), `temperature: 0`, `max_tokens: 400`; sin `DEEPSEEK_API_KEY` → error visible |
| `mock.provider.js` | Solo con `AI_PROVIDER=mock` | Heurística por patrones (SEC, FORM 10-Q/10-K, estados financieros); sin coste, para desarrollo |
| `openai.provider.js` | ⏳ Futuro (candidato GPT) | Misma interfaz |

### Selección del proveedor

- El proveedor activo se resuelve al arrancar: `AI_PROVIDER` si está definido; si no, `deepseek`.
- La única configuración del usuario es `DEEPSEEK_API_KEY` en `.env` (y `AI_MODEL` opcional).
- En Fase 5 (suscripciones): el proveedor se elegirá **según el plan del usuario** (free → modelo base, premium → modelo mejor). Mismo código, solo cambia quién elige el provider.

### Garantía clave

Los agentes **nunca** importan `deepseek` ni `mock` directamente. Solo usan `modelProvider.chat()`. Así, cambiar de modelo es editar `.env`, no código de agentes.

---

## 7. Flujo completo de un análisis (Fase 1)

### Estado actual (implementado)

```
Usuario → sube PDF (multipart) a POST /api/upload
    │
    ▼
Express + multer recibe el archivo en memoria (≤ 25 MB)     [no PDF → 422]
    │
    ▼
pdf.service extrae el texto del PDF (pdf-parse 2.4.5)
    │
    ▼
analysis.service → Pipeline de agentes (por ahora solo origin):
    OriginAgent → ¿financiero? → No → 422 NOT_FINANCIAL
                → ¿EE. UU.?    → No → 422 NOT_USA
                → ¿10-Q/10-K?  → No → 422 NOT_10Q_10K
                → Sí → { origin: 'US', formType }
    │
    ▼
Respuesta JSON al frontend → el panel muestra veredicto o error
```

### Queda pendiente en el flujo

```
[Pendiente] guardar el PDF en uploads/ con nombre único
[Pendiente] crear registro en analyses (status=processing) al empezar
[Pendiente] SectorAgent → ¿consumo defensivo? → No → error guardado, status=error
[Pendiente] AnalystAgent → genera informe (usa la capa de modelos)
[Pendiente] guardar report + status=done en analyses
[Pendiente] GET /api/analyses para el histórico real
```

### Endpoints API (beta)

| Método | Ruta | Función | Estado |
|---|---|---|---|
| `POST` | `/api/upload` | Sube PDF y verifica origen/tipo (multipart) | ✅ Implementado |
| `GET` | `/api/analyses` | Lista de análisis realizados (histórico) | ⏳ Pendiente |
| `GET` | `/api/analyses/:id` | Detalle de un análisis (incluye report JSONB) | ⏳ Pendiente |
| `POST` | `/api/auth/register` | Registro de usuario (email + contraseña ≥ 8) → cookie de sesión | ✅ Implementado |
| `POST` | `/api/auth/login` | Inicio de sesión → cookie de sesión | ✅ Implementado |
| `POST` | `/api/auth/logout` | Cierra la sesión (borra la cookie) | ✅ Implementado |
| `GET` | `/api/auth/me` | Usuario actual (requiere cookie válida) | ✅ Implementado |

*(Fase 2 añadirá: `GET /api/companies?q=TAP`, `GET /api/companies/:ticker/filings`, `GET /api/filings/:id/analyze`)*

### Autenticación (Fase 3, implementada)

- Sesión con **JWT en cookie httpOnly** (`SameSite=Lax`, 7 días, `secure` solo en producción). Sin almacenamiento de sesiones en BD.
- `bcryptjs` para el hash de contraseñas (`users.password_hash`); `cookie-parser` para leer la cookie.
- `src/services/auth.service.js` (lógica + errores con estado HTTP), `src/api/routes/auth.routes.js` y `src/api/controllers/auth.controller.js`.
- `src/middleware/auth.middleware.js` (`requireAuth`) protegerá los endpoints que necesiten usuario (ej. histórico por usuario).
- `src/middleware/errorHandler.js`: respuestas de error siempre JSON `{ error }` con el código HTTP correcto.
- Secretos en `.env` (`JWT_SECRET`). Pendiente: asociar análisis al usuario conectado (`analyses.user_id`) y límites por plan.

---

## 8. Plan de implementación (orden de trabajo)

| Paso | Contenido | Estado |
|---|---|---|
| 1 | **Scaffolding**: Express, `config/`, `server.js` con `/api/health` | ✅ Hecho |
| 2 | **PostgreSQL**: `db/pool.js`, `db/schema.sql`, tablas `users` y `analyses` | ✅ Hecho (+ repositorios y seed) |
| 3 | **Capa de modelos IA**: `modelProvider.js` + proveedores (`deepseek` real, `mock` heurístico) | ✅ Hecho (falta probar con key real) |
| 4 | **Sistema de agentes**: `baseAgent.js`, `agentRegistry.js`, `originAgent` | ✅ Hecho y probado; `sectorAgent` y `analystAgent` ⏳ |
| 5 | **PDF**: `pdf.service.js` (pdf-parse 2.4.5) + `POST /api/upload` | ✅ Hecho y probado |
| 6 | **Pipeline**: `analysis.service.js` con origin conectado; guardado en BD y resto de agentes ⏳ | 🔶 Parcial |
| 7 | **Frontend puro**: `public/` + subida real conectada a la API | ✅ Hecho (estados de agentes + errores en pantalla) |
| 8 | **Histórico**: `GET /api/analyses` + vista de historial | 🔶 Repositorio listo; endpoint y vista pendientes |
| 9 | **Formato del informe** con los informes de referencia del usuario | ⏳ Pendiente |
| 10 | **Autenticación** (registro/login, bcrypt, sesión JWT en cookie) | ✅ Hecho y probado |

> El detalle de todo lo implementado está en `documentacion/IMPLEMENTACION.md`.

---

## 9. Decisiones de arquitectura pendientes

| Decisión | Impacto |
|---|---|---|
| **Formato exacto del report JSONB** | Define el prompt del AnalystAgent y la vista de resultados. Se fija cuando el usuario aporte sus informes de referencia |
| **Librería de PDF** | ✅ Decidida: `pdf-parse` 2.4.5 (API `PDFParse`/`getText()`, compatible ESM) |
| **Modelo concreto (DeepSeek vs GPT)** | 🔶 En prueba: provider DeepSeek implementado (falta key real); GPT como proveedor futuro con la misma interfaz |
| **Límites del plan free** | Afecta solo a Fase 5, pero el campo `plan` ya existe |

---

## 10. Mitigación de riesgos

| Riesgo | Mitigación |
|---|---|
| PDF con tablas/escaneado que pierde texto | Extraer texto es el paso 1; si el texto sale vacío o demasiado corto, error claro: "No se pudo extraer texto" |
| Coste de API de IA | Empezar con modelo barato (DeepSeek) para desarrollo; limitar tamaño de texto enviado a los agentes (primeras N páginas si el informe es enorme) |
| Migrar frontend a React | Garantizado por API REST pura; el frontend nunca contiene lógica de negocio |
| SQL en los prompts | Recordatorio explícito en el prompt del AnalystAgent de que el análisis es financiero y no debe inventar cifras no presentes en el PDF |

---

## 11. Entorno de desarrollo: opencode (prompts y agentes)

Cómo se monta el contexto que reciben los agentes de opencode (no confundir con los agentes de la app de la sección 5).

### Configuración actual

| Archivo | Contenido |
|---|---|
| `opencode.json` (raíz del proyecto) | `"instructions": ["documentacion/PROYECTO.md"]` → inyecta el resumen en el prompt de todos los agentes |
| `agentes/` (enlace) | `documentacion.md` y `agentes.md` (prompts de los agentes de opencode) |

### Qué recibe la IA en cada mensaje

1. Prompt de sistema de opencode + esquemas de las herramientas permitidas.
2. Prompt del agente activo (archivo en `~/.config/opencode/agent/`).
3. `documentacion/PROYECTO.md` (resumen; el detalle está en `documentacion/PROYECTO-detalle.md`).
4. Historial de la sesión + mensaje actual + resultados de herramientas.

### Optimización de tokens (aplicada)

- **`PROYECTO.md` resumido** (~2.8 KB): el documento completo se movió a `PROYECTO-detalle.md`, que solo se lee cuando hace falta.
- **Prompts de agentes condensados** (`documentacion`, `agentes`).
- **Herramientas no usadas en `deny`** (`webfetch`, `task`, `skill`, `todowrite`, `websearch`, `apply_patch`): opencode deja de enviar sus esquemas al modelo.
- **Resultado medido** (modelo DeepSeek, mensaje "hola"): ~7.900 → **~4.925 tokens** de contexto por mensaje (-38 %).

### Regla importante

- Los cambios en `opencode.json`, prompts de agentes o `PROYECTO.md` **solo se aplican al reiniciar opencode** (la configuración se carga al arrancar).
- Los enlaces `agentes/` y `PROYECTO.md` están en `.gitignore` (no se versionan).

---

*Documento vivo: se actualiza conforme se avanza en la implementación.*
