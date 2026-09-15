/**
 * @fileoverview Módulo extraído de analystPrompts.js.
 */

export const EXTRACTION_PROMPT = `Eres el extractor de datos de Cifra. A partir del texto del informe financiero 10-Q / 10-K recibido, extrae las cifras clave del estado de resultados, del balance, del estado de flujos de caja y otros datos relevantes.

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):

{SCHEMA}

Instrucciones:
- "quarter" = datos del trimestre más reciente (por ejemplo "three months ended") y "quarter.prev" = las mismas líneas del mismo trimestre del año anterior (columnas comparativas del informe); "ytd" = acumulado del año fiscal en curso ("six/nine months ended") y "ytd.prev" = acumulado del mismo periodo del año anterior. Si el informe no trae comparativos, usa null.
- En informes anuales (Form 10-K), "ytd" representa el año fiscal completo (12 meses) y "quarter" puede omitirse o igualarse a ytd.
- Todas las cifras en MILLONES de dólares estadounidenses, como números (ej. 6262). Si una cifra no aparece usa null (no la omitas).
- UNIDADES OBLIGATORIAS: si una tabla del informe indica "(In thousands)" o "en miles", DIVIDE la cifra entre 1000 para pasarla a millones; si indica "(In millions)", úsala tal cual. Nunca devuelvas importes en miles (ej. 1.000.000 donde corresponde 1000) ni en dólares completos.
- EXACTITUD OBLIGATORIA: copia las cifras EXACTAS tal como figuran en el informe, sin redondear ni estimar (ej. si el estado de flujos dice "4,462" escribe 4462, no 4500; si dice "801" escribe 801, no 800; si dice "1,898" escribe 1898, no 1900). Nunca sustituyas una cifra reportada por una aproximación ni completes un dato que no aparece con un valor redondeado.
- Si el informe no desglosa el trimestre en algún estado (p. ej. flujos de caja solo acumulados), deja esos campos con null.
- "cashFlow" son las cifras del acumulado (net cash provided by operating activities, capital expenditures, cash dividends paid). Si solo aparecen del trimestre, úsalas igualmente.
- "balance": inventarios (inventories), cuentas por pagar (accounts payable / payables), cuentas por cobrar (accounts receivable / receivables), efectivo (cash), efectivo a principio de año fiscal (cashBeginningOfYear / cierre de ejercicio anterior), efectivo al cierre del trimestre previo (cashPreviousQuarter), efectivo restringido o en escrow (restrictedCash), a principio de año fiscal (restrictedCashBeginningOfYear) y al cierre del trimestre previo (restrictedCashPreviousQuarter), inversiones a corto plazo o valores negociables (shortTermInvestments / Marketable Securities), a principio de año fiscal (shortTermInvestmentsBeginningOfYear) y al cierre del trimestre previo (shortTermInvestmentsPreviousQuarter), deuda total o senior notes (totalDebt), deuda total a principio de año fiscal (totalDebtBeginningOfYear) y deuda total al cierre del trimestre previo (totalDebtPreviousQuarter) en millones (o null si no aparecen). El efectivo restringido incluye las líneas "Restricted cash" del balance o de la conciliación del estado de flujos ("Cash, cash equivalents, restricted cash and restricted cash equivalents") menos el efectivo y equivalentes no restringido.
- "totalDebt" = deuda financiera total del balance = deuda a largo plazo (long-term debt) + porción corriente de la deuda a largo plazo (current portion of long-term debt / current maturities) + préstamos a corto plazo (short-term borrowings). Excluye las cuentas comerciales a pagar a proveedores (accounts payable). En el balance general de US-GAAP la porción corriente de la deuda a largo plazo se clasifica dentro de pasivos corrientes (Current Liabilities) separada de la deuda a largo plazo no corriente, por lo que DEBE sumarse para obtener la deuda total financiera del balance.
- "workingCapital": variación del capital circulante / operating assets and liabilities en el estado de flujos de caja (reportedChangeQuarter para 3 meses o reportedChangeYtd para acumulado), inflación anual del sector ("inflationRate") y crecimiento real de volumen ("volumeGrowth") en %. Si el informe no proporciona volumen, "volumeGrowth" es obligatoriamente 0. Si no proporciona inflación propia, usa aproximadamente 3% para consumo defensivo y deja constancia de que es una hipótesis sectorial. "inflationAndVolume" debe ser la suma de ambos.
- "facts":
  * impairmentsQuarter: deterioros / impairments o depreciaciones extraordinarias de intangibles o goodwill del trimestre actual (o 0/null si no hubo).
  * impairmentsPrevQuarter: deterioros / impairments del mismo trimestre del ejercicio anterior (ej. 1428M en KHC, o 0/null si no hubo).
  * impairmentsYtd: deterioros / depreciaciones acumuladas del ejercicio actual (ej. 9301M en KHC).
  * impairmentsPrevYtd: deterioros / impairments acumulados del ejercicio anterior (ej. 2282M en KHC).
  * intangiblesAmortization: amortización de intangibles en millones.
  * effectiveTaxRate: tipo impositivo efectivo en %.
  * incomeTaxExpenseQuarter / incomeTaxExpenseYtd: gasto por impuestos reconocido en la cuenta de resultados del periodo.
  * taxCashFlowAdjustmentQuarter / taxCashFlowAdjustmentYtd: línea "Deferred income taxes and income taxes payable, net" o "Deferred income tax provision/(benefit)" del cash flow, con su signo tal como aparece. Es un ajuste no monetario, no impuestos pagados. Si existe cualquiera de esas líneas, estos campos son obligatorios.
  * incomeTaxesPaidQuarter / incomeTaxesPaidYtd: importe pagado en efectivo por impuestos sobre las ganancias en el periodo ("Income taxes paid", "Income tax (paid) received", "Total net cash income taxes paid", "Cash paid for income taxes"). Número positivo en $M (ej. 131.4). Si la empresa desglosa los impuestos pagados en efectivo en el estado de flujos o en la nota de impuestos, este campo es prioritario.
  * shareBuybacks: recompras de acciones en $M. Buscar también "repurchases of common stock", "purchases of treasury stock" y "share repurchases".
  * purchasesOfMarketableSecuritiesQuarter / purchasesOfMarketableSecuritiesYtd: compras de inversiones a corto plazo, valores negociables o marketable securities en el cash flow. Buscar expresamente "purchases of marketable securities". Se pasan al bloque de Asignación de Capital restadas de las ventas (ver el campo siguiente).
  * proceedsFromSaleOfMarketableSecuritiesQuarter / proceedsFromSaleOfMarketableSecuritiesYtd: cobros por venta o vencimiento de valores negociables en el cash flow ("Proceeds from sales of marketable securities", "Proceeds from sale and maturity of marketable securities"). En Asignación de Capital, la fila "Inversiones a corto plazo" es el flujo NETO: ventas (+) - compras (-). Ej.: compras de 1.724 y ventas de 686 => -1038.
  * IMPORTANTE (separador de miles): en las tablas de la SEC la coma suele ser separador de MILLARES ("(1,724)" = 1.724 millones; "1,024" = 1.024 millones). Interpreta siempre esas comas como miles, nunca como decimales.
  * brandDivestitures: ingresos netos por venta de marcas, activos o desinversiones materiales en $M (>= 50M).
  * acquisitionsQuarter / acquisitionsYtd: pagos netos por compra de negocios en el cash flow ("Acquisitions of businesses, net of cash acquired", "Acquisition of business, net of cash acquired", "Payments to acquire businesses") en $M, como número positivo, tomando la columna del periodo analizado. Buscar expresamente estas líneas (singular o plural); si existen, los campos son obligatorios. Ojo: aunque el nombre diga "net of cash acquired", el importe es el pagado por la adquisición y debe figurar como fila "Adquisiciones" en la asignación de capital.
  * assetSalesQuarter / assetSalesYtd: ingresos por venta de property, plant, equipment and other assets en el cash flow ("Proceeds from sales of property, plant, equipment and other assets") en $M, como número positivo. Si existen, los campos son obligatorios.
  * preferredIssuanceQuarter / preferredIssuanceYtd: entradas de caja por emisión de acciones preferentes en la sección de financiación ("Net proceeds from issuance of convertible preferred stock", "Proceeds from issuance of preferred stock"), en $M como número positivo. Si existen, son obligatorios.
  * nonControllingSaleQuarter / nonControllingSaleYtd: entradas de caja por venta de participaciones no controladoras/minoritarias manteniendo el control ("Net proceeds from sale of non-controlling interest", "Proceeds from sale of noncontrolling interest", "Proceeds from minority shareholders"), en $M como número positivo. Si existen, son obligatorios. NO es una desinversión.
  * REGLA DEL PERIODO (CRÍTICA): todas las partidas del estado de flujos (recompras, compras/ventas de valores negociables, adquisiciones, desinversiones y ventas de activos) se toman SIEMPRE de la columna del EJERCICIO analizado. Las columnas comparativas del año anterior NO cuentan: si la línea solo aparece con la cifra del comparativo (o a 0 en el periodo actual), escribe 0. Nunca atribuyas al ejercicio analizado una adquisición o desinversión del ejercicio anterior.
  * acquisitionDescription: breve descripción de QUÉ negocio/empresa se ha comprado en el periodo (según las notas del 10-Q/10-K), o null si no hubo adquisiciones.
  * divestitureDescription: breve descripción de QUÉ marca, negocio o activo se ha vendido en el periodo (según las notas del 10-Q/10-K), o null si no hubo ventas.
  * totalDebt: deuda total en balance.
- "annualDetails" (OBLIGATORIO para informes anuales Form 10-K):
  * "repurchases": extrae de la nota de Share Repurchase Program o Stockholders' Equity la autorización del programa, saldo disponible, acciones recompradas y tabla de recompras multianual.
    - "programRemaining": importe en $M pendiente de ejecutar bajo el programa vigente. ES OBLIGATORIO extraerlo si el 10-K lo indica. Búscalo en la nota de Stockholders' Equity, en el Item 5 ("Unregistered Sales of Equity Securities and Use of Proceeds") o en el resumen de recompras, con expresiones como "approximately $X million remaining under our share repurchase program", "$X million remaining", "of which $X million remained" o "available for future repurchases". Si el importe aparece en miles de millones, conviértelo a millones (ej. "$2.0 billion remaining" = 2000M). NUNCA dejes el campo vacío ni respondas que no se desglosa si encuentras la cifra.
    - "programExpiry": fecha o periodo en el que termina la autorización del programa (ej. "Diciembre de 2031"). Búscala con expresiones como "expires in", "through December 31, 20XX", "authorized through" o "no expiration date". Si el 10-K indica que el programa no caduca, escribe "Sin fecha de caducidad"; si no consta nada, null.
    - "newProgramLaunched": si durante el ejercicio se lanzó un NUEVO programa de recompra o se amplió de forma relevante el vigente, descríbelo con importe y fecha (ej. "Nuevo programa de 2.000M autorizado en febrero de 2026"). Búscalo con expresiones como "new share repurchase program", "authorized an additional $X million", "increased the share repurchase authorization" o "approved a new repurchase program". Si no hubo lanzamiento ni ampliación en el ejercicio, null.
    - "programCancelled": si la compañía canceló, suspendió, terminó o dejó expirar sin renovar su programa de recompra durante el ejercicio, descríbelo (ej. "Programa cancelado en diciembre de 2025"). Búscalo con expresiones como "terminated the share repurchase program", "discontinued", "cancelled", "suspended" o "did not renew". No marques este campo por una fecha de vencimiento futura normal ("expires in 2031"): solo si el programa se cancela, suspende o termina en el ejercicio. Si no ocurrió, null.
    - "sharesRepurchasedAnnual": número de acciones recompradas en el ejercicio en MILLONES (ej. 12.9), tomado de la tabla de recompras ("Shares repurchased"), de la nota de patrimonio o de las acciones en tesorería. Necesario para calcular el peso de la recompra sobre el capital; si no consta, null.
    - "aggregateCost": coste total de las recompras del ejercicio en $M (el importe del último año de "repurchaseHistory"); si no consta, null.
    - "averagePrice": precio medio ponderado pagado por acción en el año = aggregate cost ($M) / shares repurchased.
    - "sharesHistory": acciones en circulación al CIERRE de cada uno de los últimos 5 ejercicios (shares outstanding, no el promedio ponderado). Fuentes: estado de patrimonio, balance, nota de capital social, resumen quinquenal (Selected Financial Data / Five-Year Summary) o la sección de Earnings Per Share. Es OBLIGATORIO extraer al menos 3 ejercicios cuando el 10-K los muestra. Formato: [{ "year": 2021, "shares": 231.5 }, ...] con las acciones en millones.
    - "repurchaseHistory": serie anual de recompras de acciones ejecutadas (importe total en $M por ejercicio, últimos 3-5 años). Fuente principal: estado de flujos de caja, línea "Repurchases of common stock" / "Purchases of treasury stock" / "Repurchases of common stock, net of fees". Añade cada año con "year" y la fecha de cierre "end" en formato AAAA-MM-DD. Es la base para construir la tabla multianual cuando el 10-K no incluye una tabla propia de recompras.
         - "secTable": tabla oficial de recompras. Si el 10-K incluye una tabla propia con acciones y coste por año, los años de las columnas DEBEN ser los últimos 5 ejercicios disponibles (hasta 5 columnas), alineados con "sharesHistory"; "rows" DEBE incluir SIEMPRE, en este orden y cuando el informe los desglose, "Shares repurchased" (número de títulos, tal cual, con separador de miles), "Aggregate cost (in millions)" y "Average price paid (in $)" (precio medio = coste agregado / acciones recompradas, ej. "$51.0", "$59.2"). Si el 10-K NO incluye tabla propia pero existe "repurchaseHistory", construye "secTable" con una columna por ejercicio y la fila "Aggregate cost (in millions)"; añade "Shares repurchased" y "Average price paid (in $)" si el informe permite calcularlos (estado de patrimonio, nota de tesorería o acciones recompradas por ejercicio) y "Remaining authorization (in millions)" en la columna del último ejercicio si consta el remanente. Queda PROHIBIDO inventar el número de acciones recompradas o el precio medio: si no constan, se omiten y el sistema los completará desde la SEC cuando sea posible.
  * "ceoChange": relevo en el máximo ejecutivo (CEO) durante el ejercicio o anunciado para el siguiente. Escanea el 10-K y la sección complementaria en busca de un cambio de CEO: "appointed ... Chief Executive Officer", "will succeed ... as CEO", "CEO transition", "retirement of our CEO", "stepped down as CEO", "assumed the role of CEO", "will become CEO". Si no encuentras ningún relevo, deja "occurred": false y el resto de campos null.
    - "announcementDate" / "effectiveDate": fecha del anuncio y fecha efectiva del nombramiento (AAAA-MM-DD) tal como consten.
    - "reason": motivo declarado (sucesión planificada, jubilación, dimisión, despido).
    - "oldCeo": el CEO saliente: "name", "role" (cargo y periodo), "tenureStart" (año o fecha en que asumió), "whereTheyGo" (a dónde pasa: jubilación, presidencia del consejo, otra empresa; null si no consta), "salesDuringTenure" (evolución de las ventas durante su mandato con cifras y variación, usando la serie histórica del propio informe; null si no consta) y "policies" (políticas y decisiones destacadas de su etapa según el informe: reestructuraciones, adquisiciones o desinversiones, dividendos, recompras, cambios de estrategia o de cartera de marcas).
    - "newCeo": el CEO entrante: "name", "origin" (empresa y puesto del que viene, con el periodo si consta), "trackRecord" (qué hizo en puestos directivos anteriores según lo que recoja el informe: resultados, reestructuraciones, evolución de ventas y márgenes; null si el informe no lo detalla) y "commitments" (qué ha dicho que va a hacer o qué prioridades ha anunciado; null si no consta).
    - "source": de dónde sale la información ("10-K", "8-K/presentación complementaria" o ambos).
  * "dividends": extrae del estado de patrimonio, del estado de flujos de caja y de la sección de dividendos la política de reparto:
    - "history": serie de los últimos 3-5 ejercicios con "year", "dps" (dividendo declarado por acción en $), "total" (dividendos pagados en millones) y "adjustedEps" (BPA diluido AJUSTADO o subyacente del año, si consta en el 10-K o en el comunicado/presentación 8-K complementario). El sistema completa esta serie desde XBRL, pero el "adjustedEps" solo puede venir de la IA.
    - "changeType" ("increase", "cut", "unchanged"), "changePct" (variación % del dividendo por acción del último ejercicio frente al anterior) y "changeDate" (fecha del anuncio del cambio, si consta). Si el dividendo se mantiene sin cambios, deja "changeType" en "unchanged".
  * "outlook": extrae del Guidance / Full Year Outlook o Item 7 las metas oficiales de ingresos, EBT, BPA, FCF, CAPEX, intereses, programas de ahorro de costes y tabla del guidance. En "secTable" estructura OBLIGATORIAMENTE 4 columnas: "Métrica", "[AÑO-1] (Año anterior)", "Guidance [AÑO]E*" y "Cifra Proyectada [AÑO]E", incluyendo el valor del año pasado cerrado y la equivalencia en ventas/cifra de las metas en porcentaje o 'flat'.
    - La columna "[AÑO-1] (Año anterior)" NUNCA se deja con "—": rellena en TODAS las filas el dato real del ejercicio cerrado (ventas, EBT/BPA, FCF, conversión de FCF, CAPEX, gasto neto por intereses y margen operativo). Si una cifra no está en la tabla del 10-K, búscala en los estados financieros del propio 10-K o en la presentación/comunicado 8-K complementario.
    - Guarda esos mismos valores del año cerrado en los campos: "priorYearSales", "priorYearEbt", "priorYearEps", "priorYearFcf", "priorYearFcfConversion" (en %), "priorYearCapex", "priorYearNetInterest" y "priorYearOperatingMargin" (en %). Si algún dato no consta en ninguna fuente, usa null; nunca lo inventes.
  * "debt": extrae de la nota Debt Obligations el perfil de vencimientos contractuales para los PRÓXIMOS 5 AÑOS, el importe agregado posterior al año 5 en "maturityAfterFive" (si aparece), la evolución histórica de deuda normal y deuda neta de los últimos 10 años ("debtHistory"), y cualquier refinanciación acontecida o pactada en el ejercicio ("refinancing"), indicando tipo anterior, tipo nuevo y cuantía refinanciada.
    - "maturityItems": lista DETALLADA con un elemento POR CADA EMISIÓN/TRAMO de deuda (notas sénior, bonos, préstamos, líneas de crédito) que vence en cada uno de los próximos 5 años, no un único total agregado por año. Nunca uses etiquetas de varios ejercicios ("2027-2028", "2031 y posteriores"...): asigna cada emisión a su año exacto de vencimiento. Para cada emisión extrae: "year" (año de vencimiento), "label" (descripción con divisa, importe nominal y cupón, ej. "CAD 500M 3.44% senior notes due 2026"), "amount" (saldo/importe en millones de USD; si la emisión está en otra divisa, usa el importe en USD que figura en la tabla de deuda del 10-K), "rate" (tipo cupón en %) y "type" (Senior Notes, Commercial Paper, Term Loan, etcétera). Si dos emisiones vencen el mismo año, deben aparecer como DOS elementos con distinto tipo y cupón. Incluye TAMBIÉN las emisiones que vencen DESPUÉS del año 5 cuando la tabla de deuda detalle su cupón (aunque no se dibujen en el gráfico), para poder calcular el tipo de interés medio de toda la deuda. Ejemplo real: [{ "year": 2026, "label": "CAD 500M 3.44% senior notes", "amount": 364.3, "rate": 3.44, "type": "Senior Notes" }, { "year": 2026, "label": "$2.0B 3.0% senior notes", "amount": 2000, "rate": 3.0, "type": "Senior Notes" }].
    - Si el 10-K solo publica una tabla agregada de vencimientos por año (Contractual Maturities) sin detallar emisión ni cupón, usa esa tabla como respaldo dejando "rate" en null y "type" en "Deuda total". OJO: la tabla de "Material Cash Requirements" del MD&A incluye intereses y no sirve como calendario de principal; usa siempre la tabla de vencimientos de principal de la nota de deuda ("aggregate principal maturities") cuando exista.
    - "secTable": copia la tabla de la nota de deuda (Long-Term Debt / Debt Obligations) con sus columnas reales (obligación/categoría, vencimiento, tipo de interés y saldo del último ejercicio). Si la nota resume la deuda por categorías con rangos de cupón (ej. "3.000 % – 7.125 %"), incluye cada categoría con su rango tal cual y su saldo; en ese caso NO inventes un único tipo por categoría ni tramos individuales.
- "extraNotes": partidas extraordinarias, ventas de negocios, o cualquier hecho relevante que afecte a la comparabilidad (ej. "impairment de 1428M el año anterior"). En español. Vacío si no hay nada.
- DOCUMENTO COMPLEMENTARIO: El texto puede incluir una sección "[SECCIÓN COMPLEMENTARIA: PRESENTACIÓN Y COMUNICADO DE RESULTADOS (EARNINGS PRESENTATION / 8-K PRESS RELEASE)]" con la presentación de diapositivas o el comunicado del 8-K de resultados:
  * La sección complementaria es LA FUENTE PRIMARIA Y PRINCIPAL para "annualDetails.outlook": si el informe principal (10-K) no incluye tabla ni narrativa de guidance/outlook, extrae OBLIGATORIAMENTE de la sección complementaria las metas oficiales anunciadas por la dirección para el siguiente ejercicio fiscal (guidanceSales, guidanceEbt, guidanceEps, guidanceFcf, guidanceCapex, guidanceNetInterest, costSavingsPlan, commodityRisks) y la tabla del guidance ("secTable") con sus métricas y rangos tal como aparecen publicados.
  * Los estados financieros del informe principal (10-K) tienen SIEMPRE prioridad sobre la presentación para los datos contables históricos ("quarter", "ytd", "cashFlow", "balance" y "facts").
  * Queda TERMINANTEMENTE PROHIBIDO inventar cifras o copiar los números de ejemplo del schema. Si tras revisar minuciosamente tanto el 10-K como la sección complementaria la compañía no ha publicado ningún guidance cuantitativo para el próximo año, indica en guidanceSales "Sin guidance cuantitativo publicado" y deja el resto de campos numéricos en null.
  * También puede aportar datos de recompras, desinversiones o adquisiciones si el 10-K no los detalla, indicándolo en "extraNotes".`;

export const OUTPUT_SCHEMA = `{
  "company": "Nombre de la empresa",
  "ticker": "TAP",
  "periodTitle": "2025 Q2 results — TAP",
  "reportingPeriod": "2025-06-30",
  "horizons": [
    {
      "label": "ÚLTIMOS 3 MESES",
      "sales": {
        "rows": [
          { "name": "Ventas", "adjusted": "3251M", "prevAdjusted": "3258M", "pctAdjusted": "-0,21 %", "normal": "3251M", "prevNormal": "3258M", "pctNormal": "-0,21 %", "isAdjusted": false },
          { "name": "Beneficio Bruto", "adjusted": "1298M", "prevAdjusted": "1342M", "pctAdjusted": "-3,28 %", "normal": "1298M", "prevNormal": "1342M", "pctNormal": "-3,28 %", "isAdjusted": false },
          { "name": "Beneficio Operativo", "adjusted": "520M", "prevAdjusted": "560M", "pctAdjusted": "-7,14 %", "normal": "485M", "prevNormal": "560M", "pctNormal": "-13,39 %", "isAdjusted": true, "adjustedNote": "*1" },
          { "name": "EBT", "adjusted": "490M", "prevAdjusted": "520M", "pctAdjusted": "-5,77 %", "normal": "455M", "prevNormal": "520M", "pctNormal": "-12,50 %", "isAdjusted": false },
          { "name": "Beneficio Neto", "adjusted": "377M", "prevAdjusted": "400M", "pctAdjusted": "-5,75 %", "normal": "342M", "prevNormal": "400M", "pctNormal": "-14,50 %", "isAdjusted": false }
        ],
        "notes": ["*1: Se excluyen 35M de amortización de intangibles para reflejar el beneficio operativo y neto recurrente de la compañía."],
        "shares": "205M",
        "eps": "1,84 $"
      },
      "cashFlow": {
        "scenarios": ["Normal (WC=150)", "Ajustado*1 (WC=-20)"],
        "rows": [
          { "name": "Cash Flow", "values": ["718,3", "650,0"] },
          { "name": "CAPEX", "values": ["163,3", "163,3"] },
          { "name": "FCF", "values": ["555,0", "486,7"] },
          { "name": "FCF/Acción", "values": ["2,71 $", "2,37 $"] },
          { "name": "Dividendo", "values": ["93,5", "93,5"] },
          { "name": "Libre", "values": ["461,5", "393,2"] }
        ],
        "notes": [
          "*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (1500 - 2200 - 800) × (3% - 0%) = -45M en todo el año -> en 3 meses = -12M por lo tanto, se ajusta la desviación de circulante frente a la necesidad recurrente."
        ]
      },
      "capital": {
        "rows": [
          { "name": "Libre", "value": "302" },
          { "name": "Caja*1", "value": "-8" },
          { "name": "Deuda*1", "value": "-292" },
          { "name": "En total", "value": "2" }
        ],
        "verification": "Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.",
        "notes": ["*1: Deuda balance: 7624M -> 7332M (-292M). Deuda neta: 6580M -> 6257M (-323M). Caja balance: 47M (2025) -> 55M (2026) (+8M); la caja aumentó: uso de capital (-); fila Caja = -8."]
      }
    },
    {
      "label": "EN TODO EL AÑO (9 MESES)",
      "sales": {
        "rows": [
          { "name": "Ventas", "adjusted": "8000,0", "prevAdjusted": "7800,0", "pctAdjusted": "+2,56 %", "normal": "8000,0", "prevNormal": "7800,0", "pctNormal": "+2,56 %" },
          { "name": "Beneficio bruto", "adjusted": "2400,0", "prevAdjusted": "2300,0", "pctAdjusted": "+4,35 %", "normal": "2400,0", "prevNormal": "2300,0", "pctNormal": "+4,35 %" },
          { "name": "Beneficio operativo", "adjusted": "1200,0", "prevAdjusted": "1100,0", "pctAdjusted": "+9,09 %", "normal": "1150,0", "prevNormal": "1100,0", "pctNormal": "+4,55 %", "isAdjusted": true, "adjustedNote": "*1" },
          { "name": "EBT", "adjusted": "950,0", "prevAdjusted": "880,0", "pctAdjusted": "+7,95 %", "normal": "900,0", "prevNormal": "880,0", "pctNormal": "+2,27 %" },
          { "name": "Beneficio neto", "adjusted": "730,0", "prevAdjusted": "677,0", "pctAdjusted": "+7,83 %", "normal": "693,0", "prevNormal": "677,0", "pctNormal": "+2,36 %" }
        ],
        "notes": ["*1: Se excluyen 50M de amortización de intangibles."],
        "shares": "205M",
        "eps": "3,56 $"
      },
      "cashFlow": {
        "scenarios": ["Normal (WC=180)", "Ajustado*1 (WC=-45)"],
        "rows": [
          { "name": "Cash Flow", "values": ["1800,0", "1575,0"] },
          { "name": "CAPEX", "values": ["400,0", "400,0"] },
          { "name": "FCF", "values": ["1400,0", "1175,0"] },
          { "name": "FCF/Acción", "values": ["6,83 $", "5,73 $"] },
          { "name": "Dividendo", "values": ["280,0", "280,0"] },
          { "name": "Libre", "values": ["1120,0", "895,0"] }
        ],
        "notes": [
          "*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (1500 - 2200 - 800) × (3% - 0%) = -45M en todo el año."
        ]
      },
      "capital": {
        "rows": [
          { "name": "Libre", "value": "80" },
          { "name": "Adquisiciones*1", "value": "-271" },
          { "name": "Desinversiones*2", "value": "649" },
          { "name": "Recompras", "value": "-15" },
          { "name": "Caja*3", "value": "13" },
          { "name": "Deuda*3", "value": "-732" },
          { "name": "En total", "value": "-276" }
        ],
        "verification": "No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo.",
        "notes": [
          "*1: Adquisiciones: Se destinaron 271M a la compra de [negocio o empresa adquirida] (uso de fondos).",
          "*2: Desinversiones: Se ingresaron 649M por la desinversión de [marca o negocio vendido] (fuente de fondos).",
          "*3: Deuda balance: 8064M -> 7332M (-732M). Deuda neta: 7996M -> 6257M (-1739M). Caja balance: 68M (2025) -> 55M (2026) (-13M); la caja disminuyó: fuente de liquidez (+); fila Caja = 13."
        ]
      }
    }
  ]
}`;
