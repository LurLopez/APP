# Funcionalidad: Cartera de inversión (portfolio) — Backend

> Capa: **backend** · Fecha: 2026-08-17 · Estado: **implementado y probado**

---

## 1. Objetivo

Gestionar la cartera de inversión del usuario: registrar **compras y ventas** de acciones con cantidad, precio y fecha, reconstruir el estado por el **método FIFO**, y calcular para cada posición y para el total: coste medio, valor actual, ganancias no realizadas y realizadas (con y sin dividendos), dividendos acumulados estimados con fechas de pago reales, dividendos anuales previstos (TTM), rentabilidad por dividendo y distribución de la cartera por empresa y por sector.

## 2. Alcance

**Incluido:**
- Alta/baja de transacciones (buy/sell) validadas; venta limitada a las acciones disponibles (FIFO).
- Una única cartera por usuario, reconstruida siempre desde `portfolio_transactions` (sin tabla de estado).
- Dividendos estimados con las **fechas de pago reales** de Yahoo Finance (porción de cada lote: compra→venta para lo vendido, compra→hoy para lo que queda).
- Sector de cada posición desde el SIC de EDGAR (mapeo a sector amplio en español).
- Cotización actual de Yahoo para valorar la cartera.

**Excluido (pendiente en roadmap):**
- Comisiones (se ignoran; decisión de producto).
- Dividendos "reales cobrados" declarados por el usuario (los actuales son estimados por fecha de pago).
- Impuestos.

## 3. Base de datos

```sql
CREATE TABLE portfolio_transactions (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker       TEXT NOT NULL,
    company_name TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
    shares       NUMERIC(18, 6) NOT NULL CHECK (shares > 0),
    price        NUMERIC(18, 6) NOT NULL CHECK (price >= 0),
    trade_date   DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolio_transactions_user ON portfolio_transactions (user_id, trade_date, id);
CREATE INDEX idx_portfolio_transactions_ticker ON portfolio_transactions (ticker);
```

No hay tabla de cartera: **el estado se reconstruye de las transacciones** en cada lectura.

### Tablas de pestañas y grupos

```sql
CREATE TABLE portfolio_tabs (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#2563eb',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE portfolio_groups (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tab_id     INT NOT NULL REFERENCES portfolio_tabs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#2563eb',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, tab_id, name)
);

CREATE TABLE portfolio_group_rules (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id   INT NOT NULL REFERENCES portfolio_groups(id) ON DELETE CASCADE,
    ticker     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_id, ticker)
);

CREATE TABLE portfolio_group_lots (
    id                 SERIAL PRIMARY KEY,
    user_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id           INT NOT NULL REFERENCES portfolio_groups(id) ON DELETE CASCADE,
    buy_transaction_id INT NOT NULL REFERENCES portfolio_transactions(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_id, buy_transaction_id)
);

CREATE INDEX idx_portfolio_tabs_user ON portfolio_tabs (user_id);
CREATE INDEX idx_portfolio_groups_user ON portfolio_groups (user_id, tab_id);
CREATE INDEX idx_portfolio_group_rules_user ON portfolio_group_rules (user_id, ticker);
CREATE INDEX idx_portfolio_group_lots_user ON portfolio_group_lots (user_id);
```

- `portfolio_tabs` y `portfolio_groups`: nombre único por usuario (y por pestaña en el caso de los grupos) → error `DUPLICATE`.
- `portfolio_group_rules`: regla a nivel de **ticker** ("toda la acción" en el grupo; las operaciones futuras de ese ticker entran solas).
- `portfolio_group_lots`: asignación de **sublínea** por `buy_transaction_id` (lote concreto de una compra). Las cascadas `ON DELETE` limpian reglas/asignaciones al borrar grupo, pestaña o compra.

## 4. Repositorio (`db/repositories/portfolioRepository.js`)

| Función | Comportamiento |
|---|---|
| `listTransactions(userId)` | Todas las transacciones del usuario ordenadas por `trade_date ASC, id ASC`; convierte fechas pg (Date) a ISO local con `toIsoDate` (bug corregido: `String(Date)` daba "Sat Nov 15"). |
| `addTransaction(userId, tx)` | INSERT con `RETURNING`; normaliza el resultado igual que el listado. |
| `getTransaction(userId, id)` | Una transacción o `null`. |
| `deleteTransaction(userId, id)` | DELETE con `RETURNING`. |

### Pestañas, grupos, reglas y asignaciones de lote

Todas filtradas por `user_id` (cada consulta incluye `WHERE user_id = $1`):

| Función | Comportamiento |
|---|---|
| `listTabs` / `getTab` / `createTab` / `updateTab` / `deleteTab` | CRUD de `portfolio_tabs` (`name`, `color`). `updateTab` solo toca los campos presentes. |
| `listGroups` / `getGroup` / `createGroup` / `updateGroup` / `deleteGroup` | CRUD de `portfolio_groups` (`tab_id`, `name`, `color`). |
| `listGroupRules` / `addGroupRule` / `removeGroupRule` | CRUD de `portfolio_group_rules` (ticker por grupo). |
| `listGroupLots` / `addGroupLot` / `removeGroupLot` | CRUD de `portfolio_group_lots` (`buy_transaction_id` por grupo). |

`createTab` y `createGroup` usan `RETURNING`; los INSERT contra las constraints UNIQUE lanzan el error 23505 de PostgreSQL, que el servicio traduce a `DUPLICATE`.

## 5. Servicio (`src/services/portfolio.service.js`)

### Reconstrucción FIFO (`buildState`)

- Agrupa transacciones por ticker; los **lotes** son las compras ordenadas por fecha (`{ id, date, price, shares, remaining, soldPortions }`), donde `id` es el id de la transacción de compra (identifica la sublínea para las asignaciones de `portfolio_group_lots`).
- Cada venta consume los lotes **más antiguos primero** (FIFO). La ganancia bruta de cada venta es `Σ (precioVenta − precioLote) × acciones` y se guarda por id de venta (`saleGains`).
- Si una venta supera las acciones disponibles → `PortfolioError` `NOT_ENOUGH_SHARES` ("No tienes suficientes acciones de X para la venta registrada.").
- El estado por ticker: `lots`, `heldShares` (acciones restantes), `realizedGross` (ganancia bruta de todas las ventas).

### Operaciones

| Función | Comportamiento |
|---|---|
| `addBuy(userId, tx)` | INSERT directo. |
| `addSell(userId, tx)` | Valida disponibilidad con `heldSharesOf` (reconstrucción); si no hay o no alcanza → `NOT_ENOUGH_SHARES` con mensaje claro ("Solo tienes X acciones de Y…"). |
| `removeTransaction(userId, id)` | Borra una transacción **solo si el estado resultante sigue siendo consistente** (reconstruye sin ella; si quedan más ventas que compras → `INVALID_STATE` "No se puede eliminar: dejaría la cartera con más ventas que acciones compradas."). Inexistente → `NOT_FOUND`. |

### Cálculo de la cartera (`getPortfolio`)

Por cada ticker con posición, en paralelo:
- **Dividendos**: `getDividendHistory(ticker, { from: fechaCompraMásAntigua })` (Yahoo, tramos de 5 años, caché 24 h).
- **Sector**: `getCompanySector(ticker)` (EDGAR SIC → español; `null` si falla).
- **Cotización**: `getMarketQuote(ticker)` (Yahoo, caché 60 s).

Por **posición** devuelve: `ticker, companyName, sector, shares, avgCost` (coste medio de los lotes restantes), `costBasis`, `price`, `value`, `unrealizedGross` (valor − coste), `unrealizedWithDividends` (+ dividendos de las acciones en cartera), `realizedGross`, `realizedWithDividendsOnSold` (+ dividendos de las porciones vendidas, compra→venta), `realizedPlusAllDividends`, `totalReturn` (no realizada + realizada + dividendos totales), `totalReturnPct`, `dividendsHeld`, `dividendsSold`, `dividendsTotal`, `projectedAnnualDividends` (TTM por acción × acciones en cartera), `quote`.

**Resumen**: `totalValue, totalCost, totalUnrealized, totalRealized, totalDividends, totalReturn, totalReturnPct, projectedAnnualDividends, dividendYield` (anuales previstos / valor).

**Alocaciones**: `byCompany` (valor y % sobre el total; solo posiciones con valor > 0, ordenadas por valor) y `bySector` (sector del SIC o "Otros" si es «—»/null; incluye tickers).

**Transacciones**: devuelve todas con `realizedGain` (solo en ventas; `null` en compras).

Redondeo a 2 decimales (4 en precios/coste medio) con `round`; `null` si el cálculo no es finito.

### Pestañas y grupos

- `getPortfolio` carga además tabs, grupos, reglas y asignaciones de lote del usuario y los adjunta a la respuesta:
  - Cada **posición** lleva `groups` (los grupos con regla sobre su ticker, marcados `viaRule: true`).
  - Cada **lote** lleva `groups` = unión de las reglas del ticker (`viaRule: true`) + las asignaciones explícitas de ese lote (`viaRule: false`), deduplicadas por id de grupo.
  - De nivel superior devuelve `tabs` y `groups`, y cada grupo incluye `ruleTickers` (tickers de sus reglas) y `lotTransactionIds` (compras asignadas explícitamente).
- `createTab` / `updateTab` / `createGroup` / `updateGroup`: traducen el error 23505 de PostgreSQL (UNIQUE) a `PortfolioError` `DUPLICATE` ("Ya existe una pestaña/grupo con ese nombre.").
- `addGroupTicker(userId, groupId, ticker)`: inserta la regla de ticker en el grupo (tras validar que el grupo existe y pertenece al usuario → `NOT_FOUND`).
- `addGroupLot(userId, groupId, transactionId)`: valida que la transacción sea **una compra del propio usuario**; si no lo es → `PortfolioError` `INVALID_LOT` ("La sublínea no es una compra del usuario."). El resto de errores de validación (grupo inexistente) → `NOT_FOUND`.
- `removeGroupTicker` / `removeGroupLot`: eliminan la regla o asignación; `deleteTab` / `deleteGroup` borran en cascada (las FKs con `ON DELETE CASCADE` limpian reglas y asignaciones).

## 6. Endpoints (`src/api/routes/portfolio.routes.js`, montado en `/api/portfolio`)

Todos con `requireAuth` (sin sesión → 401).

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `GET` | `/` | — | 200 `{ ok, portfolio: { summary, positions, transactions, allocations, tabs, groups } }` |
| `POST` | `/transactions` | `{ ticker, type, shares, price, date, companyName? }` | 201 `{ ok, transaction }` · 400 validaciones · 404 `COMPANY_NOT_FOUND` · 400 `NOT_ENOUGH_SHARES` (venta) |
| `DELETE` | `/transactions/:id` | — | 200 `{ ok }` · 404 `NOT_FOUND` · 400 `INVALID_STATE` |
| `POST` | `/tabs` | `{ name, color? }` | 201 `{ ok, tab }` · 400 validaciones/`DUPLICATE` |
| `PATCH` | `/tabs/:id` | `{ name?, color? }` | 200 `{ ok, tab }` · 400 · 404 `NOT_FOUND` · 400 `DUPLICATE` |
| `DELETE` | `/tabs/:id` | — | 200 `{ ok }` · 404 `NOT_FOUND` |
| `POST` | `/groups` | `{ tabId, name, color?, tickers?, lotTransactionIds? }` | 201 `{ ok, group }` · 400 · 404 · 400 `DUPLICATE` · 400 `INVALID_LOT` |
| `PATCH` | `/groups/:id` | `{ name?, color? }` | 200 `{ ok, group }` · 400 · 404 `NOT_FOUND` · 400 `DUPLICATE` |
| `DELETE` | `/groups/:id` | — | 200 `{ ok }` · 404 `NOT_FOUND` |
| `POST` | `/groups/:id/members` | `{ ticker }` **o** `{ transactionId }` | 201 `{ ok }` · 400 (ninguno de los dos) · 400 `INVALID_LOT` · 404 `NOT_FOUND` |
| `DELETE` | `/groups/:id/members` | `{ ticker }` **o** `{ transactionId }` | 200 `{ ok }` · 400 · 404 `NOT_FOUND` |

### Validaciones de `POST /transactions`

- `ticker`: `^[A-Z0-9.-]{1,10}$` → 400 "Ticker no válido."
- `type`: `buy` | `sell` → 400 "El tipo de operación debe ser \"buy\" o \"sell\"."
- `shares`: número finito > 0 → 400 "La cantidad debe ser un número mayor que 0."
- `price`: número finito ≥ 0 → 400 "El precio debe ser un número mayor o igual que 0."
- `date`: `AAAA-MM-DD` válido y **no futura** → 400 "La fecha debe tener formato AAAA-MM-DD." / "La fecha no puede ser futura."
- `companyName` opcional; si falta se resuelve desde EDGAR (`getCompanyByTicker`); ticker inexistente → 404 `COMPANY_NOT_FOUND`.

### Validaciones de pestañas y grupos

- `name`: 1–40 caracteres del patrón `NAME_PATTERN` (letras, números, acentos, espacio, guion y subrayado) → 400 "El nombre de la pestaña/grupo debe tener entre 1 y 40 caracteres."
- `color`: `#RRGGBB` (`COLOR_PATTERN`); opcional, por defecto `#2563eb`.
- `POST /groups`: `tabId` entero obligatorio → 400 "Indica la pestaña del grupo."; `tickers[]` se filtra por `TICKER_PATTERN` y se deduplica (cada uno se inserta como regla); `lotTransactionIds[]` se filtra a enteros y se deduplica (cada uno validado como compra del usuario → `INVALID_LOT`).
- `POST|DELETE /groups/:id/members`: cuerpo con `{ ticker }` (patrón `^[A-Z0-9.-]{1,10}$`) **o** `{ transactionId }` (entero); si no llega ninguno → 400 "Indica un ticker (acción) o un transactionId (sublínea).".
- `PATCH /tabs/:id` y `PATCH /groups/:id`: requieren al menos `name` o `color` → 400 "Indica un nombre o un color para actualizar.".

## 7. Servicios externos utilizados

### `market.service.js` — `getDividendHistory(ticker, { from })`

- Descarga el histórico de eventos de dividendos de Yahoo por **tramos de 5 años** (`period1`/`period2`), porque Yahoo **trunca** los eventos con `range=max` (p. ej. KO saltaba de 2003 a 2026).
- Desde `from` (fecha de la compra más antigua; por defecto 10 años) hasta hoy; deduplica por `fecha|cantidad` y ordena.
- Caché 24 h por ticker+fecha (`DIVIDEND_TTL`).

### `edgar.service.js` — `getCompanySector(ticker)`

- `getCompanyByTicker` + submissions de EDGAR → `SIC` → `profileSector` (mapeo `SIC_SECTORS` a sector amplio en español; rangos 2000–2199 y 2830–2844 → "Consumo defensivo"; 2000–2099 → "Alimentación y bebidas"; 2100–2199 → "Tabaco"; 2800–2899 → "Química y farmacéutica"; resto por decenas SIC). Sustituye al antiguo que solo sabía "Consumo defensivo" o "—".

## 8. Decisiones y motivos

| Decisión | Motivo |
|---|---|
| **FIFO (no FILO)** | Es el estándar de brokers (IBRK); el usuario pidió "FILO" pero confirmó FIFO: se venden primero las compras más antiguas. |
| **Sin comisiones** | Simplicidad en beta; decisión de producto del usuario. |
| **Una única cartera por usuario** | Decisión de producto; no hay "carteras múltiples". |
| **Dividendos estimados por fecha real de pago** | Más precisos que dividendo×periodo; la porción por lote refleja cuándo se poseyó cada acción. |
| **Estado reconstruido de las transacciones** | Sin tablas redundantes; cualquier operación es una fila y el estado siempre es consistente por definición. |
| **Protección de borrado (`INVALID_STATE`)** | Evita que borrar una compra deje ventas sin respaldo FIFO. |
| **TTM de dividendos desde la compra más antigua** | Evita que Yahoo trunque el histórico y calcula los 12 meses previstos con todos los eventos disponibles. |
| **Regla a nivel de ticker vs sublínea** | "Toda la acción" se modela como regla (`portfolio_group_rules`): las operaciones futuras de ese ticker entran solas en el grupo. Marcar sublíneas solo asigna ese lote concreto (`portfolio_group_lots`). |
| **Pertenencia a varios grupos** | Un ticker o lote puede estar en varios grupos: se modela con filas independientes en `rules`/`lots` (sin exclusividad). |
| **Borrado en cascada** | `ON DELETE CASCADE` en reglas y asignaciones: al borrar pestaña, grupo o compra se limpia todo sin huérfanos. |
| **Nombres únicos** | UNIQUE `(user_id, name)` en tabs y `(user_id, tab_id, name)` en groups → error `DUPLICATE` claro y controlado. |

## 9. Errores y casos límite

| Caso | Respuesta |
|---|---|
| Sin sesión | 401 |
| Venta sin acciones / más de las disponibles | 400 `NOT_ENOUGH_SHARES` con mensaje específico |
| Borrar transacción que rompe el FIFO | 400 `INVALID_STATE` |
| Transacción inexistente al borrar | 404 `NOT_FOUND` |
| Ticker inexistente en EDGAR (sin companyName) | 404 `COMPANY_NOT_FOUND` |
| Fecha futura | 400 |
| Pestaña/grupo con nombre duplicado | 400 `DUPLICATE` |
| Sublínea que no es una compra del usuario | 400 `INVALID_LOT` |
| Pestaña/grupo inexistente (actualizar/borrar/añadir miembro) | 404 `NOT_FOUND` |
| Cuerpo de miembro sin `ticker` ni `transactionId` | 400 |
| Fallo de Yahoo/EDGAR al valorar | La posición se devuelve con `price: null` / `sector: null` (no rompe la cartera) |

## 10. Archivos del backend implicados

| Archivo | Función |
|---|---|
| `db/schema.sql` | Tablas `portfolio_transactions`, `portfolio_tabs`, `portfolio_groups`, `portfolio_group_rules` y `portfolio_group_lots` + índices. |
| `db/repositories/portfolioRepository.js` | CRUD de transacciones (fechas ISO), pestañas, grupos, reglas y asignaciones de lote. |
| `src/services/portfolio.service.js` | FIFO, dividendos, sector, valoración, summary, alocaciones, pestañas/grupos (reglas vs sublíneas), errores (`PortfolioError`). |
| `src/api/routes/portfolio.routes.js` | 11 endpoints con validaciones y mapeo de errores (`NOT_FOUND`, `NOT_ENOUGH_SHARES`, `INVALID_STATE`, `DUPLICATE`, `INVALID_LOT`). |
| `src/services/market.service.js` | `getDividendHistory` (tramos de 5 años) y `getMarketQuote`. |
| `src/services/edgar.service.js` | `getCompanyByTicker` y `getCompanySector` (SIC→sector). |
| `server.js` | Monta `/api/portfolio`. |

## 11. Pruebas realizadas

- **Ejemplo TAP del usuario**: 50 compradas a 50 $, 20 vendidas a 60 $ → realizada 200 $; dividendos: 28,8 $ de las 30 en cartera y 19,2 $ de las 20 vendidas (total 31,1 $ con el histórico de pago real).
- **FIFO multi-lote**: AAPL 10@100 + 10@150, venta 15@200 → quedan 5@150, realizada 1.250 $.
- Borrado con protección de estado; alocaciones al 100 %; sector EDGAR; `node --check` OK y recursos 200.
- Bugs corregidos en el camino: eventos de dividendos truncados por Yahoo (tramos de 5 años), fechas de pg convertidas con `String(Date)` (toIsoDate local), `data-portfolio` sin valor falsy en dataset (ahora `data-portfolio="1"`).
- **Pestañas y grupos**: `npm run db:migrate` OK; pruebas del servicio y de la API con JWT real (crear/borrar tab y grupo, añadir/quitar miembros, nombre duplicado → 400 `DUPLICATE`, lote no propio → 400 `INVALID_LOT`).

## 12. Relación con otros módulos

- **Frontend**: `public/portfolio.js` consume la API (ver `documentacion/frontend/funcionalidades/cartera/`).
- **Watchlists**: patrón compartido de sección montable en Inicio y Empresa.
- **Screener**: usa `getCompanySector`/`getMarketQuote` (mismos servicios).

## 13. Pendientes

- Dividendos cobrados reales declarados por el usuario (hoy son estimados).
- "Cuando se vende una empresa guardar esos valores" (roadmap: persistir el histórico de ganancias realizadas a nivel de venta ya existe en `realizedGain`; falta vista dedicada).
- Límites por plan (Fase 5).
