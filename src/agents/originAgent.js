import { BaseAgent, AgentError } from './baseAgent.js';
import { chat } from '../services/ai/modelProvider.js';

const PROMPT = `Eres el verificador de origen de un analizador financiero. Analiza el documento siguiente y determina:

1. isFinancial (boolean): ¿el documento es un informe financiero de una empresa (contiene estados financieros como balance, cuenta de resultados o flujos de caja)?
2. isUsa (boolean): ¿el documento es un informe presentado ante la SEC de Estados Unidos (contiene referencias como "United States Securities and Exchange Commission", "Washington, D.C." o "Exchange Act of 1934")?
3. formType: "10-Q" si es un informe trimestral FORM 10-Q, "10-K" si es un informe anual FORM 10-K, o null si no es ninguno de los dos.

Responde únicamente con un JSON válido con esta forma exacta:
{"isFinancial": true, "isUsa": true, "formType": "10-Q"}`;

const MAX_CHARS = 80000;

export class OriginAgent extends BaseAgent {
  constructor() {
    super({
      name: 'origin',
      description: 'Verifica que el documento sea un informe financiero 10-Q o 10-K de una empresa de EE. UU.',
    });
  }

  async run(input) {
    if (!input?.text?.trim()) {
      throw new AgentError('No se pudo leer el contenido del documento.', 'EMPTY_DOCUMENT');
    }

    const raw = await chat([{ role: 'system', content: PROMPT }, { role: 'user', content: input.text.slice(0, MAX_CHARS) }]);

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new AgentError('El modelo no devolvió una respuesta válida al verificar el documento.', 'INVALID_MODEL_RESPONSE');
    }

    if (!result.isFinancial) {
      throw new AgentError('Este documento no es un informe financiero (10-Q / 10-K).', 'NOT_FINANCIAL');
    }

    if (!result.isUsa) {
      throw new AgentError('Este informe no es de una empresa de EE. UU.', 'NOT_USA');
    }

    if (!['10-Q', '10-K'].includes(result.formType)) {
      throw new AgentError('El documento no es un FORM 10-Q ni un FORM 10-K.', 'NOT_10Q_10K');
    }

    return { origin: 'US', formType: result.formType };
  }
}
