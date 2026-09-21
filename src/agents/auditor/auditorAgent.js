/**
 * @fileoverview Agente auditor independiente de QA: audita un informe del analista
 * contra el texto fuente del filing y emite una nota de calidad de 1 a 10.
 * @module agents/auditor/auditorAgent
 */

import { BaseAgent } from '../baseAgent.js';
import { chatJson } from '../../services/ai/modelProvider.js';
import { AUDITOR_SYSTEM_PROMPT, buildAuditorUserPrompt } from './auditorPrompt.js';
import { runDeterministicChecks } from './deterministicChecks.js';

export class AuditorAgent extends BaseAgent {
  constructor() {
    super({
      name: 'auditor',
      description: 'Auditor independiente de calidad de los informes del analista (QA).',
    });
  }

  async run({ report, sourceText, filingMeta, provider = null }) {
    const deterministic = runDeterministicChecks(report);
    const messages = [
      { role: 'system', content: AUDITOR_SYSTEM_PROMPT },
      { role: 'user', content: buildAuditorUserPrompt({ report, deterministic, filingMeta, sourceText }) },
    ];
    const audit = await chatJson(messages, 2, provider ? { provider } : {});
    return { audit, deterministic };
  }
}

export default new AuditorAgent();
