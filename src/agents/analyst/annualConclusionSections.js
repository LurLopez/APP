/**
 * @fileoverview Módulo extraído de annualConclusionProcessor.js.
 */

import { cleanAssetDescription } from './financialParsers.js';
import { mergeHistoryByYear, mergeDividendHistory } from './historyBuilders.js';
import { withOutlookComparison, completeOutlookPriorColumn, mergeOutlookRows } from './outlookHelpers.js';
import { buildMaturityScheduleFromDebtTable, maturityItemsLookBucketed } from './debtMaturityFallback.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

function formatAcquisitionAmount(value, language = 'es') {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const [int, dec] = (Math.round(num * 10) / 10).toFixed(1).split('.');
  if (language === 'en') {
    const formattedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec === '0' ? formattedInt : `${formattedInt}.${dec}`;
  }
  const formattedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === '0' ? formattedInt : `${formattedInt},${dec}`;
}

function buildAcquisitionsTextFromDetails(items, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!Array.isArray(items) || !items.length) return null;
  const paragraphs = items.map((item) => {
    const name = String(item?.name ?? '').trim();
    if (!name) return null;
    const parts = [];
    const description = String(item?.description ?? '').trim();
    parts.push(t('Se adquirió **{name}**{description}.', { name, description: description ? `, ${description}` : '' }, lang));
    const price = formatAcquisitionAmount(item?.price, lang);
    const priceNote = String(item?.priceNote ?? '').trim();
    if (price) parts.push(t('El importe pagado fue de **{price}M$**{priceNote}.', { price, priceNote: priceNote ? ` (${priceNote})` : '' }, lang));
    else if (priceNote) parts.push(t('Condiciones de la operación: {priceNote}.', { priceNote }, lang));
    const rationale = String(item?.rationale ?? '').trim();
    if (rationale) parts.push(t('Motivo declarado de la compra: {rationale}.', { rationale }, lang));
    const metrics = String(item?.businessMetrics ?? '').trim();
    if (metrics) parts.push(t('Tamaño del negocio adquirido: {metrics}.', { metrics }, lang));
    const impact = String(item?.expectedImpact ?? '').trim();
    if (impact) parts.push(t('Impacto esperado: {impact}.', { impact }, lang));
    const terms = String(item?.paymentTerms ?? '').trim();
    if (terms) parts.push(t('Forma de pago: {terms}.', { terms }, lang));
    const date = String(item?.date ?? '').trim();
    if (date) parts.push(t('Fecha de la operación: {date}.', { date }, lang));
    return parts.join(' ');
  }).filter(Boolean);
  return paragraphs.length ? paragraphs.join('\n\n') : null;
}

function buildDivestituresTextFromDetails(items, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!Array.isArray(items) || !items.length) return null;
  const paragraphs = items.map((item) => {
    const name = String(item?.name ?? '').trim();
    if (!name) return null;
    const parts = [];
    const description = String(item?.description ?? '').trim();
    parts.push(t('Se vendió **{name}**{description}.', { name, description: description ? `, ${description}` : '' }, lang));
    const stakePct = Number(item?.stakePct);
    if (Number.isFinite(stakePct) && stakePct > 0) parts.push(t('La operación supone el **{pct} %** del capital de la sociedad participada.', { pct: stakePct }, lang));
    const revenuePct = Number(item?.revenuePct);
    if (Number.isFinite(revenuePct) && revenuePct > 0) parts.push(t('Lo vendido representa cerca del **{pct} %** de los ingresos consolidados.', { pct: revenuePct }, lang));
    const proceeds = formatAcquisitionAmount(item?.proceeds, lang);
    const priceNote = String(item?.priceNote ?? '').trim();
    if (proceeds) parts.push(t('El importe cobrado fue de **{price}M$**{priceNote}.', { price: proceeds, priceNote: priceNote ? ` (${priceNote})` : '' }, lang));
    else if (priceNote) parts.push(t('Condiciones de la operación: {priceNote}.', { priceNote }, lang));
    const buyer = String(item?.buyer ?? '').trim();
    if (buyer) parts.push(t('Comprador: {buyer}.', { buyer }, lang));
    const date = String(item?.date ?? '').trim();
    if (date) parts.push(t('Fecha de la operación: {date}.', { date }, lang));
    const rationale = String(item?.rationale ?? '').trim();
    if (rationale) parts.push(t('Motivo declarado de la venta: {rationale}.', { rationale }, lang));
    const impact = String(item?.expectedImpact ?? '').trim();
    if (impact) parts.push(t('Impacto esperado: {impact}.', { impact }, lang));
    return parts.join(' ');
  }).filter(Boolean);
  return paragraphs.length ? paragraphs.join('\n\n') : null;
}

function buildSpinOffsTextFromDetails(items, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!Array.isArray(items) || !items.length) return null;
  const statusLabels = {
    announced: t('anunciado y pendiente de ejecución', null, lang),
    'in progress': t('en curso', null, lang),
    completed: t('completado', null, lang),
  };
  const paragraphs = items.map((item) => {
    const name = String(item?.name ?? '').trim();
    if (!name) return null;
    const parts = [];
    const description = String(item?.description ?? '').trim();
    parts.push(t('Se trata de la separación (spin-off) de **{name}**{description}.', { name, description: description ? `, ${description}` : '' }, lang));
    const status = statusLabels[String(item?.status ?? '').trim().toLowerCase()] || t('anunciado y pendiente de ejecución', null, lang);
    parts.push(t('Estado de la operación: **{status}**.', { status }, lang));
    const announcementDate = String(item?.announcementDate ?? '').trim();
    const expectedDate = String(item?.expectedDate ?? '').trim();
    if (announcementDate || expectedDate) {
      parts.push(t('Fecha de anuncio: **{date}**; fecha esperada o efectiva: **{expected}**.', {
        date: announcementDate || t('no consta', null, lang),
        expected: expectedDate || t('no consta', null, lang),
      }, lang));
    }
    const structure = String(item?.structure ?? '').trim();
    if (structure) parts.push(t('Estructura prevista: {structure}.', { structure }, lang));
    const revenuePct = Number(item?.revenuePct);
    if (Number.isFinite(revenuePct) && revenuePct > 0) parts.push(t('El negocio separado representa cerca del **{pct} %** de los ingresos consolidados.', { pct: revenuePct }, lang));
    const rationale = String(item?.rationale ?? '').trim();
    if (rationale) parts.push(t('Motivo declarado de la separación: {rationale}.', { rationale }, lang));
    const impact = String(item?.expectedImpact ?? '').trim();
    if (impact) parts.push(t('Impacto esperado: {impact}.', { impact }, lang));
    return parts.join(' ');
  }).filter(Boolean);
  return paragraphs.length ? paragraphs.join('\n\n') : null;
}

function buildRestructuringsTextFromDetails(items, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!Array.isArray(items) || !items.length) return null;
  const paragraphs = items.map((item) => {
    const name = String(item?.name ?? '').trim();
    const description = String(item?.description ?? '').trim();
    const impact = String(item?.expectedImpact ?? '').trim();
    const rationale = String(item?.rationale ?? '').trim();
    if (!name && !description && !impact && !rationale) return null;
    const parts = [];
    parts.push(t('Se anunció un plan de reestructuración{name}{description}.', {
      name: name ? ` (**${name}**)` : '',
      description: description ? `: ${description}` : '',
    }, lang));
    const date = String(item?.announcementDate ?? '').trim();
    if (date) parts.push(t('Fecha de anuncio: {date}.', { date }, lang));
    const totalCost = formatAcquisitionAmount(item?.totalCost, lang);
    if (totalCost) parts.push(t('Coste total previsto del plan: **{amount}M$**.', { amount: totalCost }, lang));
    const charges = formatAcquisitionAmount(item?.chargesRecognized, lang);
    if (charges) parts.push(t('Cargos de reestructuración ya reconocidos en el ejercicio: **{amount}M$**.', { amount: charges }, lang));
    const savings = formatAcquisitionAmount(item?.annualSavings, lang);
    if (savings) parts.push(t('Ahorro anual esperado: **{amount}M$**.', { amount: savings }, lang));
    const timeline = String(item?.savingsTimeline ?? '').trim();
    if (timeline) parts.push(t('Plazo del ahorro: {timeline}.', { timeline }, lang));
    const jobs = Number(item?.jobsAffected);
    if (Number.isFinite(jobs) && jobs > 0) parts.push(t('Empleados afectados: **{jobs}**.', { jobs }, lang));
    if (rationale) parts.push(t('Motivo declarado: {rationale}.', { rationale }, lang));
    if (impact) parts.push(t('Impacto esperado: {impact}.', { impact }, lang));
    return parts.join(' ');
  }).filter(Boolean);
  return paragraphs.length ? paragraphs.join('\n\n') : null;
}

function labeledCorporateBlock(heading, body) {
  return `**${heading}:** ${body}`;
}

function stripNoneStatements(value) {
  return String(value ?? '')
    .replace(/^(?:(?:no se realizaron|no hubo|el ejercicio no registró|sin operaciones)[^.\n]*\.?\s*)+/i, '')
    .trim();
}

export function processOutlookSection(conclusion, rawAnn, result, language = 'es') {
  const lang = normalizeLanguage(language);
  conclusion.outlook = conclusion.outlook || {};
  const out = conclusion.outlook;
  out.title = out.title || t('2: Outlook', null, lang);
  const extractionOut = rawAnn.outlook ?? {};

  if (!out.text || out.text === 'Metas y previsiones cuantitativas oficiales para el próximo ejercicio.') {
    const parts = [];
    if (extractionOut.guidanceSales && !/sin guidance|no quantitative guidance/i.test(extractionOut.guidanceSales)) parts.push(`${t('Ventas', null, lang)}: ${extractionOut.guidanceSales}`);
    if (extractionOut.guidanceEbt) parts.push(`EBT: ${extractionOut.guidanceEbt}`);
    if (extractionOut.guidanceEps) parts.push(`${t('BPA', null, lang)}: ${extractionOut.guidanceEps}`);
    if (extractionOut.guidanceFcf) parts.push(`FCF: ${extractionOut.guidanceFcf}`);
    if (extractionOut.guidanceCapex) parts.push(`CAPEX: ${extractionOut.guidanceCapex}`);
    if (extractionOut.guidanceNetInterest) parts.push(`${t('Gastos por intereses', null, lang)}: ${extractionOut.guidanceNetInterest}`);
    if (parts.length) {
      out.text = t('Previsiones cuantitativas oficiales comunicadas por la dirección para el próximo ejercicio: {parts}.', { parts: parts.join(', ') }, lang);
    } else if (rawAnn.outlookNarrative) {
      out.text = rawAnn.outlookNarrative;
    }
  }

  out.fcfAnalysis = out.fcfAnalysis || (extractionOut.guidanceFcf ? t('Previsión de FCF reportada en el guidance: {fcf}.', { fcf: extractionOut.guidanceFcf }, lang) : null);
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
      mergeOutlookRows(withOutlookComparison(out.secSnippet, result, lang), extractionOut.secTable),
      extractionOut,
    );
  }
}

export function processDebtSection(conclusion, rawAnn, edgarData, fiscalYear, language = 'es', periodEnd = null) {
  const lang = normalizeLanguage(language);
  conclusion.debt = conclusion.debt || {};
  const d = conclusion.debt;
  d.title = d.title || t('3: Deuda', null, lang);
  d.text = d.text || rawAnn.debtNarrative || t('Estructura de endeudamiento, liquidez y calendario de vencimientos de deuda.', null, lang);
  d.refinancingAnalysis = d.refinancingAnalysis || null;
  d.refinancingImpact = d.refinancingImpact || null;

  const extractionDebt = rawAnn.debt ?? {};
  const extractionMaturity = (Array.isArray(extractionDebt.maturityItems) && extractionDebt.maturityItems.length)
    ? extractionDebt.maturityItems
    : ((Array.isArray(extractionDebt.maturitySchedule) && extractionDebt.maturitySchedule.length) ? extractionDebt.maturitySchedule : null);
  const extractionBucketed = maturityItemsLookBucketed(extractionMaturity, fiscalYear, periodEnd);
  const hasMaturitySchedule = Array.isArray(d.maturitySchedule) && d.maturitySchedule.length > 0;
  const fallbackMaturity = ((!extractionMaturity || extractionBucketed) && !hasMaturitySchedule)
    ? buildMaturityScheduleFromDebtTable(rawAnn.debtMaturitiesSecTable || extractionDebt.secTable, fiscalYear, periodEnd)
    : null;

  if (extractionMaturity && !(extractionBucketed && fallbackMaturity)) {
    d.maturitySchedule = extractionMaturity;
  } else if (!hasMaturitySchedule && fallbackMaturity) {
    d.maturitySchedule = fallbackMaturity.items;
  } else if (!hasMaturitySchedule && edgarData.edgarDebtMaturities) {
    d.maturitySchedule = edgarData.edgarDebtMaturities.years.map((y) => ({
      year: y.year,
      label: t('Vencimientos contractuales de deuda', null, lang),
      amount: y.amount,
      type: t('Deuda total', null, lang),
      interestRate: edgarData.edgarDebtMaturities.weightedAverageRate ?? null,
      estimated: edgarData.edgarDebtMaturities.weightedAverageRate != null,
    }));
  }

  if (d.maturityAfterFive == null) {
    if (fallbackMaturity?.afterYearFive != null) {
      d.maturityAfterFive = fallbackMaturity.afterYearFive;
    } else if (extractionDebt.maturityAfterFive != null) {
      d.maturityAfterFive = extractionDebt.maturityAfterFive;
    } else if (edgarData.edgarDebtMaturities?.afterYearFive != null) {
      d.maturityAfterFive = edgarData.edgarDebtMaturities.afterYearFive;
    }
  }

  if (d.allDebtAverageRate == null) {
    if (extractionDebt.allDebtAverageRate != null) {
      d.allDebtAverageRate = extractionDebt.allDebtAverageRate;
      d.allDebtAverageRateEstimated = extractionDebt.allDebtAverageRateEstimated === true;
      d.allDebtAverageRateSource = extractionDebt.allDebtAverageRateSource ?? null;
    } else if (edgarData.edgarDebtMaturities?.weightedAverageRate != null
      && edgarData.edgarDebtMaturities.weightedAverageRateSource !== 'instrument') {
      d.allDebtAverageRate = edgarData.edgarDebtMaturities.weightedAverageRate;
      d.allDebtAverageRateEstimated = true;
      d.allDebtAverageRateSource = t('SEC XBRL (tipo medio ponderado)', null, lang);
    }
  }

  const debtHistoryMaxYear = Number.isFinite(Number(fiscalYear)) ? Number(fiscalYear) : null;
  const aiDebtHistory = ((Array.isArray(d.debtHistory) && d.debtHistory.length)
    ? d.debtHistory
    : (Array.isArray(extractionDebt.debtHistory) ? extractionDebt.debtHistory : []))
    .filter((point) => debtHistoryMaxYear == null || Number(point?.year) <= debtHistoryMaxYear);

  const mergedDebtHistory = mergeHistoryByYear(aiDebtHistory, edgarData.edgarDebtHistory).slice(-10);
  if (mergedDebtHistory.length) d.debtHistory = mergedDebtHistory;

  // Intereses de la deuda: si la extracción no publicó el tipo medio, se estima con el gasto por
  // intereses del ejercicio (XBRL) sobre la deuda media; la sección muestra siempre cuánto paga
  // la empresa por su deuda (gasto y/o efectivo) y el tipo medio cuando se conoce, en lugar de
  // afirmar que no se puede calcular (MCD 2025: 1.582M de gasto, 1.555M pagados, 4,0 % de tipo).
  const interestExpense = extractionDebt.interestExpense != null && Number.isFinite(Number(extractionDebt.interestExpense))
    ? Math.abs(Number(extractionDebt.interestExpense))
    : (edgarData.edgarInterestExpense ?? null);
  const interestPaid = extractionDebt.interestPaid != null && Number.isFinite(Number(extractionDebt.interestPaid))
    ? Math.abs(Number(extractionDebt.interestPaid))
    : (edgarData.edgarInterestPaid ?? null);

  if (d.allDebtAverageRate == null && interestExpense != null && Array.isArray(d.debtHistory) && d.debtHistory.length >= 2) {
    const lastPoint = d.debtHistory[d.debtHistory.length - 1];
    const prevPoint = d.debtHistory[d.debtHistory.length - 2];
    const avgDebt = (Number(lastPoint?.totalDebt) + Number(prevPoint?.totalDebt)) / 2;
    if (Number.isFinite(avgDebt) && avgDebt > 0) {
      d.allDebtAverageRate = Math.round((interestExpense / avgDebt) * 1000) / 10;
      d.allDebtAverageRateEstimated = true;
      d.allDebtAverageRateSource = t('Intereses del ejercicio sobre la deuda media', null, lang);
    }
  }

  const rateFormat = (value) => {
    const fixed = Number(value).toFixed(1);
    return lang === 'en' ? fixed : fixed.replace('.', ',');
  };
  const interestSentences = [];
  const textLower = String(d.text ?? '').toLowerCase();
  const mentionsInterestAmounts = /gasto por intereses|intereses pagados|interest expense|interest paid/.test(textLower);
  if (d.allDebtAverageRate != null) {
    const rateText = rateFormat(d.allDebtAverageRate);
    // El texto puede llevar el mismo tipo con o sin decimal ("4 %" / "4,0 %"): no se repite.
    const ratePatterns = [rateText.replace(',', '[.,]')];
    if (Number.isInteger(Number(d.allDebtAverageRate))) ratePatterns.push(String(Math.round(Number(d.allDebtAverageRate))));
    const rateAlreadyInText = ratePatterns.some((pattern) => new RegExp(`${pattern}\\s*%`).test(String(d.text ?? '')));
    if (!rateAlreadyInText) {
      interestSentences.push(d.allDebtAverageRateEstimated
        ? t('El tipo de interés medio estimado de la deuda es del {rate} %.', { rate: rateText }, lang)
        : t('El tipo de interés medio de la deuda es del {rate} %.', { rate: rateText }, lang));
    }
    // Si el dato de tipos existe, no puede quedar en el texto la afirmación contraria.
    d.text = String(d.text ?? '')
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !(/no desglosa|no facilita|no publica|no es posible calcular/i.test(sentence)
        && /tipo|cup[oó]n|inter[eé]s/i.test(sentence)))
      .join(' ');
  }
  if (!mentionsInterestAmounts) {
    if (interestExpense != null) {
      interestSentences.push(t('El gasto por intereses del ejercicio fue de {amount}M.', {
        amount: formatAcquisitionAmount(interestExpense, lang),
      }, lang));
    }
    if (interestPaid != null) {
      interestSentences.push(t('Los intereses pagados en efectivo ascendieron a {amount}M.', {
        amount: formatAcquisitionAmount(interestPaid, lang),
      }, lang));
    }
  }
  // Tipos por divisa/categoría de la nota de deuda: cuando la nota no desglosa el cupón de cada
  // vencimiento (MCD: tipos medios efectivos por divisa), se muestran los tipos publicados; si
  // el texto ya los enumera, solo se añade la aclaración de que no hay cupón por vencimiento.
  const rateBuckets = String(extractionDebt.rateBuckets ?? '').trim();
  if (rateBuckets) {
    const itemsHaveRates = (Array.isArray(d.maturitySchedule) ? d.maturitySchedule : [])
      .some((item) => item?.rate != null || item?.interestRate != null);
    const bucketRates = (rateBuckets.match(/\d+(?:[.,]\d+)?/g) || []).map((num) => num.replace('.', ','));
    const textRates = new Set((String(d.text ?? '').match(/\d+(?:[.,]\d+)?/g) || []).map((num) => num.replace('.', ',')));
    const bucketsAlreadyInText = bucketRates.length > 0
      && bucketRates.filter((rate) => textRates.has(rate)).length >= Math.min(3, bucketRates.length);
    if (!itemsHaveRates && bucketsAlreadyInText) {
      interestSentences.push(t('La nota de deuda no desglosa el cupón de cada vencimiento, solo los tipos medios efectivos por divisa o categoría.', null, lang));
    } else if (!bucketsAlreadyInText) {
      interestSentences.push(itemsHaveRates
        ? t('Tipos medios efectivos publicados por la nota de deuda: {buckets}.', { buckets: rateBuckets }, lang)
        : t('La nota de deuda no desglosa el cupón de cada vencimiento; estos son los tipos medios efectivos publicados por divisa o categoría: {buckets}.', { buckets: rateBuckets }, lang));
    }
  }
  if (interestSentences.length) {
    d.text = `${String(d.text ?? '').trim()} ${interestSentences.join(' ')}`.trim();
  }

  // Solo se acepta una refinanciación realmente ejecutada o acordada en el ejercicio:
  // un vencimiento futuro sin decisión anunciada no es una refinanciación.
  if (!d.refinancing && extractionDebt.refinancing?.occurred === true) {
    d.refinancing = extractionDebt.refinancing;
  }
  if (d.refinancing && d.refinancing.occurred !== true) {
    delete d.refinancing;
  }
  if (!d.refinancing) {
    d.refinancingAnalysis = null;
    d.refinancingImpact = null;
  }

  if (!d.secSnippet && (rawAnn.debtMaturitiesSecTable || extractionDebt.secTable)) {
    d.secSnippet = rawAnn.debtMaturitiesSecTable || extractionDebt.secTable;
  }
}

export function processAcquisitionsDividendsAndWatchlist(conclusion, rawAnn, extracted, edgarData, fiscalYear, language = 'es') {
  const lang = normalizeLanguage(language);
  // Operaciones corporativas: adquisiciones, desinversiones/ventas de participaciones, spin-offs y reestructuraciones
  conclusion.acquisitions = conclusion.acquisitions || {};
  const acq = conclusion.acquisitions;
  acq.title = acq.title || t('Operaciones corporativas', null, lang);
  const acquisitionItems = Array.isArray(rawAnn.acquisitions?.items) ? rawAnn.acquisitions.items : [];
  const divestitureItems = Array.isArray(rawAnn.divestitures?.items) ? rawAnn.divestitures.items : [];
  const spinOffItems = Array.isArray(rawAnn.spinOffs?.items) ? rawAnn.spinOffs.items : [];
  const restructuringItems = Array.isArray(rawAnn.restructurings?.items) ? rawAnn.restructurings.items : [];

  const detailedAcquisitionText = buildAcquisitionsTextFromDetails(acquisitionItems, lang);
  const detailedDivestitureText = buildDivestituresTextFromDetails(divestitureItems, lang);
  const detailedSpinOffText = buildSpinOffsTextFromDetails(spinOffItems, lang);
  const detailedRestructuringText = buildRestructuringsTextFromDetails(restructuringItems, lang);
  const blockAdquisiciones = (detailedAcquisitionText && acquisitionItems.length)
    ? labeledCorporateBlock(t('Adquisiciones', null, lang), detailedAcquisitionText)
    : null;
  const blockDesinversiones = detailedDivestitureText
    ? labeledCorporateBlock(t('Desinversiones y ventas de participaciones', null, lang), detailedDivestitureText)
    : null;
  const blockSpinOffs = detailedSpinOffText
    ? labeledCorporateBlock(t('Spin-offs', null, lang), detailedSpinOffText)
    : null;
  const blockReestructuraciones = detailedRestructuringText
    ? labeledCorporateBlock(t('Reestructuraciones', null, lang), detailedRestructuringText)
    : null;

  const hasOfficialAcq = extracted.facts?.acquisitionsYtd != null && Number.isFinite(Number(extracted.facts.acquisitionsYtd));
  const acqAmount = hasOfficialAcq ? Math.abs(Number(extracted.facts.acquisitionsYtd)) : null;
  const noMaterialAcquisitions = hasOfficialAcq && acqAmount < 50;

  // Desinversión detectada solo por cifras oficiales (sin detalle en las notas): se resume en una frase.
  const divAmount = Math.abs(Number(extracted.facts?.brandDivestitures) || 0) + Math.abs(Number(extracted.facts?.assetSalesYtd) || 0);
  const divDesc = extracted.facts?.divestitureDescription;
  const divDescHasAmount = /\d[\d.,]*\s*(?:M\$|M\b|\$|millones|billion|million)/i.test(String(divDesc ?? ''));
  const factsDivestitureSentence = (!divestitureItems.length && divAmount >= 50 && divDesc)
    ? t(' Se completó la desinversión de {description}{amount}.', {
      description: cleanAssetDescription(divDesc),
      amount: divDescHasAmount ? '' : t(' por {value}M', { value: Math.round(divAmount) }, lang),
    }, lang)
    : '';

  const noAcqSentence = t('No se realizaron adquisiciones materiales durante el ejercicio.', null, lang);
  let text;
  if (noMaterialAcquisitions) {
    const parts = [`${noAcqSentence}${factsDivestitureSentence}`];
    [blockDesinversiones, blockSpinOffs, blockReestructuraciones].forEach((block) => {
      if (block) parts.push(block);
    });
    text = parts.join('\n\n');
  } else if (acq.text || rawAnn.acquisitionsNarrative) {
    text = acq.text || rawAnn.acquisitionsNarrative;
    const remaining = stripNoneStatements(text).toLowerCase();
    if (blockDesinversiones && !/desinversi|divestit|venta de participaci/.test(remaining)) text += `\n\n${blockDesinversiones}`;
    if (blockSpinOffs && !/spin-?off|escisi|separaci[oó]n/.test(remaining)) text += `\n\n${blockSpinOffs}`;
    if (blockReestructuraciones && !/reestructur|restructur|plan de ahorro|cost savings/.test(remaining)) text += `\n\n${blockReestructuraciones}`;
  } else if (blockAdquisiciones || blockDesinversiones || blockSpinOffs || blockReestructuraciones) {
    text = [blockAdquisiciones, blockDesinversiones, blockSpinOffs, blockReestructuraciones].filter(Boolean).join('\n\n');
  } else if (acqAmount >= 50) {
    text = t('Se completaron adquisiciones corporativas por un importe neto de {amount}M.', { amount: extracted.facts.acquisitionsYtd }, lang);
  } else {
    text = noAcqSentence;
  }
  acq.text = text;

  const textBeyondNone = stripNoneStatements(text).toLowerCase();
  acq.hasDivestitures = divestitureItems.length > 0
    || Boolean(factsDivestitureSentence)
    || /desinversi|divestit|venta de participaci/.test(textBeyondNone);
  acq.hasSpinOffs = spinOffItems.length > 0 || /spin-?off|escisi|separaci[oó]n/.test(textBeyondNone);
  acq.hasRestructurings = restructuringItems.length > 0 || /reestructur|restructur|plan de ahorro|cost savings/.test(textBeyondNone);

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
      div.title = div.title || t('5: Dividendos', null, lang);
      div.history = dividendHistory;
      div.changePct = changePct;
      div.changeType = changeType;
      if (!div.text) {
        const numberFormat = (value) => {
          const fixed = Number(value).toFixed(2);
          return lang === 'en' ? fixed : fixed.replace('.', ',');
        };
        const pctFormat = (value) => {
          const fixed = Number(value).toFixed(1);
          return lang === 'en' ? fixed : fixed.replace('.', ',');
        };
        const totalFormat = (value) => {
          const rounded = String(value);
          return lang === 'en' ? rounded : rounded.replace('.', ',');
        };
        const verb = changeType === 'cut'
          ? t('recortó', null, lang)
          : t('aumentó', null, lang);
        div.text = t('El dividendo por acción {verb} un {pct} % en {year}, pasando de {prevDps} $ a {lastDps} $, con un pago total de {total}M.', {
          verb,
          pct: pctFormat(Math.abs(changePct)),
          year: lastDiv.year,
          prevDps: numberFormat(prevDiv.dps),
          lastDps: numberFormat(lastDiv.dps),
          total: totalFormat(lastDiv.total),
        }, lang);
      }
    }
  }

  // Watchlist
  conclusion.watchlist = conclusion.watchlist || {};
  conclusion.watchlist.title = conclusion.watchlist.title || (fiscalYear
    ? t('Cosas a tener en cuenta en {year}', { year: fiscalYear + 1 }, lang)
    : t('Cosas a tener en cuenta el próximo año', null, lang));
  if (!Array.isArray(conclusion.watchlist.items) || conclusion.watchlist.items.length === 0) {
    conclusion.watchlist.items = [
      t('1: Evolución de los ingresos orgánicos y volúmenes respecto a competidores del sector.', null, lang),
      t('2: Ritmo y precio de ejecución de los programas de recompra de acciones.', null, lang),
      t('3: Refinanciación de la deuda próxima a vencer y coste efectivo de los nuevos intereses.', null, lang),
    ];
  }
}

export function renumberConclusionSections(conclusion, language = 'es') {
  const lang = normalizeLanguage(language);
  const sections = [
    ['repurchases', t('Recompras', null, lang)],
    ['executiveChanges', t('Cambios en la dirección', null, lang)],
    ['outlook', 'Outlook'],
    ['debt', t('Deuda', null, lang)],
    ['acquisitions', t('Operaciones corporativas', null, lang)],
    ['dividends', t('Dividendos', null, lang)],
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
