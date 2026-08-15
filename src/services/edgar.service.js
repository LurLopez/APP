import { getMarketProfile } from './market.service.js';

const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const FACTS_URL_TEMPLATE = 'https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json';
const SUBMISSIONS_URL_TEMPLATE = 'https://data.sec.gov/submissions/CIK{CIK}.json';
const USER_AGENT = 'Cifra contacto@cifra.local';

const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;
const FACTS_TTL = 6 * 60 * 60 * 1000;
const FILINGS_TTL = 6 * 60 * 60 * 1000;
const FILINGS_LIMIT = 40;

const STATEMENTS = {
  income: [
    { key: 'revenue', label: 'Ingresos', tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomer'], unit: 'USD' },
    { key: 'costOfRevenue', label: 'Coste de ventas', tags: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'], unit: 'USD', negative: true },
    { key: 'grossProfit', label: 'Beneficio bruto', tags: ['GrossProfit'], unit: 'USD', emphasis: true },
    { key: 'sellingGeneralAdmin', label: 'Gastos de venta, generales y administrativos', tags: ['SellingGeneralAndAdministrativeExpense', 'SellingGeneralAdministrativeAndOtherOperatingExpense'], unit: 'USD', negative: true },
    { key: 'amortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tags: ['AmortizationOfIntangibleAssets', 'AmortizationOfGoodwill'], unit: 'USD', negative: true },
    { key: 'otherOperatingExpenses', label: 'Otros gastos operacionales', tags: ['OtherOperatingIncomeExpenseNet', 'OtherOperatingExpense'], unit: 'USD', negative: true },
    { key: 'operatingExpenses', label: 'Gastos operativos totales', tags: ['OperatingExpenses', 'OperatingExpensesExcludingDepreciationDepletionAndAmortization'], unit: 'USD', negative: true },
    { key: 'operatingIncome', label: 'Beneficio operativo', tags: ['OperatingIncomeLoss'], unit: 'USD', emphasis: true },
    { key: 'interestExpense', label: 'Gastos por intereses', tags: ['InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestExpense'], unit: 'USD', negative: true },
    { key: 'interestIncome', label: 'Ingresos por intereses e inversiones', tags: ['InvestmentIncomeInterest', 'InterestIncomeNonoperating'], unit: 'USD' },
    { key: 'equityMethodIncome', label: 'Ingresos (pérdidas) sobre capital invertido.', tags: ['IncomeLossFromEquityMethodInvestments', 'IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions'], unit: 'USD' },
    { key: 'foreignCurrencyGainLoss', label: 'Ganancias (pérdidas) cambiarias', tags: ['ForeignCurrencyTransactionGainLossBeforeTax', 'ForeignCurrencyTransactionGainLossUnrealized'], unit: 'USD' },
    { key: 'otherNonoperatingIncome', label: 'Ingresos (gastos) no operativos', tags: ['NonoperatingIncomeExpense', 'OtherNonoperatingIncomeExpense'], unit: 'USD' },
    { key: 'pretaxIncome', label: 'EBT excl. Artículos inusuales', tags: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], unit: 'USD' },
    { key: 'mergerRestructuringCharges', label: 'Cargos de fusión y reestructuraciones', tags: ['RestructuringCharges', 'RestructuringAndRelatedCostIncurredCost', 'OtherRestructuringCosts'], unit: 'USD', negative: true },
    { key: 'goodwillImpairment', label: 'Deterioro del fondo de comercio', tags: ['GoodwillImpairmentLoss', 'GoodwillAndIntangibleAssetImpairment'], unit: 'USD', negative: true },
    { key: 'gainLossOnInvestments', label: 'Gain (Loss) On Sale Of Investments', tags: ['GainLossOnSaleOfInvestments', 'GainLossOnSaleOfSecuritiesNet', 'GainLossOnSaleOfEquityInvestments'], unit: 'USD' },
    { key: 'gainLossOnAssets', label: 'Ganancia (pérdida) en la venta de activos', tags: ['GainLossOnSaleOfPropertyPlantEquipment', 'GainLossOnSaleOfOtherAssets', 'GainLossOnSaleOfBusiness'], unit: 'USD' },
    { key: 'assetImpairment', label: 'Devaluación de activos', tags: ['AssetImpairmentCharges', 'ImpairmentOfLongLivedAssetsHeldForUse', 'ImpairmentOfIntangibleAssetsExcludingGoodwill'], unit: 'USD', negative: true },
    { key: 'insuranceSettlements', label: 'Liquidaciones de seguros', tags: ['InsuranceProceeds', 'InsuranceSettlementGainLoss'], unit: 'USD' },
    { key: 'legalSettlements', label: 'Acuerdos legales', tags: ['LitigationSettlementExpense', 'LitigationSettlementAmount'], unit: 'USD', negative: true },
    { key: 'otherUnusualItems', label: 'Otros artículos inusuales', tags: ['UnusualOrInfrequentItemNetGainLoss', 'OtherUnusualOrInfrequentItem'], unit: 'USD' },
    { key: 'ebtIncludingUnusual', label: 'EBT incl. Artículos extraordinarios', unit: 'USD', derived: true },
    { key: 'incomeTax', label: 'Gastos de impuestos', tags: ['IncomeTaxExpenseBenefit'], unit: 'USD', negative: true },
    { key: 'incomeFromContinuingOps', label: 'Beneficios por operaciones continuadas', tags: ['IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest', 'IncomeLossFromContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'discontinuedOperations', label: 'Beneficios por operaciones discontinuadas', tags: ['IncomeLossFromDiscontinuedOperationsNetOfTax'], unit: 'USD' },
    { key: 'netIncome', label: 'Beneficio neto de la empresa', tags: ['NetIncomeLoss', 'ProfitLoss'], unit: 'USD', emphasis: true },
    { key: 'minorityInterestIncome', label: 'Intereses minoritario', tags: ['NetIncomeLossAttributableToNoncontrollingInterest', 'NetIncomeLossAttributableToNoncontrollingInterestBeforeTax'], unit: 'USD' },
    { key: 'netIncomeToCommonIncludingUnusual', label: 'Beneficio neto a acciones comunes incluidos extraordinarios', tags: ['NetIncomeLossAvailableToCommonStockholdersBasic', 'NetIncomeLossAvailableToCommonStockholdersDiluted'], unit: 'USD', emphasis: true },
    { key: 'netIncomeToCommonExcludingUnusual', label: 'Beneficio neto a acciones comunes excluidos extraordinarios', tags: ['NetIncomeLossAvailableToCommonStockholders'], unit: 'USD', emphasis: true },
    { key: 'epsDiluted', label: 'BPA diluido sin extraordinarios', tags: ['EarningsPerShareDiluted'], unit: 'USD/shares', format: 'perShare' },
    { key: 'weightedSharesDiluted', label: 'Promedio ponderado de acciones diluidas en circulación', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'], unit: 'shares', format: 'shares' },
    { key: 'epsBasic', label: 'BPA básico', tags: ['EarningsPerShareBasic'], unit: 'USD/shares', format: 'perShare' },
    { key: 'dividendPerShare', label: 'Dividendo por acción', tags: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'], unit: 'USD/shares', format: 'perShare' },
    { key: 'rentExpense', label: 'Gastos de alquiler', tags: ['RentExpense', 'LeaseAndRentalExpense', 'OperatingLeaseCost'], unit: 'USD', negative: true },
    { key: 'salesMarketing', label: 'Gastos de venta y marketing', tags: ['SellingAndMarketingExpense', 'SellingAndMarketingCosts'], unit: 'USD', negative: true },
    { key: 'ebitda', label: 'EBITDA', unit: 'USD', format: 'money', derived: true },
    { key: 'ebitdar', label: 'EBITDAR', unit: 'USD', format: 'money', derived: true },
  ],
  balance: [
    { key: 'cash', label: 'Efectivo y equivalentes', tags: ['CashAndCashEquivalentsAtCarryingValue'], unit: 'USD' },
    { key: 'shortTermInvestments', label: 'Activos financieros para vender', tags: ['ShortTermInvestments', 'OtherShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'], unit: 'USD' },
    { key: 'cashAndShortTermInvestments', label: 'Efectivo total e inversiones a corto plazo', tags: ['CashCashEquivalentsAndShortTermInvestments'], unit: 'USD', emphasis: true, derived: true },
    { key: 'receivables', label: 'Cuentas por cobrar', tags: ['AccountsReceivableNetCurrent', 'AccountsNotesAndLoansReceivableNetCurrent'], unit: 'USD' },
    { key: 'otherReceivables', label: 'Otros por cobrar', tags: ['OtherReceivables', 'AccountsReceivableOtherCurrent'], unit: 'USD' },
    { key: 'totalReceivables', label: 'Total de cuentas por cobrar', tags: ['AccountsNotesAndLoansReceivableNetCurrent'], unit: 'USD', emphasis: true, derived: true },
    { key: 'inventory', label: 'Inventario', tags: ['InventoryNet'], unit: 'USD' },
    { key: 'prepaidExpenses', label: 'Gastos pagados por anticipado', tags: ['PrepaidExpenseAndOtherAssetsCurrent'], unit: 'USD' },
    { key: 'deferredTaxAssetsCurrent', label: 'Activos por impuestos diferidos Corrientes', tags: ['DeferredTaxAssetsNetCurrent'], unit: 'USD' },
    { key: 'otherCurrentAssets', label: 'Otro activo corriente', tags: ['OtherAssetsCurrent', 'OtherCurrentAssets'], unit: 'USD' },
    { key: 'currentAssets', label: 'Total de activo corriente', tags: ['AssetsCurrent'], unit: 'USD', emphasis: true },
    { key: 'propertyPlantEquipmentGross', label: 'Inmovilizado material bruto', tags: ['PropertyPlantAndEquipmentGross'], unit: 'USD' },
    { key: 'accumulatedDepreciation', label: 'Depreciación acumulada', tags: ['AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment', 'PropertyPlantAndEquipmentOwnedAccumulatedDepreciation'], unit: 'USD', negative: true },
    { key: 'propertyPlantEquipment', label: 'Inmovilizado material neto', tags: ['PropertyPlantAndEquipmentNet'], unit: 'USD', emphasis: true },
    { key: 'longTermInvestments', label: 'Inversiones a largo plazo', tags: ['LongTermInvestments', 'OtherInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent'], unit: 'USD' },
    { key: 'goodwill', label: 'Fondo de comercio', tags: ['Goodwill'], unit: 'USD' },
    { key: 'otherIntangibleAssets', label: 'Otros intangibles', combine: ['FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'], tags: ['IntangibleAssetsNetExcludingGoodwill', 'OtherIntangibleAssetsNet', 'FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'], unit: 'USD' },
    { key: 'longTermReceivables', label: 'Préstamos por cobrar a largo plazo', tags: ['LoansAndNotesReceivableNoncurrent', 'LongTermReceivables'], unit: 'USD' },
    { key: 'deferredTaxAssetsNoncurrent', label: 'Activos por impuestos diferidos a largo plazo', tags: ['DeferredTaxAssetsNetNoncurrent'], unit: 'USD' },
    { key: 'deferredCharges', label: 'Cargos diferidos a largo plazo', tags: ['DeferredCharges', 'OtherDeferredCharges'], unit: 'USD' },
    { key: 'otherAssetsNoncurrent', label: 'Otros activos a largo plazo', tags: ['OtherAssetsNoncurrent'], unit: 'USD' },
    { key: 'assetsNoncurrent', label: 'Activo no corriente', tags: ['AssetsNoncurrent'], unit: 'USD', derived: true },
    { key: 'assets', label: 'Activo total', tags: ['Assets'], unit: 'USD', emphasis: true },
    { key: 'payables', label: 'Cuentas por pagar', tags: ['AccountsPayableCurrent', 'AccountsPayableTradeCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'], unit: 'USD' },
    { key: 'accruedLiabilities', label: 'Gastos devengados', tags: ['AccruedLiabilitiesCurrent', 'EmployeeRelatedLiabilitiesCurrent'], unit: 'USD' },
    { key: 'shortTermLoans', label: 'Préstamos de corto plazo', tags: ['ShortTermBorrowings', 'ShortTermDebt', 'NotesAndLoansPayableCurrent', 'DebtCurrent'], unit: 'USD' },
    { key: 'longTermDebtCurrent', label: 'Porción corriente de la deuda a largo plazo', tags: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'], unit: 'USD' },
    { key: 'currentCapitalLeaseObligations', label: 'Porción corriente de las obligaciones de arrendamiento financiero', tags: ['CapitalLeaseObligationsCurrent', 'FinanceLeaseLiabilityCurrent'], unit: 'USD' },
    { key: 'deferredTaxLiabilitiesCurrent', label: 'Pasivo por impuestos diferidos Corriente', tags: ['DeferredTaxLiabilitiesCurrent'], unit: 'USD' },
    { key: 'otherCurrentLiabilities', label: 'Otros pasivos corrientes', tags: ['OtherLiabilitiesCurrent'], unit: 'USD' },
    { key: 'currentLiabilities', label: 'Total pasivo corriente', tags: ['LiabilitiesCurrent'], unit: 'USD', emphasis: true },
    { key: 'longTermDebt', label: 'Deuda a largo plazo', tags: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebt'], unit: 'USD' },
    { key: 'capitalLeasesNoncurrent', label: 'Arrendamientos de capitales', tags: ['CapitalLeaseObligationsNoncurrent', 'FinanceLeaseLiabilityNoncurrent'], unit: 'USD' },
    { key: 'pensions', label: 'Pensiones y otros beneficios posteriores a la jubilación', tags: ['PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent', 'DefinedBenefitPlanLiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'deferredTaxLiabilitiesNoncurrent', label: 'Pasivo por impuesto diferido no corriente', tags: ['DeferredTaxLiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'otherLiabilitiesNoncurrent', label: 'Otro pasivo no corriente', tags: ['OtherLiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'liabilitiesNoncurrent', label: 'Pasivo no corriente', tags: ['LiabilitiesNoncurrent'], unit: 'USD', derived: true },
    { key: 'liabilities', label: 'Pasivo Total', tags: ['Liabilities'], unit: 'USD', emphasis: true },
    { key: 'commonStock', label: 'Acciones comunes', tags: ['CommonStockValue', 'CommonStockSharesIssued'], unit: 'USD' },
    { key: 'additionalPaidInCapital', label: 'Prima de suscripción', tags: ['AdditionalPaidInCapital', 'AdditionalPaidInCapitalCommonStock'], unit: 'USD' },
    { key: 'retainedEarnings', label: 'Beneficio no distribuido', tags: ['RetainedEarningsAccumulatedDeficit'], unit: 'USD' },
    { key: 'treasuryStock', label: 'Autocartera', tags: ['TreasuryStockValue', 'TreasuryStockValueAcquiredCostMethod'], unit: 'USD', negative: true },
    { key: 'accumulatedOtherComprehensiveIncome', label: 'Resultado integral y otros', tags: ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'], unit: 'USD' },
    { key: 'commonEquity', label: 'Patrimonio neto común total', tags: ['StockholdersEquity'], unit: 'USD', emphasis: true },
    { key: 'minorityInterest', label: 'Intereses minoritarios', tags: ['MinorityInterest', 'MinorityInterestInConsolidatedEntity'], unit: 'USD' },
    { key: 'equity', label: 'Fondos propios totales', tags: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity'], unit: 'USD', emphasis: true },
    { key: 'liabilitiesAndEquity', label: 'Pasivo total y patrimonio neto', tags: ['LiabilitiesAndStockholdersEquity'], unit: 'USD', emphasis: true, derived: true },
    { key: 'sharesOutstanding', label: 'Total de acciones fuera en la fecha de presentación', namespace: 'dei', tags: ['EntityCommonStockSharesOutstanding'], unit: 'shares', format: 'shares' },
    { key: 'bookValuePerShare', label: 'Valor contable / Acción', unit: 'USD/shares', format: 'perShare', derived: true },
    { key: 'tangibleBookValue', label: 'Valor contable tangible', unit: 'USD', derived: true },
    { key: 'tangibleBookValuePerShare', label: 'Tangible Book Value / Share', unit: 'USD/shares', format: 'perShare', derived: true },
    { key: 'totalDebt', label: 'Deuda total', unit: 'USD', derived: true },
    { key: 'netDebt', label: 'Deuda neta', unit: 'USD', derived: true },
    { key: 'equityMethodInvestments', label: 'Inversiones por método de participación', tags: ['EquityMethodInvestments'], unit: 'USD' },
    { key: 'land', label: 'Terrenos', tags: ['Land'], unit: 'USD' },
    { key: 'buildings', label: 'Edificios', tags: ['Buildings'], unit: 'USD' },
    { key: 'constructionInProgress', label: 'Construcción en progreso', tags: ['ConstructionInProgress'], unit: 'USD' },
    { key: 'employees', label: 'Empleados a tiempo completo', namespace: 'dei', tags: ['EntityNumberOfEmployees'], unit: 'employees', format: 'count' },
  ],
  cashflow: [
    { key: 'netIncome', label: 'Beneficio netos', tags: ['NetIncomeLoss', 'ProfitLoss'], unit: 'USD' },
    { key: 'depreciation', label: 'Depreciación y amortización', tags: ['Depreciation', 'DepreciationAndAmortization'], unit: 'USD' },
    { key: 'cashflowAmortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tags: ['AmortizationOfIntangibleAssets', 'AmortizationOfGoodwill'], unit: 'USD' },
    { key: 'depreciationAmortizationTotal', label: 'Depreciación y amortización total', tags: ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet'], unit: 'USD' },
    { key: 'amortizationDeferredCharges', label: 'Amortización de cargos diferidos', tags: ['AmortizationOfDeferredCharges', 'AmortizationOfDeferredFinancingCosts'], unit: 'USD' },
    { key: 'cashflowGainLossOnAssets', label: '(Ganancia) Pérdida por venta de activos', tags: ['GainLossOnSaleOfPropertyPlantEquipment', 'GainLossOnSaleOfOtherAssets'], unit: 'USD', invertSign: true },
    { key: 'cashflowGainLossOnInvestments', label: '(Ganancia) Pérdida por venta de inversiones', tags: ['GainLossOnSaleOfInvestments', 'GainLossOnSaleOfSecuritiesNet'], unit: 'USD', invertSign: true },
    { key: 'impairmentRestructuring', label: 'Deterioro de activos y costes de reestructuración', tags: ['GoodwillAndIntangibleAssetImpairment', 'ImpairmentOfLongLivedAssetsHeldForUse', 'RestructuringCharges', 'RestructuringAndRelatedCostIncurredCost'], unit: 'USD' },
    { key: 'equityMethodCashflow', label: '(Ingresos) Pérdidas en inversiones de capital', tags: ['IncomeLossFromEquityMethodInvestments', 'IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions'], unit: 'USD', invertSign: true },
    { key: 'stockCompensation', label: 'Compensación de stock options', tags: ['ShareBasedCompensation'], unit: 'USD' },
    { key: 'excessTaxBenefitStockOptions', label: 'Beneficio fiscal de las opciones sobre acciones', tags: ['ExcessTaxBenefitFromShareBasedCompensationOperatingActivities', 'EmployeeServiceShareBasedCompensationTaxBenefitFromExerciseOfStockOptions'], unit: 'USD' },
    { key: 'discontinuedOperationsCFO', label: 'Efectivo neto de operaciones discontinuadas', tags: ['CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations'], unit: 'USD' },
    { key: 'otherOperatingActivities', label: 'Otras actividades operativas', tags: ['OtherOperatingActivitiesCashFlowStatement', 'AdjustmentsNoncashItemsToReconcileNetIncomeLossToCashProvidedByUsedInOperatingActivitiesOther'], unit: 'USD' },
    { key: 'changeAccountsReceivable', label: 'Cambio en cuentas por cobrar', tags: ['IncreaseDecreaseInAccountsReceivable', 'IncreaseDecreaseInAccountsAndNotesReceivable'], unit: 'USD' },
    { key: 'changeInventory', label: 'Cambio en inventarios', tags: ['IncreaseDecreaseInInventories', 'IncreaseDecreaseInInventory'], unit: 'USD' },
    { key: 'changeAccountsPayable', label: 'Cambio en cuentas por pagar', tags: ['IncreaseDecreaseInAccountsPayableAndAccruedLiabilities', 'IncreaseDecreaseInAccountsPayable'], unit: 'USD' },
    { key: 'changeOtherOperatingAssets', label: 'Variación en otros activos operativos netos', tags: ['IncreaseDecreaseInOtherOperatingCapitalNet', 'IncreaseDecreaseInOtherOperatingAssets', 'IncreaseDecreaseInOtherOperatingLiabilities'], unit: 'USD' },
    { key: 'cfo', label: 'Efectivo de Operaciones', tags: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'capex', label: 'Gastos de capital', tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], unit: 'USD', negative: true },
    { key: 'salePPE', label: 'Venta de inmovilizado material', tags: ['ProceedsFromSaleOfPropertyPlantAndEquipment', 'ProceedsFromSaleOfProductiveAssets'], unit: 'USD' },
    { key: 'acquisitions', label: 'Adquisiciones con efectivo', tags: ['PaymentsToAcquireBusinessesNetOfCashAcquired', 'PaymentsToAcquireBusinessesAndInterestInAffiliates'], unit: 'USD', negative: true },
    { key: 'divestitures', label: 'Desinversiones', tags: ['ProceedsFromDivestitureOfBusinesses', 'ProceedsFromDivestitureOfBusinessesAndInterestsInAffiliates'], unit: 'USD' },
    { key: 'securitiesInvesting', label: 'Inversión en valores negociables y de renta variable', tags: ['PaymentsToAcquireInvestments', 'PaymentsToAcquireAvailableForSaleSecurities', 'PaymentsToAcquireOtherInvestments'], unit: 'USD', negative: true },
    { key: 'loansInvesting', label: 'Disminución (aumento) neta de préstamos originados / vendidos - Inversión', tags: ['PaymentsToAcquireLoansAndReceivables', 'ProceedsFromSaleOfLoansAndReceivables'], unit: 'USD' },
    { key: 'otherInvestingActivities', label: 'Otras actividades de inversión', tags: ['OtherInvestingActivities', 'PaymentsForProceedsFromOtherInvestingActivities'], unit: 'USD' },
    { key: 'cfi', label: 'Efectivo de la inversión', tags: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'debtIssued', label: 'Deuda total emitida', tags: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromIssuanceOfDebt'], unit: 'USD' },
    { key: 'debtPaid', label: 'Total de la deuda reembolsada', tags: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt', 'RepaymentsOfLongTermDebtAndCapitalLeaseObligations', 'RepaymentsOfDebtAndDebtIssuanceCosts'], unit: 'USD', negative: true },
    { key: 'commonStockIssued', label: 'Emisión de acciones ordinarias', tags: ['ProceedsFromIssuanceOfCommonStock', 'ProceedsFromStockOptionsExercised'], unit: 'USD' },
    { key: 'buybacks', label: 'Recompra de acciones comunes', tags: ['PaymentsForRepurchaseOfCommonStock'], unit: 'USD', negative: true },
    { key: 'dividendsCommon', label: 'Dividendos comunes pagados', tags: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'], unit: 'USD', negative: true },
    { key: 'dividendsPreferred', label: 'Dividendos de acciones comunes y preferentes pagados', tags: ['PaymentsOfDividendsPreferredStock', 'DividendsPreferredStockCash'], unit: 'USD', negative: true },
    { key: 'otherFinancingActivities', label: 'Otras Actividades de Financiamiento', tags: ['OtherFinancingActivities', 'ProceedsFromPaymentsForOtherFinancingActivities'], unit: 'USD' },
    { key: 'cff', label: 'Efectivo de Financiamiento', tags: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'fx', label: 'Ajustes del tipo de cambio de divisas', tags: ['EffectOfExchangeRateOnCashAndCashEquivalents', 'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], unit: 'USD' },
    { key: 'netChangeInCash', label: 'Cambio neto en efectivo', tags: ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect', 'CashAndCashEquivalentsPeriodIncreaseDecrease'], unit: 'USD', emphasis: true },
    { key: 'freeCashFlow', label: 'Flujo de caja libre', unit: 'USD', derived: true },
    { key: 'cashBeginning', label: 'Efectivo y equivalentes de efectivo, comienzo del período', tags: ['CashAndCashEquivalentsAtBeginningOfPeriod'], unit: 'USD' },
    { key: 'cashEnding', label: 'Efectivo y equivalentes de efectivo, fin del período', tags: ['CashAndCashEquivalentsAtEndOfPeriod'], unit: 'USD' },
    { key: 'interestPaid', label: 'Intereses en efectivo pagados', tags: ['InterestPaid', 'InterestPaidNet'], unit: 'USD' },
    { key: 'taxesPaid', label: 'Impuestos en efectivo pagados', tags: ['IncomeTaxesPaid', 'IncomeTaxesPaidNet'], unit: 'USD' },
    { key: 'cashFlowPerShare', label: 'Flujo de caja por acción', unit: 'USD/shares', format: 'perShare', derived: true },
  ],
};

const CONCEPTS = Object.values(STATEMENTS).flat();

const DISPLAY_STATEMENTS = {
  income: [
    { kind: 'section', label: 'Ingresos' },
    { key: 'revenue', label: 'Ingresos totales', emphasis: true },
    { kind: 'change', baseKey: 'revenue', label: '% De cambio interanual' },
    { key: 'costOfRevenue', label: 'Coste de los bienes vendidos', tone: 'negative' },
    { key: 'grossProfit', label: 'Beneficio bruto', emphasis: true },
    { kind: 'change', baseKey: 'grossProfit', label: '% De cambio interanual' },
    { kind: 'margin', baseKey: 'grossProfit', label: '% Márgenes brutos' },
    { key: 'sellingGeneralAdmin', label: 'Gastos de venta generales y administrativos', tone: 'negative' },
    { key: 'amortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tone: 'negative' },
    { key: 'otherOperatingExpenses', label: 'Otros gastos operacionales', tone: 'negative' },
    { key: 'operatingExpenses', label: 'Gastos operativos totales', tone: 'negative', emphasis: true },
    { key: 'operatingIncome', label: 'Beneficio operativo', emphasis: true },
    { kind: 'change', baseKey: 'operatingIncome', label: '% De cambio interanual' },
    { kind: 'margin', baseKey: 'operatingIncome', label: '% Márgenes operativos' },
    { key: 'interestExpense', label: 'Gastos por intereses', tone: 'negative' },
    { key: 'interestIncome', label: 'Ingresos por intereses e inversiones' },
    { key: 'equityMethodIncome', label: 'Ingresos (pérdidas) sobre capital invertido.' },
    { key: 'foreignCurrencyGainLoss', label: 'Ganancias (pérdidas) cambiarias' },
    { key: 'otherNonoperatingIncome', label: 'Ingresos (gastos) no operativos' },
    { key: 'pretaxIncome', label: 'EBT excl. Artículos inusuales', emphasis: true },
    { key: 'mergerRestructuringCharges', label: 'Cargos de fusión y reestructuraciones', tone: 'negative' },
    { key: 'goodwillImpairment', label: 'Deterioro del fondo de comercio', tone: 'negative' },
    { key: 'gainLossOnInvestments', label: 'Gain (Loss) On Sale Of Investments' },
    { key: 'gainLossOnAssets', label: 'Ganancia (pérdida) en la venta de activos' },
    { key: 'assetImpairment', label: 'Devaluación de activos', tone: 'negative' },
    { key: 'insuranceSettlements', label: 'Liquidaciones de seguros' },
    { key: 'legalSettlements', label: 'Acuerdos legales', tone: 'negative' },
    { key: 'otherUnusualItems', label: 'Otros artículos inusuales' },
    { key: 'ebtIncludingUnusual', label: 'EBT incl. Artículos extraordinarios', emphasis: true },
    { key: 'incomeTax', label: 'Gastos de impuestos', tone: 'negative' },
    { key: 'incomeFromContinuingOps', label: 'Beneficios por operaciones continuadas', emphasis: true },
    { key: 'discontinuedOperations', label: 'Beneficios por operaciones discontinuadas' },
    { key: 'netIncome', label: 'Beneficio neto de la empresa', emphasis: true },
    { key: 'minorityInterestIncome', label: 'Intereses minoritario' },
    { key: 'netIncome', label: 'Beneficio neto', emphasis: true },
    { key: 'netIncomeToCommonIncludingUnusual', label: 'Beneficio neto a acciones comunes incluidos extraordinarios', emphasis: true },
    { kind: 'ratio', numeratorKey: 'netIncomeToCommonIncludingUnusual', denominatorKey: 'revenue', label: 'Margen de beneficio neto a acciones comunes incluidos extraordinarios %', italic: true },
    { key: 'netIncomeToCommonExcludingUnusual', label: 'Beneficio neto a acciones comunes excluidos extraordinarios', emphasis: true },
    { kind: 'ratio', numeratorKey: 'netIncomeToCommonExcludingUnusual', denominatorKey: 'revenue', label: 'Margen de beneficio neto a acciones comunes excluidos extraordinarios %', italic: true },
    { kind: 'section', label: 'Datos adicionales:' },
    { key: 'epsDiluted', label: 'BPA diluido sin extraordinarios', format: 'perShare' },
    { kind: 'change', baseKey: 'epsDiluted', label: '% De cambio interanual' },
    { key: 'weightedSharesDiluted', label: 'Promedio ponderado de acciones diluidas en circulación', format: 'shares' },
    { kind: 'change', baseKey: 'weightedSharesDiluted', label: '% De cambio interanual' },
    { key: 'dividendPerShare', label: 'Dividendo por acción', format: 'perShare' },
    { kind: 'change', baseKey: 'dividendPerShare', label: '% De cambio interanual' },
    { kind: 'ratio', numeratorKey: 'dividendPerShare', denominatorKey: 'epsDiluted', label: 'Dividendo pagado sobre el beneficio neto %' },
    { key: 'epsBasic', label: 'BPA básico', format: 'perShare' },
    { key: 'ebitda', label: 'EBITDA' },
    { kind: 'change', baseKey: 'ebitda', label: '% De cambio interanual' },
    { key: 'ebitdar', label: 'EBITDAR' },
    { key: 'salesMarketing', label: 'Gastos de venta y marketing', tone: 'negative' },
    { kind: 'ratio', numeratorKey: 'incomeTax', denominatorKey: 'pretaxIncome', absoluteNumerator: true, label: 'Tasa efectiva de impuestos %' },
  ],
  balance: [
    { key: 'cash', label: 'Efectivo y equivalentes' },
    { key: 'shortTermInvestments', label: 'Activos financieros para vender' },
    { key: 'cashAndShortTermInvestments', label: 'Efectivo total e inversiones a corto plazo', emphasis: true },
    { key: 'receivables', label: 'Cuentas por cobrar' },
    { key: 'otherReceivables', label: 'Otros por cobrar' },
    { key: 'totalReceivables', label: 'Total de cuentas por cobrar', emphasis: true },
    { key: 'inventory', label: 'Inventario' },
    { key: 'prepaidExpenses', label: 'Gastos pagados por anticipado' },
    { key: 'deferredTaxAssetsCurrent', label: 'Activos por impuestos diferidos Corrientes' },
    { key: 'otherCurrentAssets', label: 'Otro activo corriente' },
    { key: 'currentAssets', label: 'Total de activo corriente', emphasis: true },
    { key: 'propertyPlantEquipmentGross', label: 'Inmovilizado material bruto' },
    { key: 'accumulatedDepreciation', label: 'Depreciación acumulada', tone: 'negative' },
    { key: 'propertyPlantEquipment', label: 'Inmovilizado material neto', emphasis: true },
    { key: 'longTermInvestments', label: 'Inversiones a largo plazo' },
    { key: 'goodwill', label: 'Fondo de comercio' },
    { key: 'otherIntangibleAssets', label: 'Otros intangibles' },
    { key: 'longTermReceivables', label: 'Préstamos por cobrar a largo plazo' },
    { key: 'deferredTaxAssetsNoncurrent', label: 'Activos por impuestos diferidos a largo plazo' },
    { key: 'deferredCharges', label: 'Cargos diferidos a largo plazo' },
    { key: 'otherAssetsNoncurrent', label: 'Otros activos a largo plazo' },
    { key: 'assets', label: 'Activo total', emphasis: true },
    { key: 'payables', label: 'Cuentas por pagar' },
    { key: 'accruedLiabilities', label: 'Gastos devengados' },
    { key: 'shortTermLoans', label: 'Préstamos de corto plazo' },
    { key: 'longTermDebtCurrent', label: 'Porción corriente de la deuda a largo plazo' },
    { key: 'currentCapitalLeaseObligations', label: 'Porción corriente de las obligaciones de arrendamiento financiero' },
    { key: 'deferredTaxLiabilitiesCurrent', label: 'Pasivo por impuestos diferidos Corriente' },
    { key: 'otherCurrentLiabilities', label: 'Otros pasivos corrientes' },
    { key: 'currentLiabilities', label: 'Total pasivo corriente', emphasis: true },
    { key: 'longTermDebt', label: 'Deuda a largo plazo' },
    { key: 'capitalLeasesNoncurrent', label: 'Arrendamientos de capitales' },
    { key: 'pensions', label: 'Pensiones y otros beneficios posteriores a la jubilación' },
    { key: 'deferredTaxLiabilitiesNoncurrent', label: 'Pasivo por impuesto diferido no corriente' },
    { key: 'otherLiabilitiesNoncurrent', label: 'Otro pasivo no corriente' },
    { key: 'liabilities', label: 'Pasivo Total', emphasis: true },
    { key: 'commonStock', label: 'Acciones comunes' },
    { key: 'additionalPaidInCapital', label: 'Prima de suscripción' },
    { key: 'retainedEarnings', label: 'Beneficio no distribuido' },
    { key: 'treasuryStock', label: 'Autocartera', tone: 'negative' },
    { key: 'accumulatedOtherComprehensiveIncome', label: 'Resultado integral y otros' },
    { key: 'commonEquity', label: 'Patrimonio neto común total', emphasis: true },
    { key: 'minorityInterest', label: 'Intereses minoritarios' },
    { key: 'equity', label: 'Fondos propios totales', emphasis: true },
    { key: 'liabilitiesAndEquity', label: 'Pasivo total y patrimonio neto', emphasis: true },
    { kind: 'section', label: 'Datos adicionales:' },
    { key: 'sharesOutstanding', label: 'Total de acciones fuera en la fecha de presentación', format: 'shares' },
    { key: 'bookValuePerShare', label: 'Valor contable / Acción', format: 'perShare' },
    { key: 'tangibleBookValue', label: 'Valor contable tangible' },
    { key: 'tangibleBookValuePerShare', label: 'Tangible Book Value / Share', format: 'perShare' },
    { key: 'totalDebt', label: 'Deuda total' },
    { key: 'netDebt', label: 'Deuda neta' },
    { key: 'minorityInterest', label: 'Interés minoritario total' },
    { key: 'equityMethodInvestments', label: 'Inversiones por método de participación' },
    { key: 'land', label: 'Terrenos' },
    { key: 'buildings', label: 'Edificios' },
    { key: 'constructionInProgress', label: 'Construcción en progreso' },
    { key: 'employees', label: 'Empleados a tiempo completo', format: 'count' },
  ],
  cashflow: [
    { key: 'netIncome', label: 'Beneficio netos' },
    { key: 'depreciation', label: 'Depreciación y amortización' },
    { key: 'cashflowAmortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles' },
    { key: 'depreciationAmortizationTotal', label: 'Depreciación y amortización total' },
    { key: 'amortizationDeferredCharges', label: 'Amortización de cargos diferidos' },
    { key: 'cashflowGainLossOnAssets', label: '(Ganancia) Pérdida por venta de activos' },
    { key: 'cashflowGainLossOnInvestments', label: '(Ganancia) Pérdida por venta de inversiones' },
    { key: 'impairmentRestructuring', label: 'Deterioro de activos y costes de reestructuración' },
    { key: 'equityMethodCashflow', label: '(Ingresos) Pérdidas en inversiones de capital' },
    { key: 'stockCompensation', label: 'Compensación de stock options' },
    { key: 'excessTaxBenefitStockOptions', label: 'Beneficio fiscal de las opciones sobre acciones' },
    { key: 'discontinuedOperationsCFO', label: 'Efectivo neto de operaciones discontinuadas' },
    { key: 'otherOperatingActivities', label: 'Otras actividades operativas' },
    { key: 'changeAccountsReceivable', label: 'Cambio en cuentas por cobrar' },
    { key: 'changeInventory', label: 'Cambio en inventarios' },
    { key: 'changeAccountsPayable', label: 'Cambio en cuentas por pagar' },
    { key: 'changeOtherOperatingAssets', label: 'Variación en otros activos operativos netos' },
    { key: 'cfo', label: 'Efectivo de Operaciones', emphasis: true },
    { kind: 'note', label: 'Nota: Cambio en el capital circulante' },
    { key: 'capex', label: 'Gastos de capital', tone: 'negative' },
    { key: 'salePPE', label: 'Venta de inmovilizado material' },
    { key: 'acquisitions', label: 'Adquisiciones con efectivo', tone: 'negative' },
    { key: 'divestitures', label: 'Desinversiones' },
    { key: 'securitiesInvesting', label: 'Inversión en valores negociables y de renta variable', tone: 'negative' },
    { key: 'loansInvesting', label: 'Disminución (aumento) neta de préstamos originados / vendidos - Inversión' },
    { key: 'otherInvestingActivities', label: 'Otras actividades de inversión' },
    { key: 'cfi', label: 'Efectivo de la inversión', emphasis: true },
    { key: 'debtIssued', label: 'Deuda total emitida' },
    { key: 'debtPaid', label: 'Total de la deuda reembolsada', tone: 'negative' },
    { key: 'commonStockIssued', label: 'Emisión de acciones ordinarias' },
    { key: 'buybacks', label: 'Recompra de acciones comunes', tone: 'negative' },
    { key: 'dividendsCommon', label: 'Dividendos comunes pagados', tone: 'negative' },
    { key: 'dividendsPreferred', label: 'Dividendos de acciones comunes y preferentes pagados', tone: 'negative' },
    { key: 'otherFinancingActivities', label: 'Otras Actividades de Financiamiento' },
    { key: 'cff', label: 'Efectivo de Financiamiento', emphasis: true },
    { key: 'fx', label: 'Ajustes del tipo de cambio de divisas' },
    { key: 'netChangeInCash', label: 'Cambio neto en efectivo', emphasis: true },
    { kind: 'section', label: 'Datos adicionales:' },
    { key: 'freeCashFlow', label: 'Flujo de caja libre', emphasis: true },
    { kind: 'change', baseKey: 'freeCashFlow', label: '% De cambio interanual' },
    { kind: 'ratio', numeratorKey: 'freeCashFlow', denominatorKey: 'revenue', label: '% Free Cash Flow Margins', italic: true },
    { key: 'cashBeginning', label: 'Efectivo y equivalentes de efectivo, comienzo del período' },
    { key: 'cashEnding', label: 'Efectivo y equivalentes de efectivo, fin del período' },
    { key: 'interestPaid', label: 'Intereses en efectivo pagados' },
    { key: 'taxesPaid', label: 'Impuestos en efectivo pagados' },
    { key: 'cashFlowPerShare', label: 'Flujo de caja por acción', format: 'perShare' },
  ],
};

function publicStatements() {
  const conceptByKey = new Map(CONCEPTS.map((item) => [item.key, item]));
  return Object.fromEntries(
    Object.entries(DISPLAY_STATEMENTS).map(([statement, items]) => [
      statement,
      items.map((item) => ({
        ...item,
        format: item.format ?? conceptByKey.get(item.key)?.format ?? 'money',
        emphasis: item.emphasis === true,
      })),
    ]),
  );
}

let tickerMapCache = null;

async function fetchSecJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new Error(`EDGAR respondió ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    const wrapped = new Error(`No se pudo consultar EDGAR: ${error.message}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
}

function notFound(message) {
  const error = new Error(message);
  error.code = 'COMPANY_NOT_FOUND';
  return error;
}

async function getTickerMap() {
  if (tickerMapCache && Date.now() - tickerMapCache.at < TICKER_MAP_TTL) {
    return tickerMapCache.data;
  }
  const raw = await fetchSecJson(COMPANY_TICKERS_URL);
  const data = new Map();
  for (const entry of Object.values(raw)) {
    data.set(String(entry.ticker).toUpperCase(), {
      cik: entry.cik_str,
      ticker: String(entry.ticker).toUpperCase(),
      name: entry.title,
    });
  }
  tickerMapCache = { data, at: Date.now() };
  return data;
}

export async function searchCompanies(query, limit = 8) {
  const map = await getTickerMap();
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const all = [...map.values()];
  const exact = all.find((company) => company.ticker === q);
  const byTicker = all
    .filter((company) => company.ticker !== q && company.ticker.startsWith(q))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const byName = all
    .filter((company) => company.ticker !== q && !company.ticker.startsWith(q) && company.name.toUpperCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...(exact ? [exact] : []), ...byTicker, ...byName].slice(0, limit);
}

export async function getCompanyByTicker(ticker) {
  const map = await getTickerMap();
  const company = map.get(ticker.toUpperCase());
  if (!company) {
    throw notFound(`No se encontró la empresa "${ticker}" en EDGAR.`);
  }
  return company;
}

const factsCache = new Map();

async function getCompanyFacts(company) {
  const cached = factsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < FACTS_TTL) {
    return cached.data;
  }
  const url = FACTS_URL_TEMPLATE.replace('{CIK}', String(company.cik).padStart(10, '0'));
  const data = await fetchSecJson(url);
  factsCache.set(company.ticker, { data, at: Date.now() });
  return data;
}

const filingsCache = new Map();

async function getCompanySubmissions(company) {
  const cached = filingsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < FILINGS_TTL) {
    return cached.data;
  }
  const url = SUBMISSIONS_URL_TEMPLATE.replace('{CIK}', String(company.cik).padStart(10, '0'));
  const data = await fetchSecJson(url);
  filingsCache.set(company.ticker, { data, at: Date.now() });
  return data;
}

function latestFactValue(facts, namespace, tags, unit, predicate = () => true) {
  const candidates = [];
  for (const tag of tags) {
    const unitData = facts?.facts?.[namespace]?.[tag]?.units?.[unit];
    if (!Array.isArray(unitData)) continue;
    candidates.push(...unitData.filter((entry) => Number.isFinite(Number(entry.val)) && predicate(Number(entry.val), entry)));
  }
  candidates.sort((a, b) => {
    const end = String(b.end ?? '').localeCompare(String(a.end ?? ''));
    if (end !== 0) return end;
    const start = String(b.start ?? '').localeCompare(String(a.start ?? ''));
    if (start !== 0) return start;
    return String(b.filed ?? '').localeCompare(String(a.filed ?? ''));
  });
  return candidates[0]?.val ?? null;
}

function profileSector(sic) {
  const code = Number(sic);
  if ((code >= 2000 && code <= 2199) || (code >= 2830 && code <= 2836) || (code >= 2840 && code <= 2844)) {
    return 'Consumo defensivo';
  }
  if (Number.isFinite(code)) return '—';
  return null;
}

function profileIndustry(description) {
  const translations = {
    'Malt Beverages': 'Bebidas malteadas',
    'Bottled and Canned Soft Drinks and Carbonated Waters': 'Bebidas refrescantes',
    Cigarettes: 'Cigarrillos',
    'Tobacco Products': 'Productos de tabaco',
    'Grocery Stores': 'Supermercados',
  };
  return translations[description] ?? description ?? null;
}

function profileAddress(submissions) {
  const address = submissions?.addresses?.business ?? submissions?.addresses?.mailing;
  if (!address) return null;
  return [address.street1, address.street2, address.city, address.stateOrCountryDescription, address.zipCode]
    .filter(Boolean)
    .join(', ')
    .replaceAll(' ,', ',');
}

function profileCountry(submissions) {
  const address = submissions?.addresses?.business ?? submissions?.addresses?.mailing;
  if (!address) return null;
  if (address?.isForeignLocation === 1 || address?.countryCode) return address.countryCode ?? address.stateOrCountryDescription ?? '—';
  return 'Estados Unidos';
}

function profileExchange(company, submissions) {
  const tickerIndex = Array.isArray(submissions?.tickers)
    ? submissions.tickers.findIndex((ticker) => ticker === company.ticker)
    : -1;
  return submissions?.exchanges?.[tickerIndex] ?? submissions?.exchanges?.[0] ?? null;
}

function buildCompanyProfile(company, facts, submissions, annual, quarterly, market) {
  const latestStatement = annual[0] ?? quarterly[0] ?? { values: {} };
  const values = latestStatement.values ?? {};
  const latestShares = quarterly[0]?.values?.weightedSharesDiluted
    ?? latestFactValue(facts, 'dei', ['EntityCommonStockSharesOutstanding'], 'shares', (value) => value > 0)
    ?? latestFactValue(facts, 'us-gaap', ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'], 'shares', (value) => value > 0);
  const exchange = profileExchange(company, submissions);
  const industry = profileIndustry(submissions?.sicDescription);
  const address = profileAddress(submissions);
  const shares = latestShares ?? null;
  const marketCap = market?.price && shares ? market.price * shares : null;
  const recentFiling = normalizeRecentFilings(submissions?.filings?.recent)
    .find((entry) => entry.form === '10-Q' || entry.form === '10-K');
  const descriptionParts = [
    exchange ? `${company.name} cotiza en ${exchange}.` : `${company.name} es una empresa cotizada.`,
    industry ? `La SEC la clasifica en ${industry.toLowerCase()}.` : null,
    address ? `Domicilio registrado: ${address}.` : null,
  ].filter(Boolean);

  return {
    market: market ?? {
      currency: 'USD',
      source: 'Yahoo Finance',
      sparkline: [],
    },
    metrics: {
      marketCap,
      week52Low: market?.week52Low ?? null,
      week52High: market?.week52High ?? null,
      beta: market?.beta ?? null,
      dividendPerShare: market?.dividendPerShare ?? null,
      dividendYield: market?.dividendYield ?? null,
      volume: market?.volume ?? null,
      revenue: values.revenue ?? null,
      eps: values.epsDiluted ?? null,
      peRatio: market?.price && values.epsDiluted > 0 ? market.price / values.epsDiluted : null,
      shares,
      yearChangePercent: market?.yearChangePercent ?? null,
      dayLow: market?.dayLow ?? null,
      dayHigh: market?.dayHigh ?? null,
      previousClose: market?.previousClose ?? null,
      ipoDate: market?.ipoDate ?? null,
    },
    info: {
      country: profileCountry(submissions),
      sector: profileSector(submissions?.sic),
      industry,
      exchange,
      fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
      address,
      latestFiling: recentFiling
        ? { formType: recentFiling.form, period: recentFiling.reportDate ?? null, filedAt: recentFiling.filingDate ?? null }
        : null,
    },
    description: descriptionParts.join(' '),
    sources: {
      financial: 'SEC EDGAR',
      market: market?.source ?? 'Yahoo Finance',
    },
  };
}

function filingPeriodLabel(formType, reportDate) {
  if (!reportDate) return '—';
  const year = reportDate.slice(0, 4);
  if (formType === '10-K') return `FY ${year}`;
  const quarter = Math.min(4, Math.ceil(Number(reportDate.slice(5, 7)) / 3));
  return `Q${quarter} ${year}`;
}

function normalizeRecentFilings(recent) {
  if (Array.isArray(recent)) return recent;
  const fields = Object.keys(recent ?? {});
  if (!fields.length) return [];
  const length = fields.reduce((max, field) => Math.max(max, recent[field]?.length ?? 0), 0);
  const entries = [];
  for (let i = 0; i < length; i += 1) {
    const entry = {};
    for (const field of fields) entry[field] = recent[field][i];
    entries.push(entry);
  }
  return entries;
}

export async function getCompanyFilings(ticker) {
  const company = await getCompanyByTicker(ticker);
  const submissions = await getCompanySubmissions(company);
  const recent = normalizeRecentFilings(submissions?.filings?.recent);
  const filings = recent
    .filter((entry) => entry.form === '10-Q' || entry.form === '10-K')
    .filter((entry) => entry.accessionNumber && entry.primaryDocument)
    .slice(0, FILINGS_LIMIT)
    .map((entry) => {
      const accessionNoDashes = entry.accessionNumber.replaceAll('-', '');
      const filedAt = entry.filingDate ?? null;
      const formShort = entry.form.slice(3).toLowerCase();
      const primaryDocument = entry.primaryDocument ?? '';
      const isPdf = primaryDocument.toLowerCase().endsWith('.pdf');
      return {
        formType: entry.form,
        period: entry.reportDate ?? null,
        periodLabel: filingPeriodLabel(entry.form, entry.reportDate),
        filedAt,
        accession: entry.accessionNumber,
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/${primaryDocument}`,
        documentName: `${company.ticker.toLowerCase()}-${formShort}-${filedAt ? filedAt.slice(0, 4) : accessionNoDashes.slice(0, 4)}.${isPdf ? 'pdf' : 'htm'}`,
      };
    });
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    filings,
  };
}

const extensionFactsCache = new Map();
const EXTENSION_FACTS_TTL = 24 * 60 * 60 * 1000;
const EXTENSION_CONCURRENCY = 5;
const EXTENSION_ACQUISITIONS_INCLUDE = /acquisition|acquire/i;
const EXTENSION_ACQUISITIONS_EXCLUDE = /(relatedcost|restructuring|contingent|earnout|remeasurement|recognized|stepacquisition|purchaseaccounting|taxbenefit|stockissued|goodwill|gainorloss|settlement|expense|costs?)/i;

async function fetchSecText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml' },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    throw new Error(`EDGAR respondió ${response.status}`);
  }
  return response.text();
}

function parseInstanceAcquisitions(xml) {
  const periods = new Map();
  const contextPattern = /<context id="([^"]+)"[^>]*>([\s\S]*?)<\/context>/g;
  let match;
  while ((match = contextPattern.exec(xml))) {
    const inner = match[2];
    if (inner.includes('<segment>')) continue;
    const start = inner.match(/<startDate>([^<]+)<\/startDate>/);
    const end = inner.match(/<endDate>([^<]+)<\/endDate>/);
    if (start?.[1] && end?.[1]) periods.set(match[1], { start: start[1], end: end[1] });
  }

  const facts = [];
  const seen = new Set();
  const factPattern = /<([a-zA-Z0-9]+):([A-Za-z0-9_]+)[^>]*?contextRef="([^"]+)"[^>]*?>\s*(-?\d+(?:\.\d+)?)\s*<\/\1:\2>/g;
  while ((match = factPattern.exec(xml))) {
    const tag = match[2];
    if (!EXTENSION_ACQUISITIONS_INCLUDE.test(tag) || EXTENSION_ACQUISITIONS_EXCLUDE.test(tag)) continue;
    const period = periods.get(match[3]);
    if (!period) continue;
    const key = `${match[1]}:${tag}|${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ tag, value: Number(match[4]), start: period.start, end: period.end });
  }
  return facts;
}

async function getFilingInstanceAcquisitions(company, filing) {
  const items = await getFilingIndexItems(company, filing);
  if (!Array.isArray(items)) return [];
  const instanceName = items
    .map((item) => item.name)
    .find((name) => typeof name === 'string' && /_htm\.xml$/i.test(name));
  if (!instanceName) return [];
  const accessionNoDashes = filing.accession.replaceAll('-', '');
  const url = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/${instanceName}`;
  const xml = await fetchSecText(url);
  return xml ? parseInstanceAcquisitions(xml) : [];
}

async function getExtensionAcquisitions(company) {
  const cached = extensionFactsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < EXTENSION_FACTS_TTL) return cached.data;
  const { filings } = await getCompanyFilings(company.ticker);
  const queue = [
    ...filings.filter((filing) => filing.formType === '10-K').slice(0, 8),
    ...filings.filter((filing) => filing.formType === '10-Q').slice(0, 8),
  ];
  const facts = [];
  for (let offset = 0; offset < queue.length; offset += EXTENSION_CONCURRENCY) {
    const batch = queue.slice(offset, offset + EXTENSION_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((filing) => getFilingInstanceAcquisitions(company, filing)));
    for (const result of results) {
      if (result.status === 'fulfilled') facts.push(...result.value);
    }
  }
  extensionFactsCache.set(company.ticker, { data: facts, at: Date.now() });
  return facts;
}

function mergeExtensionAcquisitions(annual, quarterly, facts) {
  if (!facts.length) return;
  const durationDays = (fact) => {
    const startMs = Date.parse(`${fact.start}T00:00:00Z`);
    const endMs = Date.parse(`${fact.end}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    return Math.round((endMs - startMs) / 86400000);
  };
  const factsByEnd = new Map();
  for (const fact of facts) {
    const list = factsByEnd.get(fact.end) ?? [];
    list.push(fact);
    factsByEnd.set(fact.end, list);
  }
  const pick = (end, minDays, maxDays) => {
    const list = factsByEnd.get(end) ?? [];
    return list
      .map((fact) => ({ fact, days: durationDays(fact) }))
      .filter(({ days }) => days !== null && days >= minDays && days <= maxDays)
      .sort((a, b) => b.days - a.days)[0]?.fact ?? null;
  };

  for (const row of annual) {
    if (row.values.acquisitions !== undefined || !row.periodEnd) continue;
    const fact = pick(row.periodEnd, 300, Infinity);
    if (fact) row.values.acquisitions = -Math.abs(fact.value);
  }

  const annualEnds = annual.map((row) => row.periodEnd).filter(Boolean).sort();
  for (const row of quarterly) {
    if (row.values.acquisitions !== undefined || !row.periodEnd) continue;
    const direct = pick(row.periodEnd, 0, 110);
    if (direct) {
      row.values.acquisitions = -Math.abs(direct.value);
      continue;
    }
    const ytd = pick(row.periodEnd, 111, 370);
    if (!ytd) continue;
    const fiscalYearStart = annualEnds.filter((end) => end < row.periodEnd).sort().slice(-1)[0];
    if (!fiscalYearStart) {
      row.values.acquisitions = -Math.abs(ytd.value);
      continue;
    }
    const previousEnd = [...factsByEnd.keys()]
      .filter((end) => end < row.periodEnd && end > fiscalYearStart)
      .sort()
      .slice(-1)[0];
    const previous = previousEnd ? pick(previousEnd, 0, 370) : null;
    if (!previous) {
      row.values.acquisitions = -Math.abs(ytd.value);
      continue;
    }
    const quarterValue = ytd.value - previous.value;
    if (Number.isFinite(quarterValue)) row.values.acquisitions = -Math.abs(quarterValue);
  }
}

const filingIndexCache = new Map();
const FILING_INDEX_TTL = 24 * 60 * 60 * 1000;

const FILINGS_DIR = new URL('../../uploads/generated/filings/', import.meta.url).pathname;
const PREVIEWS_DIR = new URL('../../uploads/generated/filings/previews/', import.meta.url).pathname;
const CHROME_BIN = process.env.CHROME_BIN || 'google-chrome';
const PDFTOPPM_BIN = process.env.PDFTOPPM_BIN || 'pdftoppm';
const PREVIEW_DPI = Number(process.env.PREVIEW_DPI) || 100;

async function ensureFilingsDir() {
  try {
    const fs = await import('node:fs');
    fs.mkdirSync(FILINGS_DIR, { recursive: true });
  } catch {
    // Si no se puede crear, la generación de PDFs fallará con fallback al HTML.
  }
}

function filingPdfFilename(filing) {
  const stem = (filing.documentName ?? 'informe').replace(/\.html?$/, '');
  return `${stem}.pdf`;
}

async function getFilingIndexItems(company, filing) {
  const accessionNoDashes = filing.accession.replaceAll('-', '');
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/index.json`;
  const cached = filingIndexCache.get(indexUrl);
  if (cached && Date.now() - cached.at <= FILING_INDEX_TTL) return cached.data;
  let items = null;
  try {
    const response = await fetch(indexUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const data = await response.json();
      items = data?.directory?.item ?? null;
    }
  } catch {
    items = null;
  }
  filingIndexCache.set(indexUrl, { data: items, at: Date.now() });
  return items;
}

async function findFilingPdfUrl(company, filing) {
  const items = await getFilingIndexItems(company, filing);
  if (!Array.isArray(items)) return null;
  const pdfs = items
    .filter((item) => typeof item.name === 'string' && item.name.toLowerCase().endsWith('.pdf'))
    .map((item) => item.name);
  if (!pdfs.length) return null;
  const stem = filing.documentName.replace(/\.html?$/, '').toLowerCase();
  const match = pdfs.find((name) => name.toLowerCase().replace(/\.pdf$/, '') === stem);
  if (match) return match;
  return pdfs.sort((a, b) => b.length - a.length)[0];
}

async function generateFilingPdf(documentUrl, outPath) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  await execFileAsync(CHROME_BIN, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--user-agent=${USER_AGENT}`,
    `--print-to-pdf=${outPath}`,
    documentUrl,
  ], { timeout: 90000 });
}

async function getFilingPdfPath(company, filing) {
  const fs = await import('node:fs');
  const filePath = `${FILINGS_DIR}${filingPdfFilename(filing)}`;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isFile() && stat.size > 0) return filePath;
  } catch {
    // Continúa y lo genera.
  }
  ensureFilingsDir();

  const realPdf = await findFilingPdfUrl(company, filing);
  if (realPdf) {
    const pdfUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${filing.accession.replaceAll('-', '')}/${realPdf}`;
    try {
      const response = await fetch(pdfUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' },
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) {
        fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
        return filePath;
      }
    } catch {
      // Continúa con la generación vía Chrome.
    }
  }

  try {
    await generateFilingPdf(filing.documentUrl, filePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return filePath;
  } catch {
    // El documento primario HTML será el fallback.
  }
  return null;
}

export async function getFilingDocumentStream(ticker, accession) {
  const { company, filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return null;
  const filename = filingPdfFilename(filing);

  const filePath = await getFilingPdfPath(company, filing);
  if (filePath) {
    const fs = await import('node:fs');
    const { Readable } = await import('node:stream');
    const stat = fs.statSync(filePath);
    return {
      filename,
      stream: Readable.toWeb(fs.createReadStream(filePath)),
      contentType: 'application/pdf',
      contentLength: String(stat.size),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(filing.documentUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/pdf',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`EDGAR respondió ${response.status}`);
    }
    return {
      url: filing.documentUrl,
      filename: filing.documentName,
      stream: response.body,
      contentType: response.headers.get('content-type') ?? 'application/pdf',
      contentLength: response.headers.get('content-length'),
    };
  } catch (error) {
    clearTimeout(timeout);
    const wrapped = new Error(`No se pudo obtener el documento de EDGAR: ${error.message}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
}

export async function getFilingContentBuffer(ticker, accession) {
  const { company, filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return null;
  const filePath = await getFilingPdfPath(company, filing);
  if (filePath) {
    const fs = await import('node:fs');
    return { filing, buffer: fs.readFileSync(filePath), kind: 'pdf' };
  }
  const response = await fetch(filing.documentUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/pdf' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const wrapped = new Error(`No se pudo obtener el documento de EDGAR: ${response.status}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
  const contentType = response.headers.get('content-type') ?? '';
  return {
    filing,
    buffer: Buffer.from(await response.arrayBuffer()),
    kind: contentType.includes('pdf') ? 'pdf' : 'html',
  };
}

export async function getFilingPreview(ticker, accession) {
  const { company, filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return null;
  const filename = filingPdfFilename(filing);

  const pdfPath = await getFilingPdfPath(company, filing);
  if (!pdfPath) return { filename, pages: 0 };

  const fs = await import('node:fs');
  const previewDir = `${PREVIEWS_DIR}${filing.accession.replaceAll('-', '')}/`;
  fs.mkdirSync(previewDir, { recursive: true });

  let pages = fs.readdirSync(previewDir).filter((name) => name.endsWith('.png'));
  if (!pages.length) {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(execFile)(PDFTOPPM_BIN, ['-png', '-r', String(PREVIEW_DPI), pdfPath, `${previewDir}page`], { timeout: 180000 });
      pages = fs.readdirSync(previewDir).filter((name) => name.endsWith('.png'));
    } catch (error) {
      const wrapped = new Error(`No se pudo generar la vista previa: ${error.message}`);
      wrapped.code = 'PREVIEW_UNAVAILABLE';
      throw wrapped;
    }
  }
  return { filename, pages: pages.length };
}

function combineConceptData(namespaceFacts, tags, unit) {
  const byFrame = new Map();
  for (const tag of tags) {
    const unitData = namespaceFacts[tag]?.units?.[unit];
    if (!Array.isArray(unitData)) continue;
    const latestPerFrame = new Map();
    for (const entry of unitData) {
      if (!entry.frame || !classifyFrame(entry.frame)) continue;
      const current = latestPerFrame.get(entry.frame);
      if (!current || (entry.filed ?? '') > (current.filed ?? '')) latestPerFrame.set(entry.frame, entry);
    }
    for (const [frame, entry] of latestPerFrame) {
      byFrame.set(frame, (byFrame.get(frame) ?? 0) + Number(entry.val));
    }
  }
  if (!byFrame.size) return null;
  return [...byFrame].map(([frame, val]) => ({ frame, val }));
}

function pickConceptData(facts, concept) {
  if (!Array.isArray(concept.tags) || !concept.tags.length) return null;
  const namespaceFacts = facts?.facts?.[concept.namespace ?? 'us-gaap'] ?? {};
  const combineSet = new Set(concept.combine ?? []);

  const combined = combineSet.size
    ? combineConceptData(namespaceFacts, [...combineSet], concept.unit)
    : null;

  const bestByFrame = new Map();
  const noFrameEntries = [];

  for (const tag of concept.tags) {
    if (combineSet.has(tag)) continue;
    const unitData = namespaceFacts[tag]?.units?.[concept.unit];
    if (!Array.isArray(unitData)) continue;
    for (const entry of unitData) {
      if (!entry.frame) {
        noFrameEntries.push(entry);
        continue;
      }
      const current = bestByFrame.get(entry.frame);
      if (!current || (entry.filed ?? '') > (current.filed ?? '')) bestByFrame.set(entry.frame, entry);
    }
  }

  const result = [];
  for (const entry of bestByFrame.values()) result.push(entry);
  for (const item of combined ?? []) {
    if (!bestByFrame.has(item.frame)) result.push(item);
  }
  result.push(...noFrameEntries);
  result.sort((a, b) => String(a.filed ?? '').localeCompare(String(b.filed ?? '')));
  return result.length ? result : null;
}

function normalizeConceptValue(concept, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (concept.negative) return -Math.abs(number);
  if (concept.invertSign) return -number;
  return number;
}

function classifyFrame(frame) {
  const annual = frame.match(/^CY(\d{4})$/);
  if (annual) return { series: 'annual', key: annual[1], sortKey: Number(annual[1]) * 10, isInstant: false };

  const quarterly = frame.match(/^CY(\d{4})Q([1-4])(I?)$/);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const quarter = Number(quarterly[2]);
    return { series: 'quarterly', key: `${year}-Q${quarter}`, sortKey: year * 10 + quarter, isInstant: quarterly[3] === 'I' };
  }
  return null;
}

function buildSeries(facts) {
  const rows = new Map();

  const setPeriodEnd = (row, end) => {
    if (typeof end !== 'string') return;
    row.periodEndCounts ??= new Map();
    row.periodEndCounts.set(end, (row.periodEndCounts.get(end) ?? 0) + 1);
    let best = null;
    for (const [candidate, count] of row.periodEndCounts) {
      if (best === null || count > row.periodEndCounts.get(best) || (count === row.periodEndCounts.get(best) && candidate > best)) {
        best = candidate;
      }
    }
    row.periodEnd = best;
  };

  const setPeriodStart = (row, start) => {
    if (typeof start === 'string' && (!row.periodStart || start < row.periodStart)) row.periodStart = start;
  };

  const ensureRow = (key, series, sortKey) => {
    if (!rows.has(key)) {
      rows.set(key, { series, sortKey, period: key, periodStart: null, periodEnd: null, values: {} });
    }
    return rows.get(key);
  };

  const durationDays = (start, end) => {
    if (typeof start !== 'string' || typeof end !== 'string') return null;
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    return Math.round((endMs - startMs) / 86400000);
  };

  const annualYearOf = (end) => {
    if (typeof end !== 'string' || end.length < 4) return null;
    const year = Number(end.slice(0, 4));
    const month = Number(end.slice(5, 7));
    if (!Number.isFinite(year)) return null;
    return Number.isFinite(month) && month <= 2 ? year - 1 : year;
  };

  for (const concept of CONCEPTS) {
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;

    for (const entry of unitData) {
      if (!entry.frame) continue;
      const classified = classifyFrame(entry.frame);
      if (!classified) continue;
      const row = ensureRow(classified.key, classified.series, classified.sortKey);
      if (concept.namespace !== 'dei') {
        setPeriodEnd(row, entry.end);
        setPeriodStart(row, entry.start);
      }
      row.values[concept.key] = normalizeConceptValue(concept, entry.val);
    }
  }

  const conceptByKey = new Map(CONCEPTS.map((concept) => [concept.key, concept]));
  const flowKeys = new Set([...STATEMENTS.income, ...STATEMENTS.cashflow].map((concept) => concept.key));
  const instantKeys = new Set([...STATEMENTS.balance].map((concept) => concept.key));
  const nonAdditiveKeys = new Set(
    CONCEPTS.filter((concept) => concept.format && concept.format !== 'money').map((concept) => concept.key),
  );

  const annualRows = [...rows.values()].filter((row) => row.series === 'annual');

  for (const concept of CONCEPTS) {
    if (concept.namespace === 'dei') continue;
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;

    for (const entry of unitData) {
      if (entry.frame) continue;
      const days = durationDays(entry.start, entry.end);
      if (entry.fp !== 'FY' || days === null || days < 300) continue;
      const target = annualRows.find((row) => row.periodEnd === entry.end)
        ?? annualRows.find((row) => row.periodStart === entry.start && row.periodEnd === null)
        ?? null;
      if (target) {
        if (target.values[concept.key] === undefined) target.values[concept.key] = normalizeConceptValue(concept, entry.val);
        continue;
      }
      const year = annualYearOf(entry.end);
      if (year === null) continue;
      const annualRow = ensureRow(String(year), 'annual', year * 10);
      setPeriodEnd(annualRow, entry.end);
      setPeriodStart(annualRow, entry.start);
      annualRow.values[concept.key] = normalizeConceptValue(concept, entry.val);
    }
  }

  const annualRowsForInstants = [...rows.values()].filter((row) => row.series === 'annual');

  for (const concept of CONCEPTS) {
    if (!instantKeys.has(concept.key)) continue;
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;
    for (const entry of unitData) {
      if (entry.frame) {
        if (!/^CY\d{4}Q[1-4]I$/.test(entry.frame)) continue;
      } else if (entry.fp !== 'FY' || typeof entry.end !== 'string') {
        continue;
      }
      const target = annualRowsForInstants.find((row) => row.periodEnd === entry.end);
      if (!target) continue;
      if (target.values[concept.key] === undefined) {
        target.values[concept.key] = normalizeConceptValue(concept, entry.val);
      }
    }
  }

  for (const concept of CONCEPTS) {
    if (concept.namespace !== 'dei') continue;
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;
    for (const entry of unitData) {
      if (entry.frame) {
        const classified = classifyFrame(entry.frame);
        if (classified) {
          const row = ensureRow(classified.key, classified.series, classified.sortKey);
          row.values[concept.key] = normalizeConceptValue(concept, entry.val);
        }
      }
      if (entry.fp !== 'FY') continue;
      const target = annualRows
        .filter((row) => !row.periodEnd || !entry.end || row.periodEnd <= entry.end)
        .sort((a, b) => String(b.periodEnd ?? '').localeCompare(String(a.periodEnd ?? '')))[0];
      if (target) {
        target.values[concept.key] = normalizeConceptValue(concept, entry.val);
      } else if (typeof entry.end === 'string' && entry.end.length >= 4) {
        const year = Number.isFinite(Number(entry.fy)) ? String(entry.fy) : entry.end.slice(0, 4);
        const annualRow = ensureRow(year, 'annual', Number(year) * 10);
        annualRow.values[concept.key] = normalizeConceptValue(concept, entry.val);
      }
    }
  }

  for (const annualRow of annualRows) {
    if (!annualRow.periodStart || !annualRow.periodEnd) continue;
    const fiscalQuarters = [...rows.values()]
      .filter((row) => row.series === 'quarterly' && row.periodEnd
        && row.periodEnd > annualRow.periodStart && row.periodEnd <= annualRow.periodEnd)
      .sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)));
    if (fiscalQuarters.length !== 4) continue;
    const [q1, q2, q3, q4] = fiscalQuarters;
    if (q4.periodEnd !== annualRow.periodEnd) continue;
    const cumulative = Boolean(q1.periodStart && q2.periodStart) && q1.periodStart === q2.periodStart;
    for (const [key, annualValue] of Object.entries(annualRow.values)) {
      if (q4.values[key] !== undefined) continue;
      if (annualValue === null || annualValue === undefined) continue;
      const concept = conceptByKey.get(key);
      if (!concept || concept.namespace === 'dei') continue;
      if (instantKeys.has(key)) {
        q4.values[key] = annualValue;
        continue;
      }
      if (!flowKeys.has(key) || nonAdditiveKeys.has(key)) continue;
      if (cumulative) {
        if (q3.values[key] === undefined) continue;
        const result = Number(annualValue) - Number(q3.values[key]);
        if (Number.isFinite(result)) q4.values[key] = Math.round(result * 1e6) / 1e6;
        continue;
      }
      const a = Number(q1.values[key]);
      const b = Number(q2.values[key]);
      const c = Number(q3.values[key]);
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
      const result = Number(annualValue) - a - b - c;
      if (Number.isFinite(result)) q4.values[key] = Math.round(result * 1e6) / 1e6;
    }
  }

  const all = [...rows.values()].sort((a, b) => b.sortKey - a.sortKey);
  const annual = all.filter((row) => row.series === 'annual').slice(0, 10);
  const quarterly = all.filter((row) => row.series === 'quarterly').slice(0, 8);

  const sumValues = (values, keys) => {
    const available = keys
      .map((key) => Number(values[key]))
      .filter((value) => Number.isFinite(value));
    return available.length ? available.reduce((sum, value) => sum + value, 0) : undefined;
  };

  const setDerived = (values, key, calculate) => {
    if (values[key] !== undefined) return;
    const result = calculate(values);
    if (Number.isFinite(result)) values[key] = Math.round(result * 1e6) / 1e6;
  };

  all.forEach((row) => {
    const values = row.values;

    setDerived(values, 'grossProfit', (data) => sumValues(data, ['revenue', 'costOfRevenue']));
    setDerived(values, 'otherOperatingExpenses', (data) => {
      const operatingIncome = Number(data.operatingIncome);
      const grossProfit = Number(data.grossProfit);
      const sellingGeneralAdmin = Number(data.sellingGeneralAdmin);
      const amortization = Number(data.amortizationGoodwillIntangibles) || 0;
      return Number.isFinite(operatingIncome) && Number.isFinite(grossProfit) && Number.isFinite(sellingGeneralAdmin)
        ? operatingIncome - grossProfit - sellingGeneralAdmin - amortization
        : undefined;
    });
    setDerived(values, 'operatingExpenses', (data) => sumValues(data, ['sellingGeneralAdmin', 'amortizationGoodwillIntangibles', 'otherOperatingExpenses']));
    setDerived(values, 'operatingIncome', (data) => sumValues(data, ['grossProfit', 'operatingExpenses']));
    setDerived(values, 'pretaxIncome', (data) => sumValues(data, ['operatingIncome', 'interestExpense', 'interestIncome', 'equityMethodIncome', 'foreignCurrencyGainLoss', 'otherNonoperatingIncome']));
    setDerived(values, 'ebtIncludingUnusual', (data) => sumValues(data, ['pretaxIncome', 'mergerRestructuringCharges', 'goodwillImpairment', 'gainLossOnInvestments', 'gainLossOnAssets', 'assetImpairment', 'insuranceSettlements', 'legalSettlements', 'otherUnusualItems']));
    setDerived(values, 'incomeFromContinuingOps', (data) => sumValues(data, ['pretaxIncome', 'incomeTax']));
    setDerived(values, 'netIncome', (data) => sumValues(data, ['incomeFromContinuingOps', 'discontinuedOperations']));
    setDerived(values, 'netIncomeToCommonIncludingUnusual', (data) => {
      const netIncome = Number(data.netIncome);
      const minority = Number(data.minorityInterestIncome);
      return Number.isFinite(netIncome) ? netIncome - (Number.isFinite(minority) ? minority : 0) : undefined;
    });
    setDerived(values, 'netIncomeToCommonExcludingUnusual', (data) => data.netIncomeToCommonIncludingUnusual);
    setDerived(values, 'ebitda', (data) => {
      const depreciation = data.depreciationAmortizationTotal ?? sumValues(data, ['depreciation', 'cashflowAmortizationGoodwillIntangibles']);
      return Number.isFinite(Number(data.operatingIncome)) && Number.isFinite(Number(depreciation))
        ? Number(data.operatingIncome) + Number(depreciation)
        : undefined;
    });
    setDerived(values, 'ebitdar', (data) => Number.isFinite(Number(data.ebitda)) && Number.isFinite(Number(data.rentExpense))
      ? Number(data.ebitda) - Number(data.rentExpense)
      : undefined);

    setDerived(values, 'cashAndShortTermInvestments', (data) => sumValues(data, ['cash', 'shortTermInvestments']));
    setDerived(values, 'totalReceivables', (data) => sumValues(data, ['receivables', 'otherReceivables']));
    setDerived(values, 'propertyPlantEquipment', (data) => sumValues(data, ['propertyPlantEquipmentGross', 'accumulatedDepreciation']));
    setDerived(values, 'assetsNoncurrent', (data) => Number.isFinite(Number(data.assets)) && Number.isFinite(Number(data.currentAssets))
      ? Number(data.assets) - Number(data.currentAssets)
      : undefined);
    setDerived(values, 'commonEquity', (data) => Number.isFinite(Number(data.equity))
      ? Number(data.equity) - (Number.isFinite(Number(data.minorityInterest)) ? Number(data.minorityInterest) : 0)
      : undefined);
    setDerived(values, 'equity', (data) => sumValues(data, ['commonEquity', 'minorityInterest']));
    setDerived(values, 'liabilities', (data) => Number.isFinite(Number(data.assets)) && Number.isFinite(Number(data.equity))
      ? Number(data.assets) - Number(data.equity)
      : undefined);
    setDerived(values, 'liabilitiesNoncurrent', (data) => Number.isFinite(Number(data.liabilities)) && Number.isFinite(Number(data.currentLiabilities))
      ? Number(data.liabilities) - Number(data.currentLiabilities)
      : undefined);
    setDerived(values, 'liabilitiesAndEquity', (data) => sumValues(data, ['liabilities', 'equity']) ?? data.assets);
    setDerived(values, 'tangibleBookValue', (data) => {
      const commonEquity = Number(data.commonEquity);
      if (!Number.isFinite(commonEquity)) return undefined;
      return commonEquity - (Number(data.goodwill) || 0) - (Number(data.otherIntangibleAssets) || 0);
    });
    setDerived(values, 'totalDebt', (data) => sumValues(data, ['shortTermLoans', 'longTermDebtCurrent', 'currentCapitalLeaseObligations', 'longTermDebt', 'capitalLeasesNoncurrent']));
    setDerived(values, 'netDebt', (data) => Number.isFinite(Number(data.totalDebt)) && Number.isFinite(Number(data.cashAndShortTermInvestments))
      ? Number(data.totalDebt) - Number(data.cashAndShortTermInvestments)
      : undefined);
    setDerived(values, 'bookValuePerShare', (data) => Number.isFinite(Number(data.commonEquity)) && Number(data.sharesOutstanding) > 0
      ? Number(data.commonEquity) / Number(data.sharesOutstanding)
      : undefined);
    setDerived(values, 'tangibleBookValuePerShare', (data) => Number.isFinite(Number(data.tangibleBookValue)) && Number(data.sharesOutstanding) > 0
      ? Number(data.tangibleBookValue) / Number(data.sharesOutstanding)
      : undefined);

    setDerived(values, 'cfi', (data) => sumValues(data, ['capex', 'salePPE', 'acquisitions', 'divestitures', 'securitiesInvesting', 'loansInvesting', 'otherInvestingActivities']));
    setDerived(values, 'cff', (data) => sumValues(data, ['debtIssued', 'debtPaid', 'commonStockIssued', 'buybacks', 'dividendsCommon', 'dividendsPreferred', 'otherFinancingActivities']));
    setDerived(values, 'netChangeInCash', (data) => sumValues(data, ['cfo', 'cfi', 'cff', 'fx']));
    setDerived(values, 'freeCashFlow', (data) => sumValues(data, ['cfo', 'capex']));
    setDerived(values, 'cashEnding', (data) => data.cash);
    setDerived(values, 'cashBeginning', (data) => Number.isFinite(Number(data.cashEnding)) && Number.isFinite(Number(data.netChangeInCash))
      ? Number(data.cashEnding) - Number(data.netChangeInCash)
      : undefined);
    setDerived(values, 'cashFlowPerShare', (data) => Number.isFinite(Number(data.freeCashFlow)) && Number(data.weightedSharesDiluted) > 0
      ? Number(data.freeCashFlow) / Number(data.weightedSharesDiluted)
      : undefined);
  });

  const annualAscending = all.filter((row) => row.series === 'annual').sort((a, b) => a.sortKey - b.sortKey);
  for (let index = 1; index < annualAscending.length; index += 1) {
    const row = annualAscending[index];
    if (row.values.cashBeginning !== undefined) continue;
    const previous = annualAscending[index - 1]?.values?.cashEnding;
    if (Number.isFinite(Number(previous))) row.values.cashBeginning = Number(previous);
  }
  const quarterlyAscending = all.filter((row) => row.series === 'quarterly').sort((a, b) => a.sortKey - b.sortKey);
  for (let index = 1; index < quarterlyAscending.length; index += 1) {
    const row = quarterlyAscending[index];
    if (row.values.cashBeginning !== undefined) continue;
    const previous = quarterlyAscending[index - 1]?.values?.cashEnding;
    if (Number.isFinite(Number(previous))) row.values.cashBeginning = Number(previous);
  }

  all.forEach((row) => {
    delete row.periodEndCounts;
  });

  return { annual, quarterly };
}

export async function getCompanyResults(ticker, options = {}) {
  const company = await getCompanyByTicker(ticker);
  const [facts, submissions, market] = await Promise.all([
    getCompanyFacts(company),
    getCompanySubmissions(company).catch(() => null),
    getMarketProfile(company.ticker).catch(() => null),
  ]);
  const { annual, quarterly } = buildSeries(facts);
  const hasStandardAcquisitions = annual.some((row) => row.values.acquisitions !== undefined)
    || quarterly.some((row) => row.values.acquisitions !== undefined);
  if (!hasStandardAcquisitions) {
    try {
      const extensionFacts = await getExtensionAcquisitions(company);
      mergeExtensionAcquisitions(annual, quarterly, extensionFacts);
    } catch {
      // Si falla el rescate de datos de extensión, se devuelven solo los estándar.
    }
  }
  const authenticated = options.authenticated === true;
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    currency: 'USD',
    authenticated,
    profile: buildCompanyProfile(company, facts, submissions ?? {}, annual, quarterly, market),
    statements: publicStatements(),
    annual,
    quarterly,
  };
}
