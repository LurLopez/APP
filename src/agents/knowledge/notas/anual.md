# Reglas de las Notas e Indagación a Fondo (10-K)

> Nivel 1 — Parte cualitativa del análisis anual (Form 10-K): indagación a fondo, conclusiones y nota de resultados. La parte financiera se rige por `financiero/general.md`.
> Documento de referencia canónico: `anual/ejemplos/TAP 2025_ANNUAL ANÁLISIS_ES.pdf`.
>
> Versión: 0

---

## 1. Indagación a Fondo en Puntos Críticos (Parte II del informe anual)

En los análisis anuales es **obligatorio** profundizar rigurosamente en los motores estratégicos y financieros de la empresa, incorporando **capturas visuales del filing oficial de la SEC** en cada sección relevante:

```
                            INDAGACIÓN A FONDO
                                    │
    ┌─────────────────┬─────────────┴───────────────┬────────────────┐
    ▼                 ▼                             ▼                ▼
1. RECOMPRAS     2. OUTLOOK                   3. DEUDA         4. OPERACIONES
 + Captura SEC    + Captura SEC                + Captura SEC    CORPORATIVAS
                                                                 (si aplican)
```

---

### 1. Recompras de Acciones (Share Repurchases)

> **Criterio de aparición (materialidad)**: el punto de Recompras solo se incluye en la Parte II si es relevante. Se considera relevante cuando se cumple al menos una de estas condiciones:
> 1. Las acciones recompradas en el ejercicio suponen **≥ 1 % de las acciones en circulación** (equivalente aproximado a ≥ 1 % de la capitalización).
> 2. Se ha **lanzado un nuevo programa** de recompra o una ampliación relevante del vigente durante el ejercicio.
> 3. El programa se ha **cancelado, suspendido o terminado** en el ejercicio.
>
> Si las recompras son marginales (< 1 % del capital) y no hay cambios de programa, el punto **no aparece**. Si no hay datos de acciones para calcular el porcentaje, se mantiene el umbral de importe material (≥ 50 M$).

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
  - **Vencimientos**: El calendario del gráfico usa SIEMPRE la tabla oficial de **principal** por ejercicio de la nota de deuda (o su equivalente XBRL de la SEC). La tabla de "Material Cash Requirements" del MD&A incluye intereses y no debe usarse como si fuera principal. El calendario incluye **solo notas**: los arrendamientos financieros se excluyen y, si no hay vencimientos de notas en los próximos 5 años, no se genera calendario ni tabla de respaldo.

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

### 4. Operaciones Corporativas (si existen)

La sección es un único relato, titulado **Operaciones corporativas**, con un bloque por tipo de operación presente (encabezado en negrita dentro del texto). Se explica **qué ha pasado con la información que proporciona el 10-K**: hechos, fechas, motivos declarados por la dirección, importes, tamaño del negocio e impacto esperado o real. Las cifras y detalles salen exclusivamente del 10-K (notas de adquisiciones/desinversiones, MD&A, resultados discontinuados) y del 8-K/presentación complementaria.

- **Adquisiciones** (si hay compras materiales, $\ge 50\text{M}$): detalle del negocio, marca o división adquirida; importe desembolsado y forma de financiación (caja propia, asunción de deuda o ampliación de capital); múltiplos implícitos de valoración cuando se puedan calcular; sinergias y encaje estratégico dentro del portfolio; impacto esperado en resultados y BPA.
- **Desinversiones y ventas de participaciones significativas** (umbral: la operación supone **≥ 5 % de los ingresos consolidados** del ejercicio, **≥ 5 % del capital de la sociedad participada** o **≥ 50M$** cobrados): qué negocio, marca, activo o participación se vende y a quién si consta; porcentaje del capital vendido y peso sobre los ingresos; importe cobrado y matices (plusvalía o pérdida contable prevista, consideración aplazada, deuda traspasada); motivo declarado; efecto en caja, deuda y resultados, incluida la reclasificación a resultados discontinuados. Se aplica el juicio de la regla sectorial de desinversiones (PER implícito, márgenes del negocio vendido frente al consolidado).
- **Spin-offs y separaciones anunciadas**: sociedad o división que se separa; estado (solo anunciado, en curso o completado); fecha de anuncio y fecha esperada o efectiva; estructura prevista (distribución a accionistas libre de impuestos, escisión, OPV, fusión); peso del negocio separado sobre los ingresos si consta; motivo declarado; impacto esperado (deuda que se traspasa, costes de separación, sinergias, efecto en dividendo y BPA). Basta con que esté **anunciado** en el ejercicio o para el siguiente: es un hecho relevante y se explica.
- **Reestructuraciones y planes de ahorro materiales**: qué plan se anunció o ejecutó y qué plantas, marcas, funciones o geografías afecta; fecha de anuncio; coste total previsto y cargos ya reconocidos en el ejercicio; ahorro anual esperado y plazo (si forma parte del guidance, se indica); empleados afectados si consta; motivo declarado e impacto esperado en resultados y márgenes.
- **Regla del ejercicio**: cada bloque se refiere exclusivamente al ejercicio analizado o a operaciones anunciadas para el siguiente. Queda prohibido presentar una operación del ejercicio anterior como si fuera del año analizado.
- **Umbral global**: si no hubo operaciones corporativas materiales, se indica expresamente que el ejercicio no registró operaciones corporativas materiales.

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

Además de los puntos canónicos 1-4, la Parte II incorpora —siempre **después de Operaciones Corporativas y antes de la Watchlist**— cualquier punto crítico que aparezca con materialidad en el 10-K (umbral de referencia: **≥ 50 M$** o relevancia estratégica, mismo criterio que en la Asignación de Capital). Si un punto no aplica, simplemente no aparece; la Watchlist cierra siempre la Parte II.

**Excepción de posición**: los **Cambios en la dirección (6.7)** son un punto propio que se coloca **inmediatamente después de Recompras**, antes de Outlook, por su relevancia estratégica. El resto de puntos condicionales (6.1–6.6) van después de Operaciones Corporativas.

- **6.1 Dividendos**: evolución del dividendo por acción y del total pagado, política de payout, cobertura por FCF, racha de años consecutivos de subida (o recortes) y dividendo extraordinario si existe.
- **6.2 Impairments de goodwill / marcas**: activos deteriorados, importe, causa declarada, recurrencia del deterioro y su efecto en el Beneficio Operativo ajustado.
- **6.3 Litigios, contingencias y seguridad de producto**: demandas materiales (PFAS, talco, pesticidas...), retiradas de producto (*recalls*), provisiones constituidas y exposición estimada.
- **6.4 Impuestos**: tipo efectivo anómalo, controversias fiscales abiertas (ej. disputa con el IRS) y su exposición potencial en caja.
- **6.5 Pensiones / OPEB**: estado de financiación del plan, déficit o aportaciones relevantes cuando el 10-K las señala.
- **6.6 Concentración de clientes y cadena de suministro**: clientes que suponen > 10 % de las ventas (ej. Walmart) y dependencias críticas de suministro manifestadas en el filing.
- **6.7 Cambios en la dirección (CEO, CFO u otro directivo de primer nivel)**: si durante el ejercicio (o anunciado para el siguiente) hay relevo en el CEO, el CFO (director financiero), el COO (director de operaciones), el presidente u otro directivo de primer nivel:
  - **Directivo saliente**: quién era (nombre, cargo y periodo en el poder), cómo evolucionaron las ventas durante su mandato (cifras y variación porcentual), qué políticas implementó (reestructuraciones, adquisiciones o desinversiones, dividendos, recompras, cambios de estrategia o de cartera de marcas) y a dónde pasa ahora (jubilación, presidencia del consejo, otra compañía; si no consta, se indica "No consta").
  - **Directivo entrante**: nombre, de dónde viene (empresa, puesto y periodo), qué ha hecho en puestos directivos anteriores (con fechas y resultados concretos: evolución de ventas y márgenes, reestructuraciones, recuperaciones; ejemplo de estilo: "fue directivo de HRL entre 2015 y 2017, cuando la compañía estaba estancada y los márgenes empeoraban; ejecutó una reestructuración que recuperó parcialmente los márgenes y logró que las ventas crecieran en línea con la inflación") y qué ha dicho que va a hacer (compromisos y prioridades anunciadas).
  - Contexto del relevo: sucesión planificada, dimisión, despido o salto a otra compañía; costes asociados observables (*severance*) si constan.
  - **Fuentes y honestidad**: los hechos del filing tienen prioridad. Para la trayectoria del directivo se permite información pública general y conocida, pero queda prohibido inventar nombres, fechas o cifras; si no hay información fiable, se indica "No se dispone de información pública verificada".
  - Juicio breve del analista (positivo/negativo/neutro) fundamentado en los hechos; prohibido especular sobre resultados futuros de la compañía.
  - Si no hubo cambios relevantes, este punto no aparece.

---

## 2. Nota de Resultados (1 a 10, Parte III del informe anual)

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

## 3. Protocolo de Capturas y Extractos Visuales de la SEC

Para dar respaldo documental y valor visual a la Parte II:

1. **Procedencia Documental**:
   - Las capturas deben extraerse de los documentos oficiales presentados ante la SEC (**Form 10-K** y/o comunicado oficial de resultados anuales / *Earnings Release* en el Form 8-K).
2. **Ubicación en el Informe**:
   - Cada captura debe insertarse inmediatamente después del texto introductorio de su respectivo apartado (**Recompras**, **Outlook**, **Deuda**).
3. **Resaltado Focal**:
   - En las tablas o textos capturados se marcarán los datos cruciales (importes de los programas de recompras, tabla de guidance, calendario de vencimientos contractuales).
4. **Comentarios de Apoyo**:
   - El texto del informe debe dialogar directamente con la captura (ej. *"Como se puede ver en la tabla adjunta de deuda..."*, *"En el cuadro de guidance de 2026 se observa..."*).

