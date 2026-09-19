/**
 * @fileoverview Fachada del servicio de exportación de informes financieros en múltiples formatos.
 * Reexporta modelos analíticos, gráficos SVG y exportadores a HTML, DOCX y ODT.
 * @module services/reportExport.service
 */

export { withOutlookComparison } from '../agents/analystAgent.js';

export {
  HIGHLIGHT_PALETTE,
  COLORS,
  CHART_IMAGE_SLOTS,
  sanitize,
  parseRichSegments,
  getHighlight,
  noteNumberOf,
  parseSecNumber,
  cell,
  headerCell,
  esc,
  escapeHtml,
  hex,
} from './reportExport/exportColors.js';

export {
  fmtPct,
  fmtBpa,
  withAveragePriceRow,
  buildSharesChartModel,
  buildSharesChartTable,
} from './reportExport/sharesModel.js';

export {
  DEBT_STACK_PALETTE,
  rateFromSecSnippet,
  buildDebtMaturityModel,
  buildDebtMaturityTable,
} from './reportExport/debtMaturityModel.js';

export {
  buildDebtHistoryModel,
  buildDebtHistoryTable,
  buildDebtRefinancingModel,
  buildDebtRefinancingBadges,
} from './reportExport/debtHistoryRefinancingModel.js';

export {
  buildAcquisitionsModel,
  buildDividendModel,
  buildDividendTable,
} from './reportExport/dividendsAndAcquisitionsModel.js';

export {
  isPctHeader,
  pctColor,
  buildNotes,
  buildSalesSection,
  buildCashFlowSection,
  buildCapitalSection,
  buildSecSnippetTable,
} from './reportExport/reportSections.js';

export {
  buildReportModel,
} from './reportExport/reportModel.js';

export {
  renderSharesChartSvg,
  renderHtmlSharesChart,
  renderDebtMaturitySvg,
  renderHtmlDebtMaturityChart,
  renderDebtHistorySvg,
  renderHtmlDebtHistoryChart,
  renderDividendSvg,
  renderHtmlDividendChart,
} from './reportExport/svgRenderers.js';

export {
  CHART_RASTER_WIDTH,
  svgToPng,
  buildReportChartImages,
} from './reportExport/chartImages.js';

export {
  renderRichHtml,
  renderHtmlNotes,
  renderHtmlTable,
  renderHtmlRefinancingBox,
  buildReportHtml,
} from './reportExport/htmlExporter.js';

export {
  buildReportDocx,
} from './reportExport/docxExporter.js';

export {
  buildReportOdt,
} from './reportExport/odtExporter.js';

export {
  BRAND_URL,
  BRAND_LABEL,
  BRAND_LOGO_PATH,
  BRAND_LOGO_RATIO,
  readBrandLogo,
  hasBrandLogo,
} from './reportExport/reportBranding.js';
