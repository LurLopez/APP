import { extractTextFromPdf } from './pdf.service.js';
import { getAgent } from '../agents/agentRegistry.js';

export async function analyzePdf(buffer) {
  const text = await extractTextFromPdf(buffer);

  const originAgent = getAgent('origin');
  const originResult = await originAgent.run({ text });

  const sectorAgent = getAgent('sector');
  const sectorResult = await sectorAgent.run({ text });

  return {
    text,
    origin: originResult.origin,
    formType: originResult.formType,
    sector: sectorResult.sector,
  };
}
