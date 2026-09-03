import { getMarketProfile, getHistoricalPrices } from './market.service.js';

const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const FACTS_URL_TEMPLATE = 'https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json';
const SUBMISSIONS_URL_TEMPLATE = 'https://data.sec.gov/submissions/CIK{CIK}.json';
const USER_AGENT = 'CifraApp dev@cifra-terminal.com';

const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;
const FACTS_TTL = 6 * 60 * 60 * 1000;
const FILINGS_TTL = 6 * 60 * 60 * 1000;
const FILINGS_LIMIT = 40;

const STATEMENTS = {
  valuation: [
    { key: 'evToEbitda', label: 'EV / EBITDA', unit: 'multiple', format: 'multiple', derived: true },
    { key: 'peRatio', label: 'PER', unit: 'multiple', format: 'multiple', derived: true },
    { key: 'priceToFcf', label: 'P / FCF', unit: 'multiple', format: 'multiple', derived: true },
    { key: 'dividendYield', label: 'Yield del dividendo %', unit: '%', format: 'ratio', derived: true },
    { key: 'payoutRatio', label: 'Payout del dividendo %', unit: '%', format: 'ratio', derived: true },
    { key: 'netDebtToEbitda', label: 'Deuda Neta / EBITDA', unit: 'multiple', format: 'multiple', derived: true },
    { key: 'marketCap', label: 'Capitalización de mercado', unit: 'USD', format: 'money', derived: true },
    { key: 'enterpriseValue', label: 'Enterprise Value (EV)', unit: 'USD', format: 'money', derived: true },
  ],
  income: [
    { key: 'revenue', label: 'Ingresos', tags: ['RevenueFromContractWithCustomerIncludingAssessedTax', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'Revenues', 'RevenueFromContractWithCustomer', 'TotalRevenuesAndOtherIncome', 'OperatingRevenue', 'OperatingRevenues', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RealEstateRevenueNet', 'RegulatedOperatingRevenue', 'FinancialServicesRevenue'], unit: 'USD' },
    { key: 'costOfRevenue', label: 'Coste de ventas', tags: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfServices', 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization'], unit: 'USD', negative: true },
    { key: 'grossProfit', label: 'Beneficio bruto', tags: ['GrossProfit'], unit: 'USD', emphasis: true },
    { key: 'sellingGeneralAdmin', label: 'Gastos de venta, generales y administrativos', tags: ['SellingGeneralAndAdministrativeExpense', 'SellingGeneralAdministrativeAndOtherOperatingExpense'], unit: 'USD', negative: true },
    { key: 'researchDevelopment', label: 'Gastos de I+D', tags: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], unit: 'USD', negative: true },
    { key: 'amortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tags: ['AmortizationOfIntangibleAssets', 'AmortizationOfGoodwill'], unit: 'USD', negative: true },
    { key: 'otherOperatingExpenses', label: 'Otros gastos operacionales', tags: ['OtherOperatingIncomeExpenseNet', 'OtherOperatingExpense'], unit: 'USD', negative: true },
    { key: 'operatingExpenses', label: 'Gastos operativos totales', tags: ['OperatingExpenses', 'OperatingExpensesExcludingDepreciationDepletionAndAmortization'], unit: 'USD', negative: true },
    { key: 'operatingIncome', label: 'Beneficio operativo', tags: ['OperatingIncomeLoss'], unit: 'USD', emphasis: true },
    { key: 'interestExpense', label: 'Gastos por intereses', tags: ['InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestExpense'], unit: 'USD', negative: true },
    { key: 'interestIncome', label: 'Ingresos por intereses e inversiones', tags: ['InvestmentIncomeInterest', 'InterestIncomeNonoperating'], unit: 'USD' },
    { key: 'equityMethodIncome', label: 'Ingresos (pérdidas) sobre capital invertido.', tags: ['IncomeLossFromEquityMethodInvestments', 'IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions'], unit: 'USD' },
    { key: 'foreignCurrencyGainLoss', label: 'Ganancias (pérdidas) cambiarias', tags: ['ForeignCurrencyTransactionGainLossBeforeTax', 'ForeignCurrencyTransactionGainLossUnrealized'], unit: 'USD' },
    { key: 'otherNonoperatingIncome', label: 'Ingresos (gastos) no operativos', tags: ['NonoperatingIncomeExpense', 'OtherNonoperatingIncomeExpense'], unit: 'USD' },
    { key: 'pretaxIncome', label: 'EBT excl. Artículos inusuales', unit: 'USD', derived: true },
    { key: 'mergerRestructuringCharges', label: 'Cargos de fusión y reestructuraciones', tags: ['RestructuringCharges', 'RestructuringAndRelatedCostIncurredCost', 'OtherRestructuringCosts', 'BusinessRestructuringCharges', 'RestructuringCosts', 'RestructuringSettlementAndImpairmentProvisions'], unit: 'USD', negative: true },
    { key: 'goodwillImpairment', label: 'Deterioro del fondo de comercio', tags: ['GoodwillImpairmentLoss', 'GoodwillAndIntangibleAssetImpairment'], unit: 'USD', negative: true },
    { key: 'gainLossOnInvestments', label: 'Gain (Loss) On Sale Of Investments', combine: ['GainLossOnSaleOfInvestments', 'InvestmentIncomeNet'], tags: ['GainLossOnSaleOfInvestments', 'InvestmentIncomeNet', 'GainLossOnSaleOfSecuritiesNet', 'GainLossOnSaleOfEquityInvestments', 'DebtAndEquitySecuritiesUnrealizedGainLossExcludingOtherThanTemporaryImpairment', 'GainLossOnInvestments', 'MarketableSecuritiesGainLoss', 'FairValueOptionChangesInFairValueGainLoss1'], unit: 'USD' },
    { key: 'gainLossOnAssets', label: 'Ganancia (pérdida) en la venta de activos', tags: ['GainLossOnSaleOfPropertyPlantEquipment', 'GainLossOnSaleOfOtherAssets', 'GainLossOnSaleOfBusiness'], unit: 'USD' },
    { key: 'assetImpairment', label: 'Devaluación de activos', tags: ['ImpairmentOfIntangibleAssetsExcludingGoodwill', 'ImpairmentOfIntangibleAssetsIndefinitelivedExcludingGoodwill', 'ImpairmentOfIntangibleAssetsFinitelived', 'ImpairmentOfLongLivedAssetsHeldForUse', 'AssetImpairmentCharges', 'OtherAssetImpairmentCharges', 'ImpairmentOfInvestments'], unit: 'USD', negative: true },
    { key: 'insuranceSettlements', label: 'Liquidaciones de seguros', tags: ['InsuranceProceeds', 'InsuranceSettlementGainLoss'], unit: 'USD' },
    { key: 'legalSettlements', label: 'Acuerdos legales', tags: ['LitigationSettlementExpense', 'LitigationSettlementAmount'], unit: 'USD', negative: true },
    { key: 'otherUnusualItems', label: 'Otros artículos inusuales', tags: ['UnusualOrInfrequentItemNetGainLoss', 'OtherUnusualOrInfrequentItem'], unit: 'USD' },
    { key: 'ebtIncludingUnusual', label: 'EBT incl. Artículos extraordinarios', tags: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxes'], unit: 'USD', emphasis: true },
    { key: 'incomeTax', label: 'Gastos de impuestos', tags: ['IncomeTaxExpenseBenefit'], unit: 'USD', invertSign: true },
    { key: 'incomeFromContinuingOps', label: 'Beneficios por operaciones continuadas', tags: ['IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest', 'IncomeLossFromContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'discontinuedOperations', label: 'Beneficios por operaciones discontinuadas', tags: ['IncomeLossFromDiscontinuedOperationsNetOfTax'], unit: 'USD' },
    { key: 'netIncome', label: 'Beneficio neto de la empresa', tags: ['ProfitLoss', 'NetIncomeLoss'], unit: 'USD', emphasis: true },
    { key: 'minorityInterestIncome', label: 'Intereses minoritario', tags: ['NetIncomeLossAttributableToNoncontrollingInterest', 'NetIncomeLossAttributableToNoncontrollingInterestBeforeTax'], unit: 'USD', invertSign: true },
    { key: 'preferredDividendsOtherAdjustments', label: 'Dividendo preferente y otros ajustes', tags: ['PreferredStockDividendsAndOtherAdjustments', 'DividendsPreferredStockCash'], unit: 'USD', negative: true },
    { key: 'netIncomeToCommonIncludingUnusual', label: 'Beneficio neto a acciones comunes', tags: ['NetIncomeLossAvailableToCommonStockholdersBasic', 'NetIncomeLossAvailableToCommonStockholdersDiluted', 'NetIncomeLoss'], unit: 'USD', emphasis: true },
    { key: 'netIncomeToCommonExcludingUnusual', label: 'Beneficio neto ajustado', tags: ['NetIncomeLossAvailableToCommonStockholders'], unit: 'USD', emphasis: true },
    { key: 'epsDiluted', label: 'BPA diluido', tags: ['EarningsPerShareDiluted'], unit: 'USD/shares', format: 'perShare' },
    { key: 'epsDilutedNormalized', label: 'BPA diluido ajustado', tags: ['IncomeLossFromContinuingOperationsPerDilutedShare', 'DilutedEarningsPerShareFromContinuingOperations'], unit: 'USD/shares', format: 'perShare' },
    { key: 'weightedSharesDiluted', label: 'Promedio ponderado de acciones diluidas en circulación', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'], unit: 'shares', format: 'shares' },
    { key: 'weightedSharesBasic', label: 'Promedio ponderado de acciones básicas en circulación', tags: ['WeightedAverageNumberOfSharesOutstandingBasic'], unit: 'shares', format: 'shares' },
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
    { key: 'propertyPlantEquipmentGross', label: 'Inmovilizado material bruto', tags: ['PropertyPlantAndEquipmentGross', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetBeforeAccumulatedDepreciationAndAmortization'], unit: 'USD' },
    { key: 'accumulatedDepreciation', label: 'Depreciación acumulada', tags: ['AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment', 'PropertyPlantAndEquipmentOwnedAccumulatedDepreciation', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAccumulatedDepreciationAndAmortization'], unit: 'USD', negative: true },
    { key: 'propertyPlantEquipment', label: 'Inmovilizado material neto', tags: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization'], unit: 'USD', emphasis: true },
    { key: 'longTermInvestments', label: 'Inversiones a largo plazo', tags: ['LongTermInvestments', 'OtherInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent', 'EquityMethodInvestments'], unit: 'USD' },
    { key: 'goodwill', label: 'Fondo de comercio', tags: ['Goodwill'], unit: 'USD' },
    { key: 'otherIntangibleAssets', label: 'Otros intangibles', combine: ['FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'], tags: ['IntangibleAssetsNetExcludingGoodwill', 'OtherIntangibleAssetsNet', 'FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'], unit: 'USD' },
    { key: 'longTermReceivables', label: 'Préstamos por cobrar a largo plazo', tags: ['LoansAndNotesReceivableNoncurrent', 'LongTermReceivables'], unit: 'USD' },
    { key: 'deferredTaxAssetsNoncurrent', label: 'Activos por impuestos diferidos a largo plazo', tags: ['DeferredTaxAssetsNetNoncurrent', 'DeferredIncomeTaxAssetsNet'], unit: 'USD' },
    { key: 'deferredCharges', label: 'Cargos diferidos a largo plazo', tags: ['DeferredCharges', 'OtherDeferredCharges', 'HostingArrangementServiceContractImplementationCostCapitalizedAfterAccumulatedAmortization'], unit: 'USD' },
    { key: 'otherAssetsNoncurrent', label: 'Otros activos a largo plazo', tags: ['OtherAssetsNoncurrent'], unit: 'USD' },
    { key: 'assetsNoncurrent', label: 'Activo no corriente', tags: ['AssetsNoncurrent'], unit: 'USD', derived: true },
    { key: 'assets', label: 'Activo total', tags: ['Assets'], unit: 'USD', emphasis: true },
    { key: 'payables', label: 'Cuentas por pagar', tags: ['AccountsPayableCurrent', 'AccountsPayableTradeCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'], unit: 'USD' },
    { key: 'accruedLiabilities', label: 'Gastos devengados', tags: ['AccruedLiabilitiesCurrent', 'EmployeeRelatedLiabilitiesCurrent', 'AccruedExpensesCurrent'], unit: 'USD' },
    { key: 'shortTermLoans', label: 'Préstamos de corto plazo', tags: ['ShortTermBorrowings', 'ShortTermDebt', 'LinesOfCreditCurrent', 'CommercialPaper', 'OtherShortTermBorrowings', 'NotesAndLoansPayableCurrent'], unit: 'USD' },
    { key: 'longTermDebtCurrent', label: 'Porción corriente de la deuda a largo plazo', tags: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'], unit: 'USD' },
    { key: 'currentCapitalLeaseObligations', label: 'Porción corriente de las obligaciones de arrendamiento financiero', tags: ['CapitalLeaseObligationsCurrent', 'FinanceLeaseLiabilityCurrent'], unit: 'USD' },
    { key: 'deferredTaxLiabilitiesCurrent', label: 'Pasivo por impuestos diferidos Corriente', tags: ['DeferredTaxLiabilitiesCurrent'], unit: 'USD' },
    { key: 'otherCurrentLiabilities', label: 'Otros pasivos corrientes', tags: ['OtherLiabilitiesCurrent'], unit: 'USD' },
    { key: 'currentLiabilities', label: 'Total pasivo corriente', tags: ['LiabilitiesCurrent'], unit: 'USD', emphasis: true },
    { key: 'longTermDebt', label: 'Deuda a largo plazo', tags: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebt'], unit: 'USD' },
    { key: 'capitalLeasesNoncurrent', label: 'Arrendamientos de capitales', tags: ['CapitalLeaseObligationsNoncurrent', 'FinanceLeaseLiabilityNoncurrent'], unit: 'USD' },
    { key: 'pensions', label: 'Pensiones y otros beneficios posteriores a la jubilación', tags: ['PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent', 'DefinedBenefitPlanLiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'deferredTaxLiabilitiesNoncurrent', label: 'Pasivo por impuesto diferido no corriente', tags: ['DeferredTaxLiabilitiesNoncurrent', 'DeferredIncomeTaxLiabilitiesNet'], unit: 'USD' },
    { key: 'otherLiabilitiesNoncurrent', label: 'Otro pasivo no corriente', tags: ['OtherLiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'liabilitiesNoncurrent', label: 'Pasivo no corriente', tags: ['LiabilitiesNoncurrent'], unit: 'USD', derived: true },
    { key: 'liabilities', label: 'Pasivo Total', tags: ['Liabilities'], unit: 'USD', emphasis: true },
    { key: 'commonStock', label: 'Acciones comunes', tags: ['CommonStockValue'], unit: 'USD' },
    { key: 'additionalPaidInCapital', label: 'Prima de suscripción', tags: ['AdditionalPaidInCapital', 'AdditionalPaidInCapitalCommonStock'], unit: 'USD' },
    { key: 'retainedEarnings', label: 'Beneficio no distribuido', tags: ['RetainedEarningsAccumulatedDeficit'], unit: 'USD' },
    { key: 'treasuryStock', label: 'Autocartera', tags: ['TreasuryStockCommonValue', 'TreasuryStockValue'], unit: 'USD', negative: true },
    { key: 'accumulatedOtherComprehensiveIncome', label: 'Resultado integral y otros', tags: ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'], unit: 'USD' },
    { key: 'commonEquity', label: 'Patrimonio neto común total', tags: ['StockholdersEquity'], unit: 'USD', emphasis: true },
    { key: 'minorityInterest', label: 'Intereses minoritarios', combine: ['MinorityInterest', 'RedeemableNoncontrollingInterestEquityCarryingAmount'], tags: ['MinorityInterest', 'MinorityInterestInConsolidatedEntity', 'RedeemableNoncontrollingInterestEquityCarryingAmount'], unit: 'USD' },
    { key: 'equity', label: 'Fondos propios totales', tags: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity'], unit: 'USD', emphasis: true },
    { key: 'liabilitiesAndEquity', label: 'Pasivo total y patrimonio neto', tags: ['LiabilitiesAndStockholdersEquity'], unit: 'USD', emphasis: true, derived: true },
    { key: 'sharesOutstanding', label: 'Total de acciones fuera en la fecha de presentación', tags: ['EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'], namespace: 'dei', unit: 'shares', format: 'shares' },
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
    { key: 'depreciation', label: 'Depreciación', tags: ['Depreciation', 'DepreciationNonproduction'], unit: 'USD' },
    { key: 'cashflowAmortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tags: ['AmortizationOfIntangibleAssets', 'AmortizationOfGoodwill'], unit: 'USD' },
    { key: 'depreciationAmortizationTotal', label: 'Depreciación y amortización total', tags: ['DepreciationAndAmortization', 'DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet'], unit: 'USD' },
    { key: 'amortizationDeferredCharges', label: 'Amortización de cargos diferidos', combine: ['AmortizationOfFinancingCostsAndDiscounts', 'HostingArrangementServiceContractImplementationCostExpenseAmortization'], tags: ['AmortizationOfFinancingCostsAndDiscounts', 'HostingArrangementServiceContractImplementationCostExpenseAmortization', 'AmortizationOfDeferredCharges', 'AmortizationOfDeferredFinancingCosts'], unit: 'USD' },
    { key: 'cashflowGainLossOnAssets', label: '(Ganancia) Pérdida por venta de activos', tags: ['GainLossOnSaleOfPropertyPlantEquipment', 'GainLossOnSaleOfOtherAssets'], unit: 'USD', invertSign: true },
    { key: 'cashflowGainLossOnInvestments', label: '(Ganancia) Pérdida por venta de inversiones', tags: ['GainLossOnSaleOfInvestments', 'GainLossOnSaleOfSecuritiesNet'], unit: 'USD', invertSign: true },
    { key: 'impairmentRestructuring', label: 'Deterioro de activos y costes de reestructuración', combine: ['GoodwillImpairmentLoss', 'RestructuringReserveAcceleratedDepreciation'], tags: ['GoodwillImpairmentLoss', 'RestructuringReserveAcceleratedDepreciation', 'GoodwillAndIntangibleAssetImpairment', 'ImpairmentOfLongLivedAssetsHeldForUse', 'RestructuringCharges', 'RestructuringAndRelatedCostIncurredCost'], unit: 'USD' },
    { key: 'equityMethodCashflow', label: '(Ingresos) Pérdidas en inversiones de capital', tags: ['IncomeLossFromEquityMethodInvestments', 'IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions'], unit: 'USD', invertSign: true },
    { key: 'stockCompensation', label: 'Compensación de stock options', tags: ['ShareBasedCompensation'], unit: 'USD' },
    { key: 'excessTaxBenefitStockOptions', label: 'Beneficio fiscal de las opciones sobre acciones', tags: ['ExcessTaxBenefitFromShareBasedCompensationOperatingActivities', 'EmployeeServiceShareBasedCompensationTaxBenefitFromExerciseOfStockOptions'], unit: 'USD' },
    { key: 'discontinuedOperationsCFO', label: 'Efectivo neto de operaciones discontinuadas', tags: ['CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations'], unit: 'USD' },
    { key: 'otherOperatingActivities', label: 'Otras actividades operativas', tags: ['OtherOperatingActivitiesCashFlowStatement', 'AdjustmentsNoncashItemsToReconcileNetIncomeLossToCashProvidedByUsedInOperatingActivitiesOther'], unit: 'USD' },
    { key: 'changeAccountsReceivable', label: 'Cambio en cuentas por cobrar', tags: ['IncreaseDecreaseInReceivables', 'IncreaseDecreaseInAccountsReceivable', 'IncreaseDecreaseInAccountsAndNotesReceivable'], unit: 'USD', invertSign: true },
    { key: 'changeInventory', label: 'Cambio en inventarios', tags: ['IncreaseDecreaseInInventories', 'IncreaseDecreaseInInventory'], unit: 'USD', invertSign: true },
    { key: 'changeAccountsPayable', label: 'Cambio en cuentas por pagar', tags: ['IncreaseDecreaseInAccountsPayableTrade', 'IncreaseDecreaseInAccountsPayableAndAccruedLiabilities', 'IncreaseDecreaseInAccountsPayable'], unit: 'USD' },
    { key: 'changeOtherOperatingAssets', label: 'Variación en otros activos operativos netos', tags: ['IncreaseDecreaseInOtherOperatingCapitalNet', 'IncreaseDecreaseInOtherOperatingAssets', 'IncreaseDecreaseInOtherOperatingLiabilities'], unit: 'USD', invertSign: true },
    { key: 'cfo', label: 'Efectivo de Operaciones', tags: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'workingCapitalChange', label: 'Nota: Cambio en el capital circulante', tags: ['IncreaseDecreaseInOperatingCapital'], unit: 'USD', invertSign: true, italic: true, derived: true },
    { key: 'capex', label: 'Gastos de capital', tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], unit: 'USD', negative: true },
    { key: 'salePPE', label: 'Venta de inmovilizado material', tags: ['ProceedsFromSaleOfPropertyPlantAndEquipment', 'ProceedsFromSaleOfProductiveAssets'], unit: 'USD' },
    { key: 'acquisitions', label: 'Adquisiciones con efectivo', tags: ['PaymentsToAcquireBusinessesNetOfCashAcquired', 'PaymentsToAcquireBusinessesAndInterestInAffiliates'], unit: 'USD', negative: true },
    { key: 'divestitures', label: 'Desinversiones', tags: ['ProceedsFromDivestitureOfBusinesses', 'ProceedsFromDivestitureOfBusinessesAndInterestsInAffiliates'], unit: 'USD' },
    { key: 'securitiesInvesting', label: 'Inversión en valores negociables y de renta variable', tags: ['PaymentsToAcquireInvestments', 'PaymentsToAcquireAvailableForSaleSecurities', 'PaymentsToAcquireOtherInvestments'], unit: 'USD', negative: true },
    { key: 'loansInvesting', label: 'Disminución (aumento) neta de préstamos originados / vendidos - Inversión', tags: ['PaymentsToAcquireLoansAndReceivables', 'ProceedsFromSaleOfLoansAndReceivables'], unit: 'USD' },
    { key: 'otherInvestingActivities', label: 'Otras actividades de inversión', invertTags: ['PaymentsForProceedsFromOtherInvestingActivities'], tags: ['OtherInvestingActivities', 'PaymentsForProceedsFromOtherInvestingActivities'], unit: 'USD' },
    { key: 'cfi', label: 'Efectivo de la inversión', tags: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'debtIssued', label: 'Deuda total emitida', tags: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromIssuanceOfDebt'], unit: 'USD' },
    { key: 'debtPaid', label: 'Total de la deuda reembolsada', tags: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt', 'RepaymentsOfLongTermDebtAndCapitalLeaseObligations', 'RepaymentsOfDebtAndDebtIssuanceCosts'], unit: 'USD', negative: true },
    { key: 'commonStockIssued', label: 'Emisión de acciones ordinarias', tags: ['ProceedsFromIssuanceOfCommonStock', 'ProceedsFromStockOptionsExercised'], unit: 'USD' },
    { key: 'buybacks', label: 'Recompra de acciones comunes', tags: ['PaymentsForRepurchaseOfCommonStock'], unit: 'USD', negative: true },
    { key: 'dividendsCommon', label: 'Dividendos comunes pagados', tags: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'], unit: 'USD', negative: true },
    { key: 'dividendsPreferred', label: 'Dividendos de acciones comunes y preferentes pagados', tags: ['PaymentsOfDividendsPreferredStock', 'DividendsPreferredStockCash'], unit: 'USD', negative: true },
    { key: 'otherFinancingActivities', label: 'Otras Actividades de Financiamiento', tags: ['OtherFinancingActivities', 'ProceedsFromPaymentsForOtherFinancingActivities'], unit: 'USD' },
    { key: 'cff', label: 'Efectivo de Financiamiento', tags: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'fx', label: 'Ajustes del tipo de cambio de divisas', tags: ['EffectOfExchangeRateOnCashAndCashEquivalents', 'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations'], unit: 'USD' },
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
const FLOW_KEYS = new Set([...STATEMENTS.income, ...STATEMENTS.cashflow].map((concept) => concept.key));
const INSTANT_KEYS = new Set([
  ...STATEMENTS.balance.map((concept) => concept.key),
  'sharesOutstanding', 'weightedSharesBasic', 'weightedSharesDiluted',
]);
const NON_ADDITIVE_KEYS = new Set([
  ...CONCEPTS.filter((concept) => concept.format && concept.format !== 'money').map((concept) => concept.key),
  'dividendPerShare', 'epsDiluted', 'epsBasic', 'weightedSharesBasic', 'weightedSharesDiluted', 'sharesOutstanding',
]);

const CONCEPT_EXTENSION = {
  // income
  mergerRestructuringCharges: 'restructuringcharges?|restructuring.*(cost|charge|expense)',
  goodwillImpairment: 'goodwillimpairmentloss|impairment.*goodwill',
  gainLossOnInvestments: 'gain.*loss.*(saleof)?(investments|securities|equity)',
  gainLossOnAssets: 'gain.*loss.*(property|assets)|saleofbusiness',
  assetImpairment: 'assetimpairment|impairmentoflonglived',
  insuranceSettlements: 'insurance',
  legalSettlements: 'litigation|legalsettlement',
  otherUnusualItems: 'unusual|infrequent|nonrecurring',
  salesMarketing: 'sellingandmarketing|salesandmarketing',
  otherNonoperatingIncome: 'othernonoperating',
  foreignCurrencyGainLoss: 'foreign.*currenc.*(gain|loss|transaction)',
  // cashflow
  depreciation: '^depreciation$',
  depreciationAmortizationTotal: '^depreciation.*(amortization|depletion)',
  cashflowAmortizationGoodwillIntangibles: '^amortizationof(intangible|goodwill)',
  amortizationDeferredCharges: 'amortizationofdeferred',
  stockCompensation: 'sharebasedcompensation|stockbasedcompensation',
  excessTaxBenefitStockOptions: 'excesstaxbenefit.*stock|taxbenefit.*stockoption',
  equityMethodCashflow: 'incomelossfromequity|equity.*(income|loss)',
  otherOperatingActivities: 'othernoncash|otheroperatingactivities|adjustmentsnoncash',
  changeAccountsReceivable: 'increase.*decrease.*(receivable|accounts)',
  changeInventory: 'increase.*decrease.*inventor',
  changeAccountsPayable: 'increase.*decrease.*(payable|accrued)',
  changeOtherOperatingAssets: 'increase.*decrease.*(operatingcapital|operatingassets|operatingliabilities)',
  discontinuedOperationsCFO: 'discontinuedoperation.*(operating|cash)',
  capex: 'payments.*(property|plant|productive)|purchases?ofproperty',
  salePPE: 'proceeds.*(property|plant|productive)|disposals?ofproperty',
  acquisitions: 'acquisition|acquirebusiness',
  divestitures: 'divestiture|disposals?ofbusiness|sales?ofbusiness',
  securitiesInvesting: 'purchases?ofinvestments|payments.*investments|acquireinvestments',
  loansInvesting: 'loansandreceivables|originat.*(loan|receivable)',
  otherInvestingActivities: 'otherinvesting',
  debtIssued: 'proceeds.*(debt|borrowing|loans?|notes?)|issuances?of.*debt',
  debtPaid: 'repayments?.*debt|payments?.*(debt|loans?|notes?|borrowing)|repaymentsofloans',
  commonStockIssued: 'proceeds.*(stock|shares?)|issuances?of.*(stock|shares?)',
  buybacks: 'repurchase.*(stock|shares?|treasury)|purchases?.*treasury',
  dividendsCommon: 'dividends?.*(common|paid)|payments?.*dividend',
  dividendsPreferred: 'dividend.*preferred|preferred.*dividend',
  otherFinancingActivities: 'otherfinancing',
  fx: 'exchangerate|cash.*(exchange|foreig)',
  netChangeInCash: 'periodincreasedecrease',
  interestPaid: 'interestpaid',
  taxesPaid: 'taxespaid|incometaxespaid',
};

const EXTENSION_EXCLUDED = /(disposalgroup|relatedcost|stepacquisition|remeasurement|recognized|purchaseaccounting|contingent|earnout|stockissued|valueacquisition|percentage|maturity|textblock|policy|tabletextblock|member|servings|beverage|countries|weightedaverage|fairvalue|carryingvalue|periodof|maximum|minimum|aggregate|portionof|solvency|captive|selfinsurance|reserve|unrealized|comprehensive|arisingduring|propertyplantandequipment|afteraccumulated|accumulateddepreciation|accumulatedamortization)/i;

const DISPLAY_STATEMENTS = {
  valuation: [
    { kind: 'section', label: 'Múltiplos de valoración' },
    { key: 'evToEbitda', label: 'EV / EBITDA', format: 'multiple', emphasis: true },
    { key: 'peRatio', label: 'PER', format: 'multiple', emphasis: true },
    { key: 'priceToFcf', label: 'P / FCF', format: 'multiple', emphasis: true },
    { key: 'dividendYield', label: 'Yield del dividendo %', format: 'ratio', emphasis: true },
    { key: 'payoutRatio', label: 'Payout del dividendo %', format: 'ratio', emphasis: true },
    { key: 'netDebtToEbitda', label: 'Deuda Neta / EBITDA', format: 'multiple', emphasis: true },
    { kind: 'section', label: 'Desglose y magnitudes de valoración:' },
    { key: 'marketCap', label: 'Capitalización de mercado', format: 'money' },
    { key: 'enterpriseValue', label: 'Enterprise Value (EV)', format: 'money', emphasis: true },
    { key: 'totalDebt', label: 'Deuda total', format: 'money' },
    { key: 'cashAndShortTermInvestments', label: 'Efectivo total e inversiones a corto plazo', format: 'money' },
    { key: 'netDebt', label: 'Deuda neta', format: 'money', emphasis: true },
    { key: 'ebitda', label: 'EBITDA', format: 'money', emphasis: true },
    { key: 'epsDiluted', label: 'Beneficio neto por acción (BPA diluido)', format: 'perShare' },
    { key: 'cashFlowPerShare', label: 'Flujo de caja libre por acción (FCF / acción)', format: 'perShare' },
    { key: 'freeCashFlow', label: 'Flujo de caja libre (FCF)', format: 'money' },
    { key: 'dividendPerShare', label: 'Dividendo por acción', format: 'perShare' },
  ],
  income: [
    { kind: 'section', label: 'Ingresos' },
    { key: 'revenue', label: 'Ingresos totales', emphasis: true },
    { key: 'revenueGrowth', kind: 'change', baseKey: 'revenue', label: '% De cambio interanual', format: 'percent' },
    { key: 'costOfRevenue', label: 'Coste de los bienes vendidos', tone: 'negative' },
    { key: 'grossProfit', label: 'Beneficio bruto', emphasis: true },
    { key: 'grossProfitGrowth', kind: 'change', baseKey: 'grossProfit', label: '% De cambio interanual', format: 'percent' },
    { key: 'grossProfitMargin', kind: 'margin', baseKey: 'grossProfit', label: '% Márgenes brutos', format: 'percent' },
    { key: 'sellingGeneralAdmin', label: 'Gastos de venta generales y administrativos', tone: 'negative' },
    { key: 'researchDevelopment', label: 'Gastos de I+D', tone: 'negative' },
    { key: 'amortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tone: 'negative' },
    { key: 'otherOperatingExpenses', label: 'Otros gastos operacionales', tone: 'negative' },
    { key: 'operatingExpenses', label: 'Gastos operativos totales', tone: 'negative', emphasis: true },
    { key: 'operatingIncome', label: 'Beneficio operativo', emphasis: true },
    { key: 'operatingIncomeGrowth', kind: 'change', baseKey: 'operatingIncome', label: '% De cambio interanual', format: 'percent' },
    { key: 'operatingIncomeMargin', kind: 'margin', baseKey: 'operatingIncome', label: '% Márgenes operativos', format: 'percent' },
    { key: 'operatingIncomeAdjusted', label: 'Beneficio operativo ajustado', emphasis: true },
    { key: 'operatingIncomeAdjustedMargin', kind: 'margin', baseKey: 'operatingIncomeAdjusted', numeratorKey: 'operatingIncomeAdjusted', denominatorKey: 'revenue', label: 'Margen operativo ajustado %', format: 'percent', italic: true },
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
    { key: 'incomeTax', label: 'Gastos de impuestos' },
    { key: 'incomeFromContinuingOps', label: 'Beneficios por operaciones continuadas', emphasis: true },
    { key: 'discontinuedOperations', label: 'Beneficios por operaciones discontinuadas' },
    { key: 'netIncome', label: 'Beneficio neto de la empresa', emphasis: true },
    { key: 'minorityInterestIncome', label: 'Intereses minoritario' },
    { key: 'preferredDividendsOtherAdjustments', label: 'Dividendo preferente y otros ajustes', tone: 'negative' },
    { key: 'netIncomeToCommonIncludingUnusual', label: 'Beneficio neto a acciones comunes', emphasis: true },
    { key: 'netIncomeMargin', kind: 'margin', baseKey: 'netIncomeToCommonIncludingUnusual', numeratorKey: 'netIncomeToCommonIncludingUnusual', denominatorKey: 'revenue', label: 'Margen de beneficio neto %', format: 'percent', italic: true },
    { key: 'netIncomeToCommonExcludingUnusual', label: 'Beneficio neto ajustado', emphasis: true },
    { key: 'netIncomeAdjustedMargin', kind: 'margin', baseKey: 'netIncomeToCommonExcludingUnusual', numeratorKey: 'netIncomeToCommonExcludingUnusual', denominatorKey: 'revenue', label: 'Margen de beneficio neto ajustado %', format: 'percent', italic: true },
    { kind: 'section', label: 'Datos adicionales:' },
    { key: 'epsDiluted', label: 'BPA diluido', format: 'perShare' },
    { key: 'epsDilutedGrowth', kind: 'change', baseKey: 'epsDiluted', label: '% De cambio interanual', format: 'percent' },
    { key: 'epsDilutedNormalized', label: 'BPA diluido ajustado', format: 'perShare' },
    { key: 'epsDilutedNormalizedGrowth', kind: 'change', baseKey: 'epsDilutedNormalized', label: '% De cambio interanual', format: 'percent' },
    { key: 'weightedSharesDiluted', label: 'Promedio ponderado de acciones diluidas en circulación', format: 'shares' },
    { key: 'weightedSharesDilutedGrowth', kind: 'change', baseKey: 'weightedSharesDiluted', label: '% De cambio interanual', format: 'percent' },
    { key: 'weightedSharesBasic', label: 'Promedio ponderado de acciones básicas en circulación', format: 'shares' },
    { key: 'weightedSharesBasicGrowth', kind: 'change', baseKey: 'weightedSharesBasic', label: '% De cambio interanual', format: 'percent' },
    { key: 'dividendPerShare', label: 'Dividendo por acción', format: 'perShare' },
    { key: 'dividendPerShareGrowth', kind: 'change', baseKey: 'dividendPerShare', label: '% De cambio interanual', format: 'percent' },
    { key: 'dividendPayoutDiluted', kind: 'ratio', numeratorKey: 'dividendPerShare', denominatorKey: 'epsDiluted', label: 'Dividendo pagado sobre el beneficio neto %', format: 'percent' },
    { key: 'dividendPayoutNormalized', kind: 'ratio', numeratorKey: 'dividendPerShare', denominatorKey: 'epsDilutedNormalized', label: 'Dividendo pagado sobre el beneficio neto ajustado %', format: 'percent' },
    { key: 'epsBasic', label: 'BPA básico', format: 'perShare' },
    { key: 'ebitda', label: 'EBITDA' },
    { key: 'ebitdaGrowth', kind: 'change', baseKey: 'ebitda', label: '% De cambio interanual', format: 'percent' },
    { key: 'ebitdaMargin', kind: 'margin', baseKey: 'ebitda', label: '% Márgenes EBITDA', format: 'percent', italic: true },
    { key: 'ebitdar', label: 'EBITDAR' },
    { key: 'researchDevelopment', label: 'Gasto en I+D' },
    { key: 'salesMarketing', label: 'Gastos de venta y marketing', tone: 'negative' },
    { key: 'effectiveTaxRate', kind: 'ratio', numeratorKey: 'incomeTax', denominatorKey: 'pretaxIncome', absoluteNumerator: true, label: 'Tasa efectiva de impuestos %', format: 'percent' },
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
    { key: 'workingCapitalChange', label: 'Nota: Cambio en el capital circulante', italic: true },
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
    { key: 'freeCashFlowGrowth', kind: 'change', baseKey: 'freeCashFlow', label: '% De cambio interanual', format: 'percent' },
    { key: 'fcfMargin', kind: 'ratio', numeratorKey: 'freeCashFlow', denominatorKey: 'revenue', label: '% Free Cash Flow Margins', format: 'percent', italic: true },
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
      items.map((item, index) => {
        const isPercent = item.format === 'percent' || item.kind === 'margin' || item.kind === 'change' || item.kind === 'ratio';
        const fallbackKey = item.kind === 'margin'
          ? `${item.baseKey}Margin`
          : item.kind === 'change'
            ? `${item.baseKey}Growth`
            : item.kind === 'ratio'
              ? `${item.numeratorKey}To${item.denominatorKey.charAt(0).toUpperCase() + item.denominatorKey.slice(1)}Ratio`
              : (item.kind !== 'section' && item.kind !== 'note' ? `${statement}_item_${index}` : undefined);
        const key = item.key ?? fallbackKey;
        return {
          ...item,
          ...(key ? { key } : {}),
          format: item.format ?? (isPercent ? 'percent' : (conceptByKey.get(key)?.format ?? 'money')),
          emphasis: item.emphasis === true,
        };
      }),
    ]),
  );
}

let tickerMapCache = null;

async function fetchSecJson(url, retries = 3) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 429 && retries > 0) {
      const waitMs = (4 - retries) * 3500;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return fetchSecJson(url, retries - 1);
    }
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

const KNOWN_TICKER_OVERRIDES = {
  XOM: { cik: 34088, ticker: 'XOM', name: 'EXXON MOBIL CORP' },
  'BRK-B': { cik: 1067983, ticker: 'BRK-B', name: 'BERKSHIRE HATHAWAY INC' },
  'BRK.B': { cik: 1067983, ticker: 'BRK-B', name: 'BERKSHIRE HATHAWAY INC' },
  'BRK-A': { cik: 1067983, ticker: 'BRK-A', name: 'BERKSHIRE HATHAWAY INC' },
  'BRK.A': { cik: 1067983, ticker: 'BRK-A', name: 'BERKSHIRE HATHAWAY INC' },
  'BF-B': { cik: 14693, ticker: 'BF-B', name: 'BROWN-FORMAN CORP' },
  'BF.B': { cik: 14693, ticker: 'BF-B', name: 'BROWN-FORMAN CORP' },
};

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
  for (const [tick, override] of Object.entries(KNOWN_TICKER_OVERRIDES)) {
    data.set(tick, override);
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
  const up = ticker.toUpperCase();
  const normalized = up.replace(/\./g, '-');
  const company = map.get(up) ?? map.get(normalized);
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

const SIC_SECTORS = {
  1: 'Agricultura', 2: 'Agricultura', 7: 'Agricultura', 8: 'Agricultura', 9: 'Agricultura',
  10: 'Minería y extracción', 12: 'Minería y extracción', 13: 'Minería y extracción', 14: 'Minería y extracción',
  15: 'Construcción', 16: 'Construcción', 17: 'Construcción',
  22: 'Textil', 23: 'Ropa y accesorios', 24: 'Madera y papel', 25: 'Madera y papel', 26: 'Madera y papel',
  27: 'Publicaciones y medios', 29: 'Petróleo y gas', 30: 'Plásticos y caucho', 31: 'Cuero',
  32: 'Vidrio y cerámica', 33: 'Metales', 34: 'Metales fabricados', 35: 'Maquinaria', 36: 'Electrónica',
  37: 'Vehículos', 38: 'Instrumentos', 39: 'Manufactura diversa',
  40: 'Transporte', 41: 'Transporte', 42: 'Transporte', 43: 'Correos y mensajería', 44: 'Transporte marítimo',
  45: 'Transporte aéreo', 46: 'Transporte de mercancías', 47: 'Transporte y servicios relacionados',
  48: 'Comunicaciones', 49: 'Electricidad, gas y agua',
  50: 'Comercio mayorista', 51: 'Comercio mayorista',
  52: 'Comercio minorista', 53: 'Comercio minorista', 55: 'Comercio minorista', 56: 'Comercio minorista',
  57: 'Comercio minorista', 59: 'Comercio minorista', 58: 'Restauración',
  60: 'Bancos', 61: 'Bancos', 62: 'Intermediación bursátil', 63: 'Seguros', 64: 'Seguros',
  65: 'Finanzas e inmobiliario', 66: 'Finanzas e inmobiliario', 67: 'Finanzas e inmobiliario',
  70: 'Hostelería y turismo', 72: 'Servicios personales', 73: 'Servicios informáticos',
  75: 'Reparación y mantenimiento', 76: 'Reparación y mantenimiento', 78: 'Entretenimiento',
  79: 'Entretenimiento', 80: 'Sanidad', 81: 'Servicios jurídicos', 82: 'Educación', 83: 'Servicios sociales',
  84: 'Museos y exposiciones', 86: 'Organizaciones y asociaciones', 87: 'Servicios de ingeniería',
  89: 'Servicios profesionales', 91: 'Administración pública', 92: 'Administración pública',
  93: 'Administración pública', 94: 'Administración pública', 95: 'Administración pública',
  96: 'Administración pública', 97: 'Administración pública', 99: 'Otros',
};

function profileSector(sic) {
  const code = Number(sic);
  if (!Number.isFinite(code)) return null;
  if ((code >= 2000 && code <= 2199) || (code >= 2830 && code <= 2836) || (code >= 2840 && code <= 2844)) {
    return 'Consumo defensivo';
  }
  if (code >= 2000 && code <= 2099) return 'Alimentación y bebidas';
  if (code >= 2100 && code <= 2199) return 'Tabaco';
  if (code >= 2800 && code <= 2899) return 'Química y farmacéutica';
  return SIC_SECTORS[Math.floor(code / 100)] ?? '—';
}

export async function getCompanyOrigin(ticker) {
  const company = await getCompanyByTicker(ticker);
  const submissions = await getCompanySubmissions(company);
  return {
    sector: profileSector(submissions?.sic) ?? '—',
    country: profileCountry(submissions),
  };
}

export async function getCompanySector(ticker) {
  const origin = await getCompanyOrigin(ticker);
  return origin.sector;
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
    ?? annual[0]?.values?.weightedSharesDiluted
    ?? quarterly[0]?.values?.sharesOutstanding
    ?? annual[0]?.values?.sharesOutstanding
    ?? quarterly[0]?.values?.weightedSharesBasic
    ?? annual[0]?.values?.weightedSharesBasic
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

  const recent4Quarters = quarterly.slice(0, 4);
  let ebitdaVal = null;
  if (recent4Quarters.length === 4) {
    const sumNorm = recent4Quarters.reduce((acc, q) => acc + (Number(q.values?.ebitdaNormalized ?? q.values?.ebitda) || 0), 0);
    const sumRaw = recent4Quarters.reduce((acc, q) => acc + (Number(q.values?.ebitda) || 0), 0);
    ebitdaVal = sumNorm > 0 ? sumNorm : (sumRaw > 0 ? sumRaw : null);
  }
  if (!ebitdaVal) {
    ebitdaVal = Number(annual[0]?.values?.ebitdaNormalized ?? annual[0]?.values?.ebitda) || null;
  }
  const totalDebtVal = quarterly[0]?.values?.totalDebt ?? annual[0]?.values?.totalDebt ?? values.totalDebt ?? null;
  const cashVal = quarterly[0]?.values?.cashAndShortTermInvestments ?? quarterly[0]?.values?.cash ?? annual[0]?.values?.cashAndShortTermInvestments ?? annual[0]?.values?.cash ?? values.cashAndShortTermInvestments ?? values.cash ?? null;
  const netDebtVal = quarterly[0]?.values?.netDebt ?? annual[0]?.values?.netDebt ?? (Number.isFinite(Number(totalDebtVal)) && Number.isFinite(Number(cashVal)) ? Number(totalDebtVal) - Number(cashVal) : values.netDebt ?? null);
  const enterpriseValueVal = Number.isFinite(Number(marketCap))
    ? (Number.isFinite(Number(netDebtVal)) ? marketCap + Number(netDebtVal) : marketCap)
    : null;
  const evToEbitdaVal = Number.isFinite(Number(enterpriseValueVal)) && Number(enterpriseValueVal) > 0 && Number.isFinite(Number(ebitdaVal)) && Number(ebitdaVal) > 0
    ? Math.round((Number(enterpriseValueVal) / Number(ebitdaVal)) * 100) / 100
    : null;
  const netDebtToEbitdaVal = Number.isFinite(Number(netDebtVal)) && Number.isFinite(Number(ebitdaVal)) && Number(ebitdaVal) > 0
    ? Math.round((Number(netDebtVal) / Number(ebitdaVal)) * 100) / 100
    : null;

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
      dividendPerShare: market?.dividendPerShare ?? annual[0]?.values?.dividendPerShare ?? null,
      dividendYield: market?.dividendYield ?? (market?.price && annual[0]?.values?.dividendPerShare ? Math.round(((Number(annual[0].values.dividendPerShare) / Number(market.price)) * 100) * 100) / 100 : null),
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
      ebitda: ebitdaVal,
      totalDebt: totalDebtVal,
      cash: cashVal,
      netDebt: netDebtVal,
      enterpriseValue: enterpriseValueVal,
      evToEbitda: evToEbitdaVal,
      netDebtToEbitda: netDebtToEbitdaVal,
      freeCashFlow: values.freeCashFlow ?? null,
      cashFlowPerShare: values.cashFlowPerShare ?? null,
      priceToFcf: market?.price && values.cashFlowPerShare > 0 ? market.price / values.cashFlowPerShare : (marketCap && values.freeCashFlow > 0 ? marketCap / values.freeCashFlow : null),
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
const EXTENSION_CONCURRENCY = 3;
const EXTENSION_ANNUAL_MIN_DAYS = 300;
const EXTENSION_QUARTERLY_DIRECT_DAYS = 110;
const EXTENSION_QUARTERLY_YTD_DAYS = 370;

const conceptByTag = new Map();
for (const concept of CONCEPTS) {
  for (const tag of concept.tags ?? []) {
    const list = conceptByTag.get(tag) ?? [];
    list.push(concept);
    conceptByTag.set(tag, list);
  }
}

const INSTANCE_ONLY_TAGS = {
  CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: ['cash'],
  CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations: ['cash'],
};

async function fetchSecText(url, retries = 2) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml' },
    signal: AbortSignal.timeout(45000),
  });
  if (response.status === 429 && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return fetchSecText(url, retries - 1);
  }
  if (!response.ok) {
    throw new Error(`EDGAR respondió ${response.status}`);
  }
  return response.text();
}

function parseInstanceFacts(xml) {
  const periods = new Map();
  const contextPattern = /<context id="([^"]+)"[^>]*>([\s\S]*?)<\/context>/g;
  let match;
  while ((match = contextPattern.exec(xml))) {
    const inner = match[2];
    const member = inner.includes('<segment>')
      ? inner.match(/xbrldi:explicitMember[^>]*>([^<]+)<\/xbrldi:explicitMember>/)?.[1] ?? ''
      : null;
    const start = inner.match(/<startDate>([^<]+)<\/startDate>/);
    const end = inner.match(/<endDate>([^<]+)<\/endDate>/);
    const instant = inner.match(/<instant>([^<]+)<\/instant>/);
    if (start?.[1] && end?.[1]) periods.set(match[1], { start: start[1], end: end[1], member });
    else if (instant?.[1]) periods.set(match[1], { start: null, end: instant[1], member });
  }

  const facts = [];
  const seen = new Set();
  const factPattern = /<([a-zA-Z0-9-]+):([A-Za-z0-9_]+)[^>]*?contextRef="([^"]+)"[^>]*?>\s*(-?\d+(?:\.\d+)?)\s*<\/\1:\2>/g;
  while ((match = factPattern.exec(xml))) {
    const period = periods.get(match[3]);
    if (!period) continue;
    const key = `${match[1]}:${match[2]}|${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ tag: match[2], value: Number(match[4]), start: period.start, end: period.end, member: period.member });
  }
  return facts;
}

function aggregateSegmentedInstants(facts) {
  const nonSegmented = new Set();
  for (const fact of facts) {
    if (fact.start === null && fact.member === null) {
      nonSegmented.add(`${fact.tag}|${fact.end}`);
    }
  }
  const grouped = new Map();
  for (const fact of facts) {
    if (fact.start !== null || fact.member === null || /total|all|combined/i.test(fact.member)) continue;
    if (nonSegmented.has(`${fact.tag}|${fact.end}`)) continue;
    const key = `${fact.tag}|${fact.end}`;
    const entry = grouped.get(key) ?? { value: 0 };
    entry.value += fact.value;
    grouped.set(key, entry);
  }
  for (const [key, entry] of grouped) {
    const [tag, end] = key.split('|');
    facts.push({ tag, value: entry.value, start: null, end, member: null });
  }
}

function matchConceptKeys(tag) {
  const exact = conceptByTag.get(tag);
  if (exact) return exact.map((concept) => concept.key);
  const instanceOnly = INSTANCE_ONLY_TAGS[tag];
  if (instanceOnly) return instanceOnly;
  if (EXTENSION_EXCLUDED.test(tag)) return null;
  let bestKey = null;
  let bestLength = 0;
  for (const [key, pattern] of Object.entries(CONCEPT_EXTENSION)) {
    if (!new RegExp(pattern, 'i').test(tag)) continue;
    if (pattern.length > bestLength) {
      bestLength = pattern.length;
      bestKey = key;
    }
  }
  return bestKey ? [bestKey] : null;
}

async function getFilingInstanceFacts(company, filing) {
  const items = await getFilingIndexItems(company, filing);
  if (!Array.isArray(items)) return [];
  const instanceName = items
    .map((item) => item.name)
    .find((name) => typeof name === 'string' && /_htm\.xml$/i.test(name));
  if (!instanceName) return [];
  const accessionNoDashes = filing.accession.replaceAll('-', '');
  const url = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/${instanceName}`;
  const xml = await fetchSecText(url);
  if (!xml) return [];
  const facts = parseInstanceFacts(xml);
  aggregateSegmentedInstants(facts);
  return facts;
}

async function getExtensionFacts(company) {
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
    const results = await Promise.allSettled(batch.map((filing) => getFilingInstanceFacts(company, filing)));
    for (const result of results) {
      if (result.status === 'fulfilled') facts.push(...result.value);
    }
    if (offset + EXTENSION_CONCURRENCY < queue.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const relevant = facts.filter((fact) => matchConceptKeys(fact.tag) !== null);
  extensionFactsCache.set(company.ticker, { data: relevant, at: Date.now() });
  return relevant;
}

function scoreMember(member, ticker, conceptKey) {
  if (member === null || member === '') return 100;
  const m = String(member).toLowerCase();
  if (m.includes('preferred') || m.includes('noncontrolling') || m.includes('discontinued') || m.includes('parent')) return -1;

  const tick = String(ticker || '').toUpperCase();
  const isClassB = /[-.]B$/i.test(tick);
  const isClassA = /[-.]A$/i.test(tick);

  if (isClassB) {
    if (m.includes('classb') || m.includes('commonclassb')) return 95;
    if (m.includes('classa') || m.includes('commonclassa')) return 40;
  } else if (isClassA) {
    if (m.includes('classa') || m.includes('commonclassa')) return 95;
    if (m.includes('classb') || m.includes('commonclassb')) return 40;
  } else {
    // Normal ticker without class suffix (e.g. STZ, GOOGL, TAP)
    // Class A / CommonClassA is standard primary common stock
    if (m.includes('commonclassa') || m.includes('classacommon') || m.includes('commonstockclassa') || m.includes('classa')) return 90;
    if (m.includes('commonstock') || m.includes('commonshare') || m.includes('commonclass')) return 75;
    if (m.includes('classb') || m.includes('commonclassb')) return 50;
  }

  if (m.includes('common')) return 60;
  return 10;
}

function isShareOrPerShareConcept(concept, key) {
  return concept?.unit === 'shares' ||
         concept?.unit === 'USD/shares' ||
         concept?.format === 'perShare' ||
         concept?.format === 'shares' ||
         key === 'sharesOutstanding' ||
         key === 'weightedSharesDiluted' ||
         key === 'weightedSharesBasic' ||
         key === 'epsDiluted' ||
         key === 'epsBasic' ||
         key === 'epsDilutedNormalized' ||
         key === 'dividendPerShare';
}

function mergeInstanceFacts(annual, quarterly, facts, ticker = '') {
  const durationDays = (fact) => {
    if (!fact.start) return null;
    const startMs = Date.parse(`${fact.start}T00:00:00Z`);
    const endMs = Date.parse(`${fact.end}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    return Math.round((endMs - startMs) / 86400000);
  };

  const factsByConcept = new Map();
  for (const fact of facts) {
    const keys = matchConceptKeys(fact.tag);
    if (!keys) continue;
    for (const key of keys) {
      const list = factsByConcept.get(key) ?? [];
      list.push(fact);
      factsByConcept.set(key, list);
    }
  }

  const annualEnds = annual.map((row) => row.periodEnd).filter(Boolean).sort();

  for (const [key, conceptFacts] of factsByConcept) {
    const concept = CONCEPTS.find((item) => item.key === key);
    if (!concept) continue;
    const isPerShare = isShareOrPerShareConcept(concept, key);
    const factsByEnd = new Map();
    for (const fact of conceptFacts) {
      const list = factsByEnd.get(fact.end) ?? [];
      list.push(fact);
      factsByEnd.set(fact.end, list);
    }
    const pick = (end, minDays, maxDays) => {
      const list = factsByEnd.get(end) ?? [];
      const valid = list
        .map((fact) => ({
          fact,
          days: durationDays(fact),
          score: isPerShare ? scoreMember(fact.member, ticker, key) : (fact.member === null ? 100 : -1),
        }))
        .filter(({ fact, days, score }) => days !== null && days >= minDays && days <= maxDays && score > 0);
      if (!valid.length) return null;
      valid.sort((a, b) => b.score - a.score || b.days - a.days);
      return valid[0].fact;
    };
    const instantAt = (end) => {
      const list = factsByEnd.get(end) ?? [];
      const valid = list
        .filter((fact) => !fact.start)
        .map((fact) => ({
          fact,
          score: isPerShare ? scoreMember(fact.member, ticker, key) : (fact.member === null ? 100 : -1),
        }))
        .filter(({ score }) => score > 0);
      if (!valid.length) return null;
      valid.sort((a, b) => b.score - a.score);
      return valid[0].fact;
    };
    const valueFor = (row) => {
      const duration = pick(row.periodEnd, EXTENSION_ANNUAL_MIN_DAYS, Infinity);
      if (duration) return duration.value;
      const instant = instantAt(row.periodEnd);
      return instant ? instant.value : null;
    };

    for (const row of annual) {
      if (row.values[key] !== undefined || !row.periodEnd) continue;
      const value = valueFor(row);
      if (Number.isFinite(value)) row.values[key] = normalizeConceptValue(concept, value);
    }

    for (const row of quarterly) {
      if (row.values[key] !== undefined || !row.periodEnd) continue;
      const direct = pick(row.periodEnd, 0, EXTENSION_QUARTERLY_DIRECT_DAYS);
      if (direct) {
        row.values[key] = normalizeConceptValue(concept, direct.value);
        continue;
      }
      const instant = instantAt(row.periodEnd);
      if (instant) {
        row.values[key] = normalizeConceptValue(concept, instant.value);
        continue;
      }
      const ytd = pick(row.periodEnd, EXTENSION_QUARTERLY_DIRECT_DAYS + 1, EXTENSION_QUARTERLY_YTD_DAYS);
      if (!ytd) continue;
      const fiscalYearStart = annualEnds.filter((end) => end < row.periodEnd).sort().slice(-1)[0];
      if (!fiscalYearStart) {
        row.values[key] = normalizeConceptValue(concept, ytd.value);
        continue;
      }
      const previousEnd = [...factsByEnd.keys()]
        .filter((end) => end < row.periodEnd && end > fiscalYearStart)
        .sort()
        .slice(-1)[0];
      const previous = previousEnd ? pick(previousEnd, 0, EXTENSION_QUARTERLY_YTD_DAYS) : null;
      if (!previous) {
        if (key === 'dividendPerShare') {
          const days = durationDays(ytd);
          if (days && days > 180) continue;
        }
        row.values[key] = normalizeConceptValue(concept, ytd.value);
        continue;
      }
      if (INSTANT_KEYS.has(key) || NON_ADDITIVE_KEYS.has(key) || concept.unit === 'shares' || (concept.format === 'perShare' && key !== 'dividendPerShare') || concept.format === 'shares') {
        row.values[key] = normalizeConceptValue(concept, ytd.value);
        continue;
      }
      const quarterValue = ytd.value - previous.value;
      if (Number.isFinite(quarterValue)) row.values[key] = normalizeConceptValue(concept, quarterValue);
    }
  }
}

function rederiveCashValues(annual, quarterly) {
  for (const rows of [annual, quarterly]) {
    for (const row of rows) {
      const values = row.values;
      const cash = Number(values.cash);
      if (values.cashEnding === undefined && Number.isFinite(cash)) values.cashEnding = cash;
      if (values.cashBeginning === undefined
        && Number.isFinite(Number(values.cashEnding)) && Number.isFinite(Number(values.netChangeInCash))) {
        values.cashBeginning = Math.round((Number(values.cashEnding) - Number(values.netChangeInCash)) * 1e6) / 1e6;
      }
      const shortTerm = Number(values.shortTermInvestments);
      const cashTotal = Number.isFinite(cash) ? cash + (Number.isFinite(shortTerm) ? shortTerm : 0) : (Number.isFinite(shortTerm) ? shortTerm : undefined);
      if (cashTotal !== undefined) {
        values.cashAndShortTermInvestments = cashTotal;
      }
      const stl = Number(values.shortTermLoans);
      const ltdc = Number(values.longTermDebtCurrent);
      const ltd = Number(values.longTermDebt);
      const leases = (Number(values.currentCapitalLeaseObligations) || 0) + (Number(values.capitalLeasesNoncurrent) || 0);

      let currentDebt = undefined;
      if (Number.isFinite(stl) && Number.isFinite(ltdc)) {
        currentDebt = (stl > 0 && ltdc > 0 && Math.abs(stl - ltdc) < ltdc * 0.15) ? Math.max(stl, ltdc) : (stl + ltdc);
      } else if (Number.isFinite(stl)) {
        currentDebt = stl;
      } else if (Number.isFinite(ltdc)) {
        currentDebt = ltdc;
      }

      if (currentDebt !== undefined || Number.isFinite(ltd) || leases > 0) {
        values.totalDebt = (currentDebt || 0) + (Number.isFinite(ltd) ? ltd : 0) + leases;
        const cashForNet = Number(values.cashAndShortTermInvestments ?? values.cash) || 0;
        values.netDebt = Number(values.totalDebt) - cashForNet;
      }

      if (values.workingCapitalChange === undefined) {
        const parts = [values.changeAccountsReceivable, values.changeInventory, values.changeAccountsPayable, values.changeOtherOperatingAssets];
        if (parts.some((v) => v !== undefined && Number.isFinite(Number(v)))) {
          values.workingCapitalChange = Math.round(parts.reduce((sum, v) => sum + (Number.isFinite(Number(v)) ? Number(v) : 0), 0) * 1e6) / 1e6;
        }
      }

      if (values.freeCashFlow === undefined && Number.isFinite(Number(values.cfo)) && Number.isFinite(Number(values.capex))) {
        const capex = Number(values.capex);
        values.freeCashFlow = Math.round((Number(values.cfo) + (capex < 0 ? capex : -capex)) * 1e6) / 1e6;
      }
      if (values.cashFlowPerShare === undefined && Number.isFinite(Number(values.freeCashFlow))) {
        const sh = Number(values.weightedSharesDiluted || values.sharesOutstanding);
        if (sh > 0) {
          values.cashFlowPerShare = Math.round((Number(values.freeCashFlow) / sh) * 1000) / 1000;
        }
      }
    }
    const ascending = [...rows].reverse();
    for (let index = 1; index < ascending.length; index += 1) {
      const row = ascending[index];
      if (row.values.cashBeginning !== undefined) continue;
      const previous = ascending[index - 1]?.values?.cashEnding;
      if (Number.isFinite(Number(previous))) row.values.cashBeginning = Number(previous);
    }
  }
}

function rederiveBalanceValues(annual, quarterly) {
  for (const rows of [annual, quarterly]) {
    for (const row of rows) {
      const values = row.values;

      const gross = Number(values.propertyPlantEquipmentGross);
      const dep = values.accumulatedDepreciation !== undefined ? Math.abs(Number(values.accumulatedDepreciation)) : undefined;
      const net = Number(values.propertyPlantEquipment);

      if (values.propertyPlantEquipment === undefined && Number.isFinite(gross) && Number.isFinite(dep)) {
        values.propertyPlantEquipment = gross - dep;
      }
      if (values.propertyPlantEquipmentGross === undefined && Number.isFinite(net) && Number.isFinite(dep)) {
        values.propertyPlantEquipmentGross = net + dep;
      }
      if (values.accumulatedDepreciation === undefined && Number.isFinite(gross) && Number.isFinite(net) && gross >= net) {
        values.accumulatedDepreciation = -(gross - net);
      }

      if (values.commonStock === undefined && Number.isFinite(Number(values.commonEquity))) {
        const apic = Number(values.additionalPaidInCapital) || 0;
        const re = Number(values.retainedEarnings) || 0;
        const ts = Number(values.treasuryStock) || 0;
        const aoci = Number(values.accumulatedOtherComprehensiveIncome) || 0;
        const diff = Number(values.commonEquity) - (apic + re + ts + aoci);
        if (Number.isFinite(diff) && diff > 0) {
          values.commonStock = Math.round(diff * 1e6) / 1e6;
        }
      }

      if (Number.isFinite(Number(values.commonEquity))) {
        values.equity = Number(values.commonEquity) + (Number(values.minorityInterest) || 0);
      }

      if (values.tangibleBookValue === undefined && Number.isFinite(Number(values.commonEquity))) {
        const gw = Math.abs(Number(values.goodwill) || 0);
        const intangibles = Math.abs(Number(values.otherIntangibleAssets) || 0);
        values.tangibleBookValue = Number(values.commonEquity) - gw - intangibles;
      }

      if (values.sharesOutstanding === undefined || !Number(values.sharesOutstanding)) {
        const fallback = Number(values.weightedSharesDiluted) || Number(values.weightedSharesBasic);
        if (Number.isFinite(fallback) && fallback > 0) {
          values.sharesOutstanding = fallback;
        }
      }
      const shares = Number(values.sharesOutstanding);
      if (Number.isFinite(shares) && shares > 0) {
        if (values.commonEquity !== undefined && Number.isFinite(Number(values.commonEquity))) {
          values.bookValuePerShare = Math.round((Number(values.commonEquity) / shares) * 100) / 100;
        }
        if (values.tangibleBookValue !== undefined && Number.isFinite(Number(values.tangibleBookValue))) {
          values.tangibleBookValuePerShare = Math.round((Number(values.tangibleBookValue) / shares) * 100) / 100;
        }
        const divCommon = Math.abs(Number(values.dividendsCommon));
        if (rows === quarterly && Number(values.dividendPerShare) > 2.0 && Number.isFinite(divCommon) && shares > 0) {
          values.dividendPerShare = Math.round((divCommon / shares) * 10000) / 10000;
        } else if ((values.dividendPerShare === undefined || values.dividendPerShare === null) && Number.isFinite(divCommon) && shares > 0) {
          values.dividendPerShare = Math.round((divCommon / shares) * 10000) / 10000;
        }
      }
    }
  }
}

function calculateUnusualTotal(values) {
  const gw = -Math.abs(Number(values.goodwillImpairment) || 0);
  const as = -Math.abs(Number(values.assetImpairment) || 0);
  const rawMr = -Math.abs(Number(values.mergerRestructuringCharges) || 0);
  const imp = Math.abs(gw) + Math.abs(as);
  const mr = Math.abs(rawMr) > imp ? -(Math.abs(rawMr) - imp) : (imp > 0 ? 0 : rawMr);
  const ls = -Math.abs(Number(values.legalSettlements) || 0);
  const otherUnusual = (Number(values.gainLossOnInvestments) || 0)
    + (Number(values.gainLossOnAssets) || 0)
    + (Number(values.insuranceSettlements) || 0)
    + (Number(values.otherUnusualItems) || 0);
  return gw + as + mr + ls + otherUnusual;
}

function calculateNormalizedNetIncomeAndEps(values) {
  const op = values.operatingIncome;
  const unusualNet = calculateUnusualTotal(values);

  // Evitar doble conteo de amortización de intangibles
  const amortIntangibles = Math.abs(Number(values.amortizationGoodwillIntangibles) || 0)
    || Math.abs(Number(values.cashflowAmortizationGoodwillIntangibles) || 0);

  const nonOp = (Number(values.interestExpense) || 0) + (Number(values.interestIncome) || 0)
    + (Number(values.otherNonoperatingIncome) || 0) + (Number(values.equityMethodIncome) || 0);

  const pretaxRaw = Number(values.ebtIncludingUnusual ?? values.pretaxIncome ?? (Number(op) + nonOp));
  const normPretax = pretaxRaw - unusualNet;

  const effTax = (Number(values.incomeTax) && Math.abs(pretaxRaw) > 0)
    ? Math.min(0.30, Math.max(0.12, Math.abs(Number(values.incomeTax)) / Math.abs(pretaxRaw)))
    : 0.21;

  const minority = Number(values.minorityInterestIncome) || 0;
  const pref = Number(values.preferredDividendsOtherAdjustments) || 0;

  const baseNet = Number.isFinite(Number(values.netIncomeToCommonIncludingUnusual))
    ? Number(values.netIncomeToCommonIncludingUnusual)
    : (Number.isFinite(Number(values.netIncome)) ? Number(values.netIncome) + minority + pref : null);

  let netIncomeAdjusted;
  if (Math.abs(unusualNet) > 0) {
    const normNet = Math.round(normPretax * (1 - effTax) + minority + pref);
    netIncomeAdjusted = Math.round(normNet + amortIntangibles * (1 - effTax));
  } else if (amortIntangibles > 0 && baseNet !== null) {
    netIncomeAdjusted = Math.round(baseNet + amortIntangibles * (1 - effTax));
  } else {
    netIncomeAdjusted = baseNet;
  }

  const shares = Number(values.weightedSharesDiluted) || Number(values.weightedSharesBasic) || Number(values.sharesOutstanding);
  let epsNormalized = null;
  if (Number.isFinite(netIncomeAdjusted) && Number.isFinite(shares) && shares > 0) {
    epsNormalized = Math.round((netIncomeAdjusted / shares) * 100) / 100;
  } else if (Number.isFinite(Number(values.epsDiluted))) {
    epsNormalized = Number(values.epsDiluted);
  }

  return {
    unusualTotal: Math.abs(unusualNet),
    amortIntangibles,
    effectiveTax: effTax,
    netIncomeAdjusted: Number.isFinite(netIncomeAdjusted) ? netIncomeAdjusted : undefined,
    epsNormalized: Number.isFinite(epsNormalized) ? epsNormalized : undefined,
  };
}

function rederiveIncomeValues(annual, quarterly) {
  const nonOpKeys = ['interestExpense', 'interestIncome', 'equityMethodIncome', 'foreignCurrencyGainLoss', 'otherNonoperatingIncome'];

  for (const rows of [annual, quarterly]) {
    for (const row of rows) {
      const values = row.values;
      if (values.ebtIncludingUnusual === undefined && values.pretaxIncome === undefined && values.operatingIncome === undefined) continue;

      const unusualNet = calculateUnusualTotal(values);
      const nonOpTotal = nonOpKeys.reduce((s, k) => s + (Number(values[k]) || 0), 0);

      if (values.pretaxIncome === undefined && values.ebtIncludingUnusual !== undefined) {
        values.pretaxIncome = values.ebtIncludingUnusual - unusualNet;
      }
      if (values.operatingIncome === undefined) {
        if (values.pretaxIncome !== undefined) {
          values.operatingIncome = values.pretaxIncome - nonOpTotal;
        } else if (values.grossProfit !== undefined && values.operatingExpenses !== undefined) {
          values.operatingIncome = values.grossProfit - values.operatingExpenses;
        }
      }
      if (values.operatingExpenses === undefined && values.grossProfit !== undefined && values.operatingIncome !== undefined) {
        values.operatingExpenses = values.operatingIncome - values.grossProfit;
      }
      if (values.sellingGeneralAdmin === undefined && values.operatingExpenses !== undefined) {
        values.sellingGeneralAdmin = values.operatingExpenses - (Number(values.researchDevelopment) || 0) - (Number(values.amortizationGoodwillIntangibles) || 0) - (Number(values.otherOperatingExpenses) || 0);
      }
      const dep = Number.isFinite(Number(values.depreciationAmortizationTotal))
        ? Number(values.depreciationAmortizationTotal)
        : ((Number(values.depreciation) || 0) + Math.abs(Number(values.cashflowAmortizationGoodwillIntangibles) || 0));
      const opInc = Number(values.operatingIncome);
      const nonCashOperatingCharges = Math.abs(Number(values.goodwillImpairment) || 0)
        + Math.abs(Number(values.assetImpairment) || 0);

      if (Number.isFinite(opInc)) {
        values.ebitda = opInc + dep + nonCashOperatingCharges;
        const rawMr = Math.abs(Number(values.mergerRestructuringCharges) || 0);
        const pureMr = rawMr > nonCashOperatingCharges ? (rawMr - nonCashOperatingCharges) : (nonCashOperatingCharges > 0 ? 0 : rawMr);
        values.ebitdaNormalized = values.ebitda + pureMr;
      }

      if (values.incomeFromContinuingOps === undefined && values.ebtIncludingUnusual !== undefined && values.incomeTax !== undefined) {
        values.incomeFromContinuingOps = Number(values.ebtIncludingUnusual) + Number(values.incomeTax);
      }
      if (values.netIncome === undefined && values.incomeFromContinuingOps !== undefined) {
        values.netIncome = Number(values.incomeFromContinuingOps) + (Number(values.discontinuedOperations) || 0);
      }
      if (values.netIncomeToCommonIncludingUnusual === undefined && values.netIncome !== undefined) {
        const netInc = Number(values.netIncome);
        const min = Number(values.minorityInterestIncome) || 0;
        const pref = Number(values.preferredDividendsOtherAdjustments) || 0;
        values.netIncomeToCommonIncludingUnusual = netInc + min + pref;
      }

      const normRes = calculateNormalizedNetIncomeAndEps(values);
      if (normRes.netIncomeAdjusted !== undefined) {
        values.netIncomeToCommonExcludingUnusual = normRes.netIncomeAdjusted;
      }
      if (normRes.epsNormalized !== undefined) {
        values.epsDilutedNormalized = normRes.epsNormalized;
      }

      const shares = Number(values.weightedSharesDiluted) || Number(values.weightedSharesBasic) || Number(values.sharesOutstanding);
      const netIncomeBase = Number.isFinite(Number(values.netIncomeToCommonIncludingUnusual))
        ? Number(values.netIncomeToCommonIncludingUnusual)
        : (Number.isFinite(Number(values.netIncome)) ? Number(values.netIncome) + (Number(values.minorityInterestIncome) || 0) : null);
      if (!Number.isFinite(Number(values.epsDiluted)) && netIncomeBase !== null && Number.isFinite(shares) && shares > 0) {
        values.epsDiluted = Math.round((netIncomeBase / shares) * 100) / 100;
      }
    }
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
      const existing = byFrame.get(frame);
      byFrame.set(frame, {
        frame,
        val: (existing ? existing.val : 0) + Number(entry.val),
        end: entry.end,
        fp: entry.fp,
        form: entry.form,
      });
    }
  }
  if (!byFrame.size) return null;
  return [...byFrame.values()];
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

  concept.tags.forEach((tag, tagIndex) => {
    if (combineSet.has(tag)) return;
    const unitData = namespaceFacts[tag]?.units?.[concept.unit];
    if (!Array.isArray(unitData)) return;
    for (const entry of unitData) {
      if (!entry.tag) entry.tag = tag;
      if (!entry.frame) {
        noFrameEntries.push(entry);
        continue;
      }
      const current = bestByFrame.get(entry.frame);
      const isBetter = !current
        || (Number(current.entry.val) === 0 && Number(entry.val) !== 0)
        || (Number(entry.val) !== 0 && tagIndex < current.tagIndex)
        || (tagIndex === current.tagIndex && (entry.filed ?? '') > (current.entry.filed ?? ''));
      if (isBetter) {
        bestByFrame.set(entry.frame, { entry, tagIndex });
      }
    }
  });

  const result = [];
  const combinedMap = new Map((combined ?? []).map((item) => [item.frame, item]));
  for (const [frame, { entry }] of bestByFrame.entries()) {
    if (!combinedMap.has(frame)) result.push(entry);
  }
  result.push(...combinedMap.values());
  result.push(...noFrameEntries);
  result.sort((a, b) => String(a.filed ?? '').localeCompare(String(b.filed ?? '')));
  return result.length ? result : null;
}

function normalizeConceptValue(concept, value, tag = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (concept.negative) return -Math.abs(number);
  if (concept.invertSign || (tag && concept.invertTags?.includes(tag))) return -number;
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
      if (classified.series === 'annual' && entry.fp && entry.fp !== 'FY' && entry.form && entry.form !== '10-K') continue;
      const row = ensureRow(classified.key, classified.series, classified.sortKey);
      if (concept.namespace !== 'dei') {
        setPeriodEnd(row, entry.end);
        setPeriodStart(row, entry.start);
      }
      row.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
    }
  }

  const conceptByKey = new Map(CONCEPTS.map((concept) => [concept.key, concept]));
  const flowKeys = FLOW_KEYS;
  const instantKeys = INSTANT_KEYS;
  const nonAdditiveKeys = NON_ADDITIVE_KEYS;

  const annualRows = [...rows.values()].filter((row) => row.series === 'annual');
  const quarterlyRows = [...rows.values()].filter((row) => row.series === 'quarterly');

  for (const concept of CONCEPTS) {
    if (concept.namespace === 'dei') continue;
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;

    for (const entry of unitData) {
      if (entry.frame) continue;
      const days = durationDays(entry.start, entry.end);

      // 1. Annual entries (10-K)
      if (entry.fp === 'FY' || (days !== null && days >= 300)) {
        const target = annualRows.find((row) => row.periodEnd === entry.end)
          ?? annualRows.find((row) => row.periodStart === entry.start && row.periodEnd === null)
          ?? null;
        if (target) {
          if (target.values[concept.key] === undefined) target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
          continue;
        }
        const year = annualYearOf(entry.end);
        if (year === null) continue;
        const annualRow = ensureRow(String(year), 'annual', year * 10);
        setPeriodEnd(annualRow, entry.end);
        setPeriodStart(annualRow, entry.start);
        if (annualRow.values[concept.key] === undefined) annualRow.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
        continue;
      }

      // 2. Instant entries (Balance Sheet)
      if (instantKeys.has(concept.key)) {
        const target = quarterlyRows.find((row) => row.periodEnd === entry.end)
          ?? annualRows.find((row) => row.periodEnd === entry.end);
        if (target && target.values[concept.key] === undefined) {
          target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
        }
        continue;
      }

      // 3. Flow entries (Income & Cashflow)
      if (flowKeys.has(concept.key)) {
        if (days !== null && days >= 70 && days <= 115) {
          const target = quarterlyRows.find((row) => row.periodEnd === entry.end);
          if (target && target.values[concept.key] === undefined) {
            target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
          }
        } else if (days !== null && days >= 150 && days <= 290) {
          const target = quarterlyRows.find((row) => row.periodEnd === entry.end);
          if (target) {
            target.ytdValues ??= {};
            if (target.ytdValues[concept.key] === undefined) {
              target.ytdValues[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
            }
          }
        }
      }
    }
  }

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
      const q4Year = entry.frame?.match(/^CY(\d{4})Q4I$/)?.[1];
      const target = annualRows.find((row) => (entry.end && row.periodEnd === entry.end) || (q4Year && row.period === q4Year));
      if (!target) continue;
      if (target.values[concept.key] === undefined || entry.frame?.endsWith('Q4I')) {
        target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
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
          if (row.values[concept.key] === undefined) row.values[concept.key] = normalizeConceptValue(concept, entry.val);
        }
      }
      if (entry.fp !== 'FY') continue;
      const target = annualRows
        .filter((row) => !row.periodEnd || !entry.end || row.periodEnd <= entry.end)
        .sort((a, b) => String(b.periodEnd ?? '').localeCompare(String(a.periodEnd ?? '')))[0];
      if (target) {
        if (target.values[concept.key] === undefined) target.values[concept.key] = normalizeConceptValue(concept, entry.val);
      } else if (typeof entry.end === 'string' && entry.end.length >= 4) {
        const year = Number.isFinite(Number(entry.fy)) ? String(entry.fy) : entry.end.slice(0, 4);
        const annualRow = ensureRow(year, 'annual', Number(year) * 10);
        if (annualRow.values[concept.key] === undefined) annualRow.values[concept.key] = normalizeConceptValue(concept, entry.val);
      }
    }
  }

  for (const annualRow of annualRows) {
    if (!annualRow.periodEnd) continue;
    const quartersUpToAnnual = [...rows.values()]
      .filter((row) => row.series === 'quarterly' && row.periodEnd && row.periodEnd <= annualRow.periodEnd)
      .sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)));
    const fiscalQuarters = quartersUpToAnnual.slice(-4);
    if (fiscalQuarters.length !== 4) continue;
    const [q1, q2, q3, q4] = fiscalQuarters;
    if (q4.periodEnd !== annualRow.periodEnd) continue;

    // De-accumulate flow items for Q2, Q3, Q4 from YTD and Annual values
    for (const key of flowKeys) {
      if (nonAdditiveKeys.has(key)) continue;

      // Q2 from YTD6 - Q1
      if (q2.values[key] === undefined && q2.ytdValues?.[key] !== undefined && q1.values[key] !== undefined) {
        const res = Number(q2.ytdValues[key]) - Number(q1.values[key]);
        if (Number.isFinite(res)) q2.values[key] = Math.round(res * 1e6) / 1e6;
      }

      // Q3 from YTD9 - YTD6 (or YTD9 - Q1 - Q2)
      if (q3.values[key] === undefined && q3.ytdValues?.[key] !== undefined) {
        if (q2.ytdValues?.[key] !== undefined) {
          const res = Number(q3.ytdValues[key]) - Number(q2.ytdValues[key]);
          if (Number.isFinite(res)) q3.values[key] = Math.round(res * 1e6) / 1e6;
        } else if (q1.values[key] !== undefined && q2.values[key] !== undefined) {
          const res = Number(q3.ytdValues[key]) - Number(q1.values[key]) - Number(q2.values[key]);
          if (Number.isFinite(res)) q3.values[key] = Math.round(res * 1e6) / 1e6;
        }
      }

      // Q4 from Annual - YTD9 (or Annual - Q1 - Q2 - Q3)
      if (q4.values[key] === undefined && annualRow.values[key] !== undefined) {
        if (q3.ytdValues?.[key] !== undefined) {
          const res = Number(annualRow.values[key]) - Number(q3.ytdValues[key]);
          if (Number.isFinite(res)) q4.values[key] = Math.round(res * 1e6) / 1e6;
        } else if (q1.values[key] !== undefined && q2.values[key] !== undefined && q3.values[key] !== undefined) {
          const res = Number(annualRow.values[key]) - Number(q1.values[key]) - Number(q2.values[key]) - Number(q3.values[key]);
          if (Number.isFinite(res)) q4.values[key] = Math.round(res * 1e6) / 1e6;
        }
      }
    }

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
      if (key === 'dividendPerShare') {
        const defaultQDiv = Math.round((Number(annualValue) / 4) * 10000) / 10000;
        if (q1.values[key] === undefined) q1.values[key] = defaultQDiv;
        if (q2.values[key] === undefined) q2.values[key] = defaultQDiv;
        if (q3.values[key] === undefined) q3.values[key] = defaultQDiv;
        q4.values[key] = q3.values.dividendPerShare ?? q2.values.dividendPerShare ?? q1.values.dividendPerShare ?? defaultQDiv;
        continue;
      }
      if (key === 'epsDiluted' || key === 'epsBasic') {
        const a = Number(q1.values[key]) || 0;
        const b = Number(q2.values[key]) || 0;
        const c = Number(q3.values[key]) || 0;
        q4.values[key] = Math.round((Number(annualValue) - a - b - c) * 100) / 100;
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

  const all = [...rows.values()]
    .filter((row) => row.periodEnd !== null && row.periodEnd !== undefined)
    .sort((a, b) => b.sortKey - a.sortKey);
  const annual = all.filter((row) => row.series === 'annual');
  const quarterly = all.filter((row) => row.series === 'quarterly');

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

    if (values.revenue === undefined && values.grossProfit !== undefined && values.costOfRevenue !== undefined) {
      values.revenue = Math.round((Number(values.grossProfit) - Number(values.costOfRevenue)) * 1e6) / 1e6;
    } else if (values.costOfRevenue === undefined && values.revenue !== undefined && values.grossProfit !== undefined) {
      values.costOfRevenue = Math.round((Number(values.grossProfit) - Number(values.revenue)) * 1e6) / 1e6;
    }

    setDerived(values, 'grossProfit', (data) => sumValues(data, ['revenue', 'costOfRevenue']));

    const unusualNet = calculateUnusualTotal(values);

    const nonOpKeys = ['interestExpense', 'interestIncome', 'equityMethodIncome', 'foreignCurrencyGainLoss', 'otherNonoperatingIncome'];
    const nonOpTotal = sumValues(values, nonOpKeys) || 0;

    if (values.pretaxIncome === undefined && values.ebtIncludingUnusual !== undefined) {
      values.pretaxIncome = values.ebtIncludingUnusual - unusualNet;
    }
    if (values.operatingIncome === undefined) {
      if (values.pretaxIncome !== undefined) {
        values.operatingIncome = values.pretaxIncome - nonOpTotal;
      } else if (values.grossProfit !== undefined && values.operatingExpenses !== undefined) {
        values.operatingIncome = values.grossProfit - values.operatingExpenses;
      }
    }
    if (values.operatingExpenses === undefined && values.grossProfit !== undefined && values.operatingIncome !== undefined) {
      values.operatingExpenses = values.operatingIncome - values.grossProfit;
    }
    if (values.sellingGeneralAdmin === undefined && values.operatingExpenses !== undefined) {
      values.sellingGeneralAdmin = values.operatingExpenses - (Number(values.researchDevelopment) || 0) - (Number(values.amortizationGoodwillIntangibles) || 0) - (Number(values.otherOperatingExpenses) || 0);
    }
    setDerived(values, 'operatingIncomeAdjusted', (data) => {
      let expense = 0;
      if (data.interestExpense !== undefined && Number.isFinite(Number(data.interestExpense))) {
        expense = Math.abs(Number(data.interestExpense));
      }
      let income = 0;
      if (data.interestIncome !== undefined && Number.isFinite(Number(data.interestIncome))) {
        income = Math.abs(Number(data.interestIncome));
      }
      const netInterest = expense - income;

      if (data.pretaxIncome !== undefined && Number.isFinite(Number(data.pretaxIncome))) {
        return Number(data.pretaxIncome) + netInterest;
      }
      if (data.ebtIncludingUnusual !== undefined && Number.isFinite(Number(data.ebtIncludingUnusual))) {
        const unusual = calculateUnusualTotal(data);
        return (Number(data.ebtIncludingUnusual) - unusual) + netInterest;
      }
      if (data.operatingIncome !== undefined && Number.isFinite(Number(data.operatingIncome))) {
        const unusual = calculateUnusualTotal(data);
        return Number(data.operatingIncome) - unusual;
      }
      return undefined;
    });
    setDerived(values, 'ebtIncludingUnusual', (data) => sumValues(data, ['pretaxIncome', 'mergerRestructuringCharges', 'goodwillImpairment', 'gainLossOnInvestments', 'gainLossOnAssets', 'assetImpairment', 'insuranceSettlements', 'legalSettlements', 'otherUnusualItems']));

    setDerived(values, 'incomeFromContinuingOps', (data) => sumValues(data, ['ebtIncludingUnusual', 'incomeTax']));
    setDerived(values, 'netIncome', (data) => sumValues(data, ['incomeFromContinuingOps', 'discontinuedOperations']));
    setDerived(values, 'netIncomeToCommonIncludingUnusual', (data) => {
      const netIncome = Number(data.netIncome);
      const minority = Number(data.minorityInterestIncome) || 0;
      const pref = Number(data.preferredDividendsOtherAdjustments) || 0;
      return Number.isFinite(netIncome) ? netIncome + minority + pref : undefined;
    });
    setDerived(values, 'netIncomeToCommonExcludingUnusual', (data) => {
      const res = calculateNormalizedNetIncomeAndEps(data);
      return res.netIncomeAdjusted;
    });
    setDerived(values, 'epsDilutedNormalized', (data) => {
      const res = calculateNormalizedNetIncomeAndEps(data);
      return res.epsNormalized;
    });
    setDerived(values, 'ebitda', (data) => {
      const dep = Number.isFinite(Number(data.depreciationAmortizationTotal))
        ? Number(data.depreciationAmortizationTotal)
        : ((Number(data.depreciation) || 0) + Math.abs(Number(data.cashflowAmortizationGoodwillIntangibles) || 0));
      const opInc = Number(data.operatingIncome);
      const nonCashOperatingCharges = Math.abs(Number(data.goodwillImpairment) || 0)
        + Math.abs(Number(data.assetImpairment) || 0);
      return Number.isFinite(opInc) ? opInc + dep + nonCashOperatingCharges : undefined;
    });
    setDerived(values, 'ebitdaNormalized', (data) => {
      const ebitda = Number(data.ebitda);
      if (!Number.isFinite(ebitda)) return undefined;
      const rawMr = Math.abs(Number(data.mergerRestructuringCharges) || 0);
      const gw = Math.abs(Number(data.goodwillImpairment) || 0);
      const as = Math.abs(Number(data.assetImpairment) || 0);
      const imp = gw + as;
      const pureMr = rawMr > imp ? (rawMr - imp) : (imp > 0 ? 0 : rawMr);
      return ebitda + pureMr;
    });
    setDerived(values, 'ebitdar', (data) => Number.isFinite(Number(data.ebitda)) && Number.isFinite(Number(data.rentExpense))
      ? Number(data.ebitda) - Number(data.rentExpense)
      : undefined);

    setDerived(values, 'cashAndShortTermInvestments', (data) => sumValues(data, ['cash', 'shortTermInvestments']));
    setDerived(values, 'totalReceivables', (data) => sumValues(data, ['receivables', 'otherReceivables']));
    setDerived(values, 'propertyPlantEquipment', (data) => {
      const gross = Number(data.propertyPlantEquipmentGross);
      const dep = data.accumulatedDepreciation !== undefined ? Math.abs(Number(data.accumulatedDepreciation)) : undefined;
      return Number.isFinite(gross) && Number.isFinite(dep) ? gross - dep : undefined;
    });
    setDerived(values, 'propertyPlantEquipmentGross', (data) => {
      const net = Number(data.propertyPlantEquipment);
      const dep = data.accumulatedDepreciation !== undefined ? Math.abs(Number(data.accumulatedDepreciation)) : undefined;
      return Number.isFinite(net) && Number.isFinite(dep) ? net + dep : undefined;
    });
    setDerived(values, 'accumulatedDepreciation', (data) => {
      const gross = Number(data.propertyPlantEquipmentGross);
      const net = Number(data.propertyPlantEquipment);
      return Number.isFinite(gross) && Number.isFinite(net) && gross >= net ? -(gross - net) : undefined;
    });
    setDerived(values, 'assetsNoncurrent', (data) => Number.isFinite(Number(data.assets)) && Number.isFinite(Number(data.currentAssets))
      ? Number(data.assets) - Number(data.currentAssets)
      : undefined);
    setDerived(values, 'commonStock', (data) => {
      if (!Number.isFinite(Number(data.commonEquity))) return undefined;
      const apic = Number(data.additionalPaidInCapital) || 0;
      const re = Number(data.retainedEarnings) || 0;
      const ts = Number(data.treasuryStock) || 0;
      const aoci = Number(data.accumulatedOtherComprehensiveIncome) || 0;
      const diff = Number(data.commonEquity) - (apic + re + ts + aoci);
      return Number.isFinite(diff) && diff > 0 ? diff : undefined;
    });
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
    setDerived(values, 'totalDebt', (data) => {
      const stl = Number(data.shortTermLoans);
      const ltdc = Number(data.longTermDebtCurrent);
      const ltd = Number(data.longTermDebt);
      const leases = (Number(data.currentCapitalLeaseObligations) || 0) + (Number(data.capitalLeasesNoncurrent) || 0);
      let currentDebt = undefined;
      if (Number.isFinite(stl) && Number.isFinite(ltdc)) {
        currentDebt = (stl > 0 && ltdc > 0 && Math.abs(stl - ltdc) < ltdc * 0.15) ? Math.max(stl, ltdc) : (stl + ltdc);
      } else if (Number.isFinite(stl)) {
        currentDebt = stl;
      } else if (Number.isFinite(ltdc)) {
        currentDebt = ltdc;
      }
      if (currentDebt === undefined && !Number.isFinite(ltd) && leases === 0) return undefined;
      return (currentDebt || 0) + (Number.isFinite(ltd) ? ltd : 0) + leases;
    });
    setDerived(values, 'netDebt', (data) => Number.isFinite(Number(data.totalDebt)) && Number.isFinite(Number(data.cashAndShortTermInvestments ?? data.cash))
      ? Number(data.totalDebt) - Number(data.cashAndShortTermInvestments ?? data.cash)
      : undefined);
    if (values.sharesOutstanding === undefined || !Number(values.sharesOutstanding)) {
      values.sharesOutstanding = values.weightedSharesDiluted ?? values.weightedSharesBasic;
    }
    setDerived(values, 'bookValuePerShare', (data) => Number.isFinite(Number(data.commonEquity)) && Number(data.sharesOutstanding) > 0
      ? Number(data.commonEquity) / Number(data.sharesOutstanding)
      : undefined);
    setDerived(values, 'tangibleBookValuePerShare', (data) => Number.isFinite(Number(data.tangibleBookValue)) && Number(data.sharesOutstanding) > 0
      ? Number(data.tangibleBookValue) / Number(data.sharesOutstanding)
      : undefined);
    setDerived(values, 'dividendPerShare', (data) => {
      if (data.dividendsCommon === undefined) return undefined;
      const divCommon = Math.abs(Number(data.dividendsCommon));
      const shares = Number(data.sharesOutstanding || data.weightedSharesDiluted || data.weightedSharesBasic);
      if (shares > 0 && Number.isFinite(divCommon)) {
        return Math.round((divCommon / shares) * 10000) / 10000;
      }
      return undefined;
    });

    setDerived(values, 'workingCapitalChange', (data) => {
      const parts = [data.changeAccountsReceivable, data.changeInventory, data.changeAccountsPayable, data.changeOtherOperatingAssets];
      if (parts.some((v) => v !== undefined && Number.isFinite(Number(v)))) {
        return Math.round(parts.reduce((sum, v) => sum + (Number.isFinite(Number(v)) ? Number(v) : 0), 0) * 1e6) / 1e6;
      }
      return undefined;
    });

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
  try {
    const extensionFacts = await getExtensionFacts(company);
    mergeInstanceFacts(annual, quarterly, extensionFacts, company.ticker);
  } catch {
    // Si falla el rescate desde las instancias XBRL, se devuelven solo los datos estándar.
  }
  propagateMissingShares(annual, quarterly);
  rederiveCashValues(annual, quarterly);
  rederiveIncomeValues(annual, quarterly);
  rederiveBalanceValues(annual, quarterly);
  harmonizeSeriesSplits(annual, quarterly);
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

const VALUATION_RANGES = {
  '1m': 31,
  '3m': 92,
  '6m': 184,
  '1y': 366,
  '3y': 1096,
  '5y': 1827,
  '10y': 3653,
  all: 7305,
};

function propagateMissingShares(annual, quarterly) {
  const annualMap = new Map();
  for (const ann of annual) {
    const sh = Number(ann.values?.weightedSharesDiluted || ann.values?.sharesOutstanding || ann.values?.weightedSharesBasic);
    if (sh > 0) {
      const year = ann.sortKey ? Math.floor(ann.sortKey / 10) : null;
      if (year) annualMap.set(year, sh);
      if (ann.periodEnd) annualMap.set(ann.periodEnd.slice(0, 4), sh);
    }
  }

  const baselineRow = quarterly.find((q) => Number(q.values?.weightedSharesDiluted) > 0 || Number(q.values?.sharesOutstanding) > 0)
    ?? annual.find((a) => Number(a.values?.weightedSharesDiluted) > 0 || Number(a.values?.sharesOutstanding) > 0);
  const baselineShares = Number(baselineRow?.values?.weightedSharesDiluted || baselineRow?.values?.sharesOutstanding || 0);

  const sortedQuarters = [...quarterly].sort((a, b) => a.sortKey - b.sortKey);
  for (let i = 0; i < sortedQuarters.length; i += 1) {
    const q = sortedQuarters[i];
    const existing = Number(q.values?.weightedSharesDiluted || q.values?.sharesOutstanding || q.values?.weightedSharesBasic);
    if (existing > 0) continue;

    const year = q.sortKey ? Math.floor(q.sortKey / 10) : null;
    let targetShares = (year ? annualMap.get(year) : null)
      || (q.periodEnd ? annualMap.get(q.periodEnd.slice(0, 4)) : null);

    if (!targetShares || targetShares <= 0) {
      for (let offset = 1; offset < sortedQuarters.length; offset += 1) {
        const next = sortedQuarters[i + offset];
        const nextSh = Number(next?.values?.weightedSharesDiluted || next?.values?.sharesOutstanding);
        if (nextSh > 0) { targetShares = nextSh; break; }
        const prev = sortedQuarters[i - offset];
        const prevSh = Number(prev?.values?.weightedSharesDiluted || prev?.values?.sharesOutstanding);
        if (prevSh > 0) { targetShares = prevSh; break; }
      }
    }

    if (!targetShares || targetShares <= 0) {
      targetShares = baselineShares > 0 ? baselineShares : null;
    }

    if (targetShares > 0) {
      q.values.weightedSharesDiluted = targetShares;
      q.values.sharesOutstanding = targetShares;
    }
  }
}

function harmonizeSeriesSplits(annual, quarterly) {
  const allRows = [...quarterly, ...annual];
  const baselineRow = quarterly.find((q) => Number(q.values?.weightedSharesDiluted) > 0 || Number(q.values?.sharesOutstanding) > 0)
    ?? annual.find((a) => Number(a.values?.weightedSharesDiluted) > 0 || Number(a.values?.sharesOutstanding) > 0);
  const baselineShares = Number(baselineRow?.values?.weightedSharesDiluted || baselineRow?.values?.sharesOutstanding);
  if (!baselineShares || baselineShares <= 0) return;

  for (const row of allRows) {
    const rawShares = Number(row.values?.weightedSharesDiluted || row.values?.sharesOutstanding);
    if (!rawShares || rawShares <= 0) continue;
    const ratio = baselineShares / rawShares;
    let factor = 1;
    if (ratio > 1.6) {
      for (const cand of [100, 50, 40, 30, 28, 25, 20, 15, 14, 10, 8, 7, 6, 5, 4, 3, 2]) {
        if (Math.abs(ratio / cand - 1) < 0.28) {
          factor = cand;
          break;
        }
      }
    } else if (ratio < 0.6) {
      for (const cand of [0.5, 0.333, 0.25, 0.2, 0.1, 0.05]) {
        if (Math.abs(ratio / cand - 1) < 0.28) {
          factor = cand;
          break;
        }
      }
    }
    if (factor !== 1) {
      if (row.values.weightedSharesDiluted) row.values.weightedSharesDiluted *= factor;
      if (row.values.weightedSharesBasic) row.values.weightedSharesBasic *= factor;
      if (row.values.sharesOutstanding) row.values.sharesOutstanding *= factor;
      if (row.values.epsDiluted) row.values.epsDiluted = Math.round((row.values.epsDiluted / factor) * 1000) / 1000;
      if (row.values.epsBasic) row.values.epsBasic = Math.round((row.values.epsBasic / factor) * 1000) / 1000;
      if (row.values.epsDilutedNormalized) row.values.epsDilutedNormalized = Math.round((row.values.epsDilutedNormalized / factor) * 1000) / 1000;
      if (row.values.dividendPerShare) row.values.dividendPerShare = Math.round((row.values.dividendPerShare / factor) * 10000) / 10000;
      if (row.values.bookValuePerShare) row.values.bookValuePerShare = Math.round((row.values.bookValuePerShare / factor) * 100) / 100;
      if (row.values.tangibleBookValuePerShare) row.values.tangibleBookValuePerShare = Math.round((row.values.tangibleBookValuePerShare / factor) * 100) / 100;
      if (row.values.cashFlowPerShare) row.values.cashFlowPerShare = Math.round((row.values.cashFlowPerShare / factor) * 1000) / 1000;
      if (row.ytdValues) {
        if (row.ytdValues.weightedSharesDiluted) row.ytdValues.weightedSharesDiluted *= factor;
        if (row.ytdValues.weightedSharesBasic) row.ytdValues.weightedSharesBasic *= factor;
        if (row.ytdValues.epsDiluted) row.ytdValues.epsDiluted = Math.round((row.ytdValues.epsDiluted / factor) * 1000) / 1000;
        if (row.ytdValues.epsBasic) row.ytdValues.epsBasic = Math.round((row.ytdValues.epsBasic / factor) * 1000) / 1000;
        if (row.ytdValues.dividendPerShare) row.ytdValues.dividendPerShare = Math.round((row.ytdValues.dividendPerShare / factor) * 10000) / 10000;
      }
    }
  }
}

function sanitizeValuationSeries(points) {
  const metricKeys = ['evEbitda', 'peRatio', 'peRatioNormalized', 'priceToFcf', 'netDebtToEbitda', 'dividendYield', 'payoutRatio', 'payoutRatioNormalized'];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    for (const key of metricKeys) {
      const vPrev = prev[key];
      const vCurr = curr[key];
      const vNext = next[key];
      if (Number.isFinite(vPrev) && Number.isFinite(vCurr) && Number.isFinite(vNext) && vPrev > 0 && vNext > 0) {
        const r1 = vCurr / vPrev;
        const r2 = vCurr / vNext;
        if ((r1 > 2.5 && r2 > 2.5) || (r1 < 0.4 && r2 < 0.4)) {
          curr[key] = Math.round(((vPrev + vNext) / 2) * 100) / 100;
        }
      }
    }
  }
}

function pointInTimeSnapshot(annual, quarterly, submissions = null) {
  const filingDateByPeriod = new Map();
  const recent = submissions?.filings?.recent;
  if (recent) {
    for (let i = 0; i < (recent.form?.length ?? 0); i += 1) {
      if (['10-K', '10-Q', '10-K/A', '10-Q/A', '20-F', '20-F/A', '6-K'].includes(recent.form[i]) && recent.reportDate?.[i] && recent.filingDate?.[i]) {
        if (!filingDateByPeriod.has(recent.reportDate[i]) || recent.filingDate[i] < filingDateByPeriod.get(recent.reportDate[i])) {
          filingDateByPeriod.set(recent.reportDate[i], recent.filingDate[i]);
        }
      }
    }
  }

  const snapshotsByDate = new Map();

  // 1. Rolling TTM quarterly snapshots (base principal continua)
  const quartersAsc = [...quarterly].sort((a, b) => a.sortKey - b.sortKey);
  quartersAsc.forEach((quarter, index) => {
    if (index < 3) return;
    const window = quartersAsc.slice(index - 3, index + 1);
    const endDate = window[window.length - 1].periodEnd;
    if (!endDate) return;

    const effDate = filingDateByPeriod.get(endDate) ?? endDate;

    const normEbitdas = window.map((row) => Number(row.values.ebitdaNormalized ?? row.values.ebitda)).filter((v) => Number.isFinite(v));
    const rawEbitdas = window.map((row) => Number(row.values.ebitda)).filter((v) => Number.isFinite(v));
    const sumNormalized = normEbitdas.length === 4 ? normEbitdas.reduce((sum, v) => sum + v, 0) : null;
    const sumRaw = rawEbitdas.length === 4 ? rawEbitdas.reduce((sum, v) => sum + v, 0) : null;
    let sumEbitda = (sumNormalized !== null && sumNormalized > 0) ? sumNormalized : sumRaw;
    if (!sumEbitda || sumEbitda <= 0) return;

    const latest = window[window.length - 1].values;
    let netDebt = Number(latest.netDebt);
    if (!Number.isFinite(netDebt)) {
      for (let i = window.length - 2; i >= 0; i -= 1) {
        const nd = Number(window[i].values.netDebt);
        if (Number.isFinite(nd)) { netDebt = nd; break; }
      }
    }
    const netDebts = window.map((row) => Number(row.values.netDebt)).filter((v) => Number.isFinite(v));
    const avgNetDebt = netDebts.length ? netDebts.reduce((sum, v) => sum + v, 0) / netDebts.length : netDebt;
    let shares = Number.isFinite(Number(latest.weightedSharesDiluted)) && Number(latest.weightedSharesDiluted) > 0
      ? Number(latest.weightedSharesDiluted)
      : (Number.isFinite(Number(latest.sharesOutstanding)) ? Number(latest.sharesOutstanding) : null);
    if (shares === null) {
      for (let i = window.length - 2; i >= 0; i -= 1) {
        const sh = Number(window[i].values.weightedSharesDiluted) || Number(window[i].values.sharesOutstanding);
        if (Number.isFinite(sh) && sh > 0) { shares = sh; break; }
      }
    }
    if (shares === null) {
      for (const ann of annual) {
        const sh = Number(ann.values?.weightedSharesDiluted) || Number(ann.values?.sharesOutstanding);
        if (Number.isFinite(sh) && sh > 0) { shares = sh; break; }
      }
    }

    const epsValues = window.map((row) => Number(row.values.epsDiluted));
    let epsTtm = epsValues.every((v) => Number.isFinite(v)) ? epsValues.reduce((sum, v) => sum + v, 0) : null;

    const epsNormValues = window.map((row) => Number(row.values.epsDilutedNormalized ?? row.values.epsDiluted));
    let epsNormalizedTtm = epsNormValues.every((v) => Number.isFinite(v)) ? epsNormValues.reduce((sum, v) => sum + v, 0) : null;

    if (epsNormalizedTtm === null && shares && shares > 0) {
      const netIncomesAdj = window.map((row) => Number(row.values.netIncomeToCommonExcludingUnusual ?? row.values.netIncomeAdjusted ?? row.values.netIncome));
      if (netIncomesAdj.every((v) => Number.isFinite(v))) {
        epsNormalizedTtm = Math.round((netIncomesAdj.reduce((sum, v) => sum + v, 0) / shares) * 100) / 100;
      }
    }
    if (epsTtm === null && shares && shares > 0) {
      const netIncomes = window.map((row) => Number(row.values.netIncomeToCommonIncludingUnusual ?? row.values.netIncome));
      if (netIncomes.every((v) => Number.isFinite(v))) {
        epsTtm = Math.round((netIncomes.reduce((sum, v) => sum + v, 0) / shares) * 100) / 100;
      }
    }

    const fcfValues = window.map((row) => Number(row.values.freeCashFlow));
    let fcfTtm = fcfValues.every((v) => Number.isFinite(v)) ? fcfValues.reduce((sum, v) => sum + v, 0) : null;

    const dpsValues = window.map((row) => Number(row.values.dividendPerShare));
    let dpsTtm = dpsValues.every((v) => Number.isFinite(v) && v >= 0 && v < 10)
      ? dpsValues.reduce((sum, v) => sum + v, 0)
      : null;

    let fcfPerShareTtm = (fcfTtm !== null && shares && shares > 0) ? fcfTtm / shares : null;
    if (fcfPerShareTtm === null) {
      const fcfpsValues = window.map((row) => Number(row.values.cashFlowPerShare));
      if (fcfpsValues.every((v) => Number.isFinite(v))) {
        fcfPerShareTtm = fcfpsValues.reduce((sum, v) => sum + v, 0);
      }
    }

    // Reconcile Q4 TTM with audited Annual 10-K if available
    const annualMatch = annual.find((a) => a.periodEnd === endDate);
    if (annualMatch?.values) {
      const annEbitda = Number(annualMatch.values.ebitdaNormalized ?? annualMatch.values.ebitda);
      if (Number.isFinite(annEbitda) && annEbitda > 0) {
        sumEbitda = annEbitda;
      }
      const annEps = Number(annualMatch.values.epsDiluted);
      if (Number.isFinite(annEps)) {
        epsTtm = annEps;
      }
      const annEpsNorm = Number(annualMatch.values.epsDilutedNormalized);
      if (Number.isFinite(annEpsNorm)) {
        epsNormalizedTtm = annEpsNorm;
      }
      const annFcf = Number(annualMatch.values.freeCashFlow);
      if (Number.isFinite(annFcf)) {
        fcfTtm = annFcf;
        if (shares && shares > 0) fcfPerShareTtm = annFcf / shares;
      }
      const annFcfps = Number(annualMatch.values.cashFlowPerShare);
      if (Number.isFinite(annFcfps) && fcfPerShareTtm === null) {
        fcfPerShareTtm = annFcfps;
      }
      const annDps = Number(annualMatch.values.dividendPerShare);
      if (Number.isFinite(annDps) && annDps >= 0 && annDps <= 20) {
        dpsTtm = annDps;
      }
      const annNetDebt = Number(annualMatch.values.netDebt);
      if (Number.isFinite(annNetDebt)) {
        netDebt = annNetDebt;
      }
      const annShares = Number(annualMatch.values.weightedSharesDiluted) || Number(annualMatch.values.sharesOutstanding);
      if (Number.isFinite(annShares) && annShares > 0) {
        shares = annShares;
      }
    }

    snapshotsByDate.set(effDate, {
      date: effDate,
      ebitdaTtm: sumEbitda,
      epsTtm,
      epsNormalizedTtm,
      fcfTtm: Number.isFinite(fcfTtm) ? fcfTtm : null,
      fcfPerShareTtm: Number.isFinite(fcfPerShareTtm) ? fcfPerShareTtm : null,
      dpsTtm: dpsTtm !== null && dpsTtm >= 0 && dpsTtm <= 20 ? dpsTtm : (snapshotsByDate.get(effDate)?.dpsTtm ?? null),
      netDebt: Number.isFinite(netDebt) ? netDebt : null,
      avgNetDebt: Number.isFinite(avgNetDebt) ? avgNetDebt : (Number.isFinite(netDebt) ? netDebt : null),
      shares,
    });
  });

  // 2. Annual snapshots (fallback para periodos sin cobertura trimestral completa)
  const annualAsc = [...annual].sort((a, b) => a.sortKey - b.sortKey);
  annualAsc.forEach((row) => {
    if (!row.periodEnd) return;
    const effDate = filingDateByPeriod.get(row.periodEnd) ?? row.periodEnd;
    if (snapshotsByDate.has(effDate)) {
      const existing = snapshotsByDate.get(effDate);
      if (existing.epsNormalizedTtm === null && Number.isFinite(Number(row.values.epsDilutedNormalized))) {
        existing.epsNormalizedTtm = Number(row.values.epsDilutedNormalized);
      }
      if (existing.epsTtm === null && Number.isFinite(Number(row.values.epsDiluted))) {
        existing.epsTtm = Number(row.values.epsDiluted);
      }
      return;
    }
    const values = row.values;
    const ebitda = Number(values.ebitdaNormalized ?? values.ebitda);
    if (!Number.isFinite(ebitda) || ebitda <= 0) return;
    const eps = Number(values.epsDiluted);
    const epsNormalized = Number(values.epsDilutedNormalized);
    const fcf = Number(values.freeCashFlow);
    const fcfps = Number(values.cashFlowPerShare);
    const dps = Number(values.dividendPerShare);
    const netDebt = Number(values.netDebt);
    const shares = Number.isFinite(Number(values.weightedSharesDiluted)) && Number(values.weightedSharesDiluted) > 0
      ? Number(values.weightedSharesDiluted)
      : (Number.isFinite(Number(values.sharesOutstanding)) ? Number(values.sharesOutstanding) : null);
    const fcfPerShare = Number.isFinite(fcfps) ? fcfps : (Number.isFinite(fcf) && shares && shares > 0 ? fcf / shares : null);

    snapshotsByDate.set(effDate, {
      date: effDate,
      ebitdaTtm: ebitda,
      epsTtm: Number.isFinite(eps) ? eps : null,
      epsNormalizedTtm: Number.isFinite(epsNormalized) ? epsNormalized : (Number.isFinite(eps) ? eps : null),
      fcfTtm: Number.isFinite(fcf) ? fcf : null,
      fcfPerShareTtm: Number.isFinite(fcfPerShare) ? fcfPerShare : null,
      dpsTtm: Number.isFinite(dps) && dps >= 0 && dps <= 20 ? dps : null,
      netDebt: Number.isFinite(netDebt) ? netDebt : null,
      shares,
    });
  });

  const sortedSnaps = [...snapshotsByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const s of sortedSnaps) {
    if (s.epsNormalizedTtm === null || s.epsTtm === null) {
      const year = s.date?.slice(0, 4);
      const ann = annual.find((a) => a.periodEnd?.startsWith(year) || (a.sortKey && Math.floor(a.sortKey / 10) === Number(year)));
      if (s.epsNormalizedTtm === null && Number.isFinite(Number(ann?.values?.epsDilutedNormalized))) {
        s.epsNormalizedTtm = Number(ann.values.epsDilutedNormalized);
      }
      if (s.epsTtm === null && Number.isFinite(Number(ann?.values?.epsDiluted))) {
        s.epsTtm = Number(ann.values.epsDiluted);
      }
    }
  }

  for (let i = 1; i < sortedSnaps.length; i += 1) {
    const prev = sortedSnaps[i - 1];
    const curr = sortedSnaps[i];
    if (curr.epsNormalizedTtm === null && prev.epsNormalizedTtm !== null) curr.epsNormalizedTtm = prev.epsNormalizedTtm;
    if (curr.epsTtm === null && prev.epsTtm !== null) curr.epsTtm = prev.epsTtm;
    if (curr.fcfPerShareTtm === null && prev.fcfPerShareTtm !== null) curr.fcfPerShareTtm = prev.fcfPerShareTtm;
    if (curr.dpsTtm === null && prev.dpsTtm !== null) curr.dpsTtm = prev.dpsTtm;
  }
  for (let i = sortedSnaps.length - 2; i >= 0; i -= 1) {
    const next = sortedSnaps[i + 1];
    const curr = sortedSnaps[i];
    if (curr.epsNormalizedTtm === null && next.epsNormalizedTtm !== null) curr.epsNormalizedTtm = next.epsNormalizedTtm;
    if (curr.epsTtm === null && next.epsTtm !== null) curr.epsTtm = next.epsTtm;
    if (curr.fcfPerShareTtm === null && next.fcfPerShareTtm !== null) curr.fcfPerShareTtm = next.fcfPerShareTtm;
    if (curr.dpsTtm === null && next.dpsTtm !== null) curr.dpsTtm = next.dpsTtm;
  }

  return sortedSnaps;
}

export async function getValuationSeries(ticker, rangeKey = '5y') {
  const days = VALUATION_RANGES[rangeKey] ?? VALUATION_RANGES['5y'];
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const [company, prices] = await Promise.all([
    getCompanyByTicker(ticker),
    getHistoricalPrices(ticker, { from, to }).catch(() => []),
  ]);
  const [facts, submissions] = await Promise.all([
    getCompanyFacts(company),
    getCompanySubmissions(company).catch(() => null),
  ]);
  const { annual, quarterly } = buildSeries(facts);
  try {
    const extensionFacts = await getExtensionFacts(company);
    mergeInstanceFacts(annual, quarterly, extensionFacts, company.ticker);
  } catch {
    // Si falla el rescate desde las instancias XBRL, se devuelven solo los datos estándar.
  }
  propagateMissingShares(annual, quarterly);
  rederiveCashValues(annual, quarterly);
  rederiveIncomeValues(annual, quarterly);
  rederiveBalanceValues(annual, quarterly);

  harmonizeSeriesSplits(annual, quarterly);

  const snapshots = pointInTimeSnapshot(annual, quarterly, submissions);
  const points = [];
  let snapshotIndex = -1;

  for (const price of prices) {
    while (snapshotIndex + 1 < snapshots.length && snapshots[snapshotIndex + 1].date <= price.date) snapshotIndex += 1;
    const snapshot = snapshotIndex >= 0 ? snapshots[snapshotIndex] : null;
    if (!snapshot) continue;

    const nextSnapshot = (snapshotIndex + 1 < snapshots.length) ? snapshots[snapshotIndex + 1] : null;

    let interpEbitda = snapshot.ebitdaTtm;
    let interpEps = snapshot.epsTtm;
    let interpEpsNorm = snapshot.epsNormalizedTtm;
    let interpDps = snapshot.dpsTtm;
    let interpFcf = snapshot.fcfTtm;
    let interpFcfPerShare = snapshot.fcfPerShareTtm;

    if (nextSnapshot) {
      const tCurr = Date.parse(`${snapshot.date}T00:00:00Z`);
      const tNext = Date.parse(`${nextSnapshot.date}T00:00:00Z`);
      const tPrice = Date.parse(`${price.date}T00:00:00Z`);
      const span = tNext - tCurr;
      if (span > 0) {
        const fraction = Math.max(0, Math.min(1, (tPrice - tCurr) / span));
        if (Number.isFinite(snapshot.ebitdaTtm) && snapshot.ebitdaTtm > 0 &&
            Number.isFinite(nextSnapshot.ebitdaTtm) && nextSnapshot.ebitdaTtm > 0) {
          interpEbitda = snapshot.ebitdaTtm + fraction * (nextSnapshot.ebitdaTtm - snapshot.ebitdaTtm);
        }
        if (Number.isFinite(snapshot.epsTtm) && Number.isFinite(nextSnapshot.epsTtm)) {
          interpEps = snapshot.epsTtm + fraction * (nextSnapshot.epsTtm - snapshot.epsTtm);
        }
        if (Number.isFinite(snapshot.epsNormalizedTtm) && Number.isFinite(nextSnapshot.epsNormalizedTtm)) {
          interpEpsNorm = snapshot.epsNormalizedTtm + fraction * (nextSnapshot.epsNormalizedTtm - snapshot.epsNormalizedTtm);
        }
        if (Number.isFinite(snapshot.dpsTtm) && snapshot.dpsTtm >= 0 &&
            Number.isFinite(nextSnapshot.dpsTtm) && nextSnapshot.dpsTtm >= 0) {
          interpDps = snapshot.dpsTtm + fraction * (nextSnapshot.dpsTtm - snapshot.dpsTtm);
        }
        if (Number.isFinite(snapshot.fcfTtm) && Number.isFinite(nextSnapshot.fcfTtm)) {
          interpFcf = snapshot.fcfTtm + fraction * (nextSnapshot.fcfTtm - snapshot.fcfTtm);
        }
        if (Number.isFinite(snapshot.fcfPerShareTtm) && Number.isFinite(nextSnapshot.fcfPerShareTtm)) {
          interpFcfPerShare = snapshot.fcfPerShareTtm + fraction * (nextSnapshot.fcfPerShareTtm - snapshot.fcfPerShareTtm);
        }
      }
    }

    const close = Number(price.close);
    if (!Number.isFinite(close) || close <= 0) continue;
    const shares = Number.isFinite(Number(snapshot.shares)) && Number(snapshot.shares) > 0
      ? Number(snapshot.shares)
      : (Number(company?.shares) || null);
    const marketCap = shares !== null ? close * shares : null;
    let netDebt = snapshot.netDebt;
    if (netDebt === null && snapshotIndex > 0) {
      for (let si = snapshotIndex - 1; si >= 0; si -= 1) {
        if (snapshots[si].netDebt !== null) { netDebt = snapshots[si].netDebt; break; }
      }
    }
    const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap + netDebt : marketCap;
    const evEbitda = (enterpriseValue !== null && enterpriseValue > 0 && Number.isFinite(interpEbitda) && interpEbitda > 0)
      ? enterpriseValue / interpEbitda
      : null;
    const peRatio = Number.isFinite(interpEps) && interpEps > 0 ? close / interpEps : null;
    const peRatioNormalized = Number.isFinite(interpEpsNorm) && interpEpsNorm > 0 ? close / interpEpsNorm : null;
    const priceToFcf = Number.isFinite(interpFcfPerShare) && interpFcfPerShare > 0
      ? close / interpFcfPerShare
      : (marketCap !== null && Number.isFinite(interpFcf) && interpFcf > 0 ? marketCap / interpFcf : null);
    const netDebtToEbitda = netDebt !== null && Number.isFinite(interpEbitda) && interpEbitda > 0
      ? netDebt / interpEbitda
      : null;
    const dividendYield = Number.isFinite(interpDps) && interpDps >= 0 ? (interpDps / close) * 100 : null;
    const payoutRatio = (Number.isFinite(interpDps) && interpDps >= 0 && Number.isFinite(interpEps) && interpEps > 0)
      ? (interpDps / interpEps) * 100
      : null;
    const payoutRatioNormalized = (Number.isFinite(interpDps) && interpDps >= 0 && Number.isFinite(interpEpsNorm) && interpEpsNorm > 0)
      ? (interpDps / interpEpsNorm) * 100
      : null;

    points.push({
      t: Math.floor(Date.parse(`${price.date}T00:00:00Z`) / 1000),
      date: price.date,
      price: close,
      evEbitda: evEbitda !== null && evEbitda > 0 && evEbitda < 250 ? Math.round(evEbitda * 100) / 100 : null,
      peRatio: peRatio !== null && peRatio > 0 && peRatio < 300 ? Math.round(peRatio * 100) / 100 : null,
      peRatioNormalized: peRatioNormalized !== null && peRatioNormalized > 0 && peRatioNormalized < 300 ? Math.round(peRatioNormalized * 100) / 100 : null,
      priceToFcf: priceToFcf !== null && priceToFcf > 0 && priceToFcf < 300 ? Math.round(priceToFcf * 100) / 100 : null,
      netDebtToEbitda: netDebtToEbitda !== null && netDebtToEbitda > -50 && netDebtToEbitda < 50 ? Math.round(netDebtToEbitda * 100) / 100 : null,
      dividendYield: dividendYield !== null && dividendYield > 0 && dividendYield < 30 ? Math.round(dividendYield * 100) / 100 : null,
      payoutRatio: payoutRatio !== null && payoutRatio >= 0 && payoutRatio < 500 ? Math.round(payoutRatio * 100) / 100 : null,
      payoutRatioNormalized: payoutRatioNormalized !== null && payoutRatioNormalized >= 0 && payoutRatioNormalized < 500 ? Math.round(payoutRatioNormalized * 100) / 100 : null,
      dpsTtm: Number.isFinite(interpDps) ? Math.round(interpDps * 100) / 100 : null,
      netDebt: Number.isFinite(Number(netDebt)) ? Number(netDebt) : null,
      ebitdaTtm: Number.isFinite(Number(interpEbitda)) ? Math.round(interpEbitda) : null,
      epsTtm: Number.isFinite(interpEps) ? Math.round(interpEps * 100) / 100 : null,
      epsNormalizedTtm: Number.isFinite(interpEpsNorm) ? Math.round(interpEpsNorm * 100) / 100 : null,
      fcfTtm: Number.isFinite(interpFcf) ? Math.round(interpFcf) : null,
      fcfPerShareTtm: Number.isFinite(interpFcfPerShare) ? Math.round(interpFcfPerShare * 100) / 100 : null,
      enterpriseValue: Number.isFinite(Number(enterpriseValue)) ? Number(enterpriseValue) : null,
    });
  }

  sanitizeValuationSeries(points);

  return {
    range: VALUATION_RANGES[rangeKey] ? rangeKey : '5y',
    currency: 'USD',
    points,
    source: 'SEC EDGAR + Yahoo Finance',
  };
}
