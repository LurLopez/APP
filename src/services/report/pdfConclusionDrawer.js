/**
 * @fileoverview Renderizado de conclusiones (Recompras, Outlook, Deuda, Dividendos, Rating) en PDFKit.
 * @module services/report/pdfConclusionDrawer
 */

export { drawConclusion } from './pdfConclusionSections.js';

import {
  sanitize,
  drawSectionTitle,
  drawHorizontalRule,
  drawHighlightedText,
  drawPdfFormattedText,
} from './pdfStyles.js';
import { drawPdfSecSnippet } from './pdfSnippetDrawer.js';
import { drawSharesChart, drawDividendChart } from './pdfEquityCharts.js';
import {
  drawDebtMaturityChart,
  drawDebtHistoryChart,
  drawDebtRefinancingBox,
} from './pdfDebtCharts.js';
import {
  withAveragePriceRow,
  withOutlookComparison,
  buildSharesChartModel,
  buildDebtMaturityModel,
  buildDebtHistoryModel,
  buildDebtRefinancingModel,
  buildAcquisitionsModel,
  buildDividendModel,
} from '../reportExport.service.js';

