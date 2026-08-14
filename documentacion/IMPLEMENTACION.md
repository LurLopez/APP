# Implementación — Todo lo construido hasta ahora

> Versión: 1.2 · Fecha: 2026-08-13 · Este documento es el registro detallado de todo lo implementado en el proyecto hasta la fecha. Se actualiza cuando se añade o cambia algo relevante.

---

## 1. Resumen del estado actual

| Área | Estado |
|---|---|
| Documentación (visión + arquitectura) | ✅ Completada |
| Scaffolding Node/Express | ✅ Completado |
| Base de datos PostgreSQL | ✅ Tablas creadas + datos demo + probada |
| Capa de datos (repositorios) | ✅ `analysisRepository` + `userRepository` |
| Autenticación (backend + frontend) | ✅ Probada 8/8 |
| Pipeline de análisis IA (agentes) | 🔶 `originAgent` + `sectorAgent` implementados y probados (mock); `analystAgent` pendiente |
| Frontend (diseño Terminal Cifra) | ✅ Rediseñado, flujo demo funcional |
| Subida de PDF real (`POST /api/upload`) | ✅ Funcional: extrae texto → originAgent → veredicto o error visible en pantalla |
| Histórico real en el frontend (`GET /api/analyses`) | ⏳ Pendiente (la BD ya lo guarda) |
| Buscador de empresas (Fase 2) | ✅ Búsqueda real en EDGAR/SEC + cribador de resultados (3 estados financieros, 53 partidas estándar TIKR, pestañas × periodos, tabla única estilo TIKR claro); ⏳ histórico de filings y puente "Analizar" |
| Asociar análisis al usuario conectado | ⏳ Pendiente |
| Suscripciones y planes (Fase 5) | ⏳ Pendiente (campo `plan` ya existe) |

---

## 2. Cronología de lo realizado

### 2.1. Documento de visión y decisiones de stack

- Creado `documentacion/PROYECTO.md` (resumen inyectado a los agentes, ~2.8 KB) y `documentacion/PROYECTO-detalle.md` (visión completa).
- Decidido el stack (documentado en `documentacion/ARQUITECTURA.md`):

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5 (API REST) |
| BD | PostgreSQL 16 (tablas: users, analyses, filings) |
| Frontend | HTML/CSS/JS puro (migrable a React) |
| Sesión | JWT en cookie httpOnly |
| Passwords | bcryptjs |

- Regla del **diario de cambios obligatorio**: todo cambio considerable se registra en `documentacion/diario/YYYY/MM/YYYY-MM-DD.md`.
- Enlaces simbólicos `agentes/` → `~/.config/opencode/agent/` y `PROYECTO.md` → `documentacion/PROYECTO.md` (no versionados).

### 2.2. Scaffolding (Fase 0/1)

- `package.json`: `type: module`, scripts `start`, `dev`, `db:migrate`, `db:seed`. Dependencias: `express`, `pg`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`.
- `server.js`: Express + `express.json()` + `cookieParser()` + estáticos de `public/` + rutas de auth + `/api/health` + `errorHandler`.
- `config/index.js`: lee `PORT`, `DATABASE_URL`/`DB_*`, `JWT_SECRET`, `NODE_ENV`. Exporta `{ port, database, jwtSecret, production }`.
- `.env` (no versionado) y `.env.example` con todos los secretos documentados.
- Los scripts usan `--env-file=.env` (nativo de Node ≥ 20.6, sin dependencia dotenv).

### 2.3. Base de datos (PostgreSQL)

**Esquema** (`db/schema.sql`) — 3 tablas:

- `users`: `id SERIAL`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT NOT NULL` (bcrypt), `plan` (`'free'|'premium'`, por defecto `free`), `created_at`.
- `analyses`: `id`, `user_id` (FK → users, nullable = anónimo), `filename`, `status` (`processing|done|error`), `error`, `origin`, `sector`, `report JSONB`, `model_used`, `created_at`.
- `filings`: preparada para la Fase 2 (ticker, company_name, form_type, period, accession_no, filing_url, filed_at).
- Índices: `idx_analyses_user (user_id)`, `idx_filings_ticker (ticker)`.

**Capa de datos** (`db/`):

- `pool.js`: pool de conexiones `pg` con la config del `.env`; exporta `pool` y `query(text, values)`.
- `migrations.js`: ejecuta `schema.sql` (script `npm run db:migrate`).
- `repositories/analysisRepository.js`:
  - `createAnalysis({ userId, filename, status })` → INSERT.
  - `getAnalysisById(id)` → SELECT por id.
  - `listAnalyses({ userId, limit })` → SELECT ordenado por fecha (filtro opcional por usuario).
  - `updateAnalysis(id, fields)` → UPDATE dinámico con *whitelist* de columnas (`status`, `error`, `origin`, `sector`, `report`, `model_used`).
- `repositories/userRepository.js`:
  - `createUser({ email, passwordHash, plan })` → INSERT.
  - `findUserById(id)` y `findUserByEmail(email)` → devuelven `password_hash` solo para uso interno (login).
- `seed.js` (script `npm run db:seed`): **idempotente**; crea el usuario `demo@cifra.local` si no existe y 3 análisis demo (TAP, KO, PEP) con `report` JSONB provisional, solo si la tabla `analyses` está vacía.

**Verificación real realizada** (PostgreSQL 16 nativo, base `cifra`):

- `db:migrate` → "Base de datos preparada correctamente."
- `db:seed` → usuario demo + 3 análisis.
- psql: `SELECT id, email, plan FROM users` → 2 filas (demo + test).

### 2.4. Autenticación (Fase 3)

**Backend** (`src/`):

- `services/auth.service.js`:
  - `register({ email, password })`: normaliza email (minúsculas+trim), valida formato y contraseña ≥ 8, comprueba duplicado (409), hashea con bcrypt (10 rondas) y crea el usuario con `email_verified = false`. **No inicia sesión**: genera un código de verificación de 6 dígitos (hash SHA-256, 15 min de validez, máx. 5 intentos) y lo envía por correo. Devuelve el usuario público (sin hash).
  - `verifyEmail({ email, code })`: valida el código pendiente, marca `email_verified = true` y consume el código. Devuelve el usuario.
  - `resendVerificationCode({ email })`: genera y envía un código nuevo.
  - `login({ email, password })`: busca por email, compara con bcrypt, errores genéricos 401 ("Correo o contraseña incorrectos" — no revela si el email existe). **Si la cuenta no está verificada → 403 con `code: 'EMAIL_NOT_VERIFIED'`**.
  - `AuthError` (mensaje + código HTTP + `code` opcional para el frontend) y `toPublicUser(user)` → `{ id, email, plan, email_verified, created_at }`.
- `services/email.service.js` (nuevo): envía el código con **nodemailer** vía SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). **Sin SMTP configurado el código se imprime por consola** (modo desarrollo).
- `api/routes/auth.routes.js`: `POST /register`, `POST /verify`, `POST /resend-code`, `POST /login`, `POST /logout`, `GET /me` (protegido).
- `api/controllers/auth.controller.js`: `register` responde 201 **sin cookie**; `verify` valida el código y **emite la sesión** (JWT `{ sub: userId }` 7 días en cookie `token`, `httpOnly`, `SameSite=Lax`, `secure` solo en producción). `logout` borra la cookie.
- `middleware/auth.middleware.js` (`requireAuth`): lee la cookie, verifica el JWT, carga el usuario de la BD y lo adjunta a `req.user`; 401 en cualquier fallo.
- `middleware/errorHandler.js`: errores siempre JSON `{ error, code? }` con el código correcto; los 5xx se loguean por consola.
- `utils/validate.js`: `normalizeEmail`, `isValidEmail`, `isValidPassword`.
- Base de datos: columna `email_verified` en `users` (migración idempotente en `db/schema.sql`) y tabla `verification_codes` (user_id, code_hash, attempts, expires_at, created_at).

**Frontend** (`public/`):

- `auth.js`:
  - Estado de sesión (`state.user`), restaurado al cargar con `GET /api/auth/me`.
  - `renderAuth()`: alterna entre botones "Iniciar sesión / Crear cuenta" y el chip de usuario (avatar con iniciales + email + salir) en la topbar; en el sidebar, "Invitado/Beta privada + Entrar" ↔ "email + plan + Salir".
  - Modal con pestañas login/registro y **dos pasos**: credenciales (email, contraseña, repetir) y **verificación** (código de 6 dígitos, reenviar código, "usar otro correo"). Al registrarse (o al hacer login con `EMAIL_NOT_VERIFIED`) el modal pasa al paso de verificación.
  - Validación cliente (contraseñas iguales, código de 6 dígitos), errores del servidor mostrados en el modal (el helper `api` propaga `error.code`), `Escape`/click fuera/× para cerrar.
  - `initials()`: avatar con las 2 primeras letras del email.
- `index.html`: modal de autenticación con los dos pasos (campos de credenciales + bloque `#auth-verify` con código, enlaces "Reenviar código" y "Usar otro correo"), botones en la topbar, tarjeta de cuenta en el sidebar, carga de `auth.js` tras `app.js`.
- `styles.css`: estilos del modal, `.ghost-button`, `.user-chip`, `.user-avatar`, `.account-action`, `.verify-hint`, `.verify-actions .link-button`. Incluye la regla global `[hidden] { display: none !important; }` (fix 2026-08-12: el CSS con `display` anulaba el atributo `hidden` y el modal no se cerraba).

### 2.6. Sistema de agentes IA — Agente verificador de origen (pipeline)

- **Capa de modelos IA** (`src/services/ai/modelProvider.js`): los agentes solo hablan con esta capa. Proveedor activo por defecto: `deepseek`. **Sin `DEEPSEEK_API_KEY` el análisis falla con error visible** ("Falta DEEPSEEK_API_KEY en el archivo .env"). El `mock` solo se usa si se fuerza con `AI_PROVIDER=mock` (desarrollo interno).
- **Provider mock** (`src/services/ai/providers/mock.provider.js`): heurística por patrones sobre el texto del documento (SEC/Washington para EE. UU., `FORM 10-Q`/`FORM 10-K`, estados financieros). Devuelve JSON igual que lo haría un modelo real. Sin coste.
- **Provider DeepSeek** (`src/services/ai/providers/deepseek.provider.js`): llama a `https://api.deepseek.com/chat/completions` con fetch nativo, modelo `deepseek-chat` (o `AI_MODEL`), `temperature: 0`, `max_tokens: 400`. Limpia respuestas envueltas en ```json```.
- **Sistema de agentes** (`src/agents/`):
  - `baseAgent.js`: clase `BaseAgent` (nombre, descripción, `run()`) + `AgentError` (mensaje + código) para errores controlados del agente.
  - `originAgent.js`: recibe `{ text }`, envía prompt (system) + documento (máx. 80.000 caracteres) a la capa de modelos, valida el JSON de respuesta y devuelve `{ origin: 'US', formType: '10-Q'|'10-K' }`. Errores con mensajes claros en español: `EMPTY_DOCUMENT`, `INVALID_MODEL_RESPONSE`, `NOT_FINANCIAL` ("Este documento no es un informe financiero (10-Q / 10-K)."), `NOT_USA` ("Este informe no es de una empresa de EE. UU."), `NOT_10Q_10K`.
  - `sectorAgent.js`: verifica consumo defensivo (bebidas, alimentos, tabaco, hogar, cuidado personal, retail de alimentación; contraejemplos listados en el prompt; sin evidencia → rechazo). Devuelve `{ sector: 'defensive_consumer' }` o `NOT_DEFENSIVE_CONSUMER` ("Este informe no corresponde al sector de consumo defensivo.").
  - `agentRegistry.js`: registro de agentes por nombre (`registerAgent`, `getAgent`, `listAgents`); origin y sector quedan registrados al importar.
- **Pruebas**: 5/5 casos de origen (10-Q válido, 10-K válido, no financiero, no estadounidense, sin FORM 10-Q/10-K) + sector probado vía endpoint (Molson Coors ✓, Apple ✗).

### 2.7. Subida real de PDF conectada al pipeline (POST /api/upload)

- **Dependencias nuevas**: `multer` (multipart) y `pdf-parse` 2.4.5 (API `PDFParse` + `getText()`, texto en `result.text`).
- `src/services/pdf.service.js`: `extractTextFromPdf(buffer)` (destruye el parser en `finally`).
- `src/services/analysis.service.js`: `analyzePdf(buffer)` → texto → `originAgent.run({ text })` → `{ text, origin, formType }`. Los siguientes agentes se encadenarán aquí.
- `src/api/routes/analysis.routes.js`: `POST /api/upload` (campo `file`, memoria, máx. 25 MB). Respuestas: 200 `{ ok, origin, formType }`; 400 sin archivo o `LIMIT_FILE_SIZE`; 422 `{ error, code }` para `AgentError` (`NOT_PDF`, `NOT_FINANCIAL`, `NOT_USA`, `NOT_10Q_10K`, ...). Montada en `server.js`.
- **Frontend**: el botón "Analizar informe" hace `fetch('/api/upload')` con `FormData`. Estados del agente: Procesando → Completado / Error (✕ rojo). Panel de error con el mensaje del servidor + "Reintentar"; tras éxito, "Documento verificado: 10-Q", toast informativo y botón "Analizar otro informe". Se eliminó la demo simulada del pipeline.
- **Pruebas reales**: PDF normal → 422 `NOT_FINANCIAL`; PDF 10-Q → 200 `{ origin: 'US', formType: '10-Q' }`; sin archivo → 400; no-PDF → 422 `NOT_PDF`. HTML/CSS/JS servidos con 200.
- **Nota**: el mock exige ≥ 2 patrones financieros para `isFinancial`; el texto enviado al agente se trunca a 80.000 caracteres.

**Pruebas reales con curl** (8/8 correctas):

| # | Caso | Respuesta |
|---|---|---|
| 1 | Registro nuevo | 201 + usuario (sin sesión; envía código de verificación) |
| 2 | Email duplicado | 409 "Ya existe una cuenta con ese correo." |
| 3 | Login antes de verificar | 403 `EMAIL_NOT_VERIFIED` "Debes verificar tu correo antes de entrar." |
| 4 | Código incorrecto | 400 "El código no es correcto." |
| 5 | Verificación correcta | 200 + usuario (`email_verified: true`) + cookie de sesión |
| 6 | Reenviar código | 200 `{ok:true}` y se envía un código nuevo |
| 7 | Login tras verificar | 200 + usuario |
| 8 | `/me` con cookie | 200 + usuario |
| 9 | `/me` sin cookie | 401 "Sesión no iniciada." |
| 10 | Logout | 200 `{ok:true}` |
| 11 | `/me` tras logout | 401 |

> Prueba 2026-08-14: flujo completo verificado contra la API (registro → login bloqueado → código erróneo → verificación → login OK; usuarios de prueba borrados después). En desarrollo, sin SMTP, el código se imprime por consola.
>
> Histórico: el usuario confirmó el flujo desde el navegador (registro real de `lurlopez13@gmail.com` persistido en `users`). Fix (2026-08-12, 21:21): `[hidden] { display: none !important; }` para que el modal se cierre correctamente tras login/registro.

### 2.5. Frontend (diseño "Terminal Cifra")

**Historia del diseño** (3 iteraciones):

1. **Tema oscuro menta** (diseño inicial): sidebar fija oscura, acentos mint, gráficos de órbita decorativos. El usuario pidió rediseñar hacia una estética económica.
2. **Tema navy estilo TIKR** (segunda iteración): azul marino profundo, acentos azules, verde/rojo financiero, topbar sticky, hero con tarjeta de datos de mercado.
3. **Clon del panel TIKR** (actual): el usuario aportó una captura del terminal de TIKR y pidió un clon. Layout final:

- **Topbar fija oscura** (`#242424`, 62 px): logo Terminal Cifra + botón contraer sidebar, buscador de empresas/tickers (demo), botones de auth, chip de usuario.
- **Sidebar clara** (`#f7f7f7`, 270 px): navegación por secciones ("Generación de ideas", "Análisis fundamental") con iconos SVG inline, badge "NUEVO", flechas; footer con tarjeta de cuenta. Contraíble a 68 px en escritorio (solo iconos); drawer con backdrop en ≤ 900 px.
- **Franja de aviso** (amarilla `#fffef0`): cuenta atrás estática, texto de promoción, botón "Descubrir Cifra", botón de cierre.
- **Hero promocional** (amarillo `#fffbc4`): visual CSS puro (terminal falso con skyline y tabla de datos), copy de producto, lista de ventajas, CTA "Empezar un análisis". Cerrable.
- **Bienvenida**: 3 tarjetas (guía rápida, espacio de trabajo con campo de referencia copiable, centro de ayuda).
- **Mercados de referencia**: 4 tarjetas con sparklines SVG (S&P 500, NASDAQ, Dow Jones, Russell 2000) con verde/rojo; etiqueta "Datos de demostración".
- **Análisis fundamental**: panel de subida de PDF (dropzone con arrastrar y soltar, validación tipo/25 MB, preview del archivo), panel "Qué ocurre después" con el pipeline de 3 agentes, panel de procesamiento con estados de agentes y barra de progreso, y vista de resultado demo con señal y métricas.
- **Histórico**: tabla densa (documento, empresa con ticker, periodo, señal +/-, estado) sobre datos reales de la BD en el futuro.
- **Toast** global para notificaciones.

**Comportamiento (`app.js`)**:

- Dropzone: click/teclado, drag&drop, validación (solo PDF, máx 25 MB), preview con quitar archivo.
- Demo del pipeline: 3 agentes secuenciales con estados (En espera → Procesando → Completado), barra de progreso, temporizador.
- Buscador: filtra un array local de empresas (TAP, KO, PEP, WMT) y muestra resultados; al seleccionar avisa que la integración SEC llega en la Fase 2.
- Sidebar: contraer en escritorio (clase `sidebar-collapsed`), drawer + backdrop en móvil.
- Cierre de avisos (`.close-button`) y toasts.

### 2.8. Cribador de resultados (screener) con datos de la SEC — EDGAR

**Backend** (`src/`):

- `services/edgar.service.js`: consulta la API oficial de la SEC con `fetch` nativo (sin dependencias nuevas):
  - Carga y cachea la tabla ticker→CIK (`https://www.sec.gov/files/company_tickers.json`, TTL 24 h en memoria).
  - `searchCompanies(query, limit=8)`: ordena coincidencia exacta de ticker → empieza por → contiene en nombre.
  - Descarga `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` (caché 6 h por ticker) y construye series **anuales (últimos 10)** y **trimestrales (últimos 8)**.
  - **Constante `STATEMENTS` rediseñada como clon de TIKR: 3 estados y 53 partidas**: `income` (15: ingresos con fallback ASC 606, coste de ventas, B. bruto, SG&A, I+D, otros ingresos (gastos), operativo, intereses, resultado antes de impuestos, impuesto, resultado de operaciones continuadas, neto, BPA diluido y básico en `perShare`, acciones diluidas en millones con formato `shares`), `balance` (24: caja, inversiones a corto plazo, cobrar, inventario, gastos anticipados, activo corriente, inmovilizado, goodwill, **intangibles combinados** = finite + indefinite, **activo no corriente**, activo, pagar, gastos devengados, ingresos diferidos, deuda a corto plazo, pasivo corriente, deuda LP, **pasivo no corriente**, pasivo, capital adicional, reservas, autocartera, minoritarios, fondos propios) y `cashflow` (14: neto, D&A, retribución en acciones, circulante, operativo, CAPEX con fallback `PaymentsToAcquireProductiveAssets`, adquisiciones, inversión, dividendos, recompra, emisión de deuda, amortización de deuda, financiación, variación neta de caja; todos con fallback `…ContinuingOperations`). Las **partidas de total llevan `emphasis: true`**, y `statements` exporta el catálogo como `{ key, label, format, emphasis }` (formatos `money`|`perShare`|`shares`).
  - **Selector `pickConceptData`**: elige entre los tags candidatos el que tiene el dato más reciente (por frame); soporta **conceptos combinados** (`combine`: suma de dos tags por frame, p. ej. intangibles).
  - **Alineación de periodos corregida (`buildSeries`)**: los valores con frame XBRL (`CYyyyy`, `CYyyyyQn`, `CYyyyyQnI`) se asignan a su fila; las partidas del 10-K con `fp=FY` se asocian además al año fiscal según su fecha de fin (`end`). Arregla: (a) balances de cierre fiscal de empresas con año fiscal distinto del calendario (PG cierra en junio) y (b) balances del 10-K sin frame (KO, 10-K reexpresado de 2025). Sustituye a la antigua heurística de "copiar del Q4".
  - **Valores derivados** (cuando el tag directo no existe): `grossProfit` = ingresos − coste de ventas, `liabilities` = activo − fondos propios, `assetsNoncurrent` = activo − activo corriente y `liabilitiesNoncurrent` = pasivo − pasivo corriente.
  - Cabecera `User-Agent` obligatoria (`Cifra contacto@cifra.local`), timeout de 20 s por petición.
  - Errores con código: `COMPANY_NOT_FOUND` y `EDGAR_UNAVAILABLE`.
- `api/routes/screener.routes.js` (montado en `server.js` como `/api/screener`):
  - `GET /api/screener/search?q=` → `{ ok, companies: [{ cik, ticker, name }] }` (400 si falta `q`).
  - `GET /api/screener/company/:ticker` → `{ ok, company: { ticker, name, cik }, currency: 'USD', statements: { income, balance, cashflow }, annual, quarterly }` (400 ticker inválido, 404 `COMPANY_NOT_FOUND`, 502 `EDGAR_UNAVAILABLE`). `statements` trae el catálogo de partidas `{ key, label, format, emphasis }` para que el frontend pinte la tabla genéricamente.

**Frontend** (`public/`):

- Nueva sección `#screener` en `index.html`: buscador propio (ticker o nombre), cabecera de empresa (**nombre + chip naranja con el ticker**, meta `CIK · USD · SEC EDGAR`), chip "USD", conmutador **Anual/Trimestral** y, en lugar de 3 tablas, **3 pestañas** ("Cuenta de resultados", "Balance", "Cash flow") que repintan **una sola tabla** `#screener-statement-table` **estilo TIKR claro**: partidas como filas, periodos como columnas, en millones $ (BPA en $, 2 decimales; acciones en millones), **negativos entre paréntesis**, columnas de valores a la derecha, **filas de total en crema** (`.emphasis-row`, `#fff7e8`, negrita, marcadas por `emphasis: true` del backend), columna "Partida" **fija** (`position: sticky`), scroll horizontal (`.table-wrap`), hover `#fafafa`, tipografía tabular (`font-variant-numeric`) y "—" para datos ausentes. La tabla se pinta genéricamente desde `statements`.
- **Paleta extraída de las capturas de referencia del usuario con PIL**: blanco `#ffffff`, texto `#333333`, naranja `#ff9900`, crema `#fff7e8` (255,251,237), gris `#777`, bordes `#ddd`/`#e0e0e0`/`#f0f0f0`.
- El buscador del topbar (`#ticker-search`) ahora busca **de verdad** en EDGAR (antes lista estática): debounce de 250 ms, panel de resultados con nombre + ticker, mensaje "Sin resultados en EDGAR…", y al elegir empresa carga el cribador.
- `app.js`: `searchCompanies`, `loadCompanyToScreener`, `renderScreener`, `renderScreenerTables`, `renderStatementTable` (repinta la tabla única desde `statements`), `submitScreenerSearch`, formateadores `formatMoneyUsd`/`formatEps`/`formatShares`/`formatScreenerValue`/`periodLabel`, estado `screenerSeries='annual'` y `screenerStatement='income'`. Pestañas y conmutador re-renderizan sin nueva petición.
- `styles.css`: estilos bajo el comentario "Cribador (screener)"; pestañas con subrayado naranja en la activa, tabla única con sticky col y filas emphasis, alineación derecha de valores y scroll horizontal.

**Pruebas reales**: KO FY2025 (ingresos 47.941 M$, B. neto 13.107 M$, BPA 3,04 $, activo 104.816 M$, pretax 15.998 M$, reservas 80.382 M$, autocartera 56.423 M$, variación neta de caja −478 M$, pasivo derivado 72.647 M$, activo no corriente derivado 73.772 M$, pasivo no corriente derivado 51.366 M$), PG (cierre fiscal junio alineado por fecha de fin; intangibles 21.737 M$ vía tag agregado), PEP (intangibles 15.066 M$ = finite + indefinite sumados; CAPEX vía `PaymentsToAcquireProductiveAssets`), TAP (pérdida neta FY2025 de −2.139,6 M$, pretax −2.518 M$, acciones diluidas 199,1 M en formato `shares`; ingresos vía tag ASC 606), ticker inexistente → 404, búsqueda sin `q` → 400.

**Pendiente**: puente "Analizar" desde el cribador hacia el pipeline de IA y el histórico de filings (lista de 10-Q/10-K con ver PDF).

---

## 3. Cómo se ejecuta

```bash
# Requisitos: Node ≥ 20.6, PostgreSQL 16 (local o remoto)

cp .env.example .env          # y edita credenciales/JWT_SECRET

npm install                   # dependencias
npm run db:migrate            # crea las tablas
npm run db:seed               # (opcional) datos demo
npm run dev                   # servidor en http://localhost:3000
```

Endpoints disponibles:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servicio |
| POST | `/api/auth/register` | `{ email, password }` → 201 + cookie |
| POST | `/api/auth/login` | `{ email, password }` → 200 + cookie |
| POST | `/api/auth/logout` | Borra la cookie |
| GET | `/api/auth/me` | Usuario actual (requiere cookie) |
| POST | `/api/upload` | PDF (campo `file`) → 200 `{ok, origin, formType}` o 422 `{error, code}` |
| GET | `/api/screener/search?q=` | Búsqueda de empresas en EDGAR → `{ok, companies}` (400 sin `q`) |
| GET | `/api/screener/company/:ticker` | Series anual/trimestral + 3 estados (`statements`) de la empresa → 200 · 400 · 404 · 502 |

---

## 4. Decisiones técnicas tomadas (y por qué)

| Decisión | Detalle |
|---|---|
| **PostgreSQL nativo local** | En lugar de Docker: no requiere permisos extra, es lo más parecido a un PostgreSQL gestionado en producción; la app solo usa `DATABASE_URL`. |
| **Sesión JWT en cookie httpOnly** | Sin tablas de sesión; el frontend nunca ve el token (menos superficie XSS). 7 días, `SameSite=Lax`. |
| **bcryptjs en vez de bcrypt** | Implementación pura JS: sin problemas de compilación nativa. |
| **Errores 401 genéricos en login** | No revela si el email existe (evita enumeración de cuentas). |
| **`--env-file=.env` de Node** | Sin dependencia dotenv (menos paquetes). |
| **Repositorios como única capa SQL** | La lógica de negocio (futuros services) no conocerá SQL; facilita cambios de BD. |
| **Whitelist en `updateAnalysis`** | Impide actualizar columnas no permitidas (ej. id, created_at) desde fuera. |
| **Diseño clon de TIKR** | Decisión del usuario: estética de terminal financiero (topbar oscura + sidebar clara + datos). |

---

## 5. Pendiente (próximos pasos)

1. **Asociar análisis al usuario**: al crear análisis, usar `req.user.id` de `requireAuth`; filtrar `listAnalyses` por usuario.
2. **`GET /api/analyses` + `GET /api/analyses/:id`**: endpoints + historial real en el frontend (sustituir la tabla estática).
3. **Subida de PDF real**: ✅ `POST /api/upload` + `pdf.service.js` (pdf-parse) + originAgent conectado; ⏳ guardar el PDF en `uploads/` y el análisis en `analyses`.
4. **Sistema de agentes**: ✅ `baseAgent.js`, `agentRegistry.js`, `originAgent` y `sectorAgent` (mock) listos y probados; ⏳ `analystAgent`.
5. **Capa de modelos IA**: ✅ `modelProvider.js` + `deepseekProvider` (sin key falla con error visible; `AI_PROVIDER=mock` para desarrollo); falta probar con key real.
6. **Pipeline**: ✅ `analysis.service.js` con origin + sector conectados; ⏳ encadenar analista y guardar en `analyses`.
7. **Definir formato del informe** final con los informes de referencia del usuario.
8. **Fase 2**: ✅ buscador real de empresas (API EDGAR/SEC) + cribador de resultados (series anual/trimestral); ⏳ histórico de filings, ver PDF y botón "Analizar" desde el cribador.
9. **Fase 5**: suscripciones y planes (campo `plan` ya existe; límites por plan).
10. **Fase 4/6**: análisis multi-periodo, más países y sectores.

---

## 6. Archivos del proyecto (estado actual)

```
app/
├── server.js                     # Express: estáticos + API + auth + errores
├── package.json                  # Scripts: start, dev, db:migrate, db:seed
├── .env / .env.example           # Configuración (secreto JWT, BD)
├── config/index.js               # Config centralizada
├── db/
│   ├── pool.js                   # Pool PostgreSQL
│   ├── schema.sql                # Esquema (users, analyses, filings)
│   ├── migrations.js             # Aplica el esquema
│   ├── seed.js                   # Datos demo idempotentes
│   └── repositories/
│       ├── analysisRepository.js # CRUD de análisis
│       └── userRepository.js     # CRUD de usuarios
├── src/
│   ├── api/
│   │   ├── routes/auth.routes.js # /api/auth/*
│   │   ├── routes/screener.routes.js # /api/screener/search y /api/screener/company/:ticker
│   │   └── controllers/auth.controller.js
│   ├── services/auth.service.js  # Lógica de registro/login
│   ├── services/edgar.service.js # Datos de la SEC (EDGAR): ticker→CIK, companyfacts, 3 estados (53 partidas TIKR con emphasis), series
│   ├── services/pdf.service.js   # Extracción de texto de PDFs (pdf-parse)
│   ├── services/analysis.service.js  # Pipeline: PDF → agentes → resultado
│   ├── services/ai/              # Capa de modelos IA
│   │   ├── modelProvider.js      # Abstracción (autodetecta key DeepSeek, si no mock)
│   │   ├── providers/mock.provider.js  # Heurística local (sin coste)
│   │   └── providers/deepseek.provider.js  # API real de DeepSeek
│   ├── agents/                   # Sistema de agentes IA
│   │   ├── baseAgent.js          # BaseAgent + AgentError
│   │   ├── originAgent.js        # Verificador: financiero + 10-Q/10-K + EE. UU.
│   │   ├── sectorAgent.js        # Verificador: consumo defensivo
│   │   └── agentRegistry.js      # Registro de agentes por nombre
│   ├── middleware/
│   │   ├── auth.middleware.js    # requireAuth (JWT)
│   │   └── errorHandler.js       # Errores JSON
│   └── utils/validate.js         # Validación email/contraseña
├── public/
│   ├── index.html                # Web "Terminal Cifra"
│   ├── styles.css                # Diseño clon TIKR (claro)
│   ├── app.js                    # Interacción: subida real, agentes, errores
│   └── auth.js                   # Modal login/registro y sesión
├── uploads/                      # PDFs (vacío por ahora)
├── documentacion/                # PROYECTO*.md, ARQUITECTURA.md, IMPLEMENTACION.md
│   ├── backend/funcionalidades/register/            # Doc backend de registro/login
│   ├── backend/funcionalidades/verificacion-informe/ # Doc backend: subida + verificación 10-Q/10-K
│   ├── backend/funcionalidades/screener/            # Doc backend: cribador con datos de EDGAR/SEC
│   ├── frontend/funcionalidades/register/           # Doc frontend de registro/login
│   ├── frontend/funcionalidades/verificacion-informe/ # Doc frontend: subida + verificación
│   ├── frontend/funcionalidades/screener/           # Doc frontend: sección cribador + buscador real
│   └── diario/YYYY/MM/YYYY-MM-DD.md           # Registro diario de cambios
├── agentes/ → ~/.config/opencode/agent/   (enlace, no versionado)
└── PROYECTO.md → documentacion/PROYECTO.md (enlace, no versionado)
```
