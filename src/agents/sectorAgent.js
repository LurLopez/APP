import { BaseAgent, AgentError } from './baseAgent.js';
import { chat } from '../services/ai/modelProvider.js';

const PROMPT = `Eres el verificador de sector de un analizador financiero. Analiza el documento siguiente y determina si la empresa pertenece al sector de consumo defensivo (Consumer Staples).

Se consideran consumo defensivo, entre otros: bebidas (incluidas alcohólicas), alimentos y aperitivos envasados, tabaco, productos de hogar (deteriorables, como detergentes o papel), cuidado personal, y retail de alimentación (supermercados, hipermercados, grandes almacenes con fuerte componente de alimentación).

NO son consumo defensivo, entre otros: tecnología y software, semiconductores, telecomunicaciones, automoción, moda y retail discrecional, restaurantes de comida rápida, aerolíneas y viajes, banca y seguros, energía y petroleras, farmacéutica y biotecnología, industriales.

Si no hay evidencia suficiente, responde false (es preferible rechazar un informe dudoso).

Responde únicamente con un JSON válido con esta forma exacta:
{"isDefensiveConsumer": true}`;

const MAX_CHARS = 80000;

export class SectorAgent extends BaseAgent {
  constructor() {
    super({
      name: 'sector',
      description: 'Verifica que la empresa pertenezca al sector de consumo defensivo.',
    });
  }

  async run(input) {
    if (!input?.text?.trim()) {
      throw new AgentError('No se pudo leer el contenido del documento.', 'EMPTY_DOCUMENT');
    }

    const raw = await chat([
      { role: 'system', content: PROMPT },
      { role: 'user', content: input.text.slice(0, MAX_CHARS) },
    ]);

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new AgentError('El modelo no devolvió una respuesta válida al verificar el sector.', 'INVALID_MODEL_RESPONSE');
    }

    if (!result.isDefensiveConsumer) {
      throw new AgentError('Este informe no corresponde al sector de consumo defensivo.', 'NOT_DEFENSIVE_CONSUMER');
    }

    return { sector: 'defensive_consumer' };
  }
}
