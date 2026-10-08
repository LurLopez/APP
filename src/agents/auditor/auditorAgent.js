/**
 * @fileoverview Agente auditor independiente de QA: audita un informe del analista
 * contra el texto completo del filing, emite una nota de calidad de 1 a 10 y, si
 * detecta errores graves o menores, los corrige sobre una copia del informe.
 * @module agents/auditor/auditorAgent
 */

import { BaseAgent } from '../baseAgent.js';
import { chatJson } from '../../services/ai/modelProvider.js';
import { AUDITOR_SYSTEM_PROMPT, buildSharedAuditContext, buildAuditorUserPrompt } from './auditorPrompt.js';
import { CORRECTOR_SYSTEM_PROMPT, buildCorrectorUserPrompt } from './correctorPrompt.js';
import { runDeterministicChecks } from './deterministicChecks.js';

export class AuditorAgent extends BaseAgent {
  constructor() {
    super({
      name: 'auditor',
      description: 'Auditor independiente de calidad de los informes del analista (QA); audita y corrige.',
    });
  }

  /**
   * Audita el informe contra el texto fuente del filing.
   * @param {Object} input - Informe, texto fuente, reglas .md y metadatos del filing.
   * @returns {Promise<{audit: Object, deterministic: Object}>} Auditoría y comprobaciones deterministas.
   */
  async run({ report, sourceText, filingMeta, rules = '', provider = null }) {
    const deterministic = runDeterministicChecks(report);
    const messages = [
      { role: 'system', content: `${buildSharedAuditContext({ rules, deterministic })}\n\n${AUDITOR_SYSTEM_PROMPT}` },
      { role: 'user', content: buildAuditorUserPrompt({ report, filingMeta, sourceText }) },
    ];
    const audit = await chatJson(messages, 2, provider ? { provider } : {});
    return { audit, deterministic };
  }

  /**
   * Corrige el informe aplicando solo los errores graves y menores probados por la auditoría.
   * No recibe el filing completo: cada error de la auditoría ya incluye el valor correcto
   * («esperado») y su prueba («evidencia»); las reglas viajan en el contexto compartido.
   * @param {Object} input - Informe original, auditoría, comprobaciones deterministas y metadatos.
   * @returns {Promise<Object>} Informe JSON corregido (sin validar).
   */
  async fix({ report, audit, deterministic = null, filingMeta, rules = '', provider = null }) {
    const messages = [
      { role: 'system', content: `${buildSharedAuditContext({ rules, deterministic })}\n\n${CORRECTOR_SYSTEM_PROMPT}` },
      { role: 'user', content: buildCorrectorUserPrompt({ report, audit, filingMeta }) },
    ];
    return chatJson(messages, 2, provider ? { provider } : {});
  }
}

export default new AuditorAgent();
