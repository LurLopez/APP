# Funcionalidad: Cartera de inversión (portfolio) — Frontend

> Capa: **frontend** · Fecha: 2026-08-17 · Estado: **implementado y probado**

---

## 1. Objetivo

Dar al usuario una vista de cartera inspirada en DivvyDiary: tres **métricas principales**, pestañas de cartera/dividendos/análisis/operaciones/inspiración, una **asignación visual grande** por empresa, una **tabla de posiciones** tipo broker, exportación CSV, historial FIFO y formulario de compra/venta. Además, en la página de empresa, un **panel con la posición** de esa empresa y un formulario reutilizable.

## 2. Alcance

**Incluido:**
- Módulo global `Portfolio` (`public/portfolio.js`) con estado compartido entre Inicio y Empresa (evento `portfolio:change`).
- Sección `#cartera` en Inicio (botón topbar activo) con: dashboard de tres métricas, pestañas, gráfico de asignación, tabla broker, dividendos, historial y formulario.
- Panel `#section-cartera` en Empresa: posición de la empresa + formulario editable + enlace a la cartera completa.
- Formulario de operación reutilizable (en cartera y en empresa) con autocompletar de ticker contra EDGAR.

**Excluido:**
- Vista de ganancias realizadas "guardadas al vender" como registro histórico dedicado (roadmap).
- Alertas de precio, dividendos declarados por el usuario.

## 3. Estado compartido

- `setAuthenticated(value)`: al iniciar sesión refresca; al cerrar resetea.
- `refresh()`: `GET /api/portfolio` → `data` (summary, positions, transactions, allocations, tabs, groups); emite `portfolio:change`.
- `getPosition(ticker)`: posición de una empresa (para el panel de Empresa).
- `openSection()`: si no hay sesión → toast + modal de login; si no, muestra y desplaza a `#cartera` (usado por el enlace de Empresa `/?cartera=1`).
- `mountSection(root, { onNavigate, onEmptyChange })` y `registerCompanyPanel(root)` (Empresa).

## 4. Sección Cartera (Inicio)

### Resumen — 3 métricas

| Tarjeta | Cálculo (backend) |
|---|---|
| Valor de la cartera | `totalValue` + rentabilidad total sobre el coste |
| Rentabilidad por dividendo de la cartera | `projectedAnnualDividends / totalValue` |
| Dividendos anuales brutos previstos | `projectedAnnualDividends` |

La interfaz conserva el selector visual de periodo, el conmutador Valor/Coste y el selector Neto como elementos preparados para futuras series históricas y fiscalidad.

### Tabla de posiciones

La vista Tabla contiene: Valor (logo, nombre, ticker y sector), Acciones, Coste, Mercado, Ganancia, Mercado %, Div. %, Div. YoC y Div. anual. Coste, Mercado, Ganancia y Div. anual muestran dos líneas (total/precio o porcentaje). Cada cabecera tiene `title` explicativo; la fila de totales aparece al final; clic en una fila → perfil de la empresa.

### Distribución

- Un **donut SVG** (`.pf-allocation-donut`, `viewBox 160`, sectores anulares geométricos `<path>` con separación limpia de 2px e interacción hover sincronizada) por empresa, con leyenda de color, nombre y porcentaje.
- El conmutador Coste/Valor recalcula los pesos en el frontend a partir de `costBasis` o `value`.
- El enlace Tabla cambia a la vista broker; Exportar CSV descarga las posiciones y sus métricas.

### Historial de operaciones

Fecha (dd/mm/aaaa), tipo (badge Compra/Venta), Empresa + ticker, Acciones, Precio, Importe, **Ganancia** (FIFO, solo ventas) y botón × de borrado (confirmación `confirm()`; si rompe la consistencia → toast con el error 400 del servidor).

### Formulario de operación

- Campos: **Ticker** (con autocompletar: debounce 250 ms contra `/api/screener/search`, resultados con nombre + ticker; al elegir guarda el `companyName` en un input oculto), **Tipo** (Compra/Venta), **Cantidad** (mín. 0,000001, paso libre), **Precio por acción ($)** (≥ 0), **Fecha** (máx. hoy, por defecto hoy) y botón **Guardar**.
- Validaciones cliente (ticker válido, cantidad > 0, precio ≥ 0, fecha) con nota de error bajo el formulario; errores del servidor (incl. `NOT_ENOUGH_SHARES` al vender de más) en la misma nota.
- Tras guardar: toast, reset del formulario y `refresh()`.
- Estado vacío: "Tu cartera está vacía…" + botón "Añadir operación".

## 5. Pestañas y grupos (jerarquía pestaña → grupo → miembros)

La cartera se organiza en tres niveles: **PESTAÑA** (tab) → **GRUPO** (dentro de una pestaña) → **MIEMBROS** (acciones completas y/o sublíneas sueltas). El panel **Valores** muestra primero la **tabla de acciones** y, debajo, la **sección de grupos**:

```
VALORES
[Actual] [Vendido] [Todo]           ← selector de vista de la tabla de ACCIONES
TABLA DE ACCIONES                   ← posiciones (columna "Grupos" al final, botón ＋ en filas y sublíneas que abre popover de checkboxes)
────────────────────────────────────
GRUPOS                              ← sección debajo de la tabla de acciones
[combobox ▾]                        ← Sector, Tipo, País, Región + pestañas personalizadas
[pills de grupos]                   ← en predefinidas: nombres de valores (ej. "Consumo defensivo"); en personalizadas: grupos del usuario (contador + ✎/×)
TABLA DE GRUPOS                     ← MISMA tabla, MISMAS columnas que ACCIONES (Valor, Acciones, Coste, Ganancia, Gan. + div., Peso cartera, Div. %, Div. YoC, Div. cobrados, Grupos), con los miembros del grupo seleccionado
[＋ Crear grupo] [＋ Nueva pestaña]
```

### Layout del panel "Valores"

- **Tabla de acciones** arriba con el selector **[Actual] [Vendido] [Todo]**; la columna **Grupos** (al final) muestra las pastillas de color de cada posición y un botón **＋** en filas y sublíneas que abre el **popover de checkboxes** para editar la pertenencia.
- **Sección GRUPOS** debajo: cabecera con título + hint y, en las pestañas personalizadas, los botones **✎** (renombrar/recolorear la pestaña) y **×** (borrar la pestaña).
- **Combobox de pestañas** (`data-pf-groups-tab`): opciones predefinidas **Sector, Tipo, País, Región** + las **personalizadas** del usuario. Al cambiar el combobox se selecciona automáticamente el **primer grupo** y se muestra su tabla de miembros.
- **Pills de grupos** (`.pf-g-pills`): en predefinidas son los nombres de los valores (ej. "Consumo defensivo") con contador de posiciones; en personalizadas son los grupos del usuario con contador y botones ✎/× por grupo.
- **Tabla de grupos**: la **misma tabla** y las **mismas columnas** que la de acciones (`wrapPositionsTable` con `tableClass: 'pf-g-members-table'`), mostrando los miembros del grupo seleccionado.
- En la fila de pills: **＋ Crear grupo** (solo en pestañas personalizadas) y **＋ Nueva pestaña**.

### Pestañas

- **Predefinidas (no editables):** Sector, Tipo, País, Región. Muestran pills con los valores (ej. "Consumo defensivo"); al pulsar una pill aparece la tabla con las sublíneas de cada acción que pertenece a ese valor.
- **Personalizadas:** CRUD completo (crear, renombrar, recolorear, eliminar). Se crean desde **＋ Nueva pestaña** (nombre + color); dentro de ellas se crean los grupos. No se pueden renombrar ni eliminar las predefinidas.

### Grupos

- Se crean con **nombre + color** (＋ Crear grupo), indicando qué acciones y sublíneas añadir mediante **checkboxes** (aparecen al crear el grupo).
- Marcar **"toda la acción"** = regla a nivel de ticker: las operaciones futuras (y las existentes) de esa acción entran solas en el grupo.
- Marcar **sublíneas sueltas** = solo ese lote concreto (aunque se marquen todas una a una, las futuras no entran).
- Una línea/sublínea puede pertenecer a **varios grupos**.
- La pertenencia se puede editar después con un **popover de checkboxes** en la columna "Grupos" de la tabla de acciones; en las sublíneas, las pertenencias que vienen por regla del ticker salen **marcadas y deshabilitadas** (`.pf-g-popover-row.disabled`).

### Contenido de la tabla de grupos según el tipo de grupo

- **Grupo personalizado con regla de ticker**: muestra la fila de la acción y sus sublíneas.
- **Grupo con sublíneas sueltas**: solo las sublíneas.
- **Grupo predefinido** (ej. "Consumo defensivo"): sublíneas de cada acción que pertenece a ese valor.
- Cada sublínea muestra a qué acción pertenece (logo + ticker + fecha del lote en la columna Valor) y se pinta con `.pf-g-lot-row`; la fila de totales muestra "Total del grupo" con las mismas columnas.

### UI y helpers

- La sección se renderiza con `gruposSectionHtml()` dentro de `positionsPanelHtml()`; la tabla de grupos usa `groupMembersTableHtml()` con las **mismas columnas** que la de acciones vía `wrapPositionsTable(..., { wideOpt: true, tableClass: 'pf-g-members-table' })`.
- Helpers: `gruposTabOptions`, `tabOptionValue`, `selectedTabValue`, `groupPillsForActiveTab`, `buildGroupMemberRows`, `gruposTableHtml`, `groupPillHtml`; columna "Grupos" de la tabla de acciones con pastillas de color (`groupPillsHtml` / `groupsCellHtml`), popover (`renderGroupPopover`) y wiring de eventos (`wireGroupFeatures`).
- Estilos `.pf-groups-section/head/title/hint/controls/pills/empty` y `.pf-g-pill-*` / `.pf-g-members-table` en `public/styles.css`.

## 6. Panel de Empresa (`#section-cartera`)

- Cabecera "Tu posición en TICKER" + enlace "Ver cartera completa ↗" (`/?cartera=1`; `app.js` abre la sección y hace scroll).
- 8 tarjetas: Acciones, Coste medio, Precio actual, Valor, No realizada, Dividendos acumulados (est.), Dividendos anuales previstos, Rentabilidad total.
- Formulario de nueva operación precargado con el ticker de la empresa, pero editable y validado contra EDGAR; sirve para comprar o vender.
- Sin posición → "Aún no tienes acciones de esta empresa en tu cartera."; sin sesión → CTA de login.

## 7. Formateadores

`fmtMoney` ($, formato español con miles y 2 dec.), `fmtSigned` (+/− $), `fmtPct`, `fmtSignedPct`, `fmtShares` (hasta 4 dec.), `fmtPrice` (2–4 dec.), `fmtDate`; `changeClass` pinta verde/rojo según signo; `cell()` se conserva para las tablas internas. Para pestañas y grupos: `gruposSectionHtml`, `groupMembersTableHtml`, `gruposTabOptions`, `tabOptionValue`, `selectedTabValue`, `groupPillsForActiveTab`, `buildGroupMemberRows`, `gruposTableHtml`, `groupPillHtml`, `groupPillsHtml`, `groupsCellHtml`, `renderGroupPopover` y `wireGroupFeatures`; `wrapPositionsTable` acepta `tableClass` para añadir `pf-g-members-table` a la tabla de grupos.

## 8. Estados y errores

| Caso | Comportamiento |
|---|---|
| Sin sesión | Estado vacío con CTA; `openSection` abre el modal de login |
| Cargando | "Cargando tu cartera…" |
| Sin operaciones | Estado vacío + botón "Añadir operación" |
| Venta de más acciones | Nota bajo el formulario con el mensaje del servidor (`NOT_ENOUGH_SHARES`) |
| Borrar operación que rompe el FIFO | Toast con el error 400 (`INVALID_STATE`) |
| Fallo de cotización (Yahoo) | La posición muestra "—" en precio/valor sin romper el resto |

## 9. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/portfolio.js` | Módulo `Portfolio` completo (estado, sección, panel de empresa, formulario, donuts, formatos) + pestañas/grupos (`gruposSectionHtml`, `groupMembersTableHtml`, `gruposTabOptions`, `tabOptionValue`, `selectedTabValue`, `groupPillsForActiveTab`, `buildGroupMemberRows`, `gruposTableHtml`, `groupPillHtml`, `groupPillsHtml`, `groupsCellHtml`, `renderGroupPopover`, `wireGroupFeatures`; `wrapPositionsTable` con `tableClass`). |
| `public/index.html` / `public/app.js` | Sección `#cartera` con `#portfolio-section`; botón topbar "Cartera"; consume `?cartera=1` para abrirla. Versiones: styles `?v=48`, portfolio.js `?v=33`, app.js `?v=19`. |
| `public/empresa.html` / `public/empresa.js` | Panel `#section-cartera` registrado con `registerCompanyPanel`. Versiones: styles `?v=43`, portfolio.js `?v=19`. |
| `public/auth.js` | `setAuthenticated` (evento `auth:change`). |
| `public/styles.css` | Dashboard `.pf-metric-*`, asignación `.pf-allocation-*`, tabla `.pf-broker-table`, historial y formulario `.pf-form*`, grupos `.pf-groups-*` (section/head/title/hint/controls/pills/empty), pills `.pf-g-pill-*`, popover `.pf-g-popover` y tabla de grupos `.pf-g-members-table`. |

## 10. Responsive

- Las tablas usan `.table-wrap` con scroll horizontal; la tabla de grupos (`.pf-g-members-table`, min-width 720 px) también.
- El resumen pasa a una columna, las pestañas de la sección permiten desplazamiento horizontal, las pills de grupos se envuelven con `flex-wrap` y el gráfico/leyenda se apilan en pantallas estrechas.
- El formulario pasa a una columna en móvil.

## 11. Pruebas realizadas

- Ejemplo TAP del usuario replicado en pantalla: realizada 200 $, dividendos 28,8 $ + 19,2 $, total 31,1 $.
- FIFO multi-lote (AAPL), borrado con protección, alocaciones al 100 %.
- Flujo completo con usuario temporal: añadir compra/venta desde el formulario, ver posiciones, quitar operación.
- `node --check` OK y recursos 200.
- Validación visual con Chrome headless en escritorio (1230 px) y móvil (390 px): dashboard, donut, tabla, pestañas y formulario.
- **Pestañas y grupos**: E2E con Chrome headless + CDP — crear pestaña → crear grupo marcando una acción → vista de miembros con cabeceras correctas (mismas columnas que la tabla de acciones) → pestaña predefinida Sector con pills de valores → sin errores de runtime.
- **Cambio de layout (2026-08-17)**: sustituida la tira de pestañas superior y la barra de gestión por la sección `GRUPOS` debajo de la tabla de acciones (combobox + pills + tabla de grupos con las mismas columnas que ACCIONES). `node --check` OK.

## 12. Relación con otros módulos

- **Backend**: `documentacion/backend/funcionalidades/cartera/` (endpoints `/api/portfolio`).
- **Screener**: el autocompletar del formulario usa `/api/screener/search`.
- **Watchlists**: mismo patrón de módulo compartido y sección montable.

## 13. Pendientes

- Registro histórico de ganancias al vender (roadmap: "cuando se vende una empresa guardar esos valores").
- Dividendos reales cobrados (declarados por el usuario).
- Alertas de precio.
