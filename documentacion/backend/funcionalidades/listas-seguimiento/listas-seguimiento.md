# Funcionalidad: Listas de seguimiento (watchlists) — Backend

> Capa: **backend** · Fecha: 2026-08-15 · Estado: **implementado y probado** · Sustituye a los favoritos

---

## 1. Objetivo

Permitir que cada usuario organice acciones en **varias listas de seguimiento** (crear, renombrar, eliminar, añadir/quitar acciones), con una lista por defecto **"Favoritos"** que no se puede renombrar ni eliminar. Sustituye al antiguo sistema de favoritos (tabla `favorites`), migrando los datos existentes.

## 2. Alcance

**Incluido:**
- CRUD completo de listas y de elementos (items) por usuario, todo tras `requireAuth`.
- Creación perezosa de la lista por defecto "Favoritos" (se crea la primera vez que se consulta).
- Listado de listas con recuento y tickers (sin cotizaciones) y detalle con cotizaciones.
- Resolución del nombre de la empresa desde EDGAR cuando el cliente no lo envía.
- Migración automática en `db/schema.sql`: los favoritos existentes se copian a la lista por defecto y la tabla `favorites` se elimina.

**Excluido:**
- Notificaciones/alertas sobre las acciones en seguimiento (pendiente, roadmap).
- Compartir listas entre usuarios (fuera de alcance).

## 3. Base de datos

```sql
CREATE TABLE watchlists (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE watchlist_items (
    id           SERIAL PRIMARY KEY,
    watchlist_id INT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    ticker       TEXT NOT NULL,
    company_name TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (watchlist_id, ticker)
);

CREATE INDEX idx_watchlists_user ON watchlists (user_id);
CREATE INDEX idx_watchlist_items_watchlist ON watchlist_items (watchlist_id);
CREATE INDEX idx_watchlist_items_ticker ON watchlist_items (ticker);
```

**Migración de favoritos** (al final de `db/schema.sql`, idempotente):
1. Copia cada fila de `favorites` a la lista por defecto "Favoritos" de su usuario (`ON CONFLICT DO NOTHING`).
2. Elimina la tabla `favorites`.

## 4. Repositorio (`db/repositories/watchlistRepository.js`)

| Función | Comportamiento |
|---|---|
| `ensureDefaultWatchlist(userId)` | Crea la lista "Favoritos" (`is_default=true`) si no existe (`ON CONFLICT DO NOTHING`). Se llama desde `listWatchlists`. |
| `listWatchlists(userId)` | Listas del usuario con `items` agregados con `json_agg` (ticker + companyName, orden más reciente primero); orden: por defecto primero, luego por creación. |
| `getWatchlist(userId, id)` | Una lista (columnas crudas de BD). |
| `listWatchlistItems(userId, id)` | Items de una lista (verifica que la lista sea del usuario). |
| `createWatchlist(userId, name)` | INSERT con `RETURNING`. |
| `renameWatchlist(userId, id, name)` | UPDATE con `RETURNING`. |
| `deleteWatchlist(userId, id)` | DELETE con `RETURNING`. |
| `addItem(userId, id, ticker, companyName)` | INSERT…SELECT desde listas del usuario; **upsert** (`ON CONFLICT (watchlist_id, ticker) DO UPDATE SET company_name`). |
| `removeItem(userId, id, ticker)` | DELETE usando las listas del usuario. |
| `removeItemFromAllLists(userId, ticker)` | Quita el ticker de todas las listas del usuario (preparado para uso futuro). |

## 5. Endpoints (`src/api/routes/watchlists.routes.js`, montado en `/api/watchlists`)

Todos requieren sesión (`requireAuth`); sin cookie → 401.

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `GET` | `/` | — | 200 `{ ok, watchlists: [{ id, name, isDefault, createdAt, count, tickers: [{ ticker, companyName }] }] }` |
| `POST` | `/` | `{ name }` (1–40 caracteres) | 201 `{ ok, watchlist }` · 400 nombre inválido · 409 nombre duplicado |
| `PATCH` | `/:id` | `{ name }` | 200 `{ ok, watchlist }` · 400 no válida / es la por defecto · 404 no existe |
| `DELETE` | `/:id` | — | 200 `{ ok }` · 400 es la por defecto · 404 no existe |
| `GET` | `/:id` | — | 200 `{ ok, watchlist: { id, name, isDefault, createdAt, items: [{ id, ticker, companyName, createdAt, quote }] } }` · 400/404 |
| `POST` | `/:id/items` | `{ ticker, companyName? }` | 201 `{ ok, item }` · 400 ticker inválido · 404 lista inexistente |
| `DELETE` | `/:id/items/:ticker` | — | 200 `{ ok }` · 400 solicitud no válida |

### Reglas de negocio

- **Nombre**: se normaliza (trim + espacios simples) y debe tener 1–40 caracteres (`NAME_PATTERN`). Duplicado → 409 "Ya existe una lista con ese nombre." (código SQL `23505`).
- **Lista por defecto** ("Favoritos"): no se puede renombrar ("La lista de favoritos no se puede renombrar.") ni eliminar ("La lista de favoritos no se puede eliminar.") → 400.
- **Añadir item**: si no llega `companyName`, se resuelve con `getCompanyByTicker(ticker)` de EDGAR (404 `COMPANY_NOT_FOUND` si el ticker no existe). Es un **upsert**: repetir el ticker actualiza el nombre.
- **Ticker**: patrón `^[A-Z0-9.-]{1,10}$`.
- **Detalle con cotizaciones**: cada item incluye `quote` de `getMarketQuote` (Yahoo); si una cotización falla, se devuelve `null` sin romper el resto.

## 6. Errores y casos límite

| Caso | Respuesta |
|---|---|
| Sin sesión | 401 (middleware `requireAuth`) |
| Nombre vacío o > 40 caracteres | 400 "El nombre debe tener entre 1 y 40 caracteres." |
| Nombre duplicado (23505) | 409 "Ya existe una lista con ese nombre." |
| Renombrar/eliminar la lista por defecto | 400 con mensaje específico |
| Lista inexistente o de otro usuario | 404 "La lista no existe." |
| `id` no entero | 400 "Lista no válida." |
| Ticker inválido al añadir/quitar | 400 "Ticker no válido." / "Solicitud no válida." |
| Ticker inexistente en EDGAR (sin companyName) | 404 `COMPANY_NOT_FOUND` |

## 7. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `db/schema.sql` | Tablas `watchlists` + `watchlist_items`; migración de `favorites` (copia + DROP). |
| `db/repositories/watchlistRepository.js` | Acceso a BD (crear listas/items, listar, renombrar, eliminar, upsert). |
| `src/api/routes/watchlists.routes.js` | Router con los 7 endpoints; validaciones y mapeo de errores. |
| `src/services/edgar.service.js` | `getCompanyByTicker` (resolver nombre). |
| `src/services/market.service.js` | `getMarketQuote` (cotizaciones del detalle). |
| `src/middleware/auth.middleware.js` | `requireAuth`. |
| `server.js` | Monta el router en `/api/watchlists`. |

## 8. Decisiones y motivos

| Decisión | Motivo |
|---|---|
| **Sustituir `favorites` por `watchlists` + `watchlist_items`** | Soporta varias listas por usuario; la tabla de favoritos era un único conjunto por usuario. La migración conserva los datos. |
| **Lista por defecto inmutable** | Reemplaza el concepto de favoritos sin romper la UX: siempre existe dónde añadir. |
| **Creación perezosa de la por defecto** | No exige migrar datos al registrarse; se crea en el primer listado. |
| **Upsert de items** | Añadir un ticker ya presente no duplica ni falla; actualiza el nombre de empresa. |
| **`json_agg` en el listado** | Una sola consulta devuelve listas + items (sin N+1). |
| **Cotizaciones solo en el detalle (`GET /:id`)** | El listado general es barato y rápido; la tabla con cotizaciones solo se pide cuando se muestra. |

## 9. Pruebas realizadas

- Migración verificada: 1 favorita antigua conservada en "Favoritos"; tabla `favorites` eliminada.
- Flujo completo con usuario temporal: crear lista → duplicado 409 → nombre inválido 400 → añadir/upsert/quitar items → renombrar → borrar lista → borrar por defecto 400 → 404 lista inexistente → ticker inválido 400 → 401 sin sesión.
- Recursos estáticos 200 y `node --check` correctos.

## 10. Relación con otros módulos

- **Frontend**: `public/watchlists.js` consume la API (ver `documentacion/frontend/funcionalidades/listas-seguimiento/`).
- **Empresa**: el ojo de seguimiento de la página de empresa usa el popover compartido.
- **Inicio**: la sección "Acciones en seguimiento" muestra las listas y sus cotizaciones.
- **Fase 2/roadmap**: las listas alimentan futuras alertas de precio (pendiente).

## 11. Pendientes

- Alertas de precio por email sobre acciones en seguimiento (roadmap).
- Asociar el estado de las listas al perfil de cuenta (Fase 3 ampliada).
