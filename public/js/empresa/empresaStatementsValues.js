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
    const chartPoints = window.chartPoints;

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

  function derivedScreenerValue(item, row, rowIndex, rows, compData) {
    if (!item || !row) return null;

    if (item.key === 'evToEbitda') {
      const ebitda = row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null);
      const ev = derivedScreenerValue({ key: 'enterpriseValue' }, row, rowIndex, rows, compData);
      return ev !== null && ev > 0 && ebitda !== null && ebitda > 0 ? ev / ebitda : null;
    }
    if (item.key === 'peRatio') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const eps = Number(row.values?.epsDilutedNormalized ?? row.values?.epsDiluted);
      return price !== null && price > 0 && Number.isFinite(eps) && eps > 0 ? price / eps : null;
    }
    if (item.key === 'netDebtToEbitda') {
      const ebitda = row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null);
      const netDebt = row.values?.netDebt !== undefined ? row.values.netDebt : (Number.isFinite(Number(row.values?.totalDebt)) ? Number(row.values.totalDebt) - (Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash) || 0) : null);
      return netDebt !== null && ebitda !== null && ebitda > 0 ? netDebt / ebitda : null;
    }
    if (item.key === 'dividendYield') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const dps = Number(row.values?.dividendPerShare);
      return price !== null && price > 0 && Number.isFinite(dps) && dps > 0 ? (dps / price) * 100 : null;
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
      const fcfps = Number(row.values?.cashFlowPerShare);
      if (price !== null && price > 0 && Number.isFinite(fcfps) && fcfps > 0) {
        return price / fcfps;
      }
      const mcap = getRowMarketCap(row, rowIndex, rows, compData);
      const fcf = Number(row.values?.freeCashFlow);
      return mcap !== null && mcap > 0 && Number.isFinite(fcf) && fcf > 0 ? mcap / fcf : null;
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
