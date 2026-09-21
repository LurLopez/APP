/**
 * @fileoverview Módulo extraído de annualConclusionProcessor.js.
 */

import { isPlaceholderText, parseLooseReportNumber } from './financialParsers.js';
import { buildFutureProjectionText, buildShareCountEvolutionText, buildRepurchaseSecTable, enrichRepurchaseSnippet, mergeHistoryByYear } from './historyBuilders.js';
import { isNoInfoValue } from '../../services/reportExport/executiveChanges.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

const EXECUTIVE_CHANGE_DISCLAIMER = 'La trayectoria de los directivos combina los hechos del informe con contexto público general; verifícala con fuentes externas antes de decidir.';

const PLACEHOLDER_EXECUTIVE_TEXT = /^(?:resumen breve del relevo[: ]|nombre del (?:ceo|directivo) saliente|nombre del (?:ceo|directivo) entrante|motivo declarado del relevo|cargo y periodo en el poder|de dónde viene: empresa, puesto y periodo|qué hizo en puestos directivos anteriores|qué ha dicho que va a hacer o qué prioridades ha anunciado|políticas y decisiones destacadas de su etapa|evolución de las ventas durante su mandato, con cifras|a dónde pasa el (?:ceo|directivo) saliente|empresa y puesto del que viene)/i;

const REPURCHASE_MATERIALITY_PCT = 1;

const NEW_REPURCHASE_PROGRAM_PATTERN = /(new\s+(?:share\s+)?repurchase\s+program|nuevo\s+programa|additional\s+(?:\$?[\d.,]+\s*(?:million|billion)?\s*)?(?:share\s+)?repurchase|increase[sd]?\s+(?:the\s+)?(?:authorization|program)|authoriz(?:ed|ation)\s+(?:an?\s+)?additional|expanded\s+(?:the\s+)?(?:program|authorization))/i;

const CANCELLED_REPURCHASE_PROGRAM_PATTERN = /(cancel|suspend|discontinu|terminat|no longer authoriz|rescind)/i;

function cleanReportText(value) {
  if (isNoInfoValue(value)) return null;
  const text = String(value).trim();
  if (PLACEHOLDER_EXECUTIVE_TEXT.test(text)) return null;
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

function mergeExecutivePerson(aiPerson, extractedPerson, keys) {
  const merged = {};
  keys.forEach((key) => {
    const value = pickReportField(aiPerson?.[key], extractedPerson?.[key]);
    if (value != null) merged[key] = value;
  });
  return Object.keys(merged).length ? merged : null;
}

function normalizeExecutiveChange(aiChange, extractedChange, language = 'es') {
  const lang = normalizeLanguage(language);
  const oldExecutive = mergeExecutivePerson(aiChange?.oldExecutive ?? aiChange?.outgoingExecutive, extractedChange?.oldExecutive ?? extractedChange?.outgoingExecutive, ['name', 'role', 'tenureStart', 'whereTheyGo', 'salesDuringTenure', 'policies']);
  const newExecutive = mergeExecutivePerson(aiChange?.newExecutive ?? aiChange?.incomingExecutive, extractedChange?.newExecutive ?? extractedChange?.incomingExecutive, ['name', 'origin', 'trackRecord', 'commitments']);
  const text = cleanReportText(aiChange?.text)
    || cleanReportText(aiChange?.description)
    || cleanReportText(extractedChange?.text)
    || cleanReportText(extractedChange?.description);
  const occurred = extractedChange?.occurred === true
    || aiChange?.occurred === true
    || Boolean(oldExecutive?.name)
    || Boolean(newExecutive?.name)
    || Boolean(text)
    || Boolean(aiChange?.role || extractedChange?.role);
  if (!occurred) return null;

  return {
    role: pickReportField(aiChange?.role, extractedChange?.role) || t('Directivo', null, lang),
    text,
    announcementDate: pickReportField(aiChange?.announcementDate, extractedChange?.announcementDate),
    effectiveDate: pickReportField(aiChange?.effectiveDate, extractedChange?.effectiveDate),
    reason: pickReportField(aiChange?.reason, extractedChange?.reason),
    oldExecutive,
    newExecutive,
    source: pickReportField(aiChange?.source, extractedChange?.source) || 'SEC 10-K / 8-K',
  };
}

function sameExecutiveChange(aiChange, extractedChange) {
  if (!aiChange || !extractedChange) return false;
  const normalize = (value) => String(value ?? '').trim().toLowerCase();
  const aiRole = normalize(aiChange.role);
  const extractedRole = normalize(extractedChange.role);
  if (aiRole && extractedRole) {
    if (aiRole === extractedRole || aiRole.includes(extractedRole) || extractedRole.includes(aiRole)) return true;
    if ((aiRole === 'ceo' || aiRole.includes('chief executive')) && (extractedRole === 'ceo' || extractedRole.includes('chief executive'))) return true;
    if ((aiRole === 'cfo' || aiRole.includes('chief financial')) && (extractedRole === 'cfo' || extractedRole.includes('chief financial'))) return true;
    if ((aiRole === 'coo' || aiRole.includes('chief operating')) && (extractedRole === 'coo' || extractedRole.includes('chief operating'))) return true;
  }
  const aiOldName = normalize(aiChange.oldExecutive?.name ?? aiChange.outgoingExecutive?.name);
  const extractedOldName = normalize(extractedChange.oldExecutive?.name ?? extractedChange.outgoingExecutive?.name);
  if (aiOldName && extractedOldName && (aiOldName === extractedOldName || aiOldName.includes(extractedOldName) || extractedOldName.includes(aiOldName))) return true;
  const aiNewName = normalize(aiChange.newExecutive?.name ?? aiChange.incomingExecutive?.name);
  const extractedNewName = normalize(extractedChange.newExecutive?.name ?? extractedChange.incomingExecutive?.name);
  if (aiNewName && extractedNewName && (aiNewName === extractedNewName || aiNewName.includes(extractedNewName) || extractedNewName.includes(aiNewName))) return true;
  return false;
}

export function processExecutiveChangesSection(conclusion, rawAnn, language = 'es') {
  const lang = normalizeLanguage(language);
  const extraction = Array.isArray(rawAnn?.executiveChanges) ? rawAnn.executiveChanges : [];
  const ai = conclusion.executiveChanges ?? {};
  let aiChanges = [];
  if (Array.isArray(ai)) {
    aiChanges = ai;
  } else if (Array.isArray(ai.changes)) {
    aiChanges = ai.changes;
  } else if (ai.role || ai.text || ai.oldExecutive || ai.newExecutive) {
    aiChanges = [ai];
  } else if (conclusion.ceoChange) {
    if (Array.isArray(conclusion.ceoChange.changes)) {
      aiChanges = conclusion.ceoChange.changes;
    } else if (Array.isArray(conclusion.ceoChange)) {
      aiChanges = conclusion.ceoChange;
    } else if (conclusion.ceoChange.role || conclusion.ceoChange.oldExecutive || conclusion.ceoChange.newExecutive) {
      aiChanges = [conclusion.ceoChange];
    }
  }

  const changes = [];
  const usedAiIndexes = new Set();
  extraction.forEach((extractedChange) => {
    const aiIndex = aiChanges.findIndex((candidate, index) => !usedAiIndexes.has(index) && sameExecutiveChange(candidate, extractedChange));
    if (aiIndex !== -1) usedAiIndexes.add(aiIndex);
    const change = normalizeExecutiveChange(aiIndex !== -1 ? aiChanges[aiIndex] : null, extractedChange, lang);
    if (change) changes.push(change);
  });
  aiChanges.forEach((aiChange, index) => {
    if (usedAiIndexes.has(index)) return;
    const change = normalizeExecutiveChange(aiChange, null, lang);
    if (change) changes.push(change);
  });

  if (!changes.length) {
    delete conclusion.executiveChanges;
    return;
  }

  conclusion.executiveChanges = {
    title: cleanReportText(ai.title) || cleanReportText(conclusion.ceoChange?.title) || t('Cambios en la dirección', null, lang),
    changes,
    disclaimer: t(EXECUTIVE_CHANGE_DISCLAIMER, null, lang),
  };
}

export function processRepurchasesSection(conclusion, rawAnn, extracted, language = 'es') {
  const lang = normalizeLanguage(language);
  conclusion.repurchases = conclusion.repurchases || {};
  const rep = conclusion.repurchases;
  const extractionRep = rawAnn.repurchases ?? {};
  rep.title = rep.title || t('1: Recompras', null, lang);
  rep.text = rep.text || rawAnn.repurchasesNarrative || t('Detalle de los programas de recompras de acciones ejecutados durante el ejercicio.', null, lang);
  rep.programAuthorization = rep.programAuthorization
    || rawAnn.repurchaseProgramSummary
    || extractionRep.programSummary
    || (extractionRep.programAuthorizedTotal ? t('Autorización de {amount}M', { amount: extractionRep.programAuthorizedTotal }, lang) : null)
    || null;
  rep.programRemaining = rep.programRemaining
    || rawAnn.repurchaseRemaining
    || extractionRep.programRemaining
    || null;
  rep.shareCountEvolution = rep.shareCountEvolution || null;
  rep.bpaImpact = rep.bpaImpact || null;
  rep.futureProjection = rep.futureProjection || null;

  const currentAuthRemaining = rep.authorizationRemaining;
  if ((!currentAuthRemaining || isPlaceholderText(currentAuthRemaining)) && extractionRep.programRemaining != null && extractionRep.programRemaining !== '') {
    const remNum = Number(extractionRep.programRemaining);
    const remText = lang === 'en' ? String(remNum) : String(remNum).replace('.', ',');
    rep.authorizationRemaining = Number.isFinite(remNum)
      ? t('Unos {amount}M de $ pendientes de ejecución', { amount: remText }, lang)
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
      language: lang,
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
    const computedEvolution = buildShareCountEvolutionText(rep.sharesHistory, lang);
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

  // Materialidad y preservación de recompras:
  // Se conserva siempre que haya recompras ejecutadas, remanente autorizado, programa nuevo/modificado,
  // tabla o narrativa específica. Solo se omite si la empresa no tuvo actividad alguna ni programa.
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

  // Materialidad: la sección solo aparece si hubo un evento de programa (nuevo, ampliado o
  // cancelado), si las recompras suponen >= 1 % del capital, o si sin datos de acciones el
  // importe alcanza el umbral material (>= 50M). Recompras marginales se omiten.
  const keepRepurchases = hasProgramEvent || materialByShares || materialByFallback;

  if (conclusion.repurchases && !keepRepurchases) {
    delete conclusion.repurchases;
    return;
  }

  rep.buybackPctOfShares = buybackPctOfShares;
  rep.buybackPctOfSharesEstimated = buybackPctOfShares != null && sharesRepurchased == null;
  rep.programChanges = programChanges;
  rep.programEvent = newProgramText ? 'new' : (cancelledProgramText ? 'cancelled' : null);
}
