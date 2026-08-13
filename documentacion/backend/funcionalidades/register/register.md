# Funcionalidad: Registro e inicio de sesión — Backend

> Capa: **backend** · Fecha: 2026-08-12 · Estado: **implementado y probado**

---

## 1. Objetivo

Permitir que un usuario cree una cuenta (registro) y acceda a ella (inicio de sesión), guardando los datos en PostgreSQL y gestionando la sesión con un JWT en cookie httpOnly.

## 2. Alcance

**Incluido:**
- Registro con email + contraseña (mínimo 8 caracteres), hash con bcrypt.
- Inicio de sesión con verificación de credenciales.
- Cierre de sesión (logout).
- Consulta del usuario actual (`/api/auth/me`), protegida.
- Errores siempre en JSON con código HTTP correcto.

**Excluido (pendiente):**
- Asociar análisis al usuario conectado (`analyses.user_id`).
- Planes premium y límites por plan (campo `plan` ya existe, se usa en Fase 5).
- Verificación de email por correo, recuperación de contraseña, 2FA.

## 3. Endpoints

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password }` | 201 `{ user }` · 400 email/contraseña inválidos · 409 email duplicado |
| `POST` | `/api/auth/login` | `{ email, password }` | 200 `{ user }` · 401 credenciales incorrectas |
| `POST` | `/api/auth/logout` | — | 200 `{ ok: true }` |
| `GET` | `/api/auth/me` | — | 200 `{ user }` · 401 sin cookie o token inválido |

Respuesta de error: `{ "error": "<mensaje en español>" }`.

`user` público (nunca incluye `password_hash`):

```json
{ "id": 2, "email": "test@cifra.local", "plan": "free", "created_at": "2026-08-13T01:10:06.426Z" }
```

## 4. Flujo

### Registro
```
POST /api/auth/register
  → normalizeEmail (minúsculas + trim)
  → validar email (regex) y contraseña (≥ 8)          [fallo → 400]
  → ¿existe el email en users?                         [sí → 409]
  → bcrypt.hash(password, 10)
  → INSERT en users (email, password_hash, plan='free')
  → jwt.sign({ sub: user.id }, JWT_SECRET, 7d)
  → res.cookie('token', jwt, { httpOnly, SameSite=Lax, secure=producción })
  → 201 { user }
```

### Login
```
POST /api/auth/login
  → buscar user por email          [no existe → 401 genérico]
  → bcrypt.compare(password, hash) [false → 401 genérico]
  → misma cookie que en registro
  → 200 { user }
```

### Sesión protegida (ej. /api/auth/me)
```
GET /api/auth/me  (pasa por requireAuth)
  → leer cookie 'token'                          [no hay → 401]
  → jwt.verify(token, JWT_SECRET)                [inválido/expirado → 401]
  → findUserById(payload.sub)                    [no existe → 401]
  → req.user = usuario; continúa
```

## 5. Seguridad (decisiones y motivos)

| Decisión | Motivo |
|---|---|
| **bcryptjs** (10 rondas) | Hash con sal; implementación pura JS sin compilación nativa. |
| **Cookie httpOnly** | El token nunca es accesible desde JS del navegador (mitiga XSS). |
| **`SameSite=Lax`** | Evita envío de la cookie en peticiones cross-site (mitiga CSRF). |
| **`secure` solo en producción** | En local (http) la cookie no se enviaría si estuviera activo. |
| **JWT 7 días** | Caducidad razonable para beta; el middleware responde 401 si expira. |
| **Errores 401 genéricos en login** | No revela si el email existe (evita enumeración de cuentas). |
| **409 en registro duplicado** | Responde con código semántico (conflicto) y mensaje claro. |
| **`JWT_SECRET` en `.env`** | Nunca versionado; `--env-file=.env` lo carga (Node ≥ 20.6). |

## 6. Base de datos

Tabla `users` (creada en `db/schema.sql`):

```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,               -- bcrypt
    plan          TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'premium')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

La única capa que toca la BD es `db/repositories/userRepository.js`:
- `createUser({ email, passwordHash, plan })` → INSERT.
- `findUserByEmail(email)` → para registro (duplicado) y login.
- `findUserById(id)` → para `requireAuth` y `me`.

## 7. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `config/index.js` | Expone `jwtSecret` y `production` desde el `.env`. |
| `src/utils/validate.js` | `normalizeEmail`, `isValidEmail`, `isValidPassword`. |
| `src/services/auth.service.js` | Lógica de registro/login, `AuthError` (mensaje + status), `toPublicUser`. |
| `src/api/controllers/auth.controller.js` | Firma el JWT y gestiona la cookie (crear/borrar). |
| `src/api/routes/auth.routes.js` | Define las 4 rutas `/api/auth/*`. |
| `src/middleware/auth.middleware.js` | `requireAuth`: valida cookie + JWT + carga `req.user`. |
| `src/middleware/errorHandler.js` | Convierte cualquier error en JSON con su código; loguea los 5xx. |
| `server.js` | `cookieParser()`, monta `/api/auth`, registra `errorHandler`. |
| `db/repositories/userRepository.js` | Acceso a la tabla `users`. |

Dependencias nuevas: `bcryptjs`, `jsonwebtoken`, `cookie-parser`.

## 8. Errores y casos límite

| Caso | Respuesta |
|---|---|
| Email mal formado (`a@b`) | 400 "El correo electrónico no es válido." |
| Contraseña < 8 caracteres | 400 "La contraseña debe tener al menos 8 caracteres." |
| Email ya registrado | 409 "Ya existe una cuenta con ese correo." |
| Login con email inexistente o contraseña errónea | 401 "Correo o contraseña incorrectos." |
| Cookie ausente en `/me` | 401 "Sesión no iniciada." |
| Token expirado o manipulado | 401 "La sesión no es válida o ha expirado." |
| Usuario borrado entre login y `/me` | 401 "La sesión ya no es válida." |
| BD caída | 500 con el error de conexión en JSON (logueado por consola) |

## 9. Pruebas realizadas (curl, 8/8 correctas)

| # | Caso | Resultado |
|---|---|---|
| 1 | Registro nuevo usuario | 201 + `{ user }` |
| 2 | Email duplicado | 409 |
| 3 | Login correcto | 200 + `{ user }` |
| 4 | Login con contraseña mala | 401 |
| 5 | `/me` con cookie | 200 + `{ user }` |
| 6 | `/me` sin cookie | 401 |
| 7 | Logout | 200 `{ ok: true }` |
| 8 | `/me` tras logout | 401 |

Verificación en BD: `SELECT id, email, plan FROM users` → `demo@cifra.local` y `test@cifra.local`.

## 10. Relación con otros módulos

- **Frontend**: `public/auth.js` consume estos 4 endpoints (ver `documentacion/frontend/funcionalidades/register/`).
- **Futuro pipeline de análisis**: `requireAuth` protegerá `POST /api/upload` y `GET /api/analyses` para asociar el histórico al usuario (`analyses.user_id`).
- **Fase 5 (planes)**: `user.plan` ya se devuelve en `{ user }`; el proveedor de IA se elegirá según el plan.

## 11. Pendientes

- Asociar `analyses.user_id` al usuario autenticado y filtrar el histórico por usuario.
- Límites de uso según plan (free vs premium).
- Recuperación de contraseña y verificación de email (fuera de beta).
