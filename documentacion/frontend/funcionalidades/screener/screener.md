# Funcionalidad: Cribador de resultados (screener) — Frontend

> Capa: **frontend** · Fecha: 2026-08-13 · Estado: **implementado y conectado a la API real de EDGAR**

---

## 1. Objetivo

Que el usuario busque una empresa por **ticker o nombre** (desde el topbar o desde la propia sección) y vea sus **resultados publicados** (10-Q / 10-K) en una **única tabla estilo TIKR claro** con **3 pestañas** —**Cuenta de resultados**, **Balance** y **Estado de Flujo de Efectivo**—, con las **partidas como filas y los periodos como columnas**, en **millones de $** (BPA en $, acciones en millones), conmutando entre series **Anual** (últimos 10) y **Trimestral** (últimos 8).

## 2. Alcance

**Incluido:**
- Sección `#screener` ("Cribador de resultados") con buscador propio, cabecera de empresa (nombre + chip naranja con el ticker, meta `CIK · Moneda USD · Fuente: SEC EDGAR`) y conmutador Anual/Trimestral con chip "USD".
- **3 pestañas** (`.screener-tab`, `data-statement="income|balance|cashflow"`) con la activa subrayada en naranja, y **una sola tabla** (`#screener-statement-table`) que se **repinta** según la pestaña (estado JS `screenerStatement`) y la serie (estado `screenerSeries`).
- **Tabla estilo TIKR claro**: filas de total con clase `emphasis-row` (fondo crema `#fff7e8`, negrita), primera columna "Partida" **fija** (`position: sticky` a la izquierda), valores en millones alineados a la derecha con separador es-ES, BPA y métricas por acción en $ con 2 decimales, acciones en millones, empleados como recuento, **negativos entre paréntesis**, "—" para datos ausentes, hover `#fafafa`, scroll horizontal y tipografía tabular (`font-variant-numeric: tabular-nums`).
- Etiquetas de periodo (`2025 (FY)`, `Q4 2025`).
- **Búsqueda real en el topbar** (`#ticker-search`) contra `GET /api/screener/search` (antes lista estática): debounce de 250 ms, panel de resultados, mensaje "Sin resultados en EDGAR..." y carga del cribador al elegir empresa.
- Estados de carga (`Consultando EDGAR…`), error (mensaje del servidor o de conexión) y vacío.

**Excluido (pendiente):**
- Puerto "Analizar" desde el cribador hacia el pipeline de IA (botón no existe aún; hay una nota informativa en la sección).
- Histórico de filings (lista de 10-Q/10-K de la empresa con ver PDF).
- Cualquier gráfico o comparativa; por ahora solo la tabla de datos.

## 3. Flujo de la interfaz

```
Usuario → escribe en el buscador del topbar (#ticker-search)
  → debounce 250 ms
  → fetch GET /api/screener/search?q=
      → resultados → panel con botones "nombre + ticker"
          → clic → se cierra el panel, el input muestra el ticker
                 → loadCompanyToScreener(ticker)
      → sin resultados → panel "Sin resultados en EDGAR para esta búsqueda."

Usuario → busca en la sección #screener ("Consultar" o Enter)
  → si el texto es un ticker válido (A-Z0-9.-, 1–10) → carga directa
  → si no → search → primera empresa (o "Sin resultados...")

loadCompanyToScreener(ticker):
  → oculta resultado/error, muestra "Consultando EDGAR…"
  → scroll suave hasta #screener
  → fetch GET /api/screener/company/:ticker
      → 200 → renderScreener: cabecera (nombre + chip ticker, meta) + renderScreenerTables()
      → error → caja roja con el mensaje del servidor
  → catch (red/servidor apagado) → "No se pudo conectar con el servidor…"

renderScreenerTables():
  → rows = screenerData[screenerSeries]           ('annual' | 'quarterly')
  → items = screenerData.statements[screenerStatement]  ('income' | 'balance' | 'cashflow')
  → renderStatementTable(rows, items): repinta SIEMPRE la misma tabla #screener-statement-table
      → thead: columna "Partida" (sticky) + una columna por periodo
      → tbody: una fila por partida; class="emphasis-row" si item.emphasis === true

Pestaña clicada    → activa .active + screenerStatement = data-statement → repintado
Conmutador Anual/Trimestral → screenerSeries = data-series → repintado
Ambos cambios son solo re-renderizado local; NO hay nueva llamada a la API.
```

## 4. Estructura de la sección `#screener`

| Elemento | IDs / clases | Función |
|---|---|---|
| Título y subtítulo | `.section-title-row`, badge "EE. UU. · FUENTE OFICIAL" | Contexto de la sección |
| Buscador propio | `#screener-search-input`, `#screener-search-button` | Ticker o nombre; botón "Consultar" o tecla Enter |
| Error | `#screener-error` (oculto por defecto) | Caja roja con mensaje |
| Carga | `#screener-loading` (oculto) | "Consultando EDGAR…" |
| Resultado | `#screener-result` (oculto hasta el primer éxito) | Cabecera + controles + pestañas + tabla |
| Cabecera de empresa | `#screener-company-name` (nombre + chip `.ticker-chip` naranja con el ticker), `#screener-company-meta` | `COCA COLA CO [KO]` · `CIK 21344 · Moneda USD · Fuente: SEC EDGAR` |
| Controles | `.screener-controls`: chip `.screener-currency` "USD" + `.screener-period-toggle` (botones `data-series="annual"` / `"quarterly"`) | Serie activa: `screenerSeries` (por defecto `'annual'`) |
| Pestañas | `.screener-tabs` (role `tablist`) con 3 botones `.screener-tab` (`data-statement` `income`/`balance`/`cashflow`) | Estado activo: `screenerStatement` (por defecto `'income'`); la activa lleva subrayado naranja |
| Tabla única | `#screener-statement-table` dentro de `.screener-block` > `.table-wrap`; encima `.screener-units` ("USD · Millones") | Se repinta por pestaña y serie (partidas × periodos) |
| Nota final | `.empty-hint` | "El análisis con IA de cada periodo llegará en una fase posterior." |

## 5. Tabla única y formato de valores

- **Pintado genérico**: `renderScreenerTables` lee `screenerData.statements[estado activo]` (arrays `{ key, label, format, emphasis, tone, kind }`) y genera la tabla con `renderStatementTable`, que repinta `thead` (cabeceras de periodos) y `tbody` (una fila por partida). `tone: 'negative'` marca en rojo los costes, gastos, salidas de caja y partidas contra fondos propios aunque su valor sea positivo; las demás filas solo se marcan en rojo cuando el valor es negativo.
- **Orientación TIKR**: la primera columna es "Partida" (etiquetas de `statements`) y cada periodo es una columna a la derecha (`2025 (FY)`, `Q4 2025`…). No hay bloques por estado: solo cambia la pestaña activa.
- **Columna "Partida" fija**: `th.sticky-col` / `td.sticky-col` con `position: sticky; left: 0`, fondo blanco, `z-index` 2 (3 en la cabecera) y ancho 230 px, para que al hacer scroll horizontal siga visible.
- **Filas de total (`emphasis`)**: si `item.emphasis === true`, la fila lleva la clase `emphasis-row`: fondo crema `#fff7e8`, texto `#111` y negrita (hover `#fff2da`). Son los totales marcados por el backend (beneficio bruto, operativo, neto, activo/pasivo corriente, totales, cash flows y variación de caja).
- **Formato por partida** (`formatScreenerValue` según `item.format`):
  - `money` → `formatMoneyUsd`: divide entre 1.000.000 y formatea con `Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })`; **los negativos van entre paréntesis**, p. ej. `(478,0)`.
  - `perShare` (BPA) → `formatEps`: `Intl.NumberFormat('es-ES')` con 2 decimales + sufijo `$`.
  - `shares` (acciones diluidas) → `formatShares`: divide entre 1.000.000, es-ES máx. 1 decimal, sin sufijo.
  - `count` (empleados) → `formatCount`: recuento sin conversión a millones.
- Las filas `change`, `margin` y `ratio` se calculan en el frontend a partir de las filas base y se muestran en cursiva como en las capturas.
- Valor ausente (`null`/`undefined`/`NaN`) → guion `—`.
- `periodLabel`: `2025` → `2025 (FY)`; `2025-Q2` → `Q2 2025`.
- Estilo de celda: valores **alineados a la derecha**, `font-variant-numeric: tabular-nums`, `white-space: nowrap`, bordes `#e0e0e0` (cabecera) / `#f0f0f0` (filas), hover `#fafafa`, y **scroll horizontal** (`.table-wrap`) para que quepan los 8 periodos trimestrales.
- Las pestañas y el conmutador re-renderizan sin volver a llamar a la API (los datos anual y trimestral ya están en `screenerData`).

## 6. Paleta TIKR claro (extraída de las capturas de referencia con PIL)

| Color | Valor | Uso |
|---|---|---|
| Blanco | `#ffffff` | Fondo general, de la tabla y de la columna sticky |
| Texto principal | `#333333` | Valores, pestaña activa y nombre de empresa |
| Naranja | `#ff9900` | Acento: subrayado de pestaña/conmutador activos, chips y botones |
| Crema | `#fff7e8` (RGB 255,251,237) | Fondo de las filas `emphasis-row` |
| Gris | `#777777` | Cabeceras de columna y pestañas inactivas |
| Bordes | `#dddddd` / `#e0e0e0` / `#f0f0f0` | Borde de pestañas, de cabecera y de filas |
| Hover | `#fafafa` | Fila al pasar el ratón |

## 7. Búsqueda del topbar (ahora real)

- Antes: filtrado de un array local (TAP, KO, PEP, WMT) con aviso "la integración SEC llega en la Fase 2". **Ahora**: `searchCompanies(query)` llama a `GET /api/screener/search?q=` con `encodeURIComponent`.
- Debounce de **250 ms** (`renderSearchResults` con `clearTimeout`/`setTimeout`).
- Estados del panel `#search-results`:
  - query vacía → panel oculto;
  - sin resultados → `Sin resultados en EDGAR para esta búsqueda.`;
  - con resultados → botones `.search-result` con nombre + ticker; al pulsar, el input muestra el ticker y se llama a `loadCompanyToScreener(ticker)`.
- Si la petición falla, `searchCompanies` devuelve `[]` (se muestra el estado "sin resultados").

## 8. Estados y errores

| Caso | Comportamiento |
|---|---|
| Cargando empresa | `#screener-loading` visible ("Consultando EDGAR…"); resultado y error ocultos |
| Éxito | `#screener-result` visible con cabecera + pestañas + tabla |
| Error HTTP del servidor (400/404/502) | Caja roja con `data.error` del servidor (ej. "No se encontró la empresa \"ZZZZ\" en EDGAR.") |
| Servidor apagado / red caída | Caja roja "No se pudo conectar con el servidor. Comprueba que esté en marcha." |
| Búsqueda sin resultados (topbar o cribador) | "Sin resultados en EDGAR para esta búsqueda." |
| Sin query en el cribador | No hace nada (return directo) |

## 9. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/index.html` | Sección `#screener`: buscador, error, loading, cabecera de empresa (nombre + chip ticker, meta), chip "USD", conmutador, **3 pestañas `.screener-tab`** y **una sola tabla `#screener-statement-table`** dentro de `.table-wrap`; panel `#search-results` del topbar. |
| `public/app.js` | `searchCompanies`, `loadCompanyToScreener`, `renderScreener`, `renderScreenerTables`, `renderStatementTable` (repinta la tabla única desde `statements`), `submitScreenerSearch`, formateadores `formatScreenerValue`/`formatMoneyUsd`/`formatEps`/`formatShares`/`periodLabel`, estado `screenerSeries`/`screenerStatement`/`screenerData`, listeners (botón, Enter, conmutador, pestañas, input del topbar). |
| `public/styles.css` | Estilos bajo el comentario `/* ── Cribador (screener) ── */`: buscador, error, loading, cabecera de empresa, chip USD, conmutador, pestañas (activa con subrayado naranja), tabla única (valores a la derecha, tabular-nums, sticky col, filas `emphasis-row` en crema, hover, bordes) y scroll horizontal (`.table-wrap`). |

## 10. Responsive

- La cabecera de empresa (nombre + controles) pasa de fila a columna en `@media (max-width: 900px)` (`.screener-company-head`).
- La sección reduce su padding en móvil (regla existente de paneles).
- El scroll horizontal de `.table-wrap` + la columna "Partida" sticky mantienen legibles las tablas con 8 trimestres en pantallas estrechas.

## 11. Pruebas realizadas

- Búsqueda en topbar con `ko`/`coca` → resultados reales de EDGAR; al elegir KO se cargó el cribador con sus datos.
- Cribador con KO: FY2025 ingresos 47.941 M$, B. neto 13.107 M$, BPA 3,04 $, activo 104.816 M$; resultado antes de impuestos 15.998 M$; reservas 80.382 M$ y autocartera 56.423 M$ (negativa, entre paréntesis) en el Balance; variación neta de caja −478 M$ entre paréntesis; derivados activo no corriente 73.772 M$ y pasivo no corriente 51.366 M$. Las 3 pestañas repintan la misma tabla y las filas de total se ven en crema (emphasis).
- PG (cierre fiscal junio): balance del año fiscal colocado en su columna correcta; intangibles 21.737 M$ vía tag agregado.
- PEP: intangibles 15.066 M$ (finite + indefinite sumados) y CAPEX vía `PaymentsToAcquireProductiveAssets`.
- TAP: pérdida neta FY2025 de −2.139,6 M$ y resultado antes de impuestos −2.518 M$, ambos entre paréntesis; acciones diluidas 199,1 M en la fila `shares`.
- Ticker inexistente → caja roja con el mensaje 404 del servidor.
- Búsqueda sin resultados → mensaje "Sin resultados en EDGAR…" en topbar y cribador.

## 12. Relación con otros módulos

- **Backend**: consume `GET /api/screener/search` y `GET /api/screener/company/:ticker` (ver `documentacion/backend/funcionalidades/screener/`).
- **Pipeline de IA**: futuro puente "Analizar" desde el cribador hacia el mismo flujo de la subida manual (`POST /api/upload`); de momento solo hay una nota informativa en la sección.
- **Histórico**: la tabla "Mis análisis guardados" seguirá usando el histórico de análisis (pendiente `GET /api/analyses`); el cribador no guarda nada.

## 13. Pendientes

- Botón "Analizar" en la cabecera/tabla del cribador que envíe el periodo elegido al pipeline de IA (misma regla fundamental: idéntico proceso y resultado que la subida manual).
- Histórico de filings de la empresa (lista de 10-Q/10-K con "ver PDF").
- Posible vista de detalle de un periodo (más métricas por periodo).
