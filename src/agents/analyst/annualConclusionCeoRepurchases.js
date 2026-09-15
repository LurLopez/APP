/**
 * @fileoverview Módulo extraído de annualConclusionProcessor.js.
 */

import { isPlaceholderText, parseLooseReportNumber } from './financialParsers.js';
import { buildFutureProjectionText, buildShareCountEvolutionText, buildRepurchaseSecTable, enrichRepurchaseSnippet, mergeHistoryByYear } from './historyBuilders.js';

const CEO_CHANGE_DISCLAIMER = 'La trayectoria del directivo y la reacción del mercado combinan los hechos del informe con contexto público general; verifícalas con fuentes externas antes de decidir.';

const PLACEHOLDER_CEO_TEXT = /^(?:resumen breve del relevo[: ]|nombre del ceo saliente|nombre del ceo entrante|motivo declarado del relevo|cargo y periodo en el poder|de dónde viene: empresa, puesto y periodo|qué hizo en puestos directivos anteriores|qué ha dicho que va a hacer o qué prioridades ha anunciado|políticas y decisiones destacadas de su etapa|evolución de las ventas durante su mandato, con cifras|a dónde pasa el ceo saliente|empresa y puesto del que viene)/i;

const REPURCHASE_MATERIALITY_PCT = 1;

const NEW_REPURCHASE_PROGRAM_PATTERN = /(new\s+(?:share\s+)?repurchase\s+program|nuevo\s+programa|additional\s+(?:\$?[\d.,]+\s*(?:million|billion)?\s*)?(?:share\s+)?repurchase|increase[sd]?\s+(?:the\s+)?(?:authorization|program)|authoriz(?:ed|ation)\s+(?:an?\s+)?additional|expanded\s+(?:the\s+)?(?:program|authorization))/i;

const CANCELLED_REPURCHASE_PROGRAM_PATTERN = /(cancel|suspend|discontinu|terminat|no longer authoriz|rescind)/i;

function cleanReportText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || /^(null|undefined|n\/a|na|no consta|not disclosed)$/i.test(text)) return null;
  if (PLACEHOLDER_CEO_TEXT.test(text)) return null;
  return text;
}

function parseReportPercent(value) {
  const text = String(value ?? '');
  let match = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) match = text.match(/%\s*(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const num = Number(match[1].replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function pickReportField(aiValue, extractedValue) {
  return cleanReportText(aiValue) ?? cleanReportText(extractedValue) ?? null;
}

function mergeCeoPerson(aiPerson, extractedPerson, keys) {
  const merged = {};
  keys.forEach((key) => {
    const value = pickReportField(aiPerson?.[key], extractedPerson?.[key]);
    if (value != null) merged[key] = value;
  });
  return Object.keys(merged).length ? merged : null;
}

function normalizeCeoSentiment(value) {
  const text = String(value ?? '').toLowerCase();
  if (!text) return null;
  if (/positiv|favorable|buena|optimis|alcista/.test(text)) return 'positiva';
  if (/negativ|desfavorable|mala|preocup|bajista/.test(text)) return 'negativa';
  if (/mixt|neutr|tibia|ambig|ambivalente/.test(text)) return 'mixta';
  return null;
}

export function processCeoChangeSection(conclusion, rawAnn) {
  const extraction = rawAnn?.ceoChange ?? {};
  const ai = conclusion.ceoChange ?? {};

  const oldCeo = mergeCeoPerson(ai.oldCeo, extraction.oldCeo, ['name', 'role', 'tenureStart', 'whereTheyGo', 'salesDuringTenure', 'policies']);
  const newCeo = mergeCeoPerson(ai.newCeo, extraction.newCeo, ['name', 'origin', 'trackRecord', 'commitments']);
  const text = cleanReportText(ai.text);
  const occurred = extraction.occurred === true
    || Boolean(oldCeo?.name)
    || Boolean(newCeo?.name)
    || Boolean(text);
  if (!occurred) {
    delete conclusion.ceoChange;
    return;
  }

  const marketSummary = pickReportField(ai.marketReaction?.summary, extraction.marketReaction?.summary);
  const marketSentiment = normalizeCeoSentiment(pickReportField(ai.marketReaction?.sentiment, extraction.marketReaction?.sentiment));

  const ceoChange = {
    title: cleanReportText(ai.title) || 'Cambio de CEO',
    text,
    announcementDate: pickReportField(ai.announcementDate, extraction.announcementDate),
    effectiveDate: pickReportField(ai.effectiveDate, extraction.effectiveDate),
    reason: pickReportField(ai.reason, extraction.reason),
    oldCeo,
    newCeo,
    marketReaction: (marketSentiment || marketSummary) ? { sentiment: marketSentiment, summary: marketSummary } : null,
    source: pickReportField(ai.source, extraction.source),
    disclaimer: CEO_CHANGE_DISCLAIMER,
  };

  if (!ceoChange.text && !ceoChange.oldCeo && !ceoChange.newCeo && !ceoChange.marketReaction) {
    delete conclusion.ceoChange;
    return;
  }

  conclusion.ceoChange = ceoChange;
}

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

  // Materialidad de las recompras: solo se muestra si son relevantes
  // (>= 1 % del capital, programa nuevo o cancelado) o si faltan datos para calcularlo.
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

  const sharesRef = Number(rep.sharesHistory?.at(-2)?.shares)
    || Number(extractionRep.sharesStartPeriod)
    || Number(rep.sharesHistory?.at(-1)?.shares)
    || Number(extractionRep.sharesEndPeriod)
    || null;
  const avgPrice = Number(extractionRep.averagePrice)
    || (Number(extractionRep.aggregateCost) > 0 && Number(extractionRep.sharesRepurchasedAnnual) > 0
      ? Number(extractionRep.aggregateCost) / Number(extractionRep.sharesRepurchasedAnnual)
      : null);
  const sharesRepurchasedRaw = Number(extractionRep.sharesRepurchasedAnnual);
  const sharesRepurchased = (Number.isFinite(sharesRepurchasedRaw) && sharesRepurchasedRaw > 0)
    ? sharesRepurchasedRaw
    : (Number.isFinite(avgPrice) && avgPrice > 0 && maxBuyback ? maxBuyback / avgPrice : null);
  const estimatedPct = parseReportPercent(rep.bpaImpact) ?? parseReportPercent(rep.shareCountEvolution);
  const buybackPctOfShares = (Number.isFinite(sharesRepurchased) && Number.isFinite(sharesRef) && sharesRef > 0)
    ? Math.round((sharesRepurchased / sharesRef) * 1000) / 10
    : estimatedPct;

  const summaryText = String(extractionRep.programSummary ?? '');
  const newProgramText = cleanReportText(extractionRep.newProgramLaunched)
    || (NEW_REPURCHASE_PROGRAM_PATTERN.test(summaryText) ? cleanReportText(summaryText) : null);
  const cancelledProgramText = cleanReportText(extractionRep.programCancelled)
    || (CANCELLED_REPURCHASE_PROGRAM_PATTERN.test(summaryText) ? cleanReportText(summaryText) : null);
  const programChanges = cleanReportText(rep.programChanges)
    || [newProgramText, cancelledProgramText].filter(Boolean).join(' ')
    || null;

  const hasProgramEvent = Boolean(newProgramText || cancelledProgramText || cleanReportText(rep.programChanges));
  const materialByShares = buybackPctOfShares != null && buybackPctOfShares >= REPURCHASE_MATERIALITY_PCT;
  const materialByFallback = buybackPctOfShares == null && maxBuyback != null && maxBuyback >= 50;

  if (conclusion.repurchases && !hasProgramEvent && !materialByShares && !materialByFallback) {
    delete conclusion.repurchases;
    return;
  }

  rep.buybackPctOfShares = buybackPctOfShares;
  rep.buybackPctOfSharesEstimated = buybackPctOfShares != null && sharesRepurchased == null;
  rep.programChanges = programChanges;
  rep.programEvent = newProgramText ? 'new' : (cancelledProgramText ? 'cancelled' : null);
}
