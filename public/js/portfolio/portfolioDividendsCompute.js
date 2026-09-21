/**
 * @fileoverview Cálculo de datos de dividendos de cartera (extraído de portfolioDividendsData.js).
 */

(function (window) {
    const DEFAULT_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48', '#4f46e5', '#16a34a', '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#6366f1', '#64748b'];

  function getColors() {
    return window.PortfolioDonuts?.COLORS || DEFAULT_COLORS;
  }

  function computeClientDividendData(pfData) {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    const yearColors = ['#3b82f6', '#bf3865', '#83277d', '#4f1c80', '#6866c2'];
    const positions = (pfData?.positions || []).filter((p) => (Number(p.shares) > 0 || Number(p.dividendsTotal) > 0));

    if (!positions.length) return BENCHMARK_DIVIDEND_DATA;

    const colors = getColors();
    const holdings = positions.map((pos, idx) => {
      const color = colors[idx % colors.length];
      const ticker = pos.ticker;
      const name = pos.companyName || ticker;
      const ttm = Number(pos.projectedAnnualDividends) || Number(pos.dividendsTotal) || 0;
      const sum = (Number(pos.dividendsTotal) || 0) + (ttm * 1.5);

      const yearMap = {};
      for (const yr of [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]) {
        if (yr === currentYear) {
          yearMap[yr] = ttm;
        } else if (yr > currentYear) {
          yearMap[yr] = ttm * 1.05;
        } else {
          const discount = Math.pow(0.92, currentYear - yr);
          yearMap[yr] = ttm > 0 ? ttm * discount : 0;
        }
      }

      return {
        ticker,
        name,
        color,
        ttm,
        pct: 0,
        sum: sum > 0 ? sum : Object.values(yearMap).reduce((a, b) => a + b, 0),
        logoBg: color,
        logoText: (ticker || '?').slice(0, 4),
        years: yearMap,
      };
    });

    const totalTtm = holdings.reduce((sum, h) => sum + h.ttm, 0);
    holdings.forEach((h) => {
      h.pct = totalTtm > 0 ? (h.ttm / totalTtm) * 100 : 0;
    });
    holdings.sort((a, b) => b.ttm - a.ttm);

    const monthlyCashFlow = {};
    const cashFlowYears = years.map((yr, idx) => {
      const isForecast = yr > currentYear;
      const yearColor = yearColors[idx] || '#4f1c80';
      const monthList = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      holdings.forEach((h) => {
        const yrVal = h.years[yr] || 0;
        if (yrVal > 0) {
          const quarterlyMonths = [2, 5, 8, 11];
          quarterlyMonths.forEach((m) => {
            monthList[m] += yrVal / 4;
          });
        }
      });

      const yrTotal = monthList.reduce((a, b) => a + b, 0);
      monthlyCashFlow[yr] = monthList;

      return {
        year: yr,
        total: yrTotal,
        color: yearColor,
        isForecast,
      };
    });

    const monthLabels = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const monthNamesLong = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nowMonth = new Date().getMonth();

    const ttmStackedMonths = [];
    const monthlySummaryCards = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(nowMonth - i);
      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const label = `${monthLabels[mIdx]} ${String(yr).slice(2)}`;
      const cardTitle = `${monthNamesLong[mIdx]} de ${yr}`;

      const items = [];
      const payments = [];

      holdings.forEach((h, hIdx) => {
        const mVal = (monthlyCashFlow[yr] || monthlyCashFlow[currentYear] || [])[mIdx] || 0;
        const hPortion = h.pct > 0 ? mVal * (h.pct / 100) : 0;
        if (hPortion > 0) {
          items.push({
            ticker: h.ticker,
            name: h.name,
            color: h.color,
            amount: hPortion,
          });
          const pos = positions.find((p) => p.ticker === h.ticker);
          const shares = Number(pos?.shares) || 100;
          const perShare = hPortion / shares;
          payments.push({
            day: String((hIdx * 4 + 1) % 28 + 1).padStart(2, '0'),
            ticker: h.ticker,
            name: h.name,
            logoBg: h.color,
            logoText: (h.ticker || '?').slice(0, 4),
            amount: hPortion,
            shares: shares,
            perShare: perShare > 0 ? perShare : 0.25,
          });
        }
      });

      const monthSum = items.reduce((s, it) => s + it.amount, 0);
      ttmStackedMonths.push({
        key: `${yr}-${String(mIdx + 1).padStart(2, '0')}`,
        label,
        total: monthSum,
        displayTotal: Math.round(monthSum),
        items,
      });

      if (payments.length > 0) {
        monthlySummaryCards.push({
          title: cardTitle,
          paymentCount: payments.length,
          totalAmount: monthSum,
          payments,
        });
      }
    }

    const averageMonthly = ttmStackedMonths.length > 0
      ? ttmStackedMonths.reduce((sum, m) => sum + m.total, 0) / ttmStackedMonths.length
      : 0;

    const paymentCount = monthlySummaryCards.reduce((sum, c) => sum + c.paymentCount, 0);
    const payDatesCount = Math.max(1, Math.round(paymentCount * 0.85));

    return {
      summary: {
        totalValue: Number(pfData?.summary?.totalValue) || 0,
        totalReturnPct: Number(pfData?.summary?.totalReturnPct) || 0,
        dividendYield: Number(pfData?.summary?.dividendYield) || 0,
        projectedAnnualDividends: totalTtm,
        ttmTotal: totalTtm,
        paymentCount,
        payDatesCount,
      },
      cashFlowYears,
      monthlyCashFlow,
      holdings,
      ttmStackedMonths,
      averageMonthly,
      monthlySummaryCards,
    };
  }

  function getDividendData(pfData) {
    if (pfData?.dividends && (pfData.dividends.holdings?.length > 0 || (pfData.positions && pfData.positions.length > 0))) {
      return pfData.dividends;
    }
    if (pfData?.positions && pfData.positions.length > 0) {
      return computeClientDividendData(pfData);
    }
    return BENCHMARK_DIVIDEND_DATA;
  }

  function calcNiceYAxis(maxValue, steps = 4) {
    const rawMax = Math.max(10, Number(maxValue) || 0);
    const rawStep = rawMax / steps;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    let niceStep;
    if (normalized <= 1) niceStep = 1 * magnitude;
    else if (normalized <= 2) niceStep = 2 * magnitude;
    else if (normalized <= 2.5) niceStep = 2.5 * magnitude;
    else if (normalized <= 5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const max = niceStep * steps;
    const ticks = [];
    for (let i = 0; i <= steps; i++) {
      ticks.push(i * niceStep);
    }
    return { max, step: niceStep, ticks };
  }

window.getColors = getColors;
window.computeClientDividendData = computeClientDividendData;
window.getDividendData = getDividendData;
window.calcNiceYAxis = calcNiceYAxis;
window.DEFAULT_COLORS = DEFAULT_COLORS;

})(window);
