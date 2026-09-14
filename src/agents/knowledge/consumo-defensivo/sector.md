# Sector: Consumo Defensivo (Consumer Staples)

> Nivel 2 — Reglas transversales aplicables a todas las empresas de bienes de consumo defensivo / básico.
> Versión: 1

---

## 1. Reglas de Ajuste Contable

1. **Doble visión Ajustado/Normal**: Toda métrica de la cuenta de resultados se presenta en dos columnas:
   - **Ajustado**: Excluye partidas extraordinarias, amortización y deterioro de intangibles e impuestos normalizados.
   - **Normal**: Cifras tal y como las reporta la empresa bajo US-GAAP.
   - Las diferencias entre ambas columnas se justifican en notas al pie (*1, *2...).

2. **Intangibles a 0 (Beneficio Operativo)**: La amortización y el deterioro (*impairment*) de activos intangibles y fondos de comercio se excluyen del resultado operativo (se ajustan a 0) por no representar consumo de caja ni valor operativo recurrente.
   - **Casilla exclusiva de resalte**: El color de resalte y la llamada de nota (`*1`) se aplican **ÚNICAMENTE a la casilla de Beneficio Operativo**.
   - **Líneas derivadas**: EBT y Beneficio Neto recalculan su importe en la columna Ajustado arrastrando el nuevo beneficio operativo, pero **no se colorean ni llevan asterisco por este concepto**.

3. **Impuestos Normalizados (Beneficio Neto)**: Se compara el impuesto reportado con el **23 % del EBT ajustado**. Si la desviación relativa supera `-20 %` o `+20 %`, se normalizan los impuestos al 23 %.
   - **Base imponible correcta**: El 23 % se aplica sobre el **EBT ajustado**, nunca sobre el EBT reportado: Beneficio Neto Ajustado = EBT Ajustado × 0,77. Si la desviación queda dentro de ±20 %, se conserva el impuesto reportado o el tipo efectivo aplicable.
   - **Casilla exclusiva de resalte**: El color de resalte y la llamada de nota (`*2`) se aplican **ÚNICAMENTE a la casilla de Beneficio Neto**. Deduciendo o añadiendo la diferencia en nota explicativa. EBT no se colorea por ajustes de impuestos.

4. **Cash Flow con Capital Circulante (WC / WK)**:
   - El capital circulante teórico anual necesario para el negocio se calcula según la fórmula:
     $$\text{WK}_{\text{caja, anual}} = (\text{Cuentas por pagar} - \text{Inventarios} - \text{Cuentas por cobrar}) \times (\text{Inflación} + \text{volumen})$$
     Esta es la expresión del impacto de caja: el signo negativo representa una inversión necesaria en circulante. Es equivalente a $-(\text{Inventarios} + \text{Cuentas por cobrar} - \text{Cuentas por pagar}) \times (\text{Inflación} + \text{volumen})$.
   - Se prorratea según el horizonte temporal analizado:
     * Para 3 meses (trimestral): $\text{WC}_{\text{trimestral}} = \text{WC}_{\text{anual}} / 4$.
     * Para acumulado YTD: $\text{WC}_{\text{YTD}} = \text{WC}_{\text{anual}} \times (\text{meses} / 12)$.
   - **Numeración independiente por bloque**: Cada bloque (1. Ventas, 2. Cash Flow, 3. Asignación de Capital) reinicia sus notas en `*1`.
   - Presentar obligatoriamente en la cabecera de la tabla de Cash Flow los dos escenarios con sus valores numéricos:
     * **`Normal (WC=valorBase)`**: Flujos con la variación de circulante reportada en el periodo.
     * **`Ajustado*1 (WC=valorAjustado)`**: Flujos normalizados con la necesidad teórica de circulante. Al reiniciar la numeración en este bloque, la cabecera lleva obligatoriamente la llamada **`Ajustado*1`** y **se resalta con el color asignado a la nota 1 (amarillo)**. Las filas inferiores no se colorean individualmente por WK; si se aplica un ajuste fiscal, únicamente la celda de Cash Flow Ajustado lleva `*2` y el color de la Nota 2.
   - **Prohibición de nota por deducción trimestral**: La resta de flujos acumulados para obtener el trimestre no es un ajuste de criterio y nunca debe generar notas al pie con asterisco. La única nota del bloque de Cash Flow es la del ajuste de WC (`*1: WK = ...`).
    - Ajuste de Cash Flow:
      $$\text{Diferencia WC} = \text{WC}_{\text{base}} - \text{WC}_{\text{teórico}}$$
      $$\text{Cash Flow}_{\text{ajustado}} = \text{Cash Flow}_{\text{normal}} - \text{Diferencia WC}$$
      $$\text{FCF}_{\text{ajustado}} = \text{Cash Flow}_{\text{ajustado}} - \text{CAPEX}$$
      $$\text{FCF/Acción}_{\text{ajustado}} = \text{FCF}_{\text{ajustado}} / \text{Acciones}$$
      $$\text{Libre}_{\text{ajustado}} = \text{FCF}_{\text{ajustado}} - \text{Dividendo}$$
    - **Regla de signos en la nota (obligatoria)**: la diferencia/desviación de circulante conserva su signo y el ajuste se escribe como resta explícita. Ejemplo correcto: `Desviación del circulante reportado (-147M) frente al WK teórico (12,1M): -159,1M. El Cash Flow ajustado resta esa desviación: 1784,4M - (-159,1M) = 1943,5M.` Queda prohibido escribir frases contradictorias como `ajuste de -159M (1784,4M + 159,1M)`.
    - Las dos columnas Normal y Ajustada deben reflejar cifras numéricas distintas siempre que haya variación de circulante. La nota explicativa al pie debe desglosar la fórmula, partidas de balance utilizadas y el cálculo del ajuste.
    - **Desfase fiscal**: Si aparece `Deferred income tax provision/(benefit)`, `Deferred income taxes and income taxes payable, net` o `income taxes payable`, se estima el efectivo fiscal como `gasto por impuestos - ajuste fiscal del cash flow`. Se compara con el 23 % del EBT ajustado y solo se corrige si la diferencia está entre `-20 %` y `+20 %`; cuando se corrige, se propaga a FCF, FCF/Acción y Libre.

5. **Desinversiones y Ventas de Negocios**:
   - Estimar el beneficio neto del negocio vendido a partir de ventas y EBITDA reportados.
   - Calcular el PER implícito de la desinversión y comparar sus márgenes con el negocio consolidado.
   - **Identificación obligatoria**: En la nota correspondiente de la tabla de asignación de capital, explicar siempre con un breve texto qué marca o filial concreta se ha vendido o comprado (fuente documental del 10-Q/10-K), evitando notas genéricas.
   - Emitir un juicio de valor sobre la conveniencia estratégica del acuerdo e indicar el trimestre previsto de liquidación y entrada efectiva en caja.

6. **BPA Ajustado**: El BPA se calcula exclusivamente con el Beneficio Neto Ajustado y el número de acciones diluidas del periodo. Si una operación corporativa tiene un efecto incierto en el BPA, no se especula en el cálculo y se explica en nota.

7. **Ajuste Obligatorio de Deterioros / Impairments del Ejercicio Anterior (Bloque 1)**:
   - Si en el ejercicio anterior comparable hubo deterioros extraordinarios (impairments de goodwill, marcas o intangibles):
     * Sumar de vuelta obligatoriamente dicho deterioro en la columna "Anterior Ajustado" para Beneficio Operativo, EBT y Beneficio Neto.
     * Crear la nota explicativa correspondiente (ej. `*1: El año anterior tuvieron un impairment de 1428M`).

8. **Asignación de Capital (Bloque 3)**:
   - **Fórmula de Deuda Balance**:
     $$\text{Deuda Balance} = \text{Deuda a largo plazo (Long-Term Debt)} + \text{Deuda a corto plazo (Current debt / Short-Term debt)}$$
     * Excluye estrictamente las cuentas a pagar a proveedores (*Accounts Payable*), que forman parte del Working Capital del Cash Flow.
   - **Fórmula de Deuda Neta**:
     $$\text{Deuda Neta} = \text{Deuda Balance} - (\text{Efectivo y equivalentes} + \text{Inversiones a corto plazo})$$
   - **Deuda, Caja e Inversiones desde el Balance**: Se calculan comparando saldos de balance (trimestre actual vs trimestre anterior en 3M; trimestre actual vs principio de año fiscal en acumulado). La caja y la deuda se miden SIEMPRE por la variación de saldos del balance; queda prohibido tomar el cambio neto de efectivo del estado de flujos de caja como valor de las filas `Caja` o `Deuda`. La variación de deuda de la fila de la tabla y la reportada en la nota al pie deben ser estrictamente idénticas; lo mismo para la caja.
   - **Unicidad Estricta de Filas**: Cada métrica (Libre, Inversiones, Desinversiones, Adquisiciones, Recompras, Caja, Deuda, En total) figura **exactamente una única vez en la tabla**. Queda terminantemente prohibido duplicar la fila de Caja o cualquier otra.
   - **Nota Obligatoria de Deuda Balance, Deuda Neta y Caja Balance**:
     Toda tabla de asignación de capital debe incluir la nota con el desglose exacto:
     > `*N: Deuda balance: <anterior>M -> <actual>M (<variación>M). Deuda neta: <anterior_neta>M -> <actual_neta>M (<variación_neta>M). Caja balance: <anterior>M -> <actual>M (<variación>M); la caja aumentó: uso de capital (-) / la caja disminuyó: fuente de liquidez (+); fila Caja = <valor de la fila>M.`
     La fila `Caja` debe coincidir exactamente con la variación del saldo de caja del balance (con el signo invertido) y con la cifra de la nota. Si el estado de flujos de caja presenta un cambio neto de efectivo distinto al del balance (efectivo restringido, efecto divisa u otras partidas no monetarias), se explica la diferencia en la propia nota, citando la partida o nota del informe 10-Q/10-K que la origina. La referencia de la fila y de la nota es SIEMPRE el balance.
   - **Vinculación y Resaltado Cromático de Métricas**:
     Las filas de la tabla correspondientes a notas al pie llevan la llamada en el nombre de la métrica y se resaltan con el color de dicha nota:
      * `Venta de marcas*1`: Resaltado con el color de la nota de desinversión (ej. amarillo `#fef08a`).
      * `Adquisiciones*1`: Resaltado con el color de la nota de adquisición (ej. amarillo `#fef08a`).
      * `Caja*2`, `Deuda*2` (y, si existe, `Inversiones a corto plazo*2`): Hacen referencia conjunta a la nota de deuda balance/neta y caja balance, y se resaltan obligatoriamente con el color de esa nota (ej. naranja `#fed7aa`).
   - **Signos obligatorios**:
     * Inversiones a corto plazo: flujo **neto** de valores negociables = ventas/cobros − compras (ej. compras de 1.724 y ventas de 686 => -1038). Negativo (-) si el neto es comprador (uso de capital), positivo (+) si el neto es vendedor (fuente). Si no consta el detalle de flujos, usar la variación del saldo de balance. Omitir si el neto es marginal (< 50M) o 0.
     * Deuda: Positivo (+) si aumenta (fuente), negativo (-) si disminuye (amortización/uso).
     * Caja: Negativo (-) si aumenta (uso para dotar tesorería), positivo (+) si disminuye (fuente de liquidez).
     * Efectivo restringido/escrow (fila `Efectivo restringido`, si la variación es >= 50M): negativo (-) si aumenta (consignación), positivo (+) si disminuye (liberación). Es distinto de la fila `Caja`, que usa solo el efectivo y equivalentes no restringidos del balance.
    - **Desinversiones (venta de marcas / negocios / activos)**: Entradas netas por desinversiones materiales (>= 50M, incluye venta de activos) figuran con signo positivo (+). Si en el horizonte es < 50M o 0, se omite la fila.
    - **Adquisiciones (compra de negocios)**: Salidas netas por compra de negocios (`Acquisitions of businesses, net of cash acquired`, `Acquisition of business, net of cash acquired`, >= 50M) figuran con signo negativo (-). **Fila OBLIGATORIA si existe una adquisición material en el horizonte: prohibido omitirla.** Si no hubo o fue marginal (< 50M), se omite.
    - **Recompras**: Salida de capital con signo negativo (-). Si en el horizonte es 0, se omite.
    - **Financiación de capital**: entradas por emisión de preferentes (`Emisión de preferentes`, +) y por venta de participaciones no controladoras manteniendo el control (`Venta de participaciones`, +). No son deuda ni desinversión; cada fila se incluye si es >= 50M.
    - **Deuda asumida (no-cash)**: si hubo adquisición material y el flujo de caja neto de deuda del estado de flujos no cubre el aumento de deuda del balance, la diferencia es deuda asumida en la compra (no-cash) y se muestra con signo negativo (-) en `Deuda asumida (no-cash)` (>= 50M), corrigiendo la fila `Deuda` para que el cuadre refleje solo la deuda con entrada de caja. La nota debe desglosar el aumento de deuda entre `deuda emitida/amortizada con caja` y `deuda asumida con la compra (no-cash)`, aclarando que esta última no supone entrada de caja y se resta en el cuadre.
    - **Nota trimestral con financiación previa**: si en `ÚLTIMOS 3 MESES` hay una adquisición material financiada con recursos levantados en trimestres anteriores (preferentes, participaciones o efectivo restringido/escrow) y el 10-Q solo publica el estado de flujos acumulado, se añade una nota explicando que la suma trimestral no puede cerrar exactamente y por qué.
