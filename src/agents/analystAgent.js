import { readFile } from 'node:fs/promises';
import { BaseAgent, AgentError } from './baseAgent.js';
import { chatJson } from '../services/ai/modelProvider.js';

const MAX_CHARS = 80000;
const KNOWLEDGE_DIR = new URL('./knowledge/', import.meta.url);
const PROMPTS_DIR = new URL('./prompts/', import.meta.url);
const SECTOR_FILES = { defensive_consumer: 'consumo-defensivo' };

async function loadKnowledgeRules(sector, subsector) {
  let generalRules = '';
  try {
    generalRules = await readFile(new URL('general.md', KNOWLEDGE_DIR), 'utf8');
  } catch {}

  const sectorSlug = SECTOR_FILES[sector] ?? sector;
  let sectorRules = '';
  try {
    sectorRules = await readFile(new URL(`${sectorSlug}/sector.md`, KNOWLEDGE_DIR), 'utf8');
  } catch {
    try {
      sectorRules = await readFile(new URL(`${sectorSlug}.md`, PROMPTS_DIR), 'utf8');
    } catch {}
  }

  let subsectorRules = '';
  if (subsector) {
    try {
      subsectorRules = await readFile(new URL(`${sectorSlug}/subsectores/${subsector}/subsector.md`, KNOWLEDGE_DIR), 'utf8');
    } catch {}
  }

  const parts = [];
  if (generalRules) parts.push(`### REGLAS GENERALES Y FORMATO:\n${generalRules}`);
  if (sectorRules) parts.push(`### REGLAS DEL SECTOR (${sectorSlug}):\n${sectorRules}`);
  if (subsectorRules) parts.push(`### REGLAS DEL SUBSECTOR (${subsector}):\n${subsectorRules}`);

  return parts.join('\n\n---\n\n') || sectorRules;
}

function buildAnalysisText(text) {
  const financialMarkers = [
    /consolidated statements? of cash flows?/i,
    /statements? of cash flows?/i,
    /consolidated balance sheets?/i,
    /consolidated statements? of (income|operations|earnings)/i,
  ];

  let financialIndex = -1;
  for (const marker of financialMarkers) {
    const index = text.search(marker);
    if (index !== -1) {
      financialIndex = index;
      break;
    }
  }

  const head = text.slice(0, 30000);
  const financialWindow = financialIndex !== -1
    ? text.slice(Math.max(0, financialIndex - 15000), Math.min(text.length, financialIndex + 50000))
    : '';

  if (financialWindow) {
    return `[COMIENZO DEL INFORME]\n${head}\n[SECCIÓN DE ESTADOS FINANCIEROS Y NOTAS]\n${financialWindow}`.slice(0, MAX_CHARS);
  }

  return text.slice(0, MAX_CHARS);
}

const EXTRACTION_SCHEMA = `{
  "company": "The Kraft Heinz Company",
  "ticker": "KHC",
  "periodTitle": "2026 Q2 results — KHC",
  "reportingPeriod": "2026-06-27",
  "fiscalQuarter": 2,
  "fiscalYear": 2026,
  "shares": 1186,
  "quarter": {
    "sales": 6262,
    "grossProfit": 2028,
    "operatingIncome": 921,
    "ebt": 886,
    "netIncome": 752,
    "prev": { "sales": 6352, "grossProfit": 2183, "operatingIncome": 1292, "ebt": 1245, "netIncome": 994 }
  },
  "ytd": {
    "months": 6,
    "sales": 12309,
    "grossProfit": 4247,
    "operatingIncome": 2079,
    "ebt": 2079,
    "netIncome": 1601,
    "prev": { "sales": 12351, "grossProfit": 4247, "operatingIncome": 2488, "ebt": 2488, "netIncome": 1916 }
  },
  "cashFlow": {
    "operating": 2088,
    "capex": 429,
    "dividends": 949,
    "prevOperating": 1929
  },
  "facts": {
    "impairments": 2441,
    "intangiblesAmortization": 4911,
    "effectiveTaxRate": 14.4,
    "shareBuybacks": 435,
    "totalDebt": 21192
  },
  "extraNotes": ["*3: ...", "Descripción de partidas extraordinarias o ventas de negocios"]
}`;

const EXTRACTION_PROMPT = `Eres el extractor de datos de Cifra. A partir del texto del informe financiero 10-Q / 10-K recibido, extrae las cifras clave del estado de resultados, del estado de flujos de caja y otros datos relevantes.

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):

{SCHEMA}

Instrucciones:
- "quarter" = datos del trimestre más reciente (por ejemplo "three months ended") y "quarter.prev" = las mismas líneas del mismo trimestre del año anterior (columnas comparativas del informe); "ytd" = acumulado del año fiscal en curso ("six/nine months ended") y "ytd.prev" = acumulado del mismo periodo del año anterior. Si el informe no trae comparativos, usa null.
- Todas las cifras en MILLONES de dólares estadounidenses, como números (ej. 6262). Si una cifra no aparece usa null (no la omitas).
- Si el informe no desglosa el trimestre en algún estado (p. ej. flujos de caja solo acumulados), deja esos campos con null.
- "cashFlow" son las cifras del acumulado (net cash provided by operating activities, capital expenditures, cash dividends paid). Si solo aparecen del trimestre, úsalas igualmente.
- "facts": impairments (deterioros de fondo de comercio e intangibles), intangiblesAmortization (amortización de intangibles), effectiveTaxRate (tipo impositivo efectivo en %), shareBuybacks (recompras en $M), totalDebt (deuda total si aparece).
- "extraNotes": partidas extraordinarias, ventas de negocios, o cualquier hecho relevante que afecte a la comparabilidad (ej. "impairment de 1428M el año anterior"). En español. Vacío si no hay nada.`;

const OUTPUT_SCHEMA = `{
  "company": "Nombre de la empresa",
  "ticker": "KHC",
  "periodTitle": "2025 Q3 results — KHC",
  "reportingPeriod": "2025-09-27",
  "horizons": [
    {
      "label": "ÚLTIMOS 3 MESES",
      "sales": {
        "rows": [
          { "name": "Ventas", "adjusted": "6237M", "prevAdjusted": "6383M", "pctAdjusted": "-2,29 %", "normal": "6237M", "prevNormal": "6383M", "pctNormal": "-2,29 %", "isAdjusted": false },
          { "name": "Beneficio Bruto", "adjusted": "1990M", "prevAdjusted": "2186M", "pctAdjusted": "-8,97 %", "normal": "1990M", "prevNormal": "2186M", "pctNormal": "-8,97 %", "isAdjusted": false },
          { "name": "Beneficio Operativo", "adjusted": "1060M", "prevAdjusted": "1327M", "pctAdjusted": "-20,12 %", "normal": "1025M", "prevNormal": "-101M", "pctNormal": "-", "isAdjusted": true, "adjustedNote": "*1" },
          { "name": "EBT", "adjusted": "807M", "prevAdjusted": "1145M", "pctAdjusted": "-29,52 %", "normal": "807M", "prevNormal": "-283M", "pctNormal": "-", "isAdjusted": false },
          { "name": "Beneficio Neto", "adjusted": "613M", "prevAdjusted": "880M", "pctAdjusted": "-30,34 %", "normal": "613M", "prevNormal": "-290M", "pctNormal": "-", "isAdjusted": false }
        ],
        "notes": ["*1: El año anterior tuvieron un impairment de 1428M", "*2: ..."],
        "shares": "1183M",
        "eps": "0,52 $"
      },
      "cashFlow": {
        "scenarios": ["Normal (WC=232)", "Ajustado (WC=-50)"],
        "rows": [
          { "name": "Cash Flow", "values": ["1157", "875"] },
          { "name": "CAPEX", "values": ["171", "200"] },
          { "name": "FCF", "values": ["986", "675"] },
          { "name": "FCF/Acción", "values": ["0,83 $", "0,57 $"] },
          { "name": "Dividendo", "values": ["463", "463"] },
          { "name": "Libre", "values": ["523", "212"] }
        ],
        "notes": ["*2: WC = (Inventarios + Cuentas por pagar - Cuentas por cobrar) * (Inflacion + volumen) = ..."]
      },
      "capital": {
        "rows": [
          { "name": "Libre", "value": "523" },
          { "name": "Caja", "value": "-547" },
          { "name": "En total", "value": "-24" }
        ],
        "verification": "El resultado cuadra.",
        "notes": ["*3: ..."]
      }
    },
    {
      "label": "EN TODO EL AÑO (9 MESES)",
      "sales": { "rows": [], "notes": [], "shares": "", "eps": "" },
      "cashFlow": { "scenarios": [], "rows": [], "notes": [] },
      "capital": { "rows": [], "verification": "", "notes": [] }
    }
  ]
}`;

const SYSTEM_PROMPT = `Eres el analista principal de Cifra, un analizador de informes financieros 10-Q / 10-K de empresas de EE. UU.

Recibirás un JSON con las cifras clave extraídas del informe financiero (en millones de USD). A partir de esas cifras y de las reglas jerárquicas aplicables (Generales + Sector + Subsector), elabora el análisis estructurado siguiendo EXACTAMENTE estas reglas:

{REGLAS}

Responde ÚNICAMENTE con un JSON válido con esta forma exacta (sin texto fuera del JSON):

{SCHEMA}

Instrucciones prioritarias:
- IMPORTANTE: los valores del esquema de ejemplo son de OTRA empresa y otro periodo. Usa EXCLUSIVAMENTE los datos del JSON de extracción recibido. Nunca copies los valores del ejemplo.
- "company", "ticker", "periodTitle" y "reportingPeriod" (fecha de fin del periodo en formato AAAA-MM-DD) se copian tal cual del JSON de extracción.
- HORIZONTES TEMPORALES (REGLA SEGÚN TRIMESTRE):
  * Si el informe es de un primer trimestre (Q1 o fiscalQuarter === 1): genera UN SOLO horizonte con la etiqueta "ÚLTIMOS 3 MESES (Q1)". Omite el bloque acumulado de "EN TODO EL AÑO" ya que 3 meses concluyen todo el ejercicio hasta la fecha.
  * Si es Q2, Q3 o Q4: genera obligatoriamente dos horizontes en este orden: 1. "ÚLTIMOS 3 MESES" (datos exclusivos del trimestre) y 2. "EN TODO EL AÑO (X MESES)" (datos acumulados hasta la fecha con los meses indicados).
- AJUSTES EN VENTAS Y NOTAS EXPLICATIVAS:
  * Si en una fila de "sales.rows" la cifra de "adjusted" difiere de "normal" por un ajuste (impuestos normalizados, intangibles a 0, extraordinarios), asigna "isAdjusted": true y añade la nota correspondiente con formato "*1: [Explicación detallada: motivo del ajuste, cifra teórica esperada vs reportada y diferencia neta]". Si no hay ajuste contable, "isAdjusted": false.
- CASH FLOW TRIMESTRAL POR DEDUCCIÓN (YTD):
  * Si el informe solo proporciona flujos de efectivo acumulados del año (YTD), calcula las cifras de los últimos 3 meses deduciendo el acumulado precedente: Trimestre Actual = Acumulado Actual - Acumulado Precedente (para Cash Flow operativo, CAPEX, componentes de Working Capital, dividendo, recompras y deuda).
- Calcula las variaciones porcentuales con los datos extraídos ("prev" es el periodo anterior). No inventes cifras: si falta un dato usa "—".
- "sales.rows" en orden: Ventas, Beneficio Bruto, Beneficio Operativo, EBT, Beneficio Neto.
- Para "cashFlow": "Cash Flow" = flujo de operaciones, "CAPEX" = capital expenditures, "FCF" = Cash Flow - CAPEX, "FCF/Acción" = FCF / acciones, "Dividendo" = dividendos pagados, "Libre" = FCF - Dividendo. Si el informe solo tiene el acumulado y no hay datos para deducir el trimestre, usa "—".
- Para "capital": "Libre" (del cash flow), "Caja" (variación de efectivo), "En total" (suma con signo). Incluye "Deuda" y "Recompras" solo si hay datos. Comprueba explícitamente si cuadra ("El resultado cuadra." o "Más o menos cuadra...").
- Porcentajes en español con coma decimal y signo (ej. "+16,67 %", "-2,29 %"). Cifras en millones con sufijo M (ej. "6237M").`;

export class AnalystAgent extends BaseAgent {
  constructor() {
    super({
      name: 'analyst',
      description: 'Analiza el informe financiero y genera la estructura de Ventas, Cash Flow y Asignación de Capital.',
    });
  }

  async run(input) {
    if (!input?.text?.trim()) {
      throw new AgentError('No se pudo leer el contenido del documento.', 'EMPTY_DOCUMENT');
    }

    const sector = input.sector ?? 'defensive_consumer';
    const subsector = input.subsector ?? null;
    let rules;
    try {
      rules = await loadKnowledgeRules(sector, subsector);
    } catch {
      throw new AgentError(`No hay reglas de análisis definidas para el sector ${sector}.`, 'NO_SECTOR_RULES');
    }

    const extractionPrompt = EXTRACTION_PROMPT.replace('{SCHEMA}', EXTRACTION_SCHEMA.trim());
    let extracted;
    try {
      extracted = await chatJson([
        { role: 'system', content: extractionPrompt },
        { role: 'user', content: buildAnalysisText(input.text) },
      ]);
    } catch {
      throw new AgentError('No se pudieron extraer los datos del informe.', 'INVALID_MODEL_RESPONSE');
    }

    const systemPrompt = SYSTEM_PROMPT
      .replace('{REGLAS}', rules.trim())
      .replace('{SCHEMA}', OUTPUT_SCHEMA.trim());

    let result;
    try {
      result = await chatJson([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(extracted, null, 2) },
      ]);
    } catch {
      throw new AgentError('El modelo no devolvió un análisis válido.', 'INVALID_MODEL_RESPONSE');
    }

    if (!result || !Array.isArray(result.horizons) || result.horizons.length === 0) {
      throw new AgentError('El análisis no contiene bloques válidos de datos.', 'INVALID_REPORT_STRUCTURE');
    }

    return result;
  }
}
