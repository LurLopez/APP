import { BaseAgent, AgentError } from './baseAgent.js';
import { chatJson, AiProviderError } from '../services/ai/modelProvider.js';

const PROMPT = `Eres el verificador de origen de un analizador financiero. Analiza el documento siguiente y determina:

1. isFinancial (boolean): ¿el documento es un informe financiero de una empresa (contiene estados financieros como balance, cuenta de resultados o flujos de caja)?
2. isUsa (boolean): ¿el documento es un informe presentado ante la SEC de Estados Unidos (contiene referencias como "United States Securities and Exchange Commission", "Washington, D.C." o "Exchange Act of 1934")?
3. formType: "10-Q" si es un informe trimestral FORM 10-Q, "10-K" si es un informe anual FORM 10-K, o null si no es ninguno de los dos.

Responde únicamente con un JSON válido con esta forma exacta:
{"isFinancial": true, "isUsa": true, "formType": "10-Q"}`;

const MAX_CHARS = 6000;

function detectSecOriginDeterministically(text, input = {}) {
  const source = String(text ?? '');
  const head = source.slice(0, 10000);

  // 1. Si el tipo de formulario viene certificado oficialmente (EDGAR / opciones)
  const explicitForm = String(input.formType ?? '').toUpperCase().trim();
  const hasOfficialForm = explicitForm === '10-Q' || explicitForm === '10-K';

  // 2. Detección de referencia oficial a la SEC de EE. UU.
  const isSecDocument = /UNITED\s+STATES\s+SECURITIES\s+AND\s+EXCHANGE\s+COMMISSION|SECURITIES\s+AND\s+EXCHANGE\s+COMMISSION|Washington,?\s+D\.?C\.?|Securities\s+Exchange\s+Act\s+of\s+1934/i.test(head);

  // 3. Detección del tipo de formulario (10-Q o 10-K)
  let detectedForm = hasOfficialForm ? explicitForm : null;
  if (!detectedForm) {
    if (/\bFORM\s+10-K\b|\bANNUAL\s+REPORT\s+PURSUANT\s+TO\s+SECTION\s+13/i.test(head)) {
      detectedForm = '10-K';
    } else if (/\bFORM\s+10-Q\b|\bQUARTERLY\s+REPORT\s+PURSUANT\s+TO\s+SECTION\s+13/i.test(head)) {
      detectedForm = '10-Q';
    }
  }

  // 4. Presencia de estados financieros (Balance, PyG o Flujo de caja)
  const hasFinancialStatements = /(?:CONSOLIDATED\s+)?STATEMENTS?\s+OF\s+(?:OPERATIONS|INCOME|EARNINGS|CASH\s+FLOWS)|BALANCE\s+SHEETS?/i.test(source);

  if ((isSecDocument || hasOfficialForm) && detectedForm && hasFinancialStatements) {
    return { isFinancial: true, isUsa: true, formType: detectedForm };
  }

  return null;
}

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

    // 1. Verificación determinista inmediata sin consumo de tokens
    const deterministic = detectSecOriginDeterministically(input.text, input);
    if (deterministic) {
      return { origin: 'US', formType: deterministic.formType };
    }

    // 2. Fallback con IA si el formato de la portada es atípico (enviando solo la portada)
    let result;
    try {
      result = await chatJson([{ role: 'system', content: PROMPT }, { role: 'user', content: input.text.slice(0, MAX_CHARS) }]);
    } catch (error) {
      // Los fallos del proveedor de IA (timeout, saturación, configuración) se
      // propagan con su mensaje claro; el resto se enmascara como respuesta inválida.
      if (error instanceof AiProviderError) throw error;
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
