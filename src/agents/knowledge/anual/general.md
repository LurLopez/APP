# Reglas Generales de Análisis Financiero Anual (Cifra)

> Nivel 1 — Marco Universal aplicable a todos los análisis anuales (Form 10-K) para cualquier empresa, sector y subsector.
> Documento de referencia canónico: `TAP 2025_ANNUAL ANÁLISIS_ES.pdf` (almacenado en `src/agents/knowledge/anual/ejemplos/`).

---

## 1. Arquitectura y Estructura Global del Informe Anual

El informe de análisis anual se divide de forma estricta en **tres partes consecutivas**:

```text
INFORME ANUAL (FORM 10-K)
├── PARTE I: RESUMEN DE CUENTAS (Idéntica a la estructura trimestral)
│   ├── Encabezado: "[AÑO] ANNUAL results — [TICKER]"
│   ├── Periodo: "EN TODO EL AÑO (12 MESES)" (o "URTE GUZTIAN")
│   ├── Bloque 1: VENTAS (Cuenta de Resultados en doble columna + notas + BPA/Acciones)
│   ├── Bloque 2: CASH FLOW (Doble columna Normal/Ajustado + Working Capital 12M + ajuste fiscal)
│   └── Bloque 3: ASIGNACIÓN DE CAPITAL (Balance anual directo + notas de deuda y cuadre)
│
├── PARTE II: CONCLUSIÓN E INDAGACIÓN A FONDO EN PUNTOS CRÍTICOS
│   ├── 1. Recompras de Acciones (Share Repurchases) + Captura SEC obligatoria
│   ├── 2. Outlook y Perspectivas Futuras (Guidance) + Captura SEC obligatoria
│   ├── 3. Deuda y Calendario de Vencimientos (Debt Maturity) + Captura SEC obligatoria
│   ├── 4. Adquisiciones y Operaciones Corporativas (si existen)
│   ├── (+) Puntos condicionales según materialidad (Dividendos, Desinversiones,
│   │        Impairments, Reestructuraciones, Litigios, Impuestos, Pensiones,
│   │        Concentración de clientes, Cambio de CEO — solo si aplican)
│   └── 5. Puntos Clave a Vigilar para el Próximo Ejercicio (Watchlist)
│
└── PARTE III: NOTA DE RESULTADOS (1 a 10)
    └── Calificación numérica puramente financiera sin especulación sobre cumplimiento
```

---

## 2. PARTE I — Resumen de Cuentas (Estructura Canónica)

La primera parte replica fielmente la mecánica contable y visual de los informes trimestrales, adaptada al horizonte de ejercicio fiscal completo (12 meses):

- **Horizonte Temporal Único**:
  - Encabezado: **`[AÑO] ANNUAL results`** con el ticker de la compañía (ej. `2025 ANNUAL results — TAP`).
  - Subtítulo de periodo: **`EN TODO EL AÑO (12 MESES)`** (o `URTE GUZTIAN`).
  - **Sin deducciones trimestrales intermedias**: Las magnitudes de resultados, flujos y balances provienen directamente del Form 10-K auditado.

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
  - `% Ajustado` (Regular, verde si $>0$, rojo si $<0$)
  - `Normal` (**Negrita**)
  - `Anterior Normal` (Regular)
  - `% Normal` (Regular, verde si $>0$, rojo si $<0$)

- **Notas Explicativas con Resaltado Exclusivo en Origen**:
  - `*1` **Depreciaciones y Deterioros (Impairments)**:
    - Se suman de vuelta al Beneficio Operativo los deterioros extraordinarios de fondo de comercio (*goodwill*), marcas o intangibles, así como depreciaciones atípicas en otras partidas operativas (ej. *Other Operating Income/Expense*).
    - El fondo de color (Amarillo `#fef08a`) y la llamada `*1` van **únicamente en la celda de Beneficio Operativo**.
    - EBT y Beneficio Neto recalculan su importe arrastrando el nuevo resultado operativo sin colorearse.
  - `*2` **Normalización de Impuestos**:
    - Si la empresa reporta un beneficio o anomalía fiscal (tipo efectivo alejado del normalizado), se ajusta el gasto fiscal al tipo de referencia (ej. $22,5\,\% - 23\,\%$ sobre el EBT ajustado).
    - La celda de **Beneficio Neto** lleva la llamada `*2` y el fondo Naranja (`#fed7aa`).
    - En la nota se desglosa el cálculo: impuestos reportados vs impuestos normalizados y la diferencia neta resultante, señalando expresamente su implicación para el ajuste de Cash Flow.

- **Métricas por Acción al Pie de la Tabla**:
  - **`ACCIONES`**: Cifra exacta de acciones en circulación al cierre definitivo del ejercicio fiscal (al final del año, **no el promedio ponderado diluido**):
    - Se indica la variación porcentual y absoluta frente al ejercicio anterior: `X M (al final del [AÑO], no el promedio) -> %X menos/más (Y M) -> efecto en el BPA: +%Z`.
  - **`BPA`**: Cifra de Beneficio Por Acción ajustado:
    - Se indica el valor en dólares y la variación porcentual frente al año anterior: `X,XX $ -> %Y menos/más (Z,ZZ $)`.

---

### Bloque 2 — CASH FLOW

- **Estructura en Dos Columnas**:
  - `Normal (WC=valor)`
  - `Ajustado*N (WC=valor)`

- **Filas obligatorias**:
  1. Cash Flow (Flujo de caja operativo anual)
  2. CAPEX (Inversiones en inmovilizado material y equipos)
  3. FCF (Free Cash Flow anual = Cash Flow − CAPEX)
  4. FCF/Acción (FCF dividido entre el número de acciones a cierre)
  5. Dividendo (Total de dividendos pagados en efectivo en el año fiscal)
  6. Libre (Remanente de caja = FCF − Dividendo)

- **Cálculo de Capital Circulante Anual (Working Capital / WK)**:
  - Al ser año completo, **la necesidad teórica no se prorratea**:
    $$\text{WK}_{\text{caja, anual}} = (\text{Cuentas por pagar} - \text{Inventarios} - \text{Cuentas por cobrar}) \times (\text{Inflación} + \text{volumen})$$
    Como el WK se expresa en términos de impacto en caja, un valor **positivo** significa que el circulante **libera** caja (las cuentas por pagar crecen más que inventarios y cobros) y un valor **negativo** que el circulante **consume** caja.
  - La diferencia entre el WC reportado y el teórico se ajusta en el Cash Flow con esta convención estricta (que el sistema ya calcula):
    $$\text{Desviación WC} = \text{WC}_{\text{reportado}} - \text{WK}_{\text{teórico}}$$
    $$\text{Cash Flow}_{\text{ajustado}} = \text{Cash Flow}_{\text{normal}} - \text{Desviación WC}$$
  - **Regla de signos en la nota (obligatoria)**: la desviación conserva su signo y el ajuste se escribe como una resta explícita. Ejemplo correcto: `Desviación del circulante reportado (-147M) frente al WK teórico (12,1M): -159,1M. El Cash Flow ajustado resta esa desviación: 1784,4M - (-159,1M) = 1943,5M.` Queda terminantemente prohibido escribir frases contradictorias como `ajuste de -159M (1784,4M + 159,1M)`.
  - **Ajuste fiscal del Cash Flow**: Si los impuestos en efectivo efectivamente pagados difieren del gasto devengado normalizado, se descuenta o suma la diferencia exacta en el Cash Flow Ajustado.
  - La nota explicativa al pie detalla minuciosamente ambos ajustes (circulante e impuestos).

---

### Bloque 3 — ASIGNACIÓN DE CAPITAL

- **Filas obligatorias según materialidad ($\ge 50\text{M}$)**:
  1. `Libre`: Toma el valor resultante de la fila Libre del Bloque 2.
  2. `Inversiones a corto plazo`: Flujo **neto** de valores negociables = ventas/cobros ("proceeds from sale of marketable securities") − compras ("purchases of marketable securities"). Signo negativo `-` si el neto es comprador (ej. compras de 1.724 y ventas de 686 => -1038), positivo `+` si el neto es vendedor. Si no consta el detalle, usar la variación del saldo de balance.
  3. `Recompras`: Desembolso en recompra de acciones propias (signo negativo `-`).
  4. `Desinversiones`: Cobros por venta de negocios, marcas o activos (signo positivo `+`).
  5. `Adquisiciones`: Pagos por compra de negocios o empresas (signo negativo `-`).
  6. `Caja`: Variación de tesorería del balance de cierre anual (negativo `-` si la caja aumentó, positivo `+` si disminuyó).
  7. `Deuda`: Variación de deuda total en balance durante el ejercicio (positivo `+` si la deuda creció, negativo `-` si se amortizó).
  8. `En total`: Suma algebraica de todas las partidas.

- **Veredicto Analítico de Cuadre**:
  - Al pie se emite el veredicto con criterio profesional (ej. *"No cuadra del todo, pero más o menos ha gastado todo lo que estaba libre en recompras."* o *"El resultado cuadra razonablemente."*).

---

## 3. PARTE II — Conclusión e Indagación a Fondo en Puntos Críticos

En los análisis anuales es **obligatorio** profundizar rigurosamente en los motores estratégicos y financieros de la empresa, incorporando **capturas visuales del filing oficial de la SEC** en cada sección relevante:

```
                            INDAGACIÓN A FONDO
                                    │
    ┌─────────────────┬─────────────┴───────────────┬────────────────┐
    ▼                 ▼                             ▼                ▼
1. RECOMPRAS     2. OUTLOOK                   3. DEUDA         4. ADQUISICIONES
 + Captura SEC    + Captura SEC                + Captura SEC    (si aplican)
```

---

### 1. Recompras de Acciones (Share Repurchases)

Se debe realizar un examen exhaustivo de la política de recompra de títulos de la compañía:

- **Análisis Obligatorio**:
  1. **Programas Aprobados y Plazos**:
     - Fecha de autorización del programa por el Consejo de Administración.
     - Importe total autorizado originalmente (ej. programa de 2.000 M$).
     - Ampliaciones o nuevos programas anunciados recientemente (ej. ampliación de otros 2.000 M$ en febrero de 2026).
     - Importe total acumulado del programa (ej. 4.000 M$ en total).
     - Horizonte temporal o fecha límite de vigencia (ej. vigente hasta diciembre de 2031).
  2. **Saldo Remanente**:
     - Importe monetario exacto que queda pendiente por ejecutar del programa autorizado (ej. quedan ~2.600 M$ disponibles).
  3. **Evolución del Número de Acciones y Precio Medio**:
     - Número de acciones en circulación al inicio del periodo o ventana multianual vs cierre actual (ej. 213 M de acciones en dic-2023 vs 190,8 M en dic-2025).
     - Reducción porcentual de acciones (ej. contracción del 10,5 % en el recuento de acciones).
     - Precio medio pagado por título recomprado en el ejercicio ($\text{Gasto total en recompras} / \text{Acciones recompradas}$).
  4. **Impacto Cuantitativo en el BPA**:
     - Aumento porcentual del BPA atribuible de forma matemática a la reducción de acciones (ej. *"el BPA ha subido un 11,6 % en los últimos dos años exclusivamente por la menor base accionarial"*).
  5. **Proyección Futura de Retorno**:
     - Impacto anual esperado en el BPA si la acción cotiza a niveles actuales y la compañía continúa reinvirtiendo su flujo libre en recompras (ej. *"al precio actual de ~50 $ podemos esperar un impulso de aproximadamente el 6 % anual en el BPA"*).

- **Captura SEC Obligatoria (tabla multianual)**:
  - Debe incluirse un extracto oficial con el detalle del programa y la ejecución de los últimos ejercicios.
  - **Formato canónico**: una columna por ejercicio fiscal (mínimo 3 años, hasta 5) con las filas **"Shares repurchased"**, **"Aggregate cost (in millions)"** y **"Average price paid (in $)"** (precio medio = coste agregado / acciones recompradas).
  - Si el 10-K no trae una tabla propia de recompras, la serie anual se construye con la línea **"Repurchases of common stock" del estado de flujos de caja** (el agente la recibe completada desde XBRL de la SEC); **"Shares repurchased"** y **"Average price paid (in $)"** se añaden cuando el filing o el XBRL de la SEC aportan el número de títulos (el sistema calcula el precio medio = coste / acciones). La tabla muestra además el remanente de autorización del último ejercicio. Queda prohibido mostrar una tabla de un solo año cuando existan datos de varios ejercicios y queda prohibido inventar acciones o precios medios que no consten.
  - En la captura deben marcarse o resaltarse en amarillo/naranja las cifras clave (autorización en $B, acciones recompradas y coste agregado).
  - Los términos del programa (importe autorizado, fecha de autorización, vigencia y remanente) deben quedar reflejados en la narrativa y en los bullets.

---

### 2. Outlook y Perspectivas Futuras (Guidance)

Se analiza con detalle la guía formal que la dirección traslada al mercado para el siguiente ejercicio fiscal.

> **Fuente documental**: si el 10-K no incluye el guidance, este se extrae del **comunicado/presentación de resultados del 8-K** asociado (documento complementario que el analista recibe junto al 10-K). El análisis debe combinar ambas fuentes: las cuentas del 10-K tienen prioridad para las cifras históricas y el 8-K/presentación para las metas futuras.

- **REGLA DE FORMATO EN NEGRITA (OBLIGATORIA)**:
  - En la redacción del texto de outlook, análisis de FCF, riesgos y programas de ahorro, **todos los números, cifras clave, porcentajes, importes monetarios y conceptos más importantes deben ir SIEMPRE en negrita con Markdown (`**...**`)**.
  - Ejemplos obligatorios: `**flat +/- 1 %**`, `**-15 % al -18 %**`, `**-11 % al -15 %**`, `**1.100M +/- 10 %**`, `**650M +/- 5 %**`, `**720M +/- 5 %**`, `**376M**`, `**450M en 3 años (2026-2028)**`, `**~5 % anual**`, `**22 % al 24 %**`, `**aluminio (Midwest Premium)**`.

- **Análisis Obligatorio**:
  1. **Previsiones de la Cuenta de Resultados**:
     - Crecimiento de ingresos / ventas a divisa constante (*Net Sales Revenue Growth, Constant Currency*), indicando el porcentaje y **su equivalencia en cifra de ventas ($M)** frente al año anterior.
     - Evolución esperada de Beneficio antes de impuestos (EBT / *Income Before Taxes*), indicando porcentaje y **rango proyectado en número ($M)** vs el EBT cerrado del año anterior.
     - Previsión de Beneficio Por Acción diluido (*Diluted EPS*), indicando porcentaje y **BPA proyectado en dólares ($/acc)** frente al BPA anterior.
     - Efecto combinado: cómo interactúa la caída o subida operativa del negocio con el efecto amortiguador de las recompras de acciones en el BPA final.
  2. **Previsiones de Flujo de Caja y Solvencia**:
     - Previsión de Free Cash Flow (FCF) reportada en el guidance (ej. **1.100 M$ ± 10 %**), indicando la **horquilla numérica resultante en caja (~990M – 1.210M $)** y **comparándola con el FCF conseguido el año pasado**.
     - Previsión de CAPEX comprometido (ej. **650 M$ ± 5 %** -> **~618M – 683M $**) frente al CAPEX ejecutado el año anterior.
     - Evaluación de holgura: margen resultante de caja libre para cubrir sobradamente el dividendo y las recompras previstas.
  3. **Sensibilidad a Factores Macroeconómicos y Materias Primas**:
     - Impacto de costes específicos del sector (ej. encarecimiento del aluminio, cebada cervecera, energía, logística y fletes).
     - Riesgos geopolíticos, arancelarios o repuntes de inflación.
     - Estimación de compresión de márgenes operativos si los costes se disparan (ej. márgenes pasando del 15 % al 10 %).
  4. **Planes de Eficiencia y Ahorro**:
     - Programas de reestructuración o contención de costes anunciados por la dirección (ej. plan de ahorro de costes de **450 M$ para los próximos 3 años**).

- **Captura / Tabla SEC Obligatoria del Guidance ("secSnippet" / "secTable")**:
  - La tabla del guidance DEBE incluir **4 columnas obligatorias**:
    1. **`Métrica`**: Nombre de la partida oficial (Net Sales Revenue Growth, Underlying EBT, Diluted EPS, Free Cash Flow, CAPEX, etc.).
    2. **`[AÑO-1] (Año anterior)`**: **SIEMPRE poner al lado el valor real que se consiguió el año pasado** (obtenido del 10-K: ventas cerradas, EBT cerrado, BPA cerrado, FCF del estado de flujos de caja, CAPEX cerrado, intereses cerrados, etc.).
    3. **`Guidance [AÑO]E*`**: La meta oficial cuantitativa comunicada por la dirección (ej. `Flat +/- 1 %`, `-15% to -18% Decline`, `$1.1B +/- 10%`).
    4. **`Cifra Proyectada [AÑO]E`**: **Cuando pone flat y los porcentajes, poner al lado cuánto es en ventas o en número**, es decir, el cálculo en valor absoluto ($/M) proyectado para el nuevo año (ej. si ventas fueron 11.141M$ y la guía es Flat +/- 1%, poner `~$11.030M – $11.252M $`; si EBT fue 1.402M$ y la guía es -15% a -18%, poner `~$1.150M – $1.192M $`; si FCF es $1.1B +/- 10%, poner `~$990M – $1.210M $`).
  - **Queda terminantemente prohibido dejar filas con 'flat' o porcentajes sin calcular la cifra monetaria en ventas/número al lado, y queda prohibido omitir el valor del año pasado**.

  *Estructura de referencia de la tabla de guidance*:
  | Métrica | 2025 (Año anterior) | Guidance 2026E* | Cifra Proyectada 2026E |
  | :--- | :--- | :--- | :--- |
  | Net Sales Revenue Growth, Constant Currency | $11.141M | Flat +/- 1% | ~$11.030M – $11.252M |
  | Underlying Income Before Income Taxes | $1.402M (adj) | -15% to -18% Decline | ~$1.150M – $1.192M |
  | Underlying Diluted EPS Growth | $5.80 | -11% to -15% Decline | ~$4.93 – $5.16 |
  | Underlying Free Cash Flow | $1.068M / $1.258M (adj) | $1.1B +/- 10% | ~$990M – $1.210M |
  | Underlying Depreciation & Amortization | $705M | $720M +/- 5% | ~$684M – $756M |
  | Underlying Net Interest Expense | $230M | $260M +/- 5% | ~$247M – $273M |
  | Capital Expenditures Incurred | $717M | $650M +/- 5% | ~$618M – $683M |

---

### 3. Deuda y Calendario de Vencimientos (Debt Maturity Profile)

Examen en profundidad de la estructura de capital, la evolución de la deuda normal vs neta, el calendario contractual y el impacto en BPA de cualquier refinanciación:

- **Regla de Formato y Visualización (Obligatoria)**:
  - **Negrita obligatoria**: En la redacción del análisis de deuda, poner SIEMPRE en negrita con Markdown (`**...**`) todas las cifras, importes monetarios, porcentajes, tipos de interés, impactos en BPA y años. Optimizado para visualización limpia y elegante en la exportación a PDF, HTML y documentos ofimáticos.

- **1. Diagrama de Barras del Calendario de Vencimientos (Próximos 5 Años)**:
  - **Ventana temporal estricta**: Solamente se muestran los **próximos 5 años** a partir del ejercicio cerrado, con el importe que vence en cada uno de ellos (etiqueta en negrita sobre cada barra). Los vencimientos posteriores al año 5 se resumen aparte como "Después del año 5" y quedan estrictamente excluidos del gráfico.
  - **Bloques coloreados por tipo de deuda**: Si hay varios tipos de obligación (Senior Notes, Commercial Paper, Term Loans, etc.), cada uno se representa con un color diferenciado dentro de la barra apilada anual. Si solo hay un tipo, la barra es naranja, igual que el gráfico de acciones.
  - **Tipo de interés en cada bloque**: En cada bloque de deuda se indica explícitamente su tipo de interés cupón (ej. `3,00 %`, `3,44 %`) cuando la compañía lo desglosa. Si un año tiene una sola barra, su tipo medio se muestra dentro de la barra; si tiene varias, el cupón va dentro de cada subbloque.
  - **Tipo de interés medio anual**: En cada barra anual se calcula y muestra el **tipo de interés medio ponderado** que la empresa paga por las deudas que vencen en dicho año:
    $$\text{Tipo Medio Anual} = \frac{\sum (\text{Importe}_i \times \text{Tipo}_i)}{\sum \text{Importe}_i}$$
  - **Tipo de interés medio total**: En la base o pie del gráfico se indica el **tipo de interés medio ponderado global** que se paga en el conjunto total de la deuda.
  - **Sin cupones desglosados**: Si la nota de deuda solo publica rangos de cupón por categorías (ej. `3,000 % – 7,125 %`) o no publica tipos, se usa el **tipo medio estimado** que calcula el sistema a partir de los rangos ponderados o del gasto financiero sobre la deuda media. Ese valor se rotula siempre como estimado (`~` y la palabra "estimado") y se explica su base; nunca se presenta como un cupón exacto. Los cupones exactos solo se afirman cuando el 10-K los desglosa.
  - **Vencimientos**: El calendario del gráfico usa SIEMPRE la tabla oficial de **principal** por ejercicio de la nota de deuda (o su equivalente XBRL de la SEC). La tabla de "Material Cash Requirements" del MD&A incluye intereses y no debe usarse como si fuera principal.

- **2. Gráfico de Barras de Evolución Histórica de 10 Años (Deuda Normal vs Deuda Neta)**:
  - Gráfico de barras dual con los últimos **10 años hasta la actualidad** que enfrenta la **Deuda Normal (Deuda Financiera Total)** contra la **Deuda Neta**.
  - **Variación vs año anterior ($\Delta$)**: En cada ejercicio se calcula y muestra cuánto ha cambiado la deuda normal y la deuda neta respecto al año precedente (en $M y en porcentaje), resaltando en verde las reducciones de deuda y en rojo los incrementos.

- **3. Refinanciación de Deuda y Cálculo del Impacto en el BPA**:
  - Si la compañía ha refinanciado deuda en el ejercicio o debe refinanciar vencimientos inmediatos:
    - **Tipo de la deuda vendida/retirada**: Se indica qué tipo de interés pagaba la deuda amortizada o vendida (ej. `3,00 %`).
    - **Tipo de la nueva deuda emitida**: Se indica qué tipo de interés gasta la nueva deuda colocada en mercado (ej. `5,25 %`).
    - **Cálculo del Impacto en el BPA ($/acción)**:
      $$\Delta \text{Gastos por Intereses Brutos} = \text{Importe Refinanciado} \times (\text{Tipo nuevo} - \text{Tipo anterior})$$
      $$\Delta \text{Intereses Netos (post-impuestos)} = \Delta \text{Gastos por Intereses} \times (1 - t)$$
      $$\Delta \text{BPA ($/acción)} = -\frac{\Delta \text{Intereses Netos}}{\text{Acciones en Circulación}}$$
      *(Ejemplo explicativo en el informe: "los nuevos costes bajan en torno a 0,05 $/acción" o "los mayores costes reducen el BPA en torno a 0,09 $/acción")*.

- **4. Captura SEC Obligatoria**:
  - Debe incluirse la tabla o extracto oficial de la **Nota de "Debt Obligations"** del 10-K (*Contractual Maturities of Long-Term Debt*) con obligaciones, vencimientos y saldos auditados.

---

### 4. Adquisiciones y Operaciones Corporativas (si existen)

Si la compañía ha realizado adquisiciones durante el ejercicio analizado:

- Detalle del negocio, marca o división adquirida.
- Importe económico desembolsado y forma de financiación (caja propia, asunción de deuda o ampliación de capital).
- Múltiplos implícitos de valoración y encaje estratégico dentro del portfolio de la empresa.
- Si no se produjeron adquisiciones materiales ($\ge 50\text{M}$), se indicará expresamente que el ejercicio ha estado libre de operaciones inorgánicas.

---

### 5. Puntos Clave a Vigilar para el Próximo Ejercicio (Watchlist)

Al término de la indagación a fondo, se redacta una lista numerada concisa de **2 a 4 factores críticos** de seguimiento para el inversor.

*(Ejemplo canónico)*:
```text
Por lo tanto, cosas a tener en cuenta en 2026:
1: Evolución de los beneficios y volúmenes en comparación con otras empresas del sector.
2: Ritmo y precio medio de ejecución de las recompras de acciones.
3: Refinanciación de la deuda que vence y coste efectivo de los nuevos intereses.
```

---

### 6. Puntos Condicionales Adicionales (según materialidad)

Además de los puntos canónicos 1-4, la Parte II incorpora —siempre **después de Adquisiciones y antes de la Watchlist**— cualquier punto crítico que aparezca con materialidad en el 10-K (umbral de referencia: **≥ 50 M$** o relevancia estratégica, mismo criterio que en la Asignación de Capital). Si un punto no aplica, simplemente no aparece; la Watchlist cierra siempre la Parte II.

- **6.1 Dividendos**: evolución del dividendo por acción y del total pagado, política de payout, cobertura por FCF, racha de años consecutivos de subida (o recortes) y dividendo extraordinario si existe.
- **6.2 Desinversiones / venta de marcas o negocios**: aplicando la regla 6 trimestral portada al ejercicio anual (beneficio estimado del negocio vendido, PER implícito, comparación de márgenes, juicio sobre la operación e impacto en caja).
- **6.3 Impairments de goodwill / marcas**: activos deteriorados, importe, causa declarada, recurrencia del deterioro y su efecto en el Beneficio Operativo ajustado.
- **6.4 Reestructuraciones y planes de ahorro de costes**: plantas y funciones afectadas, importe total del programa, ahorro anual esperado, costes de ejecución y calendario. Si el plan solo se anuncia dentro del guidance, se analiza en Outlook (punto 2.4) sin punto propio.
- **6.5 Litigios, contingencias y seguridad de producto**: demandas materiales (PFAS, talco, pesticidas...), retiradas de producto (*recalls*), provisiones constituidas y exposición estimada.
- **6.6 Impuestos**: tipo efectivo anómalo, controversias fiscales abiertas (ej. disputa con el IRS) y su exposición potencial en caja.
- **6.7 Pensiones / OPEB**: estado de financiación del plan, déficit o aportaciones relevantes cuando el 10-K las señala.
- **6.8 Concentración de clientes y cadena de suministro**: clientes que suponen > 10 % de las ventas (ej. Walmart) y dependencias críticas de suministro manifestadas en el filing.
- **6.9 Cambio de CEO / dirección**: si durante el ejercicio (o anunciado para el siguiente) hay relevo en el CEO, CFO u otra figura clave:
  - Quién sale y quién entra, fecha efectiva y trayectoria del entrante.
  - Contexto del relevo: sucesión planificada, dimisión, despido o salto a otra compañía.
  - Continuidad estratégica: cambios de rumbo ya anunciados por el entrante (portfolio, estructura, prioridades de capital).
  - Costes asociados observables: compensaciones de salida (*severance*) u otros importes relevantes.
  - Juicio breve del analista (positivo/negativo/neutro) fundamentado solo en hechos del filing; prohibido especular sobre resultados futuros.
  - Si no hubo cambios relevantes, este punto no aparece.

---

## 4. PARTE III — NOTA DE RESULTADOS (1 a 10)

Al cierre del informe anual, se emite una calificación numérica única:

$$\mathbf{NOTA\ DE\ RESULTADOS:\ [1-10]}$$

*(Ejemplo: `NOTA DE RESULTADOS: 3`)*.

### Reglas Estrictas para la Asignación de la Nota:

1. **Nota Puramente Financiera**:
   - La nota evalúa con rigor técnico la solidez, rentabilidad, calidad del flujo de caja, solvencia y decisiones del ejercicio analizado combinadas con el escenario oficial planteado por la compañía.
   - **Factores que determinan la nota**:
     - *Cuentas del año*: Crecimiento orgánico frente a contracción, márgenes brutos y operativos, conversión de beneficio a FCF real, saneamiento de circulante.
     - *Outlook oficial*: Previsiones cuantitativas oficiales aportadas por la dirección (guía de ventas, EBT, BPA y FCF).
     - *Decisiones corporativas*: Eficiencia en la asignación de capital (recompras a múltiplos razonables, política de dividendos, gestión prudente del calendario de vencimientos de deuda).

2. **PROHIBICIÓN EXPRESA DE ESPECULACIÓN**:
   - **Queda terminantemente prohibido calificar o modificar la nota especulando sobre si la empresa será capaz o no de cumplir las expectativas de su propio guidance**.
   - No se valora la credibilidad subjetiva de los directivos ni la fe del analista en que batan o fallen las previsiones.
   - La nota valora la **realidad objetiva de las cuentas cerradas** y las **cifras del outlook formalmente publicado**, considerando esas proyecciones como el escenario base expuesto por la compañía.

---

## 5. Protocolo de Capturas y Extractos Visuales de la SEC

Para dar respaldo documental y valor visual a la Parte II:

1. **Procedencia Documental**:
   - Las capturas deben extraerse de los documentos oficiales presentados ante la SEC (**Form 10-K** y/o comunicado oficial de resultados anuales / *Earnings Release* en el Form 8-K).
2. **Ubicación en el Informe**:
   - Cada captura debe insertarse inmediatamente después del texto introductorio de su respectivo apartado (**Recompras**, **Outlook**, **Deuda**).
3. **Resaltado Focal**:
   - En las tablas o textos capturados se marcarán los datos cruciales (importes de los programas de recompras, tabla de guidance, calendario de vencimientos contractuales).
4. **Comentarios de Apoyo**:
   - El texto del informe debe dialogar directamente con la captura (ej. *"Como se puede ver en la tabla adjunta de deuda..."*, *"En el cuadro de guidance de 2026 se observa..."*).

---

## 6. Formato Numérico y Convenciones de Estilo

- **Prohibición de redondeo**: Todas las cifras deben ser **exactas**, copiadas tal cual de los estados financieros y del JSON de extracción (que el sistema completa desde el XBRL de la SEC). Queda terminantemente prohibido redondear o estimar cifras reportadas (ej. no escribir `4500M` si la cifra es `4462M`, ni `800M` si es `801M`, ni `1900M` si es `1898M`). Si una cifra no consta en ninguna fuente, se indica que no consta; nunca se sustituye por una aproximación redondeada.
- **Moneda**: Millones de dólares estadounidenses con sufijo **`M`** (ej. `13040M`, `2300M`). Símbolo **`$`** para precios y ratios por acción (ej. `5,69 $`, `50 $`). Para miles de millones en texto libre se puede usar `M` o `millones de $`.
- **Porcentajes**: Con **coma decimal** y signo explícito.
  - Positivos en **verde** (`#16a34a`).
  - Negativos en **rojo** (`#dc2626`).
- **Negrita**: Cifras de las columnas **`Ajustado`** y **`Normal`** siempre en negrita en las tablas de la Parte I.
- **Paleta Cromática de Notas en Parte I**:
  - Nota 1: Amarillo flúor (`#fef08a`)
  - Nota 2: Naranja (`#fed7aa`)
  - Nota 3: Verde lima (`#bbf7d0`)
  - Nota 4: Morado / Malva (`#e9d5ff`)
  - Nota 5: Celeste pastel (`#bae6fd`)
  - Nota 6: Rosa pastel (`#fbcfe8`)
- **Tono y Redacción**: Analista financiero sénior independiente, analítico, crítico, pedagógico y transparente.
