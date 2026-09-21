import { BaseAgent, AgentError } from './baseAgent.js';
import { chatJson, AiProviderError } from '../services/ai/modelProvider.js';
import { resolveAnalysisVersionInfo } from './versionRegistry.js';
import { getCompanyOrigin } from '../services/edgar.service.js';

export { compareVersions, resolveAnalysisVersion, isAnalysisOutdated } from './versionRegistry.js';

// Tickers consolidados y verificados de consumo defensivo (resolución inmediata a 0 tokens)
export const KNOWN_DEFENSIVE_CONSUMER_TICKERS = new Set([
  'WMT', 'COST', 'KO', 'PG', 'PM', 'PEP', 'BUD', 'UL', 'BTI', 'MO',
  'MNST', 'MDLZ', 'TGT', 'CL', 'DEO', 'ABEV', 'CCEP', 'KDP', 'ADM', 'SYY',
  'FMX', 'KR', 'EL', 'HSY', 'KVUE', 'KMB', 'KHC', 'DG', 'BG', 'KOF',
  'CHD', 'DLTR', 'STZ', 'USFD', 'GIS', 'TSN', 'PFGC', 'MKC', 'JBS', 'SJM',
  'COKE', 'BF.B', 'BF-B', 'MICC', 'BJ', 'HRL', 'CLX', 'DAR', 'SFD', 'PRMB',
  'TAP', 'PPC', 'CAG', 'CELH', 'CPB', 'POST', 'BRBR', 'FIZZ', 'FRPT', 'LWAY',
  'SPB', 'SMPL', 'CALM', 'FLO', 'HAIN', 'INGR', 'JJSF', 'LANC', 'SAFM', 'TR',
  'BGS', 'UTZ', 'FDP', 'DOLE', 'SENEA', 'THS', 'VITL', 'WEST', 'AGRO', 'CASY'
]);

// Tickers consolidados y verificados de tecnología y software (resolución inmediata a 0 tokens)
export const KNOWN_TECHNOLOGY_TICKERS = new Set([
  'MSFT', 'AAPL', 'NVDA', 'GOOGL', 'GOOG', 'META', 'AVGO', 'CSCO', 'ADBE',
  'CRM', 'ORCL', 'AMD', 'QCOM', 'INTC', 'TXN', 'IBM', 'NOW', 'INTU', 'AMAT',
  'LRCX', 'MU', 'PANW', 'SNOW', 'CRWD', 'PLTR', 'UBER', 'ABNB', 'WDAY', 'TEAM',
  'DDOG', 'ZS', 'FTNT', 'ANET', 'KLAC', 'CDNS', 'SNPS', 'MCHP', 'NXPI', 'ADI',
  'MRVL', 'ROP', 'ADSK', 'MSI', 'SHOP', 'NET', 'MDB', 'HUBS', 'SPLK', 'DOCU',
  'OKTA', 'TWLO', 'PATH', 'MNDY', 'ESTC', 'CFLT', 'ZI', 'APP', 'ARM', 'SMCI'
]);

// Tickers consolidados y verificados de consumo discrecional (resolución inmediata a 0 tokens).
// Solo los subsectores admitidos: retail y distribución, restaurantes, ropa/calzado/hogar,
// e-commerce, concesionarios y usados, vivienda y materiales, y autopartes. Quedan fuera los
// fabricantes de automóviles, hoteles, cruceros, casinos, viajes y educación.
export const KNOWN_CONSUMER_DISCRETIONARY_TICKERS = new Set([
  // Mejora del hogar y distribución de materiales
  'HD', 'LOW', 'TSCO', 'FND', 'BLDR', 'BECN', 'GMS', 'POOL', 'GPC', 'LKQ',
  // Grandes almacenes, descuento y off-price
  'M', 'JWN', 'KSS', 'DDS', 'TJX', 'ROST', 'BURL', 'FIVE', 'OLLI',
  // Ropa, calzado y complementos
  'GPS', 'ANF', 'AEO', 'URBN', 'LULU', 'FL', 'VSCO', 'BBWI', 'DBI', 'SCVL',
  'CAL', 'BOOT', 'BKE', 'JILL', 'ZUMZ', 'CTRN', 'SIG', 'SBH', 'EYE', 'NKE',
  'VFC', 'PVH', 'RL', 'TPR', 'CPRI', 'HBI', 'LEVI', 'SKX', 'DECK', 'CROX',
  'UAA', 'UA', 'COLM', 'WWW', 'SHOO', 'KTB', 'OXM', 'GIII', 'MOV', 'FOSL',
  'VRA', 'SVV',
  // Hogar, muebles, electrodomésticos y ocio
  'RH', 'WSM', 'HVT', 'LZB', 'WHR', 'SN', 'HAS', 'MAT', 'FNKO', 'GRMN',
  'IRBT', 'SONO', 'GPRO', 'YETI',
  // Retail especializado
  'BBY', 'GME', 'DKS', 'ASO', 'ULTA', 'ORLY', 'AZO', 'AAP',
  // Comercio electrónico
  'AMZN', 'EBAY', 'ETSY', 'W', 'RVLV', 'FIGS', 'OSTK', 'CHWY', 'WOOF',
  // Concesionarios de automóviles y vehículos usados
  'KMX', 'CVNA', 'AN', 'PAG', 'LAD', 'ABG', 'GPI', 'SAH', 'CRMT',
  // Restaurantes
  'MCD', 'SBUX', 'YUM', 'CMG', 'DRI', 'WEN', 'JACK', 'TXRH', 'DPZ', 'PZZA',
  'CAVA', 'SHAK', 'WING', 'EAT', 'DINE', 'CAKE', 'CBRL', 'PTLO', 'SG',
  'FWRG', 'LOCO', 'NDLS', 'BJRI', 'BLMN', 'DENN', 'RRGB', 'KRUS',
  // Vivienda y materiales de construcción
  'DHI', 'LEN', 'NVR', 'PHM', 'TOL', 'KBH', 'MTH', 'TMHC', 'GRBK', 'CCS',
  'BZH', 'MHO', 'LGIH', 'DFH', 'SKY', 'CVCO', 'TREX', 'AZEK', 'FBIN', 'MAS',
  'AWI', 'AMWD', 'JELD', 'LESL',
  // Autopartes
  'APTV', 'BWA', 'LEA', 'DAN', 'GNTX', 'SMP', 'DORM', 'XPEL', 'FOXF',
]);

export function resolveSectorByTicker(ticker) {
  const up = String(ticker ?? '').trim().toUpperCase();
  if (KNOWN_DEFENSIVE_CONSUMER_TICKERS.has(up)) return 'defensive_consumer';
  if (KNOWN_TECHNOLOGY_TICKERS.has(up)) return 'technology';
  if (KNOWN_CONSUMER_DISCRETIONARY_TICKERS.has(up)) return 'consumer_discretionary';
  return null;
}

// Rangos SIC (SEC EDGAR) admitidos de forma determinista. Fuera de estos rangos
// el informe pasa al clasificador IA, que rechaza los sectores no admitidos.
const DEFENSIVE_CONSUMER_SIC_RANGES = [[2000, 2199], [2840, 2844]];
const TECHNOLOGY_SIC_RANGES = [[3570, 3579], [3660, 3679], [7370, 7379]];
const CONSUMER_DISCRETIONARY_SIC_RANGES = [
  [5013, 5015], // distribución de recambios de automoción
  [5030, 5039], // distribución de materiales de construcción
  [5200, 5299], // mejora del hogar, ferretería y jardinería
  [5300, 5399], // grandes almacenes, descuento y off-price
  [5500, 5531], // concesionarios, usados y recambios (excluye gasolineras)
  [5600, 5699], // tiendas de ropa, calzado y complementos
  [5700, 5799], // muebles, decoración y electrodomésticos
  [5731, 5731], // tiendas de electrónica de consumo
  [5734, 5734], // tiendas de informática y videojuegos
  [5812, 5813], // restaurantes y bares
  [5940, 5949], // deporte, joyería, libros, juguetes y hobby
  [5961, 5961], // comercio electrónico y venta por catálogo
  [5990, 5999], // retail especializado no clasificado
  [2300, 2399], // confección de ropa y complementos
  [2510, 2519], // fabricación de muebles de hogar
  [3021, 3021], // calzado
  [3140, 3149], // calzado y marroquinería
  [3630, 3639], // electrodomésticos
  [3651, 3651], // audio y vídeo doméstico
  [3940, 3949], // juguetes, juegos y material deportivo
  [1520, 1539], // construcción de viviendas
  [2451, 2452], // casas prefabricadas y móviles
  [3714, 3714], // autopartes (los fabricantes de automóviles 3711 quedan fuera)
];

export function resolveSectorBySic(sic) {
  const code = Number(sic);
  if (!Number.isFinite(code)) return null;
  if (DEFENSIVE_CONSUMER_SIC_RANGES.some(([min, max]) => code >= min && code <= max)) return 'defensive_consumer';
  if (TECHNOLOGY_SIC_RANGES.some(([min, max]) => code >= min && code <= max)) return 'technology';
  if (CONSUMER_DISCRETIONARY_SIC_RANGES.some(([min, max]) => code >= min && code <= max)) return 'consumer_discretionary';
  return null;
}

const SUPPORTED_SECTOR_LABELS = new Map([
  ['Consumo defensivo', 'defensive_consumer'],
  ['Alimentación y bebidas', 'defensive_consumer'],
  ['Tabaco', 'defensive_consumer'],
  ['Servicios informáticos', 'technology'],
  ['Informática', 'technology'],
  ['Tecnología', 'technology'],
  ['Tecnología y software', 'technology'],
  ['Consumo discrecional', 'consumer_discretionary'],
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

const PROMPT = `Eres el verificador de sector de un analizador financiero. Analiza el documento siguiente y clasifica la empresa en uno de los sectores admitidos.

Sectores admitidos:
- "defensive_consumer": Consumo defensivo / básico (bebidas, alimentos y snacks envasados, tabaco, productos de hogar e higiene personal, retail de alimentación y supermercados).
- "technology": Tecnología y software (software empresarial, SaaS, computación en la nube, ciberseguridad, semiconductores, componentes, hardware y plataformas tecnológicas).
- "consumer_discretionary": Consumo discrecional SOLO de estos subsectores: retail de mejora del hogar y distribución de materiales; grandes almacenes, descuento y off-price; ropa, calzado y complementos; muebles, electrodomésticos, ocio y juguetes; retail especializado (electrónica, deporte, recambios de automoción); comercio electrónico; concesionarios de automóviles y vehículos usados; restaurantes; promotoras de vivienda, casas prefabricadas y materiales de construcción; y fabricantes de autopartes.

Sectores NO admitidos actualmente (responde "unsupported"):
- Fabricantes de automóviles (GM, Ford, Tesla, Rivian, Lucid), hoteles, cruceros, casinos, parques de ocio y agencias de viaje online.
- Educación y servicios de consumo (academias, guarderías, servicios personales).
- Bancos, aseguradoras y entidades financieras (incluidas redes y procesadores de pagos).
- Farmacéuticas, salud y biotecnología.
- Inmobiliario y socimis/REITs.
- Petróleo, gas y energía extractiva.
- Industriales pesados, conglomerados y transporte (incluidas aerolíneas).
- Servicios empresariales no tecnológicos (consultoría, staffing, publicidad, outsourcing, recursos humanos).

Dentro de "consumer_discretionary" NO se admiten negocios fuera de los subsectores listados (p. ej. fabricantes de coches, hoteles, cruceros, casinos o educación): si la empresa pertenece a uno de ellos, responde "unsupported".

Si no hay evidencia suficiente o pertenece a un sector no admitido, responde "unsupported" (es preferible rechazar un informe dudoso).

Responde únicamente con un JSON válido con esta forma exacta:
{"sector": "defensive_consumer" | "technology" | "consumer_discretionary" | "unsupported"}`;

// La versión del análisis es jerárquica: general.sector[.subsector][.empresa].
// El número de cada nivel se declara al principio de su .md en
// src/agents/knowledge/ (p. ej. general.md, <sector>/sector.md,
// <sector>/subsectores/<slug>/subsector.md y <sector>/empresas/<ticker>/empresa.md).
export class SectorAgent extends BaseAgent {
  constructor() {
    super({
      name: 'sector',
      description: 'Verifica y clasifica la empresa en los sectores admitidos (consumo defensivo, tecnología o consumo discrecional).',
    });
  }

  async run(input) {
    if (!input?.text?.trim()) {
      throw new AgentError('No se pudo leer el contenido del documento.', 'EMPTY_DOCUMENT');
    }

    const subsector = input?.subsector ? String(input.subsector).trim().toLowerCase() : null;
    const ticker = input?.ticker ? String(input.ticker).trim().toUpperCase() : null;

    let detectedSector = null;

    // 1. Verificación determinista instantánea por ticker conocido (0 tokens)
    if (ticker) {
      detectedSector = resolveSectorByTicker(ticker);
    }

    // 2. Verificación por código SIC oficial de SEC EDGAR si el ticker está disponible (0 tokens)
    if (!detectedSector && ticker) {
      try {
        const originInfo = await getCompanyOrigin(ticker);
        detectedSector = resolveSectorBySic(originInfo?.sic)
          ?? SUPPORTED_SECTOR_LABELS.get(originInfo?.sector)
          ?? null;
      } catch {
        // Fallback al análisis del contenido si EDGAR no está disponible
      }
    }

    // 3. Fallback con IA analizando solo el extracto de negocio en vez de 80.000 caracteres de tablas
    if (!detectedSector) {
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

      if (result?.sector === 'defensive_consumer' || result?.isDefensiveConsumer === true) {
        detectedSector = 'defensive_consumer';
      } else if (result?.sector === 'technology' || result?.isTechnology === true) {
        detectedSector = 'technology';
      } else if (result?.sector === 'consumer_discretionary' || result?.isConsumerDiscretionary === true) {
        detectedSector = 'consumer_discretionary';
      } else {
        throw new AgentError(
          'Este informe no corresponde a los sectores admitidos actualmente (Consumo Defensivo, Tecnología y Software o Consumo Discrecional).',
          'UNSUPPORTED_SECTOR'
        );
      }
    }

    const versionInfo = await resolveAnalysisVersionInfo({
      sector: detectedSector,
      subsector,
      ticker: input?.ticker ?? null,
      formType: input?.formType ?? null,
    });

    return {
      sector: detectedSector,
      subsector,
      version: versionInfo.version,
      sectorVersion: versionInfo.sectorVersion,
    };
  }
}
