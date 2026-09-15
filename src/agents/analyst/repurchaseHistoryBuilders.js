/**
 * @fileoverview Módulo extraído de historyBuilders.js.
 */

import { formatFiscalEndLabel, parseLooseAmount } from './financialParsers.js';

const sharesFormatter = new Intl.NumberFormat('en-US');

export function formatRepurchaseShares(shares) {
  if (!Number.isFinite(Number(shares)) || Number(shares) <= 0) return '—';
  const inShares = Number(shares) >= 1e6 ? Number(shares) : Number(shares) * 1e6;
  return sharesFormatter.format(Math.round(inShares));
}

export function repurchaseAveragePrice(amount, shares) {
  const cost = Number(amount);
  const titles = Number(shares);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(titles) || titles <= 0) return null;
  const exactTitles = titles >= 1e6 ? titles : titles * 1e6;
  return (cost * 1e6) / exactTitles;
}

export function buildRepurchaseSecTable(repurchaseHistory, remainingAuthorization) {
  const entries = [...(Array.isArray(repurchaseHistory) ? repurchaseHistory : [])]
    .filter((point) => Number.isFinite(Number(point?.year)) && Number.isFinite(Number(point?.amount)) && Number(point.amount) > 0)
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 5);
  if (!entries.length) return null;
  const headers = ['', ...entries.map((point) => formatFiscalEndLabel(point.end) ?? String(point.year))];
  const hasShares = entries.some((point) => Number.isFinite(Number(point?.shares)) && Number(point?.shares) > 0);
  const rows = [];
  if (hasShares) {
    rows.push(['Shares repurchased', ...entries.map((point) => formatRepurchaseShares(point.shares))]);
  }
  rows.push(['Aggregate cost (in millions)', ...entries.map((point) => `$${String(point.amount).replace('.', ',')}`)]);
  if (hasShares) {
    rows.push([
      'Average price paid (in $)',
      ...entries.map((point) => {
        const price = repurchaseAveragePrice(point?.amount, point?.shares);
        return price != null ? `$${price.toFixed(1).replace('.', ',')}` : '—';
      }),
    ]);
  }
  const table = {
    title: 'Share Repurchase Program (Form 10-K)',
    summary: 'Tabla oficial de recompras anuales del Form 10-K',
    headers,
    rows,
  };
  const remaining = Number(remainingAuthorization);
  if (Number.isFinite(remaining) && remaining > 0) {
    table.rows.push([
      'Remaining authorization (in millions)',
      `$${String(remaining).replace('.', ',')}`,
      ...entries.slice(1).map(() => '—'),
    ]);
  }
  return table;
}

export function enrichRepurchaseSnippet(snippet, repurchaseHistory, remainingAuthorization) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  const rowName = (row) => String(Array.isArray(row) ? row[0] : (row?.metric ?? row?.name) ?? '');
  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  const rows = snippet.rows.map((row) => (Array.isArray(row) ? [...row] : [row?.metric ?? row?.name, row?.value]));
  const width = Math.max(headers.length || 0, rows[0]?.length || 0);
  const yearByColumn = headers.map((header) => {
    const match = String(header ?? '').match(/(20\d\d)/);
    return match ? match[1] : null;
  });

  const hasRemainingRow = rows.some((row) => /remaining authorization|autorizaci[oó]n remanente|remanente de autorizaci/i.test(String(row[0])));
  const remainingValue = Number(remainingAuthorization);
  if (!hasRemainingRow && Number.isFinite(remainingValue) && remainingValue > 0) {
    let latestColumn = 1;
    let bestYear = -Infinity;
    yearByColumn.forEach((year, index) => {
      if (!year) return;
      const value = Number(year);
      if (value > bestYear) {
        bestYear = value;
        latestColumn = index;
      }
    });
    const remainingRow = new Array(width).fill('—');
    remainingRow[0] = 'Remaining authorization (in millions)';
    remainingRow[latestColumn] = `$${String(remainingValue).replace('.', ',')}`;
    rows.push(remainingRow);
  }

  const sharesByYear = new Map(
    (Array.isArray(repurchaseHistory) ? repurchaseHistory : [])
      .filter((point) => Number.isFinite(Number(point?.shares)) && Number(point?.shares) > 0)
      .map((point) => [String(point.year), Number(point.shares)]),
  );
  if (!sharesByYear.size) return { ...snippet, rows };

  const hasSharesRow = rows.some((row) => /shares repurchased/i.test(rowName(row)));
  const hasCostRow = rows.some((row) => /aggregate cost/i.test(rowName(row)));
  const hasPriceRow = rows.some((row) => /average price/i.test(rowName(row)));

  if (!hasSharesRow && hasCostRow) {
    const costRow = rows.find((row) => /aggregate cost/i.test(String(row[0])));
    const sharesRow = ['Shares repurchased', ...costRow.slice(1).map((_, index) => {
      const year = yearByColumn[index + 1];
      const shares = year ? sharesByYear.get(year) : null;
      return Number.isFinite(shares) && shares > 0 ? formatRepurchaseShares(shares) : '—';
    })];
    rows.unshift(sharesRow);
  }

  if (!hasPriceRow) {
    const sharesRow = rows.find((row) => /shares repurchased/i.test(String(row[0])));
    const costRow = rows.find((row) => /aggregate cost/i.test(String(row[0])));
    if (sharesRow && costRow) {
      const priceRow = ['Average price paid (in $)', ...costRow.slice(1).map((costCell, index) => {
        const cost = parseLooseAmount(costCell);
        const sharesText = String(sharesRow[index + 1] ?? '');
        const shares = Number(sharesText.replace(/,/g, ''));
        const price = repurchaseAveragePrice(cost, shares);
        return price != null ? `$${price.toFixed(1).replace('.', ',')}` : '—';
      })];
      rows.push(priceRow);
    }
  }

  return { ...snippet, rows };
}

export function selectAnnualRows(annualSeries, { reportingPeriod, reportYear } = {}) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) {
    return { currentAnnualRow: null, previousAnnualRow: null };
  }
  const rowEndYear = (row) => {
    const match = String(row?.periodEnd ?? '').match(/^(20\d\d)/);
    return match ? Number(match[1]) : null;
  };
  const reportEndYear = /^\d{4}/.test(String(reportingPeriod ?? ''))
    ? Number(String(reportingPeriod).slice(0, 4))
    : null;
  const currentAnnualRow = (reportEndYear != null
    ? annualSeries.find((row) => rowEndYear(row) === reportEndYear)
    : null)
    || annualSeries.find((row) => Number(row.period) === Number(reportYear))
    || annualSeries[0]
    || null;
  const currentEndYear = rowEndYear(currentAnnualRow) ?? Number(currentAnnualRow?.period);
  const previousAnnualRow = (Number.isFinite(currentEndYear)
    ? (annualSeries.find((row) => row !== currentAnnualRow && rowEndYear(row) === currentEndYear - 1)
      || annualSeries.find((row) => row !== currentAnnualRow && Number(row.period) === currentEndYear - 1)
      || annualSeries.find((row) => row !== currentAnnualRow && (rowEndYear(row) ?? Number(row.period)) < currentEndYear))
    : null)
    || null;
  return { currentAnnualRow, previousAnnualRow };
}

export function buildSharesHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const hasOutstanding = annualSeries.some((row) => Number(row?.values?.sharesOutstanding) > 0);
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const raw = hasOutstanding
        ? Number(row?.values?.sharesOutstanding)
        : Number(row?.values?.weightedSharesBasic ?? row?.values?.weightedSharesDiluted);
      if (!Number.isFinite(year) || !Number.isFinite(raw) || raw <= 0) return null;
      return { year, shares: Math.round((raw / 1e6) * 10) / 10 };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length >= 2 ? unique.slice(-5) : null;
}

export function buildRepurchaseHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const raw = Number(row?.values?.buybacks);
      if (!Number.isFinite(year) || !Number.isFinite(raw) || Math.abs(raw) <= 0) return null;
      return { year, end: row?.periodEnd ?? null, amount: Math.round((Math.abs(raw) / 1e6) * 10) / 10 };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length ? unique.slice(-5) : null;
}

export function buildRepurchaseSharesHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const raw = Number(row?.values?.buybackShares);
      if (!Number.isFinite(year) || !Number.isFinite(raw) || Math.abs(raw) <= 0) return null;
      return { year, end: row?.periodEnd ?? null, shares: Math.round(Math.abs(raw)) };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length ? unique.slice(-5) : null;
}

export function mergeRepurchaseShares(repurchaseHistory, sharesHistory) {
  if (!Array.isArray(repurchaseHistory) || !Array.isArray(sharesHistory)) return repurchaseHistory;
  const sharesByYear = new Map(sharesHistory.map((point) => [Number(point?.year), Number(point?.shares)]));
  repurchaseHistory.forEach((point) => {
    const shares = sharesByYear.get(Number(point?.year));
    if (Number.isFinite(shares) && shares > 0) point.shares = shares;
  });
  return repurchaseHistory;
}
