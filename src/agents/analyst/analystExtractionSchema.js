/**
 * @fileoverview Módulo extraído de analystPrompts.js.
 */

export const EXTRACTION_SCHEMA = `{
  "company": "The Kraft Heinz Company",
  "ticker": "KHC",
  "periodTitle": "2026 Q2 results — KHC",
  "reportingPeriod": "2026-06-27",
  "fiscalQuarter": 2,
  "fiscalYear": 2026,
  "shares": 1186,
  "quarter": {
    "sales": 6262,
    "grossProfit": 2028,
    "operatingIncome": 921,
    "ebt": 886,
    "netIncome": 752,
    "prev": { "sales": 6352, "grossProfit": 2183, "operatingIncome": 1292, "ebt": 1245, "netIncome": 994 }
  },
  "ytd": {
    "months": 6,
    "sales": 12309,
    "grossProfit": 4247,
    "operatingIncome": 2079,
    "ebt": 2079,
    "netIncome": 1601,
    "prev": { "sales": 12351, "grossProfit": 4247, "operatingIncome": 2488, "ebt": 2488, "netIncome": 1916 }
  },
  "cashFlow": {
    "operating": 2088,
    "capex": 429,
    "dividends": 949,
    "prevOperating": 1929
  },
  "balance": {
    "inventories": 1944,
    "accountsPayable": 1417,
    "accountsReceivable": 757,
    "cash": 55,
    "cashBeginningOfYear": 68,
    "cashPreviousQuarter": 47,
    "restrictedCash": 0,
    "restrictedCashBeginningOfYear": 0,
    "restrictedCashPreviousQuarter": 0,
    "shortTermInvestments": 1020,
    "shortTermInvestmentsBeginningOfYear": 0,
    "shortTermInvestmentsPreviousQuarter": 997,
    "totalDebt": 7332,
    "totalDebtBeginningOfYear": 8064,
    "totalDebtPreviousQuarter": 7624
  },
  "workingCapital": {
    "reportedChangeQuarter": 220,
    "reportedChangeYtd": -60,
    "inflationAndVolume": 3.0,
    "inflationRate": 3.0,
    "volumeGrowth": 0.0
  },
  "facts": {
    "impairmentsQuarter": 35,
    "impairmentsPrevQuarter": 1428,
    "impairmentsYtd": 9301,
    "impairmentsPrevYtd": 2282,
    "intangiblesAmortization": 4911,
    "effectiveTaxRate": 14.4,
    "incomeTaxExpenseQuarter": 134,
    "incomeTaxExpenseYtd": 163,
    "taxCashFlowAdjustmentQuarter": -20,
    "taxCashFlowAdjustmentYtd": 30.9,
    "incomeTaxesPaidQuarter": 131.4,
    "incomeTaxesPaidYtd": 131.4,
    "shareBuybacks": 435,
    "purchasesOfMarketableSecuritiesQuarter": 0,
    "purchasesOfMarketableSecuritiesYtd": 1020,
    "proceedsFromSaleOfMarketableSecuritiesQuarter": 0,
    "proceedsFromSaleOfMarketableSecuritiesYtd": 640,
    "brandDivestitures": 649,
    "acquisitionsQuarter": 0,
    "acquisitionsYtd": 271,
    "assetSalesQuarter": 0,
    "assetSalesYtd": 4.4,
    "preferredIssuanceQuarter": 0,
    "preferredIssuanceYtd": 0,
    "nonControllingSaleQuarter": 0,
    "nonControllingSaleYtd": 0,
    "acquisitionDescription": "Nombre del negocio o empresa adquirida en el periodo, o null si no hubo",
    "divestitureDescription": "Nombre de la marca, negocio o activo vendido en el periodo, o null si no hubo",
    "totalDebt": 7332
  },
  "annualDetails": {
    "repurchases": {
      "programSummary": "Resumen del programa (autorización, ampliaciones, vencimiento)",
      "programAuthorizedTotal": 4000,
      "programRemaining": 2600,
      "programExpiry": "Diciembre de 2031",
      "programAdditions": "Ampliación de 2.000M añadida recientemente",
      "newProgramLaunched": "Descripción del nuevo programa de recompra o ampliación lanzada en el ejercicio (importe y fecha), o null",
      "programCancelled": "Descripción de la cancelación, suspensión o finalización del programa en el ejercicio, o null",
      "sharesRepurchasedAnnual": 12.9,
      "aggregateCost": 658.1,
      "averagePrice": 51.0,
      "sharesStartPeriod": 213.0,
      "sharesEndPeriod": 190.8,
      "repurchaseHistory": [
        { "year": 2025, "end": "2025-12-31", "amount": 658.1 },
        { "year": 2024, "end": "2024-12-31", "amount": 645.2 },
        { "year": 2023, "end": "2023-12-31", "amount": 212.7 }
      ],
      "sharesHistory": [
        { "year": 2021, "shares": 231.5 },
        { "year": 2022, "shares": 226.1 },
        { "year": 2023, "shares": 217.2 },
        { "year": 2024, "shares": 208.9 },
        { "year": 2025, "shares": 199.1 }
      ],
      "secTable": {
        "headers": ["", "December 31, 2025", "December 31, 2024", "December 31, 2023"],
        "rows": [
          ["Shares repurchased", "12,906,851", "10,907,779", "3,454,694"],
          ["Aggregate cost (in millions)", "$658.1", "$645.2", "$212.7"],
          ["Average price paid (in $)", "$51.0", "$59.2", "$61.6"]
        ]
      }
    },
    "ceoChange": {
      "occurred": false,
      "announcementDate": "AAAA-MM-DD o null",
      "effectiveDate": "AAAA-MM-DD o null",
      "reason": "Motivo declarado del relevo (sucesión planificada, jubilación, dimisión, despido) o null",
      "oldCeo": {
        "name": "Nombre del CEO saliente o null",
        "role": "CEO (periodo en el cargo) o null",
        "tenureStart": "Año o fecha en que asumió como CEO o null",
        "whereTheyGo": "A dónde pasa el CEO saliente (jubilación, presidencia del consejo, otra empresa) o null",
        "salesDuringTenure": "Evolución de las ventas durante su mandato (cifra inicial, final y variación) o null",
        "policies": "Políticas y decisiones destacadas de su etapa según el informe o null"
      },
      "newCeo": {
        "name": "Nombre del CEO entrante o null",
        "origin": "Empresa y puesto del que viene, con el periodo si consta, o null",
        "trackRecord": "Qué hizo en puestos directivos anteriores (fechas y resultados concretos) o null",
        "commitments": "Qué ha dicho que va a hacer o qué prioridades ha anunciado o null"
      },
      "source": "10-K, 8-K/presentación complementaria o ambos"
    },
    "dividends": {
      "history": [
        { "year": 2025, "dps": 1.88, "total": 376.3, "adjustedEps": 5.42 },
        { "year": 2024, "dps": 1.76, "total": 369.2, "adjustedEps": 5.96 },
        { "year": 2023, "dps": 1.64, "total": 354.7, "adjustedEps": 5.8 }
      ],
      "changeType": "increase",
      "changePct": 6.8,
      "changeDate": "febrero de 2026"
    },
    "outlook": {
      "guidanceSales": "Flat +/- 1% constant currency",
      "guidanceEbt": "-15% to -18% decline",
      "guidanceEps": "-11% to -15% decline",
      "guidanceFcf": "$1.1B +/- 10%",
      "guidanceCapex": "$650M +/- 5%",
      "guidanceNetInterest": "$260M +/- 5%",
      "priorYearSales": 11141,
      "priorYearEbt": 1402,
      "priorYearEps": 5.8,
      "priorYearFcf": 1068,
      "priorYearFcfConversion": 88,
      "priorYearCapex": 717,
      "priorYearNetInterest": 230,
      "priorYearOperatingMargin": 13.4,
      "costSavingsPlan": "Programa de ahorro de 450M en 3 años",
      "commodityRisks": "Sensibilidad a aluminio, energía y fletes",
      "secTable": {
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
      "nearTermMaturities": 2364,
      "nearTermRates": "CAD 500M al 3.44% y USD 2.0B al 3.0% vencimiento julio 2026",
      "estimatedRefinancingRate": 5.0,
      "estimatedInterestIncrease": 46,
      "maturitiesSchedule": "2026: 2.364M, 2027: 0.5M, 2028: 0.5M, 2029: 1.7M, 2030: 0.5M, después de 2030: 3.841,6M",
      "maturityAfterFive": 3841.6,
      "maturityItems": [
        { "year": 2026, "label": "CAD 500M 3.44% senior notes", "amount": 364.3, "rate": 3.44, "type": "Senior Notes" },
        { "year": 2026, "label": "$2.0B 3.0% senior notes", "amount": 2000.0, "rate": 3.0, "type": "Senior Notes" },
        { "year": 2029, "label": "CAD 445M 3.44% senior notes", "amount": 1.7, "rate": 3.44, "type": "Senior Notes" }
      ],
      "debtHistory": [
        { "year": 2021, "totalDebt": 7800, "netDebt": 7200 },
        { "year": 2022, "totalDebt": 6900, "netDebt": 6100 },
        { "year": 2023, "totalDebt": 6500, "netDebt": 5700 },
        { "year": 2024, "totalDebt": 6200, "netDebt": 5300 },
        { "year": 2025, "totalDebt": 5900, "netDebt": 4950 }
      ],
      "refinancing": {
        "occurred": true,
        "description": "Amortización de notas al 3.00% y emisión de notas al 5.25%",
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
    }
  },
  "extraNotes": ["*3: ...", "Descripción de partidas extraordinarias o ventas de negocios"]
}`;
