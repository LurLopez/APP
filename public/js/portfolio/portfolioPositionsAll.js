/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;
  const { portfolioLogoHtml } = window.PortfolioDonuts;

  function allPositionsTableHtml() {
    const sortGetters = {
      valor: (item) => String(item.companyName || item.ticker || '').toLowerCase(),
      acciones: (item) => (Number(item.shares) || 0) + (Number(item.sharesSold) || 0),
      coste: (item) => {
        const shares = (Number(item.shares) || 0) + (Number(item.sharesSold) || 0);
        return (PS.displayMode.coste ?? 'medio') === 'total' ? Number(item.totalInvested) : (shares > 0 ? Number(item.totalInvested) / shares : null);
      },
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
      realizada: (item) => {
        const amount = Number(item.realizedGross) || 0;
        if (modeIsPct('realizada')) {
          const cost = (Number(item.soldProceeds) || 0) - amount;
          return cost > 0 ? amount / cost : null;
        }
        return amount;
      },
      realizadadiv: (item) => {
        const amount = Number(item.realizedGross) + (Number(item.dividendsTotal) || 0);
        if (modeIsPct('realizadadiv')) {
          const cost = (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
          return cost > 0 ? amount / cost : null;
        }
        return amount;
      },
      total: (item) => {
        const amount = Number(item.totalReturn) || 0;
        if (modeIsPct('total')) {
          const invested = Number(item.totalInvested) || 0;
          return invested > 0 ? amount / invested : null;
        }
        return amount;
      },
    };
    const positions = sortPositions(positionsForView('all'), sortGetters);
    const summary = PS.data?.summary ?? {};
    const totalCost = Number(summary.totalCost) || 0;
    const totalShares = positions.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);
    const totalHeldDividends = positions.reduce((sum, item) => sum + (Number(item.dividendsHeld) || 0), 0);
    const totalSoldCost = positions.reduce((sum, item) => sum + ((Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0)), 0);
    const totalRealized = positions.reduce((sum, item) => sum + (Number(item.realizedGross) || 0), 0);
    const totalDividends = positions.reduce((sum, item) => sum + (Number(item.dividendsTotal) || 0), 0);
    const totalUnrealized = positions.reduce((sum, item) => sum + (item.unrealizedGross === null || item.unrealizedGross === undefined ? 0 : Number(item.unrealizedGross)), 0);
    const totalInvested = positions.reduce((sum, item) => sum + (Number(item.totalInvested) || 0), 0);
    const hasHeld = totalShares > 0;
    const hasSold = totalSoldCost > 0 || totalRealized > 0;

    const rows = positions.map((item) => {
      const held = (item.shares ?? 0) > 0;
      const sold = (item.sharesSold ?? 0) > 0;
      const costBasis = Number(item.costBasis);
      const soldCost = (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
      const gainPercent = held && costBasis > 0 && item.unrealizedGross !== null ? (Number(item.unrealizedGross) / costBasis) * 100 : null;
      const gainWithDividends = held && item.unrealizedWithDividends !== null && item.unrealizedWithDividends !== undefined ? Number(item.unrealizedWithDividends) : null;
      const gainWithDividendsPct = held && costBasis > 0 && item.unrealizedWithDividends !== null ? (Number(item.unrealizedWithDividends) / costBasis) * 100 : null;
      const realized = sold ? Number(item.realizedGross) || 0 : null;
      const realizedPct = sold && soldCost > 0 ? ((Number(item.realizedGross) || 0) / soldCost) * 100 : null;
      const realizedPlusDiv = sold ? Number(item.realizedGross) + (Number(item.dividendsTotal) || 0) : null;
      const realizedPlusDivPct = sold && soldCost > 0 ? (realizedPlusDiv / soldCost) * 100 : null;
      const totalPct = Number(item.totalInvested) > 0 ? (Number(item.totalReturn) / Number(item.totalInvested)) * 100 : null;
      const sharesBought = (Number(item.shares) || 0) + (Number(item.sharesSold) || 0);
      const costeAvg = sharesBought > 0 ? Number(item.totalInvested) / sharesBought : null;

      const statusBadge = sold
        ? `<span class="pf-status-badge ${held ? 'partial' : 'sold'}">${held ? 'Vendida parcial' : 'Vendida'}</span>`
        : '';
      const companyCell = `
        <td class="pf-broker-company">
          ${portfolioLogoHtml(item)}
           <span class="pf-broker-company-copy">
             <strong>${escapeHtml(item.companyName || item.ticker)}</strong>
             <small>${escapeHtml(item.ticker)}</small>
           </span>
           ${chartButtonHtml(`ticker:${item.ticker}`)}
           ${statusBadge}
        </td>`;

      const lotRows = (item.lots ?? []).flatMap((lot) => {
        const rowsArr = [];
        for (const sale of lot.sales ?? []) {
          const cost = Number(sale.proceeds) - Number(sale.gain);
          const gainPlusDiv = Number(sale.gain) + (Number(sale.dividends) || 0);
          const gainPct = cost > 0 ? (Number(sale.gain) / cost) * 100 : null;
          const gainPlusDivPct = cost > 0 ? (gainPlusDiv / cost) * 100 : null;
          rowsArr.push(`
            <tr class="pf-lot-row" hidden>
              <td class="pf-expand-cell"></td>
              ${lotSoldDateCell(lot.date, sale.date, `lot:${lot.id}`)}
              <td>${fmtShares(sale.shares)}</td>
              ${costeCellHtml(cost, lot.price, 'coste')}
              <td>—</td><td>—</td>
              ${toggleCellHtml('realizada', gainPct, sale.gain, fmtSigned)}
              ${toggleCellHtml('realizadadiv', gainPlusDivPct, gainPlusDiv, fmtSigned)}
              <td>—</td>
            </tr>`);
        }
        if ((lot.remaining ?? 0) > 0) {
          const lotUnrealized = lot.heldUnrealized === null || lot.heldUnrealized === undefined ? null : Number(lot.heldUnrealized);
          const lotGainWithDividends = lotUnrealized === null ? null : lotUnrealized + (Number(lot.heldDividends) || 0);
          const lotGainPct = lot.heldCost > 0 && lotUnrealized !== null ? (lotUnrealized / lot.heldCost) * 100 : null;
          const lotGainWithDividendsPct = lot.heldCost > 0 && lotGainWithDividends !== null ? (lotGainWithDividends / lot.heldCost) * 100 : null;
          rowsArr.push(`
            <tr class="pf-lot-row" hidden>
              <td class="pf-expand-cell"></td>
              ${lotDateCell(lot.date, 'En cartera', `lot:${lot.id}`)}
              <td>${fmtShares(lot.remaining)}</td>
              ${costeCellHtml(lot.heldCost, lot.price, 'coste')}
              ${toggleCellHtml('ganancia', lotGainPct, lotUnrealized, fmtSigned)}
              ${toggleCellHtml('gananciadiv', lotGainWithDividendsPct, lotGainWithDividends, fmtSigned)}
              <td>—</td><td>—</td><td>—</td>
            </tr>`);
        }
        return rowsArr;
      }).join('');

      return `
        <tr data-ticker="${escapeHtml(item.ticker)}" tabindex="0">
          ${positionExpandCell(item)}
          ${companyCell}
          <td>${fmtShares(sharesBought)}</td>
          ${costeCellHtml(item.totalInvested, costeAvg, 'coste')}
          ${toggleCellHtml('ganancia', gainPercent, held ? item.unrealizedGross : null, fmtSigned)}
          ${toggleCellHtml('gananciadiv', gainWithDividendsPct, gainWithDividends, fmtSigned)}
          ${toggleCellHtml('realizada', realizedPct, realized, fmtSigned)}
          ${toggleCellHtml('realizadadiv', realizedPlusDivPct, realizedPlusDiv, fmtSigned)}
          ${toggleCellHtml('total', totalPct, item.totalReturn, fmtSigned)}
        </tr>
        ${lotRows}`;
    }).join('');

    const totalGainPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : null;
    const totalGainWithDivPct = totalCost > 0 ? ((totalUnrealized + totalHeldDividends) / totalCost) * 100 : null;
    const totalRealizedPct = totalSoldCost > 0 ? (totalRealized / totalSoldCost) * 100 : null;
    const totalRealizedPlusDivPct = totalSoldCost > 0 ? ((totalRealized + totalDividends) / totalSoldCost) * 100 : null;
    const totalReturn = totalUnrealized + totalRealized + totalDividends;
    const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : null;
    const totalSharesBought = totalShares + positions.reduce((sum, item) => sum + (Number(item.sharesSold) || 0), 0);

    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(totalSharesBought)}</td>
        ${costeCellHtml(totalInvested, totalSharesBought > 0 ? totalInvested / totalSharesBought : null, 'coste')}
        ${toggleCellHtml('ganancia', totalGainPct, hasHeld ? totalUnrealized : null, fmtSigned)}
        ${toggleCellHtml('gananciadiv', totalGainWithDivPct, hasHeld ? totalUnrealized + totalHeldDividends : null, fmtSigned)}
        ${toggleCellHtml('realizada', totalRealizedPct, hasSold ? totalRealized : null, fmtSigned)}
        ${toggleCellHtml('realizadadiv', totalRealizedPlusDivPct, hasSold ? totalRealized + totalDividends : null, fmtSigned)}
        ${toggleCellHtml('total', totalReturnPct, totalReturn, fmtSigned)}
      </tr>`;

    const headers = [
      ['valor', 'Valor', 'Empresa (en cartera o vendida)'],
      ['acciones', 'Acciones', 'Acciones totales (en cartera + vendidas)'],
      ['coste', 'Coste', 'Coste total de todas las acciones (en cartera + vendidas) y precio medio (coste/medio)'],
      ['ganancia', 'No real.', 'Ganancia o pérdida no realizada de la posición actual'],
      ['gananciadiv', 'No real. + div.', 'No realizada + dividendos cobrados de la posición actual'],
      ['realizada', 'Real.', 'Ganancia realizada con las ventas'],
      ['realizadadiv', 'Real. + div.', 'Ganancia realizada + dividendos cobrados'],
      ['total', 'Total', 'Rentabilidad total sobre todo lo invertido (en cartera + vendidas) o importe en $'],
    ];
    return wrapPositionsTable(headers, rows, totalsRow, { wideOpt: true });
  }

  function toggleLotsRow(row, forceShow) {
    const lotRows = [];
    let lotRow = row?.nextElementSibling;
    while (lotRow && lotRow.classList.contains('pf-lot-row')) {
      lotRows.push(lotRow);
      lotRow = lotRow.nextElementSibling;
    }
    if (!lotRows.length) return;
    const willShow = forceShow !== undefined ? forceShow : lotRows[0].hidden;
    lotRows.forEach((item) => { item.hidden = !willShow; });
    const button = row.querySelector('[data-pf-expand]');
    button?.classList.toggle('open', willShow);
    button?.setAttribute('aria-expanded', String(willShow));
    row.classList.toggle('pf-row-expanded', willShow);
  }

  function getExpandedTickers(scope) {
    const set = new Set();
    scope?.querySelectorAll('.pf-broker-table tbody tr[data-ticker].pf-row-expanded').forEach((row) => {
      set.add(row.dataset.ticker);
    });
    return set;
  }

  function restoreExpandedTickers(scope, tickers) {
    if (!scope || !tickers?.size) return;
    scope.querySelectorAll('.pf-broker-table tbody tr[data-ticker]').forEach((row) => {
      if (tickers.has(row.dataset.ticker)) toggleLotsRow(row, true);
    });
  }
window.allPositionsTableHtml = allPositionsTableHtml;
window.toggleLotsRow = toggleLotsRow;
window.getExpandedTickers = getExpandedTickers;
window.restoreExpandedTickers = restoreExpandedTickers;

})(window);
