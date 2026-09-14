/**
 * @fileoverview Procesamiento y enriquecimiento defensivo de la conclusión del informe anual (Form 10-K).
 * Incluye recompras, perspectivas (outlook), deuda, adquisiciones, dividendos y watchlist.
 * @module agents/analyst/annualConclusionProcessor
 */

import {
  isPlaceholderText,
  cleanAssetDescription,
  parseLooseReportNumber,
} from './financialParsers.js';
import {
  buildFutureProjectionText,
  buildShareCountEvolutionText,
  buildRepurchaseSecTable,
  enrichRepurchaseSnippet,
  mergeHistoryByYear,
  mergeDividendHistory,
} from './historyBuilders.js';
import {
  withOutlookComparison,
  completeOutlookPriorColumn,
  mergeOutlookRows,
} from './outlookHelpers.js';

/**
 * Normaliza la sección de recompras de acciones en el informe anual.
 * @param {object} conclusion - Objeto de conclusión del reporte.
 * @param {object} rawAnn - Detalles anuales extraídos.
 * @param {object} extracted - Datos globales extraídos.
 */
export function processRepurchasesSection(conclusion, rawAnn, extracted) {
  conclusion.repurchases = conclusion.repurchases || {};
  const rep = conclusion.repurchases;
  rep.title = rep.title || '1: Recompras';
  rep.text = rep.text || rawAnn.repurchasesNarrative || 'Detalle de los programas de recompras de acciones ejecutados durante el ejercicio.';
  rep.programAuthorization = rep.programAuthorization || rawAnn.repurchaseProgramSummary || null;
  rep.programRemaining = rep.programRemaining || rawAnn.repurchaseRemaining || null;
  rep.shareCountEvolution = rep.shareCountEvolution || null;
  rep.bpaImpact = rep.bpaImpact || null;
  rep.futureProjection = rep.futureProjection || null;

  const extractionRep = rawAnn.repurchases ?? {};
  const currentAuthRemaining = rep.authorizationRemaining;
  if ((!currentAuthRemaining || isPlaceholderText(currentAuthRemaining)) && extractionRep.programRemaining != null && extractionRep.programRemaining !== '') {
    const remNum = Number(extractionRep.programRemaining);
    rep.authorizationRemaining = Number.isFinite(remNum)
      ? `Unos ${String(remNum).replace('.', ',')}M de $ pendientes de ejecución`
      : String(extractionRep.programRemaining);
  }

  if (!rep.futureProjection || isPlaceholderText(rep.futureProjection)) {
    const avgPrice = Number(extractionRep.averagePrice)
      || (Number(extractionRep.aggregateCost) > 0 && Number(extractionRep.sharesRepurchasedAnnual) > 0
        ? Number(extractionRep.aggregateCost) / Number(extractionRep.sharesRepurchasedAnnual)
        : null);
    const projection = buildFutureProjectionText({
      remainingAuthorization: extractionRep.programRemaining,
      averagePrice: avgPrice,
      sharesHistory: rep.sharesHistory,
    });
    if (projection) rep.futureProjection = projection;
  }

  const expiryRaw = rep.authorizationExpiry || extractionRep.programExpiry || null;
  rep.authorizationExpiry = (expiryRaw && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(expiryRaw)))
    ? expiryRaw
    : null;

  if ((!Array.isArray(rep.sharesHistory) || rep.sharesHistory.length < 2)
    && Array.isArray(extractionRep.sharesHistory) && extractionRep.sharesHistory.length >= 2) {
    rep.sharesHistory = extractionRep.sharesHistory;
  }

  if (Array.isArray(rep.sharesHistory) && rep.sharesHistory.length >= 2) {
    rep.sharesHistory = mergeHistoryByYear(rep.sharesHistory, []).slice(-5);
    const computedEvolution = buildShareCountEvolutionText(rep.sharesHistory);
    if (computedEvolution) {
      const saysNoChange = /sin variaci|no variaci|sin cambios|no changes?/i.test(String(rep.shareCountEvolution ?? ''));
      const points = rep.sharesHistory;
      const prevShares = Number(points[points.length - 2]?.shares);
      const lastShares = Number(points[points.length - 1]?.shares);
      const lastChangePct = prevShares > 0 ? Math.abs((lastShares - prevShares) / prevShares) * 100 : 0;
      if (!rep.shareCountEvolution || (saysNoChange && lastChangePct >= 0.5)) {
        rep.shareCountEvolution = computedEvolution;
      }
    }
  }

  if (!rep.secSnippet && extractionRep.secTable) rep.secSnippet = extractionRep.secTable;
  if (!rep.secSnippet && rawAnn.repurchasesSecTable) rep.secSnippet = rawAnn.repurchasesSecTable;

  if (Array.isArray(extractionRep.repurchaseHistory) && extractionRep.repurchaseHistory.length >= 3) {
    const snippetCols = Array.isArray(rep.secSnippet?.headers) ? rep.secSnippet.headers.length : 0;
    if (!rep.secSnippet || snippetCols < 3) {
      const generatedTable = buildRepurchaseSecTable(extractionRep.repurchaseHistory, extractionRep.programRemaining);
      if (generatedTable) rep.secSnippet = generatedTable;
    }
  }

  if (rep.secSnippet) {
    const remainingNumber = Number(extractionRep.programRemaining);
    const match = String(rep.authorizationRemaining ?? '').match(/[\d.,]+/);
    const parsed = match ? parseLooseReportNumber(match[0]) : NaN;
    const remainingFromText = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    rep.secSnippet = enrichRepurchaseSnippet(
      rep.secSnippet,
      extractionRep.repurchaseHistory,
      Number.isFinite(remainingNumber) && remainingNumber > 0 ? remainingNumber : remainingFromText,
    );
  }

  // Filtrado de recompras insignificantes (< 50M)
  const buybackCandidates = [];
  const factsBuybacks = Number(extracted.facts?.shareBuybacks);
  if (Number.isFinite(factsBuybacks) && factsBuybacks !== 0) buybackCandidates.push(Math.abs(factsBuybacks));
  const capBuybacks = Number(extracted.capitalAllocationData?.ytd?.buybacks);
  if (Number.isFinite(capBuybacks) && capBuybacks !== 0) buybackCandidates.push(Math.abs(capBuybacks));
  if (Array.isArray(extractionRep.repurchaseHistory)) {
    const points = extractionRep.repurchaseHistory
      .map((p) => ({ year: Number(p?.year), amount: Math.abs(Number(p?.amount)) }))
      .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.amount) && p.amount > 0)
      .sort((a, b) => a.year - b.year);
    if (points.length) buybackCandidates.push(points[points.length - 1].amount);
  }
  const maxBuyback = buybackCandidates.length ? Math.max(...buybackCandidates) : null;
  if (conclusion.repurchases && maxBuyback != null && maxBuyback < 50) {
    delete conclusion.repurchases;
  }
}

/**
 * Normaliza la sección de perspectivas oficiales (outlook/guidance).
 */
export function processOutlookSection(conclusion, rawAnn, result) {
  conclusion.outlook = conclusion.outlook || {};
  const out = conclusion.outlook;
  out.title = out.title || '2: Outlook';
  const extractionOut = rawAnn.outlook ?? {};

  if (!out.text || out.text === 'Metas y previsiones cuantitativas oficiales para el próximo ejercicio.') {
    const parts = [];
    if (extractionOut.guidanceSales && !/sin guidance/i.test(extractionOut.guidanceSales)) parts.push(`Ventas: ${extractionOut.guidanceSales}`);
    if (extractionOut.guidanceEbt) parts.push(`EBT: ${extractionOut.guidanceEbt}`);
    if (extractionOut.guidanceEps) parts.push(`BPA: ${extractionOut.guidanceEps}`);
    if (extractionOut.guidanceFcf) parts.push(`FCF: ${extractionOut.guidanceFcf}`);
    if (extractionOut.guidanceCapex) parts.push(`CAPEX: ${extractionOut.guidanceCapex}`);
    if (extractionOut.guidanceNetInterest) parts.push(`Gastos por intereses: ${extractionOut.guidanceNetInterest}`);
    if (parts.length) {
      out.text = `Previsiones cuantitativas oficiales comunicadas por la dirección para el próximo ejercicio: ${parts.join(', ')}.`;
    } else if (rawAnn.outlookNarrative) {
      out.text = rawAnn.outlookNarrative;
    }
  }

  out.fcfAnalysis = out.fcfAnalysis || (extractionOut.guidanceFcf ? `Previsión de FCF reportada en el guidance: ${extractionOut.guidanceFcf}.` : null);
  out.riskFactors = out.riskFactors || extractionOut.commodityRisks || null;
  out.efficiencyPlans = out.efficiencyPlans || extractionOut.costSavingsPlan || null;

  if (!out.secSnippet && extractionOut.secTable && Array.isArray(extractionOut.secTable.rows) && extractionOut.secTable.rows.length) {
    out.secSnippet = extractionOut.secTable;
  }
  if (!out.secSnippet && rawAnn.outlookSecTable) {
    out.secSnippet = rawAnn.outlookSecTable;
  }
  if (out.secSnippet) {
    out.secSnippet = completeOutlookPriorColumn(
      mergeOutlookRows(withOutlookComparison(out.secSnippet, result), extractionOut.secTable),
      extractionOut,
    );
  }
}

/**
 * Normaliza la sección de deuda y vencimientos contractuales.
 */
export function processDebtSection(conclusion, rawAnn, edgarData, fiscalYear) {
  conclusion.debt = conclusion.debt || {};
  const d = conclusion.debt;
  d.title = d.title || '3: Deuda';
  d.text = d.text || rawAnn.debtNarrative || 'Estructura de endeudamiento, liquidez y calendario de vencimientos de deuda.';
  d.refinancingAnalysis = d.refinancingAnalysis || null;
  d.refinancingImpact = d.refinancingImpact || null;

  const extractionDebt = rawAnn.debt ?? {};
  const extractionMaturity = (Array.isArray(extractionDebt.maturityItems) && extractionDebt.maturityItems.length)
    ? extractionDebt.maturityItems
    : ((Array.isArray(extractionDebt.maturitySchedule) && extractionDebt.maturitySchedule.length) ? extractionDebt.maturitySchedule : null);
  const hasMaturitySchedule = Array.isArray(d.maturitySchedule) && d.maturitySchedule.length > 0;

  if (extractionMaturity) {
    d.maturitySchedule = extractionMaturity;
  } else if (!hasMaturitySchedule && edgarData.edgarDebtMaturities) {
    d.maturitySchedule = edgarData.edgarDebtMaturities.years.map((y) => ({
      year: y.year,
      label: 'Vencimientos contractuales de deuda',
      amount: y.amount,
      type: 'Deuda total',
      interestRate: null,
    }));
  }

  if (edgarData.edgarDebtMaturities?.afterYearFive != null) {
    d.maturityAfterFive = edgarData.edgarDebtMaturities.afterYearFive;
  }

  if (extractionDebt.allDebtAverageRate != null) {
    d.allDebtAverageRate = extractionDebt.allDebtAverageRate;
    d.allDebtAverageRateEstimated = extractionDebt.allDebtAverageRateEstimated === true;
    d.allDebtAverageRateSource = extractionDebt.allDebtAverageRateSource ?? null;
  }

  const debtHistoryMaxYear = Number.isFinite(Number(fiscalYear)) ? Number(fiscalYear) : null;
  const aiDebtHistory = ((Array.isArray(d.debtHistory) && d.debtHistory.length)
    ? d.debtHistory
    : (Array.isArray(extractionDebt.debtHistory) ? extractionDebt.debtHistory : []))
    .filter((point) => debtHistoryMaxYear == null || Number(point?.year) <= debtHistoryMaxYear);

  const mergedDebtHistory = mergeHistoryByYear(aiDebtHistory, edgarData.edgarDebtHistory).slice(-10);
  if (mergedDebtHistory.length) d.debtHistory = mergedDebtHistory;

  if (!d.refinancing && (extractionDebt.refinancing || extractionDebt.nearTermRates || extractionDebt.nearTermMaturities)) {
    d.refinancing = extractionDebt.refinancing || {
      occurred: Boolean(extractionDebt.nearTermMaturities),
      amountRefinanced: extractionDebt.nearTermMaturities,
      estimatedRefinancingRate: extractionDebt.estimatedRefinancingRate,
      annualInterestImpact: extractionDebt.estimatedInterestIncrease,
    };
  }

  if (!d.secSnippet && (rawAnn.debtMaturitiesSecTable || extractionDebt.secTable)) {
    d.secSnippet = rawAnn.debtMaturitiesSecTable || extractionDebt.secTable;
  }
}

/**
 * Normaliza las secciones de adquisiciones, dividendos, watchlist y rating.
 */
export function processAcquisitionsDividendsAndWatchlist(conclusion, rawAnn, extracted, edgarData, fiscalYear) {
  // Adquisiciones
  conclusion.acquisitions = conclusion.acquisitions || {};
  const acq = conclusion.acquisitions;
  acq.title = acq.title || '4: Adquisiciones';
  acq.text = acq.text || rawAnn.acquisitionsNarrative || (extracted.facts?.acquisitionsYtd
    ? `Se completaron adquisiciones corporativas por un importe neto de ${extracted.facts.acquisitionsYtd}M.`
    : 'No se realizaron adquisiciones materiales durante el ejercicio.');

  const hasOfficialAcq = extracted.facts?.acquisitionsYtd != null && Number.isFinite(Number(extracted.facts.acquisitionsYtd));
  const acqAmount = hasOfficialAcq ? Math.abs(Number(extracted.facts.acquisitionsYtd)) : null;
  if (hasOfficialAcq && acqAmount < 50) {
    const divAmount = Math.abs(Number(extracted.facts?.brandDivestitures) || 0) + Math.abs(Number(extracted.facts?.assetSalesYtd) || 0);
    const divDesc = extracted.facts?.divestitureDescription;
    const hasAmount = /\d[\d.,]*\s*(?:M\$|M\b|\$|millones|billion|million)/i.test(String(divDesc ?? ''));
    const divSentence = (divAmount >= 50 && divDesc)
      ? ` Se completó la desinversión de ${cleanAssetDescription(divDesc)}${hasAmount ? '' : ` por ${Math.round(divAmount)}M`}.`
      : '';
    acq.text = `No se realizaron adquisiciones materiales durante el ejercicio.${divSentence}`;
  }

  // Dividendos
  const extractionDividends = rawAnn.dividends ?? {};
  const dividendHistory = mergeDividendHistory(extractionDividends.history, edgarData.edgarDividendHistory);
  if (dividendHistory.length >= 2) {
    const prevDiv = dividendHistory[dividendHistory.length - 2];
    const lastDiv = dividendHistory[dividendHistory.length - 1];
    const computedChange = (Number.isFinite(prevDiv?.dps) && prevDiv.dps > 0 && Number.isFinite(lastDiv?.dps))
      ? Math.round(((lastDiv.dps - prevDiv.dps) / prevDiv.dps) * 1000) / 10
      : null;
    const changePct = Number.isFinite(Number(extractionDividends.changePct)) ? Number(extractionDividends.changePct) : computedChange;
    const changeType = extractionDividends.changeType || (changePct > 0 ? 'increase' : (changePct < 0 ? 'cut' : 'unchanged'));
    const aiDividends = conclusion.dividends ?? null;
    const material = Number.isFinite(changePct) && Math.abs(changePct) >= 2;
    if (aiDividends || material) {
      conclusion.dividends = aiDividends || {};
      const div = conclusion.dividends;
      div.title = div.title || '5: Dividendos';
      div.history = dividendHistory;
      div.changePct = changePct;
      div.changeType = changeType;
      if (!div.text) {
        const verb = changeType === 'cut' ? 'recortó' : 'aumentó';
        div.text = `El dividendo por acción ${verb} un ${Math.abs(changePct).toFixed(1).replace('.', ',')} % en ${lastDiv.year}, pasando de ${String(prevDiv.dps).replace('.', ',')} $ a ${String(lastDiv.dps).replace('.', ',')} $, con un pago total de ${String(lastDiv.total).replace('.', ',')}M.`;
      }
    }
  }

  // Watchlist
  conclusion.watchlist = conclusion.watchlist || {};
  conclusion.watchlist.title = conclusion.watchlist.title || `Cosas a tener en cuenta en ${fiscalYear ? fiscalYear + 1 : 'el próximo año'}`;
  if (!Array.isArray(conclusion.watchlist.items) || conclusion.watchlist.items.length === 0) {
    conclusion.watchlist.items = [
      '1: Evolución de los ingresos orgánicos y volúmenes respecto a competidores del sector.',
      '2: Ritmo y precio de ejecución de los programas de recompra de acciones.',
      '3: Refinanciación de la deuda próxima a vencer y coste efectivo de los nuevos intereses.',
    ];
  }
}

/**
 * Numera correlativamente las secciones de conclusión presentes.
 * @param {object} conclusion - Objeto de conclusión del informe.
 */
export function renumberConclusionSections(conclusion) {
  let sectionNumber = 0;
  const numberSection = (key, fallback) => {
    const section = conclusion[key];
    if (!section) return;
    sectionNumber += 1;
    const baseTitle = String(section.title ?? '').replace(/^\d+\s*:\s*/, '').trim() || fallback;
    section.title = `${sectionNumber}: ${baseTitle}`;
  };
  numberSection('repurchases', 'Recompras');
  numberSection('outlook', 'Outlook');
  numberSection('debt', 'Deuda');
  if (conclusion.acquisitions) {
    conclusion.acquisitions.title = `${sectionNumber + 1}: Adquisiciones`;
  }
}
