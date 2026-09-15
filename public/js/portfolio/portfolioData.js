/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function allocationGroupLabel(item, group) {
    if (group === 'sector') return { label: item.sector || 'Sin sector', labelKey: item.sector || 'Sin sector' };
    if (group === 'type') return { label: item.type || 'Sin tipo', labelKey: item.type || 'Sin tipo' };
    if (group === 'country') return { label: item.country || 'Sin país', labelKey: item.country || 'Sin país' };
    if (group === 'region') return { label: item.region || 'Sin región', labelKey: item.region || 'Sin región' };
    return { label: item.companyName || item.ticker, labelKey: item.ticker };
  }

  function tabForPosition(item, key) {
    if (key === 'sector') return item.sector || 'Sin sector';
    if (key === 'type') return item.type || 'Sin tipo';
    if (key === 'country') return item.country || 'Sin país';
    if (key === 'region') return item.region || 'Sin región';
    return null;
  }

  function userTabs() {
    return PS.data?.tabs ?? [];
  }

  function userGroups() {
    return PS.data?.groups ?? [];
  }

  function groupsOfTab(tabId) {
    return userGroups().filter((group) => group.tabId === tabId);
  }

  function groupById(id) {
    return userGroups().find((group) => group.id === id) ?? null;
  }

  function tabById(id) {
    return userTabs().find((tab) => tab.id === id) ?? null;
  }

  function modeIsPct(key) {
    return (PS.displayMode[key] ?? 'pct') === 'pct';
  }

  function groupsModeIsPct(key) {
    return (PS.groupsDisplayMode[key] ?? 'pct') === 'pct';
  }

  function computeGroupTotals(tab, group, view) {
    return aggregateUnits(groupUnits(tab, group, view));
  }

  function aggregateUnits(units) {
    const totals = { shares: 0, cost: 0, value: 0, gain: 0, dividends: 0, annual: 0 };
    let hasHeld = false;
    for (const unit of units) {
      const item = unit.item;
      if (unit.kind === 'held') {
        const lot = unit.lot;
        hasHeld = true;
        totals.shares += Number(lot.remaining) || 0;
        totals.cost += Number(lot.heldCost) || 0;
        totals.value += Number(lot.heldValue) || 0;
        totals.gain += Number(lot.heldUnrealized) || 0;
        totals.dividends += Number(lot.heldDividends) || 0;
        const perShare = item.shares > 0 ? (Number(item.projectedAnnualDividends) || 0) / Number(item.shares) : 0;
        totals.annual += perShare * (Number(lot.remaining) || 0);
      } else {
        const sale = unit.sale;
        totals.shares += Number(sale.shares) || 0;
        totals.cost += (Number(sale.shares) || 0) * (Number(unit.lot.price) || 0);
        totals.gain += Number(sale.gain) || 0;
        totals.dividends += Number(sale.dividends) || 0;
      }
    }
    if (!hasHeld) totals.annual = null;
    return totals;
  }

  function groupUnits(tab, group, view) {
    const units = [];
    const positions = PS.data?.positions ?? [];
    if (!tab) return units;
    const addHeld = (item, lot) => units.push({ kind: 'held', item, lot });
    const addSold = (item, lot) => {
      for (const sale of lot.sales ?? []) units.push({ kind: 'sold', item, lot, sale });
    };
    const relevantLots = (item) => (item.lots ?? []).filter((lot) => ((lot.remaining ?? 0) > 0 || (lot.sales ?? []).length > 0));
    if (tab.type === 'predefined') {
      for (const item of positions) {
        if (tabForPosition(item, tab.key) !== group.label) continue;
        for (const lot of relevantLots(item)) {
          if (view !== 'sold' && (lot.remaining ?? 0) > 0) addHeld(item, lot);
          if (view !== 'current') addSold(item, lot);
        }
      }
      return units;
    }
    if (tab.type === 'custom') {
      const g = groupById(Number(group.groupId ?? group.id));
      if (!g) return units;
      const ruleTickers = new Set(g.ruleTickers ?? []);
      const lotIds = new Set(g.lotTransactionIds ?? []);
      for (const item of positions) {
        const isRule = ruleTickers.has(item.ticker);
        const lots = relevantLots(item);
        const selected = isRule ? lots : lots.filter((lot) => lotIds.has(lot.id));
        for (const lot of selected) {
          if (view !== 'sold' && (lot.remaining ?? 0) > 0) addHeld(item, lot);
          if (view !== 'current') addSold(item, lot);
        }
      }
      return units;
    }
    return units;
  }

  function sortGroupItems(items) {
    const getter = GROUPS_SORT_GETTERS[PS.groupsSortKey];
    if (!getter) return items;
    const factor = PS.groupsSortDir === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      const aNull = va === null || va === undefined || Number.isNaN(Number(va));
      const bNull = vb === null || vb === undefined || Number.isNaN(Number(vb));
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }

  const PORTFOLIO_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48', '#4f46e5', '#16a34a', '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#6366f1', '#64748b'];

  const PORTFOLIO_PREDEFINED_TABS = [
    ['sector', 'Sector'],
    ['type', 'Tipo'],
    ['country', 'País'],
    ['region', 'Región'],
  ];

  const ALLOCATION_GROUPS = [
    ['company', 'Valor'],
    ['sector', 'Sector'],
    ['type', 'Tipo'],
    ['country', 'País'],
    ['region', 'Región'],
  ];

  const ALLOCATION_GROUP_TITLES = {
    company: 'Asignación por empresa',
    sector: 'Asignación por sector',
    type: 'Asignación por tipo de valor',
    country: 'Asignación por país',
    region: 'Asignación por región',
  };

  const TOGGLEABLE_SORT_KEYS = new Set(['coste', 'ingresos', 'ganancia', 'gananciadiv', 'realizada', 'realizadadiv', 'total', 'divpct', 'divyoc', 'divcobrados']);

  const TOTAL_MEDIO_DEFAULT = { coste: 'medio', ingresos: 'medio', divcobrados: 'total' };

  const TOTAL_MEDIO_TOGGLES = {
    coste: {
      total: 'Coste', medio: 'Medio',
      titleTotal: 'Mostrar el precio medio en lugar del coste total',
      titleMedio: 'Mostrar el coste total en lugar del precio medio',
    },
    ingresos: {
      total: 'Ingresos', medio: 'Medio',
      titleTotal: 'Mostrar el precio medio de venta en lugar del ingreso total',
      titleMedio: 'Mostrar el ingreso total en lugar del precio medio de venta',
    },
    divcobrados: {
      total: 'Total', medio: 'Por acc.',
      titleTotal: 'Mostrar dividendos por acción en lugar del total',
      titleMedio: 'Mostrar el total de dividendos en lugar de por acción',
    },
  };

  const GROUPS_SORT_GETTERS = {
    valor: (item) => String(item.group.label || '').toLowerCase(),
    acciones: (item) => item.totals.shares,
    coste: (item) => item.totals.cost,
    ganancia: (item) => {
      const amount = item.totals.gain;
      if (groupsModeIsPct('ganancia')) return item.totals.cost > 0 ? amount / item.totals.cost : null;
      return amount;
    },
    gananciadiv: (item) => {
      const amount = item.totals.gain + item.totals.dividends;
      if (groupsModeIsPct('gananciadiv')) return item.totals.cost > 0 ? amount / item.totals.cost : null;
      return amount;
    },
    peso: (item) => item.totals.value,
    divpct: (item) => {
      if (!groupsModeIsPct('divpct')) return item.totals.annual;
      return item.totals.value > 0 ? item.totals.annual / item.totals.value : null;
    },
    divyoc: (item) => {
      if (!groupsModeIsPct('divyoc')) return item.totals.annual;
      return item.totals.cost > 0 ? item.totals.annual / item.totals.cost : null;
    },
    divcobrados: (item) => {
      const total = item.totals.dividends;
      return (PS.groupsDisplayMode.divcobrados ?? 'total') === 'total' ? total : (item.totals.shares > 0 ? total / item.totals.shares : 0);
    },
  };
window.allocationGroupLabel = allocationGroupLabel;
window.tabForPosition = tabForPosition;
window.userTabs = userTabs;
window.userGroups = userGroups;
window.groupsOfTab = groupsOfTab;
window.groupById = groupById;
window.tabById = tabById;
window.modeIsPct = modeIsPct;
window.groupsModeIsPct = groupsModeIsPct;
window.computeGroupTotals = computeGroupTotals;
window.aggregateUnits = aggregateUnits;
window.groupUnits = groupUnits;
window.sortGroupItems = sortGroupItems;
window.PORTFOLIO_COLORS = PORTFOLIO_COLORS;
window.PORTFOLIO_PREDEFINED_TABS = PORTFOLIO_PREDEFINED_TABS;
window.ALLOCATION_GROUPS = ALLOCATION_GROUPS;
window.ALLOCATION_GROUP_TITLES = ALLOCATION_GROUP_TITLES;
window.TOGGLEABLE_SORT_KEYS = TOGGLEABLE_SORT_KEYS;
window.TOTAL_MEDIO_DEFAULT = TOTAL_MEDIO_DEFAULT;
window.TOTAL_MEDIO_TOGGLES = TOTAL_MEDIO_TOGGLES;
window.GROUPS_SORT_GETTERS = GROUPS_SORT_GETTERS;

})(window);
