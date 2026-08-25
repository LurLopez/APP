# Funcionalidad: Cribador de resultados (screener) — Frontend

> Capa: **frontend** · Fecha: 2026-08-13 (base) · Actualizado: 2026-08-15 · Estado: **implementado y conectado a la API real**

---

## 1. Objetivo

Que el usuario busque una empresa (topbar o sección de Inicio) y la vea en la **página de empresa** (`/empresa/:ticker`) con: **cabecera y cotización**, **perfil** (tarjeta Informe, gráfico de precios con MA100 y pantalla completa, Información, Descripción), **informes trimestrales** (filings con vista previa, descarga y análisis con IA), y **datos financieros** estilo TIKR (3 pestañas, serie anual/trimestral, control de historial por años y gráfico de métricas interactivo con CAGR). En Inicio, la sección cribador permite la búsqueda directa.

## 2. Alcance

**Incluido:**
- Búsqueda real en el topbar (debounce 250 ms, logos de empresa, resultados con nombre + ticker) y en la sección de Inicio.
- **Página de empresa** (`empresa.html` + `empresa.js`): menú lateral (fijos: Favoritos, Alertas de precio, Cartera → cabecera de empresa → Perfil, Informes trimestrales, Valoración, Datos financieros, Accionariado).
- **Perfil**: cabecera (logo real con fallback de inicial, nombre, bolsa · sector, chip ticker, ojo de seguimiento, enlaces), tarjeta de cotización (precio, variación, sparkline; **clic → gráfico a pantalla completa**), tarjeta Informe (métricas: capitalización, rango 52 semanas, beta, dividendo, próximo earnings, volumen, ingresos, BPA, PER, rango del día...), **gráfico de cotización** (rangos 3M/6M/1Y/3Y/5Y/10Y/ALL, MA 100, precio bajo el cursor, pantalla completa), Información y Descripción.
- **Informes trimestrales**: tabla de filings (Formulario, Periodo, Periodo que cubre, Fecha de presentación, acciones Vista previa / Descargar / **Analizar con IA**); vista previa por **imágenes de páginas** en modal.
- **Datos financieros**: 3 pestañas (Cuenta de resultados, Balance, Estado de Flujo de Efectivo), serie Anual/Trimestral, **control de historial por años** (doble asa), tabla estilo TIKR claro (columna sticky, filas emphasis crema, negativos rojos/paréntesis, PRO), **gráfico de métricas interactivo** (clic en fila, paleta de 16 colores, CAGR como línea negra con caja arrastrable).
- **Bloqueo PRO sin sesión**: columnas antiguas bloqueadas (6 anuales, 4 trimestrales); con sesión, todo visible (recarga en silencio al cambiar la sesión).
- Sección "Acciones en seguimiento" y "Cartera" en Inicio; panel de cartera en Empresa (ver funcionalidades propias).

**Excluido:**
- Ratios y Segmentos (pestañas placeholder sin fuente de datos).
- Valoración y Accionariado (placeholders).

## 3. Página de empresa — flujo

```
Inicio/topbar → elegir empresa → navega a /empresa/:ticker
  → empresa.js: GET /api/screener/company/:ticker
      → renderCompany(data):
          - cabecera (logo, nombre, meta, ojo de seguimiento)
          - cotización (precio, var., sparkline)
          - perfil: tarjeta Informe + gráfico de precios + Información + Descripción
          - menú lateral con cabecera de empresa (logo + nombre + ticker)
      → perfil activo por defecto; cada apartado es una sección (showSection)
  → GET /api/screener/company/:ticker/chart?range=5y&ma=1 (bajo demanda)
  → GET /api/screener/company/:ticker/filings (perezoso, al abrir Informes trimestrales)
  → Datos financieros usa annual/quarterly + statements ya descargados
```

## 4. Perfil y cotización

| Elemento | Detalle |
|---|---|
| Cabecera | Logo (companiesmarketcap.com, fallback inicial), nombre, bolsa · sector, chip ticker, **ojo de seguimiento** (estado activo si está en alguna lista; abre el popover de watchlists), atajos |
| Tarjeta cotización | Precio, variación + %, hora, sparkline SVG; **clic → `openChartFullscreen()`** (mismo gráfico del perfil a pantalla completa, reutilizando `toggleFullscreen`) |
| Tarjeta Informe | marketCap, rango 52 semanas, beta, dividendo/yield, volumen, ingresos, BPA, PER, rango del día, anterior cierre, OPV |
| Gráfico de precios | SVG propio con área, ejes, etiqueta del último precio; rangos 3M…ALL; **MA 100** (botón, serie diaria del backend); **tooltip bajo el cursor** (línea discontinua + círculo + fecha/precio); **pantalla completa** con re-render |
| Información / Descripción | País, sector, industria, bolsa, cierre fiscal, último filing / texto generado por el backend |

## 5. Informes trimestrales

- Carga perezosa al abrir la sección (`GET .../filings`), reseteada al cambiar de empresa.
- Tabla con badge 10-Q/10-K, Periodo (Q2 2026 / FY 2025), "Periodo que cubre", fecha de presentación y acciones:
  - **Vista previa**: modal con las páginas del PDF como **imágenes** (fondo gris, ancho máx. 860 px, scroll, carga perezosa; título con "· N páginas"); enlace "Abrir en pestaña nueva"; errores de generación con mensaje + enlace.
  - **Descargar**: `?download=1` (PDF real o generado).
  - **Analizar con IA**: navega a `/?analizar=TICKER&accession=...` y ejecuta el pipeline (ver `verificacion-informe`).

## 6. Datos financieros (estilo TIKR)

- **3 pestañas** (`.screener-tab`, `data-statement`) que repintan **una sola tabla** `#screener-statement-table` desde `statements` (pintado genérico: `{ key, label, format, emphasis, tone }`).
- **Serie** Anual (10) / Trimestral (8) sin nueva petición.
- **Control de historial** `#screener-range` (doble asa por años, etiqueta "2016 – 2026"): filtra a la vez la tabla y el gráfico de métricas; los derivados (variaciones %, márgenes, ratios) y el bloqueo PRO se calculan sobre el historial completo (`screenerVisibleIndexes`).
- **Tabla TIKR**: columna "Partida" sticky (230 px), filas `emphasis-row` en crema para totales, valores a la derecha con `tabular-nums`, negativos entre **paréntesis** y en **rojo** (también por naturaleza: `tone: 'negative'` pinta en rojo costes/gastos/salidas aunque el número sea positivo), "—" para datos ausentes, scroll horizontal.
- **Formato por partida**: `money` (millones es-ES, 1 decimal), `perShare` ($, 2 decimales), `shares` (millones), `count` (empleados); periodos `2025 (FY)` / `Q4 2025`.
- **Bloqueo PRO**: `isLockedPeriod` marca con celdas "PRO" las 6 columnas anuales y 4 trimestrales más antiguas **sin sesión**; con sesión desaparece (recarga en silencio al cambiar de sesión).
- Controles de precisión (`.0`/`.00`) y ocultación de filas vacías heredados del clon TIKR.

## 7. Gráfico de métricas interactivo

- **Clic en cualquier fila** de la tabla → se añade al gráfico `#metrics-chart-block` (arriba de la sección): barras para partidas monetarias/acciones/recuento, **línea de puntos** para cambios %, márgenes y ratios; **doble escala** (izquierda/derecha) cuando se mezclan magnitudes.
- **Leyenda** con swatch de color (abre **paleta de 16 colores** fijos), badge de tipo, botón de quitar por serie y "Limpiar".
- **CAGR**: línea discontinua **negra** del primer al último valor válido del rango visible + **caja "CAGR: x,x %"** (blanco sobre negro) **arrastrable** a lo largo de la línea; con cambio de signo usa la media anual lineal (ej. KHC −30,6 %/año); solo "—" si el valor inicial es 0.
- Tooltip con crosshair y todas las series del periodo; periodos bloqueados PRO omitidos; se recalcula al recortar el historial o cambiar serie.

## 8. Estados y errores

| Caso | Comportamiento |
|---|---|
| Cargando empresa | "Consultando EDGAR…" |
| Éxito | Cabecera + perfil + secciones |
| Error 400/404/502 | Caja roja con el mensaje del servidor |
| Servidor apagado | "No se pudo conectar con el servidor…" |
| Sin resultados de búsqueda | "Sin resultados en EDGAR para esta búsqueda." |
| Sin sesión | Columnas PRO bloqueadas; ojo/cartera piden login |

## 9. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/empresa.html` | Página de empresa: menú lateral (2 bloques + cabecera de empresa), cabecera, cotización, secciones (perfil, cartera, informes, datos...), modal de preview, gráficos. |
| `public/empresa.js` | `renderCompany`, `renderCompanyLogo`, cotización/sparkline, `renderPriceChart` (MA100, hover, fullscreen), `renderStatementTable` (PRO, rojos, rango), `renderMetricsChart` (paleta, CAGR arrastrable), `renderFilingsTable`/preview, `showSection`, ojos de seguimiento, panel de cartera. |
| `public/index.html` / `public/app.js` | Buscador topbar real, sección cribador de Inicio, tarjetas destacadas, `?analizar=` (filing → análisis), secciones de seguimiento/cartera/histórico. |
| `public/watchlists.js` / `public/portfolio.js` | Popover de seguimiento y panel de cartera integrados. |
| `public/auth.js` | Sesión; al cambiar, recarga la empresa para aplicar el límite PRO. |
| `public/styles.css` | Todo el diseño (clon TIKR claro + empresa + gráficos + modales); versionado `?v=26`. |

## 10. Responsive

- Menú lateral: drawer con backdrop ≤ 900 px; cabecera de empresa del menú se oculta contraído y se restaura en móvil.
- Cabecera/cotización y perfil apilan en pantallas estrechas; sin desbordamiento horizontal.
- Tablas con `.table-wrap` + columna sticky; modal de preview con scroll.

## 11. Pruebas realizadas

- KO/PG/PEP/TAP verificados en pantalla (cifras, pestañas, emphasis, rojos, PRO).
- Gráfico de precios: MA100 validada (línea con 1.156 segmentos en 5Y); cotización clicable → fullscreen del gráfico.
- Gráfico de métricas: CAGR con caja arrastrable y casos negativos (KHC −30,6 %/año, TAP −23,8 %, HRL −7,1 %, KO +8,1 %).
- Rango de historial: eje X alineado con el rango (fix), valores derivados intactos.
- Filings: 40 filas, preview con 74 imágenes, descarga PDF, botón Analizar → pipeline completo.
- Chrome headless: sin errores de consola en escritorio y móvil; sin desbordamiento.

## 12. Relación con otros módulos

- **Backend**: `documentacion/backend/funcionalidades/screener/` (8 endpoints).
- **Watchlists**: el ojo de la cabecera usa el popover compartido.
- **Cartera**: panel de posición en Empresa + formulario prefijado.
- **Análisis IA**: botón "Analizar con IA" → `/?analizar=` (ver `verificacion-informe`).

## 13. Pendientes

- Ratios y Segmentos (datos reales), Valoración y Accionariado.
- Histórico de filings persistido (tabla `filings`).
- Fase 4: análisis completo de empresa (multi-periodo).
