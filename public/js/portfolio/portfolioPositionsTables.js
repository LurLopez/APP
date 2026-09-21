/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function wrapPositionsTable(headers, rows, totalsRow, { toggles = true, wideOpt = false, tableClass = '', sortable = true } = {}) {
    const headerHtml = `<th scope="col" class="pf-expand-head" aria-label="Compras y ventas"></th>` + headers.map(([key, label, hint], index) => {
      const active = sortable && PS.sortKey === key;
      const mark = sortable ? (active ? (PS.sortDir === 'desc' ? '↓' : '↑') : '↕') : '';
      const toggle = toggles && TOGGLEABLE_SORT_KEYS.has(key) ? modeToggleHtml(key) : '';
      return `
        <th scope="col" ${sortable ? `data-sort-key="${key}"` : ''} class="${index === 0 ? 'pf-broker-first-head' : ''}${active ? ' pf-sort-active' : ''}" title="${escapeHtml(hint)}">
          ${escapeHtml(label)} ${toggle}<span class="pf-sort-mark">${mark}</span>
        </th>`;
    }).join('');
    const wideClass = wideOpt ? ' pf-table-wide' : '';
    const extraClass = tableClass ? ` ${tableClass}` : '';
    return `
      <div class="table-wrap pf-broker-table-wrap">
        <table class="pf-broker-table${wideClass}${extraClass}">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
      </div>`;
  }

  function currentPositionsTableHtml() {
    const sortGetters = {
      valor: (item) => String(item.companyName || item.ticker || '').toLowerCase(),
      acciones: (item) => Number(item.shares) || 0,
      coste: (item) => ((PS.displayMode.coste ?? 'medio') === 'total' ? Number(item.costBasis) : Number(item.avgCost)),
      ganancia: (item) => {
        const amount = item.unrealizedGross === null || item.unrealizedGross === undefined ? null : Number(item.unrealizedGross);
        if (amount === null || modeIsPct('ganancia')) {
          const cost = Number(item.costBasis);
          return amount === null || cost <= 0 ? null : amount / cost;
        }
        return amount;
      },
      gananciadiv: (item) => {
        const amount = item.unrealizedWithDividends === null || item.unrealizedWithDividends === undefined ? null : Number(item.unrealizedWithDividends);
        if (amount === null || modeIsPct('gananciadiv')) {
          const cost = Number(item.costBasis);
          return amount === null || cost <= 0 ? null : amount / cost;
        }
        return amount;
      },
      peso: (item) => (item.value === null || item.value === undefined ? null : Number(item.value)),
      divpct: (item) => {
        const annual = Number(item.projectedAnnualDividends) || 0;
        if (!modeIsPct('divpct')) return annual;
        const value = Number(item.value);
        return value > 0 ? annual / value : null;
      },
      divyoc: (item) => {
        const annual = Number(item.projectedAnnualDividends) || 0;
        if (!modeIsPct('divyoc')) return annual;
        const cost = Number(item.costBasis);
        return cost > 0 ? annual / cost : null;
      },
      divcobrados: (item) => {
        const total = Number(item.dividendsTotal) || 0;
        const shares = Number(item.shares) || 0;
        return (PS.displayMode.divcobrados ?? 'total') === 'total' ? total : (shares > 0 ? total / shares : 0);
      },
      grupos: (item) => (item.groups || []).map((g) => g.name).join(', ').toLowerCase(),
    };
    const positions = sortPositions(positionsForView('current'), sortGetters);
    const summary = PS.data?.summary ?? {};
    const totalValue = Number(summary.totalValue) || 0;
    const totalCost = Number(summary.totalCost) || 0;
    const annualDividends = Number(summary.projectedAnnualDividends) || 0;
    const totalShares = positions.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);

    const rows = positions.map((item) => {
      const value = Number(item.value);
      const costBasis = Number(item.costBasis);
      const annual = Number(item.projectedAnnualDividends) || 0;
      const marketPercent = totalValue > 0 && Number.isFinite(value) ? (value / totalValue) * 100 : null;
      const dividendYield = value > 0 ? (annual / value) * 100 : null;
      const dividendYoc = costBasis > 0 ? (annual / costBasis) * 100 : null;
      const gainPercent = costBasis > 0 && item.unrealizedGross !== null
        ? (Number(item.unrealizedGross) / costBasis) * 100
        : null;
      const gainWithDividends = Number(item.unrealizedWithDividends);
      const gainWithDividendsPct = costBasis > 0 && item.unrealizedWithDividends !== null
        ? (Number(item.unrealizedWithDividends) / costBasis) * 100
        : null;

      const lotRows = (item.lots ?? [])
        .filter((lot) => (lot.remaining ?? 0) > 0)
        .map((lot) => {
          const lotUnrealized = lot.heldUnrealized === null || lot.heldUnrealized === undefined ? null : Number(lot.heldUnrealized);
          const lotGainWithDividends = lotUnrealized === null ? null : lotUnrealized + (Number(lot.heldDividends) || 0);
          const lotGainPct = lot.heldCost > 0 && lotUnrealized !== null ? (lotUnrealized / lot.heldCost) * 100 : null;
          const lotGainWithDividendsPct = lot.heldCost > 0 && lotGainWithDividends !== null ? (lotGainWithDividends / lot.heldCost) * 100 : null;
          const lotWeight = totalValue > 0 && lot.heldValue !== null ? (Number(lot.heldValue) / totalValue) * 100 : null;
          const lotAnnual = (item.shares > 0 ? (Number(item.projectedAnnualDividends) || 0) / Number(item.shares) : 0) * (Number(lot.remaining) || 0);
          const lotYieldOnCost = lot.heldCost > 0 ? (lotAnnual / lot.heldCost) * 100 : null;
          return `
            <tr class="pf-lot-row" hidden data-buy-id="${escapeHtml(lot.id)}">
              <td class="pf-expand-cell"></td>
              ${lotDateCell(lot.date, null, `lot:${lot.id}:buy`)}
              <td>${fmtShares(lot.remaining)}</td>
              ${costeCellHtml(lot.heldCost, lot.price)}
              ${toggleCellHtml('ganancia', lotGainPct, lot.heldUnrealized, fmtSigned)}
              ${toggleCellHtml('gananciadiv', lotGainWithDividendsPct, lotGainWithDividends, fmtSigned)}
              <td>${fmtPct(lotWeight)}</td>
              <td></td>
              ${toggleCellHtml('divyoc', lotYieldOnCost, lotAnnual, fmtMoney)}
              ${costeCellHtml(lot.heldDividends, (Number(lot.remaining) || 0) > 0 ? Number(lot.heldDividends) / Number(lot.remaining) : null, 'divcobrados')}
              ${groupsCellHtml(lot.groups)}
            </tr>`;
        }).join('');

      return `
        <tr data-ticker="${escapeHtml(item.ticker)}" tabindex="0">
          ${positionExpandCell(item)}
          ${positionCompanyCell(item, 'current')}
          <td>${fmtShares(item.shares)}</td>
          ${costeCellHtml(item.costBasis, item.avgCost)}
          ${toggleCellHtml('ganancia', gainPercent, item.unrealizedGross, fmtSigned)}
          ${toggleCellHtml('gananciadiv', gainWithDividendsPct, item.unrealizedWithDividends, fmtSigned)}
          <td>${fmtPct(marketPercent)}</td>
          ${toggleCellHtml('divpct', dividendYield, annual, fmtMoney)}
          ${toggleCellHtml('divyoc', dividendYoc, annual, fmtMoney)}
          ${costeCellHtml(item.dividendsTotal, (Number(item.shares) || 0) > 0 ? Number(item.dividendsTotal) / Number(item.shares) : null, 'divcobrados')}
          ${groupsCellHtml(item.groups)}
        </tr>
        ${lotRows}`;
    }).join('');

    const totalGainPercent = totalCost > 0 ? (Number(summary.totalUnrealized) / totalCost) * 100 : null;
    const totalDividendYield = totalValue > 0 ? (annualDividends / totalValue) * 100 : null;
    const totalDividendYoc = totalCost > 0 ? (annualDividends / totalCost) * 100 : null;
    const totalDividendsHeld = positions.reduce((sum, item) => sum + (Number(item.dividendsHeld) || 0), 0);
    const totalGainWithDividends = Number(summary.totalUnrealized) + totalDividendsHeld;
    const totalGainWithDividendsPct = totalCost > 0 ? (totalGainWithDividends / totalCost) * 100 : null;
    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(totalShares)}</td>
        ${costeCellHtml(summary.totalCost, totalShares > 0 ? summary.totalCost / totalShares : null)}
        ${toggleCellHtml('ganancia', totalGainPercent, summary.totalUnrealized, fmtSigned)}
        ${toggleCellHtml('gananciadiv', totalGainWithDividendsPct, totalGainWithDividends, fmtSigned)}
        <td>100 %</td>
        ${toggleCellHtml('divpct', totalDividendYield, annualDividends, fmtMoney)}
        ${toggleCellHtml('divyoc', totalDividendYoc, annualDividends, fmtMoney)}
        ${costeCellHtml(summary.totalDividends, totalShares > 0 ? Number(summary.totalDividends) / totalShares : null, 'divcobrados')}
        <td></td>
      </tr>`;

    const headers = [
      ['valor', 'Valor', 'Empresa y posición'],
      ['acciones', 'Acciones', 'Número de acciones en cartera'],
      ['coste', 'Coste', 'Coste total y precio medio por acción'],
      ['ganancia', 'Ganancia', 'Ganancia o pérdida no realizada'],
      ['gananciadiv', 'Gan. + div.', 'No realizada + dividendos cobrados hasta hoy'],
      ['peso', 'Peso cartera', 'Peso de la posición sobre el valor total de la cartera'],
      ['divpct', 'Div. %', 'Rentabilidad por dividendo sobre el valor actual'],
      ['divyoc', 'Div. YoC', 'Rentabilidad por dividendo sobre el coste'],
      ['divcobrados', 'Div. cobrados', 'Dividendos cobrados desde la fecha de compra hasta hoy (total o por acción)'],
      ['grupos', 'Grupos', 'Grupos a los que pertenece esta posición'],
    ];
    return wrapPositionsTable(headers, rows, totalsRow, { wideOpt: true });
  }

  function soldPositionsTableHtml() {
    const soldCostOf = (item) => (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
    const soldAvgCostOf = (item) => {
      const cost = soldCostOf(item);
      const sold = Number(item.sharesSold) || 0;
      return sold > 0 ? cost / sold : null;
    };
    const sortGetters = {
      valor: (item) => String(item.companyName || item.ticker || '').toLowerCase(),
      vendidas: (item) => Number(item.sharesSold) || 0,
      coste: (item) => ((PS.displayMode.coste ?? 'medio') === 'total' ? soldCostOf(item) : soldAvgCostOf(item) ?? 0),
      ingresos: (item) => {
        const total = Number(item.soldProceeds) || 0;
        const sold = Number(item.sharesSold) || 0;
        return (PS.displayMode.ingresos ?? 'medio') === 'total' ? total : (sold > 0 ? total / sold : 0);
      },
      ganancia: (item) => Number(item.realizedGross) || 0,
      gananciadiv: (item) => Number(item.realizedGross) + (Number(item.dividendsTotal) || 0),
      divcobrados: (item) => {
        const total = Number(item.dividendsTotal) || 0;
        const sold = Number(item.sharesSold) || 0;
        return (PS.displayMode.divcobrados ?? 'total') === 'total' ? total : (sold > 0 ? total / sold : 0);
      },
      peso: (item) => (Number(item.soldProceeds) || 0),
      grupos: (item) => (item.groups || []).map((g) => g.name).join(', ').toLowerCase(),
    };
    const positions = sortPositions(positionsForView('sold'), sortGetters);
    const totals = positions.reduce((acc, item) => {
      acc.sold += Number(item.sharesSold) || 0;
      acc.proceeds += Number(item.soldProceeds) || 0;
      acc.realized += Number(item.realizedGross) || 0;
      acc.gainPlusDiv += Number(item.realizedGross) + (Number(item.dividendsTotal) || 0);
      acc.dividends += Number(item.dividendsTotal) || 0;
      acc.soldCost += soldCostOf(item);
      return acc;
    }, { sold: 0, proceeds: 0, realized: 0, gainPlusDiv: 0, dividends: 0, soldCost: 0 });

    const rows = positions.map((item) => {
      const gainPlusDiv = Number(item.realizedGross) + (Number(item.dividendsTotal) || 0);
      const soldCost = (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
      const gainPct = soldCost > 0 ? (Number(item.realizedGross) || 0) / soldCost * 100 : null;
      const gainPlusDivPct = soldCost > 0 ? gainPlusDiv / soldCost * 100 : null;
      const lotRows = (item.lots ?? []).flatMap((lot) => (lot.sales ?? []).map((sale) => {
        const cost = Number(sale.proceeds) - Number(sale.gain);
        const gainPlusDiv = Number(sale.gain) + (Number(sale.dividends) || 0);
        const gainPct = cost > 0 ? (Number(sale.gain) / cost) * 100 : null;
        const gainPlusDivPct = cost > 0 ? (gainPlusDiv / cost) * 100 : null;
        return `
          <tr class="pf-lot-row" hidden>
            <td class="pf-expand-cell"></td>
            ${lotSoldDateCell(lot.date, sale.date, `lot:${lot.id}:sell:${sale.date}`)}
            <td>${fmtShares(sale.shares)}</td>
            ${costeCellHtml(cost, lot.price)}
            ${costeCellHtml(sale.proceeds, sale.price, 'ingresos')}
            ${toggleCellHtml('ganancia', gainPct, sale.gain, fmtSigned)}
            ${toggleCellHtml('gananciadiv', gainPlusDivPct, gainPlusDiv, fmtSigned)}
            ${costeCellHtml(sale.dividends, (Number(sale.shares) || 0) > 0 ? Number(sale.dividends) / Number(sale.shares) : null, 'divcobrados')}
          </tr>`;
      })).join('');
      return `
        <tr data-ticker="${escapeHtml(item.ticker)}" tabindex="0">
          ${positionExpandCell(item)}
          ${positionCompanyCell(item, 'sold')}
          <td>${fmtShares(item.sharesSold)}</td>
          ${costeCellHtml(soldCost, soldAvgCostOf(item))}
          ${costeCellHtml(item.soldProceeds, (Number(item.sharesSold) || 0) > 0 ? Number(item.soldProceeds) / (Number(item.sharesSold) || 0) : null, 'ingresos')}
          ${toggleCellHtml('ganancia', gainPct, item.realizedGross, fmtSigned)}
          ${toggleCellHtml('gananciadiv', gainPlusDivPct, gainPlusDiv, fmtSigned)}
          ${costeCellHtml(item.dividendsTotal, (Number(item.sharesSold) || 0) > 0 ? Number(item.dividendsTotal) / (Number(item.sharesSold) || 0) : null, 'divcobrados')}
        </tr>
        ${lotRows}`;
    }).join('');

    const totalGainPct = totals.soldCost > 0 ? totals.realized / totals.soldCost * 100 : null;
    const totalGainPlusDivPct = totals.soldCost > 0 ? totals.gainPlusDiv / totals.soldCost * 100 : null;
    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(totals.sold)}</td>
        ${costeCellHtml(totals.soldCost, totals.sold > 0 ? totals.soldCost / totals.sold : null)}
        ${costeCellHtml(totals.proceeds, totals.sold > 0 ? totals.proceeds / totals.sold : null, 'ingresos')}
        ${toggleCellHtml('ganancia', totalGainPct, totals.realized, fmtSigned)}
        ${toggleCellHtml('gananciadiv', totalGainPlusDivPct, totals.gainPlusDiv, fmtSigned)}
        ${costeCellHtml(totals.dividends, totals.sold > 0 ? totals.dividends / totals.sold : null, 'divcobrados')}
      </tr>`;

    const headers = [
      ['valor', 'Valor', 'Empresa vendida'],
      ['vendidas', 'Vendidas', 'Acciones vendidas de esta empresa'],
      ['coste', 'Coste', 'Coste de lo vendido y precio medio por acción vendida'],
      ['ingresos', 'Ingresos', 'Ingresos totales de las ventas y precio medio por acción vendida'],
      ['ganancia', 'Ganancia', 'Ganancia realizada al vender'],
      ['gananciadiv', 'Ganancia + div.', 'Ganancia realizada + dividendos cobrados'],
      ['divcobrados', 'Div. cobrados', 'Dividendos cobrados mientras la tuviste'],
    ];
    return wrapPositionsTable(headers, rows, totalsRow);
  }

  function positionsTableHtml(view) {
    if (view === 'sold') return soldPositionsTableHtml();
    if (view === 'all') return allPositionsTableHtml();
    return currentPositionsTableHtml();
  }
window.wrapPositionsTable = wrapPositionsTable;
window.currentPositionsTableHtml = currentPositionsTableHtml;
window.soldPositionsTableHtml = soldPositionsTableHtml;
window.positionsTableHtml = positionsTableHtml;

})(window);
