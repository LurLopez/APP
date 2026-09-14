import { BaseAgent, AgentError } from './baseAgent.js';
import { chatJson, AiProviderError } from '../services/ai/modelProvider.js';
import { resolveAnalysisVersionInfo } from './versionRegistry.js';
import { getCompanyOrigin } from '../services/edgar.service.js';

export { compareVersions, resolveAnalysisVersion, isAnalysisOutdated } from './versionRegistry.js';

// Tickers consolidados y verificados de consumo defensivo (resolución inmediata a 0 tokens)
const KNOWN_DEFENSIVE_CONSUMER_TICKERS = new Set([
  'WMT', 'COST', 'KO', 'PG', 'PM', 'PEP', 'BUD', 'UL', 'BTI', 'MO',
  'MNST', 'MDLZ', 'TGT', 'CL', 'DEO', 'ABEV', 'CCEP', 'KDP', 'ADM', 'SYY',
  'FMX', 'KR', 'EL', 'HSY', 'KVUE', 'KMB', 'KHC', 'DG', 'BG', 'KOF',
  'CHD', 'DLTR', 'STZ', 'USFD', 'GIS', 'TSN', 'PFGC', 'MKC', 'JBS', 'SJM',
  'COKE', 'BF.B', 'BF-B', 'MICC', 'BJ', 'HRL', 'CLX', 'DAR', 'SFD', 'PRMB',
  'TAP', 'PPC', 'CAG', 'CELH', 'CPB', 'POST', 'BRBR', 'FIZZ', 'FRPT', 'LWAY',
  'SPB', 'SMPL', 'CALM', 'FLO', 'HAIN', 'INGR', 'JJSF', 'LANC', 'SAFM', 'TR',
  'BGS', 'UTZ', 'FDP', 'DOLE', 'SENEA', 'THS', 'VITL', 'WEST', 'AGRO', 'CASY'
]);

function extractBusinessSnippet(text) {
  const source = String(text ?? '');
  // Localizar la descripción de la actividad comercial (Item 1 o Nota 1 de Organización/Operaciones)
  const businessMatch = source.match(/(?:Item\s+1\.\s+Business|Note\s+1\s*[-–—]\s*(?:Organization|Nature\s+of\s+Operations|Business|Description\s+of\s+Business))([\s\S]{100,5000})/i);
  if (businessMatch && businessMatch[0]?.length > 200) {
    return businessMatch[0].slice(0, 5000).trim();
  }
  return source.slice(0, 6000).trim();
}

const PROMPT = `Eres el verificador de sector de un analizador financiero. Analiza el documento siguiente y determina si la empresa pertenece al sector de consumo defensivo (Consumer Staples).

Se consideran consumo defensivo, entre otros: bebidas (incluidas alcohólicas), alimentos y aperitivos envasados, tabaco, productos de hogar (deteriorables, como detergentes o papel), cuidado personal, y retail de alimentación (supermercados, hipermercados, grandes almacenes con fuerte componente de alimentación).

NO son consumo defensivo, entre otros: tecnología y software, semiconductores, telecomunicaciones, automoción, moda y retail discrecional, restaurantes de comida rápida, aerolíneas y viajes, banca y seguros, energía y petroleras, farmacéutica y biotecnología, industriales.

Si no hay evidencia suficiente, responde false (es preferible rechazar un informe dudoso).

Responde únicamente con un JSON válido con esta forma exacta:
{"isDefensiveConsumer": true}`;

// La versión del análisis es jerárquica: general.sector[.subsector][.empresa].
// El número de cada nivel se declara al principio de su .md en
// src/agents/knowledge/ (p. ej. general.md, <sector>/sector.md,
// <sector>/subsectores/<slug>/subsector.md y <sector>/empresas/<ticker>/empresa.md).
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

    const subsector = input?.subsector ? String(input.subsector).trim().toLowerCase() : null;
    const ticker = input?.ticker ? String(input.ticker).trim().toUpperCase() : null;

    let isDefensive = false;

    // 1. Verificación determinista instantánea por ticker conocido (0 tokens)
    if (ticker && KNOWN_DEFENSIVE_CONSUMER_TICKERS.has(ticker)) {
      isDefensive = true;
    }

    // 2. Verificación por código SIC oficial de SEC EDGAR si el ticker está disponible (0 tokens)
    if (!isDefensive && ticker) {
      try {
        const originInfo = await getCompanyOrigin(ticker);
        if (originInfo?.sector === 'Consumo defensivo') {
          isDefensive = true;
        }
      } catch {
        // Fallback al análisis del contenido si EDGAR no está disponible
      }
    }

    // 3. Fallback con IA analizando solo el extracto de negocio en vez de 80.000 caracteres de tablas
    if (!isDefensive) {
      const snippet = extractBusinessSnippet(input.text);
      let result;
      try {
        result = await chatJson([
          { role: 'system', content: PROMPT },
          { role: 'user', content: snippet },
        ]);
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw new AgentError('El modelo no devolvió una respuesta válida al verificar el sector.', 'INVALID_MODEL_RESPONSE');
      }

      if (!result.isDefensiveConsumer) {
        throw new AgentError('Este informe no corresponde al sector de consumo defensivo.', 'NOT_DEFENSIVE_CONSUMER');
      }
    }

    const versionInfo = await resolveAnalysisVersionInfo({
      sector: 'defensive_consumer',
      subsector,
      ticker: input?.ticker ?? null,
      formType: input?.formType ?? null,
    });

    return {
      sector: 'defensive_consumer',
      subsector,
      version: versionInfo.version,
      sectorVersion: versionInfo.sectorVersion,
    };
  }
}
