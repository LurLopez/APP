# Sector: Tecnología y Software (Information Technology)

> Nivel 2 — Reglas transversales aplicables a empresas de software empresarial, SaaS, cloud computing, ciberseguridad, plataformas tecnológicas, semiconductores y hardware.
> Versión: 1

---

## 1. Reglas de Ajuste Contable y Principios Específicos

1. **Doble visión Ajustado/Normal**: Toda métrica de la cuenta de resultados se presenta en dos columnas:
   - **Ajustado**: Excluye partidas extraordinarias y deterioros (*impairments*) no recurrentes de fondo de comercio, marcas o activos, normalizando impuestos. **La amortización recurrente de intangibles de vida finita NO se excluye**: permanece como coste (ver regla 3).
   - **Normal**: Cifras oficiales tal y como las reporta la empresa bajo US-GAAP.
   - Las diferencias entre ambas columnas se justifican en notas al pie (*1, *2...).

2. **Tratamiento Crítico de la Compensación en Acciones (SBC / Stock-Based Compensation)**:
   - En el sector tecnológico, muchas compañías publican beneficios operativos o BPA "Non-GAAP" inflando el resultado al excluir el pago de salarios y bonus en acciones a directivos y empleados.
   - **Regla Cifra**: La remuneración en acciones (SBC) es un **coste operativo real de personal** y representa una dilución patrimonial directa para el accionista existente.
   - En la columna **Ajustado**, el Beneficio Operativo y el Beneficio Neto **conservan íntegramente el coste de SBC**. Queda terminantemente prohibido sumar de vuelta el SBC para inflar el beneficio operativo ajustado.
   - En las notas explicativas y el análisis de Cash Flow y Asignación de Capital:
     * Se cuantifica el importe total de SBC del periodo y su porcentaje sobre ingresos (% de ventas).
     * Se evalúa si el programa de recompra de acciones reduce realmente el número de títulos en circulación o si se limita a esterilizar (*mopping up*) la dilución originada por el SBC a directivos.
      * **Ajuste del SBC en el Cash Flow Ajustado**: En el estado de flujos de caja, el SBC figura sumado al Cash Flow operativo como partida no monetaria. Sin embargo, al suponer una dilución efectiva del accionista y concederse con descuento, en la columna **Ajustado** del Cash Flow se deduce obligatoriamente el **importe íntegro reportado** de esta partida ($\text{Ajuste SBC} = -\text{SBC}$). Recalcula en cascada FCF, FCF/Acción y Libre, justificándose en la nota al pie correspondiente (`*2` o `*3`) con la conciliación matemática completa de ajustes. Al compartir la misma casilla de Cash Flow Ajustado que la normalización fiscal, ambas notas (`*2` y `*3`) comparten el mismo color de resalte oficial que la casilla.

3. **Amortización de Intangibles y Deterioros (Beneficio Operativo)**:
   - **Excepción a la regla general (Nivel 1)**: en tecnología, la amortización recurrente de intangibles de vida finita (tecnología desarrollada, relaciones con clientes, software comprado, patentes) **NO se suma de vuelta** al resultado operativo ajustado: permanece como coste en la columna Ajustado, porque refleja el desgaste anual real del activo que sostiene el producto (misma lógica que la remuneración en acciones/SBC). Queda prohibido ajustarla a 0 o restarla del resultado, y no genera nota al pie.
   - **Deterioro de intangibles (excepción específica)**: los deterioros (*impairments*) no recurrentes de activos intangibles, marcas u otros activos (no fondo de comercio, extraídos en `intangibleImpairment*`) **tampoco se suman de vuelta** al resultado operativo ajustado: en este sector el producto intangible pierde valor de forma real, por lo que el deterioro permanece como coste del periodo en la columna Ajustado. Queda prohibido revertirlo, ajustarlo a 0 o restarlo; no genera resalte ni llamada de nota propia (puede explicarse en una nota informativa que se mantiene como coste).
   - **Único ajuste permitido de deterioros**: el deterioro no recurrente de **fondo de comercio** (*goodwill*, extraído en `goodwillImpairment*`) **sí se excluye** del resultado operativo ajustado (se ajusta a 0) por no representar un consumo recurrente de caja ni el desgaste del producto (`goodwillImpairment*`, o la parte de fondo de comercio del total `impairments*` cuando no venga desglosado).
   - Aplica tanto al periodo actual como a la columna **Anterior Ajustado**: si en el periodo comparable anterior hubo deterioro de intangibles, tampoco se revierte en el comparativo (el Anterior Ajustado solo incorpora el deterioro de fondo de comercio si lo hubo).
   - **Casilla exclusiva de resalte**: El color de resalte y la llamada de nota (`*1`) se aplican **ÚNICAMENTE a la casilla de Beneficio Operativo cuando exista un deterioro de fondo de comercio**.
   - EBT y Beneficio Neto recalculan su importe en la columna Ajustado arrastrando el nuevo beneficio operativo sin colorearse ni duplicar la llamada por este concepto.

4. **Impuestos Normalizados (Beneficio Neto)**:
   - Se compara el impuesto reportado con el **23 % del EBT ajustado**.
   - Si la desviación relativa supera `-20 %` o `+20 %`, se normalizan los impuestos al 23 %: Beneficio Neto Ajustado = EBT Ajustado × 0,77.
   - Si la desviación está dentro de ±20 %, se mantiene el impuesto reportado efectivo.
   - **Casilla exclusiva de resalte**: La llamada (`*2`) y su color se aplican **ÚNICAMENTE a la casilla de Beneficio Neto**.

5. **Cash Flow, Ingresos Diferidos y Capital Circulante en Tecnología**:
   - En empresas tecnológicas (especialmente de software y suscripciones en la nube), el capital circulante suele diferir del modelo manufacturero tradicional: el inventario suele ser nulo o residual, y la partida clave es la de **Ingresos Diferidos / Pasivos por Contratos (*Deferred Revenue / Contract Liabilities*)**, que representan cobros anticipados por servicios aún no devengados.
   - El capital circulante teórico se estima con el **peso agregado histórico** del circulante sobre el flujo operativo sin circulante de los últimos 10 ejercicios (método único, común a todos los sectores admitidos):
     $$\text{WC}_{\text{teórico}} = \left( \frac{\sum \Delta WC}{\sum (\text{CFO} - \Delta WC)} \right)_{\text{últimos 10 ejercicios}} \times (\text{CFO} - \Delta WC)_{\text{periodo}}$$
     Ejemplo: CFO 80.000M con ΔWC −20.000M ⇒ base 100.000M y peso del −20 %. No aplica ninguna hipótesis de volumen plano ni de inflación sectorial: el sistema calcula la estimación de forma determinista (serie histórica de EDGAR) y la entrega en `workingCapitalData`.
   - El peso se aplica al flujo del horizonte analizado (el trimestre usa su propio flujo CFO − ΔWC; el acumulado YTD usa el suyo), sin prorrateos aritméticos.
   - En la cabecera de la tabla de Cash Flow se presentan los dos escenarios:
     * **`Normal (WC=valorBase)`**: Flujos con la variación de circulante reportada.
     * **`Ajustado*1 (WC=valorAjustado)`**: Flujos normalizados con el circulante teórico.
   - En las notas, se explica el impacto de los ingresos diferidos (*Deferred Revenue*) en la generación de caja operativa y si la caja libre ha estado dopada o deprimida por la estacionalidad de cobro de contratos anuales.

6. **Métricas Operativas del Sector en Texto y Comentario**:
   - **Intensidad de I+D (R&D Intensity)**: Relación entre gasto de I+D e ingresos. Un ratio elevado y sostenido es indispensable para defender fosos defensivos en software y semiconductores.
   - **Ingresos Recurrentes y Retención (ARR / NDR / Churn)**: Cuando se desglosen en el informe (10-Q/10-K), documentar el Annual Recurring Revenue (ARR) y la tasa de retención neta (NDR/NRR).
   - **Obligaciones de Cumplimiento Restantes (RPO - Remaining Performance Obligations)**: Compromisos contractuales cerrados aún no facturados, indicando el porcentaje a reconocer en los próximos 12 meses frente a periodos posteriores.

7. **BPA Ajustado**:
   - El BPA Ajustado se calcula dividiendo el Beneficio Neto Ajustado entre el número de acciones diluidas promedio del periodo.
   - Si la empresa tiene un volumen significativo de opciones o RSUs que diluyan el recuento de acciones, se comenta la evolución de las acciones en circulación frente al año anterior.

8. **Asignación de Capital y Recompras (Bloque 3)**:
   - **Fórmula de Deuda Balance**:
     $$\text{Deuda Balance} = \text{Deuda a largo plazo (Long-Term Debt)} + \text{Deuda a corto plazo (Current portion / Commercial Paper)}$$
   - **Caja e Inversiones a Corto Plazo**: Las empresas tecnológicas suelen acumular altas posiciones de liquidez en valores negociables (*Marketable Securities*). La deuda neta se calcula como:
     $$\text{Deuda Neta} = \text{Deuda Balance} - (\text{Efectivo y equivalentes} + \text{Inversiones a corto plazo})$$
   - Si la empresa tiene **Caja Neta** (Deuda Neta negativa), se resalta la posición neta de tesorería y el rendimiento obtenido por la cartera de inversiones líquidas.
   - **Auditoría de Recompras vs SBC**: En la sección de Asignación de Capital y comentarios finales, se compara el importe destinado a recompra de acciones con el gasto en SBC. Si la recompra neta no reduce el número de acciones, se concluye expresamente que las recompras son un mecanismo defensivo contra la dilución ejecutiva y no una retribución neta de capital al accionista.
   - **Adquisiciones de Empresas (M&A Tecnológico)**: Salidas netas por compra de compañías (`Acquisitions of businesses, net of cash acquired`, >= 50M) figuran con signo negativo (-) en la fila obligatoria `Adquisiciones`. Se identifica la empresa adquirida, el encaje tecnológico y el fondo de comercio generado.
