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

/**
 * Construye las tarjetas de la Parte II: Indagación a fondo y conclusiones.
 * @param {object} conc - Objeto de conclusiones del informe.
 * @param {object} report - Objeto completo del informe.
 * @returns {Array<object>} Lista de tarjetas con sus modelos analíticos y tablas.
 */
function buildConclusionCards(conc, report) {
  const cards = [];
  if (conc.repurchases) {
    const rep = conc.repurchases;
    const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
      ? rep.authorizationExpiry : null;
    const buybackPctLabel = (() => {
      if (rep.buybackPctOfShares == null) return null;
      const value = String(rep.buybackPctOfShares).replace('.', ',');
      return `Peso en el capital: ${rep.buybackPctOfSharesEstimated ? '≈' : ''}${value} % de las acciones en el año`;
    })();
    const badges = [
      (rep.authorizationRemaining || rep.programRemaining) ? `Autorización restante: ${rep.authorizationRemaining || rep.programRemaining}` : null,
      repExpiry ? `Vigencia: ${repExpiry}` : null,
      rep.shareCountEvolution ? `Evolución acciones: ${rep.shareCountEvolution}` : null,
      buybackPctLabel,
      rep.bpaImpact ? `Impacto BPA: ${rep.bpaImpact}` : null,
      rep.programChanges ? `Programa: ${rep.programChanges}` : null,
      rep.futureProjection ? `Proyección 5 años: ${rep.futureProjection}` : null,
    ].filter(Boolean);
    cards.push({
      title: rep.title || '1: Recompras',
      text: rep.text || null,
      badges,
      highlight: true,
      chart: buildSharesChartModel(rep.sharesHistory),
      table: buildSecSnippetTable(withAveragePriceRow(rep.secSnippet)),
    });
  }

  const executiveChanges = getExecutiveChanges(conc);
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
      out.fcfAnalysis ? `Análisis FCF: ${out.fcfAnalysis}` : null,
      out.riskFactors ? `Riesgos y Sensibilidad: ${out.riskFactors}` : null,
      out.efficiencyPlans ? `Programas de eficiencia: ${out.efficiencyPlans}` : null,
    ].filter(Boolean);
    cards.push({
      title: out.title || '2: Outlook',
      text: out.text || null,
      badges: details,
      table: buildSecSnippetTable(withOutlookComparison(out.secSnippet, report)),
    });
  }

  if (conc.debt) {
    const debt = conc.debt;
    const maturityChart = buildDebtMaturityModel(debt, report?.fiscalYear);
    const historyChart = buildDebtHistoryModel(debt, report);
    const refinancingModel = buildDebtRefinancingModel(debt, report);
    const details = [
      refinancingModel?.badge ? refinancingModel.badge : null,
      !refinancingModel && debt.refinancingAnalysis ? `Refinanciación de deuda: ${debt.refinancingAnalysis}` : null,
      !refinancingModel && debt.refinancingImpact ? `Impacto en intereses: ${debt.refinancingImpact}` : null,
    ].filter(Boolean);
    cards.push({
      title: debt.title || '3: Deuda',
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
      title: conc.acquisitions.title || '4: Adquisiciones',
      text: conc.acquisitions.text || 'No se realizaron adquisiciones materiales durante el ejercicio.',
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
      title: conc.watchlist.title || 'Cosas a tener en cuenta',
      items: conc.watchlist.items,
      isWatchlist: true,
    });
  }
  return cards;
}

/**
 * Construye el modelo canónico del informe conteniendo horizontes, conclusiones y nota final.
 * @param {object} report - Informe financiero generado por el agente de análisis.
 * @returns {object} Modelo intermedio normalizado listo para HTML, DOCX y ODT.
 */
export function buildReportModel(report) {
  const horizons = Array.isArray(report?.horizons) ? report.horizons : [];
  const model = {
    company: sanitize(report?.company ?? ''),
    ticker: report?.ticker ? `Ticker: ${sanitize(report.ticker)}` : null,
    periodTitle: report?.periodTitle ? sanitize(report.periodTitle) : null,
    horizons: horizons.map((horizon, hIndex) => ({
      label: sanitize(horizon.label ?? (hIndex === 0 ? 'ÚLTIMOS 3 MESES' : 'EN TODO EL AÑO')),
      sections: [
        (Array.isArray(horizon.sales?.rows) && horizon.sales.rows.length) ? buildSalesSection(horizon.sales) : null,
        (Array.isArray(horizon.cashFlow?.rows) && horizon.cashFlow.rows.length) ? buildCashFlowSection(horizon.cashFlow) : null,
        (Array.isArray(horizon.capital?.rows) && horizon.capital.rows.length) ? buildCapitalSection(horizon.capital) : null,
      ].filter(Boolean),
    })),
    conclusion: null,
    rating: null,
    footer: 'Generado por Cifra · beta 0.1 · La IA ordena la información. Tú decides qué significa.',
  };

  if (report?.conclusion) {
    model.conclusion = {
      title: 'PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN',
      subtitle: 'Análisis detallado de recompras, cambios en la dirección, outlook oficial, deuda y asignación de capital',
      cards: buildConclusionCards(report.conclusion, report),
    };
  }

  if (report?.rating && report.rating.score != null) {
    const score = Number(report.rating.score);
    model.rating = {
      score,
      label: report.rating.label || `NOTA DE RESULTADOS: ${score}`,
      rationale: report.rating.rationale || 'Calificación puramente financiera basada en las cuentas anuales, outlook oficial y asignación de capital.',
      disclaimer: 'Nota puramente financiera basada exclusivamente en las cuentas anuales, el outlook oficial y la asignación de capital ejecutada. Sin especulación sobre el cumplimiento de expectativas.',
    };
  }

  return model;
}
