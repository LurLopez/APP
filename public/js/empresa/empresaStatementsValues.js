/**
 * @fileoverview Valores y celdas de los estados financieros (screener).
 */

(function (window) {
  const ES = window.EmpresaStatementsState;


  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function getRowPrice(row, rowIndex, rows, compData) {
    if (!row) return null;
    const baseData = compData || window.companyData;
    const isBase = !baseData || baseData.company?.ticker === window.companyTicker;
    // La tabla necesita cotizaciones más antiguas que las del gráfico (rango 5y por defecto):
    // se usa el histórico largo descargado aparte y, si aún no está, los puntos del gráfico.
    const longHistory = isBase ? window.statementsPricePoints : null;
    const chartPoints = Array.isArray(longHistory) && longHistory.length ? longHistory : window.chartPoints;

    if (isBase && chartPoints && chartPoints.length && row.periodEnd) {
      const targetMs = Date.parse(`${row.periodEnd}T23:59:59Z`);
      if (Number.isFinite(targetMs)) {
        let best = null;
        let minDiff = Infinity;
        for (const pt of chartPoints) {
          const ptMs = pt.t * 1000;
          const diff = Math.abs(ptMs - targetMs);
          if (diff < minDiff && diff <= 45 * 24 * 60 * 60 * 1000) {
            minDiff = diff;
            best = pt.v;
          }
        }
        if (best !== null && best > 0) return best;
      }
    }
    const prof = baseData?.profile ?? window.companyData?.profile;
    const isLatest = rowIndex === 0 || rowIndex === (rows ? rows.length - 1 : 0);
    if (isLatest && prof?.market?.price) {
      return Number(prof.market.price);
    }
    return null;
  }

  function getRowMarketCap(row, rowIndex, rows, compData) {
    const price = getRowPrice(row, rowIndex, rows, compData);
    const prof = compData?.profile ?? window.companyData?.profile;
    const shares = row?.values?.weightedSharesDiluted || row?.values?.sharesOutstanding || prof?.metrics?.shares;
    if (price && shares && shares > 0) {
      return price * shares;
    }
    const isLatest = rowIndex === 0 || rowIndex === (rows ? rows.length - 1 : 0);
    if (isLatest && prof?.metrics?.marketCap) {
      return Number(prof.metrics.marketCap);
    }
    return null;
  }

  /**
   * Valor acumulado de los últimos doce meses para partidas de flujo: suma los
   * cuatro últimos trimestres en la serie trimestral y usa el valor anual en la anual.
   * @param {Object} row - Fila del periodo.
   * @param {number} rowIndex - Índice de la fila (serie ordenada de más antigua a más reciente).
   * @param {Array<Object>} rows - Filas de la serie.
   * @param {string} key - Clave de la partida.
   * @returns {number|null} Valor TTM o null si no hay datos suficientes.
   */
  function ttmFlowValue(row, rowIndex, rows, key) {
    if (!row) return null;
    if ((window.screenerSeries || 'annual') !== 'quarterly') {
      const value = Number(row.values?.[key]);
      return Number.isFinite(value) ? value : null;
    }
    if (rowIndex < 3) return null;
    let total = 0;
    for (let index = rowIndex - 3; index <= rowIndex; index += 1) {
      const value = Number(rows?.[index]?.values?.[key]);
      if (!Number.isFinite(value)) return null;
      total += value;
    }
    return total;
  }

  /**
   * Valor medio de una partida de balance entre el periodo actual y el anterior.
   * @param {Object} row - Fila del periodo.
   * @param {number} rowIndex - Índice de la fila.
   * @param {Array<Object>} rows - Filas de la serie.
   * @param {string} key - Clave de la partida.
   * @returns {number|null} Media de ambos periodos (el actual si no hay anterior).
   */
  function averageBalanceValue(row, rowIndex, rows, key) {
    const current = Number(row?.values?.[key]);
    if (!Number.isFinite(current)) return null;
    const previous = Number(rows?.[rowIndex - 1]?.values?.[key]);
    return Number.isFinite(previous) ? (current + previous) / 2 : current;
  }

  /**
   * Beneficio neto atribuido a los accionistas comunes (con o sin partidas inusuales).
   * @param {Object} row - Fila del periodo.
   * @param {number} rowIndex - Índice de la fila.
   * @param {Array<Object>} rows - Filas de la serie.
   * @returns {number|null} Beneficio neto TTM.
   */
  function netIncomeToCommonValue(row, rowIndex, rows) {
    return ttmFlowValue(row, rowIndex, rows, 'netIncomeToCommonIncludingUnusual')
      ?? ttmFlowValue(row, rowIndex, rows, 'netIncome');
  }

  /**
   * EBITDA TTM del periodo (normalizado si existe, si no el reportado).
   * @param {Object} row - Fila del periodo.
   * @param {number} rowIndex - Índice de la fila.
   * @param {Array<Object>} rows - Filas de la serie.
   * @returns {number|null} EBITDA TTM.
   */
  function ebitdaValue(row, rowIndex, rows) {
    const normalized = ttmFlowValue(row, rowIndex, rows, 'ebitdaNormalized');
    if (normalized !== null) return normalized;
    const reported = ttmFlowValue(row, rowIndex, rows, 'ebitda');
    if (reported !== null) return reported;
    const operatingIncome = ttmFlowValue(row, rowIndex, rows, 'operatingIncome');
    if (operatingIncome === null) return null;
    const depreciation = ttmFlowValue(row, rowIndex, rows, 'depreciationAmortizationTotal')
      ?? ttmFlowValue(row, rowIndex, rows, 'depreciation');
    return operatingIncome + (depreciation ?? 0);
  }

  /**
   * Deuda neta del periodo (dato de balance, sin acumular).
   * @param {Object} row - Fila del periodo.
   * @returns {number|null} Deuda neta.
   */
  function netDebtValue(row) {
    if (row?.values?.netDebt !== undefined) return Number(row.values.netDebt);
    if (!Number.isFinite(Number(row?.values?.totalDebt))) return null;
    return Number(row.values.totalDebt) - (Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash) || 0);
  }

  /**
   * BPA diluido de los últimos doce meses (suma de los cuatro trimestres en la
   * serie trimestral, valor anual en la anual), con el ajustado como preferente.
   * @param {Object} row - Fila del periodo.
   * @param {number} rowIndex - Índice de la fila.
   * @param {Array<Object>} rows - Filas de la serie.
   * @returns {number|null} BPA TTM o null si no hay datos suficientes.
   */
  function ttmEpsValue(row, rowIndex, rows) {
    if ((window.screenerSeries || 'annual') !== 'quarterly') {
      const value = Number(row?.values?.epsDilutedNormalized ?? row?.values?.epsDiluted);
      return Number.isFinite(value) ? value : null;
    }
    if (rowIndex < 3) return null;
    let total = 0;
    for (let index = rowIndex - 3; index <= rowIndex; index += 1) {
      const quarter = rows?.[index]?.values;
      const value = Number(quarter?.epsDilutedNormalized ?? quarter?.epsDiluted);
      if (!Number.isFinite(value)) return null;
      total += value;
    }
    return total;
  }

  /**
   * Tasa efectiva de impuestos TTM (acotada entre el 0 % y el 60 %; 21 % por defecto).
   * @param {Object} row - Fila del periodo.
   * @param {number} rowIndex - Índice de la fila.
   * @param {Array<Object>} rows - Filas de la serie.
   * @returns {number} Tasa efectiva en tanto por uno.
   */
  function effectiveTaxRateValue(row, rowIndex, rows) {
    const tax = ttmFlowValue(row, rowIndex, rows, 'incomeTax');
    const pretax = ttmFlowValue(row, rowIndex, rows, 'ebtIncludingUnusual')
      ?? ttmFlowValue(row, rowIndex, rows, 'pretaxIncome');
    if (tax === null || pretax === null || pretax === 0) return 0.21;
    const rate = Math.abs(tax) / Math.abs(pretax);
    return Number.isFinite(rate) && rate >= 0 && rate <= 0.6 ? rate : 0.21;
  }

  function derivedScreenerValue(item, row, rowIndex, rows, compData) {
    if (!item || !row) return null;

    if (item.key === 'evToEbitda') {
      const ebitda = ebitdaValue(row, rowIndex, rows);
      const ev = derivedScreenerValue({ key: 'enterpriseValue' }, row, rowIndex, rows, compData);
      return ev !== null && ev > 0 && ebitda !== null && ebitda > 0 ? ev / ebitda : null;
    }
    if (item.key === 'peRatio') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const eps = ttmEpsValue(row, rowIndex, rows);
      return price !== null && price > 0 && eps !== null && eps > 0 ? price / eps : null;
    }
    if (item.key === 'netDebtToEbitda') {
      const ebitda = ebitdaValue(row, rowIndex, rows);
      const netDebt = netDebtValue(row);
      return netDebt !== null && ebitda !== null && ebitda > 0 ? netDebt / ebitda : null;
    }
    if (item.key === 'roa') {
      const netIncome = netIncomeToCommonValue(row, rowIndex, rows);
      const assets = averageBalanceValue(row, rowIndex, rows, 'assets');
      return netIncome !== null && assets ? (netIncome / assets) * 100 : null;
    }
    if (item.key === 'roe') {
      const netIncome = netIncomeToCommonValue(row, rowIndex, rows);
      const equity = averageBalanceValue(row, rowIndex, rows, 'commonEquity')
        ?? averageBalanceValue(row, rowIndex, rows, 'equity');
      return netIncome !== null && equity ? (netIncome / equity) * 100 : null;
    }
    if (item.key === 'roce') {
      const ebit = ttmFlowValue(row, rowIndex, rows, 'operatingIncome');
      const assets = averageBalanceValue(row, rowIndex, rows, 'assets');
      const currentLiabilities = averageBalanceValue(row, rowIndex, rows, 'currentLiabilities');
      let capitalEmployed = null;
      if (assets !== null && currentLiabilities !== null) {
        capitalEmployed = assets - currentLiabilities;
      } else {
        const equity = averageBalanceValue(row, rowIndex, rows, 'equity');
        const totalDebt = averageBalanceValue(row, rowIndex, rows, 'totalDebt');
        if (equity !== null && totalDebt !== null) capitalEmployed = equity + totalDebt;
      }
      return ebit !== null && capitalEmployed !== null && capitalEmployed > 0 ? (ebit / capitalEmployed) * 100 : null;
    }
    if (item.key === 'roic') {
      const ebit = ttmFlowValue(row, rowIndex, rows, 'operatingIncome');
      const equity = averageBalanceValue(row, rowIndex, rows, 'commonEquity')
        ?? averageBalanceValue(row, rowIndex, rows, 'equity');
      const totalDebt = averageBalanceValue(row, rowIndex, rows, 'totalDebt');
      const investedCapital = equity !== null ? equity + (totalDebt ?? 0) : null;
      const nopat = ebit !== null ? ebit * (1 - effectiveTaxRateValue(row, rowIndex, rows)) : null;
      return nopat !== null && investedCapital !== null && investedCapital > 0 ? (nopat / investedCapital) * 100 : null;
    }
    if (item.key === 'evToNetIncome') {
      const ev = derivedScreenerValue({ key: 'enterpriseValue' }, row, rowIndex, rows, compData);
      const netIncome = netIncomeToCommonValue(row, rowIndex, rows);
      return ev !== null && ev > 0 && netIncome !== null && netIncome > 0 ? ev / netIncome : null;
    }
    if (item.key === 'evToRevenue') {
      const ev = derivedScreenerValue({ key: 'enterpriseValue' }, row, rowIndex, rows, compData);
      const revenue = ttmFlowValue(row, rowIndex, rows, 'revenue');
      return ev !== null && ev > 0 && revenue !== null && revenue > 0 ? ev / revenue : null;
    }
    if (item.key === 'netDebtToFcf') {
      const netDebt = netDebtValue(row);
      const fcf = ttmFlowValue(row, rowIndex, rows, 'freeCashFlow');
      return netDebt !== null && fcf !== null && fcf > 0 ? netDebt / fcf : null;
    }
    if (item.key === 'interestExpenseToOperatingIncome') {
      const interest = ttmFlowValue(row, rowIndex, rows, 'interestExpense');
      const operatingIncome = ttmFlowValue(row, rowIndex, rows, 'operatingIncome');
      return interest !== null && operatingIncome !== null && operatingIncome > 0
        ? Math.abs(interest) / operatingIncome
        : null;
    }
    if (item.key === 'interestCoverage') {
      const interest = ttmFlowValue(row, rowIndex, rows, 'interestExpense');
      const operatingIncome = ttmFlowValue(row, rowIndex, rows, 'operatingIncome');
      return operatingIncome !== null && interest !== null && Math.abs(interest) > 0
        ? operatingIncome / Math.abs(interest)
        : null;
    }
    if (item.key === 'currentRatio' || item.key === 'quickRatio' || item.key === 'cashRatio') {
      const currentLiabilities = Number(row.values?.currentLiabilities);
      if (!Number.isFinite(currentLiabilities) || currentLiabilities <= 0) return null;
      if (item.key === 'cashRatio') {
        const cash = Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash);
        return Number.isFinite(cash) ? cash / currentLiabilities : null;
      }
      const currentAssets = Number(row.values?.currentAssets);
      if (!Number.isFinite(currentAssets)) return null;
      if (item.key === 'quickRatio') {
        const inventory = Number(row.values?.inventory);
        return (currentAssets - (Number.isFinite(inventory) ? inventory : 0)) / currentLiabilities;
      }
      return currentAssets / currentLiabilities;
    }
    if (item.key === 'debtToEquity') {
      const totalDebt = Number(row.values?.totalDebt);
      const equity = Number(row.values?.commonEquity ?? row.values?.equity);
      return Number.isFinite(totalDebt) && equity > 0 ? totalDebt / equity : null;
    }
    if (item.key === 'assetTurnover') {
      const revenue = ttmFlowValue(row, rowIndex, rows, 'revenue');
      const assets = Number(row.values?.assets);
      return revenue !== null && Number.isFinite(assets) && assets > 0 ? revenue / assets : null;
    }
    if (item.key === 'inventoryTurnover') {
      const cost = ttmFlowValue(row, rowIndex, rows, 'costOfRevenue');
      const inventory = Number(row.values?.inventory);
      return cost !== null && Number.isFinite(inventory) && inventory > 0 ? Math.abs(cost) / inventory : null;
    }
    if (item.key === 'dso' || item.key === 'dio' || item.key === 'dpo' || item.key === 'ccc') {
      const revenue = ttmFlowValue(row, rowIndex, rows, 'revenue');
      const cost = ttmFlowValue(row, rowIndex, rows, 'costOfRevenue');
      const receivables = Number(row.values?.totalReceivables ?? row.values?.receivables);
      const inventory = Number(row.values?.inventory);
      const payables = Number(row.values?.payables);
      if (item.key === 'dso') {
        return revenue !== null && revenue > 0 && Number.isFinite(receivables) ? (receivables / revenue) * 365 : null;
      }
      const costBase = cost !== null ? Math.abs(cost) : null;
      if (item.key === 'dio') {
        return costBase !== null && costBase > 0 && Number.isFinite(inventory) ? (inventory / costBase) * 365 : null;
      }
      if (item.key === 'dpo') {
        return costBase !== null && costBase > 0 && Number.isFinite(payables) ? (payables / costBase) * 365 : null;
      }
      if (revenue === null || revenue <= 0 || !Number.isFinite(receivables) || costBase === null || costBase <= 0 || !Number.isFinite(inventory) || !Number.isFinite(payables)) return null;
      return (((receivables / revenue) + (inventory / costBase) - (payables / costBase)) * 365);
    }
    if (item.key === 'dividendYield') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const dps = Number(row.values?.dividendPerShare);
      return price !== null && price > 0 && Number.isFinite(dps) && dps > 0 ? (dps / price) * 100 : null;
    }
    if (item.key === 'payoutRatio') {
      const dps = Number(row.values?.dividendPerShare);
      const eps = Number(row.values?.epsDilutedNormalized ?? row.values?.epsDiluted);
      return Number.isFinite(dps) && Number.isFinite(eps) && eps > 0 ? (dps / eps) * 100 : null;
    }
    if (item.key === 'marketCap') {
      return getRowMarketCap(row, rowIndex, rows, compData);
    }
    if (item.key === 'enterpriseValue') {
      const mcap = getRowMarketCap(row, rowIndex, rows, compData);
      const netDebt = row.values?.netDebt !== undefined ? row.values.netDebt : (Number.isFinite(Number(row.values?.totalDebt)) ? Number(row.values.totalDebt) - (Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash) || 0) : 0);
      return mcap !== null ? mcap + (netDebt || 0) : null;
    }
    if (item.key === 'priceToFcf' || item.key === 'pToFcf') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const fcfps = ttmFlowValue(row, rowIndex, rows, 'cashFlowPerShare');
      if (price !== null && price > 0 && fcfps !== null && fcfps > 0) {
        return price / fcfps;
      }
      const mcap = getRowMarketCap(row, rowIndex, rows, compData);
      const fcf = ttmFlowValue(row, rowIndex, rows, 'freeCashFlow');
      return mcap !== null && mcap > 0 && fcf !== null && fcf > 0 ? mcap / fcf : null;
    }
    if (item.key === 'priceToBook') {
      const mcap = getRowMarketCap(row, rowIndex, rows, compData);
      const equity = Number(row.values?.commonEquity ?? row.values?.equity);
      return mcap !== null && mcap > 0 && Number.isFinite(equity) && equity > 0 ? mcap / equity : null;
    }
    if (item.key === 'customValuation1' || item.key === 'customValuation2') {
      return null;
    }

    if (item.key === 'grossProfitMargin') {
      const rev = Number(row.values?.revenue);
      const gp = Number(row.values?.grossProfit);
      return rev && Number.isFinite(gp) ? (gp / rev) * 100 : null;
    }
    if (item.key === 'operatingIncomeMargin') {
      const rev = Number(row.values?.revenue);
      const op = Number(row.values?.operatingIncome);
      return rev && Number.isFinite(op) ? (op / rev) * 100 : null;
    }
    if (item.key === 'operatingIncomeAdjusted') {
      if (row.values?.operatingIncomeAdjusted !== undefined) return row.values.operatingIncomeAdjusted;
      const pretax = Number(row.values?.pretaxIncome);
      const ie = Math.abs(Number(row.values?.interestExpense) || 0);
      const ii = Math.abs(Number(row.values?.interestIncome) || 0);
      return Number.isFinite(pretax) ? pretax + (ie - ii) : row.values?.operatingIncome;
    }
    if (item.key === 'operatingIncomeAdjustedMargin') {
      const rev = Number(row.values?.revenue);
      if (!rev) return null;
      let adj = Number(row.values?.operatingIncomeAdjusted);
      if (!Number.isFinite(adj)) {
        const pretax = Number(row.values?.pretaxIncome);
        const ie = Math.abs(Number(row.values?.interestExpense) || 0);
        const ii = Math.abs(Number(row.values?.interestIncome) || 0);
        if (Number.isFinite(pretax)) {
          adj = pretax + (ie - ii);
        } else {
          const op = Number(row.values?.operatingIncome);
          adj = Number.isFinite(op) ? op : null;
        }
      }
      return Number.isFinite(adj) ? (adj / rev) * 100 : null;
    }
    if (item.key === 'netIncomeMargin') {
      const rev = Number(row.values?.revenue);
      const net = Number(row.values?.netIncomeToCommonIncludingUnusual ?? row.values?.netIncome);
      return rev && Number.isFinite(net) ? (net / rev) * 100 : null;
    }
    if (item.key === 'netIncomeAdjustedMargin') {
      const rev = Number(row.values?.revenue);
      const net = Number(row.values?.netIncomeToCommonExcludingUnusual ?? row.values?.netIncomeNormalized ?? row.values?.netIncome);
      return rev && Number.isFinite(net) ? (net / rev) * 100 : null;
    }
    if (item.key === 'ebitdaMargin') {
      const rev = Number(row.values?.revenue);
      const ebitda = Number(row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null));
      return rev && Number.isFinite(ebitda) ? (ebitda / rev) * 100 : null;
    }
    if (item.key === 'fcfMargin' || item.key === 'freeCashFlowMargin') {
      const rev = Number(row.values?.revenue);
      const fcf = Number(row.values?.freeCashFlow);
      return rev && Number.isFinite(fcf) ? (fcf / rev) * 100 : null;
    }

    if (item.kind !== 'change' && item.kind !== 'margin' && item.kind !== 'ratio') return row.values?.[item.key];
    if (item.kind === 'ratio') {
      const numerator = Number(row.values?.[item.numeratorKey]);
      const denominator = Number(row.values?.[item.denominatorKey]);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
      return ((item.absoluteNumerator ? Math.abs(numerator) : numerator) / denominator) * 100;
    }
    const value = item.baseKey === 'ebitda'
      ? (row.values?.ebitdaNormalized ?? row.values?.ebitda)
      : (row.values?.[item.baseKey] ?? (item.baseKey === 'netIncomeToCommonIncludingUnusual' ? row.values?.netIncome : undefined));
    if (item.kind === 'margin') {
      const revenue = row.values?.revenue;
      return revenue && Number.isFinite(Number(value)) ? (Number(value) / Number(revenue)) * 100 : null;
    }
    const screenerSeries = window.screenerSeries || 'annual';
    const previousIndex = screenerSeries === 'quarterly' ? rowIndex - 4 : rowIndex - 1;
    const previous = rows[previousIndex]?.values?.[item.baseKey];
    return previous ? ((Number(value) / Number(previous)) - 1) * 100 : null;
  }

  function formatScreenerValue(value, format, kind) {
    const precision = window.screenerPrecision ?? 2;
    if (kind === 'change' || kind === 'margin' || kind === 'ratio' || format === 'percent') {
      return window.formatPercentage ? window.formatPercentage(value, precision) : `${value} %`;
    }
    if (format === 'multiple') {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
      return window.formatMultiple ? window.formatMultiple(value, precision) : `${value}x`;
    }
    if (format === 'perShare') return window.formatEps ? window.formatEps(value, precision) : `${value} $`;
    if (format === 'shares') return window.formatShares ? window.formatShares(value, precision) : `${value}`;
    if (format === 'count') return window.formatCount ? window.formatCount(value, precision) : `${value}`;
    return window.formatMoneyUsd ? window.formatMoneyUsd(value, precision) : `${value}`;
  }

  function isLockedPeriod(rowIndex, rows) {
    if (window.companyAuthenticated) return false;
    return rowIndex < Math.max(0, rows.length - 4);
  }

  function renderProCell() {
    return '<button type="button" class="register-pill" title="Crea una cuenta gratis para ver todo el histórico" onclick="window.AuthModule && window.AuthModule.openModal && window.AuthModule.openModal(\'register\')">Regístrate</button>';
  }

  function shouldRenderScreenerValueRed(value, item) {
    if (value === null || value === undefined || value === '') return false;
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    if (number > 0) return false;
    return item.tone === 'negative' || number < 0;
  }

  function rowYear(row) {
    const match = String(row?.period ?? '').match(/^(\d{4})/);
    return match ? Number(match[1]) : null;
  }

  function screenerVisibleIndexes(rows) {
    const years = rows.map(rowYear).filter((year) => year !== null);
    if (!years.length) return rows.map((_, index) => index);
    const low = Math.min(...years);
    const high = Math.max(...years);
    const defaultMin = Math.max(low, high - 9);
    const min = window.screenerYearMin ?? defaultMin;
    const max = window.screenerYearMax ?? high;
    return rows
      .map((row, index) => {
        const year = rowYear(row);
        return year !== null && year >= min && year <= max ? index : null;
      })
      .filter((index) => index !== null);
  }

  function itemHasVisibleValues(item, rows, visibleIndexes) {
    return visibleIndexes.some((rowIndex) => {
      const row = rows[rowIndex];
      const value = derivedScreenerValue(item, row, rowIndex, rows);
      if (value === null || value === undefined || value === '') return false;
      const num = Number(value);
      return !Number.isNaN(num) && Number.isFinite(num);
    });
  }

window.escapeHtml = escapeHtml;
window.getRowPrice = getRowPrice;
window.getRowMarketCap = getRowMarketCap;
window.derivedScreenerValue = derivedScreenerValue;
window.formatScreenerValue = formatScreenerValue;
window.isLockedPeriod = isLockedPeriod;
window.renderProCell = renderProCell;
window.shouldRenderScreenerValueRed = shouldRenderScreenerValueRed;
window.rowYear = rowYear;
window.screenerVisibleIndexes = screenerVisibleIndexes;
window.itemHasVisibleValues = itemHasVisibleValues;

})(window);
