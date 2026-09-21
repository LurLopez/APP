/**
 * @fileoverview Cálculo de la distribución de dividendos (extraído de portfolioDividendsData.js).
 */

(function (window) {


  function calcDistributionData(d, mode, period, metric, timelineYear) {
    const allHoldings = d.holdings || [];
    let periodKey = period;
    let periodTitle = '';
    let items = [];

    if (mode === 'month') {
      const months = d.ttmStackedMonths || [];
      let currentMonthData = null;
      if (period && period !== 'TTM' && period !== 'all') {
        currentMonthData = months.find((m) => m.key === period || m.label === period);
      }
      if (!currentMonthData && months.length > 0) {
        currentMonthData = months[months.length - 1];
      }

      if (currentMonthData) {
        periodKey = currentMonthData.key;
        periodTitle = currentMonthData.label;
        const monthItems = currentMonthData.items || [];
        const monthTotal = monthItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

        items = monthItems.map((it) => {
          const amt = Number(it.amount) || 0;
          const h = allHoldings.find((x) => x.ticker === it.ticker) || {};
          return {
            ticker: it.ticker,
            name: it.name || h.name || it.ticker,
            color: it.color || h.color || '#4e4ca0',
            value: amt,
            pct: monthTotal > 0 ? (amt / monthTotal) * 100 : 0,
          };
        }).filter((it) => it.value > 0);
      } else {
        periodTitle = 'Mes seleccionado';
        items = [];
      }
    } else {
      let selectedYear = null;
      if (period === 'TTM') {
        periodTitle = 'TTM';
        periodKey = 'TTM';
      } else if (period === 'all') {
        periodTitle = 'Histórico';
        periodKey = 'all';
      } else {
        selectedYear = Number(period) || timelineYear || 2026;
        periodTitle = String(selectedYear);
        periodKey = String(selectedYear);
      }

      items = allHoldings.map((h) => {
        let val = 0;
        if (period === 'TTM') {
          val = Number(h.ttm) || 0;
        } else if (period === 'all') {
          val = Number(h.sum) || Object.values(h.years || {}).reduce((a, b) => a + Number(b || 0), 0);
        } else if (selectedYear) {
          val = Number(h.years?.[selectedYear]) || 0;
        }
        return {
          ticker: h.ticker,
          name: h.name || h.ticker,
          color: h.color || '#4e4ca0',
          value: val,
          pct: 0,
        };
      }).filter((it) => it.value > 0);
    }

    const total = items.reduce((acc, it) => acc + it.value, 0);
    items.forEach((it) => {
      it.pct = total > 0 ? (it.value / total) * 100 : 0;
    });
    items.sort((a, b) => b.value - a.value);

    return {
      periodKey,
      periodTitle,
      items,
      total,
      isPct: metric === 'pct',
    };
  }

window.calcDistributionData = calcDistributionData;

})(window);
