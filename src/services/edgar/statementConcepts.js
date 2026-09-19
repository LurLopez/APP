/**
 * @fileoverview Definiciones contables de XBRL y mapeo de tags de la SEC para estados financieros.
 * @module services/edgar/statementConcepts
 */

export const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
export const FACTS_URL_TEMPLATE = 'https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json';
export const SUBMISSIONS_URL_TEMPLATE = 'https://data.sec.gov/submissions/CIK{CIK}.json';
export const USER_AGENT = 'CifraResearch/1.0 (contacto@cifraresearch.com)';

export const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;
export const FACTS_TTL = 6 * 60 * 60 * 1000;
export const FILINGS_TTL = 6 * 60 * 60 * 1000;
export const FILINGS_LIMIT = 40;
export const EARNINGS_WINDOW_DAYS = 65;
export const FILING_PRESENTATIONS_LIMIT = 16;

/**
 * Mapeo de conceptos contables XBRL a métricas financieras.
 */
export const STATEMENTS = {
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
    { key: 'revenue', label: 'Ingresos', tags: ['RevenueFromContractWithCustomerIncludingAssessedTax', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'Revenues', 'RevenueFromContractWithCustomer', 'TotalRevenuesAndOtherIncome', 'OperatingRevenue', 'OperatingRevenues', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RealEstateRevenueNet', 'RegulatedOperatingRevenue', 'FinancialServicesRevenue', 'RevenuesNetOfInterestExpense', 'InterestAndDividendIncomeOperating', 'HealthCareOrganizationRevenue', 'ElectricUtilityOperatingRevenue', 'GasUtilityOperatingRevenue', 'SalesRevenueGross', 'OtherSalesRevenueNet', 'OperatingRevenueNet', 'NoninterestIncome', 'OilAndGasRevenue', 'RevenueMineralSales', 'FoodAndBeverageRevenue'], unit: 'USD' },
    { key: 'costOfRevenue', label: 'Coste de ventas', tags: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfServices', 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization', 'CostOfGoodsSoldExcludingDepreciationDepletionAndAmortization', 'CostOfServicesExcludingDepreciationDepletionAndAmortization', 'CostOfGoodsAndServicesSoldDepreciationAndAmortization', 'OperatingExpensesExcludingDepreciationDepletionAndAmortization', 'CostOfPurchasedPower', 'CostOfRealEstateRevenue', 'CostOfPurchasedOilAndGas', 'CostOfDirectMaterialsAndLabor', 'OtherCostAndExpenseOperating'], unit: 'USD', negative: true },
    { key: 'grossProfit', label: 'Beneficio bruto', tags: ['GrossProfit', 'GrossProfitLoss', 'GrossMargin'], unit: 'USD', emphasis: true },
    { key: 'sellingGeneralAdmin', label: 'Gastos de venta, generales y administrativos', tags: ['SellingGeneralAndAdministrativeExpense', 'SellingGeneralAdministrativeAndOtherOperatingExpense', 'GeneralAndAdministrativeExpense', 'SellingAndMarketingExpense', 'SellingExpense', 'AdministrativeExpense', 'SellingGeneralAndAdministrativeExpenseExcludingDepreciationDepletionAndAmortization'], unit: 'USD', negative: true },
    { key: 'researchDevelopment', label: 'Gastos de I+D', tags: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost', 'ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost', 'AcquiredInProcessResearchAndDevelopmentCosts'], unit: 'USD', negative: true },
    { key: 'amortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tags: ['AmortizationOfIntangibleAssets', 'AmortizationOfGoodwill'], unit: 'USD', negative: true },
    { key: 'otherOperatingExpenses', label: 'Otros gastos operacionales', tags: ['OtherOperatingIncomeExpenseNet', 'OtherOperatingExpense'], unit: 'USD', negative: true },
    { key: 'operatingExpenses', label: 'Gastos operativos totales', tags: ['OperatingExpenses', 'OperatingExpensesExcludingDepreciationDepletionAndAmortization', 'CostsAndExpenses', 'OperatingCostsAndExpenses', 'OperatingExpensesDepreciationAndAmortization'], unit: 'USD', negative: true },
    { key: 'operatingIncome', label: 'Beneficio operativo', tags: ['OperatingIncomeLoss', 'OperatingIncome', 'OperatingProfitLoss', 'OperatingProfit', 'IncomeLossFromContinuingOperationsBeforeInterestAndIncomeTaxes', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], unit: 'USD', emphasis: true },
    { key: 'interestExpense', label: 'Gastos por intereses', tags: ['InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestExpense', 'InterestIncomeExpenseNet', 'InterestExpenseNet', 'InterestAndDebtExpense', 'InterestExpenseBorrowings', 'InterestAndFeeExpense'], unit: 'USD', negative: true },
    { key: 'interestIncome', label: 'Ingresos por intereses e inversiones', tags: ['InvestmentIncomeInterest', 'InterestIncomeNonoperating', 'InterestAndDividendIncomeOperating', 'InterestIncomeOperating'], unit: 'USD' },
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
    { key: 'ebtIncludingUnusual', label: 'EBT incl. Artículos extraordinarios', tags: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxes', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesOtherThanTemporaryImpairments'], unit: 'USD', emphasis: true },
    { key: 'incomeTax', label: 'Gastos de impuestos', tags: ['IncomeTaxExpenseBenefit', 'CurrentIncomeTaxExpenseBenefit', 'IncomeTaxExpenseBenefitContinuingOperations'], unit: 'USD', invertSign: true },
    { key: 'incomeFromContinuingOps', label: 'Beneficios por operaciones continuadas', tags: ['IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest', 'IncomeLossFromContinuingOperations', 'IncomeLossFromContinuingOperationsBeforeExtraordinaryItems'], unit: 'USD', emphasis: true },
    { key: 'discontinuedOperations', label: 'Beneficios por operaciones discontinuadas', tags: ['IncomeLossFromDiscontinuedOperationsNetOfTax'], unit: 'USD' },
    { key: 'netIncome', label: 'Beneficio neto de la empresa', tags: ['ProfitLoss', 'NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'NetIncomeLossAvailableToCommonStockholdersDiluted', 'ComprehensiveIncomeNetOfTax'], unit: 'USD', emphasis: true },
    { key: 'minorityInterestIncome', label: 'Intereses minoritario', tags: ['NetIncomeLossAttributableToNoncontrollingInterest', 'NetIncomeLossAttributableToNoncontrollingInterestBeforeTax'], unit: 'USD', invertSign: true },
    { key: 'preferredDividendsOtherAdjustments', label: 'Dividendo preferente y otros ajustes', tags: ['PreferredStockDividendsAndOtherAdjustments', 'DividendsPreferredStockCash'], unit: 'USD', negative: true },
    { key: 'netIncomeToCommonIncludingUnusual', label: 'Beneficio neto a acciones comunes', tags: ['NetIncomeLossAvailableToCommonStockholdersBasic', 'NetIncomeLossAvailableToCommonStockholdersDiluted', 'NetIncomeLoss'], unit: 'USD', emphasis: true },
    { key: 'netIncomeToCommonExcludingUnusual', label: 'Beneficio neto ajustado', tags: ['NetIncomeLossAvailableToCommonStockholders'], unit: 'USD', emphasis: true },
    { key: 'epsDiluted', label: 'BPA diluido', tags: ['EarningsPerShareDiluted', 'DilutedEarningsLossPerShare', 'IncomeLossFromContinuingOperationsPerDilutedShare'], unit: 'USD/shares', format: 'perShare' },
    { key: 'epsDilutedNormalized', label: 'BPA diluido ajustado', tags: ['IncomeLossFromContinuingOperationsPerDilutedShare', 'DilutedEarningsPerShareFromContinuingOperations'], unit: 'USD/shares', format: 'perShare' },
    { key: 'weightedSharesDiluted', label: 'Promedio ponderado de acciones diluidas en circulación', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingDiluted', 'WeightedAverageNumberOfDilutedSharesOutstandingCombined'], unit: 'shares', format: 'shares' },
    { key: 'weightedSharesBasic', label: 'Promedio ponderado de acciones básicas en circulación', tags: ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfSharesOutstandingBasicCombined', 'CommonStockSharesOutstanding'], unit: 'shares', format: 'shares' },
    { key: 'epsBasic', label: 'BPA básico', tags: ['EarningsPerShareBasic', 'BasicEarningsLossPerShare', 'IncomeLossFromContinuingOperationsPerBasicShare'], unit: 'USD/shares', format: 'perShare' },
    { key: 'dividendPerShare', label: 'Dividendo por acción', tags: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid', 'CommonStockDividendsPerShareDeclaredAndPaid', 'DividendsPerShareDeclared'], unit: 'USD/shares', format: 'perShare' },
    { key: 'rentExpense', label: 'Gastos de alquiler', tags: ['RentExpense', 'LeaseAndRentalExpense', 'OperatingLeaseCost'], unit: 'USD', negative: true },
    { key: 'salesMarketing', label: 'Gastos de venta y marketing', tags: ['SellingAndMarketingExpense', 'SellingAndMarketingCosts'], unit: 'USD', negative: true },
    { key: 'ebitda', label: 'EBITDA', unit: 'USD', format: 'money', derived: true },
    { key: 'ebitdar', label: 'EBITDAR', unit: 'USD', format: 'money', derived: true },
  ],
  balance: [
    { key: 'cash', label: 'Efectivo y equivalentes', tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations', 'CashCashEquivalentsAndShortTermInvestments', 'Cash', 'CashEquivalentsAtCarryingValue', 'CashAndDueFromBanks'], unit: 'USD' },
    { key: 'restrictedCash', label: 'Efectivo restringido', tags: ['RestrictedCashAndCashEquivalentsAtCarryingValue', 'RestrictedCash'], unit: 'USD' },
    { key: 'restrictedCashCurrent', label: 'Efectivo restringido corriente', tags: ['RestrictedCashCurrent', 'RestrictedCashAndCashEquivalentsCurrent', 'RestrictedCashAndInvestmentsCurrent'], unit: 'USD' },
    { key: 'restrictedCashNoncurrent', label: 'Efectivo restringido no corriente', tags: ['RestrictedCashAndCashEquivalentsNoncurrent', 'RestrictedCashNoncurrent'], unit: 'USD' },
    { key: 'shortTermInvestments', label: 'Activos financieros para vender', tags: ['ShortTermInvestments', 'OtherShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecurities', 'MarketableSecurities', 'AvailableForSaleSecuritiesCurrent', 'TradingSecuritiesCurrent', 'HeldToMaturitySecuritiesCurrent', 'MarketableSecuritiesDebtSecuritiesCurrent', 'OtherInvestmentsCurrent', 'CashCashEquivalentsAndShortTermInvestments'], unit: 'USD' },
    { key: 'cashAndShortTermInvestments', label: 'Efectivo total e inversiones a corto plazo', tags: ['CashCashEquivalentsAndShortTermInvestments'], unit: 'USD', emphasis: true, derived: true },
    { key: 'receivables', label: 'Cuentas por cobrar', tags: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsNotesAndLoansReceivableNetCurrent', 'AccountsReceivableNet', 'ReceivablesNet', 'AccountsAndOtherReceivablesNetCurrent', 'TradeAndOtherReceivablesCurrent'], unit: 'USD' },
    { key: 'otherReceivables', label: 'Otros por cobrar', tags: ['OtherReceivables', 'AccountsReceivableOtherCurrent'], unit: 'USD' },
    { key: 'totalReceivables', label: 'Total de cuentas por cobrar', tags: ['AccountsNotesAndLoansReceivableNetCurrent', 'ReceivablesNetCurrent'], unit: 'USD', emphasis: true, derived: true },
    { key: 'inventory', label: 'Inventario', tags: ['InventoryNet', 'InventoryGross', 'Inventories', 'InventoryFinishedGoodsNetOfReserves', 'InventoryWorkInProcessAndRawMaterialsNetOfReserves'], unit: 'USD' },
    { key: 'prepaidExpenses', label: 'Gastos pagados por anticipado', tags: ['PrepaidExpenseAndOtherAssetsCurrent'], unit: 'USD' },
    { key: 'deferredTaxAssetsCurrent', label: 'Activos por impuestos diferidos Corrientes', tags: ['DeferredTaxAssetsNetCurrent'], unit: 'USD' },
    { key: 'otherCurrentAssets', label: 'Otro activo corriente', tags: ['OtherAssetsCurrent', 'OtherCurrentAssets'], unit: 'USD' },
    { key: 'currentAssets', label: 'Total de activo corriente', tags: ['AssetsCurrent', 'AssetsCurrentExcludingDisposalGroup', 'OtherAssetsCurrent'], unit: 'USD', emphasis: true },
    { key: 'propertyPlantEquipmentGross', label: 'Inmovilizado material bruto', tags: ['PropertyPlantAndEquipmentGross', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetBeforeAccumulatedDepreciationAndAmortization', 'PropertyPlantAndEquipmentOwnedGross', 'PropertyPlantAndEquipmentAndCapitalLeaseGross'], unit: 'USD' },
    { key: 'accumulatedDepreciation', label: 'Depreciación acumulada', tags: ['AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment', 'PropertyPlantAndEquipmentOwnedAccumulatedDepreciation', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAccumulatedDepreciationAndAmortization'], unit: 'USD', negative: true },
    { key: 'propertyPlantEquipment', label: 'Inmovilizado material neto', tags: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization', 'PropertyPlantAndEquipmentNetExcludingConstructionInProgress', 'PropertyPlantAndEquipmentAndFinanceLeasesNet'], unit: 'USD', emphasis: true },
    { key: 'longTermInvestments', label: 'Inversiones a largo plazo', tags: ['LongTermInvestments', 'OtherInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent', 'EquityMethodInvestments'], unit: 'USD' },
    { key: 'goodwill', label: 'Fondo de comercio', tags: ['Goodwill'], unit: 'USD' },
    { key: 'otherIntangibleAssets', label: 'Otros intangibles', combine: ['FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'], tags: ['IntangibleAssetsNetExcludingGoodwill', 'OtherIntangibleAssetsNet', 'FiniteLivedIntangibleAssetsNet', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'], unit: 'USD' },
    { key: 'longTermReceivables', label: 'Préstamos por cobrar a largo plazo', tags: ['LoansAndNotesReceivableNoncurrent', 'LongTermReceivables'], unit: 'USD' },
    { key: 'deferredTaxAssetsNoncurrent', label: 'Activos por impuestos diferidos a largo plazo', tags: ['DeferredTaxAssetsNetNoncurrent', 'DeferredIncomeTaxAssetsNet'], unit: 'USD' },
    { key: 'deferredCharges', label: 'Cargos diferidos a largo plazo', tags: ['DeferredCharges', 'OtherDeferredCharges', 'HostingArrangementServiceContractImplementationCostCapitalizedAfterAccumulatedAmortization'], unit: 'USD' },
    { key: 'otherAssetsNoncurrent', label: 'Otros activos a largo plazo', tags: ['OtherAssetsNoncurrent'], unit: 'USD' },
    { key: 'assetsNoncurrent', label: 'Activo no corriente', tags: ['AssetsNoncurrent'], unit: 'USD', derived: true },
    { key: 'assets', label: 'Activo total', tags: ['Assets', 'AssetsNet', 'TotalAssets'], unit: 'USD', emphasis: true },
    { key: 'payables', label: 'Cuentas por pagar', tags: ['AccountsPayableCurrent', 'AccountsPayableTradeCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent', 'AccountsPayable', 'AccountsPayableAndOtherAccruedLiabilitiesCurrent', 'TradeAccountsPayableCurrent', 'AccountsPayableCurrentAndNoncurrent'], unit: 'USD' },
    { key: 'accruedLiabilities', label: 'Gastos devengados', tags: ['AccruedLiabilitiesCurrent', 'EmployeeRelatedLiabilitiesCurrent', 'AccruedExpensesCurrent', 'OtherAccruedLiabilitiesCurrent', 'AccruedIncomeTaxesCurrent'], unit: 'USD' },
    { key: 'shortTermLoans', label: 'Préstamos de corto plazo', tags: ['ShortTermBorrowings', 'ShortTermDebt', 'LinesOfCreditCurrent', 'CommercialPaper', 'OtherShortTermBorrowings', 'NotesAndLoansPayableCurrent', 'CommercialPaperCurrent', 'LinesOfCredit', 'ShortTermBankLoansAndOtherBorrowings', 'NotesPayableCurrent'], unit: 'USD' },
    { key: 'longTermDebtCurrent', label: 'Porción corriente de la deuda a largo plazo', tags: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 'LongTermDebtAndFinanceLeasesCurrent', 'LongTermDebtCurrentNoncurrent', 'LongTermDebtMaturingInYearsOneAndTwo', 'CurrentPortionOfLongTermDebt'], unit: 'USD' },
    { key: 'currentCapitalLeaseObligations', label: 'Porción corriente de las obligaciones de arrendamiento financiero', tags: ['CapitalLeaseObligationsCurrent', 'FinanceLeaseLiabilityCurrent'], unit: 'USD' },
    { key: 'deferredTaxLiabilitiesCurrent', label: 'Pasivo por impuestos diferidos Corriente', tags: ['DeferredTaxLiabilitiesCurrent'], unit: 'USD' },
    { key: 'otherCurrentLiabilities', label: 'Otros pasivos corrientes', tags: ['OtherLiabilitiesCurrent'], unit: 'USD' },
    { key: 'currentLiabilities', label: 'Total pasivo corriente', tags: ['LiabilitiesCurrent', 'LiabilitiesCurrentExcludingDisposalGroup'], unit: 'USD', emphasis: true },
    { key: 'longTermDebt', label: 'Deuda a largo plazo', tags: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebt', 'LongTermDebtAndFinanceLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsNoncurrent', 'LongTermNotesAndBondsNoncurrent', 'SeniorNotesNoncurrent', 'LongTermDebtExcludingCurrentPortion', 'DebtInstrumentCarryingAmount', 'FinanceLeaseLiabilityNoncurrent'], unit: 'USD' },
    { key: 'capitalLeasesNoncurrent', label: 'Arrendamientos de capitales', tags: ['CapitalLeaseObligationsNoncurrent', 'FinanceLeaseLiabilityNoncurrent'], unit: 'USD' },
    { key: 'pensions', label: 'Pensiones y otros beneficios posteriores a la jubilación', tags: ['PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent', 'DefinedBenefitPlanLiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'deferredTaxLiabilitiesNoncurrent', label: 'Pasivo por impuesto diferido no corriente', tags: ['DeferredTaxLiabilitiesNoncurrent', 'DeferredIncomeTaxLiabilitiesNet'], unit: 'USD' },
    { key: 'otherLiabilitiesNoncurrent', label: 'Otro pasivo no corriente', tags: ['OtherLiabilitiesNoncurrent'], unit: 'USD' },
    { key: 'liabilitiesNoncurrent', label: 'Pasivo no corriente', tags: ['LiabilitiesNoncurrent'], unit: 'USD', derived: true },
    { key: 'liabilities', label: 'Pasivo Total', tags: ['Liabilities', 'LiabilitiesCurrentAndNoncurrent', 'TotalLiabilities'], unit: 'USD', emphasis: true },
    { key: 'commonStock', label: 'Acciones comunes', tags: ['CommonStockValue'], unit: 'USD' },
    { key: 'additionalPaidInCapital', label: 'Prima de suscripción', tags: ['AdditionalPaidInCapital', 'AdditionalPaidInCapitalCommonStock'], unit: 'USD' },
    { key: 'retainedEarnings', label: 'Beneficio no distribuido', tags: ['RetainedEarningsAccumulatedDeficit'], unit: 'USD' },
    { key: 'treasuryStock', label: 'Autocartera', tags: ['TreasuryStockCommonValue', 'TreasuryStockValue'], unit: 'USD', negative: true },
    { key: 'accumulatedOtherComprehensiveIncome', label: 'Resultado integral y otros', tags: ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'], unit: 'USD' },
    { key: 'commonEquity', label: 'Patrimonio neto común total', tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'CommonStockholdersEquity', 'ShareholdersEquity'], unit: 'USD', emphasis: true },
    { key: 'minorityInterest', label: 'Intereses minoritarios', combine: ['MinorityInterest', 'RedeemableNoncontrollingInterestEquityCarryingAmount'], tags: ['MinorityInterest', 'MinorityInterestInConsolidatedEntity', 'RedeemableNoncontrollingInterestEquityCarryingAmount'], unit: 'USD' },
    { key: 'equity', label: 'Fondos propios totales', tags: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity'], unit: 'USD', emphasis: true },
    { key: 'liabilitiesAndEquity', label: 'Pasivo total y patrimonio neto', tags: ['LiabilitiesAndStockholdersEquity'], unit: 'USD', emphasis: true, derived: true },
    { key: 'sharesOutstanding', label: 'Total de acciones fuera en la fecha de presentación', tags: ['EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'], namespace: 'dei', unit: 'shares', format: 'shares' },
    { key: 'bookValuePerShare', label: 'Valor contable / Acción', unit: 'USD/shares', format: 'perShare', derived: true },
    { key: 'tangibleBookValue', label: 'Valor contable tangible', unit: 'USD', derived: true },
    { key: 'tangibleBookValuePerShare', label: 'Tangible Book Value / Share', unit: 'USD/shares', format: 'perShare', derived: true },
    { key: 'totalDebt', label: 'Deuda total', tags: ['DebtAndCapitalLeaseObligations', 'DebtInstrumentCarryingAmount', 'TotalDebt', 'Borrowings', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtNoncurrent'], unit: 'USD', derived: true },
    { key: 'netDebt', label: 'Deuda neta', unit: 'USD', derived: true },
    { key: 'equityMethodInvestments', label: 'Inversiones por método de participación', tags: ['EquityMethodInvestments'], unit: 'USD' },
    { key: 'land', label: 'Terrenos', tags: ['Land'], unit: 'USD' },
    { key: 'buildings', label: 'Edificios', tags: ['Buildings'], unit: 'USD' },
    { key: 'constructionInProgress', label: 'Construcción en progreso', tags: ['ConstructionInProgress'], unit: 'USD' },
    { key: 'employees', label: 'Empleados a tiempo completo', namespace: 'dei', tags: ['EntityNumberOfEmployees'], unit: 'employees', format: 'count' },
  ],
  cashflow: [
    { key: 'netIncome', label: 'Beneficio netos', tags: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ComprehensiveIncomeNetOfTax'], unit: 'USD' },
    { key: 'depreciation', label: 'Depreciación', tags: ['Depreciation', 'DepreciationNonproduction', 'DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAndAmortizationContinuingOperations'], unit: 'USD' },
    { key: 'cashflowAmortizationGoodwillIntangibles', label: 'Amortización de fondos de comercio y activos intangibles', tags: ['AmortizationOfIntangibleAssets', 'AmortizationOfGoodwill', 'AmortizationOfGoodwillAndIntangibles', 'AmortizationOfIntangibles'], unit: 'USD' },
    { key: 'depreciationAmortizationTotal', label: 'Depreciación y amortización total', tags: ['DepreciationAndAmortization', 'DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortizationContinuingOperations'], unit: 'USD' },
    { key: 'amortizationDeferredCharges', label: 'Amortización de cargos diferidos', combine: ['AmortizationOfFinancingCostsAndDiscounts', 'HostingArrangementServiceContractImplementationCostExpenseAmortization'], tags: ['AmortizationOfFinancingCostsAndDiscounts', 'HostingArrangementServiceContractImplementationCostExpenseAmortization', 'AmortizationOfDeferredCharges', 'AmortizationOfDeferredFinancingCosts', 'AmortizationOfDebtIssuanceCosts'], unit: 'USD' },
    { key: 'cashflowGainLossOnAssets', label: '(Ganancia) Pérdida por venta de activos', tags: ['GainLossOnSaleOfPropertyPlantEquipment', 'GainLossOnSaleOfOtherAssets', 'GainLossOnDispositionOfAssets', 'GainLossOnSaleOfProperty'], unit: 'USD', invertSign: true },
    { key: 'cashflowGainLossOnInvestments', label: '(Ganancia) Pérdida por venta de inversiones', tags: ['GainLossOnSaleOfInvestments', 'GainLossOnSaleOfSecuritiesNet', 'GainLossOnInvestments'], unit: 'USD', invertSign: true },
    { key: 'impairmentRestructuring', label: 'Deterioro de activos y costes de reestructuración', combine: ['GoodwillImpairmentLoss', 'RestructuringReserveAcceleratedDepreciation'], tags: ['GoodwillImpairmentLoss', 'RestructuringReserveAcceleratedDepreciation', 'GoodwillAndIntangibleAssetImpairment', 'ImpairmentOfLongLivedAssetsHeldForUse', 'RestructuringCharges', 'RestructuringAndRelatedCostIncurredCost', 'AssetImpairmentCharges'], unit: 'USD' },
    { key: 'equityMethodCashflow', label: '(Ingresos) Pérdidas en inversiones de capital', tags: ['IncomeLossFromEquityMethodInvestments', 'IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions'], unit: 'USD', invertSign: true },
    { key: 'stockCompensation', label: 'Compensación de stock options', tags: ['ShareBasedCompensation', 'ShareBasedCompensationArrangementByShareBasedPaymentAwardExpense', 'AllocatedShareBasedCompensationExpense'], unit: 'USD' },
    { key: 'excessTaxBenefitStockOptions', label: 'Beneficio fiscal de las opciones sobre acciones', tags: ['ExcessTaxBenefitFromShareBasedCompensationOperatingActivities', 'EmployeeServiceShareBasedCompensationTaxBenefitFromExerciseOfStockOptions', 'ExcessTaxBenefitFromShareBasedCompensation'], unit: 'USD' },
    { key: 'discontinuedOperationsCFO', label: 'Efectivo neto de operaciones discontinuadas', tags: ['CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations', 'NetCashProvidedByUsedInDiscontinuedOperations'], unit: 'USD' },
    { key: 'otherOperatingActivities', label: 'Otras actividades operativas', tags: ['OtherOperatingActivitiesCashFlowStatement', 'AdjustmentsNoncashItemsToReconcileNetIncomeLossToCashProvidedByUsedInOperatingActivitiesOther', 'OtherNoncashIncomeExpense', 'OtherNoncashItems'], unit: 'USD' },
    { key: 'changeAccountsReceivable', label: 'Cambio en cuentas por cobrar', tags: ['IncreaseDecreaseInReceivables', 'IncreaseDecreaseInAccountsReceivable', 'IncreaseDecreaseInAccountsAndNotesReceivable', 'IncreaseDecreaseInCustomerAdvancesAndReceivables', 'IncreaseDecreaseInAccountsReceivableAndOtherOperatingAssets'], unit: 'USD', invertSign: true },
    { key: 'changeInventory', label: 'Cambio en inventarios', tags: ['IncreaseDecreaseInInventories', 'IncreaseDecreaseInInventory', 'IncreaseDecreaseInInventoryAndOtherOperatingAssets'], unit: 'USD', invertSign: true },
    { key: 'changeAccountsPayable', label: 'Cambio en cuentas por pagar', tags: ['IncreaseDecreaseInAccountsPayableTrade', 'IncreaseDecreaseInAccountsPayableAndAccruedLiabilities', 'IncreaseDecreaseInAccountsPayable', 'IncreaseDecreaseInAccruedLiabilities', 'IncreaseDecreaseInAccountsPayableAndOtherOperatingLiabilities'], unit: 'USD' },
    { key: 'changeOtherOperatingAssets', label: 'Variación en otros activos operativos netos', tags: ['IncreaseDecreaseInOtherOperatingCapitalNet', 'IncreaseDecreaseInOtherOperatingAssets', 'IncreaseDecreaseInOtherOperatingLiabilities', 'IncreaseDecreaseInOperatingAssetsAndLiabilities'], unit: 'USD', invertSign: true },
    { key: 'cfo', label: 'Efectivo de Operaciones', tags: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations', 'NetCashProvidedByUsedInOperatingActivitiesTotal', 'CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations'], unit: 'USD', emphasis: true },
    { key: 'workingCapitalChange', label: 'Nota: Cambio en el capital circulante', tags: ['IncreaseDecreaseInOperatingCapital', 'IncreaseDecreaseInOperatingAssetsAndLiabilities'], unit: 'USD', invertSign: true, italic: true, derived: true },
    { key: 'capex', label: 'Gastos de capital', tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements', 'PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets', 'PaymentsToAcquireOtherProductiveAssets', 'PaymentsToAcquireOilAndGasProperty', 'PaymentsToDevelopSoftware', 'PaymentsForSoftware', 'PaymentsToAcquirePropertyPlantAndEquipmentGross', 'CapitalExpendituresIncurredButNotYetPaid'], unit: 'USD', negative: true },
    { key: 'salePPE', label: 'Venta de inmovilizado material', tags: ['ProceedsFromSaleOfPropertyPlantAndEquipment', 'ProceedsFromSaleOfProductiveAssets', 'ProceedsFromSaleOfOtherPropertyPlantAndEquipment', 'ProceedsFromSaleOfPropertyPlantAndEquipmentAndIntangibleAssets', 'ProceedsFromSaleOfProductiveAssetsNet', 'ProceedsFromSaleOfOtherProductiveAssets'], unit: 'USD' },
    { key: 'acquisitions', label: 'Adquisiciones con efectivo', tags: ['PaymentsToAcquireBusinessesNetOfCashAcquired', 'PaymentsToAcquireBusinessesAndInterestInAffiliates', 'PaymentsToAcquireBusinesses', 'PaymentsToAcquireOtherInvestments', 'PaymentsToAcquireInterestInJointVenture', 'PaymentsToAcquireAffiliates'], unit: 'USD', negative: true },
    { key: 'divestitures', label: 'Desinversiones', tags: ['ProceedsFromDivestitureOfBusinessesNetOfCashDivested', 'ProceedsFromDivestitureOfBusinesses', 'ProceedsFromDivestitureOfBusinessesAndInterestsInAffiliates', 'ProceedsFromSaleOfBusinesses', 'ProceedsFromSaleOfBusinessesNetOfCashDivested', 'ProceedsFromDivestitures', 'ProceedsFromSaleOfOtherAssets'], unit: 'USD' },
    { key: 'securitiesInvesting', label: 'Inversión en valores negociables y de renta variable', tags: ['PaymentsToAcquireInvestments', 'PaymentsToAcquireAvailableForSaleSecurities', 'PaymentsToAcquireMarketableSecurities', 'PaymentsToAcquireAvailableForSaleSecuritiesDebt', 'PaymentsToAcquireOtherInvestments', 'PaymentsToAcquireShortTermInvestments', 'PaymentsToAcquireSecurities'], unit: 'USD', negative: true },
    { key: 'securitiesProceeds', label: 'Venta de valores negociables y de renta variable', tags: ['ProceedsFromSaleAndMaturityOfMarketableSecurities', 'ProceedsFromSaleOfAvailableForSaleSecurities', 'ProceedsFromSaleOfAvailableForSaleSecuritiesDebt', 'ProceedsFromSaleOfInvestments', 'ProceedsFromSaleOfTradingSecurities', 'ProceedsFromSaleOfSecurities', 'ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities', 'ProceedsFromSaleOfShortTermInvestments', 'ProceedsFromSaleAndMaturityOfOtherInvestments'], unit: 'USD' },
    { key: 'loansInvesting', label: 'Disminución (aumento) neta de préstamos originados / vendidos - Inversión', tags: ['PaymentsToAcquireLoansAndReceivables', 'ProceedsFromSaleOfLoansAndReceivables', 'PaymentsToOriginateLoansAndReceivables'], unit: 'USD' },
    { key: 'otherInvestingActivities', label: 'Otras actividades de inversión', invertTags: ['PaymentsForProceedsFromOtherInvestingActivities'], tags: ['OtherInvestingActivities', 'PaymentsForProceedsFromOtherInvestingActivities'], unit: 'USD' },
    { key: 'cfi', label: 'Efectivo de la inversión', tags: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'debtIssued', label: 'Deuda total emitida', tags: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromIssuanceOfDebt', 'ProceedsFromIssuanceOfShortTermDebt', 'ProceedsFromLinesOfCredit', 'ProceedsFromIssuanceOfSeniorLongTermDebt', 'ProceedsFromIssuanceOfUnsecuredDebt', 'ProceedsFromBorrowings', 'ProceedsFromDebtNetOfIssuanceCosts', 'ProceedsFromRepaymentsOfShortTermDebt'], unit: 'USD' },
    { key: 'debtPaid', label: 'Total de la deuda reembolsada', tags: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt', 'RepaymentsOfLongTermDebtAndCapitalLeaseObligations', 'RepaymentsOfDebtAndDebtIssuanceCosts', 'RepaymentsOfShortTermDebt', 'RepaymentsOfLinesOfCredit', 'RepaymentsOfSeniorLongTermDebt', 'PaymentsOfFinancingLeaseObligations', 'RepaymentsOfBorrowings', 'PaymentsOfDebtIssuanceCosts'], unit: 'USD', negative: true },
    { key: 'commonStockIssued', label: 'Emisión de acciones ordinarias', tags: ['ProceedsFromIssuanceOfCommonStock', 'ProceedsFromStockOptionsExercised', 'ProceedsFromIssuanceOfTreasuryStock', 'ProceedsFromIssuanceOfSharesUnderIncentiveAndShareBasedCompensationPlans', 'ProceedsFromIssuanceOfUnits', 'ProceedsFromSaleOfTreasuryStock', 'ProceedsFromStockPlans'], unit: 'USD' },
    { key: 'buybacks', label: 'Recompra de acciones comunes', tags: ['PaymentsForRepurchaseOfCommonStock', 'PaymentsForRepurchaseOfTreasuryStock', 'PaymentsForRepurchaseOfEquity', 'PaymentsForRepurchaseOfOtherEquity', 'PaymentsForRepurchaseOfCommonAndPreferredStock', 'PaymentsToAcquireTreasuryStock', 'RepurchaseOfCommonStock', 'SettlementOfCommonStockRepurchaseContracts', 'PaymentsForRepurchaseOfPrivateEquity'], unit: 'USD', negative: true },
    { key: 'buybackShares', label: 'Número de acciones recompradas', tags: ['StockRepurchasedDuringPeriodShares', 'StockRepurchasedAndRetiredDuringPeriodShares', 'TreasuryStockSharesAcquired', 'TreasuryStockSharesAcquiredAndRetired', 'RepurchaseOfCommonStockShares'], unit: 'shares', format: 'shares' },
    { key: 'dividendsCommon', label: 'Dividendos comunes pagados', tags: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfDividendsMinorityInterest', 'PaymentsOfOrdinaryDividends', 'PaymentsOfDividendsAndOtherDistributions'], unit: 'USD', negative: true },
    { key: 'dividendsPreferred', label: 'Dividendos de acciones comunes y preferentes pagados', tags: ['PaymentsOfDividendsPreferredStock', 'DividendsPreferredStockCash'], unit: 'USD', negative: true },
    { key: 'otherFinancingActivities', label: 'Otras Actividades de Financiamiento', tags: ['OtherFinancingActivities', 'ProceedsFromPaymentsForOtherFinancingActivities'], unit: 'USD' },
    { key: 'cff', label: 'Efectivo de Financiamiento', tags: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'], unit: 'USD', emphasis: true },
    { key: 'fx', label: 'Ajustes del tipo de cambio de divisas', tags: ['EffectOfExchangeRateOnCashAndCashEquivalents', 'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations'], unit: 'USD' },
    { key: 'netChangeInCash', label: 'Cambio neto en efectivo', tags: ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect', 'CashAndCashEquivalentsPeriodIncreaseDecrease'], unit: 'USD', emphasis: true },
    { key: 'freeCashFlow', label: 'Flujo de caja libre', unit: 'USD', derived: true },
    { key: 'cashBeginning', label: 'Efectivo y equivalentes de efectivo, comienzo del período', tags: ['CashAndCashEquivalentsAtBeginningOfPeriod', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffectBeginningBalance', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], unit: 'USD' },
    { key: 'cashEnding', label: 'Efectivo y equivalentes de efectivo, fin del período', tags: ['CashAndCashEquivalentsAtEndOfPeriod', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], unit: 'USD' },
    { key: 'interestPaid', label: 'Intereses en efectivo pagados', tags: ['InterestPaid', 'InterestPaidNet', 'InterestPaidCapitalized', 'InterestPaidNetOfCapitalizedInterest'], unit: 'USD' },
    { key: 'taxesPaid', label: 'Impuestos en efectivo pagados', tags: ['IncomeTaxesPaid', 'IncomeTaxesPaidNet', 'IncomeTaxesPaidRefunds', 'IncomeTaxesPaidNetOfRefunds'], unit: 'USD' },
    { key: 'cashFlowPerShare', label: 'Flujo de caja por acción', unit: 'USD/shares', format: 'perShare', derived: true },
  ],
};

export const CONCEPTS = Object.values(STATEMENTS).flat();
export const FLOW_KEYS = new Set([...STATEMENTS.income, ...STATEMENTS.cashflow].map((concept) => concept.key));
export const INSTANT_KEYS = new Set([
  ...STATEMENTS.balance.map((concept) => concept.key),
  'sharesOutstanding', 'weightedSharesBasic', 'weightedSharesDiluted',
]);
export const NON_ADDITIVE_KEYS = new Set([
  ...CONCEPTS.filter((concept) => concept.format && concept.format !== 'money').map((concept) => concept.key),
  'dividendPerShare', 'epsDiluted', 'epsBasic', 'weightedSharesBasic', 'weightedSharesDiluted', 'sharesOutstanding',
]);

export const CONCEPT_EXTENSION = {
  revenue: 'revenue|salesrevenue|revenues|operatingrevenue|grossrevenue',
  costOfRevenue: 'costofgoods|costofrevenue|costofsales|costofproduct',
  grossProfit: 'grossprofit|grossmargin',
  operatingIncome: 'operatingincomeloss|operatingincome|operatingprofit',
  operatingExpenses: 'operatingexpenses|operatingcostsandexpenses',
  netIncome: 'netincomeloss|netincome|profitloss',
  cash: 'cashandcashequivalents|cashcashequivalents',
  shortTermInvestments: 'shortterminvestments|marketablesecurities',
  receivables: 'accountsreceivablenet|accountsreceivable',
  inventory: 'inventorynet|inventories',
  payables: 'accountspayabletrade|accountspayable',
  currentAssets: 'assetscurrent',
  currentLiabilities: 'liabilitiescurrent',
  totalDebt: 'longtermdebt|debtandcapitalleaseobligations|totaldebt',
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

export const EXTENSION_EXCLUDED = /(disposalgroup|relatedcost|stepacquisition|remeasurement|recognized|purchaseaccounting|contingent|earnout|stockissued|valueacquisition|percentage|maturity|textblock|policy|tabletextblock|member|servings|beverage|countries|weightedaverage|fairvalue|carryingvalue|periodof|maximum|minimum|aggregate|portionof|solvency|captive|selfinsurance|reserve|unrealized|comprehensive|arisingduring|propertyplantandequipment|afteraccumulated|accumulateddepreciation|accumulatedamortization)/i;

/**
 * Normaliza el valor de un concepto según su signo esperado o tags de inversión.
 * @param {object} concept - Definición del concepto.
 * @param {number|string} value - Valor numérico crudo.
 * @param {string|null} [tag=null] - Tag XBRL reportado.
 * @returns {number|null} Valor numérico normalizado.
 */
export function normalizeConceptValue(concept, value, tag = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (concept.negative) return -Math.abs(number);
  if (concept.invertSign || (tag && concept.invertTags?.includes(tag))) return -number;
  return number;
}

/**
 * Clasifica el frame temporal de la SEC (ej. CY2024, CY2024Q3, CY2024Q3I).
 * @param {string} frame - Frame de la SEC.
 * @returns {{series: string, key: string, sortKey: number, isInstant: boolean}|null} Clasificación.
 */
export function classifyFrame(frame) {
  const annual = String(frame ?? '').match(/^CY(\d{4})$/);
  if (annual) return { series: 'annual', key: annual[1], sortKey: Number(annual[1]) * 10, isInstant: false };

  const quarterly = String(frame ?? '').match(/^CY(\d{4})Q([1-4])(I?)$/);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const quarter = Number(quarterly[2]);
    return { series: 'quarterly', key: `${year}-Q${quarter}`, sortKey: year * 10 + quarter, isInstant: quarterly[3] === 'I' };
  }
  return null;
}

