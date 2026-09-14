/**
 * @file portfolioDividendsData.js
 * @description Conjunto de datos y cálculos para dividendos de cartera (fallback benchmark, computación cliente y distribución).
 */

(function (window) {
  'use strict';

  const BENCHMARK_DIVIDEND_DATA = {
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
    holdings: [
      {
        ticker: 'ALV.DE',
        name: 'Allianz SE',
        color: '#4e4ca0',
        ttm: 940.50,
        pct: 16.35,
        sum: 6368.85,
        logoBg: '#003780',
        logoText: 'ALV',
        years: { 2027: 1028.50, 2026: 940.50, 2025: 847.00, 2024: 759.00, 2023: 627.00, 2022: 540.00, 2021: 422.40, 2020: 374.40, 2019: 297.00, 2018: 216.00, 2017: 159.60 },
      },
      {
        ticker: 'EXW1.DE',
        name: 'iShares STOXX Europe Select Dividend 30',
        color: '#3a79b8',
        ttm: 682.23,
        pct: 11.86,
        sum: 4120.40,
        logoBg: '#002b49',
        logoText: 'iSh',
        years: { 2027: 740.00, 2026: 682.23, 2025: 620.10, 2024: 580.40, 2023: 540.20, 2022: 490.00, 2021: 410.00, 2020: 380.00, 2019: 350.00, 2018: 327.47, 2017: 298.00 },
      },
      {
        ticker: 'SHEL',
        name: 'Shell PLC',
        color: '#389fa5',
        ttm: 494.56,
        pct: 8.60,
        sum: 3250.10,
        logoBg: '#dd1d21',
        logoText: 'SHEL',
        years: { 2027: 530.00, 2026: 494.56, 2025: 460.80, 2024: 430.20, 2023: 400.00, 2022: 370.00, 2021: 340.00, 2020: 310.00, 2019: 280.00, 2018: 254.54, 2017: 230.00 },
      },
      {
        ticker: 'O',
        name: 'Realty Income Corp',
        color: '#5cb88a',
        ttm: 485.95,
        pct: 8.45,
        sum: 2890.70,
        logoBg: '#b8232f',
        logoText: 'O',
        years: { 2027: 510.00, 2026: 485.95, 2025: 470.20, 2024: 450.10, 2023: 430.00, 2022: 410.00, 2021: 390.00, 2020: 370.00, 2019: 350.00, 2018: 334.45, 2017: 310.00 },
      },
      {
        ticker: 'GBDV',
        name: 'SPDR S&P Global Dividend Aristocrats',
        color: '#95cf7c',
        ttm: 411.19,
        pct: 7.15,
        sum: 2760.30,
        logoBg: '#0f4c81',
        logoText: 'SPDR',
        years: { 2027: 440.00, 2026: 411.19, 2025: 390.00, 2024: 370.00, 2023: 350.00, 2022: 330.00, 2021: 310.00, 2020: 290.00, 2019: 270.00, 2018: 249.11, 2017: 220.00 },
      },
      {
        ticker: 'T',
        name: 'AT&T Inc',
        color: '#bfe271',
        ttm: 407.88,
        pct: 7.10,
        sum: 4484.87,
        logoBg: '#009fdb',
        logoText: 'T',
        years: { 2027: 408.01, 2026: 407.88, 2025: 426.69, 2024: 440.33, 2023: 422.59, 2022: 444.56, 2021: 513.92, 2020: 439.92, 2019: 361.47, 2018: 254.36, 2017: 186.37 },
      },
      {
        ticker: 'KO',
        name: 'Coca-Cola Co',
        color: '#e8ef7b',
        ttm: 379.56,
        pct: 6.60,
        sum: 3120.45,
        logoBg: '#f40009',
        logoText: 'KO',
        years: { 2027: 410.00, 2026: 379.56, 2025: 360.20, 2024: 345.10, 2023: 330.00, 2022: 315.00, 2021: 298.00, 2020: 280.00, 2019: 260.00, 2018: 242.59, 2017: 220.00 },
      },
      {
        ticker: 'VHYL',
        name: 'Vanguard FTSE All-World High Div Yield',
        color: '#93c5fd',
        ttm: 373.23,
        pct: 6.49,
        sum: 2450.10,
        logoBg: '#96151d',
        logoText: 'V',
        years: { 2027: 400.00, 2026: 373.23, 2025: 350.00, 2024: 330.00, 2023: 310.00, 2022: 290.00, 2021: 270.00, 2020: 250.00, 2019: 230.00, 2018: 216.87, 2017: 195.00 },
      },
      {
        ticker: 'UL',
        name: 'Unilever PLC',
        color: '#60a5fa',
        ttm: 364.04,
        pct: 6.33,
        sum: 2980.60,
        logoBg: '#1f36c7',
        logoText: 'UL',
        years: { 2027: 390.00, 2026: 364.04, 2025: 348.00, 2024: 330.00, 2023: 315.00, 2022: 300.00, 2021: 285.00, 2020: 270.00, 2019: 255.00, 2018: 241.56, 2017: 225.00 },
      },
      {
        ticker: 'JNJ',
        name: 'Johnson & Johnson',
        color: '#818cf8',
        ttm: 360.59,
        pct: 6.27,
        sum: 3420.80,
        logoBg: '#d51900',
        logoText: 'JNJ',
        years: { 2027: 385.00, 2026: 360.59, 2025: 345.00, 2024: 330.00, 2023: 315.00, 2022: 300.00, 2021: 285.00, 2020: 270.00, 2019: 255.00, 2018: 238.21, 2017: 215.00 },
      },
      {
        ticker: 'MSFT',
        name: 'Microsoft Corp',
        color: '#6366f1',
        ttm: 339.30,
        pct: 5.90,
        sum: 2650.40,
        logoBg: '#00a4ef',
        logoText: 'MSFT',
        years: { 2027: 365.00, 2026: 339.30, 2025: 310.00, 2024: 280.00, 2023: 250.00, 2022: 220.00, 2021: 195.00, 2020: 170.00, 2019: 145.00, 2018: 126.10, 2017: 105.00 },
      },
      {
        ticker: 'BAS.DE',
        name: 'Basf SE',
        color: '#cc3e49',
        ttm: 319.50,
        pct: 5.56,
        sum: 3581.80,
        logoBg: '#21517a',
        logoText: 'BAS',
        years: { 2027: 319.50, 2026: 319.50, 2025: 319.50, 2024: 482.80, 2023: 482.80, 2022: 411.40, 2021: 336.60, 2020: 287.10, 2019: 217.60, 2018: 164.30, 2017: 123.00 },
      },
      {
        ticker: 'AAPL',
        name: 'Apple Inc',
        color: '#9d2449',
        ttm: 190.92,
        pct: 3.32,
        sum: 1723.91,
        logoBg: '#000000',
        logoText: 'AAPL',
        years: { 2027: 202.58, 2026: 195.09, 2025: 195.54, 2024: 195.56, 2023: 185.76, 2022: 175.48, 2021: 142.98, 2020: 131.43, 2019: 112.72, 2018: 82.69, 2017: 56.58 },
      },
    ],
    ttmStackedMonths: [
      {
        key: 'ago-25',
        label: 'ago 25',
        total: 333.11,
        displayTotal: 333,
        items: [
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 142.41 },
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 102.68 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 47.53 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.49 },
        ],
      },
      {
        key: 'sep-25',
        label: 'sep 25',
        total: 420.61,
        displayTotal: 420,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 117.49 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#60a5fa', amount: 95.01 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#818cf8', amount: 88.80 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#6366f1', amount: 78.49 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.82 },
        ],
      },
      {
        key: 'oct-25',
        label: 'oct 25',
        total: 385.58,
        displayTotal: 386,
        items: [
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 176.09 },
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 92.10 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#93c5fd', amount: 76.90 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.49 },
        ],
      },
      {
        key: 'nov-25',
        label: 'nov 25',
        total: 287.89,
        displayTotal: 289,
        items: [
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 101.77 },
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 97.94 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 47.62 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.56 },
        ],
      },
      {
        key: 'dic-25',
        label: 'dic 25',
        total: 594.30,
        displayTotal: 594,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 118.47 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#60a5fa', amount: 95.49 },
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 91.98 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#818cf8', amount: 89.48 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#6366f1', amount: 86.05 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#93c5fd', amount: 72.71 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.12 },
        ],
      },
      {
        key: 'ene-26',
        label: 'ene 26',
        total: 100.82,
        displayTotal: 101,
        items: [
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 60.12 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.70 },
        ],
      },
      {
        key: 'feb-26',
        label: 'feb 26',
        total: 260.44,
        displayTotal: 259,
        items: [
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 101.90 },
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 72.08 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 46.66 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 39.80 },
        ],
      },
      {
        key: 'mar-26',
        label: 'mar 26',
        total: 344.66,
        displayTotal: 344,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 125.92 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#818cf8', amount: 89.87 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#6366f1', amount: 87.67 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 41.20 },
        ],
      },
      {
        key: 'abr-26',
        label: 'abr 26',
        total: 342.97,
        displayTotal: 343,
        items: [
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 96.92 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#60a5fa', amount: 86.78 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#93c5fd', amount: 69.57 },
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 49.59 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.11 },
        ],
      },
      {
        key: 'may-26',
        label: 'may 26',
        total: 1560.32,
        displayTotal: 1550,
        items: [
          { ticker: 'ALV.DE', name: 'Allianz SE', color: '#4e4ca0', amount: 940.50 },
          { ticker: 'BAS.DE', name: 'Basf SE', color: '#cc3e49', amount: 329.50 },
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 101.53 },
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 98.76 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 49.28 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.75 },
        ],
      },
      {
        key: 'jun-26',
        label: 'jun 26',
        total: 441.30,
        displayTotal: 441,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 132.67 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#818cf8', amount: 92.89 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#60a5fa', amount: 87.51 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#6366f1', amount: 87.38 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.85 },
        ],
      },
      {
        key: 'jul-26',
        label: 'jul 26',
        total: 690.37,
        displayTotal: 690,
        items: [
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 396.37 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#93c5fd', amount: 153.86 },
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 98.78 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 41.36 },
        ],
      },
    ],
    averageMonthly: 479.25,
    monthlySummaryCards: [
      {
        title: 'Julio de 2026',
        paymentCount: 4,
        totalAmount: 689.51,
        payments: [
          { day: '01', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 98.78, shares: 212, perShare: 0.47 },
          { day: '01', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 153.86, shares: 188, perShare: 0.81 },
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 396.37, shares: 535, perShare: 0.74 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 41.36, shares: 175, perShare: 0.24 },
        ],
      },
      {
        title: 'Junio de 2026',
        paymentCount: 5,
        totalAmount: 441.16,
        payments: [
          { day: '09', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 92.89, shares: 88, perShare: 1.06 },
          { day: '11', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 87.38, shares: 111, perShare: 0.79 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.85, shares: 175, perShare: 0.23 },
          { day: '26', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 87.51, shares: 187, perShare: 0.47 },
          { day: '29', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 132.67, shares: 388, perShare: 0.34 },
        ],
      },
      {
        title: 'Mayo de 2026',
        paymentCount: 6,
        totalAmount: 1550.31,
        payments: [
          { day: '01', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 101.53, shares: 369, perShare: 0.28 },
          { day: '06', ticker: 'BAS.DE', name: 'Basf SE', logoBg: '#21517a', logoText: 'BAS', amount: 329.50, shares: 140, perShare: 2.35 },
          { day: '12', ticker: 'ALV.DE', name: 'Allianz SE', logoBg: '#003780', logoText: 'ALV', amount: 940.50, shares: 55, perShare: 17.10 },
          { day: '15', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 49.28, shares: 219, perShare: 0.23 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.75, shares: 175, perShare: 0.23 },
          { day: '20', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 98.76, shares: 319, perShare: 0.31 },
        ],
      },
      {
        title: 'Abril de 2026',
        paymentCount: 5,
        totalAmount: 342.99,
        payments: [
          { day: '01', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 96.92, shares: 212, perShare: 0.46 },
          { day: '01', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 69.57, shares: 188, perShare: 0.37 },
          { day: '10', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 86.78, shares: 187, perShare: 0.46 },
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 49.59, shares: 535, perShare: 0.09 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.11, shares: 175, perShare: 0.23 },
        ],
      },
      {
        title: 'Marzo de 2026',
        paymentCount: 4,
        totalAmount: 344.38,
        payments: [
          { day: '10', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 89.87, shares: 88, perShare: 1.02 },
          { day: '12', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 87.67, shares: 111, perShare: 0.79 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 41.20, shares: 175, perShare: 0.24 },
          { day: '30', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 125.92, shares: 388, perShare: 0.32 },
        ],
      },
      {
        title: 'Febrero de 2026',
        paymentCount: 4,
        totalAmount: 259.40,
        payments: [
          { day: '02', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 100.90, shares: 369, perShare: 0.27 },
          { day: '12', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 46.66, shares: 219, perShare: 0.21 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 39.80, shares: 175, perShare: 0.23 },
          { day: '17', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 72.08, shares: 319, perShare: 0.23 },
        ],
      },
      {
        title: 'Enero de 2026',
        paymentCount: 2,
        totalAmount: 100.82,
        payments: [
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 60.12, shares: 535, perShare: 0.11 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.70, shares: 175, perShare: 0.23 },
        ],
      },
      {
        title: 'Diciembre de 2025',
        paymentCount: 7,
        totalAmount: 594.26,
        payments: [
          { day: '05', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 95.49, shares: 187, perShare: 0.51 },
          { day: '09', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 89.48, shares: 88, perShare: 1.02 },
          { day: '11', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 86.05, shares: 111, perShare: 0.78 },
          { day: '15', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 91.98, shares: 212, perShare: 0.43 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.12, shares: 175, perShare: 0.23 },
          { day: '18', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 118.47, shares: 388, perShare: 0.31 },
          { day: '31', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 72.71, shares: 188, perShare: 0.39 },
        ],
      },
      {
        title: 'Noviembre de 2025',
        paymentCount: 4,
        totalAmount: 289.48,
        payments: [
          { day: '03', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 101.35, shares: 369, perShare: 0.27 },
          { day: '13', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 47.62, shares: 219, perShare: 0.22 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.56, shares: 175, perShare: 0.23 },
          { day: '17', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 97.94, shares: 319, perShare: 0.31 },
        ],
      },
      {
        title: 'Octubre de 2025',
        paymentCount: 4,
        totalAmount: 385.63,
        payments: [
          { day: '01', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 92.10, shares: 212, perShare: 0.43 },
          { day: '01', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 76.90, shares: 188, perShare: 0.41 },
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 176.09, shares: 535, perShare: 0.33 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.49, shares: 175, perShare: 0.23 },
        ],
      },
      {
        title: 'Septiembre de 2025',
        paymentCount: 5,
        totalAmount: 420.00,
        payments: [
          { day: '09', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 88.80, shares: 88, perShare: 1.01 },
          { day: '11', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 78.49, shares: 111, perShare: 0.71 },
          { day: '12', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 95.01, shares: 187, perShare: 0.51 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.82, shares: 175, perShare: 0.23 },
          { day: '22', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 117.49, shares: 388, perShare: 0.30 },
        ],
      },
      {
        title: 'Agosto de 2025',
        paymentCount: 4,
        totalAmount: 333.04,
        payments: [
          { day: '01', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 102.68, shares: 369, perShare: 0.28 },
          { day: '14', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 47.53, shares: 219, perShare: 0.22 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.49, shares: 175, perShare: 0.23 },
          { day: '18', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 142.41, shares: 319, perShare: 0.45 },
        ],
      },
    ],
  };

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

  const PortfolioDividendsData = {
    BENCHMARK_DIVIDEND_DATA,
    computeClientDividendData,
    getDividendData,
    calcNiceYAxis,
    calcDistributionData
  };

  window.PortfolioDividendsData = PortfolioDividendsData;
})(window);
