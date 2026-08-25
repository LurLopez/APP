# Funcionalidad: Listas de seguimiento (watchlists) — Frontend

> Capa: **frontend** · Fecha: 2026-08-15 · Estado: **implementado y probado**

---

## 1. Objetivo

Que el usuario organice sus acciones en **varias listas de seguimiento** desde cualquier punto de la web: un **popover con checkmarks** al pulsar el ojo de seguimiento (en Inicio y en Empresa) y una **sección completa de listas** (Inicio y lateral de Empresa) con las cotizaciones de la lista seleccionada. Todo en un módulo compartido `public/watchlists.js`.

## 2. Alcance

**Incluido:**
- Módulo global `Watchlists` con estado compartido entre páginas (emite el evento `watchlists:change`).
- Popover (ojo de seguimiento): lista de listas con marca ✓ por pertenencia, creación inline, borrado con confirmación de dos pasos y cierre robusto (clic fuera, Escape, scroll fuera; no se cierra al hacer scroll dentro).
- Sección de listas (`mountSection`): chips de listas con recuento, creación inline, borrado, y tabla con cotizaciones de la lista activa.
- Sin sesión: toast + apertura del modal de login al intentar usar el ojo.

**Excluido:**
- Alertas de precio (pendiente).
- Renombrar desde el popover (solo desde la sección futura; de momento la API lo soporta pero la UI actual renombra vía la sección cuando exista — ver pendientes).

## 3. Estado compartido y eventos

- `setAuthenticated(value)`: se llama desde `auth.js` al cargar/login/logout; sin sesión resetea todo.
- `refresh()`: `GET /api/watchlists`, reconstruye `lists`, `byId` y `membership` (Map ticker → Set de listas) y emite `watchlists:change`.
- `isInAnyList(ticker)` / `listsContaining(ticker)`: consultas de pertenencia (las usan los ojos de seguimiento).
- `toggle(listId, ticker, companyName)`: añade/quita con actualización optimista y reintento de estado si falla la API.
- `window.addEventListener('watchlists:change', ...)`: re-renderiza la sección montada y los ojos.

## 4. Popover de seguimiento

**Activación**: clic en el ojo (`.watch-fav` en Inicio o `.company-fav` en Empresa). Sin sesión → toast "Inicia sesión para guardar acciones en listas de seguimiento." y modal de login.

**Estructura** (`.watch-popover`, `role="dialog"`):
- Cabecera: "Listas de seguimiento" + ticker · nombre de empresa + botón ×.
- Lista interna `.watch-popover-list` (máx. `min(320px, 45vh)`, scroll propio): una fila por lista con checkmark (✓ si la acción está en esa lista), nombre, recuento y botón de borrar (confirmación de dos pasos "¿Eliminar?" con temporizador de 3 s; nunca en la por defecto).
- Formulario de creación inline (input máx. 40 + botón "Crear" habilitado solo con texto).

**Comportamiento**:
- Clic en la fila (o Enter/Espacio) alterna la pertenencia de la acción en esa lista.
- Posicionamiento anclado al ojo, con volteo si no cabe (abajo/arriba) y límites de ventana.
- **Cierre robusto**: clic fuera, Escape y scroll de la página cierran; el scroll **dentro** de la lista NO cierra (fix 17:05); al re-renderizar se restaura el `scrollTop` (fix 17:20, con muchas listas no salta arriba).
- Crear lista desde el popover la deja creada y lista para marcar.

## 5. Sección de listas (`Watchlists.mountSection(root, { countEl, onNavigate, onEmptyChange })`)

Renderiza en `root`:
- **Toolbar**: chips de listas (nombre + recuento, activo con borde naranja, borrable con confirmación de dos pasos salvo la por defecto) + formulario de creación.
- **Tabla** de la lista seleccionada (`.favorites-market-table`, estilo Investing): Nombre (bandera 🇺🇸 + enlace al perfil), Símbolo (enlace), Último, Apertura, Máximo, Mínimo, Var., % var., Vol., Fecha/Hora (con punto de estado de mercado) y ojo para quitar de la lista. La petición de detalle (`GET /api/watchlists/:id`) se repite al cambiar de lista o tras cualquier cambio.
- **Estados vacíos**: sin sesión → "Inicia sesión para guardar y ver tus listas de seguimiento."; sin listas → mensaje + creación; lista vacía → "Esta lista está vacía. Usa el ojo de seguimiento de una empresa para añadirla."
- `countEl` muestra "N acciones" totales (distintos tickers); `onEmptyChange(total > 0)` permite a Inicio ocultar la sección si no hay nada.
- `onNavigate(ticker)` navega al perfil (`/empresa/:ticker`) al pulsar una fila.

## 6. Integración en las páginas

**Inicio (`index.html` + `app.js`)**:
- Enlace superior "Seguimiento" (antes "Favoritos"); sección `#favoritos` "Acciones en seguimiento" (oculta si no hay nada, vía `onEmptyChange`).
- Tarjetas de empresa destacadas con ojo `.watch-fav` que abre el mismo popover.

**Empresa (`empresa.html` + `empresa.js`)**:
- La cabecera de la empresa usa el **ojo de seguimiento** (antes corazón): estado activo (relleno) si la acción está en **alguna** lista; al pulsarlo abre el popover.
- Sección lateral "TUS LISTAS DE SEGUIMIENTO": monta el mismo gestor (antes solo mostraba la lista por defecto).

## 7. Formateadores (compartidos en `watchlists.js`)

`formatWatchNumber` (es-ES, 2 decimales), `formatWatchSigned` (prefijo +/−), `formatWatchPercent`, `formatWatchVolume` (K/M/B), `formatWatchTime` (HH:mm:ss), `watchChangeClass` (verde/rojo). Antes duplicados en `app.js` y `empresa.js`; ahora viven solo aquí.

## 8. Estados y errores

| Caso | Comportamiento |
|---|---|
| Sin sesión + clic en el ojo | Toast + modal de login |
| Crear lista duplicada | Toast con el error 409 del servidor |
| Borrar lista (no por defecto) | Confirmación de dos pasos; toast de confirmación |
| API caída al refrescar | Estado local reseteado; la sección muestra mensaje de error |
| Muchas listas | Scroll interno (barra visible), el popover no se cierra ni salta al marcar |

## 9. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/watchlists.js` | Módulo `Watchlists` completo (estado, popover, sección, formatos). Cargado antes de `app.js`/`empresa.js`. |
| `public/index.html` / `public/app.js` | Enlace "Seguimiento", sección `#favoritos`, ojos en tarjetas, montaje de la sección. |
| `public/empresa.html` / `public/empresa.js` | Ojo de seguimiento en la cabecera, sección lateral de listas. |
| `public/auth.js` | `setAuthenticated` al cargar/login/logout (evento `auth:change`). |
| `public/styles.css` | Popover (`.watch-popover*`), chips (`.watch-section-chip*`), tabla (`.favorites-market-table`), ojos; versiones `?v=24`/`?v=25`. |

## 10. Responsive

- La tabla tiene scroll horizontal (`favorites-table-wrap`); el popover se limita al ancho de la ventana (márgenes de 8 px) y voltea hacia arriba si no cabe.
- La sección apila chips y formulario en pantallas estrechas (estilos responsive existentes).

## 11. Pruebas realizadas

- API devuelve dos listas de un usuario de prueba (Favoritos + "ETT"); sección renderiza chips + tabla.
- Popover: marcar/desmarcar con scroll preservado; cierre con scroll de página; sin cierre con scroll interno.
- `node --check` OK y recursos estáticos 200.

## 12. Relación con otros módulos

- **Backend**: `documentacion/backend/funcionalidades/listas-seguimiento/` (endpoints `/api/watchlists`).
- **Cartera**: la sección de Inicio monta `Portfolio.mountSection` de forma análoga (mismo patrón).
- **Auth**: depende de la sesión; sin sesión todo queda en estado invitado.

## 13. Pendientes

- Renombrar listas desde la interfaz (la API ya lo soporta: `PATCH /api/watchlists/:id`).
- Alertas de precio basadas en las listas.
