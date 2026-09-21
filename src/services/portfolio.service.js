/**
 * @fileoverview Fachada principal para el servicio de gestión de cartera, lotes FIFO, dividendos y gráficos interactivos.
 * @module services/portfolio
 */

export { PortfolioError, addBuy, addSell, removeTransaction } from './portfolio/portfolioFifo.service.js';
export { getPortfolio } from './portfolio/portfolioAggregator.service.js';
export { getPortfolioChart } from './portfolio/portfolioChart.service.js';
export {
  createTab,
  updateTab,
  deleteTab,
  createGroup,
  updateGroup,
  deleteGroup,
  addGroupTicker,
  removeGroupTicker,
  addGroupLot,
  removeGroupLot,
} from './portfolio/portfolioTabs.service.js';
