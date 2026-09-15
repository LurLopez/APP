# Analista del sector: consumo defensivo

> Última actualización: 2026-09-12

## Reglas del análisis

1. **Doble visión Ajustado/Normal** — Toda métrica de la cuenta de resultados se presenta en dos columnas: **Ajustado** (excluye partidas extraordinarias, amortización/deterioro de intangibles e impuestos normalizados) y **Normal** (tal y como la reporta la empresa). Cada columna incluye la cifra del periodo anterior y la variación porcentual. Las diferencias entre ambas visiones se explican en notas numeradas (*1, *2…).

2. **Intangibles a 0 (Beneficio Operativo)** — La amortización y el deterioro (impairment) de activos intangibles se excluyen del beneficio operativo (se ajustan a 0) por no representar consumo operativo recurrente. El resalte de color y la llamada de nota (*1) se aplican **únicamente a la casilla de Beneficio Operativo**. Las líneas derivadas (EBT y Beneficio Neto) reflejan el impacto aritmético en la columna Ajustado pero no llevan resalte ni asterisco por este motivo.

3. **Impuestos normalizados (Beneficio Neto)** — Se compara el impuesto reportado con el 23 % del EBT ajustado. Si la desviación supera el -20 % o el +20 %, se normalizan los impuestos al 23 % sobre el EBT ajustado: Beneficio Neto Ajustado = EBT Ajustado × 0,77. El resalte de color y la nota explicativa (*2) se aplican **únicamente a la casilla de Beneficio Neto**.

4. **Cash flow con capital circulante (WC / WK)** — El capital circulante se calcula con la fórmula del usuario:
   `WK de caja = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (Inflación + volumen) = -(Inventarios + Cuentas por cobrar - Cuentas por pagar) × (Inflación + volumen)`
   Si el informe no proporciona volumen, se utiliza obligatoriamente volumen = 0 %. Si no proporciona una inflación específica de la empresa, se utiliza una hipótesis sectorial aproximada del 3 % para consumo defensivo y se indica expresamente en la nota.
   El cash flow se presenta en dos escenarios con valores distintos: **Normal (WC=<valorBase>)** y **Ajustado (WC=<valorAjustado>)**, deduciendo del Cash Flow la desviación de circulante frente a la necesidad teórica normalizada:
   `Desviación WC = WC reportado − WK teórico` y `Cash Flow ajustado = Cash Flow normal − Desviación WC`.
   **Regla de signos en la nota (obligatoria)**: la desviación conserva su signo y la resta se escribe de forma explícita, sin frases contradictorias. Ejemplo correcto: `Desviación del circulante reportado (-147M) frente al WK teórico (12,1M): -159,1M. El Cash Flow ajustado resta esa desviación: 1784,4M - (-159,1M) = 1943,5M.` Queda prohibido escribir `ajuste de -159M (1784,4M + 159,1M)`.
   Normalización fiscal del Cash Flow: Se calcula cuántos impuestos debería pagar la empresa en realidad (23 % sobre el EBT ajustado) y cuánto consta que ha pagado en los cash flows (bien por la línea de impuestos pagados en efectivo como "Income tax (paid) received" / "Income taxes paid", o bien por la conciliación "Gasto fiscal - Ajuste fiscal del cash flow"). Si existe una discrepancia, se ajusta el Cash Flow en la columna Ajustado restando o sumando la diferencia (si pagó menos de lo normalizado se resta, si pagó más se suma). Si se aplica, se recalculan FCF, FCF/Acción y Libre, y se añade la Nota *2 explicando cuántos impuestos debería haber pagado y cuánto ha pagado realmente.
   **Doble ajuste (circulante + impuestos, obligatorio)**: cuando se apliquen ambos ajustes, la Nota *2 debe cerrar la cadena completa `Cash Flow Normal -> ajuste de circulante -> ajuste fiscal -> Cash Flow Ajustado`, mostrando CADA ajuste con su importe y su signo y aclarando si ambos se compensan. Ejemplo: `La cifra final combina los dos ajustes: 9415M -646,7M (circulante) +654,7M (impuestos) = 9423M; el efecto neto es de solo +8M porque ambos se cancelan en gran medida.` Queda prohibido que la tabla dé la impresión de que el ajuste fue irrelevante cuando hubo dos ajustes brutos grandes de signo opuesto.

5. **Cuadre de la asignación de capital** — Se presenta el capital libre junto con las variaciones de caja, recompras, deuda, inversiones a corto plazo y los movimientos no monetarios (efectivo restringido/escrow, deuda asumida en compras, emisión de preferentes, venta de participaciones), y se comprueba explícitamente que el total cuadra. La caja y la deuda se miden SIEMPRE por la variación de saldos del balance (nunca por el cambio neto del estado de flujos) y las notas indican esa variación. Si el estado de flujos presenta un neto de caja distinto, se explica la diferencia (efectivo restringido, efecto divisa u otras partidas) citando las notas del informe. Si no cuadra exactamente, se indica ("Más o menos cuadra") y se advierte de que puede haber partidas no vistas; si el descuadre supera el umbral, se da el importe exacto y se señala que corresponde a movimientos no monetarios o reclasificaciones de balance (efectivo restringido, efecto divisa en caja, deuda asumida en compras, reclasificaciones caja/inversiones) a revisar en las notas de flujos y balance. Nunca se deja el descuadre sin cifra ni se oculta con una fila genérica sin desglose.

6. **Desinversiones y ventas de negocios** — Al analizar una venta: estimar el beneficio neto del negocio vendido a partir de sus ventas y EBITDA, calcular el PER implícito de la operación, comparar sus márgenes con los de la empresa y emitir un juicio sobre la operación ("la venta me parece bastante buena" / mala). Indicar el trimestre en que se materializará y el impacto estimado en caja (descontando lo que realmente entra).

7. **BPA** — El BPA se calcula con las cifras ajustadas y el número de acciones actual. Si existe un efecto extraordinario difícil de cuantificar (p. ej. el impacto exacto de una venta en el BPA), se menciona en nota y no se incluye en el cálculo.

## Formato del informe de referencia

Derivado de los PDFs de `ejemplos/consumo defensivo/` (fuente: `KHC 2025_Q3 ANÁLISIS_ES.pdf`, 2026-08-13).

### Cabecera
`<Año> Q<n> results — <TICKER>` (ej. "2025 Q3 results — KHC")

### Dos horizontes temporales
Cada informe repite los tres bloques para dos horizontes, en este orden:
1. **ÚLTIMOS 3 MESES**
2. **EN TODO EL AÑO (X MESES)** — con los meses transcurridos (ej. 9 meses a cierre de Q3)

### Bloque 1 — VENTAS
Tabla con las filas: **Ventas · Beneficio Bruto · Beneficio Operativo · EBT · Beneficio Neto**
Columnas: `Ajustado | Anterior Ajustado | % Ajustado | Normal | Anterior Normal | % Normal`
- Cifras en millones con sufijo M (ej. 6237M), porcentajes con coma decimal y signo (ej. -2,29 %).
- **Ajuste Obligatorio de Impairments del Periodo Anterior**: Si el año anterior tuvo un impairment (deterioro de fondo de comercio o intangibles), sumarlo obligatoriamente en `Anterior Ajustado` a Beneficio Operativo, EBT y Beneficio Neto (ej. -101M + 1428M = 1327M en KHC 3M). Nunca dejarlo igual a Anterior Normal.
- Notas al pie numeradas (*1, *2…) explicando cada ajuste: impairments del periodo anterior (ej. *1: El año anterior tuvieron un impairment de 1428M), depreciación de intangibles de este año, impuestos anómalos, ventas de negocios, etc. Principio de casilla de origen: el resalte se aplica únicamente a la casilla de origen (intangibles en Beneficio Operativo, impuestos en Beneficio Neto), sin colorear en cascada EBT o Neto por simple arrastre.
- Línea final: **ACCIONES** (en M) y **BPA** (en $).

### Bloque 2 — CASH FLOW
Tabla con las filas: **Cash Flow · CAPEX · FCF · FCF/Acción · Dividendo · Libre**
Columnas: `Normal (WC=<valor>) | Ajustado*1 (WC=<valor>)`
- **Numeración independiente por bloque**: Cada bloque reinicia sus notas en `*1`.
- **Resaltado en cabecera**: La llamada de nota y el resalte cromático se aplican en la cabecera `Ajustado*1 (WC=<valor>)` donde se produce la normalización de capital circulante (color amarillo).
- **Única nota al pie**: `*1: WK = ...` con la fórmula del WC aplicada y su desglose numérico. Queda prohibido poner notas al pie con asterisco por la deducción trimestral ordinaria.

### Bloque 3 — ASIGNACIÓN DE CAPITAL
- **Cálculo desde balance**:
  * `Deuda Balance = Deuda a largo plazo + Deuda a corto plazo` (excluyendo cuentas a pagar a proveedores, que van en el Working Capital).
  * `Deuda Neta = Deuda Balance - (Caja + Inversiones a corto plazo)`.
   * Inversiones a corto plazo, Deuda y Caja se calculan comparando saldos de balance (vs trimestre anterior en 3M; vs inicio de año en acumulado). Además, se debe buscar expresamente `purchases of marketable securities`: si existe, aparece como `Inversiones a corto plazo` con signo negativo. La variación de Deuda en la tabla debe coincidir exactamente con la nota al pie.
- **Convención de signos estricta**:
  * `Libre`: remanente positivo de cash flow (+).
  * `Inversiones a corto plazo`: - si aumentan (uso para comprar valores negociables, ej. -1020M en KHC), + si disminuyen. Se omite si es marginal (< 50M) o 0.
   * `Desinversiones (venta de marcas / negocios / activos)`: fuente de fondos (+). Incluye las ventas de activos (`proceeds from sales of property, plant, equipment and other assets`) y de negocios. Solo si es material (>= 50M). Si es < 50M o 0, se omite.
   * `Adquisiciones (compra de negocios)`: uso de capital (-). Buscar expresamente `Acquisitions of businesses, net of cash acquired` (singular o plural) y `Payments to acquire businesses`. Si existe una adquisición material (>= 50M), la fila es OBLIGATORIA: prohibido omitirla. Si no hubo o fue marginal, se omite.
  * `Deuda`: + si aumenta (fuente de financiación), - si disminuye (uso para amortizar deuda).
   * `Caja`: - si aumenta (uso para dotar caja), + si disminuye (fuente de liquidez liberada).
   * `Efectivo restringido`: variación del efectivo restringido/escrow (distinto de la caja no restringida de la fila anterior): - si aumenta (consignación), + si disminuye (liberación). Fila si la variación es >= 50M.
   * `Recompras`: uso de capital (-). Buscar expresamente `repurchases of common stock`, `purchases of treasury stock` y `share repurchases`. Si existe un importe material, la fila es obligatoria; solo se omite si es 0.
   * `Emisión de preferentes` y `Venta de participaciones`: fuentes de capital (+). Buscar `Net proceeds from issuance of convertible preferred stock` y `Net proceeds from sale of non-controlling interest`. No son deuda ni desinversión; cada fila si es >= 50M.
   * `Deuda asumida (no-cash)`: si hubo adquisición material, la parte del aumento de deuda del balance que no corresponde a deuda emitida/amortizada con caja se resta con signo negativo (-) en esta fila (>= 50M), para que el cuadre refleje solo la deuda que aportó caja. La nota debe desglosar el aumento de deuda entre deuda con caja y deuda asumida con la compra (no-cash), explicando que esta no supone entrada de caja y se resta.
   * Si en `ÚLTIMOS 3 MESES` hay una adquisición material financiada con recursos levantados en trimestres anteriores (preferentes, participaciones o efectivo restringido/escrow) y el 10-Q solo publica el estado de flujos acumulado, se añade una nota explicando que la suma trimestral no puede cerrar exactamente.
- Verificación explícita del cuadre: "El resultado cuadra." o "Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle."
- Notas obligatorias del bloque y vinculación cromática:
  * **Deuda balance, Deuda neta y Caja balance (siempre obligatoria)**: `Deuda balance: <anterior>M -> <actual>M (<variación>M). Deuda neta: <anterior_neta>M -> <actual_neta>M (<variación_neta>M). Caja balance: <anterior>M -> <actual>M (<variación>M); la caja aumentó: uso de capital (-) / la caja disminuyó: fuente de liquidez (+); fila Caja = <valor>M.` La fila `Caja` toma siempre la variación del balance y su cifra debe coincidir con la nota. Si el estado de flujos presenta un cambio neto distinto, se explica en la nota (efectivo restringido, efecto divisa, etc.) según las notas del 10-Q/10-K. Las filas `Caja*2`, `Deuda*2` (y si existiera `Inversiones a corto plazo*2`) llevan la llamada a esta nota y se resaltan con su color asignado (naranja).
  * **Adquisiciones / Desinversiones (venta o compra de marcas, negocios o activos)**: Explicar siempre con un breve texto qué marca, negocio o activo concreto se ha vendido o comprado a partir del informe 10-Q/10-K. Las filas `Adquisiciones*1` / `Desinversiones*2` llevan la llamada a su nota y se resaltan con su color asignado (amarillo). Prohibido omitir la nota cuando la fila figure en la tabla.

### Estilo
- Informe completo en español; símbolo $ para dólares; numeración de notas independiente por bloque (cada bloque reinicia en *1); tono de analista con juicio propio en las notas (valoración cualitativa de operaciones).
- Cifras con como máximo 2 decimales tras la coma (nunca artefactos de coma flotante como `1827,1000000000004`).
