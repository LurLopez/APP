# Funcionalidad: Registro e inicio de sesión — Frontend

> Capa: **frontend** · Fecha: 2026-08-12 · Estado: **implementado y probado contra la API real**

---

## 1. Objetivo

Dar al usuario la interfaz para crearse una cuenta, iniciar sesión, ver su estado (logueado o invitado) y cerrar sesión, integrada con la API de autenticación del backend (`documentacion/backend/funcionalidades/register/register.md`).

## 2. Alcance

**Incluido:**
- Botones "Iniciar sesión" y "Crear cuenta" en la topbar.
- Modal con pestañas (login / registro), validación cliente y errores del servidor visibles.
- Estado de sesión restaurado al cargar la página (`GET /api/auth/me`).
- Chip de usuario en la topbar (avatar con iniciales + email + botón salir).
- Tarjeta de cuenta en el sidebar: "Invitado → Entrar" o "email + plan → Salir".
- Cierre del modal con `×`, click fuera o tecla `Escape`.

**Excluido (pendiente):**
- Registro asociado a la generación de análisis (histórico por usuario).
- Zona de cuenta (perfil, cambiar contraseña).

## 3. Flujo de la interfaz

### Carga inicial
```
auth.js se ejecuta al abrir la página
  → GET /api/auth/me
      → 200: state.user = usuario → renderAuth() (sesión iniciada)
      → 401: state.user = null    → renderAuth() (invitado)
```

### Registro (pestaña "Crear cuenta")
```
Usuario → rellena email, contraseña y repite contraseña
  → validación cliente: contraseñas coinciden y ≥ 8
  → POST /api/auth/register { email, password }
      → 201: renderAuth() + cerrar modal + toast "Cuenta creada. Bienvenido, ..."
      → 409/400: mostrar error dentro del modal (no se cierra)
```

### Login (pestaña "Iniciar sesión")
```
POST /api/auth/login { email, password }
  → 200: renderAuth() + cerrar modal + toast "Bienvenido de nuevo, ..."
  → 401: "Correo o contraseña incorrectos." dentro del modal
```

### Logout
```
Botón "Salir" (chip de la topbar o tarjeta del sidebar)
  → POST /api/auth/logout
  → state.user = null → renderAuth() → toast "Sesión cerrada."
```

## 4. Estados de la interfaz (renderAuth)

| Elemento | Invitado | Logueado |
|---|---|---|
| Topbar: botones auth | "Iniciar sesión" + "Crear cuenta" visibles | Ocultos |
| Topbar: chip usuario | Oculto | Avatar (2 iniciales del email) + email + "×" (salir) |
| Sidebar: tarjeta cuenta | Avatar "?" · "Invitado" · "Beta privada" · botón "Entrar" | Avatar (iniciales) · email · "Plan gratuito/Premium" · botón "Salir" |

## 5. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/index.html` | Botones en la topbar (`#auth-area`), chip de usuario (`#user-chip`), tarjeta de cuenta en el sidebar (`#account-card`), modal de autenticación al final del body, carga de `auth.js` tras `app.js`. |
| `public/auth.js` | Toda la lógica: estado de sesión, `api()` helper con fetch, modal (pestañas, validación, errores), `renderAuth()`, logout. |
| `public/styles.css` | Estilos: `.ghost-button`, `.user-chip`, `.user-avatar`, `.user-logout`, `.account-action`, `.modal-backdrop`, `.modal`, `.modal-tabs`, `.auth-field`, `.modal-error`, `.auth-submit`. En móvil (≤ 700 px) se ocultan los botones de texto y el email del chip. |

## 6. Comunicación con el backend

`auth.js` usa `fetch` con cookies automáticas (same-origin, sin configuración extra):

| Llamada | Método | Uso |
|---|---|---|
| `/api/auth/me` | GET | Restaurar sesión al cargar |
| `/api/auth/register` | POST | Crear cuenta |
| `/api/auth/login` | POST | Iniciar sesión |
| `/api/auth/logout` | POST | Cerrar sesión |

Los errores del servidor (`{ error }`) se muestran dentro del modal, no en el toast.

## 7. Errores y casos límite

| Caso | Comportamiento |
|---|---|
| Contraseñas no coinciden (registro) | Error cliente: "Las contraseñas no coinciden." Sin llamada al servidor. |
| Email duplicado (409) | Mensaje del servidor dentro del modal; el formulario se mantiene. |
| Credenciales incorrectas (401) | Mensaje del servidor dentro del modal. |
| Doble submit | El botón se desactiva ("Espera un momento...") hasta recibir respuesta. |
| Escape / click fuera / × | El modal se cierra y el formulario se resetea. |
| Red caída o 5xx | Se muestra el error del servidor; si no hay mensaje, "Error del servidor." |
| Logout sin sesión | Se limpia el estado local igualmente. |

## 8. Pruebas realizadas

- Flujo completo verificado contra la API real: registro 201, login 200, `/me` 200 con cookie y 401 sin cookie, logout 200 y `/me` 401 tras logout.
- Comprobación visual de los dos estados (invitado / logueado) en topbar y sidebar.
- **Bug corregido (2026-08-12, 21:21)**: el modal no se cerraba tras iniciar sesión. Causa: el CSS declaraba `display: grid/flex` en `.modal-backdrop` (y otros), anulando el atributo `hidden` del HTML. Fix: regla global `[hidden] { display: none !important; }` en `public/styles.css`. Afectaba también al dropzone de subida de PDF (nunca se ocultaba al elegir archivo); queda corregido de paso.

## 9. Relación con otros módulos

- **Backend de auth** (mismo nombre de carpeta): consume sus 4 endpoints.
- **Futuro histórico**: cuando exista `GET /api/analyses` protegido, el chip de usuario indicará sesión iniciada y el histórico se cargará por usuario.
- **Fase 5 (planes)**: `state.user.plan` ya está disponible para mostrar el plan y, en el futuro, gestionar límites.

## 10. Pendientes

- Mostrar el histórico real del usuario conectado en la tabla de "Últimos análisis".
- Zona de cuenta (perfil, cambiar contraseña, plan).
- Recordatorio de sesión (el token caduca a los 7 días; el modal pedirá login de nuevo con 401).
