/**
 * @fileoverview Datos base del benchmark de dividendos (resumen, flujos y medias)
 */

(function (window) {

window.BENCHMARK_DIVIDEND_DATA_PARTS = {
  summary: {
      totalValue: 256193.13,
      totalReturnPct: 118.97,
      dividendYield: 2.28,
      projectedAnnualDividends: 5837.32,
      ttmTotal: 5750.97,
      paymentCount: 54,
      payDatesCount: 46,
    },
  cashFlowYears: [
      { year: 2023, total: 5292.09, color: '#3b82f6' },
      { year: 2024, total: 5571.75, color: '#bf3865' },
      { year: 2025, total: 5645.86, color: '#83277d' },
      { year: 2026, total: 5810.19, color: '#4f1c80' },
      { year: 2027, total: 5956.30, color: '#6866c2', isForecast: true },
    ],
  monthlyCashFlow: {
      2023: [45.2, 225.4, 385.6, 172.1, 1420.5, 410.2, 405.8, 375.4, 395.2, 310.5, 275.4, 470.8],
      2024: [95.4, 252.1, 410.8, 550.2, 1150.3, 445.8, 390.2, 320.1, 430.5, 280.2, 278.9, 567.8],
      2025: [102.5, 270.4, 390.2, 260.4, 1480.2, 380.5, 475.2, 333.0, 420.0, 385.6, 289.5, 594.3],
      2026: [100.8, 259.4, 344.4, 343.0, 1550.3, 441.2, 690.5, 345.0, 440.0, 210.0, 285.0, 520.0],
      2027: [115.0, 285.0, 430.0, 220.0, 1680.0, 460.0, 450.0, 390.0, 460.0, 310.0, 290.0, 560.0],
    },
  averageMonthly: 479.25,
};

})(window);
