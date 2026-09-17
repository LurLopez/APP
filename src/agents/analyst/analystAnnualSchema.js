/**
 * @fileoverview Módulo extraído de analystPrompts.js.
 */

export const ANNUAL_OUTPUT_SCHEMA = `{
  "company": "Nombre de la empresa",
  "ticker": "TAP",
  "periodTitle": "2025 ANNUAL results — TAP",
  "reportingPeriod": "2025-12-31",
  "formType": "10-K",
  "horizons": [
    {
      "label": "EN TODO EL AÑO (12 MESES)",
      "sales": {
        "rows": [
          { "name": "Ventas", "adjusted": "13040M", "prevAdjusted": "13734M", "pctAdjusted": "-5,05 %", "normal": "13040M", "prevNormal": "13734M", "pctNormal": "-5,05 %", "isAdjusted": false },
          { "name": "Beneficio Bruto", "adjusted": "4274M", "prevAdjusted": "4533M", "pctAdjusted": "-5,71 %", "normal": "4274M", "prevNormal": "4533M", "pctNormal": "-5,71 %", "isAdjusted": false },
          { "name": "Beneficio Operativo", "adjusted": "1583M", "prevAdjusted": "1753M", "pctAdjusted": "-9,70 %", "normal": "-2366M", "prevNormal": "1753M", "pctNormal": "—", "isAdjusted": true, "adjustedNote": "*1" },
          { "name": "EBT", "adjusted": "1402M", "prevAdjusted": "1503M", "pctAdjusted": "-6,72 %", "normal": "-2518M", "prevNormal": "1503M", "pctNormal": "—", "isAdjusted": false },
          { "name": "Beneficio Neto", "adjusted": "1086M", "prevAdjusted": "1164M", "pctAdjusted": "-6,70 %", "normal": "-2180M", "prevNormal": "1157M", "pctNormal": "—", "isAdjusted": true, "adjustedNote": "*2" }
        ],
        "notes": [
          "*1: Ha habido una depreciación del fondo de comercio de 3645 M. Además, de lo que aparece en el apartado 'Other Operating Income', unos -275 M corresponden a otras depreciaciones. En total, hay que sumar 3920 M.",
          "*2: Este año ha tenido un beneficio por impuestos de 337 M. Por supuesto, hay que ajustar esto (le he restado 1402 * 0,225 = 316). Por lo tanto, tendría que haber pagado 653 M más de lo que figura ahí; esto es muy importante para ajustar los Cash Flows."
        ],
        "shares": "190,8M (al final del 2025, no el promedio) -> %6,2 menos (203,2M)-> efecto en el BPA: %6,5",
        "eps": "5,69 $ -> %2,3 menos (5,73 $)"
      },
      "cashFlow": {
        "scenarios": ["Normal (WC=-146)", "Ajustado*1 (WC=70)"],
        "rows": [
          { "name": "Cash Flow", "values": ["1784", "1805"] },
          { "name": "CAPEX", "values": ["717", "717"] },
          { "name": "FCF", "values": ["1067", "1088"] },
          { "name": "FCF/Acción", "values": ["5,59 $", "5,70 $"] },
          { "name": "Dividendo", "values": ["376", "376"] },
          { "name": "Libre", "values": ["691", "712"] }
        ],
        "notes": [
          "*1: WK = (Inventarios + Cuentas por cobrar - Cuentas por pagar) × (inflación + volumen) = (700 + 700 - 2800) × (0,05 + 0) = 70. Por lo tanto, hay que sumar 146 + 70 = 216 M al cash flow. Este año han gastado 131 M en impuestos cuando en principio debían pagar 316 M, restando 185 M al cash flow."
        ]
      },
      "capital": {
        "rows": [
          { "name": "Libre", "value": "691" },
          { "name": "Inversiones a corto plazo", "value": "-85" },
          { "name": "Recompras", "value": "-650" },
          { "name": "Caja", "value": "70" },
          { "name": "Deuda", "value": "150" },
          { "name": "En total", "value": "176" }
        ],
        "verification": "No cuadra del todo, pero más o menos ha gastado todo lo que estaba libre en recompras.",
        "notes": [
          "*1: Deuda balance: 6126M -> 6260M (+134M). Deuda neta: 5740M -> 5840M (+100M). Caja balance: 560M (2024) -> 490M (2025) (-70M); la caja disminuyó: fuente de liquidez (+); fila Caja = 70."
        ]
      }
    }
  ],
  "conclusion": {
    "repurchases": {
      "title": "1: Recompras",
      "text": "Durante 2025 la compañía destinó 647,9M a la recompra de acciones propias...",
      "programChanges": "Nuevo programa de 2.000M autorizado en febrero de 2026, o cancelación/suspensión del programa; null si no hubo cambios.",
      "authorizationRemaining": "Unos 2.600M de $ pendientes de ejecución",
      "authorizationExpiry": "Vigente hasta diciembre de 2031",
      "shareCountEvolution": "De 208,9M de acciones en diciembre de 2024 a 199,1M en diciembre de 2025 (-4,7 %)",
      "bpaImpact": "+4,9 % de subida en el BPA en el último año exclusivamente por recompras",
      "futureProjection": "Proyección a 5 años: con ~2.600M de autorización restante y un precio medio de ~51 $, se podrían recomprar ~51M de acciones (~10,2M/año), lo que reduciría el capital un ~5,1 % anual e impulsaría el BPA ~5,4 % cada año.",
      "sharesHistory": [
        { "year": 2021, "shares": 231.5 },
        { "year": 2022, "shares": 226.1 },
        { "year": 2023, "shares": 217.2 },
        { "year": 2024, "shares": 208.9 },
        { "year": 2025, "shares": 199.1 }
      ],
      "secSnippet": {
        "title": "Share Repurchase Program (Form 10-K)",
        "summary": "Tabla oficial de recompras anuales del Form 10-K",
        "headers": ["", "December 31, 2025", "December 31, 2024", "December 31, 2023"],
        "rows": [
          ["Shares repurchased", "12,906,851", "10,907,779", "3,454,694"],
          ["Aggregate cost (in millions)", "$658.1", "$645.2", "$212.7"],
          ["Average price paid (in $)", "$51.0", "$59.2", "$61.6"]
        ]
      }
    },
    "executiveChanges": {
      "title": "2: Cambios en la dirección",
      "changes": [
        {
          "role": "CEO",
          "text": "En **2018** se produjo una sucesión planificada en la cúpula directiva: **Ramon Laguarta** asumió como **Chairman and CEO**, sucediendo a **Indra Nooyi**.",
          "announcementDate": "2018-08-06",
          "effectiveDate": "2018-10-03",
          "reason": "Sucesión planificada",
          "oldExecutive": {
            "name": "Indra Nooyi",
            "role": "Chairman and CEO (hasta 2018)",
            "salesDuringTenure": "No se dispone de información detallada en el texto disponible.",
            "whereTheyGo": "No consta en el texto disponible",
            "policies": "No se dispone de información detallada en el texto disponible."
          },
          "newExecutive": {
            "name": "Ramon Laguarta",
            "origin": "PepsiCo; anteriormente CEO, Europe Sub-Saharan Africa (2015-2017) y CEO, PepsiCo Europe (2015)",
            "trackRecord": "En PepsiCo desde 1996; Presidente de Europa (2008-2012), Presidente de Mercados Desarrollados y Emergentes, CEO de PepsiCo Europa (2015) y CEO de Europa Sub-Sahariana Africa (2015-2017).",
            "commitments": "Enfocado en capitalizar el impulso del negocio, invertir en capacidades y lograr crecimiento orgánico de ingresos del 4 % en 2019."
          },
          "source": "10-K / información pública general"
        }
      ]
    },
    "outlook": {
      "title": "3: Outlook",
      "text": "La dirección proyecta para **2026** unas ventas planas en moneda constante (**flat +/- 1 %**), con un EBT subyacente en descenso del **-15 % al -18 %** y un BPA diluido subyacente en caída del **-11 % al -15 %**. El efecto amortiguador de las recompras de acciones (que reducen la base accionarial **~5 % anual**) suaviza parcialmente la caída del BPA frente a la del EBT. La compañía espera un tipo impositivo efectivo subyacente del **22 % al 24 %**.",
      "fcfAnalysis": "El guidance de Free Cash Flow subyacente es de **1.100M +/- 10 %**, con un CAPEX previsto de **650M +/- 5 %** y una amortización subyacente de **720M +/- 5 %**. Con un dividendo anual en torno a **376M**, el FCF esperado cubre sobradamente el dividendo...",
      "riskFactors": "Presión inflacionaria en materias primas, especialmente el **aluminio (Midwest Premium)**...",
      "efficiencyPlans": "Programa de ahorro de costes de hasta **450M en 3 años (2026-2028)**, junto con el Plan de Reestructuración de las Américas de **28,7M**...",
      "secSnippet": {
        "title": "2026 Guidance / Full Year Outlook",
        "summary": "Metas cuantitativas oficiales para el próximo ejercicio",
        "headers": ["Métrica", "2025 (Año anterior)", "Guidance 2026E*", "Cifra Proyectada 2026E"],
        "rows": [
          ["Net Sales Revenue Growth, Constant Currency", "$11,141M", "Flat +/- 1%", "~$11,030M – $11,252M"],
          ["Underlying Income Before Income Taxes", "$1,402M", "-15% to -18% Decline", "~$1,150M – $1,192M"],
          ["Underlying Diluted EPS Growth", "$5.80", "-11% to -15% Decline", "~$4.93 – $5.16"],
          ["Underlying Free Cash Flow", "$1,068M", "$1.1B +/- 10%", "~$990M – $1,210M"],
          ["Underlying Net Interest Expense", "$230M", "$260M +/- 5%", "~$247M – $273M"],
          ["Capital Expenditures Incurred", "$717M", "$650M +/- 5%", "~$618M – $683M"]
        ]
      }
    },
    "debt": {
      "title": "4: Deuda",
      "text": "La deuda neta se sitúa en **4.950 M$** (-350 M$ vs ejercicio anterior) y la deuda normal en **5.900 M$** (-300 M$). El calendario de vencimientos de los próximos 5 años muestra compromisos escalonados con un tipo de interés medio total del **3,35 %**.",
      "refinancingAnalysis": "Se refinanciaron **1.000 M$** de deuda que devengaba un **3,00 %** emitiendo nuevas obligaciones al **5,25 %** (+2,25 puntos porcentuales de coste).",
      "refinancingImpact": "Sobrecoste bruto de **22,5 M$** de intereses anuales. Tras impuestos (~23 %), el coste neto es de **~17,3 M$**, lo que reduce el BPA en torno a **-0,09 $/acción** (con 199M de acciones).",
      "maturitySchedule": [
        { "year": 2026, "label": "CAD 500M 3.44% senior notes", "amount": 364.3, "rate": 3.44, "type": "Senior Notes" },
        { "year": 2026, "label": "$2.0B 3.0% senior notes", "amount": 2000.0, "rate": 3.0, "type": "Senior Notes" },
        { "year": 2029, "label": "CAD 445M 3.44% senior notes", "amount": 1.7, "rate": 3.44, "type": "Senior Notes" }
      ],
      "maturityAfterFive": 3841.6,
      "debtHistory": [
        { "year": 2021, "totalDebt": 7800, "netDebt": 7200 },
        { "year": 2022, "totalDebt": 6900, "netDebt": 6100 },
        { "year": 2023, "totalDebt": 6500, "netDebt": 5700 },
        { "year": 2024, "totalDebt": 6200, "netDebt": 5300 },
        { "year": 2025, "totalDebt": 5900, "netDebt": 4950 }
      ],
      "refinancing": {
        "occurred": true,
        "oldDebtRate": 3.00,
        "newDebtRate": 5.25,
        "amountRefinanced": 1000,
        "annualInterestImpact": 22.5,
        "epsImpact": -0.09
      },
      "secTable": {
        "headers": ["Obligación", "Vencimiento", "December 31, 2025", "December 31, 2024"],
        "rows": [
          ["CAD 500 million 3.44% senior notes", "July 2026", "$364.3", "$347.6"],
          ["$2.0 billion 3.0% senior notes", "July 2026", "$2,000.0", "$2,000.0"],
          ["EUR 800 million 3.8% senior notes", "June 2032", "$939.7", "$828.3"],
          ["$1.1 billion 5.0% senior notes", "May 2042", "$1,100.0", "$1,100.0"],
          ["$1.8 billion 4.2% senior notes", "July 2046", "$1,800.0", "$1,800.0"]
        ]
      }
    },
    "acquisitions": {
      "title": "4: Operaciones corporativas",
      "text": "**Adquisiciones:** En **agosto de 2018** la compañía completó la adquisición de **SodaStream International Ltd.** por **1.197M$** netos de efectivo adquirido (valoración total de la operación de **3.200M$**). SodaStream es un fabricante de sistemas de carbonatación doméstica y sabores con las marcas SodaStream y bubly, con presencia principal en Europa y Estados Unidos.\\n\\nEl motivo declarado de la operación es acelerar la estrategia de bebidas más saludables y el canal de consumo en casa. La compra se financió con caja y deuda a corto plazo, y la dirección espera sinergias de ingresos y ahorros de costes a partir de 2019.\\n\\n**Desinversiones y ventas de participaciones:** En **2025** se vendió el negocio de **[marca o negocio]** por **649M$**, un negocio que representaba cerca del **6 %** de los ingresos consolidados; la dirección declaró que la operación permite concentrar recursos en las marcas principales.\\n\\n**Spin-offs:** La compañía anunció en **enero de 2026** la separación de **[división]** mediante una distribución a accionistas libre de impuestos, prevista para el cuarto trimestre de 2026.\\n\\n**Reestructuraciones:** En **2025** se aprobó un plan de reestructuración con **250M$** de coste total y **450M$** de ahorro anual esperado para 2028, que afecta a **[plantas o funciones]**."
    },
    "dividends": {
      "title": "6: Dividendos",
      "text": "El dividendo por acción aumentó un 6,8 % en 2025, hasta 1,88 $, con un pago total de 376,3M.",
      "changeType": "increase",
      "changePct": 6.8,
      "history": [
        { "year": 2023, "dps": 1.64, "total": 354.7, "adjustedEps": 5.8 },
        { "year": 2024, "dps": 1.76, "total": 369.2, "adjustedEps": 5.96 },
        { "year": 2025, "dps": 1.88, "total": 376.3, "adjustedEps": 5.42 }
      ]
    },
    "watchlist": {
      "title": "Cosas a tener en cuenta en 2026",
      "items": [
        "1: Evolución de los beneficios y volúmenes en comparación con otras empresas del sector.",
        "2: Ritmo y precio medio de ejecución de las recompras de acciones.",
        "3: Refinanciación de la deuda que vence y coste efectivo de los nuevos intereses."
      ]
    }
  },
  "rating": {
    "score": 3,
    "label": "NOTA DE RESULTADOS: 3",
    "rationale": "Calificación puramente financiera basada exclusivamente en la realidad de las cuentas del año, las metas expuestas en el outlook oficial y la asignación de capital ejecutada. Sin especulación sobre el cumplimiento futuro."
  }
}`;
