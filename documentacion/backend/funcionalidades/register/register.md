# Funcionalidad: Registro, inicio de sesión y verificación de correo — Backend

> Capa: **backend** · Fecha: 2026-08-12 (base) · Actualizado: 2026-08-14 (verificación + recuperación) · Estado: **implementado y probado**

---

## 1. Objetivo

Permitir que un usuario cree una cuenta (registro), **valide su correo con un código de 6 dígitos**, acceda a ella (inicio de sesión), recupere su contraseña si la olvida y cierre la sesión. Los datos viven en PostgreSQL y la sesión se gestiona con un JWT en cookie httpOnly.

## 2. Alcance

**Incluido:**
- Registro con email + contraseña (mínimo 8 caracteres), hash con bcrypt.
- **Verificación de correo**: código de 6 dígitos por email (SMTP real o consola en desarrollo), válido 15 min, máx. 5 intentos, reenviable.
- Inicio de sesión; **cuenta sin verificar → 403 `EMAIL_NOT_VERIFIED`**.
- **Recuperación de contraseña** ("olvidé mi contraseña"): código por correo + nueva contraseña; marca el correo como verificado.
- Cierre de sesión (logout) y consulta del usuario actual (`/api/auth/me`).
- Errores siempre en JSON con código HTTP correcto (y `code` opcional para el frontend).

**Excluido (pendiente):**
- Asociar análisis al usuario conectado (`analyses.user_id`) — ✅ ya implementado, ver `historico-analisis`.
- Planes premium y límites por plan (campo `plan` ya existe, Fase 5).
- 2FA y "iniciar sesión con Google" (roadmap).

## 3. Endpoints

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password }` | 201 `{ user }` (sin sesión; envía código) · 400 · 409 |
| `POST` | `/api/auth/verify` | `{ email, code }` | 200 `{ user }` + cookie de sesión · 400 (código/`CODE_EXPIRED`) · 404 |
| `POST` | `/api/auth/resend-code` | `{ email }` | 200 `{ ok: true }` · 400 ya verificado · 404 |
| `POST` | `/api/auth/login` | `{ email, password }` | 200 `{ user }` + cookie · 401 · **403 `EMAIL_NOT_VERIFIED`** |
| `POST` | `/api/auth/forgot-password` | `{ email }` | 200 `{ ok: true }` (idéntico si no existe; no filtra cuentas) |
| `POST` | `/api/auth/reset-password` | `{ email, code, newPassword }` | 200 `{ ok: true }` · 400 (código/`CODE_EXPIRED`/contraseña corta) · 404 |
| `POST` | `/api/auth/logout` | — | 200 `{ ok: true }` |
| `GET` | `/api/auth/me` | — | 200 `{ user }` · 401 sin cookie o token inválido |

`user` público (nunca incluye `password_hash`):

```json
{ "id": 2, "email": "test@cifra.local", "plan": "free", "email_verified": true, "created_at": "2026-08-13T01:10:06.426Z" }
```

## 4. Flujo

### Registro + verificación
```
POST /api/auth/register
  → normalizeEmail (minúsculas + trim)
  → validar email (regex) y contraseña (≥ 8)          [fallo → 400]
  → ¿existe el email en users?                         [sí → 409]
  → bcrypt.hash(password, 10)
  → INSERT en users (email, password_hash, plan='free', email_verified=false)
  → generar código 6 dígitos (SHA-256, 15 min, máx. 5 intentos)
  → guardar en verification_codes y enviar por email
  → 201 { user }            (NO inicia sesión)

POST /api/auth/verify { email, code }
  → validar código activo y hash → [incorrecto → 400; 5 intentos → consumido, CODE_EXPIRED]
  → consumeVerificationCode + markEmailVerified
  → jwt.sign({ sub: user.id }, JWT_SECRET, 7d) → cookie httpOnly
  → 200 { user }
```

### Login
```
POST /api/auth/login
  → buscar user por email          [no existe → 401 genérico]
  → bcrypt.compare(password, hash) [false → 401 genérico]
  → ¿email_verified?               [no → 403 EMAIL_NOT_VERIFIED "Debes verificar tu correo antes de entrar."]
  → cookie de sesión → 200 { user }
```

### Recuperación de contraseña
```
POST /api/auth/forgot-password { email }
  → si la cuenta existe: guarda código (mismo esquema) y envía correo "Restablece tu contraseña — Cifra"
  → si NO existe: responde igual (200) — no filtra cuentas

POST /api/auth/reset-password { email, code, newPassword }
  → valida código (6 dígitos, 5 intentos, consumido al acertar) y contraseña ≥ 8
  → bcrypt.hash(nueva) → updatePassword
  → markEmailVerified (el usuario demostró acceso al correo)
  → 200 { ok: true }
```

### Sesión protegida (ej. /api/auth/me)
```
GET /api/auth/me  (pasa por requireAuth)
  → leer cookie 'token'                          [no hay → 401]
  → jwt.verify(token, JWT_SECRET)                [inválido/expirado → 401]
  → findUserById(payload.sub)                    [no existe → 401]
  → req.user = usuario; continúa
```

## 5. Envío de correos (`src/services/email.service.js`)

- **nodemailer** vía SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
- **Sin SMTP configurado** → el código se imprime por consola (modo desarrollo).
- `sendCode` genérico: `sendVerificationCode` ("Verifica tu cuenta — Cifra") y `sendPasswordResetCode` ("Restablece tu contraseña — Cifra").
- **`MAIL_TO_OVERRIDE`**: redirige todos los correos salientes a esa dirección (solo pruebas; vacía en producción) con aviso en consola.
- Script de prueba `scripts/test-email.js` (`npm run test:email`).

## 6. Seguridad (decisiones y motivos)

| Decisión | Motivo |
|---|---|
| **bcryptjs** (10 rondas) | Hash con sal; implementación pura JS sin compilación nativa. |
| **Código 6 dígitos SHA-256** | No se guarda el código en claro; hash en `verification_codes`. |
| **15 min de validez + máx. 5 intentos** | Limita fuerza bruta; al agotarse se consume y pide otro. |
| **Login bloqueado sin verificar (403 `EMAIL_NOT_VERIFIED`)** | Obliga a validar el correo antes de usar la cuenta; el frontend lleva al paso de verificación. |
| **Forgot-password no filtra cuentas** | Responde 200 aunque el email no exista (evita enumeración de cuentas). |
| **Reset marca el correo verificado** | Demostrar acceso al correo es prueba de titularidad. |
| **Cookie httpOnly + `SameSite=Lax`** | El token no es accesible desde JS (mitiga XSS) y no viaja cross-site (mitiga CSRF). |
| **`secure` solo en producción** | En local (http) la cookie no se enviaría si estuviera activo. |
| **Errores 401 genéricos en login** | No revela si el email existe. |
| **`JWT_SECRET` en `.env`** | Nunca versionado. |

## 7. Base de datos

Tabla `users` ampliada y `verification_codes` (en `db/schema.sql`):

```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,               -- bcrypt
    plan          TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'premium')),
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE verification_codes (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

La única capa que toca la BD es `db/repositories/userRepository.js`: `createUser`, `findUserByEmail`, `findUserById`, `markEmailVerified`, `saveVerificationCode`, `findActiveVerificationCode`, `consumeVerificationCode`, `incrementCodeAttempts`, `updatePassword`.

## 8. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `config/index.js` | Expone `jwtSecret` y `production` desde el `.env`. |
| `src/utils/validate.js` | `normalizeEmail`, `isValidEmail`, `isValidPassword`. |
| `src/services/auth.service.js` | Registro, verificación, reenvío, login, forgot/reset password; `AuthError` (mensaje + status + `code`); `toPublicUser`. |
| `src/services/email.service.js` | nodemailer + SMTP; `MAIL_TO_OVERRIDE`; fallback por consola; `sendVerificationCode`/`sendPasswordResetCode`. |
| `src/api/controllers/auth.controller.js` | Firma el JWT y gestiona la cookie (crear/borrar); maneja `forgotPassword`/`resetPassword`. |
| `src/api/routes/auth.routes.js` | Las 8 rutas `/api/auth/*`. |
| `src/middleware/auth.middleware.js` | `requireAuth` (obligatoria) y `resolveUser` (opcional, para el screener). |
| `src/middleware/errorHandler.js` | JSON `{ error, code? }` con el código HTTP correcto; loguea los 5xx. |
| `server.js` | `cookieParser()`, monta `/api/auth`, registra `errorHandler`. |
| `db/repositories/userRepository.js` | Acceso a `users` y `verification_codes`. |
| `scripts/test-email.js` | Prueba de envío real (`npm run test:email`). |

Dependencias: `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `nodemailer`.

## 9. Errores y casos límite

| Caso | Respuesta |
|---|---|
| Email mal formado (`a@b`) | 400 "El correo electrónico no es válido." |
| Contraseña < 8 caracteres | 400 "La contraseña debe tener al menos 8 caracteres." |
| Email ya registrado | 409 "Ya existe una cuenta con ese correo." |
| Login con email inexistente o contraseña errónea | 401 "Correo o contraseña incorrectos." |
| Login sin verificar | **403 `EMAIL_NOT_VERIFIED`** "Debes verificar tu correo antes de entrar." |
| Código incorrecto | 400 "El código no es correcto." |
| Código agotado (5 intentos) o caducado | 400 `CODE_EXPIRED` "Demasiados intentos. Pide un código nuevo." / "El código ha expirado o no es válido. Pide uno nuevo." |
| Código mal formado | 400 "El código debe tener 6 dígitos." |
| Email inexistente en verify/resend | 404 "No existe una cuenta con ese correo." |
| Cuenta ya verificada | 400 "Este correo ya está verificado." |
| Cookie ausente en `/me` | 401 "Sesión no iniciada." |
| Token expirado o manipulado | 401 "La sesión no es válida o ha expirado." |
| BD caída | 500 con el error de conexión en JSON (logueado por consola) |

## 10. Pruebas realizadas

| # | Caso | Resultado |
|---|---|---|
| 1 | Registro nuevo | 201 + `{ user }` (sin sesión; envía código) |
| 2 | Email duplicado | 409 |
| 3 | Login antes de verificar | 403 `EMAIL_NOT_VERIFIED` |
| 4 | Código incorrecto | 400 |
| 5 | Verificación correcta | 200 + `{ user }` (`email_verified: true`) + cookie |
| 6 | Reenviar código | 200 `{ok:true}` |
| 7 | Login tras verificar | 200 + `{ user }` |
| 8 | `/me` con cookie | 200 + `{ user }` |
| 9 | `/me` sin cookie | 401 |
| 10 | Logout | 200 `{ok:true}` |
| 11 | `/me` tras logout | 401 |
| 12 | **Forgot + reset password** | Código insertado a propósito → reset → login con la nueva contraseña OK → login con la antigua 401 → código reutilizado rechazado |

- Verificación en BD: `SELECT id, email, plan FROM users` → `demo@cifra.local` y `lurlopez13@gmail.com` (cuenta real del usuario, persistida).
- Envío real por SMTP de Gmail verificado (código de prueba y correos reales a lurlopez13@gmail.com).
- Flujo del modal verificado con Chrome headless vía CDP: 13/13 comprobaciones (enlace visible solo en login, paso a paso, reenvío, vuelta atrás, cierre) sin errores de consola.
- **Nota**: el envío SMTP a Gmail tarda ~2 s; la petición responde tras el envío real.

## 11. Relación con otros módulos

- **Frontend**: `public/auth.js` consume estos endpoints (ver `documentacion/frontend/funcionalidades/register/`).
- **Histórico de análisis**: los análisis se guardan con `req.user.id` (ver `historico-analisis`).
- **Screener**: `resolveUser` decide el límite de periodos (bloqueo PRO) y `authenticated`.
- **Cartera / listas de seguimiento**: usan `requireAuth` para todo.
- **Fase 5 (planes)**: `user.plan` ya se devuelve; el proveedor de IA se elegirá según el plan.

## 12. Pendientes

- "Iniciar sesión con Google" (roadmap: registrar).
- Límites de uso según plan (free vs premium).
- Nota del usuario en `roadmap`: posible problema con el correo la primera vez al reenviar (el segundo envío funciona correctamente) — pendiente de reproducir.
