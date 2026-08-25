# Funcionalidad: Registro, inicio de sesión y verificación de correo — Frontend

> Capa: **frontend** · Fecha: 2026-08-12 (base) · Actualizado: 2026-08-14 (recuperación de contraseña) · Estado: **implementado y probado contra la API real**

---

## 1. Objetivo

Dar al usuario la interfaz para crearse una cuenta (con **verificación por correo en dos pasos**), iniciar sesión, **recuperar la contraseña** si la olvida, ver su estado (logueado o invitado) y cerrar sesión, integrada con la API de autenticación del backend (`documentacion/backend/funcionalidades/register/register.md`).

## 2. Alcance

**Incluido:**
- Botones "Iniciar sesión" y "Crear cuenta" en la topbar (Inicio y Empresa).
- Modal con pestañas (login / registro), **validación cliente** y errores del servidor visibles.
- **Dos pasos en el registro**: credenciales → **verificación** (código de 6 dígitos, reenviar, "usar otro correo").
- Login con cuenta sin verificar → salta automáticamente al paso de verificación (403 `EMAIL_NOT_VERIFIED`).
- **Recuperación de contraseña**: enlace "¿Olvidaste tu contraseña?" (solo en login) → paso de correo → paso de código + nueva contraseña (repetida); al completar cierra, avisa y vuelve al login.
- Estado de sesión restaurado al cargar (`GET /api/auth/me`); chip de usuario en la topbar; tarjeta de cuenta en el sidebar (solo Inicio).
- Cierre del modal con `×`, click fuera o `Escape`.

**Excluido (pendiente):**
- Zona de cuenta (perfil, cambiar contraseña desde la cuenta).
- Iniciar sesión con Google (roadmap).

## 3. Flujo de la interfaz

### Carga inicial
```
auth.js se ejecuta al abrir la página
  → GET /api/auth/me
      → 200: state.user = usuario → renderAuth() (sesión iniciada) → emite auth:change
      → 401: state.user = null    → renderAuth() (invitado)
```

### Registro (dos pasos)
```
Paso 1 — credenciales: email + contraseña + repetir
  → validación cliente: contraseñas coinciden y ≥ 8
  → POST /api/auth/register { email, password }
      → 201: pasa al PASO 2 (verificación); el código llega por correo (o consola sin SMTP)
      → 409/400: error dentro del modal (no se cierra)

Paso 2 — verificación: código de 6 dígitos
  → POST /api/auth/verify { email, code }
      → 200: renderAuth() + cerrar modal + toast "Cuenta verificada. Bienvenido, ..."
      → 400 CODE_EXPIRED / "El código no es correcto.": error en el paso 2
  → enlaces: "Reenviar código" (POST /resend-code) y "Usar otro correo" (vuelve al paso 1)
```

### Login
```
POST /api/auth/login { email, password }
  → 200: renderAuth() + cerrar modal + toast "Bienvenido de nuevo, ..."
  → 401: "Correo o contraseña incorrectos." dentro del modal
  → 403 EMAIL_NOT_VERIFIED: pasa al paso 2 (verificación) con el email ya rellenado
```

### Recuperación de contraseña
```
Enlace "¿Olvidaste tu contraseña?" (pestaña login) → paso auth-reset-request
  → email → POST /api/auth/forgot-password → toast "Te hemos enviado un código..." → paso auth-reset-code
Paso auth-reset-code: código + nueva contraseña + repetir
  → validación cliente (6 dígitos, ≥ 8, coinciden)
  → POST /api/auth/reset-password
      → 200: cerrar modal + toast "Contraseña cambiada" + reabrir el login
      → 400: error en el paso
  → enlaces: "Reenviar código" y "Volver" (al login)
```

### Logout
```
Botón "Salir" (chip de la topbar o tarjeta del sidebar)
  → POST /api/auth/logout → state.user = null → renderAuth() → toast "Sesión cerrada."
```

## 4. Estados de la interfaz (renderAuth)

| Elemento | Invitado | Logueado |
|---|---|---|
| Topbar: botones auth | "Iniciar sesión" + "Crear cuenta" | Ocultos |
| Topbar: chip usuario | Oculto | Avatar (2 iniciales) + email + salir |
| Sidebar (Inicio): tarjeta cuenta | "Invitado · Beta privada · Entrar" | email + plan + Salir |

`renderAuth` emite el evento **`auth:change`** con el usuario: favoritos/listas, cartera e histórico se recargan; el screener re-aplica el bloqueo PRO.

## 5. Pantallas del modal

| Pantalla | ID | Contenido |
|---|---|---|
| Login | `#auth-login` | Email, contraseña, enlace "¿Olvidaste tu contraseña?" (`.forgot-row`), botón entrar |
| Registro | `#auth-register` | Email, contraseña, repetir, botón crear cuenta |
| Verificación | `#auth-verify` | Código (6 dígitos), "Reenviar código", "Usar otro correo", botón verificar |
| Reset: pedir código | `#auth-reset-request` | Email + "Enviar código" |
| Reset: nuevo código | `#auth-reset-code` | Código + nueva contraseña + repetir + "Cambiar contraseña", reenviar, volver |

## 6. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/auth.js` | Estado de sesión, `api()` helper, modal (5 pantallas, validaciones, errores), `renderAuth()`, `logout`, `openModal` (expuesto en `window` — fix 2026-08-14), `initials()`, `setAuthenticated` para módulos (watchlists, cartera). |
| `public/index.html` / `public/empresa.html` | Botones en la topbar (`#auth-area`), chip de usuario, tarjeta de cuenta (solo Inicio), modal de autenticación con las 5 pantallas; carga de `auth.js`. |
| `public/styles.css` | Estilos del modal (`.modal-backdrop`, `.modal`, `.modal-tabs`, `.auth-field`, `.verify-hint`, `.verify-actions .link-button`, `.forgot-row`, `.user-chip`, `.account-action`) y regla global `[hidden] { display: none !important; }`. |

## 7. Comunicación con el backend

| Llamada | Método | Uso |
|---|---|---|
| `/api/auth/me` | GET | Restaurar sesión al cargar |
| `/api/auth/register` | POST | Crear cuenta (sin sesión) |
| `/api/auth/verify` | POST | Verificar código → sesión |
| `/api/auth/resend-code` | POST | Reenviar código |
| `/api/auth/login` | POST | Iniciar sesión |
| `/api/auth/forgot-password` | POST | Pedir código de recuperación |
| `/api/auth/reset-password` | POST | Cambiar contraseña |
| `/api/auth/logout` | POST | Cerrar sesión |

Los errores del servidor (`{ error, code }`) se muestran dentro del modal; `api()` propaga `error.code` para distinguir `EMAIL_NOT_VERIFIED` y `CODE_EXPIRED`.

## 8. Errores y casos límite

| Caso | Comportamiento |
|---|---|
| Contraseñas no coinciden (registro/reset) | Error cliente, sin llamada al servidor |
| Código no numérico de 6 dígitos | Error cliente en el paso de verificación |
| Email duplicado (409) | Mensaje del servidor en el modal |
| Login sin verificar (403) | Salta al paso de verificación con el email rellenado |
| Código caducado/agotado | Mensaje con `CODE_EXPIRED` y enlace "Reenviar código" |
| Doble submit | Botón desactivado ("Espera un momento...") hasta la respuesta |
| Escape / click fuera / × | Cierra el modal y resetea los pasos |
| Red caída o 5xx | Mensaje del servidor o "Error del servidor." |

## 9. Pruebas realizadas

- Flujo completo contra la API real (registro → login bloqueado 403 → código erróneo → verificación → login OK).
- Recuperación de contraseña completa (correo real enviado a lurlopez13@gmail.com; login con la nueva contraseña OK; antigua 401; código reutilizado rechazado).
- Chrome headless vía CDP: 13/13 comprobaciones del modal (enlace visible solo en login, paso a paso, pantallas ocultas, reenvío, vuelta atrás, cierre) sin errores de consola en `index.html` y `empresa.html`.
- **Bug corregido (2026-08-12, 21:21)**: el modal no se cerraba tras login. Causa: CSS con `display` anulaba `hidden`. Fix: `[hidden] { display: none !important; }`.
- **Bug corregido (2026-08-14)**: `openModal` no estaba expuesto en `window`, así que los CTA de "Iniciar sesión" (histórico, favoritos) no abrían el modal.

## 10. Relación con otros módulos

- **Backend de auth** (misma carpeta): consume sus 8 endpoints.
- **Histórico / cartera / listas**: dependen de la sesión; `auth:change` los recarga.
- **Screener**: al cambiar la sesión se recarga en silencio la empresa cargada para aplicar el límite de periodos (bloqueo PRO).
- **Fase 5 (planes)**: `state.user.plan` ya está disponible.

## 11. Pendientes

- Iniciar sesión con Google (roadmap).
- Zona de cuenta (cambiar contraseña desde el perfil).
- Reproducir el "posible problema con el correo la primera vez" al reenviar (anotado en `roadmap`).
