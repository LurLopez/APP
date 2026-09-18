# Reglas Generales de Análisis Financiero (Cifra)

> Nivel 1 — Marco Universal aplicable a todas las empresas, sectores y subsectores.
> Versión: 0

---

## 1. Estructura y Horizontes Temporales

El análisis financiero se estructura por horizontes temporales siguiendo esta regla según el trimestre fiscal:

- **Trimestres Q2, Q3 y Q4 (10-Q y 10-K)**: Se estructuran obligatoriamente en **dos horizontes temporales**, en este orden:
  1. **`ÚLTIMOS 3 MESES`**: Datos exclusivos del trimestre fiscal analizado.
  2. **`EN TODO EL AÑO (X MESES)`**: Datos acumulados (*Year-To-Date* o YTD) del ejercicio fiscal en curso con el número de meses transcurridos (ej. 6 meses para Q2, 9 meses para Q3, 12 meses para Q4).
- **Trimestre Q1**: **Solo se presenta un único bloque temporal (`ÚLTIMOS 3 MESES`)**, omitiendo la sección de "EN TODO EL AÑO", ya que el acumulado del año coincide exactamente con los primeros tres meses.

### Separación Estricta de Páginas y Cohesión Visual
- **Páginas Independientes por Horizonte Temporal (PDF / Informes)**:
  - Los horizontes **`ÚLTIMOS 3 MESES`** y **`EN TODO EL AÑO (X MESES)`** **NUNCA deben figurar en la misma página**.
  - Primero se presenta en su totalidad el horizonte de los últimos 3 meses, y en la página siguiente comienza de forma obligatoria e independiente el horizonte de todo el año.
- **Cohesión de Títulos y Tablas (Sin Títulos Huérfanos)**:
  - En todos los bloques (y de forma muy especial en **`3. ASIGNACIÓN DE CAPITAL`**), el encabezado de sección y su tabla de datos deben permanecer **estrictamente juntos en la misma página**.
  - Si no hay espacio vertical suficiente en la página en curso para renderizar el título junto con la tabla completa, se debe forzar un salto de página previo para iniciar el bloque en la cabecera de la página siguiente.

---

## 2. Los Tres Bloques Obligatorios del Informe

Cada horizonte temporal debe contener de forma estricta los siguientes tres bloques:

### Bloque 1 — VENTAS (Cuenta de Resultados)

- **Filas obligatorias**:
  1. Ventas (Revenue / Net Sales)
  2. Beneficio Bruto (Gross Profit)
  3. Beneficio Operativo (Operating Income / EBIT)
  4. EBT (Beneficio antes de impuestos)
  5. Beneficio Neto (Net Income)

- **Columnas y Jerarquía Visual**:
  - `Ajustado` (**Negrita**)
  - `Anterior Ajustado` (Regular)
  - `% Ajustado` (Regular, con formato de color)
  - `Normal` (**Negrita**)
  - `Anterior Normal` (Regular)
  - `% Normal` (Regular, con formato de color)

- **Métricas por acción al pie de la tabla**:
  - `ACCIONES` (en millones con sufijo M, ej. `1183M`)
  - `BPA` (en dólares con sufijo $, ej. `0,52 $`)

- **Regla de Herencia Base en «Anterior Ajustado» (`prevAdjusted`)**:
  - Si en el ejercicio anterior comparable no existe ningún ajuste contable documentado (no hubo deterioros extraordinarios, provisiones atípicas ni ajustes fiscales en ese periodo), la columna **Anterior Ajustado** debe tomar de forma obligatoria el valor reportado en **Anterior Normal**.
  - **Prohibición de guiones nulos**: Queda estrictamente prohibido colocar `—` en Anterior Ajustado si existe cifra en Anterior Normal.
  - **Cálculo forzoso de variación**: Al tener ambos valores, el cálculo de `% Ajustado` es obligatorio:
    $$\% \text{ Ajustado} = \frac{\text{Ajustado} - \text{Anterior Ajustado}}{\text{Anterior Ajustado}} \times 100$$
  - **Sin color ni asterisco por herencia**: Si la cifra de Anterior Ajustado es idéntica a Anterior Normal, la casilla no lleva color de resaltado ni asterisco.

- **Ajuste Obligatorio de Deterioros / Impairments del Ejercicio Anterior en «Anterior Ajustado»**:
  - Si en el trimestre o periodo comparable del ejercicio anterior la empresa registró deterioros (impairments de fondo de comercio, marcas o activos intangibles), **es obligatorio sumar de vuelta dicho deterioro a Beneficio Operativo, EBT y Beneficio Neto** en la columna **Anterior Ajustado**:
    $$\text{Beneficio Operativo Anterior Ajustado} = \text{Beneficio Operativo Anterior Normal} + \text{Impairment Anterior}$$
    $$\text{EBT Anterior Ajustado} = \text{EBT Anterior Normal} + \text{Impairment Anterior}$$
    $$\text{Beneficio Neto Ajustado} = \text{EBT Ajustado} \times (1 - t) = (\text{EBT Normal} + \text{Impairment}) \times (1 - t)$$
  - **Impuestos recalculados sobre el EBT ajustado cuando la desviación supera ±20 %**: Se compara el impuesto reportado con el 23 % del EBT Ajustado. Si la desviación relativa es inferior a `-20 %` o superior a `+20 %`, se aplica el 23 % sobre el EBT Ajustado. Si queda dentro de ±20 %, se conserva el impuesto reportado o el tipo efectivo aplicable.
    * Ejemplo: EBT reportado 100M y beneficio neto 80M (20 %). Si el EBT ajustado es 300M, el impuesto reportado de 20M se desvía más de un 20% del impuesto normalizado de 69M: se aplica el 23 % → **Beneficio Neto Ajustado = 300M − 69M = 231M**.
  - Queda estrictamente prohibido dejar Anterior Ajustado igual a Anterior Normal si en el periodo anterior hubo un impairment o deterioro extraordinario.
  - Se debe reflejar la nota explicativa correspondiente con su llamada (ej. `*1: El año anterior tuvieron un impairment de 1428M`).

- **Normalización de Impuestos sobre el EBT Ajustado (Regla de Base Impositiva)**:
  - El **23 % se aplica SIEMPRE sobre el EBT AJUSTADO**, nunca sobre el EBT reportado ni como recargo sobre la cifra de impuestos reportada.
  - Cuando el impuesto reportado se desvíe más de ±20 % del 23 % del EBT Ajustado:
    $$\text{Impuestos normalizados} = 0,23 \times \text{EBT Ajustado}$$
    $$\text{Beneficio Neto Ajustado} = \text{EBT Ajustado} - 0,23 \times \text{EBT Ajustado} = \text{EBT Ajustado} \times 0,77$$
  - Ejemplo: EBT reportado 100M, beneficio neto 80M (tipo efectivo 20 %). El EBT ajustado es 300M. Mantener solo 20M de impuestos es incorrecto: los impuestos normalizados son 23 % × 300M = 69M, y el Beneficio Neto Ajustado = 231M.
  - La nota explicativa debe mostrar el desglose: EBT ajustado, tipo aplicado (23 % o el efectivo reportado) y el importe de impuestos resultante.
- **Resaltado Exclusivo en la Casilla de Origen del Ajuste (Sin Propagación en Cascada)**:
  - **Punto de Intervención Contable**: El color de resaltado y la llamada de nota al pie (`*1:`, `*2:...`) se aplican **exclusiva y estrictamente a la casilla de la métrica donde se origina directamente el ajuste contable**, y NUNCA a las líneas posteriores que cambian únicamente como consecuencia matemática indirecta (arrastre en cascada).
  - **Mapeo estricto por concepto**:
    * **Intangibles, Amortizaciones y Deterioros (*Impairments*)**: El ajuste se origina en los gastos operativos. Por tanto, el resalte con color (ej. Amarillo `#fef08a`) y la llamada de nota (`*1`) van **ÚNICAMENTE en Beneficio Operativo**.
    * **Normalización de Impuestos y Regularizaciones Fiscales**: El ajuste se origina en el gasto impositivo. Por tanto, el resalte con color (ej. Naranja `#fed7aa`) y su llamada de nota (`*2`) van **ÚNICAMENTE en Beneficio Neto**.
    * **Ajustes Financieros / Extraordinarios no operativos**: Solo si existiese una partida financiera extraordinaria excluida directamente en EBT que no provenga de la operativa, se resaltará **EBT**.
  - **Líneas derivadas sin resalte de color**: Aunque EBT y Beneficio Neto varíen numéricamente respecto a la columna Normal como consecuencia de la corrección del Beneficio Operativo, **sus casillas NO deben colorearse ni llevar llamada de asterisco**, manteniéndose con fondo limpio y sin etiqueta de resalte. Solo se resaltará Beneficio Neto si en esa misma línea existe un ajuste fiscal directo independiente (en cuyo caso llevará el color asignado a su propia nota de impuestos).
  - **Unicidad de nota y color**: Cada color pertenece a una nota explicativa concreta. El color solo avanza a la siguiente tonalidad de la paleta oficial (Naranja, Verde...) si se introduce una nueva nota para un ajuste de origen independiente.
  - **Soporte de ajuste en columna anterior**: La columna **Anterior Ajustado** también puede resaltarse con su propia nota y color si el ejercicio precedente tuvo un ajuste contable real originado en esa misma partida (ej. un impairment en el año anterior en Beneficio Operativo).

- **Contenido Detallado de las Notas Explicativas**:
  Al pie de la tabla, cada nota (`*1:`, `*2:...`) llevará su identificador resaltado con el mismo color asignado a su celda y explicará minuciosamente:
  1. El motivo del ajuste (impuestos anómalos, amortización de intangibles a 0, deterioros, partidas atípicas).
  2. Lo que la empresa reportó en la columna Normal frente a lo que debería haber sido bajo el criterio analítico normalizado (ej. *"En principio deberían haber pagado 50M [~22,5 % del EBT] y han reportado 30M"*).
  3. La diferencia neta exacta resultante (ej. *"Por lo tanto, han pagado 20M menos de lo que debían pagar"*).

---

### Bloque 2 — CASH FLOW

- **Filas obligatorias**:
  1. Cash Flow (Flujo de caja operativo / Net Cash from Operating Activities)
  2. CAPEX (Inversiones de capital / Capital Expenditures)
  3. FCF (Free Cash Flow = Cash Flow − CAPEX)
  4. FCF/Acción (FCF dividido entre número de acciones)
  5. Dividendo (Dividendos pagados / Cash Dividends Paid)
  6. Libre (Remanente de caja = FCF − Dividendo)

- **Estructura Obligatoria en Dos Columnas Paralelas**:
  - Siempre se presentan dos columnas: `Normal (WC=...)` y `Ajustado*nota (WC=...)`.
  - La columna Normal muestra el flujo de caja reportado por la empresa.
  - La columna Ajustada normaliza la variación del capital circulante (Working Capital):
    1. **Circulante Base**: Variación del circulante reportada en el estado de flujos de caja.
    2. **Circulante Teórico**: Calculado según la fórmula de la empresa y sector:
       $$\text{WK}_{\text{caja}} = (\text{Cuentas por pagar} - \text{Inventario} - \text{Cuentas por cobrar}) \times (\text{inflación} + \text{volumen})$$
       Esta formulación expresa directamente el impacto de caja: una inversión necesaria de circulante aparece con signo negativo. Es equivalente a $-(\text{Inventario} + \text{Cuentas por cobrar} - \text{Cuentas por pagar}) \times (\text{inflación} + \text{volumen})$.
       Si no existe dato de volumen, se fija en 0 %. Si no existe inflación propia de la empresa, se utiliza la hipótesis sectorial definida para el sector y se etiqueta como estimación.
     3. **Ajuste del Flujo**: Se descuenta la diferencia entre el circulante base y el teórico ($\text{Cash Flow}_{\text{ajustado}} = \text{Cash Flow}_{\text{normal}} - (\text{WC}_{\text{base}} - \text{WC}_{\text{teórico}})$), recalculando FCF, FCF/Acción y Libre.
       4. **Normalización fiscal del Cash Flow**: El trabajo analítico consiste en calcular cuántos impuestos debería pagar la empresa en realidad (23 % sobre el EBT ajustado) y cuánto consta que ha pagado en los cash flows (bien directamente por la línea de efectivo pagado como "Income tax (paid) received" / "Income taxes paid", o bien mediante la conciliación "Gasto fiscal - Ajuste fiscal del cash flow / impuestos diferidos"). Si existe una discrepancia entre los impuestos pagados y los normalizados, se ajusta el Cash Flow en la columna Ajustado:
          $$\text{Ajuste fiscal} = \text{Impuestos pagados en efectivo} - (0,23 \times \text{EBT Ajustado})$$
          $$\text{Cash Flow}_{\text{ajustado}} = \text{Cash Flow}_{\text{ajustado por WC}} + \text{Ajuste fiscal}$$
          Si la empresa pagó menos impuestos de lo normalizado, el Cash Flow disminuye (ajuste negativo); si pagó más, aumenta (ajuste positivo). Este ajuste se aplica ante cualquier discrepancia material para corregir la distorsión del flujo operativo, añadiéndose la Nota `*2: Impuestos: ...` con el desglose exacto de lo que debería haber pagado frente a lo pagado realmente.
      - **Ejemplo**: EBT ajustado 1.385,4M, impuestos normalizados al 23 % = 318,6M. Si en el estado de flujos consta que pagó 131,4M, ha pagado 187,2M de menos: el Cash Flow Ajustado resta -187,2M y se añade la Nota `*2`. Si el EBT ajustado fuese 100M (23M normalizados) y pagó 30M, el Cash Flow Ajustado recibe +7M.
  - Queda estrictamente prohibido renderizar una sola columna en este bloque o duplicar los mismos valores en ambas columnas. Cada fila debe contener dos valores comparativos distintos cuando exista impacto de circulante. Queda prohibido dejar puntos suspensivos `(WC=...)` en las cabeceras; deben figurar los importes numéricos concretos.

- **Deducción Trimestral Sistemática para Q2, Q3 y Q4**:
  - En formularios 10-Q donde los flujos solo se reportan de forma acumulada YTD (6 meses en Q2, 9 meses en Q3), las cifras de los **`ÚLTIMOS 3 MESES`** deben obtenerse restando el acumulado del trimestre precedente:
    $$\text{Flujo Trimestral } Q_n = \text{Flujo Acumulado } Q_n - \text{Flujo Acumulado } Q_{n-1}$$
  - Esta deducción aplica obligatoriamente a: Cash Flow de operaciones, CAPEX, FCF, FCF/Acción, Dividendos pagados y Libre.
  - **Prohibición de notas al pie para la deducción**: La deducción trimestral es una operación aritmética ordinaria para aislar el periodo. **Queda terminantemente prohibido generar notas al pie con llamada de asterisco (ej. `*1: Flujo trimestral deducido...`) para esta operación**. Las notas con asterisco se reservan con exclusividad para ajustes y criterios contables analíticos.
  - **Excepción Q1**: En el primer trimestre, YTD ≡ Q₁. No se realiza resta y se presenta un único bloque temporal.

- **Principio de Resaltado en Cabecera (`Ajustado*nota`)**:
  - El ajuste del Bloque 2 se origina en la normalización del Capital Circulante (Working Capital), interviniendo la totalidad de la columna ajustada.
  - Por ello, **el color de resaltado asignado a la nota de circulante (ej. Amarillo `highlight-c1` para `*1:`, o Naranja `highlight-c2` para `*2:`) debe colocarse obligatoriamente en la cabecera de la columna: `Ajustado*nota (WC=valorAjustado)`**.
  - Las celdas de datos individuales reflejan el impacto numérico y permanecen limpias por el ajuste de WK. **Excepción: si se aplica una normalización fiscal del cash flow, la celda de Cash Flow en la columna Ajustado lleva `*2` y el resaltado de la Nota 2**, justo debajo de la cabecera `Ajustado*1`.

- **Numeración Independiente de Notas por Bloque (Reinicio en *1)**:
  - Cada bloque del informe (**1. Ventas**, **2. Cash Flow** y **3. Asignación de Capital**) mantiene una numeración de notas al pie estrictamente **independiente**, reiniciando siempre sus llamadas en **`*1`**.
  - Si en el Bloque 1 se utilizaron notas (`*1:`, `*2:`...), al pasar al Bloque 2 (Cash Flow) la numeración vuelve a empezar desde **`*1:`**.
  - Por tanto, en el Bloque 2 la nota de ajuste de capital circulante (WK) es siempre la **`*1: WK = ...`**, y la cabecera de la columna ajustada se titula obligatoriamente **`Ajustado*1 (WC=valorAjustado)`**, resaltándose con el color correspondiente a la nota 1 (Amarillo flúor `#fef08a`).
  - Igualmente, en el Bloque 3 (Asignación de Capital) la numeración se reinicia en **`*1:`** (ej. `*1: Venta de marcas...`, `*2: Deuda balance...`).

---

### Bloque 3 — ASIGNACIÓN DE CAPITAL

- **Vínculo Estricto con la Línea «Libre»**:
  - La primera fila obligatoria **Libre** toma obligatoriamente el valor resultante de la línea **Libre** calculado en el Bloque 2 de Cash Flow (`FCF - Dividendo`).

- **Unicidad Estricta de Filas (Prohibición de Duplicados)**:
  - Cada partida (`Libre`, `Inversiones a corto plazo`, `Desinversiones`, `Adquisiciones`, `Recompras`, `Caja`, `Deuda`, `En total`) figura **exactamente una única vez en la tabla**. Queda terminantemente prohibido duplicar la fila de `Caja` o cualquier otra métrica.

- **Cálculo de Deuda, Caja e Inversiones Directamente desde el Balance General**:
  - **Inversiones a corto plazo**:
    * En el horizonte trimestral (ÚLTIMOS 3 MESES): $\text{Inversiones} = -(\text{Inversiones}_{\text{este trimestre}} - \text{Inversiones}_{\text{trimestre anterior}})$.
    * En el horizonte acumulado (EN TODO EL AÑO): $\text{Inversiones} = -(\text{Inversiones}_{\text{este trimestre}} - \text{Inversiones}_{\text{principio de año fiscal}})$.
    * **Convención de signos**:
      - Si las inversiones a corto plazo / valores negociables aumentan: Signo **NEGATIVO (-)** (se ha asignado capital a comprar inversiones, ej. `-1020` en KHC).
      - Si disminuyen: Signo **POSITIVO (+)** (la desinversión/vencimiento de valores aporta liquidez).
      - Si en el horizonte analizado es 0 o marginal (< 50M), **la fila no debe aparecer en la tabla**.
  - **Deuda**:
    * **Fórmula Estricta de Deuda Balance**:
      $$\text{Deuda Balance} = \text{Deuda a largo plazo (Long-Term Debt)} + \text{Deuda a corto plazo (Current debt / Short-Term debt)}$$
      * Incluye la deuda financiera a largo plazo y sus vencimientos corrientes / deuda a corto plazo.
      * **Exclusión obligatoria**: Quedan estrictamente excluidas las cuentas comerciales a pagar a proveedores (*Accounts Payable*), ya que forman parte integral del Capital Circulante (*Working Capital*) en el Bloque de Cash Flow.
    * **Fórmula Estricta de Deuda Neta**:
      $$\text{Deuda Neta} = \text{Deuda Balance} - (\text{Efectivo y equivalentes} + \text{Inversiones a corto plazo})$$
    * **Cálculo de la Variación de Deuda**:
      - En el horizonte trimestral (ÚLTIMOS 3 MESES): $\Delta \text{Deuda} = \text{Deuda Balance}_{\text{este trimestre}} - \text{Deuda Balance}_{\text{trimestre anterior}}$.
      - En el horizonte acumulado (EN TODO EL AÑO): $\Delta \text{Deuda} = \text{Deuda Balance}_{\text{este trimestre}} - \text{Deuda Balance}_{\text{principio de año fiscal (cierre ejercicio anterior)}}$.
    * **Convención de signos**:
      - Si la deuda ha aumentado: Signo **POSITIVO (+)** (la deuda actúa como fuente de dinero que entra prestado a la empresa).
      - Si la deuda ha disminuido: Signo **NEGATIVO (-)** (se ha asignado capital a amortizar/reducir deuda).
    * **Coherencia y Sincronización Estricta entre Tabla y Nota**:
      - El importe de la fila **Deuda** en la tabla de Asignación de Capital y la variación de deuda ($\Delta \text{Deuda}$) detallada en la nota explicativa **DEBEN COINCIDIR EXACTAMENTE**. Queda prohibido que la tabla muestre una variación y la nota reporte otra contradictoria.
  - **Caja**:
    * En el horizonte trimestral (ÚLTIMOS 3 MESES): $\text{Caja} = -(\text{Caja}_{\text{este trimestre}} - \text{Caja}_{\text{trimestre anterior}})$.
    * En el horizonte acumulado (EN TODO EL AÑO): $\text{Caja} = -(\text{Caja}_{\text{este trimestre}} - \text{Caja}_{\text{principio de año fiscal}})$.
    * **Convención de signos**:
      - Si la caja ha aumentado: Signo **NEGATIVO (-)** (se ha asignado o gastado capital en incrementar la caja).
      - Si la caja ha disminuido: Signo **POSITIVO (+)** (la reducción de tesorería actúa como fuente de liquidez para financiar otros usos).
    * **Referencia obligatoria**: la fila `Caja` se calcula SIEMPRE con los saldos del balance general; nunca con el cambio neto de efectivo del estado de flujos de caja. Su cifra y la nota al pie deben coincidir con la variación del saldo de caja del balance.
  - **Efectivo restringido / escrow**:
    * Variación del efectivo restringido o en escrow (línea "Restricted cash" del balance o de la conciliación del estado de flujos), que no forma parte de la fila `Caja` (efectivo y equivalentes no restringido): si **disminuye** (se libera para pagos), Signo **POSITIVO (+)** (fuente de fondos); si **aumenta** (se consigna), Signo **NEGATIVO (-)** (uso). Fila `Efectivo restringido` si la variación es $\ge 50\text{M}$.
  - **Desinversiones (venta de marcas / negocios / activos)**:
    * Si la empresa ha obtenido ingresos por la venta de marcas, negocios, filiales o activos (incluye `proceeds from sales of property, plant, equipment and other assets` y desinversiones de negocios materiales $\ge 50\text{M}$ en conjunto): Signo **POSITIVO (+)** (fuente de fondos). Si en el horizonte analizado no hubo venta o su importe fue marginal (< 50M) o 0, **la fila no debe aparecer en la tabla**.
  - **Adquisiciones (compra de negocios)**:
    * Si la empresa ha pagado por la compra de negocios o empresas (`Acquisitions of businesses, net of cash acquired`, `Acquisition of business, net of cash acquired`, `Payments to acquire businesses`) un importe material $\ge 50\text{M}$: Signo **NEGATIVO (-)** (uso de capital). **La fila `Adquisiciones` es OBLIGATORIA siempre que exista una adquisición material en el horizonte: prohibido omitirla**. Si no hubo adquisiciones o fueron marginales (< 50M), la fila no aparece.
  - **Recompras**:
    * Salida de capital destinada a compra de acciones propias: Signo **NEGATIVO (-)** (uso de capital). Si en el periodo analizado es 0, **la fila no debe aparecer en la tabla**.
  - **Financiación de capital (preferentes y participaciones no controladoras)**:
    * Entradas de caja por emisión de acciones preferentes ("Net proceeds from issuance of convertible preferred stock") o por venta de participaciones no controladoras manteniendo el control de la filial ("Net proceeds from sale of non-controlling interest"): Signo **POSITIVO (+)** (fuente de capital). Fila(s) `Emisión de preferentes` y/o `Venta de participaciones` si cada una es $\ge 50\text{M}$. No son deuda ni desinversión (la filial sigue consolidando).
  - **Deuda asumida (no-cash)**:
    * SOLO si hubo una adquisición material ($\ge 50\text{M}$), la deuda del balance **AUMENTÓ** y ese aumento supera el flujo neto de deuda emitida menos amortizada del estado de flujos de financiación: la diferencia es deuda asumida en la compra (no supone entrada de caja). Signo **NEGATIVO (-)** en la fila `Deuda asumida (no-cash)`, con importe `Δdeuda balance − flujo neto de deuda`, si es $\ge 50\text{M}$. Corrige la fila `Deuda` para que el cuadre refleje solo la deuda que aportó caja.
    * Si el sistema calcula `capitalAllocationData.assumedDebt = 0` o no existe (no hay adquisición material o no se detectó deuda asumida), **la fila NO se incluye nunca**: queda prohibido inventarla ni usarla para duplicar la variación de deuda del balance.
    * **Nota obligatoria**: la nota de esta fila debe desglosar el aumento de deuda del balance en sus dos componentes: `X M de deuda emitida/amortizada con caja` y `Y M de deuda ya existente en la empresa adquirida que se asume con la compra (no-cash, no supone entrada de caja)`, explicando que esa parte se resta en el cuadre.
    * **Nota trimestral con financiación previa**: si en `ÚLTIMOS 3 MESES` hay una adquisición material financiada con recursos levantados en trimestres anteriores (preferentes, participaciones o efectivo restringido/escrow) y el 10-Q solo publica el estado de flujos acumulado, se añade una nota explicando que la suma trimestral no puede cerrar exactamente y por qué.
  - **Filtro de significatividad**: Si una partida no se ha producido en el periodo o su importe es marginal (< 50M), **la fila no debe aparecer en la tabla**. Solo se muestran las partidas materiales que explican el destino o procedencia del capital.

- **Convención Cromática en Cifras Numéricas**:
  - Cifras positivas: Color **verde** (ej. `1066`, `1323`, `154`).
  - Cifras negativas: Color **rojo** con signo negativo explícito (ej. `-1020`, `-435`, `-780`).

- **Regla de Suma Total y Doble Veredicto de Cuadre**:
  - Al pie de la tabla se calcula la suma algebraica con signo:
    $$\text{En total} = \text{Libre} + \sum \text{Usos/Fuentes de Capital}$$
  - A continuación se emite el veredicto textual con estricto criterio analítico:
    1. **Cuadre razonable (umbral relativo)**: el residuo es aceptable si $|\text{En total}| \le \max(50\text{M},\ 20\,\%\ \text{del Libre},\ 10\,\%\ \text{de la suma bruta de movimientos})$.
       > `"Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle."` (o `"El resultado cuadra."` si la discrepancia es nula).
    2. **Descuadre significativo (alerta de análisis a fondo)**: si supera ese umbral:
       > `"No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo."`

- **Notas Obligatorias al Pie de Asignación de Capital**:
  1. **Nota Comparativa de Deuda Bruta, Deuda Neta y Caja Balance (Siempre obligatoria)**:
     - Se debe incluir siempre y de forma explícita el desglose comparativo de la deuda de balance, la deuda neta ($\text{Deuda neta} = \text{Deuda balance} - (\text{Caja} + \text{Inversiones corto plazo})$) y la caja del balance:
       $$\text{Formato: } \text{Deuda balance: } <\text{anterior}>\text{M} \rightarrow <\text{actual}>\text{M } (<\Delta \text{deuda}>\text{M}). \text{ Deuda neta: } <\text{anterior neta}>\text{M} \rightarrow <\text{actual neta}>\text{M } (<\Delta \text{deuda neta}>\text{M}). \text{ Caja balance: } <\text{anterior}>\text{M} \rightarrow <\text{actual}>\text{M } (<\Delta \text{caja}>\text{M})\text{; la caja aumentó: uso de capital (-) / la caja disminuyó: fuente de liquidez (+); fila Caja = }<\text{valor}>\text{M}.$$
       *(La fila `Caja` se calcula SIEMPRE por la variación de saldos del balance, con el signo invertido, y su cifra debe coincidir con la nota. Si el estado de flujos presenta un cambio neto de efectivo distinto, se explica la diferencia en la nota (efectivo restringido, efecto divisa u otras partidas no monetarias). Ejemplo: `*2: Deuda balance: 8064M -> 7332M (-732M). Deuda neta: 7996M -> 6257M (-1739M). Caja balance: 68M -> 55M (-13M); la caja disminuyó: fuente de liquidez (+); fila Caja = 13.`)*
  2. **Nota de Adquisiciones / Desinversiones (Venta o Compra de Marcas, Negocios o Activos)**:
     - Si la tabla recoge movimientos materiales por adquisiciones (compra de negocios) o desinversiones (venta de marcas, negocios o activos):
       - Se debe explicar siempre con un **breve texto qué marca, división, negocio o activo concreto se ha comprado o vendido**, identificándolo a partir del informe 10-Q/10-K (campos `acquisitionDescription` / `divestitureDescription` del JSON si están presentes).
       - Queda prohibido emitir notas genéricas sin identificar la marca o activo vendido/comprado si la información figura en el documento, y prohibido omitir la nota cuando la fila `Adquisiciones` o `Desinversiones` figure en la tabla.
       - *(Ejemplos: `*1: Adquisiciones: Se destinaron 271M a la compra de [negocio adquirido] (uso de fondos).` — `*2: Desinversiones: Se ingresaron 649M por la venta de [marca/negocio vendido] (fuente de fondos).`)*.
  3. **Orden y Numeración Limpia**:
     - Las notas del bloque se enumeran correlativamente (`*1:`, `*2:`...).
     - Se eliminan notas redundantes o desordenadas; la explicación de deuda se concentra exclusivamente en la nota formal de deuda balance y deuda neta.
  4. **Vinculación y Resaltado Cromático en las Métricas de la Tabla**:
     - Las filas de la tabla cuya cifra o concepto responde a una nota explicativa deben llevar la llamada `*N` en el nombre de la métrica y **resaltarse con el color asignado a dicha nota**:
        * **Adquisiciones y Desinversiones**: Llevan la llamada a su nota (ej. `Adquisiciones*1`, `Desinversiones*2`) y se resaltan con el color de la nota (ej. Amarillo `#fef08a` / `highlight-c1`).
       * **Caja y Deuda** (y, si estuvieran presentes, **Inversiones a corto plazo**): Responden conjuntamente a la nota de deuda en balance y deuda neta. Por ello, **todas ellas deben llevar la llamada a dicha nota (ej. `Caja*2`, `Deuda*2`, `Inversiones a corto plazo*2`) y resaltarse con el color oficial de esa nota (ej. Naranja `#fed7aa` / `highlight-c2`)**.
       * En la columna `Valor`, las cifras conservan estrictamente su formato de signo (verde para positivos, rojo para negativos). El color de la llamada a la nota se sitúa en la etiqueta del nombre de la métrica.

---

## 3. Formato Numérico, Colores y Convenciones de Estilo

- **Negrita en Columnas Clave**: Las cifras de las columnas **`Ajustado`** y **`Normal`** siempre se muestran en **negrita**, tanto en el horizonte trimestral como en el acumulado anual.
- **Colores en Porcentajes (`% Ajustado` y `% Normal`)**:
  - Variaciones positivas ($> 0$): Color **verde** (ej. `+16,67 %`, `21,05 %`).
  - Variaciones negativas ($< 0$): Color **rojo** con su signo negativo visible (ej. `-1,87 %`, `-7,46 %`).
- **Secuencia de Paleta Cromática Oficial por Nota**:
  - **Ajuste / Nota 1**: Amarillo flúor (`#fef08a`, texto `#854d0e`)
  - **Ajuste / Nota 2**: Naranja (`#fed7aa`, texto `#c2410c`)
  - **Ajuste / Nota 3**: Verde lima (`#bbf7d0`, texto `#15803d`)
  - **Ajuste / Nota 4**: Morado / Malva (`#e9d5ff`, texto `#7e22ce`)
  - **Ajuste / Nota 5**: Celeste pastel (`#bae6fd`, texto `#0369a1`)
  - **Ajuste / Nota 6**: Rosa pastel (`#fbcfe8`, texto `#be185d`)
- **Moneda y Millones**: Todas las cifras monetarias en **millones de dólares estadounidenses** con sufijo **`M`** (ej. `2788M`). Símbolo **`$`** para precios y ratios por acción (ej. `0,83 $`).
- **Decimales**: todas las cifras (flujos, asignación de capital, etc.) llevan **como máximo 2 decimales** tras la coma y nunca muestran artefactos de coma flotante (ej. prohibido `1827,1000000000004`; correcto `1827,1`).
- **Porcentajes**: Con **coma decimal**, dos decimales y signo explícito.
- **Datos no disponibles**: Utilizar un guion largo **`—`**. **Bajo ninguna circunstancia se inventarán o estimarán cifras sin evidencia documental.**
- **Idioma y Tono**: Redacción íntegra en **español profesional**. Tono de analista financiero senior: riguroso, crítico, independiente y con criterio propio en las notas explicativas.
