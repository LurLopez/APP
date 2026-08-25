# Funcionalidad: Histórico de análisis por usuario — Frontend

> Capa: **frontend** · Fecha: 2026-08-14 · Estado: **implementado y probado**

---

## 1. Objetivo

Mostrar en la pantalla principal ("Mis análisis") todos los análisis del usuario conectado, con **filtros por empresa y por fecha** (de los resultados o del análisis), y abrir el PDF de cada análisis en otra pestaña. Sustituye a la tabla demo estática.

## 2. Alcance

**Incluido:**
- Sección `#historial` con tabla real (Documento, Empresa, Periodo, Fecha resultados, Fecha análisis, Estado, ↗).
- Filtros: empresa por texto, tipo de fecha (resultados/análisis), desde/hasta y botón Limpiar.
- Estados vacíos diferenciados (sin sesión vs. sin resultados).
- Recarga automática al entrar/salir de sesión y al completar un análisis (toast "Análisis guardado en tu histórico").

**Excluido:**
- Vista de detalle del informe dentro de la web (se abre el PDF; decisión del usuario).

## 3. Flujo

```
Cargar página → ¿sesión? (auth:change)
  → sí → GET /api/analyses → tabla con filas (o "sin resultados")
  → no → estado "Inicia sesión para ver tu histórico" + botón Iniciar sesión (abre el modal)

Filtros → GET /api/analyses?ticker=...&periodFrom=...&periodTo=... (o createdFrom/createdTo)
  → repintar tabla; "Limpiar" restablece y recarga

Clic en una fila (o botón ↗) → abre pdfUrl en pestaña nueva
```

- El selector de tipo de fecha (radio "De los resultados" / "Del análisis") decide qué parámetros se envían (`period*` vs `created*`).
- Al completar un análisis con sesión, el flujo de análisis refresca el histórico y muestra el toast.

## 4. Estructura de la sección

| Elemento | Detalle |
|---|---|
| Título | "Mis análisis" (eyebrow ACTIVIDAD) + botón "Actualizar ↻" |
| Filtros (`#history-filters`, ocultos sin sesión) | Input Empresa (ticker o nombre), radio fecha resultados/análisis, Desde/Hasta (date), botón Limpiar |
| Tabla (`#history-table`) | Documento, Empresa, Periodo, Fecha resultados, Fecha análisis, Estado, columna de acción (↗) |
| Vacío (`#history-empty`) | Texto según el caso + botón "Iniciar sesión" (sin sesión) |

## 5. Estados

| Caso | Comportamiento |
|---|---|
| Sin sesión | Mensaje + botón "Iniciar sesión" (abre el modal de login; fix en `auth.js`: `openModal` ahora expuesto en `window`) |
| Con sesión, sin análisis | Mensaje según haya filtros activos o no |
| Con análisis | Tabla con filas; pulsar fila o ↗ abre el PDF |
| Carga con fallo de red | Mensaje de error del servidor |

## 6. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/index.html` | Sección `#historial` con filtros y tabla. |
| `public/app.js` | Carga del histórico (`loadHistory`), manejo de filtros, re-render, apertura del PDF, refresco tras análisis. |
| `public/auth.js` | Evento `auth:change` (recarga al entrar/salir); fix `openModal` expuesto. |
| `public/styles.css` | Estilos de filtros (`history-filter*`) y tabla de histórico. |

## 7. Pruebas realizadas

- Endpoint verificado de extremo a extremo con usuario temporal (filtros por ticker y rangos de fechas; 401 sin sesión; lista vacía sin coincidencias).
- Flujo del modal de login desde el CTA del histórico (fix `openModal`).
- `node --check` correcto.

## 8. Relación con otros módulos

- **Backend**: `documentacion/backend/funcionalidades/historico-analisis/` (guardado y `GET /api/analyses`).
- **Análisis**: al completar un análisis con sesión, se refresca el histórico (evento).
- **Auth**: sin sesión no se carga el histórico.

## 9. Pendientes

- Vista de detalle del análisis dentro de la web (por ahora se abre el PDF).
