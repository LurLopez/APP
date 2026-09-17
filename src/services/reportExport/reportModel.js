/**
 * @fileoverview Ensamblador del modelo abstracto de informe financiero para exportadores.
 * @module services/reportExport/reportModel
 */

import { withOutlookComparison } from '../../agents/analystAgent.js';
import { sanitize } from './exportColors.js';
import { withAveragePriceRow, buildSharesChartModel } from './sharesModel.js';
import { buildDebtMaturityModel } from './debtMaturityModel.js';
import { buildDebtHistoryModel, buildDebtRefinancingModel } from './debtHistoryRefinancingModel.js';
import { buildAcquisitionsModel, buildDividendModel, buildDividendTable } from './dividendsAndAcquisitionsModel.js';
import { buildSalesSection, buildCashFlowSection, buildCapitalSection, buildSecSnippetTable } from './reportSections.js';
import { getExecutiveChanges } from './executiveChanges.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

/**
 * Construye las tarjetas de la Parte II: Indagación a fondo y conclusiones.
 * @param {object} conc - Objeto de conclusiones del informe.
 * @param {object} report - Objeto completo del informe.
 * @param {string} language - Idioma del informe.
 * @returns {Array<object>} Lista de tarjetas con sus modelos analíticos y tablas.
 */
function buildConclusionCards(conc, report, language = 'es') {
  const lang = normalizeLanguage(language);
  const cards = [];
  if (conc.repurchases) {
    const rep = conc.repurchases;
    const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
      ? rep.authorizationExpiry : null;
    const buybackPctLabel = (() => {
      if (rep.buybackPctOfShares == null) return null;
      const value = lang === 'en' ? String(rep.buybackPctOfShares) : String(rep.buybackPctOfShares).replace('.', ',');
      return t('Peso en el capital: {prefix}{value} % de las acciones en el año', {
        prefix: rep.buybackPctOfSharesEstimated ? '≈' : '',
        value,
      }, lang);
    })();
    const badges = [
      (rep.authorizationRemaining || rep.programRemaining) ? t('Autorización restante: {value}', { value: rep.authorizationRemaining || rep.programRemaining }, lang) : null,
      repExpiry ? t('Vigencia: {value}', { value: repExpiry }, lang) : null,
      rep.shareCountEvolution ? t('Evolución acciones: {value}', { value: rep.shareCountEvolution }, lang) : null,
      buybackPctLabel,
      rep.bpaImpact ? t('Impacto BPA: {value}', { value: rep.bpaImpact }, lang) : null,
      rep.programChanges ? t('Programa: {value}', { value: rep.programChanges }, lang) : null,
      rep.futureProjection ? t('Proyección 5 años: {value}', { value: rep.futureProjection }, lang) : null,
    ].filter(Boolean);
    cards.push({
      title: rep.title || t('1: Recompras', null, lang),
      text: rep.text || null,
      badges,
      highlight: true,
      chart: buildSharesChartModel(rep.sharesHistory),
      table: buildSecSnippetTable(withAveragePriceRow(rep.secSnippet)),
    });
  }

  const executiveChanges = getExecutiveChanges(conc, lang);
  if (executiveChanges) {
    cards.push({
      title: executiveChanges.title,
      executiveChanges: {
        changes: executiveChanges.changes,
        disclaimer: executiveChanges.disclaimer,
      },
    });
  }

  if (conc.outlook) {
    const out = conc.outlook;
    const details = [
      out.fcfAnalysis ? t('Análisis FCF: {value}', { value: out.fcfAnalysis }, lang) : null,
      out.riskFactors ? t('Riesgos y Sensibilidad: {value}', { value: out.riskFactors }, lang) : null,
      out.efficiencyPlans ? t('Programas de eficiencia: {value}', { value: out.efficiencyPlans }, lang) : null,
    ].filter(Boolean);
    cards.push({
      title: out.title || t('2: Outlook', null, lang),
      text: out.text || null,
      badges: details,
      table: buildSecSnippetTable(withOutlookComparison(out.secSnippet, report, lang)),
    });
  }

  if (conc.debt) {
    const debt = conc.debt;
    const maturityChart = buildDebtMaturityModel(debt, report?.fiscalYear);
    const historyChart = buildDebtHistoryModel(debt, report);
    const refinancingModel = buildDebtRefinancingModel(debt, report);
    const details = [
      refinancingModel?.badge ? refinancingModel.badge : null,
      !refinancingModel && debt.refinancingAnalysis ? t('Refinanciación de deuda: {value}', { value: debt.refinancingAnalysis }, lang) : null,
      !refinancingModel && debt.refinancingImpact ? t('Impacto en intereses: {value}', { value: debt.refinancingImpact }, lang) : null,
    ].filter(Boolean);
    cards.push({
      title: debt.title || t('3: Deuda', null, lang),
      text: debt.text || null,
      badges: refinancingModel ? [] : details,
      highlight: true,
      debtMaturityChart: maturityChart,
      debtHistoryChart: historyChart,
      refinancing: refinancingModel,
      table: maturityChart ? null : buildSecSnippetTable(debt.secSnippet),
    });
  }

  const acquisitionsModel = buildAcquisitionsModel(report);
  if (conc.acquisitions && acquisitionsModel.material) {
    cards.push({
      title: conc.acquisitions.title || t('Operaciones corporativas', null, lang),
      text: conc.acquisitions.text || t('No se realizaron operaciones corporativas materiales durante el ejercicio.', null, lang),
    });
  }

  const dividendChart = buildDividendModel(report);
  if (dividendChart) {
    cards.push({
      title: dividendChart.title,
      text: dividendChart.text,
      dividendChart,
      table: buildDividendTable(dividendChart),
    });
  }

  if (conc.watchlist && Array.isArray(conc.watchlist.items) && conc.watchlist.items.length) {
    cards.push({
      title: conc.watchlist.title || t('Cosas a tener en cuenta', null, lang),
      items: conc.watchlist.items,
      isWatchlist: true,
    });
  }
  return cards;
}

/**
 * Construye el modelo canónico del informe conteniendo horizontes, conclusiones y nota final.
 * @param {object} report - Informe financiero generado por el agente de análisis.
 * @param {string} [language] - Idioma del informe (por defecto, el del propio informe).
 * @returns {object} Modelo intermedio normalizado listo para HTML, DOCX y ODT.
 */
export function buildReportModel(report, language = null) {
  const lang = normalizeLanguage(language || report?.language);
  const horizons = Array.isArray(report?.horizons) ? report.horizons : [];
  const model = {
    company: sanitize(report?.company ?? ''),
    ticker: report?.ticker ? `${t('Ticker', null, lang)}: ${sanitize(report.ticker)}` : null,
    periodTitle: report?.periodTitle ? sanitize(report.periodTitle) : null,
    horizons: horizons.map((horizon, hIndex) => ({
      label: sanitize(horizon.label ?? (hIndex === 0 ? t('ÚLTIMOS 3 MESES', null, lang) : t('EN TODO EL AÑO', null, lang))),
      sections: [
        (Array.isArray(horizon.sales?.rows) && horizon.sales.rows.length) ? buildSalesSection(horizon.sales, lang) : null,
        (Array.isArray(horizon.cashFlow?.rows) && horizon.cashFlow.rows.length) ? buildCashFlowSection(horizon.cashFlow, lang) : null,
        (Array.isArray(horizon.capital?.rows) && horizon.capital.rows.length) ? buildCapitalSection(horizon.capital, lang) : null,
      ].filter(Boolean),
    })),
    conclusion: null,
    rating: null,
    footer: t('Generado por Cifra · beta 0.1 · La IA ordena la información. Tú decides qué significa.', null, lang),
  };

  if (report?.conclusion) {
    model.conclusion = {
      title: t('PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN', null, lang),
      subtitle: t('Análisis detallado de recompras, cambios en la dirección, outlook oficial, deuda y asignación de capital', null, lang),
      cards: buildConclusionCards(report.conclusion, report, lang),
    };
  }

  if (report?.rating && report.rating.score != null) {
    const score = Number(report.rating.score);
    model.rating = {
      score,
      label: report.rating.label || t('NOTA DE RESULTADOS: {score}', { score }, lang),
      rationale: report.rating.rationale || t('Calificación puramente financiera basada en las cuentas anuales, outlook oficial y asignación de capital.', null, lang),
      disclaimer: t('Nota puramente financiera basada exclusivamente en las cuentas anuales, el outlook oficial y la asignación de capital ejecutada. Sin especulación sobre el cumplimiento de expectativas.', null, lang),
    };
  }

  return model;
}
