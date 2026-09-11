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
    $$\text{WK}_{\text{caja, anual}} = (\text{Inventarios} + \text{Cuentas por cobrar} - \text{Cuentas por pagar}) \times (\text{Inflación} + \text{volumen})$$
    *(O su formulación equivalente de impacto en caja $(\text{Cuentas por pagar} - \text{Inventarios} - \text{Cuentas por cobrar}) \times (\text{inflación} + \text{volumen})$)*.
  - La diferencia entre el WC reportado y el teórico se ajusta en el Cash Flow.
  - **Ajuste fiscal del Cash Flow**: Si los impuestos en efectivo efectivamente pagados difieren del gasto devengado normalizado, se descuenta o suma la diferencia exacta en el Cash Flow Ajustado.
  - La nota explicativa al pie detalla minuciosamente ambos ajustes (circulante e impuestos).

---

### Bloque 3 — ASIGNACIÓN DE CAPITAL

- **Filas obligatorias según materialidad ($\ge 50\text{M}$)**:
  1. `Libre`: Toma el valor resultante de la fila Libre del Bloque 2.
  2. `Inversiones a corto plazo`: Variación anual de valores negociables (signo negativo `-` si se compraron inversiones, positivo `+` si se liquidaron).
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

- **Captura SEC Obligatoria**:
  - Debe incluirse una captura o extracto visual recortado de la sección del 10-K donde figura el detalle del programa: **Nota de "Share Repurchase Program"** o tabla de **"Stockholders' Equity" / Item 5 de recompras mensuales**.
  - En la captura deben marcarse o resaltarse en amarillo/naranja las cifras clave (autorización en $B, acciones recompradas y coste agregado).

---

### 2. Outlook y Perspectivas Futuras (Guidance)

Se analiza con detalle la guía formal que la dirección traslada al mercado para el siguiente ejercicio fiscal:

- **Análisis Obligatorio**:
  1. **Previsiones de la Cuenta de Resultados**:
     - Crecimiento de ingresos / ventas a divisa constante (*Net Sales Revenue Growth, Constant Currency*).
     - Evolución esperada de Beneficio antes de impuestos (EBT / *Income Before Taxes*).
     - Previsión de Beneficio Por Acción diluido (*Diluted EPS*).
     - Efecto combinado: cómo interactúa la caída o subida operativa del negocio con el efecto amortiguador de las recompras de acciones en el BPA final.
  2. **Previsiones de Flujo de Caja y Solvencia**:
     - Previsión de Free Cash Flow (FCF) reportada en el guidance (ej. 1.100 M$ ± 10 %).
     - Previsión de CAPEX comprometido (ej. 650 M$ ± 5 %).
     - Evaluación de holgura: margen resultante de caja libre para cubrir sobradamente el dividendo y las recompras previstas.
  3. **Sensibilidad a Factores Macroeconómicos y Materias Primas**:
     - Impacto de costes específicos del sector (ej. encarecimiento del aluminio, cebada cervecera, energía, logística y fletes).
     - Riesgos geopolíticos, arancelarios o repuntes de inflación.
     - Estimación de compresión de márgenes operativos si los costes se disparan (ej. márgenes pasando del 15 % al 10 %).
  4. **Planes de Eficiencia y Ahorro**:
     - Programas de reestructuración o contención de costes anunciados por la dirección (ej. plan de ahorro de costes de 450 M$ para los próximos 3 años).

- **Captura SEC Obligatoria**:
  - Debe incluirse la captura visual de la tabla oficial de **"2026 GUIDANCE / FULL YEAR OUTLOOK"** o el extracto correspondiente del comunicado oficial presentado ante la SEC / Item 7 (MD&A).
  - En la captura deben resaltarse los rangos de crecimiento, FCF previsto, CAPEX y tipo impositivo esperado.

---

### 3. Deuda y Calendario de Vencimientos (Debt Maturity Profile)

Examen en profundidad de la salud del pasivo y de la capacidad de refinanciación de la empresa:

- **Análisis Obligatorio**:
  1. **Diagnóstico de Deuda Neta**:
     - Evolución de la deuda neta en el año y grado de apalancamiento sobre el FCF / EBITDA.
  2. **Calendario de Vencimientos Contractuales (*Debt Maturity Profile*)**:
     - Detalle de los vencimientos de deuda a corto, medio y largo plazo por anualidades.
  3. **Análisis Crítico del Muro de Vencimiento Próximo (Próximos 12-24 meses)**:
     - Cuantía exacta de la deuda que vence en el siguiente ejercicio (ej. en 2026 vencen ~2.300 M$).
     - Desglose por tramos de emisión, divisas (USD, EUR, CAD) y tipos de interés actuales (ej. notas al 3,00 % y al 3,44 %).
  4. **Coste Estimado de Refinanciación e Impacto Financiero**:
     - Diagnóstico de la probabilidad de refinanciación según la solvencia de la empresa.
     - Estimación del nuevo tipo de interés de mercado aplicable a la refinanciación (ej. estimación del 5 % frente al 3 % actual).
     - **Cálculo explícito del sobrecoste en intereses**:
       $$\Delta \text{Gastos por Intereses} = \text{Deuda a refinanciar} \times (\text{Tipo nuevo} - \text{Tipo actual})$$
       *(Ejemplo exacto: $2300\text{M} \times (5\% - 3\%) = 2300\text{M} \times 0,02 = +46\text{M}$ anuales adicionales de intereses; incremento de $230\text{M} \rightarrow 276\text{M}$)*.
  5. **Contraste con el Guidance Oficial**:
     - Comprobar si la previsión de gastos por intereses (*Underlying Net Interest Expense*) reflejada por la directiva en el Outlook (ej. 260 M$ ± 5 %) ya contempla e internaliza este mayor coste de refinanciación.

- **Captura SEC Obligatoria**:
  - Debe incluirse la captura visual de la **Nota de "Debt Obligations"** del 10-K y/o el gráfico/tabla de **"Debt Maturity Profile"** del informe oficial.
  - En la captura deben destacarse los importes vencidos, fechas de vencimiento y tipos cupón correspondientes.

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
