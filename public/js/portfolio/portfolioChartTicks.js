/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function monthShort(idx) {
    return (window.I18n && window.I18n.shortMonth && window.I18n.shortMonth(idx)) || SPANISH_MONTHS[idx] || '';
  }

  function formatTradingViewHoverDate(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    const year = parts[0];
    const mIdx = parseInt(parts[1], 10) - 1;
    const day = parts[2];
    const m = monthShort(mIdx) || parts[1];
    return `${day} ${m} ${year}`;
  }

  function fmtDateDisplay(isoDate) {
    if (!isoDate) return '—';
    return formatTradingViewHoverDate(isoDate);
  }

  function getTradingViewDateTicks(points, xFunc, pad, width) {
    if (!points || !points.length) return [];
    const n = points.length;
    if (n === 1) {
      return [{ index: 0, x: xFunc(0), label: formatTradingViewHoverDate(points[0].date), isMajor: true, date: points[0].date }];
    }

    const parsed = points.map((p, i) => {
      const [y, m, d] = String(p.date).split('-').map(Number);
      return { index: i, date: p.date, year: y, month: m - 1, day: d };
    });

    const first = parsed[0];
    const last = parsed[n - 1];
    const startDate = new Date(`${first.date}T00:00:00Z`);
    const endDate = new Date(`${last.date}T00:00:00Z`);
    const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));

    const ticks = [];
    const minSpacing = 58;

    if (totalDays > 1000) {
      // Multi-year (> 3 years): Major ticks on Years (e.g. 2021, 2022, 2023, 2024, 2025)
      const yearStep = totalDays > 3650 ? 3 : totalDays > 2000 ? 2 : 1;
      let lastRecordedYear = null;

      parsed.forEach((pt) => {
        if (lastRecordedYear === null || pt.year !== lastRecordedYear) {
          if (lastRecordedYear === null || (pt.year - lastRecordedYear) >= yearStep) {
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label: String(pt.year),
              isMajor: true,
              date: pt.date,
            });
            lastRecordedYear = pt.year;
          }
        }
      });

      if (ticks.length <= 3 && totalDays <= 2200) {
        parsed.forEach((pt) => {
          if (pt.month === 6 && pt.day <= 10) {
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label: `Jul '${String(pt.year).slice(2)}`,
              isMajor: false,
              date: pt.date,
            });
          }
        });
        ticks.sort((a, b) => a.index - b.index);
      }
    } else if (totalDays > 240) {
      // 8 months to 3 years: Month or bi-monthly ticks
      const monthStep = totalDays > 600 ? 3 : totalDays > 400 ? 2 : 1;
      let prevYear = null;
      let lastMonthDiff = -999;

      parsed.forEach((pt, i) => {
        const monthDiff = (pt.year - first.year) * 12 + pt.month;
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          if (monthDiff - lastMonthDiff >= monthStep || pt.month === 0) {
            const isYearStart = pt.month === 0 || (prevYear !== null && pt.year !== prevYear);
            const label = isYearStart ? String(pt.year) : monthShort(pt.month);
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label,
              isMajor: isYearStart,
              date: pt.date,
            });
            lastMonthDiff = monthDiff;
            prevYear = pt.year;
          }
        }
      });
    } else if (totalDays > 45) {
      // 1.5 to 8 months: 1st of month and 15th
      let addedMidForMonth = null;

      parsed.forEach((pt, i) => {
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          const isYearStart = pt.month === 0;
          const label = isYearStart ? String(pt.year) : monthShort(pt.month);
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label,
            isMajor: true,
            date: pt.date,
          });
        } else if (pt.day >= 15 && addedMidForMonth !== pt.month) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: totalDays > 120 ? '15' : `15 ${monthShort(pt.month)}`,
            isMajor: false,
            date: pt.date,
          });
          addedMidForMonth = pt.month;
        }
      });
    } else if (totalDays > 14) {
      // 2 weeks to 1.5 months: Weekly ticks
      let lastDay = -999;
      parsed.forEach((pt, i) => {
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: monthShort(pt.month),
            isMajor: true,
            date: pt.date,
          });
          lastDay = pt.day;
        } else if (Math.abs(pt.day - lastDay) >= 6) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: `${pt.day} ${monthShort(pt.month)}`,
            isMajor: false,
            date: pt.date,
          });
          lastDay = pt.day;
        }
      });
    } else {
      // Very short range (< 14 days): Every 2-3 trading days
      const step = n > 8 ? 2 : 1;
      parsed.forEach((pt, i) => {
        if (i % step === 0 || i === n - 1) {
          const isNewMonth = i === 0 || pt.month !== parsed[i - 1]?.month;
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: `${pt.day} ${monthShort(pt.month)}`,
            isMajor: isNewMonth,
            date: pt.date,
          });
        }
      });
    }

    if (ticks.length < 2) {
      const step = Math.max(1, Math.floor(n / 4));
      for (let i = 0; i < n; i += step) {
        const pt = parsed[i];
        ticks.push({
          index: pt.index,
          x: xFunc(pt.index),
          label: `${pt.day} ${monthShort(pt.month)}`,
          isMajor: i === 0,
          date: pt.date,
        });
      }
      if (ticks[ticks.length - 1].index !== n - 1) {
        const pt = parsed[n - 1];
        ticks.push({
          index: pt.index,
          x: xFunc(pt.index),
          label: `${pt.day} ${monthShort(pt.month)}`,
          isMajor: false,
          date: pt.date,
        });
      }
    }

    // Filter overlapping ticks
    const filtered = [];
    ticks.forEach((t) => {
      if (!filtered.length) {
        filtered.push(t);
        return;
      }
      const prev = filtered[filtered.length - 1];
      if (t.x - prev.x >= minSpacing) {
        filtered.push(t);
      } else if (t.isMajor && !prev.isMajor) {
        filtered[filtered.length - 1] = t;
      }
    });

    return filtered;
  }

  function computeSliceIndicesForRange(allPoints, rangeKey) {
    if (!allPoints || !allPoints.length) return { start: 0, end: 0 };
    const total = allPoints.length;
    if (rangeKey === 'all' || !RANGE_DAYS[rangeKey]) {
      return { start: 0, end: total - 1 };
    }
    const days = RANGE_DAYS[rangeKey];
    const lastDateStr = allPoints[total - 1].date;
    const lastDate = new Date(`${lastDateStr}T00:00:00Z`);
    const cutoff = new Date(lastDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let startIdx = allPoints.findIndex((pt) => pt.date >= cutoffStr);
    if (startIdx < 0) startIdx = 0;
    return { start: startIdx, end: total - 1 };
  }
window.formatTradingViewHoverDate = formatTradingViewHoverDate;
window.fmtDateDisplay = fmtDateDisplay;
window.getTradingViewDateTicks = getTradingViewDateTicks;
window.computeSliceIndicesForRange = computeSliceIndicesForRange;

})(window);
