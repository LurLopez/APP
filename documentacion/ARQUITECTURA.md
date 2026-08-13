# Arquitectura — Analizador de Resultados Financieros

> Versión: 1.0 · Fecha: 2026-08-12 · Stack: Node.js + Express + PostgreSQL + Frontend puro (migrable a React)

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
├── server.js                  # Arranque de Express
├── package.json
├── .env                       # Variables (no versionar)
├── config/
│   └── index.js               # Lectura de .env (puerto, BD, proveedor IA…)
├── db/
│   ├── pool.js                # Pool de conexiones PostgreSQL
│   ├── schema.sql             # Esquema de la BD (crear tablas)
│   └── migrations.js          # Ejecutor sencillo de schema (beta)
├── src/
│   ├── api/                   # Capa HTTP
│   │   ├── routes/
│   │   │   ├── upload.routes.js     # POST /api/upload
│   │   │   └── analyses.routes.js   # GET /api/analyses, GET /api/analyses/:id
│   │   └── controllers/
│   │       ├── upload.controller.js
│   │       └── analyses.controller.js
│   ├── services/              # Lógica de negocio
│   │   ├── analysis.service.js     # Orquesta: PDF → agentes → guardar
│   │   ├── pdf.service.js          # Extracción de texto del PDF
│   │   └── (futuro) auth, filing, subscription
│   ├── agents/                # Sistema de agentes
│   │   ├── agentRegistry.js        # Registro y orden de ejecución
│   │   ├── baseAgent.js            # Interfaz/plantilla de agente
│   │   └── agents/
│   │       ├── originAgent.js      # ¿Es de EE. UU.? (beta)
│   │       ├── sectorAgent.js      # ¿Es consumo defensivo? (beta)
│   │       └── analystAgent.js     # Análisis principal (beta)
│   ├── models/                # Capa de abstracción IA
│   │   ├── modelProvider.js        # Interfaz común: generate(messages)
│   │   ├── deepseekProvider.js
│   │   └── openaiProvider.js
│   ├── middleware/
│   │   └── errorHandler.js    # Errores uniformes JSON
│   └── utils/
│       └── validate.js        # Validación de entradas
├── public/                    # Frontend (beta, JS puro)
│   ├── index.html             # Vista subir PDF
│   ├── result.html            # Vista resultado de análisis
│   ├── css/style.css
│   └── js/main.js             # fetch() a la API
└── uploads/                   # PDFs subidos (filesystem local)
```

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
- `users.plan` y la tabla `users` completa: preparadas para **suscripciones (Fase 5)** sin migraciones traumáticas.
- `analyses.user_id` nullable: la beta local funciona sin login; cuando llegue la auth, se asocia el historial.
- `report JSONB`: flexible para el formato final del informe (se fijará con los informes de referencia del usuario).
- La tabla `filings` se rellena en la **Fase 2** (llamadas a la API de EDGAR/SEC); en beta no se usa, pero ya está definida.

---

## 5. Sistema de agentes

### Interfaz de agente (`baseAgent.js`)

```js
class BaseAgent {
  constructor(id, name) {
    this.id = id;      // ej. 'origin'
    this.name = name;  // ej. 'Verificador de origen'
  }
  async run({ pdfText, metadata }) {
    throw new Error('Debe implementarse');
  }
}
```

### Registro y orden (`agentRegistry.js`)

```js
// El orden del array = orden de ejecución del pipeline
const pipeline = [
  new OriginAgent(),     // 1. ¿Es de EE. UU.?
  new SectorAgent(),     // 2. ¿Es consumo defensivo?
  new AnalystAgent(),    // 3. Análisis principal
];
```

### Comportamiento del pipeline
- Los agentes verificadores (`origin`, `sector`) devuelven `{ ok: true }` o lanzan `AgentError` con mensaje claro.
- Si un agente falla → **el pipeline se detiene** y el error se guarda en `analyses.error` (ej. `"Este informe no es de una empresa de EE. UU."`).
- El último agente (`analyst`) genera el informe y lo devuelve para guardarlo en `report`.
- **Extensión futura**: para añadir Canadá se registra `OriginAgentCA`; para añadir tecnología, `SectorAgentTech` + `AnalystAgentTech`. El runner no cambia.

---

## 6. Capa de abstracción de modelos IA

### Interfaz común (`modelProvider.js`)

```js
// Todos los proveedores implementan esta misma firma.
// Los agentes llaman SOLO a esta capa, nunca a la API de un proveedor.
class ModelProvider {
  async generate({ system, messages, maxTokens }) {
    // returns string
    throw new Error('Debe implementarse');
  }
}
```

### Implementaciones
- `deepseekProvider.js` — candidato A (por comparar)
- `openaiProvider.js` — candidato B (por comparar)

### Selección del proveedor (`config/index.js`)
- En beta: variable de entorno `AI_PROVIDER=deepseek|openai` + `AI_API_KEY` + `AI_MODEL`.
- En Fase 5 (suscripciones): el proveedor se elegirá **según el plan del usuario** (free → modelo base, premium → modelo mejor). Mismo código, solo cambia quién elige el provider.

### Garantía clave
Los agentes **nunca** importan `deepseek` ni `openai` directamente. Solo usan `modelProvider.get()` que devuelve la implementación activa. Así, cambiar de modelo es editar `.env`, no código de agentes.

---

## 7. Flujo completo de un análisis (Fase 1)

```
Usuario → sube PDF (multipart) a POST /api/upload
    │
    ▼
Express recibe archivo → se guarda en uploads/ con nombre único
    │
    ▼
pdf.service extrae el texto del PDF (pdf-parse)
    │
    ▼
analysis.service crea registro en analyses (status=processing)
    │
    ▼
Pipeline de agentes:
    OriginAgent  → ¿EE. UU.?  → No → error guardado, status=error
    SectorAgent  → ¿Consumo defensivo? → No → error guardado, status=error
    AnalystAgent → genera informe (usa la capa de modelos)
    │
    ▼
Se guarda report + status=done en analyses
    │
    ▼
Respuesta JSON al frontend → resultado.html muestra el informe
```

### Endpoints API (beta)

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/upload` | Sube PDF y lanza el análisis (multipart) |
| `GET` | `/api/analyses` | Lista de análisis realizados (histórico) |
| `GET` | `/api/analyses/:id` | Detalle de un análisis (incluye report JSONB) |

*(Fase 2 añadirá: `GET /api/companies?q=TAP`, `GET /api/companies/:ticker/filings`, `GET /api/filings/:id/analyze`)*

---

## 8. Plan de implementación (orden de trabajo)

1. **Scaffolding**: `npm init`, Express, `config/`, `server.js` con `/api/health`.
2. **PostgreSQL**: `db/pool.js`, `db/schema.sql`, crear tablas `users` y `analyses`.
3. **Capa de modelos**: `modelProvider.js` + `deepseekProvider.js` (mock primero, luego API real).
4. **Sistema de agentes**: `baseAgent.js`, `agentRegistry.js`, los 3 agentes de la beta (con prompt básico).
5. **PDF**: `pdf.service.js` (pdf-parse) + endpoint `POST /api/upload`.
6. **Pipeline**: `analysis.service.js` conectando todo + guardado en BD.
7. **Frontend puro**: `public/index.html` (subir PDF) + `public/result.html` (mostrar informe) + `public/js/main.js`.
8. **Histórico**: `GET /api/analyses` + vista de historial.
9. **Definir formato del informe** con los informes de referencia del usuario (afecta al prompt del `AnalystAgent` y al `report JSONB`).

---

## 9. Decisiones de arquitectura pendientes

| Decisión | Impacto |
|---|---|
| **Formato exacto del report JSONB** | Define el prompt del AnalystAgent y la vista de resultados. Se fija cuando el usuario aporte sus informes de referencia |
| **Librería de PDF concreta** | `pdf-parse` (sencilla) vs `pdfjs-dist` (más completa). Decidir en el paso 5 |
| **Modelo concreto (DeepSeek vs GPT)** | No bloquea: la capa de abstracción permite empezar con cualquiera |
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

*Documento vivo: se actualiza conforme se avanza en la implementación.*
