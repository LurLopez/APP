/**
 * @fileoverview Módulo extraído de empresaValuationChart.js.
 */

(function (window) {

function renderAnnualNetDebtEbitdaChart() {
  const svg = document.querySelector('#val-chart');
  const wrap = document.querySelector('#val-chart-body');
  const message = document.querySelector('#val-chart-message');
  if (!svg || !wrap) return;

  const width = Math.max(320, wrap.clientWidth || 720);
  const height = 300;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const annualRows = [...(companyData?.annual ?? [])].reverse();
  const quarterly = companyData?.quarterly ?? [];
  let limit = annualRows.length;
  if (valChartRange === '1m' || valChartRange === '3m' || valChartRange === '6m' || valChartRange === '1y' || valChartRange === '3y') limit = 3;
  else if (valChartRange === '5y') limit = 5;
  else if (valChartRange === '10y') limit = 10;
  const rows = annualRows.slice(-limit);

  const items = [];
  rows.forEach((row) => {
    const year = row.period || (row.periodEnd ? String(row.periodEnd).slice(0, 4) : '');
    const netDebt = Number(row.values?.netDebt);
    const totalDebt = Number(row.values?.totalDebt);
    const cash = Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash);
    const calcNetDebt = Number.isFinite(netDebt) ? netDebt : (Number.isFinite(totalDebt) && Number.isFinite(cash) ? totalDebt - cash : null);

    // Sum the 4 fiscal quarters of the year if available for maximum accuracy and normalization
    const yrQuarters = quarterly.filter((q) => q.period && q.period.startsWith(year) && q.period.includes('-Q'));
    let ebitda = null;
    if (yrQuarters.length === 4) {
      ebitda = yrQuarters.reduce((s, q) => s + (Number(q.values?.ebitdaNormalized ?? q.values?.ebitda) || 0), 0);
    }
    if (!ebitda || ebitda <= 0) {
      ebitda = Number(row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number(row.values?.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0)));
    }

    if (!year || !Number.isFinite(ebitda) || ebitda <= 0 || calcNetDebt === null) return;
    const ratio = calcNetDebt / ebitda;
    if (Number.isFinite(ratio)) {
      items.push({
        year,
        periodEnd: row.periodEnd,
        netDebt: calcNetDebt,
        ebitda,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  });

  // TTM bar if latest reported quarter is newer than latest annual row
  const latestAnnualEnd = annualRows[annualRows.length - 1]?.periodEnd;
  const latestQuarterEnd = quarterly[0]?.periodEnd;
  if (latestQuarterEnd && (!latestAnnualEnd || latestQuarterEnd > latestAnnualEnd) && quarterly.length >= 4) {
    const q4 = quarterly.slice(0, 4);
    const sumNorm = q4.reduce((s, q) => s + (Number(q.values?.ebitdaNormalized ?? q.values?.ebitda) || 0), 0);
    const sumRaw = q4.reduce((s, q) => s + (Number(q.values?.ebitda) || 0), 0);
    const ebitdaTtm = sumNorm > 0 ? sumNorm : (sumRaw > 0 ? sumRaw : null);
    const latestQ = quarterly[0]?.values ?? {};
    const totalDebt = Number(latestQ.totalDebt);
    const cash = Number(latestQ.cashAndShortTermInvestments ?? latestQ.cash);
    const netDebtTtm = Number.isFinite(Number(latestQ.netDebt)) ? Number(latestQ.netDebt) : (Number.isFinite(totalDebt) && Number.isFinite(cash) ? totalDebt - cash : null);
    if (ebitdaTtm && ebitdaTtm > 0 && netDebtTtm !== null) {
      items.push({
        year: 'TTM',
        periodEnd: latestQuarterEnd,
        netDebt: netDebtTtm,
        ebitda: ebitdaTtm,
        ratio: Math.round((netDebtTtm / ebitdaTtm) * 100) / 100,
      });
    }
  }

  if (!items.length) {
    svg.innerHTML = '';
    if (message) {
      message.textContent = 'No hay datos anuales disponibles de Deuda Neta y EBITDA.';
      message.hidden = false;
    }
    valChartState = null;
    return;
  }
  if (message) message.hidden = true;

  const currentVal = items[items.length - 1]?.ratio;
  const minVal = Math.min(...items.map((it) => it.ratio));
  const maxVal = Math.max(...items.map((it) => it.ratio));
  const avgVal = items.reduce((sum, it) => sum + it.ratio, 0) / items.length;

  const currentEl = document.querySelector('#val-stat-current');
  const avgEl = document.querySelector('#val-stat-avg');
  const minEl = document.querySelector('#val-stat-min');
  const maxEl = document.querySelector('#val-stat-max');
  if (currentEl) currentEl.textContent = Number.isFinite(currentVal) ? `${currentVal.toFixed(2)}x` : '—';
  if (avgEl) avgEl.textContent = Number.isFinite(avgVal) ? `${avgVal.toFixed(2)}x` : '—';
  if (minEl) minEl.textContent = Number.isFinite(minVal) ? `${minVal.toFixed(2)}x` : '—';
  if (maxEl) maxEl.textContent = Number.isFinite(maxVal) ? `${maxVal.toFixed(2)}x` : '—';

  const margin = { top: 38, right: 28, bottom: 42, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  let min = Math.min(0, minVal);
  let max = Math.max(1, maxVal);
  const span = max - min;
  const scale = {
    min: min < 0 ? min * 1.25 : 0,
    max: max + Math.max(0.6, span * 0.22),
  };

  const y = (value) => margin.top + innerHeight - ((Number(value) - scale.min) / (scale.max - scale.min)) * innerHeight;
  const zeroY = y(0);

  const ticks = [scale.min, scale.min + (scale.max - scale.min) * 0.33, scale.min + (scale.max - scale.min) * 0.66, scale.max];
  const axis = ticks.map((val) => `
    <text x="${margin.left - 8}" y="${y(val) + 3}" class="chart-label" text-anchor="end">${val.toFixed(1)}x</text>
    <line x1="${margin.left}" y1="${y(val)}" x2="${width - margin.right}" y2="${y(val)}" class="chart-grid"/>
  `).join('');

  const avgY = y(avgVal);
  const avgLine = `
    <line x1="${margin.left}" y1="${avgY.toFixed(1)}" x2="${(width - margin.right).toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="#64748b" stroke-dasharray="4,4" stroke-width="1.2" opacity="0.7"/>
    <text x="${(width - margin.right).toFixed(1)}" y="${(avgY - 6).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="10.5" font-weight="600">Media: ${avgVal.toFixed(2)}x</text>
  `;

  const N = items.length;
  const step = innerWidth / Math.max(1, N);
  const barWidth = Math.min(54, Math.max(22, step * 0.60));

  let barsHtml = '';
  items.forEach((it, idx) => {
    const barX = margin.left + idx * step + (step - barWidth) / 2;
    const isNegative = it.ratio < 0;
    const barY = isNegative ? zeroY : y(it.ratio);
    const barH = Math.max(3, Math.abs(y(it.ratio) - zeroY));
    const isTtm = it.year === 'TTM';
    const color = isNegative ? '#16a34a' : (isTtm ? '#4338ca' : 'var(--accent)');
    const labelY = isNegative ? (barY + barH + 14) : (barY - 8);

    barsHtml += `
      <g class="val-bar-group" onmousemove="window.showValBarTooltip(event, ${idx})" onmouseleave="window.hideChartTooltip()">
        <rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" rx="3" class="val-bar-rect"/>
        <text x="${(barX + barWidth / 2).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1e293b">${it.ratio.toFixed(2)}x</text>
        <text x="${(barX + barWidth / 2).toFixed(1)}" y="${height - 12}" class="chart-label chart-label-x" text-anchor="middle">${escapeHtml(it.year)}</text>
      </g>
    `;
  });

  svg.innerHTML = `
    ${axis}
    ${avgLine}
    ${barsHtml}
  `;

  valChartState = { isBarChart: true, items };
}

function showValBarTooltip(event, idx) {
  if (!valChartState?.isBarChart) return;
  const item = valChartState.items?.[idx];
  if (!item) return;
  const tooltip = ensureChartTooltip();
  const isNetCash = item.netDebt < 0;
  const isTtm = item.year === 'TTM';
  tooltip.innerHTML = `<strong>${isTtm ? 'Últimos 12 Meses (TTM)' : `Año ${escapeHtml(item.year)}`} ${item.periodEnd ? `(${escapeHtml(item.periodEnd)})` : ''}</strong>
    <span style="color:#94a3b8;font-size:11px;">Deuda Neta / EBITDA</span>
    <b style="font-size:16px;color:#fff;margin:2px 0;">${item.ratio.toFixed(2)}x ${isNetCash ? '<span style="color:#4ade80;font-size:11px;">(Caja Neta)</span>' : ''}</b>
    <span style="color:#cbd5e1;font-size:11px;">Deuda Neta: ${formatProfileCompactUsd(item.netDebt)}</span>
    <span style="color:#cbd5e1;font-size:11px;">EBITDA${isTtm ? ' (TTM)' : ''}: ${formatProfileCompactUsd(item.ebitda)}</span>`;
  tooltip.hidden = false;
  positionChartTooltip(tooltip, event.clientX, event.clientY);
}
window.renderAnnualNetDebtEbitdaChart = renderAnnualNetDebtEbitdaChart;
window.showValBarTooltip = showValBarTooltip;

})(window);
