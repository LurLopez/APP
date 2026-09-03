# Reglas Generales de Análisis Financiero (Cifra)

> Nivel 1 — Marco Universal aplicable a todas las empresas, sectores y subsectores.

---

## 1. Estructura y Horizontes Temporales

El análisis financiero se estructura por horizontes temporales siguiendo esta regla según el trimestre fiscal:

- **Trimestres Q2, Q3 y Q4 (10-Q y 10-K)**: Se estructuran obligatoriamente en **dos horizontes temporales**, en este orden:
  1. **`ÚLTIMOS 3 MESES`**: Datos exclusivos del trimestre fiscal analizado.
  2. **`EN TODO EL AÑO (X MESES)`**: Datos acumulados (*Year-To-Date* o YTD) del ejercicio fiscal en curso con el número de meses transcurridos (ej. 6 meses para Q2, 9 meses para Q3, 12 meses para Q4).
- **Trimestre Q1**: **Solo se presenta un único bloque temporal (`ÚLTIMOS 3 MESES`)**, omitiendo la sección de "EN TODO EL AÑO", ya que el acumulado del año coincide exactamente con los primeros tres meses.

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

- **Resaltado de Cifras Ajustadas y Notas Explicativas (Diferenciación Cromática)**:
  - Cuando una cifra en la columna **Ajustado** difiera de la columna **Normal** por haberse realizado un ajuste contable, la celda debe aparecer **resaltada con un color identificador**.
  - **Paleta por cada ajuste / nota**: Para facilitar la lectura visual, cada casilla ajustada y su nota al pie vinculada (`*1:`, `*2:...`) deben compartir un **color de resaltado diferenciado** (ej. Nota 1 en amarillo `#fef08a`, Nota 2 en celeste `#bae6fd`, Nota 3 en naranja `#fed7aa`, Nota 4 en rosa `#fbcfe8`...).
  - Si en una misma casilla coinciden dos ajustes (`*1, *2`), el resaltado de la casilla y las marcas de los asteriscos compartirán la misma coherencia cromática.
  - Al pie de la tabla, cada nota (`*1:`, `*2:...`) llevará su identificador resaltado con el mismo color asignado a su celda y explicará minuciosamente:
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
  5. Dividendo (Total de dividendos ordinarios pagados en caja)
  6. Libre (FCF − Dividendo)

- **Cálculo del Cash Flow Trimestral por Deducción Acumulada (YTD)**:
  - Cuando el informe 10-Q proporcione únicamente los flujos de efectivo acumulados del año en curso (*Statement of Cash Flows* acumulado a 6 o 9 meses), las cifras de los **`ÚLTIMOS 3 MESES`** deben obtenerse restando el acumulado del trimestre precedente:
    $$\text{Flujo Trimestral } Q_n = \text{Flujo Acumulado } Q_n - \text{Flujo Acumulado } Q_{n-1}$$
  - Esta deducción aplica a:
    - Cash Flow de operaciones.
    - CAPEX.
    - Variaciones de Capital Circulante (*Working Capital*: inventarios, cuentas a cobrar y a pagar).
    - Dividendos pagados.
    - Recompras y emisiones netas de deuda.

- **Escenarios de Working Capital (WC)**: Presentar escenarios comparativos (p. ej. Normal vs Ajustado según el criterio de circulante).

---

### Bloque 3 — ASIGNACIÓN DE CAPITAL

- **Filas obligatorias**:
  1. Libre (Remanente procedente del Bloque de Cash Flow)
  2. [Inversiones a corto plazo] (compra/venta de valores negociables o inversiones financieras)
  3. Recompras (Efectivo destinado a recompra de acciones propias)
  4. Caja (Variación neta en tesorería y equivalentes)
  5. Deuda (Variación neta por emisión o amortización de pasivos financieros)
  6. En total (Suma algebraica con signo)

- **Verificación explícita de cuadre**: Indicar de forma textual:
  - `"El resultado cuadra."` cuando la suma de usos iguale al capital libre.
  - `"Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle."` si existe una pequeña discrepancia por partidas no desglosadas en el informe.

---

## 3. Formato Numérico, Colores y Convenciones de Estilo

- **Negrita en Columnas Clave**: Las cifras de las columnas **`Ajustado`** y **`Normal`** siempre se muestran en **negrita**, tanto en el horizonte trimestral como en el acumulado anual.
- **Colores en Porcentajes (`% Ajustado` y `% Normal`)**:
  - Variaciones positivas ($> 0$): Color **verde** (ej. `+16,67 %`, `21,05 %`).
  - Variaciones negativas ($< 0$): Color **rojo** con su signo negativo visible (ej. `-1,87 %`, `-7,46 %`).
- **Moneda y Millones**: Todas las cifras monetarias en **millones de dólares estadounidenses** con sufijo **`M`** (ej. `2788M`). Símbolo **`$`** para precios y ratios por acción (ej. `0,83 $`).
- **Porcentajes**: Con **coma decimal**, dos decimales y signo explícito.
- **Datos no disponibles**: Utilizar un guion largo **`—`**. **Bajo ninguna circunstancia se inventarán o estimarán cifras sin evidencia documental.**
- **Idioma y Tono**: Redacción íntegra en **español profesional**. Tono de analista financiero senior: riguroso, crítico, independiente y con criterio propio en las notas explicativas.
