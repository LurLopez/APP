/**
 * @fileoverview Traducción de un informe financiero ya generado a otro idioma.
 * Combina tres capas: etiquetas por diccionario (coste cero), números por código
 * (valor intacto garantizado) y textos narrativos por IA (con validación de que
 * ninguna cifra cambia). Funciona igual para 10-Q y 10-K.
 * @module services/translation/reportTranslator
 */

import { chatJson, AiProviderError } from '../ai/modelProvider.js';
import { AgentError } from '../../agents/baseAgent.js';
import { normalizeLanguage } from '../../utils/i18n.js';
import { resolveLocalLabel, resolveLocalScenario } from './reportLabels.js';
import {
  collectTranslatableTexts,
  applyTranslations,
  applyLocalLabels,
  walkStringLeaves,
  pathKey,
  setByPath,
} from './reportTextFields.js';
import { convertNumbersToLanguage, convertNumbersAligned, numbersPreserved } from './reportNumbers.js';
import { buildTranslationMessages } from './translationPrompt.js';

const MAX_TRANSLATION_ATTEMPTS = 2;

const SKIPPED_NUMBER_PATHS = new Set(['language', 'ticker', 'company', 'formType', 'reportingPeriod']);

function resolvesLocally(text, key, sourceLanguage, targetLanguage) {
  const resolver = key.endsWith('scenarios.*') ? resolveLocalScenario : resolveLocalLabel;
  return resolver(text, sourceLanguage, targetLanguage) != null;
}

async function translateEntriesWithAi(entries, { sourceLanguage, targetLanguage }) {
  const payload = {};
  entries.forEach((entry, index) => {
    payload[`t${index}`] = entry.text;
  });

  const response = await chatJson(
    buildTranslationMessages({ sourceLanguage, targetLanguage, payload }),
    1,
  );

  return entries.map((entry, index) => response[`t${index}`]);
}

function validateTranslations(entries, translations) {
  if (!Array.isArray(translations) || translations.length !== entries.length) {
    throw new AgentError('La traducción devolvió un número de fragmentos distinto al solicitado.', 'TRANSLATION_INCOMPLETE');
  }
  entries.forEach((entry, index) => {
    const value = translations[index];
    if (typeof value !== 'string' || !value.trim()) {
      throw new AgentError(`La traducción del fragmento ${index + 1} llegó vacía o inválida.`, 'TRANSLATION_EMPTY_FRAGMENT');
    }
  });
  const mismatched = entries.findIndex((entry, index) => !numbersPreserved(entry.text, translations[index]));
  if (mismatched !== -1) {
    throw new AgentError(
      'La traducción no superó la validación de cifras: algún número cambió respecto al informe original.',
      'TRANSLATION_NUMBER_MISMATCH',
    );
  }
}

async function translateEntries(entries, context, translator) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_TRANSLATION_ATTEMPTS; attempt += 1) {
    try {
      const translations = await translator(entries, context);
      validateTranslations(entries, translations);
      return translations;
    } catch (error) {
      lastError = error;
      if (error instanceof AiProviderError) throw error;
      console.warn(`[translation] Intento ${attempt} de ${MAX_TRANSLATION_ATTEMPTS} fallido: ${error.message}`);
    }
  }
  throw lastError ?? new AgentError('No se pudo traducir el informe.', 'TRANSLATION_FAILED');
}

function convertReportNumbers(report, sourceLanguage, targetLanguage, aiEntries = []) {
  if (sourceLanguage === targetLanguage) return;
  const aiSourceTexts = new Map(aiEntries.map((entry) => [pathKey(entry.path), entry.text]));
  walkStringLeaves(report, (text, path) => {
    const key = pathKey(path);
    if (SKIPPED_NUMBER_PATHS.has(key)) return;
    if (key.includes('.secSnippet') || key.includes('.secTable') || key.includes('.maturitySchedule.')) return;
    const sourceText = aiSourceTexts.get(key);
    const converted = sourceText != null
      ? convertNumbersAligned(sourceText, text, sourceLanguage, targetLanguage)
      : convertNumbersToLanguage(text, sourceLanguage, targetLanguage);
    if (converted !== text) setByPath(report, path, converted);
  });
}

/**
 * Traduce el informe completo al idioma destino. No modifica el original.
 * @param {object} report - Informe financiero generado por el agente analista.
 * @param {string} targetLanguage - Idioma destino ('es' | 'en').
 * @param {{ sourceLanguage?: string, translator?: Function }} [options]
 * @returns {Promise<object>} Copia del informe traducida.
 */
export async function translateReport(report, targetLanguage, options = {}) {
  if (!report || typeof report !== 'object') {
    throw new AgentError('No hay informe que traducir.', 'TRANSLATION_NO_REPORT');
  }

  const sourceLanguage = normalizeLanguage(options.sourceLanguage || report.language);
  const target = normalizeLanguage(targetLanguage);
  const translator = options.translator ?? translateEntriesWithAi;
  const clone = structuredClone(report);

  if (sourceLanguage === target) {
    clone.language = target;
    return clone;
  }

  const canResolveLocally = (text, key) => resolvesLocally(text, key, sourceLanguage, target);
  const entries = collectTranslatableTexts(clone, canResolveLocally);

  if (entries.length) {
    const translations = await translateEntries(entries, { sourceLanguage, targetLanguage: target }, translator);
    applyTranslations(clone, entries, translations);
    console.info(`[translation] ${entries.length} textos traducidos de ${sourceLanguage} a ${target}.`);
  }

  applyLocalLabels(clone, sourceLanguage, target, (text, key) => (
    key.endsWith('scenarios.*')
      ? resolveLocalScenario(text, sourceLanguage, target)
      : resolveLocalLabel(text, sourceLanguage, target)
  ));
  convertReportNumbers(clone, sourceLanguage, target, entries);

  clone.language = target;
  return clone;
}
