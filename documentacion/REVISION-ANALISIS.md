# Revisión de análisis IA — ronda de 10 empresas

> Creado: 2026-09-17 · Responsable de las correcciones: el agente (autonomía total)
> Norma suprema: **un arreglo nunca puede romper los análisis anteriores.** Cada corrección se valida contra la lista completa ya revisada antes de darla por buena.

## Objetivo

Revisar uno a uno los análisis generados por la IA (10-Q / 10-K) hasta completar ~10 empresas. El usuario lee el análisis en la web o el PDF, detecta cualquier error (cifras, notas, cuadres, formato, textos) y lo comunica. El agente investiga la causa raíz, la corrige de forma **general** (código, parser o prompt — no se parchea a mano el informe guardado) y regenera los análisis afectados.

## Protocolo (por cada error reportado)

1. **Reporte del usuario** — indicar ticker, horizonte (3M / acumulado), bloque (Ventas / Cash Flow / Asignación de Capital / Notas / Conclusión / PDF) y qué debería decir según el filing oficial (valor esperado vs. mostrado). Con el ticker y el periodo es suficiente; no hace falta el id del análisis.
2. **Diagnóstico** — el agente determina la causa raíz (extracción, parser determinista, fallback EDGAR, normalización, prompt o renderizado) y comprueba si afecta solo a esa empresa o es un patrón general.
3. **Corrección general** — se arregla en el código/prompt común; nunca una excepción específica de un ticker.
4. **Tests** — se añade o amplía un test unitario que reproduce el caso exacto (`npm test` debe quedar 100 % en verde).
5. **Regeneración y verificación** — se regenera el análisis del filing afectado (nueva versión; la web muestra la última) y se verifica:
   - el error corregido,
   - que **no cambien a peor** los análisis ya revisados de la lista,
   - coherencia entre tabla, notas, gráficos y PDF.
6. **Registro** — la corrección se anota en el apartado «Registro de errores y correcciones» de este documento y en el diario (`documentacion/diario/`).

## Reglas

- **No romper lo anterior**: todo cambio debe conservar los cuadres verificados de los análisis ya validados. Si un cambio mejora una empresa pero empeora otra, se resuelve el conflicto antes de aplicarlo.
- **La IA propone, el sistema dispone**: cuando exista una fuente determinista (EDGAR/XBRL, parser del texto del filing), prevalece sobre la IA; los valores calculados por el sistema sobrescriben a los extraídos.
- **Cifras exactas**: las notas de deuda/caja usan los saldos del balance del filing; nada de aproximaciones de la IA si el dato oficial existe.
- **Tests siempre**: ninguna corrección se da por terminada sin `npm test` en verde.
- **Diario**: cada corrección se registra con fecha, causa, arreglo y verificación.

## Lista de revisión (10 empresas)

| # | Empresa | Filing | Cierre | Análisis actual | Estado |
|---|---|---|---|---|---|
| 1 | Conagra Brands (CAG) | 10-K FY2026 | 2026-05-31 | 573 | ok
| 2 | Molson Coors (TAP) | 10-Q FY2026 Q2 | 2026-06-30 | 566 | ok
| 3 | PepsiCo (PEP) | 10-Q FY2026 Q2 | 2026-06-13 | 571 | ok
| 4 | Hormel Foods (HRL) | 10-Q FY2026 Q3 | 2026-07-26 | 577 | ok (2026-09-17) |
| 5 | Kraft Heinz (KHC) | 10-Q FY2026 Q2 | 2026-06-27 | 585 | Corregida y verificada — pendiente de tu revisión |
| 6 | Keurig Dr Pepper (KDP) | 10-Q FY2026 Q2 + 10-K FY2025 | 2026-06-30 / 2025-12-31 | 687 / 688 | Corregida y verificada por el sistema — pendiente de tu revisión |
| 6 | Por definir | — | — | — | — |
| 7 | Por definir | — | — | — | — |
| 8 | Por definir | — | — | — | — |
| 9 | Por definir | — | — | — | — |
| 10 | Por definir | — | — | — | — |

**Estados posibles**: Pendiente de revisión del usuario · En revisión · Sin errores detectados · Con errores (ver registro) · Corregida y verificada.

## Cómo reportar un error (plantilla breve)

```text
Empresa/periodo:
Bloque y horizonte:
Qué muestra el análisis:
Qué debería mostrar (según el filing):
```

## Registro de errores y correcciones

### 1. CAG — 10-K FY2026 (2026-05-31)

- **Estado**: **sin errores detectados** — corregida (análisis 573) y revisada por el usuario (marcada «ok» el 2026-09-17). La Asignación de Capital ya había sido validada, pero el bloque de Cash Flow tenía un error fiscal reportado después.
- **Verificado por el sistema (2026-09-17, análisis 573)**: Asignación de Capital anual cuadra — Libre 309 + Desinversiones 687,8 − Caja 150 − Deuda 799,2 = **47,6** («Más o menos cuadra»); deuda 8.067,6 → 7.268,4 y caja 68 → 218; sin filas a 0 ni sección de Recompras (inmateriales).
- **Error reportado por el usuario (2026-09-17)**: el Cash Flow Ajustado daba 3.117,8M y el Libre Ajustado 2.024,7M; la nota fiscal decía «solamente ha pagado **2026M** en efectivo» y aplicaba un ajuste de +1.761,9M.
- **Causa raíz**: el nuevo desglose ASU 2023-09 del 10-K («Income taxes paid, net of refunds, were: 2026 2025 2024 … Total $173,4») hacía que `extractIncomeTaxesPaid` capturase el **año de la cabecera** (2026) como impuestos pagados; la IA no traía el dato (null) y el fallback determinista lo rellenaba mal. El ajuste salía positivo y disparaba el Cash Flow y el Libre.
- **Arreglo general**: `extractIncomeTaxesPaid` detecta las tablas con columna de ejercicios y toma la fila **Total** de la misma tabla (173,4M), y descarta capturas que sean un año (1900–2100); `getTaxNormalizationData` rechaza además un importe que coincida con el año fiscal o supere el EBT ajustado y recurre al parser. Válido para cualquier empresa que adopte el desglose.
- **Verificación**: CAG 10-K 573 → Cash Flow Ajustado **1.271,7** (1.402,1 − 46,2 circulante − 84,2 impuestos), FCF 848,3, Libre Ajustado **178,6** (antes 2.024,7); nota fiscal con 173,4M pagados y ajuste −84,2M. Capital sin cambios (47,6). TAP (41,7) y PEP (965) mantienen su fiscalidad. Tests en `tests/unit/fallbacksResilience.test.js`; suite **179/179**.
- **No-regresión**: el cuadre de capital 47,6 se mantiene; TAP Q2 (45,5 / 0,4) y PEP Q2 (−134) no se ven afectados.

### 2. TAP — 10-Q FY2026 Q2 (2026-06-30)

- **Estado**: **sin errores detectados** — revisado por el usuario el 2026-09-17 («va bien»).
- **Verificado por el sistema (2026-09-17, análisis 566)**: Asignación de Capital 3M — Libre 624,3 − Adquisiciones 271 − Caja 1.745,5 + Deuda 1.437,7 = **45,5** («Más o menos cuadra»); acumulado 6M — 301,5 − 271 − 208,6 − 1.231,6 + 1.410,1 = **0,4**. Notas exactas 6.271,9 → 7.709,6 (deuda) y 382,6 → 2.128,1 (caja).
- **Errores reportados por el usuario**: ninguno. A partir de aquí es referencia de no-regresión: cualquier cambio futuro debe mantener este cuadre.

### 3. PEP — 10-Q FY2026 Q2 (2026-06-13)

- **Estado**: **sin errores detectados** — corregida (análisis 571) y revisada por el usuario (marcada «ok» el 2026-09-17).
- **Error reportado por el usuario (2026-09-17)**: la Asignación de Capital de los últimos 3 meses daba «No cuadra: quedan -1734M sin explicar»; el 3M de PEP era Libre -443 · Inversiones -112 · Recompras -289 · Caja +224 · Deuda **-1114**.
- **Causa raíz**: la deuda del trimestre previo (Q1 2026) se tomaba como 54.328M en lugar de los 52.728M reales del balance (10.151M de «Short-term debt obligations» + 42.577M de «Long-term debt obligations»). EDGAR sumaba 1.600M de `LongTermDebtCurrent`, pero en PepsiCo esa cifra es solo una etiqueta narrativa del 10-Q («1.600M$ de notas sénior vencieron y se pagaron»), ya incluida dentro de la línea de deuda a corto plazo del balance. Es el caso espejo de TAP: allí la porción corriente sí es una línea real del balance.
- **Arreglo general**: `balanceSheetDebtWithoutCurrentPortion()` calcula la variante sin porción corriente; `pickPreviousQuarterDebt()` elige la composición que reproduce la deuda del trimestre actual que la IA leyó del balance (PEP: 53.214 = 42.612 + 10.602 → la variante sin porción corriente), y solo si EDGAR confirma esa composición en el trimestre actual. TAP sigue usando 6.271,9 (la variante con porción corriente es la que reproduce 7.709,6).
- **Verificación**: 3M corregido — Libre -443 − Inversiones 112 − Recompras 289 + Caja 224 + Deuda 486 = **-134** («Más o menos cuadra»); nota exacta 52.728M → 53.214M (+486M) y deuda neta 41.900M → 42.498M. Acumulado 6M sin cambios (-489, «Más o menos cuadra»). Tests en `tests/unit/previousQuarterDebt.test.js`; suite **176/176**.
- **No-regresión**: CAG 10-K (47,6) y TAP Q2 (45,5 / 0,4) verificados de nuevo por la vía determinista tras el cambio (TAP mantiene 6.271,9).

### 4. HRL — 10-Q FY2026 Q3 (2026-07-26)

- **Estado**: **sin errores detectados** — revisado por el usuario el 2026-09-17 («está OK»).
- **Verificado por el sistema (2026-09-17, análisis 577)**: 3M — Libre 11,5 − Caja 12,8 − Deuda 1,2 = **-2,5** («Más o menos cuadra»); deuda 2.856,3 → 2.855,1 y caja 826,8 → 839,6. Acumulado 9M — Libre 68,1 + Inversiones 3,4 + Desinversiones 162,1 − Caja 168,9 − Deuda 2,3 = **+62,4**; supera el umbral y el informe lo señala, pero el residuo queda explicado en gran parte por el pagaré **no monetario** de 40,0M de la venta del negocio de pavo (21,2M en efectivo y 40,0M en pagaré) y partidas menores de las desinversiones; aceptado por el usuario.
- **Errores reportados por el usuario**: ninguno. Queda como referencia de no-regresión (3M).

### 5. KHC — 10-Q FY2026 Q2 (2026-06-27)

- **Estado**: **corregida y verificada por el sistema** (análisis 580) — pendiente de tu revisión.
- **Error reportado por el usuario (2026-09-17)**: «no cuadra» — la Asignación de Capital de los últimos 3 meses daba «No cuadra: quedan -431M sin explicar»: Libre 418 + Inversiones 521 + Caja 889 − Deuda 2.132 − Efectivo restringido **127** = -431.
- **Causas raíz (dos)**:
  1. **Efectivo restringido del trimestre previo mal calculado**: EDGAR tomaba solo una parte (143M del componente no corriente) en vez del total del balance (308M). KHC etiqueta el efectivo restringido en dos partes (corriente 165M + no corriente 143M) y el sistema se quedaba con la primera etiqueta con valor.
  2. **Movimiento de deuda no monetario**: la deuda del balance cayó 2.132M pero el estado de flujos solo refleja 1.829M de movimientos de deuda; la diferencia de 303M (ganancia por extinción/recompra anticipada declarada en el estado de flujos —«Loss/(gain) on extinguishment of debt (265)»— y efecto divisa) no tenía fila propia.
- **Arreglo general**: (1) el efectivo restringido ahora suma las partes corriente + no corriente (`rederiveStatements.js`; conserva el total si ya las cubre); (2) nueva fila automática **«Deuda no monetaria»** cuando la divergencia entre la variación de deuda del balance y el flujo de deuda XBRL es material, con el mismo signo y no superior a la mitad de la variación (evita filas falsas cuando la fuente está incompleta); (3) el parser del estado de flujos de deuda reconoce encabezados en mayúsculas, líneas «Net cash flows from…»/«Cash Provided by (Used in)…» y estados en miles (HRL).
- **Verificación (análisis 580)**: 3M — Libre 418 + Inversiones 521 + Caja 889 − Deuda 2.132 + Deuda no monetaria 303 = **-1** («Más o menos cuadra»); 6M — 710 + 805 + 175 + 196 − 2.218 + 389 + 59 = **116** («Más o menos cuadra»). Nota de deuda exacta 21.133 → 19.001 y caja 3.308 → 2.419.
- **No-regresión**: TAP (45,5 / 0,4), PEP (-134 / -489), HRL (-2,5 / +62,4) y CAG 10-K (47,6) verificados por la vía determinista con los nuevos guardas: ninguna añade la fila de deuda no monetaria. Tests en `tests/unit/cashCapitalReconciliation.test.js` y `tests/unit/fallbacksResilience.test.js`.
- **Cambio de diseño acordado con el usuario (2026-09-17)**: los movimientos que no pasan por caja (**efectivo restringido** y **deuda no monetaria**) ya **no se pintan como filas**. La tabla solo muestra movimientos de caja; si el «En total» supera el umbral, la verificación explica bajo la tabla los movimientos no monetarios con su importe exacto y el resto pendiente. Si el descuadre entra en el umbral razonable, no se añade nada. Reanálisis 585: 3M = Libre 418 + Inversiones 521 + Caja 889 − Deuda 2.132 = **-304** y 6M = **-361**, sin filas de ajuste; la verificación explica bajo la tabla los movimientos que no pasan por caja y el resto pendiente (3M: deuda no monetaria +303M → resto -1M; 6M: efectivo restringido +59M y deuda no monetaria +389M → resto +87M). Guía actualizada (`guiasAnalisisIaContent.js`) con el ejemplo de la recompra de bonos (1.000M → 800M). Tests **186/186**.

### 6. KDP — 10-Q FY2026 Q2 (2026-06-30) y 10-K FY2025 (2025-12-31)

- **Estado**: **corregida y verificada por el sistema** (10-Q análisis 713, 10-K 714) — pendiente de tu revisión.
- **Errores reportados por el usuario (2026-09-18)**:
  1. 10-Q Q2, Asignación de Capital del 3M: la tabla mostraba Libre 348 · Deuda 4.273 · Caja −619 · **En total 4.002** sin la adquisición de JDE Peet's ni la deuda asumida; la verificación decía «No cuadra: quedan +4.002M … efectivo restringido +17.782M. Con ellos, el resto sería **+21.784M**» (sumaba el escrow en la misma dirección y no había explicación real).
  2. 10-K FY2025: la sección de deuda decía «El 10-K no desglosa el calendario de vencimientos» y no aparecía gráfico/tabla de vencimientos.
  3. Segunda revisión del 10-Q (tras el primer arreglo): la verificación daba «No cuadra … resto +404M» y el usuario señaló el ajuste oculto de «efectivo restringido +17.782M» como un **parche contable** que ocultaba las fuentes de financiación del trimestre (preferentes 4.395M y venta de participaciones 3.899M del acumulado).
- **Causas raíz**:
  1. **Adquisición trimestral perdida**: el 10-Q de Q2 solo publica la columna acumulada del estado de flujos (16.615M a 6 meses); `acquisitionsQuarter` dependía solo de la IA y, si no lo traía, la fila desaparecía. El frame XBRL de 3 meses de KDP (402M) es parcial y no podía sustituir al acumulado.
  2. **Tags de adquisiciones contaminados**: `PaymentsToAcquireProductiveAssets` (capex) estaba en la lista de `acquisitions` de EDGAR, así que el «acumulado del trimestre previo» de TAP/PEP tomaba capex (TAP Q1: 231,7M) e impedía deducir bien el trimestre.
  3. **Verificación sin control de signo**: los movimientos no monetarios se sumaban al descuadre aunque lo ampliaran, produciendo «resto» absurdos.
  4. **Calendario del 10-K**: `extractDebtFilingText` caía en el índice de exhibiciones (filas «due 20XX» + fechas 8-K) y no reconocía las notas con columna «Issuance Maturity Date Rate» (KDP: «2026 Notes September 15, 2026 2.550 % 400 400»), por lo que la recuperación determinista devolvía nulo y la IA escribía que no había desglose.
  5. **Escrow presentado como parche**: el cambio de diseño del 17-sep ocultaba el movimiento de efectivo restringido como ajuste «no monetario», de modo que la tabla no mostraba la contrapartida real de la compra (el efectivo segregado en el trimestre anterior) y parecía forzar el cuadre. Comprobado en los filings: el balance del 31-mar-2026 (10-Q Q1) incluye **17.818M de efectivo restringido** «legally segregated … for the completion of the JDE Peet's Acquisition», y las preferentes (4.489M en Q1; 4.395M en el 6M por costes de transacción) y la venta de participaciones (3.948M / 3.899M) se levantaron en **Q1**, no en Q2.
- **Arreglo general**:
  1. **Deducción determinista del trimestre**: `deduceQuarterCashFlow`/`storePreviousQuarterCashFlow` calculan adquisiciones del trimestre = acumulado actual − acumulado del trimestre previo (KDP Q2 = 16.615 − 0) y **mandan sobre la IA y sobre el frame XBRL parcial**. Con ellas se recuperan también la deuda asumida (no-cash) y el cuadre del 3M. Prompt de extracción aclarado (si solo hay columna acumulada, `acquisitionsQuarter` = 0).
  2. **Tags**: `PaymentsToAcquireProductiveAssets` eliminado de `acquisitions` (sigue en `capex`); el capex ya no infla adquisiciones.
  3. **Verificación**: el veredicto (**«Más o menos cuadra»** / «No cuadra») se calcula sobre el resto **después** de los movimientos que no pasan por caja, comparado con el mismo margen (50M / 20 % del Libre / 10 % de los movimientos brutos): KDP 3M = -17.432 + 17.782 = +350 → «Más o menos cuadra» (antes se juzgaba el -17.432 en bruto y salía «No cuadra»; en producción, con Libre 402, quedaba «resto +404M»). Si los movimientos no monetarios no reducen el descuadre, el texto lo dice expresamente («no reducen el descuadre… faltan movimientos de caja por mapear») y nunca afirma que lo explican. La nota de balance Deuda/Caja se garantiza ANTES de la deuda asumida (evita referencias cruzadas) y se limpian etiquetas duplicadas en la fila.
  4. **Calendario**: `extractDebtFilingText` descarta el índice de exhibiciones (8-K/incorporación por referencia) y añade ventana para tablas «Maturity Date»; `buildMaturityScheduleFromFilingText` parsea filas con fecha completa, cupón y doble columna, y descarta narrativa, revólveres y comercial paper.
  5. **Escrow visible cuando financia una adquisición**: si la variación de efectivo restringido es material (≥ 100M) y comparable a la adquisición del periodo (≥ 25 % de ella), se pinta la fila **«Efectivo restringido (escrow)»** con su importe y una nota determinista: saldo anterior → actual, liberación que financió la compra y financiación que lo consignó (preferentes y venta de participaciones del acumulado, con sus importes). En el resto de casos (KHC, P&G, cambios pequeños) sigue oculto y se explica bajo la tabla como hasta ahora. Así la tabla muestra la fuente real de la compra y deja de parecer un ajuste forzado.
- **Verificación (análisis 713/714)**:
  - 10-Q 3M: Libre 402 − Adquisiciones 16.615 + Deuda 4.273 − Deuda asumida 4.819 − Caja 619 + **Efectivo restringido (escrow) 17.782 = +404** («Más o menos cuadra», margen 2.673). La nota *4 explica: «El efectivo restringido pasa de 17.818M a 36M; la liberación de 17.782M financió la adquisición del periodo (16.615M). Ese efectivo se consignó con la financiación levantada en trimestres anteriores (la emisión de preferentes (+4.395M) y la venta de participaciones (+3.899M), visibles en el acumulado)». YTD **463** con preferentes +4.395 y participaciones +3.899 («Más o menos cuadra»).
  - 10-K: calendario de **11 tramos** (2026: 900 · 2027: 1.600 · 2028: 1.612 · 2029: 1.750 · 2030: 1.250; **>2030: 6.952**), tipo medio de toda la deuda **4,27 %** por cupones ponderados. `buildDebtMaturityModel` genera el gráfico correctamente.
- **No-regresión**: TAP deduce **271** (el mismo valor verificado; antes la deducción tomaba capex del Q1), PEP deduce 14 (< 50 → sin fila, igual que el análisis verificado), HRL y KHC sin adquisiciones; CAG 10-K mantiene su tabla (`secTable`) y el parser de texto no interfiere; PG 10-K 2026 sigue con su calendario de 16 tramos (el parser de texto no produce calendario para su nota). Suite **206/206** con 11 tests nuevos (`previousQuarterDebt`, `debtMaturityFallback`, `cashCapitalReconciliation`).

## Historial de la ronda

- **2026-09-17** — Arranque de la ronda. Investigado y corregido el descuadre de +2.441,2M en el 3M de TAP (deuda del trimestre previo mal calculada por la porción corriente ausente en Company Facts y tapada por `FinanceLeaseLiabilityCurrent`). Detalle en `documentacion/diario/2026/09/2026-09-17.md` (21:39). Verificados CAG 10-K (47,6) y TAP Q2 (45,5).
- **2026-09-17** — CAG 10-K y TAP Q2 revisados por el usuario **sin errores**. Ambas quedan como referencias de no-regresión.
- **2026-09-17** — Reportado y corregido el descuadre de -1.734M en el 3M de PEP (etiqueta narrativa `LongTermDebtCurrent` sumada dos veces en la deuda del trimestre previo). Reanálisis 571; CAG y TAP sin cambios.
- **2026-09-17** — Error fiscal del 10-K de CAG (el parser tomaba el año 2026 como impuestos pagados) corregido; reanálisis 573 con Cash Flow Ajustado 1.271,7 y Libre 178,6.
- **2026-09-17** — CAG (573), TAP (566) y PEP (571) marcados **ok** por el usuario en la lista.
- **2026-09-17** — HRL 10-Q FY2026 Q3 (577) revisado por el usuario: **sin errores**.
- **2026-09-17** — Reportado y corregido el descuadre de -431M en el 3M de KHC (efectivo restringido partido en corriente/no corriente + movimiento no monetario de deuda por extinción anticipada).
- **2026-09-17** — Cambio de diseño pedido por el usuario: la tabla de Asignación de Capital solo lleva movimientos de caja; el efectivo restringido y la deuda no monetaria se explican bajo la tabla con su importe exacto siempre que el cuadre no cierre (aunque entre en el umbral). Reanálisis 585 y guía actualizada con el ejemplo de la recompra de bonos.
- **2026-09-18** — Reportados y corregidos los errores de KDP: el 3M del 10-Q Q2 perdía la adquisición de JDE Peet's (16.615M) y la deuda asumida, y la verificación sumaba el escrow en la misma dirección («resto +21.784M»); el 10-K FY2025 no mostraba el calendario de vencimientos (nota con columna «Maturity Date»). Reanálisis 687 (10-Q) y 688 (10-K). Detalle en `documentacion/diario/2026/09/2026-09-18.md`.
- **2026-09-18** — Segunda revisión del Q2 de KDP: el escrow pasa a ser una **fila visible** («Efectivo restringido (escrow) +17.782M») cuando financia una adquisición del periodo, con nota determinista que enlaza con las preferentes (+4.395M) y la venta de participaciones (+3.899M) del acumulado; el veredicto del cuadre se decide sobre el resto tras los movimientos no monetarios. Reanálisis 713 (10-Q, total +404 «Más o menos cuadra») y 714 (10-K, 11 tramos).
