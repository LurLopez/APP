/**
 * @fileoverview Módulo extraído de annualConclusionProcessor.js.
 */

import { cleanAssetDescription } from './financialParsers.js';
import { mergeHistoryByYear, mergeDividendHistory } from './historyBuilders.js';
import { withOutlookComparison, completeOutlookPriorColumn, mergeOutlookRows } from './outlookHelpers.js';
import { getHistoricalPrices } from '../../services/market.service.js';

function isoDateShift(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function fetchCeoMarketReaction(announcementDate, ticker) {
  const dateMatch = String(announcementDate ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
  const normalizedTicker = String(ticker ?? '').trim().toUpperCase();
  if (!dateMatch || !normalizedTicker) return null;

  const dateIso = dateMatch[0];
  const from = isoDateShift(dateIso, -10);
  const to = isoDateShift(dateIso, 14);
  if (!from || !to) return null;

  const prices = await getHistoricalPrices(normalizedTicker, { from, to });
  if (!Array.isArray(prices) || prices.length < 2) return null;

  const before = [...prices].reverse().find((point) => point.date < dateIso) ?? null;
  const after = prices.filter((point) => point.date >= dateIso);
  if (!before || !after.length) return null;

  const changePct = (current, base) => (Number.isFinite(Number(current)) && Number(base) > 0
    ? Math.round(((Number(current) / Number(base)) - 1) * 1000) / 10
    : null);

  const first = after[0];
  const third = after[Math.min(2, after.length - 1)];
  const changeFirstSessionPct = changePct(first.close, before.close);
  const changeThreeSessionsPct = changePct(third.close, before.close);
  if (changeFirstSessionPct == null) return null;

  return {
    ticker: normalizedTicker,
    announcementDate: dateIso,
    previousDate: before.date,
    previousClose: before.close,
    firstDate: first.date,
    firstClose: first.close,
    changeFirstSessionPct,
    thirdDate: third.date,
    thirdClose: third.close,
    changeThreeSessionsPct,
    source: 'Yahoo Finance',
  };
}

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

export function renumberConclusionSections(conclusion) {
  const sections = [
    ['repurchases', 'Recompras'],
    ['ceoChange', 'Cambio de CEO'],
    ['outlook', 'Outlook'],
    ['debt', 'Deuda'],
    ['acquisitions', 'Adquisiciones'],
    ['dividends', 'Dividendos'],
  ];
  let sectionNumber = 0;
  sections.forEach(([key, fallback]) => {
    const section = conclusion[key];
    if (!section) return;
    sectionNumber += 1;
    const baseTitle = String(section.title ?? '').replace(/^\d+\s*:\s*/, '').trim() || fallback;
    section.title = `${sectionNumber}: ${baseTitle}`;
  });
}
